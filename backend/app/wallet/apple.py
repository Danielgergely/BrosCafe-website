"""Apple Wallet (.pkpass) generation + signing for Bros Cafe loyalty passes.

Credentials come ONLY from environment/secrets — never hard-coded, never committed.
Supports either PEM strings (APPLE_CERTIFICATE + APPLE_PRIVATE_KEY) or a .p12 file path.
Signing is always server-side. Nothing here runs until credentials are configured.
"""
import io
import logging
import os
import json
import hashlib
import zipfile
import tempfile

from cryptography.hazmat.primitives.serialization import (
    Encoding, NoEncryption, PrivateFormat, load_pem_private_key, pkcs7, pkcs12,
)
from cryptography.hazmat.primitives import hashes
from cryptography import x509

from app.config import ASSETS_DIR
from app.wallet import artwork

logger = logging.getLogger(__name__)

APNS_HOST = os.environ.get("APNS_HOST", "https://api.push.apple.com")


# ---------------------------------------------------------------- configuration
def _env(k):
    v = os.environ.get(k, "")
    return v.strip() if v else ""


def config_status() -> dict:
    team = _env("APPLE_TEAM_ID")
    pass_type = _env("APPLE_PASS_TYPE_ID")
    wwdr = _env("APPLE_WWDR_CERTIFICATE") or (
        os.path.exists(_env("APPLE_WWDR_CERT_PATH")) if _env("APPLE_WWDR_CERT_PATH") else False)
    p12 = _env("APPLE_PASS_CERT_P12_PATH") and os.path.exists(_env("APPLE_PASS_CERT_P12_PATH"))
    pem = bool(_env("APPLE_CERTIFICATE") and _env("APPLE_PRIVATE_KEY"))
    pem_files = bool(_env("APPLE_CERT_PEM_PATH") and os.path.exists(_env("APPLE_CERT_PEM_PATH"))
                     and _env("APPLE_KEY_PEM_PATH") and os.path.exists(_env("APPLE_KEY_PEM_PATH")))
    enabled = _env("APPLE_PASS_CONFIGURED").lower() == "true"
    missing = []
    if not enabled:
        missing.append('APPLE_PASS_CONFIGURED="true"')
    if not team:
        missing.append("APPLE_TEAM_ID")
    if not pass_type:
        missing.append("APPLE_PASS_TYPE_ID")
    if not (p12 or pem or pem_files):
        missing.append("APPLE_PRIVATE_KEY (or APPLE_KEY_PEM_PATH file, or a .p12)")
    if not wwdr:
        missing.append("APPLE_WWDR_CERTIFICATE (or APPLE_WWDR_CERT_PATH)")
    return {
        "enabled_flag": enabled, "team_id": bool(team), "pass_type_id": bool(pass_type),
        "signing_identity": bool(p12 or pem or pem_files), "wwdr": bool(wwdr),
        "configured": enabled and bool(team) and bool(pass_type) and bool(p12 or pem or pem_files) and bool(wwdr),
        "missing": missing,
    }


def is_configured() -> bool:
    return config_status()["configured"]


# ---------------------------------------------------------------- signing identity
def _load_identity():
    pem_cert, pem_key = _env("APPLE_CERTIFICATE"), _env("APPLE_PRIVATE_KEY")
    password = _env("APPLE_CERTIFICATE_PASSWORD") or _env("APPLE_PASS_CERT_PASSWORD")
    if pem_cert and pem_key:
        cert = x509.load_pem_x509_certificate(pem_cert.encode())
        key = load_pem_private_key(pem_key.encode(), password.encode() if password else None)
        return key, cert
    cert_path, key_path = _env("APPLE_CERT_PEM_PATH"), _env("APPLE_KEY_PEM_PATH")
    if cert_path and key_path:
        cert = x509.load_pem_x509_certificate(open(cert_path, "rb").read())
        key = load_pem_private_key(open(key_path, "rb").read(),
                                   password.encode() if password else None)
        return key, cert
    p12_path = _env("APPLE_PASS_CERT_P12_PATH")
    with open(p12_path, "rb") as f:
        key, cert, _ = pkcs12.load_key_and_certificates(
            f.read(), password.encode() if password else None)
    return key, cert


def _load_wwdr():
    pem = _env("APPLE_WWDR_CERTIFICATE")
    data = pem.encode() if pem else open(_env("APPLE_WWDR_CERT_PATH"), "rb").read()
    try:
        return x509.load_pem_x509_certificate(data)
    except ValueError:
        return x509.load_der_x509_certificate(data)


def _sign_manifest(manifest_bytes: bytes) -> bytes:
    key, cert = _load_identity()
    wwdr = _load_wwdr()
    builder = (pkcs7.PKCS7SignatureBuilder()
               .set_data(manifest_bytes)
               .add_signer(cert, key, hashes.SHA256())
               .add_certificate(wwdr))
    return builder.sign(Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature,
                                       pkcs7.PKCS7Options.Binary])



# A full palette per tier, not just a background: diamond is meant to look
# unmistakably different, so it gets dark platinum with cool silver labels
# rather than the cream-on-colour the earned tiers share.
OLIVE = (102, 115, 74)

# The earned tiers keep the brand green and differ by accent alone. Diamond is
# the exception: it is never earned, so it gets its own dark platinum ground.
# `fg` colours the member's name, the stamp row and the header value, so the
# accent runs through the card instead of sitting in a single stripe.
TIER_PALETTE = {
    "base": {"bg": OLIVE, "fg": (245, 240, 230), "label": (204, 211, 186)},
    "bronze": {"bg": OLIVE, "fg": (226, 162, 108), "label": (206, 214, 188)},
    "silver": {"bg": OLIVE, "fg": (214, 222, 232), "label": (206, 214, 188)},
    "gold": {"bg": OLIVE, "fg": (242, 202, 108), "label": (206, 214, 188)},
    "diamond": {"bg": (22, 25, 32), "fg": (176, 212, 238), "label": (140, 160, 182)},
}


def _tier_line(L: dict, member: dict) -> str:
    """The member's standing, and what it would take to move up."""
    name = L["tier_names"].get(member.get("tier", "base"), "")
    upcoming = member.get("next_tier")
    if not upcoming:
        return name
    return L["tier_progress"].format(
        tier=name, n=member.get("coffees_to_next", 0),
        next=L["tier_names"].get(upcoming, upcoming))


# ---------------------------------------------------------------- pass.json
PASS_STRINGS = {
    "en": {
        "desc": "Bros Cafe Loyalty Card", "club": "Loyalty Club", "member": "Member",
        "reward_label": "Reward", "reward_value": "\U0001F389 FREE COFFEE AVAILABLE",
        "reward_relevant": "Your free coffee is ready at Bros Cafe!",
        "coffees": "Coffees", "free_coffees": "Free coffees",
        "left_label": "Coffees to go",
        "since_value": "since {year}",
        "until_label": "To {tier}",
        "until_value": "{n} coffees",
        "reward_short": "\U0001F389",
        "always_free_short": "\U0001F48E",
        "tier_label": "Status",
        "tier_names": {"base": "Member", "bronze": "Bronze", "silver": "Silver",
                       "gold": "Gold", "diamond": "Diamond"},
        "tier_progress": "{tier} \u2014 {n} more coffees to {next}",
        "always_free": "\U0001F48E Every coffee on the house",
        "how_label": "How it works", "how_value": "Collect {n} stamps and your next coffee is free.",
        "status_label": "Status", "cafe_label": "Bros Cafe",
        "one_more": "One more coffee \u2192 FREE COFFEE",
        "many": "{n} coffees until your free coffee",
        "welcome": "Welcome to Bros Cafe \u2615",
    },
    "hu": {
        "desc": "Bros Cafe Hűségkártya", "club": "Hűségklub", "member": "Tag",
        "reward_label": "Jutalom", "reward_value": "\U0001F389 INGYEN KÁVÉ ELÉRHETŐ",
        "reward_relevant": "Az ingyen kávéd készen áll a Bros Cafenál!",
        "coffees": "Kávék", "free_coffees": "Ingyen kávék",
        "left_label": "Még kell",
        "since_value": "{year} óta",
        "until_label": "{tier}ig",
        "until_value": "{n} kávé",
        "reward_short": "\U0001F389",
        "always_free_short": "\U0001F48E",
        "tier_label": "Szint",
        "tier_names": {"base": "Klubtag", "bronze": "Bronz", "silver": "Ez\u00fcst",
                       "gold": "Arany", "diamond": "Gy\u00e9m\u00e1nt"},
        "tier_progress": "{tier} \u2014 m\u00e9g {n} k\u00e1v\u00e9 a(z) {next} szintig",
        "always_free": "\U0001F48E Minden k\u00e1v\u00e9 a h\u00e1z aj\u00e1nd\u00e9ka",
        "how_label": "Hogyan működik", "how_value": "{n} pecsét, és a következő kávé a miénk.",
        "status_label": "Állapot", "cafe_label": "Bros Cafe",
        "one_more": "Még egy kávé \u2192 INGYEN KÁVÉ",
        "many": "Még {n} kávé az ingyen kávéig",
        "welcome": "Üdv a Bros Cafenál \u2615",
    },
}


def build_pass_dict(member, cafe, settings, serial, auth_token, barcode_msg, web_service_url, lang="en"):
    L = PASS_STRINGS.get(lang, PASS_STRINGS["en"])
    required = member.get("stamps_required", 10)
    stamps = member.get("stamps", 0)
    reward = member.get("reward_ready", False)
    tier = member.get("tier", "base")
    palette = TIER_PALETTE.get(tier, TIER_PALETTE["base"])
    tier_name = L["tier_names"].get(tier, L["club"])
    since = str(member.get("created_at", ""))[:4] or ""
    # "ARANY TAG · 2026 óta". The base tier is already the word for member, so
    # it does not get "TAG" appended to it.
    name_line = tier_name.upper()
    if tier != "base":
        name_line += f" {L['member'].upper()}"
    if since:
        name_line += f" \u00b7 {L['since_value'].format(year=since)}"

    upcoming = member.get("next_tier")
    if member.get("always_free"):
        next_field = {"key": "next", "label": L["tier_label"], "value": tier_name}
    elif upcoming:
        # "EZÜSTIG / 90 kávé" reads as a distance; "EZÜST / 90" did not.
        next_field = {
            "key": "next",
            "label": L["until_label"].format(tier=L["tier_names"].get(upcoming, upcoming)),
            "value": L["until_value"].format(n=member.get("coffees_to_next", 0)),
        }
    else:
        next_field = {"key": "next", "label": L["tier_label"], "value": tier_name}
    # Filled and hollow circles rather than a coffee emoji: a secondary field
    # is a single line that Apple truncates, and ten emoji do not fit — the
    # strip was being cut off mid-card. Circles are about half the width and
    # ten of them sit comfortably.
    dots = "\u2009".join("\u25CF" if i < stamps else "\u25CB" for i in range(required))

    if member.get("always_free"):
        # No card to fill — the standing itself is the message.
        secondary = [{"key": "progress", "label": L["tier_label"], "value": L["always_free"]}]
        relevant = L["always_free"]
        header_label, header_value = tier_name, L["always_free_short"]
    elif reward:
        secondary = [{"key": "progress", "label": L["reward_label"], "value": L["reward_value"]}]
        relevant = L["reward_relevant"]
        header_label, header_value = tier_name, L["reward_short"]
    else:
        remaining = required - stamps
        relevant = L["one_more"] if remaining == 1 else L["many"].format(n=remaining)
        secondary = [{"key": "progress", "label": f"{stamps} / {required}", "value": dots}]
        header_label, header_value = tier_name, f"{stamps} / {required}"

    pass_json = {
        "formatVersion": 1,
        "passTypeIdentifier": os.environ["APPLE_PASS_TYPE_ID"],
        "teamIdentifier": os.environ["APPLE_TEAM_ID"],
        "serialNumber": serial,
        "authenticationToken": auth_token,
        "webServiceURL": web_service_url,
        "organizationName": cafe.get("name", "Bros Cafe"),
        "description": L["desc"],
        # No logoText: the header field already prints the café name, and with
        # both present Apple squeezes the logo text to "Bros C…".
        "foregroundColor": "rgb({}, {}, {})".format(*palette["fg"]),
        "backgroundColor": "rgb({}, {}, {})".format(*palette["bg"]),
        "labelColor": "rgb({}, {}, {})".format(*palette["label"]),
        "barcodes": [{
            "format": "PKBarcodeFormatQR",
            "message": barcode_msg,
            "messageEncoding": "iso-8859-1",
        }],
        "storeCard": {
            "headerFields": [{"key": "left", "label": header_label, "value": header_value}],
            "primaryFields": [
                # "ARANY TAG · 2026 óta" — standing and standing-since in one
                # quiet line, which frees a whole column below.
                {"key": "member", "label": name_line, "value": member.get("name", "")},
            ],
            # The stamp strip is the only field on this row. Apple lays
            # secondary and auxiliary fields out as one row of columns, so any
            # companion field here costs the strip two thirds of its width —
            # which is what was cutting the last stamps off. The running totals
            # moved to the back, where they are just as useful.
            # The stamps live in the strip artwork now, so this row is free.
            "secondaryFields": [
                {"key": "coffees", "label": L["coffees"],
                 "value": str(member.get("total_coffees", 0))},
                {"key": "rewards", "label": L["free_coffees"],
                 "value": str(member.get("rewards_redeemed", 0))},
                next_field,
            ],
            "auxiliaryFields": [],
            "backFields": [
                {"key": "status", "label": L["status_label"], "value": relevant},
                {"key": "how", "label": L["how_label"],
                 "value": L["how_value"].format(n=required)},
                {"key": "tier", "label": L["tier_label"],
                 "value": _tier_line(L, member)},
                {"key": "cafe", "label": L["cafe_label"], "value": cafe.get("address", "")},
            ],
        },
    }

    lat, lng = settings.get("cafe_lat"), settings.get("cafe_lng")
    if lat is not None and lng is not None:
        pass_json["locations"] = [{
            "latitude": float(lat), "longitude": float(lng),
            "relevantText": L["welcome"],
        }]
    return pass_json


def _collect_assets(tier: str = "base", stamps: int = 0, required: int = 0):
    """The images that go into the .pkpass.

    Strips are pre-rendered per tier rather than drawn at request time: the
    band is the only part that varies, and five small files are cheaper than
    an imaging library in the runtime image.
    """
    files = {}
    for name in ("icon.png", "icon@2x.png"):
        path = ASSETS_DIR / name
        if path.exists():
            files[name] = path.read_bytes()

    for suffix in ("", "@2x"):
        path = ASSETS_DIR / f"logo-{tier}{suffix}.png"
        if not path.exists():
            path = ASSETS_DIR / f"logo-base{suffix}.png"
        if path.exists():
            files[f"logo{suffix}.png"] = path.read_bytes()

    files["strip.png"] = artwork.strip(tier, stamps, required, 1)
    files["strip@2x.png"] = artwork.strip(tier, stamps, required, 2)
    return files


def build_pkpass(member, cafe, settings, serial, auth_token, barcode_msg, web_service_url, lang="en") -> bytes:
    pass_json = json.dumps(build_pass_dict(member, cafe, settings, serial, auth_token,
                                           barcode_msg, web_service_url, lang)).encode("utf-8")
    files = {"pass.json": pass_json}
    files.update(_collect_assets(
        member.get("tier", "base"),
        member.get("stamps", 0),
        0 if member.get("always_free") else member.get("stamps_required", 0)))
    manifest = {name: hashlib.sha1(data).hexdigest() for name, data in files.items()}
    manifest_bytes = json.dumps(manifest).encode("utf-8")
    signature = _sign_manifest(manifest_bytes)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
        z.writestr("manifest.json", manifest_bytes)
        z.writestr("signature", signature)
    buf.seek(0)
    return buf.getvalue()


# ---------------------------------------------------------------- APNs push (best-effort)
def _apns_identity():
    """Return (cert_path, key_path, temporary) for APNs mutual TLS, or (None, None, False).

    Handles all three credential shapes config_status() accepts — inline PEM strings,
    on-disk PEM files and a .p12 bundle — because the deployed setup uses files, not
    env strings, and the inline-only version silently sent zero pushes.
    """
    pem_cert, pem_key = _env("APPLE_CERTIFICATE"), _env("APPLE_PRIVATE_KEY")
    if pem_cert and pem_key:
        return _temp_pem(pem_cert.encode()), _temp_pem(pem_key.encode()), True

    cert_path, key_path = _env("APPLE_CERT_PEM_PATH"), _env("APPLE_KEY_PEM_PATH")
    if cert_path and key_path and os.path.exists(cert_path) and os.path.exists(key_path):
        return cert_path, key_path, False

    if _env("APPLE_PASS_CERT_P12_PATH"):
        key, cert = _load_identity()
        password = _env("APPLE_CERTIFICATE_PASSWORD") or _env("APPLE_PASS_CERT_PASSWORD")
        del password  # the extracted key is written unencrypted to a short-lived temp file
        return (
            _temp_pem(cert.public_bytes(Encoding.PEM)),
            _temp_pem(key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())),
            True,
        )
    return None, None, False


def _temp_pem(data: bytes) -> str:
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
    handle.write(data)
    handle.close()
    return handle.name


async def push_to_devices(push_tokens):
    """Send empty Wallet update pushes via APNs. No-op if unconfigured. Returns count sent."""
    if not is_configured() or not push_tokens:
        return 0

    import httpx

    cert_path, key_path, temporary = _apns_identity()
    if not cert_path:
        logger.warning("APNs push skipped: no usable signing identity")
        return 0

    topic = os.environ["APPLE_PASS_TYPE_ID"]
    sent = 0
    try:
        async with httpx.AsyncClient(http2=True, cert=(cert_path, key_path), timeout=15) as client:
            for token in push_tokens:
                try:
                    response = await client.post(
                        f"{APNS_HOST}/3/device/{token}",
                        headers={"apns-topic": topic}, json={})
                    if response.status_code == 200:
                        sent += 1
                    else:
                        logger.warning("APNs rejected %s: %s %s",
                                       token[:8], response.status_code, response.text[:200])
                except Exception as exc:
                    logger.warning("APNs push to %s failed: %s", token[:8], exc)
    except ImportError as exc:
        # httpx raises this when http2=True but the h2 package is absent.
        raise RuntimeError(
            "Apple Wallet push needs HTTP/2 support — install the 'h2' package"
        ) from exc
    finally:
        if temporary:
            for path in (cert_path, key_path):
                try:
                    os.unlink(path)
                except OSError:
                    pass
    return sent
