"""Wallet identity provisioning and pass generation for a member."""
import logging
import secrets
import uuid
from datetime import datetime, timezone

from app import db
from app.config import settings
from app.services import app_settings, members
from app.wallet import apple

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


async def notify_update(code: str) -> None:
    """Best-effort: stamp the pass as changed and push to registered devices."""
    if not apple.is_configured():
        return
    member = await db.members.find_one({"code": code})
    serial = member.get("wallet_serial") if member else None
    if not serial:
        return

    await db.members.update_one(
        {"code": code},
        {"$set": {"wallet_updated_at": datetime.now(timezone.utc).isoformat()}})

    registrations = await db.wallet_registrations.find({"serial": serial}, {"_id": 0}).to_list(500)
    tokens = [r["push_token"] for r in registrations if r.get("push_token")]
    if not tokens:
        return
    try:
        sent = await apple.push_to_devices(tokens)
        logger.info("Wallet push: %s/%s devices for %s", sent, len(tokens), serial)
    except Exception as exc:
        await db.wallet_stats.update_one({"_id": "stats"}, {"$inc": {"push_failures": 1}},
                                        upsert=True)
        logger.warning("Wallet push failed for %s: %s", serial, exc)


async def bump_stat(field: str) -> None:
    await db.wallet_stats.update_one({"_id": "stats"}, {"$inc": {field: 1}}, upsert=True)
