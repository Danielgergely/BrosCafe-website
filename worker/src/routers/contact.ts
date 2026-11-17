// The website's contact form. Port of backend/app/routers/contact.py: a honeypot field, a per-address and per-IP
// hourly cap, and hard length limits keep it from being a mail relay.
import { HttpError, Invalid, email, str, type Ctx, type Router } from '../http';
import { settings } from '../config';
import * as emailService from '../services/email';
import { isoAt, nowIso } from '../util';

const clientIp = (c: Ctx) => c.req.headers.get('CF-Connecting-IP') ?? 'unknown';

/** Cap submissions per hour, counted by both address and origin. */
async function withinLimit(c: Ctx, ip: string, sender: string) {
  const since = isoAt(new Date(Date.now() - 3600_000));
  const recent = await c.db.contact_log.countDocuments({ at: { $gte: since }, $or: [{ ip }, { email: sender }] });
  return recent < settings(c.env).contact_per_hour;
}

export function register(api: Router) {
  api.post('/contact', async (c) => {
    const b = (await c.json()) ?? {};
    const inv = new Invalid();
    const name = str(b.name, 'name', inv, { min: 1, max: 80 });
    const addr = email(b.email, 'email', inv);
    const message = str(b.message, 'message', inv, { min: 5, max: 4000 });
    const website = b.website === undefined ? '' : str(b.website, 'website', inv);
    inv.throwIfAny();
    const sender = addr.toLowerCase().trim();

    // A filled honeypot means a bot. Answer as though it worked.
    if (website.trim()) {
      console.log(`Contact form honeypot tripped from ${clientIp(c)}`);
      return { ok: true };
    }

    const ip = clientIp(c);
    if (!(await withinLimit(c, ip, sender))) {
      throw new HttpError(429, 'You have sent several messages already. Please give us a little time to reply first.');
    }

    await c.db.contact_log.insertOne({ at: nowIso(), ip, email: sender });
    try {
      await emailService.sendContactMessage(c, name.trim(), sender, message.trim(), c.req.headers.get('x-lang') ?? 'hu');
    } catch (e) {
      console.error(`Contact message from ${sender} could not be delivered`, e);
      throw new HttpError(502, 'We could not send that just now. Please email us directly.');
    }
    return { ok: true };
  });
}
