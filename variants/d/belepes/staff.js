// Bros Cafe · D — the staff session (login, scanner, admin). Same API and storage key as the React app:
// POST /api/auth/login, GET /api/auth/me, the token in localStorage under bros_staff_token. → window.BROS.staff
(() => {
  const B = window.BROS || (window.BROS = {});
  const t = B.t || ((s) => s);
  const KEY = 'bros_staff_token';
  const LOGIN = '/d/belepes/', PULT = '/d/pult/', ADMIN = '/d/admin/';

  const token = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const keep = (v) => { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: the session ends with the page */ } };
  const drop = () => { try { localStorage.removeItem(KEY); } catch (e) { /* */ } };

  // The API answers in English; the counter reads Hungarian (i18n.js turns these back for EN).
  const DETAIL = {
    'Invalid email or password': 'Hibás e-mail vagy jelszó',
    'Customer not found': 'Nincs ilyen kártya',
    'Unknown drink': 'Ismeretlen ital',
    'Reward is ready — redeem the free coffee first': 'Megvan a jutalom — előbb az ingyen kávét kell beváltani',
    'No reward available to redeem': 'Nincs beváltható jutalom',
    'No free coffee banked': 'Nincs ingyen kávé a fiókban',
    'This member has no opening gift': 'Ennek a vendégnek nincs nyitónapi ajándéka',
    'Opening offer already redeemed': 'A nyitónapi ajándékot már átvette',
    'Session expired': 'Lejárt a belépésed — lépj be újra',
    'Admin access required': 'Ehhez admin jogosultság kell',
  };
  /** Any FastAPI error shape as one sentence (lib/api.js formatError). */
  function message(detail, fallback) {
    if (detail == null) return t(fallback);
    if (typeof detail === 'string') return t(DETAIL[detail] || detail);
    if (Array.isArray(detail)) return detail.map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).join(' ');
    return typeof detail.msg === 'string' ? detail.msg : String(detail);
  }

  const safeFrom = (v) => (typeof v === 'string' && /^\/d\/(admin|pult)(\/|\?|$)/.test(v) ? v : null);
  /** Back to the page that sent them here, if it is one their role may open. */
  function landing(role, from) {
    from = safeFrom(from);
    if (from && from.startsWith('/d/admin') && role === 'admin') return from;
    if (from && from.startsWith('/d/pult')) return from;
    return role === 'admin' ? ADMIN : PULT;
  }
  function toLogin() {
    const here = safeFrom(location.pathname + location.search);
    location.replace(LOGIN + (here ? `?from=${encodeURIComponent(here)}` : ''));
    return new Promise(() => {}); // the page is leaving
  }

  /** fetch with the staff token. Throws an Error with .message ready to show, .status and .detail. */
  async function api(path, { method = 'GET', body, fallback = 'Valami félrement. Próbáld meg újra.', timeout = 15000 } = {}) {
    const headers = { Accept: 'application/json' };
    const tok = token();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let r;
    try {
      r = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined });
    } catch (e) {
      const err = new Error(t('Nincs kapcsolat. Nézd meg a wifit, és próbáld újra.')); err.status = 0; throw err;
    }
    let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) {
      const err = new Error(message(data && data.detail, fallback)); err.status = r.status; err.detail = data && data.detail;
      // a dead session mid-shift: back to the login, then straight back here
      if (r.status === 401 && path !== '/auth/login') { drop(); toLogin(); }
      throw err;
    }
    return data;
  }

  async function signIn(email, password) {
    const data = await api('/auth/login', { method: 'POST', body: { email, password }, fallback: 'A belépés nem sikerült' });
    keep(data.token);
    return data.user;
  }
  function signOut() { drop(); location.replace(LOGIN); }
  /** The signed-in user, or false. A network failure throws instead of signing anyone out. */
  async function me() {
    if (!token()) return false;
    try { return await api('/auth/me'); } catch (e) { if (e.status === 0) throw e; drop(); return false; }
  }
  /** For staff pages: resolves with the user, or leaves for the login (or the scanner, if admin is needed). */
  async function guard({ adminOnly = false } = {}) {
    if (!token()) return toLogin();
    const user = await api('/auth/me');
    if (adminOnly && user.role !== 'admin') { location.replace(PULT); return new Promise(() => {}); }
    return user;
  }

  B.staff = { KEY, token, api, message, signIn, signOut, me, guard, landing, toLogin };
})();
