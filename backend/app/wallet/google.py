"""Google Wallet loyalty passes for Android.

Mirrors app/wallet/apple.py, but the mechanics are the opposite way round:

  Apple  — we build and sign a .pkpass file; the phone downloads it, then
           Apple's servers poll us for updates.
  Google — the pass lives on Google's servers. We create a LoyaltyObject over
           their REST API and hand the customer a signed "save" link. To update
           a stamp count we PATCH the object and Google pushes it to the device.

Credentials come only from the environment. Nothing here runs until they are
configured, so an unconfigured deployment simply has the feature switched off.
"""
import json
import logging
import os
import time
from datetime import datetime, timezone

import httpx
import jwt

logger = logging.getLogger(__name__)

API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SAVE_URL = "https://pay.google.com/gp/v/save"
SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer"

# Google's palette fields want plain hex; these match the site's tokens.
BRAND_BACKGROUND = "#66734A"

_token_cache: dict = {"value": None, "expires_at": 0.0}


def _env(key: str) -> str:
    return (os.environ.get(key) or "").strip()


# ---------------------------------------------------------------- configuration
def _service_account() -> dict | None:
    """Service account credentials, from inline JSON or a mounted file."""
    inline = _env("GOOGLE_SERVICE_ACCOUNT_JSON")
    if inline:
        try:
            return json.loads(inline)
        except json.JSONDecodeError:
            logger.error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON")
            return None

    path = _env("GOOGLE_SERVICE_ACCOUNT_PATH")
    if path and os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as handle:
                return json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            logger.error("Could not read GOOGLE_SERVICE_ACCOUNT_PATH: %s", exc)
    return None


def config_status() -> dict:
    enabled = _env("GOOGLE_WALLET_CONFIGURED").lower() == "true"
    issuer_id = _env("GOOGLE_ISSUER_ID")
    account = _service_account()
    has_key = bool(account and account.get("private_key") and account.get("client_email"))

    missing = []
    if not enabled:
        missing.append('GOOGLE_WALLET_CONFIGURED="true"')
    if not issuer_id:
        missing.append("GOOGLE_ISSUER_ID")
    if not has_key:
        missing.append("GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_PATH)")

    return {
        "enabled_flag": enabled,
        "issuer_id": bool(issuer_id),
        "service_account": has_key,
        "configured": enabled and bool(issuer_id) and has_key,
        "missing": missing,
    }


def is_configured() -> bool:
    return config_status()["configured"]


def _issuer_id() -> str:
    return _env("GOOGLE_ISSUER_ID")


def class_id() -> str:
    """One class per programme — the shared template every pass is built from."""
    suffix = _env("GOOGLE_WALLET_CLASS_SUFFIX") or "broscafe_loyalty"
    return f"{_issuer_id()}.{suffix}"


def object_id(member_code: str) -> str:
    """Stable per member. Google allows alphanumerics, '.', '_' and '-'."""
    return f"{_issuer_id()}.{member_code}"


# ---------------------------------------------------------------- auth
async def _access_token() -> str:
    """Exchange a self-signed service-account JWT for an OAuth access token.

    Cached until shortly before expiry — these last an hour and every stamp
    would otherwise cost an extra round trip.
    """
    now = time.time()
    if _token_cache["value"] and now < _token_cache["expires_at"]:
        return _token_cache["value"]

    account = _service_account()
    if not account:
        raise RuntimeError("Google Wallet service account is not configured")

    issued_at = int(now)
    assertion = jwt.encode(
        {
            "iss": account["client_email"],
            "scope": SCOPE,
            "aud": TOKEN_URL,
            "iat": issued_at,
            "exp": issued_at + 3600,
        },
        account["private_key"],
        algorithm="RS256",
    )

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
    response.raise_for_status()
    payload = response.json()

    _token_cache["value"] = payload["access_token"]
    # Refresh a minute early rather than racing the expiry.
    _token_cache["expires_at"] = now + int(payload.get("expires_in", 3600)) - 60
    return _token_cache["value"]


async def _request(method: str, path: str, **kwargs) -> httpx.Response:
    token = await _access_token()
    async with httpx.AsyncClient(timeout=30) as client:
        return await client.request(
            method,
            f"{API_BASE}/{path}",
            headers={"Authorization": f"Bearer {token}"},
            **kwargs,
        )


# ---------------------------------------------------------------- pass content
STRINGS = {
    "en": {
        "program": "Bros Cafe Loyalty Club",
        "points": "Coffees",
        "reward_header": "Your reward",
        "reward_ready": "Free coffee ready — show this at the counter",
        "one_more": "One more coffee and the next is free",
        "many": "{n} more coffees until your free one",
        "how_header": "How it works",
        "how_body": "Collect 10 stamps and your next coffee is on us. Show this pass at the counter.",
        "card_link": "Open my loyalty card",
    },
    "hu": {
        "program": "Bros Cafe Hűségklub",
        "points": "Kávék",
        "reward_header": "A jutalmad",
        "reward_ready": "Megvan az ingyen kávéd — mutasd meg a pultnál",
        "one_more": "Még egy kávé, és a következő ingyen van",
        "many": "Még {n} kávé az ingyenesig",
        "how_header": "Így működik",
        "how_body": "Tíz pecsét, és a következő kávé a miénk. Mutasd meg ezt a kártyát a pultnál.",
        "card_link": "Megnyitom a kártyám",
    },
}


def _strings(lang: str) -> dict:
    return STRINGS.get(lang, STRINGS["en"])


def build_class(cafe: dict, lang: str = "en") -> dict:
    text = _strings(lang)
    logo = _env("GOOGLE_WALLET_LOGO_URL")

    loyalty_class = {
        "id": class_id(),
        "issuerName": cafe.get("name", "Bros Cafe"),
        "programName": text["program"],
        "reviewStatus": "UNDER_REVIEW",
        "hexBackgroundColor": BRAND_BACKGROUND,
    }
    if logo:
        loyalty_class["programLogo"] = {
            "sourceUri": {"uri": logo},
            "contentDescription": {
                "defaultValue": {"language": lang, "value": cafe.get("name", "Bros Cafe")}
            },
        }
    if cafe.get("address"):
        loyalty_class["locations"] = []  # coordinates optional; address shown in text
    return loyalty_class


def build_object(member: dict, cafe: dict, barcode_value: str,
                 card_url: str, lang: str = "en") -> dict:
    text = _strings(lang)
    required = member.get("stamps_required", 10)
    stamps = member.get("stamps", 0)
    remaining = max(required - stamps, 0)

    if member.get("reward_ready"):
        status = text["reward_ready"]
    elif remaining == 1:
        status = text["one_more"]
    else:
        status = text["many"].format(n=remaining)

    return {
        "id": object_id(member["code"]),
        "classId": class_id(),
        "state": "ACTIVE",
        "accountId": member["code"],
        "accountName": member.get("name", ""),
        "hexBackgroundColor": BRAND_BACKGROUND,
        "loyaltyPoints": {
            "label": text["points"],
            "balance": {"string": f"{stamps} / {required}"},
        },
        "barcode": {
            "type": "QR_CODE",
            "value": barcode_value,
            "alternateText": member["code"],
        },
        "textModulesData": [
            {"header": text["reward_header"], "body": status, "id": "status"},
            {"header": text["how_header"], "body": text["how_body"], "id": "how"},
        ],
        "linksModuleData": {
            "uris": [{"uri": card_url, "description": text["card_link"], "id": "card"}]
        },
    }


# ---------------------------------------------------------------- operations
async def ensure_class(cafe: dict, lang: str = "en") -> None:
    """Create the loyalty class if it doesn't exist yet. Safe to call repeatedly."""
    existing = await _request("GET", f"loyaltyClass/{class_id()}")
    if existing.status_code == 200:
        return
    if existing.status_code != 404:
        existing.raise_for_status()

    created = await _request("POST", "loyaltyClass", json=build_class(cafe, lang))
    created.raise_for_status()
    logger.info("Created Google Wallet loyalty class %s", class_id())


async def upsert_object(member: dict, cafe: dict, barcode_value: str,
                        card_url: str, lang: str = "en") -> dict:
    """Create the member's pass, or update it if it already exists."""
    body = build_object(member, cafe, barcode_value, card_url, lang)
    existing = await _request("GET", f"loyaltyObject/{body['id']}")

    if existing.status_code == 200:
        patched = await _request("PATCH", f"loyaltyObject/{body['id']}", json=body)
        patched.raise_for_status()
        return patched.json()

    if existing.status_code != 404:
        existing.raise_for_status()

    created = await _request("POST", "loyaltyObject", json=body)
    created.raise_for_status()
    return created.json()


async def push_update(member: dict, cafe: dict, barcode_value: str,
                      card_url: str, lang: str = "en") -> bool:
    """Update an already-issued pass. No-op if the customer never saved one."""
    body = build_object(member, cafe, barcode_value, card_url, lang)
    response = await _request("PATCH", f"loyaltyObject/{body['id']}", json=body)
    if response.status_code == 404:
        return False  # never saved to a device; nothing to update
    response.raise_for_status()
    return True


async def expire_object(member_code: str) -> bool:
    """Mark an issued pass expired. False if the customer never saved one.

    A pass already on someone's phone cannot be recalled. EXPIRED is the
    closest thing: Google greys it out and stops presenting it as a live card,
    which is what we want when the member behind it has been erased.
    """
    oid = object_id(member_code)
    response = await _request("PATCH", f"loyaltyObject/{oid}",
                              json={"id": oid, "state": "EXPIRED"})
    if response.status_code == 404:
        return False
    response.raise_for_status()
    return True


def save_link(member: dict, cafe: dict, barcode_value: str,
              card_url: str, origins: list[str], lang: str = "en") -> str:
    """The 'Save to Google Wallet' URL.

    The object is embedded in the signed token rather than referenced, so the
    link works even before the object exists on Google's side — saving it
    creates the pass.
    """
    account = _service_account()
    if not account:
        raise RuntimeError("Google Wallet service account is not configured")

    token = jwt.encode(
        {
            "iss": account["client_email"],
            "aud": "google",
            "typ": "savetowallet",
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "origins": origins,
            "payload": {
                "loyaltyObjects": [
                    build_object(member, cafe, barcode_value, card_url, lang)
                ]
            },
        },
        account["private_key"],
        algorithm="RS256",
    )
    return f"{SAVE_URL}/{token}"
