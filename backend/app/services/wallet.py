"""Wallet identity provisioning and pass generation for a member."""
import logging
import secrets
import uuid
from datetime import datetime, timezone

from app import db
from app.config import settings
from app.services import app_settings, members
from app.wallet import apple, google

logger = logging.getLogger(__name__)


async def ensure_identity(member: dict) -> dict:
    """Give a member a stable Wallet serial, auth token and scan token — once."""
    updates = {}
    if not member.get("wallet_serial"):
        updates["wallet_serial"] = "bros_customer_" + uuid.uuid4().hex[:12]
    if not member.get("wallet_auth_token"):
        updates["wallet_auth_token"] = secrets.token_urlsafe(24)
    if not member.get("loyalty_token"):
        updates["loyalty_token"] = secrets.token_urlsafe(24)
    if updates:
        await db.members.update_one({"code": member["code"]}, {"$set": updates})
        member.update(updates)
    return member


def web_service_url() -> str:
    return f"{settings.frontend_url}/api/wallet"


async def build_pkpass(member: dict, lang: str | None = None) -> bytes:
    await ensure_identity(member)
    return apple.build_pkpass(
        members.public(member) | {"name": member["name"]},
        settings.cafe,
        await app_settings.read(),
        serial=member["wallet_serial"],
        auth_token=member["wallet_auth_token"],
        barcode_msg=member["loyalty_token"],
        web_service_url=web_service_url(),
        lang=lang or member.get("wallet_lang", "en"),
    )


def card_url(member_code: str) -> str:
    return f"{settings.frontend_url}/card/{member_code}"


def _origins() -> list[str]:
    """Origins allowed to present the Save-to-Google-Wallet button.

    Google matches the full origin, scheme included, against the page holding
    the link — a bare hostname is not an origin and the button then fails with
    nothing in the console. www.broscafe.hu serves the same site, so a customer
    who typed the www form is included too.
    """
    base = settings.frontend_url.rstrip("/")
    if not base:
        return []
    host = base.split("://")[-1]
    sibling = host[4:] if host.startswith("www.") else f"www.{host}"
    return [base, f"https://{sibling}"]


async def google_save_link(member: dict, lang: str = "en") -> str:
    """A 'Save to Google Wallet' URL for this member.

    Creates the loyalty class and object first so the pass is immediately
    updatable afterwards — the link alone would create it lazily, but then a
    stamp added before the customer saves would have nothing to patch.
    """
    await ensure_identity(member)
    cafe = settings.cafe
    barcode = member["loyalty_token"]
    url = card_url(member["code"])

    await google.ensure_class(cafe, lang)
    await google.upsert_object(member, cafe, barcode, url, lang)
    await db.members.update_one(
        {"code": member["code"]},
        {"$set": {"google_object_id": google.object_id(member["code"]),
                  "google_wallet_lang": lang}})

    return google.save_link(member, cafe, barcode, url, _origins(), lang)


async def _notify_apple(member: dict) -> None:
    serial = member.get("wallet_serial")
    if not serial:
        return
    registrations = await db.wallet_registrations.find(
        {"serial": serial}, {"_id": 0}).to_list(500)
    tokens = [r["push_token"] for r in registrations if r.get("push_token")]
    if not tokens:
        return
    try:
        sent = await apple.push_to_devices(tokens)
        logger.info("Apple Wallet push: %s/%s devices for %s", sent, len(tokens), serial)
    except Exception as exc:
        await bump_stat("push_failures")
        logger.warning("Apple Wallet push failed for %s: %s", serial, exc)


async def _notify_google(member: dict) -> None:
    """Patch the member's LoyaltyObject; Google pushes it to the device."""
    if not member.get("google_object_id"):
        return  # never saved a Google pass
    try:
        updated = await google.push_update(
            member, settings.cafe, member["loyalty_token"],
            card_url(member["code"]), member.get("google_wallet_lang", "en"))
        if updated:
            logger.info("Google Wallet updated for %s", member["code"])
    except Exception as exc:
        await bump_stat("google_push_failures")
        logger.warning("Google Wallet update failed for %s: %s", member["code"], exc)


async def notify_update(code: str) -> None:
    """Refresh both wallets after a balance change. Best-effort by design —
    a wallet problem must never fail the barista's tap at the counter."""
    apple_on, google_on = apple.is_configured(), google.is_configured()
    if not (apple_on or google_on):
        return

    member = await db.members.find_one({"code": code})
    if not member:
        return

    await db.members.update_one(
        {"code": code},
        {"$set": {"wallet_updated_at": datetime.now(timezone.utc).isoformat()}})

    if apple_on:
        await _notify_apple(member)
    if google_on:
        await _notify_google(member)


async def bump_stat(field: str) -> None:
    await db.wallet_stats.update_one({"_id": "stats"}, {"$inc": {field: 1}}, upsert=True)
