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


async def send(to: str, subject: str, html: str, text: str | None = None) -> str | None:
    """Send one message.

    `text` is not optional in practice: spam filters mark HTML-only mail down,
    and a magic link that lands in spam is a customer who cannot sign in. Every
    caller here supplies one.
    """
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
    if text:
        payload["text"] = text
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


REFERRAL = {
    "en": {
        "subject": "{name} came in — your coffee is on us",
        "title": "Thank you for the introduction",
        "body": ("<p><strong>{name}</strong> used your invitation and has just had "
                 "their first coffee with us.</p>"
                 "<p>That earns you a <strong>free coffee</strong>. Show your loyalty "
                 "card at the counter whenever you like — it is waiting on your "
                 "account, separate from your stamps.</p>"),
    },
    "hu": {
        "subject": "{name} beváltotta a meghívásod — a kávé a miénk",
        "title": "Köszönjük az ajánlást",
        "body": ("<p><strong>{name}</strong> a te meghívásoddal jött be, és most itta "
                 "meg nálunk az első kávéját.</p>"
                 "<p>Ezért jár neked egy <strong>ingyen kávé</strong>. Mutasd meg a "
                 "hűségkártyád a pultnál, amikor szeretnéd — a fiókodban vár, "
                 "a pecsétjeidtől függetlenül.</p>"),
    },
}

PLAIN_REFERRAL = {
    "en": ("{name} used your invitation and has just had their first coffee with us.\n\n"
           "That earns you a free coffee. Show your loyalty card at the counter "
           "whenever you like.\n\n"
           "Bros Cafe, 1132 Budapest, Csanady utca 4-B"),
    "hu": ("{name} a te meghívásoddal jött be, és most itta meg nálunk az első kávéját.\n\n"
           "Ezért jár neked egy ingyen kávé. Mutasd meg a hűségkártyád a pultnál, "
           "amikor szeretnéd.\n\n"
           "Bros Cafe, 1132 Budapest, Csanády utca 4-B"),
}

PLAIN_REWARD = {
    "en": ("You have earned a free coffee at Bros Cafe.\n\n"
           "Open your loyalty card and show it at the counter on your next visit.\n\n"
           "Bros Cafe, 1132 Budapest, Csanady utca 4-B"),
    "hu": ("Összegyűlt egy ingyen kávé a Bros Cafében.\n\n"
           "Nyisd meg a hűségkártyád, és mutasd meg a pultnál, amikor legközelebb bejössz.\n\n"
           "Bros Cafe, 1132 Budapest, Csanády utca 4-B"),
}

PLAIN_MAGIC = {
    "en": ("{intro}\n\nOpen your Bros Cafe account and loyalty card here:\n{link}\n\n"
           "No password needed — the link works for {minutes} minutes.\n\n"
           "If you did not ask for this, you can ignore this email.\n\n"
           "Bros Cafe, 1132 Budapest, Csanady utca 4-B"),
    "hu": ("{intro}\n\nItt nyílik meg a fiókod és a hűségkártyád:\n{link}\n\n"
           "Jelszó nem kell — a link {minutes} percig él.\n\n"
           "Ha nem te kérted, nyugodtan hagyd figyelmen kívül ezt a levelet.\n\n"
           "Bros Cafe, 1132 Budapest, Csanády utca 4-B"),
}


async def send_reward_ready(email: str, lang: str = DEFAULT_LANG) -> None:
    code = _lang(lang)
    text = REWARD[code]
    await send(email, text["subject"],
               shell(text["title"], text["body"], lang=code),
               PLAIN_REWARD[code])


async def send_referral_earned(email: str, friend_name: str,
                               lang: str = DEFAULT_LANG) -> None:
    code = _lang(lang)
    text = REFERRAL[code]
    await send(email, text["subject"].format(name=friend_name),
               shell(text["title"], text["body"].format(name=friend_name), lang=code),
               PLAIN_REFERRAL[code].format(name=friend_name))


async def send_magic_link(email: str, link: str, is_new: bool,
                          lang: str = DEFAULT_LANG) -> None:
    code = _lang(lang)
    text = MAGIC[code]
    intro = text["new_intro"] if is_new else text["intro"]
    body = f'<p>{intro}</p>' + text["body"].format(minutes=settings.magic_link_minutes)
    plain = PLAIN_MAGIC[code].format(
        intro=intro, link=link, minutes=settings.magic_link_minutes)
    await send(email, text["new_subject"] if is_new else text["subject"],
               shell(text["title"], body, text["button"], link, lang=code),
               plain)


CONTACT = {
    "en": {"subject": "Website message from {name}",
           "heading": "Message from the website",
           "from_label": "From", "message_label": "Message"},
    "hu": {"subject": "Weboldalas üzenet — {name}",
           "heading": "Üzenet a weboldalról",
           "from_label": "Feladó", "message_label": "Üzenet"},
}


async def send_contact_message(name: str, sender: str, message: str,
                               lang: str = DEFAULT_LANG) -> None:
    """Deliver a contact-form message to the café's support address.

    Everything from the visitor is escaped before it goes near the HTML: the
    body is attacker-controlled text, and the shell it lands in is a template
    we render. Reply-To is set to the visitor so support can simply reply.
    """
    text = CONTACT[_lang(lang)]
    safe_name, safe_sender = escape(name), escape(sender)
    body = (
        f'<p><strong>{escape(text["from_label"])}:</strong> {safe_name} '
        f'&lt;{safe_sender}&gt;</p>'
        f'<p><strong>{escape(text["message_label"])}:</strong></p>'
        f'<p style="white-space:pre-wrap">{escape(message)}</p>'
    )
    plain = (f'{text["from_label"]}: {name} <{sender}>\n\n'
             f'{text["message_label"]}:\n{message}\n')

    if not settings.email_configured:
        logger.warning("Email is not configured; contact message from %s dropped", sender)
        return

    payload = {
        "from": settings.email_from,
        "to": [settings.support_email],
        "subject": text["subject"].format(name=name)[:160],
        "html": shell(text["heading"], body, lang=_lang(lang)),
        "text": plain,
        # So a reply goes to the visitor, not to ourselves.
        "reply_to": sender,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            API_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        logger.error("Resend rejected the contact message: %s %s",
                     response.status_code, response.text[:300])
    response.raise_for_status()
