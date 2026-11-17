// Password login for staff and admins, plus staff account management. Port of backend/app/routers/staff_auth.py.
import { HttpError, Invalid, email, str, type Router } from '../http';
import { createStaffToken, getCurrentUser, hashPassword, requireAdmin, verifyPassword } from '../security';
import { nowIso, uuid4 } from '../util';

const ROLES = ['staff', 'admin'];

export function register(api: Router) {
  api.post('/auth/login', async (c) => {
    const b = await c.json();
    const inv = new Invalid();
    const addr = email(b.email, 'email', inv);
    const password = str(b.password, 'password', inv);
    inv.throwIfAny();
    const user = await c.db.users.findOne({ email: addr.toLowerCase().trim() });
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Invalid email or password');
    return {
      token: await createStaffToken(c, user.id, user.email, user.role),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  });

  api.get('/auth/me', async (c) => {
    const user = await getCurrentUser(c);
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });

  api.post('/staff', async (c) => {
    await requireAdmin(c);
    const b = await c.json();
    const inv = new Invalid();
    const name = str(b.name, 'name', inv);
    const addr = email(b.email, 'email', inv);
    const password = str(b.password, 'password', inv);
    const role = b.role === undefined || b.role === null ? 'staff' : str(b.role, 'role', inv);
    inv.throwIfAny();
    const e = addr.toLowerCase().trim();
    if (await c.db.users.findOne({ email: e })) throw new HttpError(400, 'Email already exists');
    const doc = { id: uuid4(), name, email: e, password_hash: hashPassword(password), role: ROLES.includes(role) ? role : 'staff', created_at: nowIso() };
    await c.db.users.insertOne(doc);
    return { id: doc.id, name: doc.name, email: doc.email, role: doc.role };
  });

  api.get('/staff', async (c) => {
    await requireAdmin(c);
    return c.db.users.find({}, { projection: { password_hash: 0 }, limit: 500 });
  });
}
