// Anonymous funnel tracking from the front end. Port of backend/app/routers/track.py.
import { HttpError, Invalid, optStr, str, type Router } from '../http';
import { TRACKED_EVENTS, parseUserAgent } from '../services/analytics';
import { nowIso, uuid4 } from '../util';

export function register(api: Router) {
  api.post('/track', async (c) => {
    const b = await c.json();
    const inv = new Invalid();
    const type = str(b.type, 'type', inv);
    const sessionId = str(b.session_id, 'session_id', inv);
    const code = optStr(b.code, 'code', inv);
    const src = optStr(b.src, 'src', inv);
    inv.throwIfAny();
    if (!TRACKED_EVENTS.has(type)) throw new HttpError(400, 'Unknown event type');
    const [device, browser] = parseUserAgent(c.req.headers.get('user-agent') ?? '');
    await c.db.analytics_events.insertOne({
      id: uuid4(), type, session_id: sessionId,
      code, src: src || 'direct',
      device, browser,
      at: nowIso(),
    });
    return { ok: true };
  });
}
