"""Passwordless customer accounts: request a magic link, verify it, manage the account."""
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.config import settings
from app.models import ChangeEmail, LinkRequest, VerifyRequest
from app.security import create_customer_token, get_current_customer, hash_token
from app.services import email as email_service
from app.services import members

logger = logging.getLogger(__name__)
router = APIRouter(tags=["customer-auth"])


async def _referrer_code(ref: str | None, email: str) -> str | None:
    """Resolve a referral code, ignoring anything that isn't a real other member."""
    if not ref:
        return None
    referrer = await db.members.find_one({"code": ref.strip()}, {"code": 1, "email": 1})
    if not referrer or referrer["email"] == email:
        return None
    return referrer["code"]


@router.post("/auth/request-link")
async def request_link(body: LinkRequest):
    """One smart form: a known email just gets a link; a new one needs a first name first.

    Returning needs_name *before* creating anything keeps phantom members out of the DB.
    """
    email = body.email.lower().strip()
    first_name = (body.first_name or "").strip()
    lang = body.lang or "hu"
    member = await db.members.find_one({"email": email})
    is_new = member is None

    if is_new and not first_name:
        return {"ok": True, "is_new": True, "needs_name": True}

    if is_new:
        member = await members.create(first_name, email, lang,
                                      referred_by=await _referrer_code(body.ref, email))
    else:
        # Remember the language they signed in with, so the reward email that
        # arrives weeks later is in the same one.
        changes = {"lang": lang}
        if first_name and member.get("name") in (None, "", "Friend"):
            changes["name"] = first_name
        await db.members.update_one({"email": email}, {"$set": changes})

    raw = secrets.token_urlsafe(32)
    await db.magic_tokens.insert_one({
        "token_hash": hash_token(raw),
        "email": email,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=settings.magic_link_minutes),
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    link = f"{settings.frontend_url}/auth/verify?token={raw}"
    if not settings.email_configured:
        # Local development only: with no mail provider the link is unreachable,
        # so log it rather than leaving the flow with no way through.
        logger.warning("DEV ONLY — magic link for %s: %s", email, link)
    try:
        await email_service.send_magic_link(email, link, is_new, lang)
    except Exception as exc:
        logger.error("Magic link email to %s failed: %s", email, exc)
    return {"ok": True, "is_new": is_new}


@router.post("/auth/verify")
async def verify_link(body: VerifyRequest):
    record = await db.magic_tokens.find_one({"token_hash": hash_token(body.token), "used": False})
    if not record or record["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="This link is invalid or has expired. Please request a new one.")

    await db.magic_tokens.update_one({"_id": record["_id"]}, {"$set": {"used": True}})
    member = await db.members.find_one({"email": record["email"]})
    if not member:
        raise HTTPException(status_code=404, detail="Account not found")
    return {
        "token": create_customer_token(member["code"], member["email"]),
        "member": members.public(member),
    }


@router.get("/customer/me")
async def customer_me(member: dict = Depends(get_current_customer)):
    """The signed-in customer, and a freshly minted session alongside them.

    Sliding rather than fixed: every visit resets the clock, so a customer who
    comes in even once a year is never signed out. Only someone who has not
    opened the site at all in that time has to ask for a new link.
    """
    return {
        **members.public(member),
        "session_token": create_customer_token(member["code"], member["email"]),
    }


@router.post("/customer/change-email")
async def change_email(body: ChangeEmail, member: dict = Depends(get_current_customer)):
    new_email = body.email.lower().strip()
    clash = await db.members.find_one({"email": new_email})
    if clash and clash["code"] != member["code"]:
        raise HTTPException(status_code=400, detail="That email is already in use.")
    await db.members.update_one({"code": member["code"]}, {"$set": {"email": new_email}})
    return members.public(await db.members.find_one({"code": member["code"]}))
