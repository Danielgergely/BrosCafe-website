// Bros Cafe on Cloudflare: the API that replaces backend/ (FastAPI + MongoDB) plus the static site in site/.
// /api/* goes to the routes below; everything else is a static page, with the headers nginx used to add.
import { database } from './db';
import type { Env } from './env';
import { errorResponse, json, Router, type Ctx } from './http';
import { settings } from './config';
import { routes } from './routes';
import { scheduled } from './jobs';

const api = new Router('/api');
for (const register of routes) register(api);

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function withHeaders(res: Response, extra: Record<string, string>) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
  return out;
}

/** CORS as the Python app had it: credentials off, any method and header, origins from CORS_ORIGINS. */
function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin) return {};
  const allowed = settings(env).cors_origins;
  if (allowed.includes('*') || !allowed.length) return { 'Access-Control-Allow-Origin': '*' };
  return allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

async function handleApi(req: Request, env: Env, exec: ExecutionContext, url: URL) {
  const corsHeaders = cors(req, env);
  if (req.method === 'OPTIONS' && req.headers.get('Access-Control-Request-Method')) {
    if (!corsHeaders['Access-Control-Allow-Origin']) return new Response('Disallowed CORS origin', { status: 400 });
    return new Response('OK', {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT',
        'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') ?? '*',
        'Access-Control-Max-Age': '600',
      },
    });
  }
  const found = api.match(req.method, url.pathname);
  let res: Response;
  if (!found) res = json({ detail: 'Not Found' }, 404);
  else if (found === 'method') res = json({ detail: 'Method Not Allowed' }, 405);
  else {
    let body: Promise<any> | undefined;
    const c: Ctx = {
      req, env, url, exec,
      db: database(env.DB),
      params: found.params,
      query: url.searchParams,
      later: (p) => exec.waitUntil(p.catch((e) => console.error('background task failed', e))),
      json: () =>
        (body ??= req.text().then((t) => {
          if (!t.trim()) return {};
          try {
            return JSON.parse(t);
          } catch {
            return Promise.reject(Object.assign(new Error('bad json'), { badJson: true }));
          }
        })),
    };
    try {
      const out = await found.handler(c);
      res = out instanceof Response ? out : out === undefined ? new Response(null, { status: 200 }) : json(out);
    } catch (e) {
      res = (e as { badJson?: boolean }).badJson
        ? json({ detail: [{ type: 'json_invalid', loc: ['body'], msg: 'JSON decode error' }] }, 422)
        : errorResponse(e);
    }
  }
  return withHeaders(res, { ...SECURITY_HEADERS, ...corsHeaders, ...(isPreview(env) ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) });
}

/** Preview only (PREVIEW=1): blocked from search engines. */
const isPreview = (env: Env) => env.PREVIEW === '1';

const redirect = (to: string, url: URL) => new Response(null, { status: 301, headers: { Location: to + url.search } });

/** Old React-site URLs (and emailed / widget links) -> the static site. Query string always kept. */
function legacyRedirect(url: URL): Response | null {
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const exact: Record<string, string> = {
    '/menu': '/etlap/', '/shop': '/etlap/', '/whats-new': '/ujdonsagok/', '/contact': '/kapcsolat/', '/loyalty': '/husegkartya/',
    '/account': '/fiok/', '/login': '/belepes/', '/staff': '/pult/', '/game': '/jatek/', '/privacy': '/adatvedelem/', '/help': '/segitseg/',
    '/admin': '/admin/',
  };
  if (exact[p] && exact[p] !== url.pathname) return redirect(exact[p], url);
  if (/^\/menu\/[^/]+$/.test(p)) return redirect('/etlap/', url);
  const hash = (id: string) => `#${id}`;
  let m = p.match(/^\/product\/([^/]+)$/);
  if (m) return new Response(null, { status: 301, headers: { Location: `/etlap/${url.search}${hash(m[1])}` } });
  m = p.match(/^\/journal\/([^/]+)$/);
  if (m) return new Response(null, { status: 301, headers: { Location: `/ujdonsagok/${url.search}${hash(m[1])}` } });
  return null;
}

async function handleAssets(req: Request, env: Env, url: URL) {
  const p = url.pathname;
  if (isPreview(env) && p === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
  const moved = legacyRedirect(url);
  if (moved) return moved;
  // The static-asset layer would 307 /auth/verify to /auth/verify/ and the token would be lost with it: rewrite instead.
  // /card/<code> is the card page linked from every Wallet pass: one static page, the code is read client-side.
  if (p === '/auth/verify') req = new Request(new URL('/auth/verify/' + url.search, url), req);
  else if (/^\/card\/[^/.]+\/?$/.test(p) && p !== '/card/') req = new Request(new URL('/card/', url), req);
  let res = await env.ASSETS.fetch(req);
  // Static assets ignore Range requests, and Safari will not play a video without them: answer them here.
  const range = req.headers.get('Range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && res.status === 200 && /\.(mp4|webm|mov)$/i.test(p)) {
    const body = new Uint8Array(await res.arrayBuffer());
    const size = body.length;
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
    start = Math.max(0, start);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    res = new Response(body.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) },
    });
  }
  if (isPreview(env)) {
    res = withHeaders(res, { 'X-Robots-Tag': 'noindex, nofollow' });
  }
  const cache: Record<string, string> = p === '/' || p === '/index.html' || !/\.[a-z0-9]+$/i.test(p) ? { 'Cache-Control': 'no-store, must-revalidate' } : {};
  return withHeaders(res, { ...SECURITY_HEADERS, ...cache });
}

export default {
  async fetch(req, env, exec): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(req, env, exec, url);
    return handleAssets(req, env, url);
  },
  scheduled,
} satisfies ExportedHandler<Env>;
