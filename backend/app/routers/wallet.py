"""Apple Wallet pass download plus the PassKit web service Apple calls back on."""
import hmac
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app import db
from app.wallet import apple, artwork, google
from app.services import wallet

logger = logging.getLogger(__name__)
router = APIRouter(tags=["wallet"])

PKPASS_MEDIA_TYPE = "application/vnd.apple.pkpass"


@router.get("/wallet/hero/{tier}/{stamps}-{required}.png")
async def hero_image(tier: str, stamps: int, required: int):
    """The banner Google Wallet fetches for a member's card.

    Public and unauthenticated by necessity — Google's servers request it, not
    the customer's browser, so there is nobody to authenticate. It reveals
    nothing: the whole content is a tier name's colours and a count of filled
    circles, with no name, code or contact detail anywhere in it.

    The state is in the path rather than a query string, so each distinct card
    has its own immutable URL that Google can cache indefinitely and that
    changes by itself when a stamp is added.
    """
    if tier not in artwork.TIERS or not (0 <= stamps <= 50 and 0 <= required <= 50):
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        content=artwork.hero(tier, stamps, required),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


def _normalise_lang(value: str) -> str:
    return "hu" if str(value).lower().startswith("hu") else "en"


@router.get("/members/{code}/wallet/apple")
async def download_pass(code: str, lang: str = "en"):
    doc = await db.members.find_one({"code": code})
    if not doc:
        raise HTTPException(status_code=404, detail="Loyalty card not found")

    if not apple.is_configured():
        return {
            "configured": False,
            "message": "Apple Wallet passes are not configured yet.",
            "missing": apple.config_status()["missing"],
        }

    lang = _normalise_lang(lang)
    await db.members.update_one({"code": code}, {"$set": {"wallet_lang": lang}})
    doc["wallet_lang"] = lang

    try:
        pkpass = await wallet.build_pkpass(doc, lang)
    except Exception:
        logger.exception("Failed to build pkpass for %s", code)
        await wallet.bump_stat("gen_failures")
        raise HTTPException(
            status_code=500,
            detail="We're having trouble creating your Wallet card right now.")

    await wallet.bump_stat("passes_issued")
    filename = f'broscafe-{doc["wallet_serial"]}.pkpass'
    return Response(content=pkpass, media_type=PKPASS_MEDIA_TYPE,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/members/{code}/wallet/google")
async def google_save_url(code: str, lang: str = "en"):
    """Returns the 'Save to Google Wallet' link for this member's pass."""
    doc = await db.members.find_one({"code": code})
    if not doc:
        raise HTTPException(status_code=404, detail="Loyalty card not found")

    if not google.is_configured():
        return {
            "configured": False,
            "message": "Google Wallet passes are not configured yet.",
            "missing": google.config_status()["missing"],
        }

    lang = _normalise_lang(lang)
    try:
        return {"configured": True, "save_url": await wallet.google_save_link(doc, lang)}
    except Exception:
        logger.exception("Failed to build Google Wallet pass for %s", code)
        await wallet.bump_stat("google_gen_failures")
        raise HTTPException(
            status_code=502,
            detail="We're having trouble creating your Google Wallet card right now.")


# ---- PassKit web service (Apple calls these; paths are fixed by the spec) ----
def _authorise(request: Request, expected_token: str) -> None:
    header = request.headers.get("Authorization", "")
    prefix = "ApplePass "
    token = header[len(prefix):] if header.startswith(prefix) else ""
    if not token or not hmac.compare_digest(token, expected_token or ""):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _pass_by_serial(serial: str) -> tuple[dict | None, dict | None]:
    """Resolve a serial to a live member, or to a voided pass.

    A card whose account has been erased keeps answering here: the tombstone
    outlives the member so the phone can still be handed the closed version of
    its pass instead of getting a 404 and sitting on stale stamps forever.
    """
    member = await db.members.find_one({"wallet_serial": serial})
    if member:
        return member, None
    tombstone = await wallet.voided_pass(serial)
    if tombstone:
        return None, tombstone
    raise HTTPException(status_code=404, detail="Not found")


def _auth_token(member: dict | None, tombstone: dict | None) -> str:
    return (member or {}).get("wallet_auth_token") or (tombstone or {}).get("auth_token", "")


@router.post("/wallet/v1/devices/{device_id}/registrations/{pass_type}/{serial}")
async def register_device(device_id: str, pass_type: str, serial: str, request: Request):
    member, tombstone = await _pass_by_serial(serial)
    _authorise(request, _auth_token(member, tombstone))
    try:
        body = await request.json()
    except Exception:
        body = {}

    existing = await db.wallet_registrations.find_one({"device_id": device_id, "serial": serial})
    await db.wallet_registrations.update_one(
        {"device_id": device_id, "serial": serial},
        {"$set": {"device_id": device_id, "serial": serial, "pass_type": pass_type,
                  "push_token": body.get("pushToken"),
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return Response(status_code=200 if existing else 201)


@router.delete("/wallet/v1/devices/{device_id}/registrations/{pass_type}/{serial}")
async def unregister_device(device_id: str, pass_type: str, serial: str, request: Request):
    member = await db.members.find_one({"wallet_serial": serial})
    tombstone = None if member else await wallet.voided_pass(serial)
    if member or tombstone:
        _authorise(request, _auth_token(member, tombstone))
    await db.wallet_registrations.delete_one({"device_id": device_id, "serial": serial})
    # The card is off the phone, so the tombstone has nothing left to answer.
    if tombstone and not await db.wallet_registrations.count_documents({"serial": serial}):
        await db.voided_passes.delete_one({"serial": serial})
    return Response(status_code=200)


@router.get("/wallet/v1/devices/{device_id}/registrations/{pass_type}")
async def list_updated_serials(device_id: str, pass_type: str,
                               passesUpdatedSince: Optional[str] = None):
    registrations = await db.wallet_registrations.find(
        {"device_id": device_id, "pass_type": pass_type}, {"_id": 0}).to_list(500)
    serials = [r["serial"] for r in registrations]
    if not serials:
        return Response(status_code=204)
    return {"lastUpdated": datetime.now(timezone.utc).isoformat(), "serialNumbers": serials}


@router.get("/wallet/v1/passes/{pass_type}/{serial}")
async def latest_pass(pass_type: str, serial: str, request: Request):
    member, tombstone = await _pass_by_serial(serial)
    _authorise(request, _auth_token(member, tombstone))
    if not apple.is_configured():
        raise HTTPException(status_code=503, detail="Wallet not configured")

    if tombstone:
        pkpass = apple.build_voided_pkpass(serial, tombstone.get("auth_token", ""),
                                           wallet.web_service_url(),
                                           tombstone.get("lang", "hu"))
        return Response(content=pkpass, media_type=PKPASS_MEDIA_TYPE,
                        headers={"Last-Modified": tombstone["voided_at"]})

    pkpass = await wallet.build_pkpass(member)
    last_modified = member.get("wallet_updated_at", datetime.now(timezone.utc).isoformat())
    return Response(content=pkpass, media_type=PKPASS_MEDIA_TYPE,
                    headers={"Last-Modified": last_modified})


@router.post("/wallet/v1/log")
async def wallet_log(request: Request):
    try:
        logger.info("Apple Wallet log: %s", str(await request.json())[:500])
    except Exception:
        pass
    return {"ok": True}
