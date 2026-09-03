"""The website's contact form.

Public and unauthenticated, which makes it a mail relay unless it is guarded.
Three things keep it honest: a hidden field no person fills in, a per-address
and per-IP hourly cap, and hard length limits on the model. Nothing here
trusts the submitted content — the sender address goes in Reply-To, never in
the From, so a rejected message can never look like it came from us.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request

from app import db
from app.config import settings
from app.models import ContactMessage
from app.services import email as email_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["contact"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",")[0].strip() if forwarded
            else (request.client.host if request.client else "unknown"))


async def _within_limit(ip: str, sender: str) -> bool:
    """Cap submissions per hour, counted by both address and origin.

    Either alone is easy to work around — one person can vary the address, and
    a shared café connection makes one IP legitimately busy.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = await db.contact_log.count_documents(
        {"at": {"$gte": since}, "$or": [{"ip": ip}, {"email": sender}]})
    return recent < settings.contact_per_hour


@router.post("/contact")
async def submit_contact(body: ContactMessage, request: Request):
    sender = body.email.lower().strip()

    # A filled honeypot means a bot. Answer as though it worked: telling it
    # otherwise just teaches whoever wrote it to skip the field next time.
    if body.website.strip():
        logger.info("Contact form honeypot tripped from %s", _client_ip(request))
        return {"ok": True}

    ip = _client_ip(request)
    if not await _within_limit(ip, sender):
        raise HTTPException(
            status_code=429,
            detail="You have sent several messages already. "
                   "Please give us a little time to reply first.")

    await db.contact_log.insert_one({
        "at": datetime.now(timezone.utc), "ip": ip, "email": sender,
    })
    try:
        await email_service.send_contact_message(
            body.name.strip(), sender, body.message.strip(), request.headers.get("x-lang", "hu"))
    except Exception:
        logger.exception("Contact message from %s could not be delivered", sender)
        raise HTTPException(
            status_code=502,
            detail="We could not send that just now. Please email us directly.")
    return {"ok": True}
