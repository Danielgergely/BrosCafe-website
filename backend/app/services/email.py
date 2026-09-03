"""Transactional email, sent through Resend.

Two messages go out: the magic sign-in link, and the note that a free coffee is
waiting. Both are the customer's own account speaking to them, so both are
written in the language they used on the site — the café is in Budapest and the
site defaults to Hungarian, so English-only mail would be the odd choice here.
"""
import logging
import re
from html import escape

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

API_URL = "https://api.resend.com/emails"

_FORBIDDEN_TAGS = ("<form", "<input", "<textarea", "<select")
_LINK_RE = re.compile(r'(?:href|src)\s*=\s*["\']([^"\']+)', re.I)
_SAFE_SCHEMES = ("mailto:", "tel:", "cid:", "#")

DEFAULT_LANG = "hu"


def _lang(lang: str | None) -> str:
    return lang if lang in ("hu", "en") else DEFAULT_LANG


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
    if not settings.email_configured:
        logger.warning("Email is not configured; message to %s was not sent", to)
        return None

    payload = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if settings.email_reply_to:
        payload["reply_to"] = settings.email_reply_to

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            API_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        # Resend explains refusals in the body — an unverified sending domain
        # is by far the most common, and the status code alone doesn't say so.
        logger.error("Resend rejected the message to %s: %s %s",
                     to, response.status_code, response.text[:400])
    response.raise_for_status()
    return response.json().get("id")


FOOTER = {
    "en": ("Sent by {name}. We never ask for your password or card details by email. "
           "You are receiving this because you joined the Bros Cafe loyalty programme."),
    "hu": ("Küldte: {name}. Jelszót és bankkártyaadatot soha nem kérünk e-mailben. "
           "Azért kaptad ezt a levelet, mert csatlakoztál a Bros Cafe hűségprogramjához."),
}


def shell(title: str, body_html: str, button_label: str = "", button_url: str = "",
          lang: str = DEFAULT_LANG) -> str:
    button = ""
    if button_label and button_url:
        button = (
            f'<tr><td style="padding:8px 24px 24px">'
            f'<a href="{button_url}" style="display:inline-block;background:#66734A;'
            f'color:#F5F0E6;text-decoration:none;padding:14px 28px;border-radius:14px;'
            f'font-weight:600">{escape(button_label)}</a></td></tr>'
        )
    footer = FOOTER[_lang(lang)].format(name=escape(settings.email_from_name))
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
        f'{footer}'
        '</td></tr></table></td></tr></table>'
    )


REWARD = {
    "en": {
        "subject": "Your Bros Cafe reward is ready",
        "title": "Your reward is ready",
        "body": ("<p>Good news — you have earned a <strong>free coffee</strong> at Bros Cafe.</p>"
                 "<p>Open your loyalty card and show it at the counter on your next visit.</p>"),
    },
    "hu": {
        "subject": "Megvan az ingyen kávéd",
        "title": "Itt a jutalmad",
        "body": ("<p>Jó hír: összegyűlt egy <strong>ingyen kávé</strong> a Bros Cafében.</p>"
                 "<p>Nyisd meg a hűségkártyád, és mutasd meg a pultnál, amikor legközelebb bejössz.</p>"),
    },
}

MAGIC = {
    "en": {
        "new_subject": "Welcome to Bros Cafe",
        "subject": "Sign in to your Bros Cafe account",
        "title": "Your Bros Cafe account",
        "new_intro": "Welcome to Bros Cafe — your loyalty card is ready.",
        "intro": "Here is your secure sign-in link.",
        "body": ("<p>Tap the button below to open your Bros Cafe account and loyalty card. "
                 "No password needed — the link works for {minutes} minutes.</p>"),
        "button": "Open my Bros Cafe account",
    },
    "hu": {
        "new_subject": "Üdv a Bros Caféban!",
        "subject": "Belépés a Bros Cafe fiókodba",
        "title": "A Bros Cafe fiókod",
        "new_intro": "Üdv a Bros Caféban — elkészült a hűségkártyád.",
        "intro": "Itt a belépési linked.",
        "body": ("<p>Koppints a gombra, és megnyílik a fiókod a hűségkártyáddal. "
                 "Jelszó nem kell — a link {minutes} percig él.</p>"),
        "button": "Megnyitom a fiókom",
    },
}


async def send_reward_ready(email: str, lang: str = DEFAULT_LANG) -> None:
    text = REWARD[_lang(lang)]
    await send(email, text["subject"],
               shell(text["title"], text["body"], lang=_lang(lang)))


async def send_magic_link(email: str, link: str, is_new: bool,
                          lang: str = DEFAULT_LANG) -> None:
    text = MAGIC[_lang(lang)]
    intro = text["new_intro"] if is_new else text["intro"]
    body = f'<p>{intro}</p>' + text["body"].format(minutes=settings.magic_link_minutes)
    await send(email, text["new_subject"] if is_new else text["subject"],
               shell(text["title"], body, text["button"], link, lang=_lang(lang)))
