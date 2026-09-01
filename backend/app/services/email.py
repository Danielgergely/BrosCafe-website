"""Transactional email. One shell template, one safety check, two messages."""
import logging
import re
from html import escape

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_FORBIDDEN_TAGS = ("<form", "<input", "<textarea", "<select")
_LINK_RE = re.compile(r'(?:href|src)\s*=\s*["\']([^"\']+)', re.I)
_SAFE_SCHEMES = ("mailto:", "tel:", "cid:", "#")


def _assert_safe(html: str) -> None:
    """Email clients strip forms and block http assets — fail loudly at build time."""
    lowered = html.lower()
    if any(tag in lowered for tag in _FORBIDDEN_TAGS):
        raise ValueError("Email HTML must not contain forms or inputs")
    for match in _LINK_RE.finditer(html):
        url = match.group(1).strip().lower()
        if url.startswith(_SAFE_SCHEMES) or url.startswith("https://"):
            continue
        raise ValueError(f"Email links must be absolute https: {url}")


async def send(to: str, subject: str, html: str) -> str | None:
    _assert_safe(html)
    if not settings.email_key:
        logger.warning("No email key configured; email to %s was not sent", to)
        return None
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{settings.email_base_url}/api/v1/email/send",
            headers={"X-Email-Key": settings.email_key},
            json={"to": [to], "subject": subject, "html": html,
                  "from_name": settings.email_from_name},
        )
    response.raise_for_status()
    return response.json().get("id")


def shell(title: str, body_html: str, button_label: str = "", button_url: str = "") -> str:
    button = ""
    if button_label and button_url:
        button = (
            f'<tr><td style="padding:8px 24px 24px">'
            f'<a href="{button_url}" style="display:inline-block;background:#66734A;'
            f'color:#F5F0E6;text-decoration:none;padding:14px 28px;border-radius:14px;'
            f'font-weight:600">{escape(button_label)}</a></td></tr>'
        )
    return (
        '<table role="presentation" width="100%" style="background:#F5F0E6;padding:24px 0">'
        '<tr><td align="center"><table role="presentation" width="480" '
        'style="background:#ffffff;border-radius:20px;'
        'font-family:Arial,Helvetica,sans-serif;overflow:hidden">'
        f'<tr><td style="padding:28px 24px 6px;font-size:22px;font-weight:700;'
        f'color:#2C3322">{escape(title)}</td></tr>'
        f'<tr><td style="padding:0 24px 8px;font-size:15px;line-height:1.6;'
        f'color:#5b614f">{body_html}</td></tr>'
        f'{button}'
        '<tr><td style="padding:16px 24px 24px;font-size:12px;color:#9aa08c">'
        f'Sent by {escape(settings.email_from_name)}. We never ask for your password or '
        'card details by email. You are receiving this because you joined the '
        'Bros Cafe loyalty programme.'
        '</td></tr></table></td></tr></table>'
    )


async def send_reward_ready(email: str) -> None:
    body = ('<p>Great news — you have earned a <strong>free coffee</strong> at Bros Cafe.</p>'
            '<p>Open your loyalty card and show it at the counter on your next visit.</p>')
    await send(email, "Your Bros Cafe reward is ready", shell("Your reward is ready", body))


async def send_magic_link(email: str, link: str, is_new: bool) -> None:
    subject = "Welcome to Bros Cafe" if is_new else "Sign in to your Bros Cafe account"
    intro = ("Welcome to Bros Cafe — your loyalty card is ready." if is_new
             else "Here is your secure sign-in link.")
    body = (f'<p>{intro}</p><p>Tap the button below to open your Bros Cafe account and '
            f'loyalty card. No password required — this link is valid for '
            f'{settings.magic_link_minutes} minutes.</p>')
    await send(email, subject, shell("Your Bros Cafe account", body,
                                     "Open my Bros Cafe account", link))
