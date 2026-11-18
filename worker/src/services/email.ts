// Transactional email, sent through Resend. Port of backend/app/services/email.py: the magic sign-in link, the
// free-coffee note, the referral note and contact-form delivery, in the customer's language (hu by default).
import type { App } from '../http';
import { settings } from '../config';

const API_URL = 'https://api.resend.com/emails';

const FORBIDDEN_TAGS = ['<form', '<input', '<textarea', '<select'];
const LINK_RE = /(?:href|src)\s*=\s*["']([^"']+)/gi;
const SAFE_SCHEMES = ['mailto:', 'tel:', 'cid:', '#'];

const DEFAULT_LANG = 'hu';
type Lang = 'hu' | 'en';

const lang_ = (lang: string | null | undefined): Lang => (lang === 'hu' || lang === 'en' ? lang : DEFAULT_LANG);

/** Python's html.escape(s, quote=True). */
export const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

/** str.format with keyword arguments only. */
const format = (tpl: string, vals: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vals ? String(vals[k]) : m));

/** Email clients strip forms and block http assets — fail loudly at build time. */
function assertSafe(html: string) {
  const lowered = html.toLowerCase();
  if (FORBIDDEN_TAGS.some((t) => lowered.includes(t))) throw new Error('Email HTML must not contain forms or inputs');
  for (const match of html.matchAll(LINK_RE)) {
    const url = match[1].trim().toLowerCase();
    if (SAFE_SCHEMES.some((s) => url.startsWith(s)) || url.startsWith('https://')) continue;
    throw new Error(`Email links must be absolute https: ${url}`);
  }
}

async function post(app: App, payload: Record<string, unknown>) {
  return fetch(String(app.env.RESEND_API_URL ?? '') || API_URL, { // RESEND_API_URL: local tests against a stub only
    method: 'POST',
    headers: { Authorization: `Bearer ${settings(app.env).resend_api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
}

/** Send one message. Every caller supplies `text`: spam filters mark HTML-only mail down. */
export async function send(app: App, to: string, subject: string, html: string, text: string | null = null): Promise<string | null> {
  assertSafe(html);
  const s = settings(app.env);
  if (!s.email_configured) {
    console.warn(`Email is not configured; message to ${to} was not sent`);
    return null;
  }
  const payload: Record<string, unknown> = { from: s.email_from, to: [to], subject, html };
  if (text) payload.text = text;
  if (s.email_reply_to) payload.reply_to = s.email_reply_to;

  const response = await post(app, payload);
  if (response.status >= 400) {
    // Resend explains refusals in the body (an unverified sending domain, most often).
    const body = await response.text();
    console.error(`Resend rejected the message to ${to}: ${response.status} ${body.slice(0, 400)}`);
    throw new Error(`Resend error ${response.status}`);
  }
  const data = (await response.json()) as { id?: string };
  return data.id ?? null;
}

const FOOTER: Record<Lang, string> = {
  en: 'Sent by {name}. We never ask for your password or card details by email. ' +
    'You are receiving this because you joined the Bros Cafe loyalty programme.',
  hu: 'Küldte: {name}. Jelszót és bankkártyaadatot soha nem kérünk e-mailben. ' +
    'Azért kaptad ezt a levelet, mert csatlakoztál a Bros Cafe hűségprogramjához.',
};

function shell(app: App, title: string, bodyHtml: string, buttonLabel = '', buttonUrl = '', lang: string = DEFAULT_LANG): string {
  let button = '';
  if (buttonLabel && buttonUrl) {
    button =
      `<tr><td style="padding:8px 24px 24px">` +
      `<a href="${buttonUrl}" style="display:inline-block;background:#66734A;` +
      `color:#F5F0E6;text-decoration:none;padding:14px 28px;border-radius:14px;` +
      `font-weight:600">${escape(buttonLabel)}</a></td></tr>`;
  }
  const footer = format(FOOTER[lang_(lang)], { name: escape(settings(app.env).email_from_name) });
  return (
    '<table role="presentation" width="100%" style="background:#F5F0E6;padding:24px 0">' +
    '<tr><td align="center"><table role="presentation" width="480" ' +
    'style="background:#ffffff;border-radius:20px;' +
    'font-family:Arial,Helvetica,sans-serif;overflow:hidden">' +
    `<tr><td style="padding:28px 24px 6px;font-size:22px;font-weight:700;` +
    `color:#2C3322">${escape(title)}</td></tr>` +
    `<tr><td style="padding:0 24px 8px;font-size:15px;line-height:1.6;` +
    `color:#5b614f">${bodyHtml}</td></tr>` +
    `${button}` +
    '<tr><td style="padding:16px 24px 24px;font-size:12px;color:#9aa08c">' +
    `${footer}` +
    '</td></tr></table></td></tr></table>'
  );
}

const REWARD: Record<Lang, { subject: string; title: string; body: string }> = {
  en: {
    subject: 'Your Bros Cafe reward is ready',
    title: 'Your reward is ready',
    body: '<p>Good news — you have earned a <strong>free coffee</strong> at Bros Cafe.</p>' +
      '<p>Open your loyalty card and show it at the counter on your next visit.</p>',
  },
  hu: {
    subject: 'Megvan az ingyen kávéd',
    title: 'Itt a jutalmad',
    body: '<p>Jó hír: összegyűlt egy <strong>ingyen kávé</strong> a Bros Caféban.</p>' +
      '<p>Nyisd meg a hűségkártyád, és mutasd meg a pultnál, amikor legközelebb bejössz.</p>',
  },
};

const MAGIC: Record<Lang, Record<'new_subject' | 'subject' | 'title' | 'new_intro' | 'intro' | 'body' | 'button', string>> = {
  en: {
    new_subject: 'Welcome to Bros Cafe',
    subject: 'Sign in to your Bros Cafe account',
    title: 'Your Bros Cafe account',
    new_intro: 'Welcome to Bros Cafe — your loyalty card is ready.',
    intro: 'Here is your secure sign-in link.',
    body: '<p>Tap the button below to open your Bros Cafe account and loyalty card. ' +
      'No password needed — the link works for {minutes} minutes.</p>',
    button: 'Open my Bros Cafe account',
  },
  hu: {
    new_subject: 'Üdv a Bros Caféban!',
    subject: 'Belépés a Bros Cafe fiókodba',
    title: 'A Bros Cafe fiókod',
    new_intro: 'Üdv a Bros Caféban — elkészült a hűségkártyád.',
    intro: 'Itt a belépési linked.',
    body: '<p>Koppints a gombra, és megnyílik a fiókod a hűségkártyáddal. ' +
      'Jelszó nem kell — a link {minutes} percig él.</p>',
    button: 'Megnyitom a fiókom',
  },
};

const REFERRAL: Record<Lang, { subject: string; title: string; body: string }> = {
  en: {
    subject: '{name} came in — your coffee is on us',
    title: 'Thank you for the introduction',
    body: '<p><strong>{name}</strong> used your invitation and has just had ' +
      'their first coffee with us.</p>' +
      '<p>That earns you a <strong>free coffee</strong>. Show your loyalty ' +
      'card at the counter whenever you like — it is waiting on your ' +
      'account, separate from your stamps.</p>',
  },
  hu: {
    subject: '{name} beváltotta a meghívásod — a kávé a miénk',
    title: 'Köszönjük az ajánlást',
    body: '<p><strong>{name}</strong> a te meghívásoddal jött be, és most itta ' +
      'meg nálunk az első kávéját.</p>' +
      '<p>Ezért jár neked egy <strong>ingyen kávé</strong>. Mutasd meg a ' +
      'hűségkártyád a pultnál, amikor szeretnéd — a fiókodban vár, ' +
      'a pecsétjeidtől függetlenül.</p>',
  },
};

const PLAIN_REFERRAL: Record<Lang, string> = {
  en: '{name} used your invitation and has just had their first coffee with us.\n\n' +
    'That earns you a free coffee. Show your loyalty card at the counter ' +
    'whenever you like.\n\n' +
    'Bros Cafe, 1132 Budapest, Csanády u. 4/b',
  hu: '{name} a te meghívásoddal jött be, és most itta meg nálunk az első kávéját.\n\n' +
    'Ezért jár neked egy ingyen kávé. Mutasd meg a hűségkártyád a pultnál, ' +
    'amikor szeretnéd.\n\n' +
    'Bros Cafe, 1132 Budapest, Csanády u. 4/b',
};

const PLAIN_REWARD: Record<Lang, string> = {
  en: 'You have earned a free coffee at Bros Cafe.\n\n' +
    'Open your loyalty card and show it at the counter on your next visit.\n\n' +
    'Bros Cafe, 1132 Budapest, Csanády u. 4/b',
  hu: 'Összegyűlt egy ingyen kávé a Bros Caféban.\n\n' +
    'Nyisd meg a hűségkártyád, és mutasd meg a pultnál, amikor legközelebb bejössz.\n\n' +
    'Bros Cafe, 1132 Budapest, Csanády u. 4/b',
};

const PLAIN_MAGIC: Record<Lang, string> = {
  en: '{intro}\n\nOpen your Bros Cafe account and loyalty card here:\n{link}\n\n' +
    'No password needed — the link works for {minutes} minutes.\n\n' +
    'If you did not ask for this, you can ignore this email.\n\n' +
    'Bros Cafe, 1132 Budapest, Csanády u. 4/b',
  hu: '{intro}\n\nItt nyílik meg a fiókod és a hűségkártyád:\n{link}\n\n' +
    'Jelszó nem kell — a link {minutes} percig él.\n\n' +
    'Ha nem te kérted, nyugodtan hagyd figyelmen kívül ezt a levelet.\n\n' +
    'Bros Cafe, 1132 Budapest, Csanády u. 4/b',
};

export async function sendRewardReady(app: App, email: string, lang: string = DEFAULT_LANG): Promise<void> {
  const code = lang_(lang);
  const text = REWARD[code];
  await send(app, email, text.subject, shell(app, text.title, text.body, '', '', code), PLAIN_REWARD[code]);
}

export async function sendReferralEarned(app: App, email: string, friendName: string, lang: string = DEFAULT_LANG): Promise<void> {
  const code = lang_(lang);
  const text = REFERRAL[code];
  // friend_name goes into the HTML unescaped, exactly as the Python version did
  await send(app, email, format(text.subject, { name: friendName }),
    shell(app, text.title, format(text.body, { name: friendName }), '', '', code),
    format(PLAIN_REFERRAL[code], { name: friendName }));
}

export async function sendMagicLink(app: App, email: string, link: string, isNew: boolean, lang: string = DEFAULT_LANG): Promise<void> {
  const code = lang_(lang);
  const text = MAGIC[code];
  const minutes = settings(app.env).magic_link_minutes;
  const intro = isNew ? text.new_intro : text.intro;
  const body = `<p>${intro}</p>` + format(text.body, { minutes });
  const plain = format(PLAIN_MAGIC[code], { intro, link, minutes });
  await send(app, email, isNew ? text.new_subject : text.subject, shell(app, text.title, body, text.button, link, code), plain);
}

const CONTACT: Record<Lang, Record<'subject' | 'heading' | 'from_label' | 'message_label', string>> = {
  en: { subject: 'Website message from {name}', heading: 'Message from the website', from_label: 'From', message_label: 'Message' },
  hu: { subject: 'Weboldalas üzenet — {name}', heading: 'Üzenet a weboldalról', from_label: 'Feladó', message_label: 'Üzenet' },
};

/** Deliver a contact-form message to the café's support address; Reply-To is the visitor. */
export async function sendContactMessage(app: App, name: string, sender: string, message: string, lang: string = DEFAULT_LANG): Promise<void> {
  const text = CONTACT[lang_(lang)];
  const safeName = escape(name), safeSender = escape(sender);
  const body =
    `<p><strong>${escape(text.from_label)}:</strong> ${safeName} ` +
    `&lt;${safeSender}&gt;</p>` +
    `<p><strong>${escape(text.message_label)}:</strong></p>` +
    `<p style="white-space:pre-wrap">${escape(message)}</p>`;
  const plain = `${text.from_label}: ${name} <${sender}>\n\n${text.message_label}:\n${message}\n`;

  const s = settings(app.env);
  if (!s.email_configured) {
    console.warn(`Email is not configured; contact message from ${sender} dropped`);
    return;
  }

  const payload = {
    from: s.email_from,
    to: [s.support_email],
    // [:160] counts code points, not UTF-16 units
    subject: Array.from(format(text.subject, { name })).slice(0, 160).join(''),
    html: shell(app, text.heading, body, '', '', lang_(lang)),
    text: plain,
    // So a reply goes to the visitor, not to ourselves.
    reply_to: sender,
  };
  const response = await post(app, payload);
  if (response.status >= 400) {
    const err = await response.text();
    console.error(`Resend rejected the contact message: ${response.status} ${err.slice(0, 300)}`);
    throw new Error(`Resend error ${response.status}`);
  }
}
