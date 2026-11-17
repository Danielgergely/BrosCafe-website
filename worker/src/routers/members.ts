// Public member lookup and registration. Port of backend/app/routers/members.py.
import { HttpError, Invalid, email, str, type Router } from '../http';
import * as members from '../services/members';

export function register(api: Router) {
  api.post('/members', async (c) => {
    const b = (await c.json()) ?? {};
    const inv = new Invalid();
    const name = str(b.name, 'name', inv);
    const addr = email(b.email, 'email', inv);
    inv.throwIfAny();
    const e = addr.toLowerCase().trim();
    const existing = await c.db.members.findOne({ email: e });
    if (existing) return members.publicView(c, existing);
    return members.publicView(c, await members.create(c, name, e));
  });

  api.get('/find-card', async (c) => {
    const q = c.query.get('email');
    if (q === null) throw new HttpError(422, [{ loc: ['query', 'email'], msg: 'Field required', type: 'missing' }]);
    const doc = await c.db.members.findOne({ email: q.toLowerCase().trim() });
    if (!doc) throw new HttpError(404, 'No loyalty card found for that email');
    return members.publicView(c, doc);
  });

  api.get('/members/{code}', async (c) => {
    const doc = await c.db.members.findOne({ code: c.params.code });
    if (!doc) throw new HttpError(404, 'Loyalty card not found');
    return members.publicView(c, doc);
  });
}
