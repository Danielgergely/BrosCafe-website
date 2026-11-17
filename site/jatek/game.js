// Bros Cafe · Üveg — Kávéfutam. Draws what the shared simulation says and sends the server the issued run
// and the ticks pressed on; the server replays them and decides the score. The leaderboard list is site.js's.
import { PLAYER_H, PLAYER_W, PLAYER_X, UNITS, WORLD_W } from './runnerSim.js';
import { createLoop } from './loop.js';

const $ = (s, r = document) => r.querySelector(s);
const B = window.BROS;
const t = B.t;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const num = (n) => Number(n).toLocaleString(B.locale);
const PLAY = B.en ? 'Play' : 'Játék'; // 'Játék' alone is the nav label ("Game") in i18n.js

// ---------- API: same calls and customer token as the React app ----------
const KEY = 'bros_customer_token';
const token = {
  get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } },
  drop() { try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } },
};
async function call(method, path, body) {
  const tk = token.get();
  const r = await fetch(`/api/${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
  if (!r.ok) {
    const err = new Error(r.status); err.status = r.status;
    if (typeof data?.detail === 'string') err.detail = data.detail;
    throw err;
  }
  return data;
}

// ---------- the page: play or get a card, own bests ----------
const el = {
  play: $('#g-play'), card: $('#g-card'), note: $('#g-note'), best: $('#g-best'),
  stage: $('#g-stage'), view: $('#g-view'), canvas: $('#g-canvas'), score: $('#g-score'), quit: $('#g-quit'),
  over: $('#g-over'), overTitle: $('#g-over-title'), overMsg: $('#g-over-msg'), again: $('#g-again'), close: $('#g-close'),
  pause: $('#g-pause'), getCard: $('#g-getcard'),
};
let member = false;
let busy = false;
const againLabel = () => (member ? PLAY : t('Még egy kör'));
const seed32 = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1; // runnerSim takes an unsigned 32-bit int

function toast(msg) {
  let box = $('.toast');
  if (!box) { box = document.createElement('div'); box.className = 'toast'; box.setAttribute('role', 'status'); document.body.append(box); }
  box.textContent = msg; box.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => box.classList.remove('show'), 3200);
}
function paint() {
  el.card.hidden = member;
  el.note.textContent = member
    ? t('Koppints vagy nyomd meg a szóközt az ugráshoz. Ugrás közben még egyszer, és magasabbra jutsz.')
    : t('Gyakorló futam: a pontodat nem mentjük el. A ranglistához hűségkártya kell.');
  if (!member) el.best.hidden = true;
}
async function loadBest() {
  if (!member) return;
  try {
    const best = await call('GET', 'game/me');
    el.best.innerHTML = [['week', 'Hét'], ['month', 'Hónap'], ['year', 'Év'], ['all', 'Mindenkori']]
      .map(([k, label]) => `<li><b>${num(best[k] ?? 0)}</b><span>${t(label)}</span></li>`).join('');
    el.best.hidden = false;
  } catch (e) { /* the tiles stay as they were */ }
}
const reloadBoard = () => $('#periods .chip[aria-pressed="true"]')?.click();

async function init() {
  if (token.get()) {
    try {
      const me = await call('GET', 'customer/me');
      if (me?.session_token) token.set(me.session_token); // sliding session, as in the React app
      member = true;
    } catch (e) { if (e.status) token.drop(); }
  }
  paint();
  loadBest();
}

// ---------- drawing: an evening scene (Üveg). Colours come from glass.css; geometry is the simulation's ----------
const W = WORLD_W, H = 300, GROUND = H - 46;
const ctx = el.canvas.getContext('2d', { alpha: false });
const css = getComputedStyle(document.documentElement);
const tok = (n, fallback) => css.getPropertyValue(n).trim() || fallback;
const rgba = (triple, a) => `rgba(${triple.trim().split(/[\s,]+/).join(',')},${a})`;
const IVORY = tok('--ivory-rgb', '243 235 221'), CHAMP = tok('--champagne-rgb', '198 168 117'), GLOW = tok('--g-game-glow', '255 214 150');
const C = {
  skyTop: tok('--g-game-sky-top', '#17170F'), skyMid: tok('--espresso', '#25251C'), skyLow: tok('--g-game-sky-low', '#3E4429'),
  ground: tok('--g-game-ground', '#1C1C14'), ink: tok('--espresso', '#25251C'), dark: tok('--espresso-3', '#3A382E'),
  ivory: tok('--ivory', '#F3EBDD'), ivoryHi: tok('--ivory-hi', '#FAF6EE'), champagne: tok('--champagne', '#C6A875'), champagneHi: tok('--champagne-hi', '#DCC69C'),
  taupe: tok('--taupe', '#BDAA96'), olive: tok('--olive', '#68704B'), oliveDark: tok('--olive-dark', '#596040'),
  rim: rgba(IVORY, .6),
};
// far hills: [x, rx, ry, colour triple, parallax, alpha]
const HILLS = [[120, 210, 70, CHAMP, .12, .1], [520, 150, 46, IVORY, .12, .06], [860, 260, 86, CHAMP, .12, .08], [1260, 170, 54, IVORY, .12, .07], [300, 120, 30, CHAMP, .3, .16], [980, 150, 36, CHAMP, .3, .14]];
const BULBS = [[812, 64, 9, 96], [236, 40, 5, 54], [498, 58, 4, 44]]; // [x, y, bulb radius, glow radius]: decoration only
const SPAN = W + 700;
let sky = null, glows = [];

function size() {
  const w = el.canvas.clientWidth;
  if (!w) return;
  const k = (Math.min(window.devicePixelRatio || 1, 2) * w) / W;
  el.canvas.width = Math.round(W * k);
  el.canvas.height = Math.round(H * k);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, C.skyTop); sky.addColorStop(.55, C.skyMid); sky.addColorStop(1, C.skyLow);
  glows = BULBS.map(([x, y, r, R]) => {
    const g = ctx.createRadialGradient(x, y, r * .6, x, y, R);
    g.addColorStop(0, rgba(GLOW, .5)); g.addColorStop(.35, rgba(GLOW, .16)); g.addColorStop(1, rgba(GLOW, 0));
    return g;
  });
}
// a lit shape: its fill and a fine light rim (no ink outline)
const lit = (fill, lw = 1, rim = C.rim) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = lw; ctx.stroke(); };
const box = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
const poly = (...p) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); };

// The shapes fill their physics box (width, height, base), so what you see is what you hit.
function obstacle(x, w, h, base, kind) {
  const top = GROUND - base - h, mid = x + w / 2;
  if (kind === 0) { // bean
    ctx.beginPath(); ctx.ellipse(mid, top + h / 2, w / 2 - 1, h / 2 - 1, 0, 0, 6.2832); lit(C.champagne, 1, C.champagneHi);
    ctx.beginPath(); ctx.moveTo(mid + 2, top + 5); ctx.quadraticCurveTo(mid - 7, top + h / 2, mid + 2, top + h - 5);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
  } else if (kind === 1) { // portafilter, standing on its handle
    box(mid - 4, top + 14, 8, h - 14, 3); lit(C.taupe);
    box(x + 1, top + 1, w - 2, 16, 4); lit(C.ivory, 1, C.ivoryHi);
    ctx.fillStyle = C.champagne; ctx.fillRect(x + 5, top + 5, w - 10, 3);
  } else if (kind === 2) { // sack
    ctx.beginPath(); ctx.moveTo(x + 1, GROUND); ctx.lineTo(x + 7, top + 6); ctx.quadraticCurveTo(mid, top - 3, x + w - 7, top + 6); ctx.lineTo(x + w - 1, GROUND); ctx.closePath(); lit(C.taupe, 1, C.champagneHi);
    box(x + 19, top + 13, w - 38, 10, 2); lit(C.ivoryHi, 1, rgba(IVORY, 0));
  } else if (kind === 3) { // grinder
    poly(x + 1, top + 1, x + w - 1, top + 1, x + w - 7, top + 22, x + 7, top + 22); lit(rgba(IVORY, .28));
    box(x + 4, top + 22, w - 8, h - 30, 4); lit(C.olive, 1, rgba(IVORY, .5));
    box(x + 1, GROUND - 9, w - 2, 9, 2); lit(C.dark, 1, rgba(CHAMP, .7));
    ctx.beginPath(); ctx.arc(mid, top + 38, 5, 0, 6.2832); lit(C.champagneHi, 1, C.ivoryHi);
  } else { // a shelf of cups overhead: run under it
    for (let i = 0; i < 3; i += 1) {
      const cx = x + 10 + i * ((w - 20) / 2);
      ctx.fillStyle = rgba(IVORY, .7); ctx.fillRect(cx - 1, top + 8, 2, 8);
      poly(cx - 7, top + 15, cx + 7, top + 15, cx + 5, top + h - 1, cx - 5, top + h - 1); lit(C.ivory, 1, C.ivoryHi);
      ctx.fillStyle = C.champagne; ctx.fillRect(cx - 6, top + 16, 12, 3);
    }
    box(x + 1, top + 1, w - 2, 9, 2); lit(C.taupe, 1, C.champagneHi);
  }
}

function cup(py, boost, dead) {
  const x = PLAYER_X, w = PLAYER_W, h = PLAYER_H, lift = GROUND - PLAYER_H - py;
  ctx.fillStyle = '#000'; ctx.globalAlpha = .34;
  ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND + 6, Math.max(6, 17 - lift / 9), 3, 0, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.save();
  if (dead) {
    if (!calm) { ctx.translate(x + w / 2, py + h); ctx.rotate(.26); ctx.translate(-(x + w / 2), -(py + h)); }
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) { const r = i % 2 ? 9 : 19, a = (i * Math.PI) / 8; ctx.lineTo(x + w + 6 + Math.cos(a) * r, py + 14 + Math.sin(a) * r); }
    ctx.closePath(); lit(rgba(GLOW, .3), 1, C.champagneHi);
  }
  ctx.beginPath(); ctx.arc(x + w - 2, py + 21, 8, -1.2, 1.2); ctx.strokeStyle = C.ivory; ctx.lineWidth = 3; ctx.stroke(); // handle
  poly(x + 1, py + 5, x + w - 1, py + 5, x + w - 5, py + h - 1, x + 5, py + h - 1); lit(C.ivoryHi, 1, '#fff');
  poly(x + 2.6, py + 15, x + w - 2.6, py + 15, x + w - 4, py + 29, x + 4, py + 29); ctx.fillStyle = C.oliveDark; ctx.fill(); // sleeve
  box(x - 1, py + 1, w + 2, 7, 3); lit(C.champagne, 1, C.champagneHi); // lid
  ctx.fillStyle = C.ivoryHi; ctx.fillRect(x + 11, py + 20, 3, 4); ctx.fillRect(x + 21, py + 20, 3, 4);
  if (boost) { // steam: the mid-air boost is still in hand
    ctx.beginPath(); ctx.moveTo(x + 12, py - 4); ctx.quadraticCurveTo(x + 21, py - 12, x + 14, py - 21);
    ctx.strokeStyle = rgba(IVORY, .75); ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}

function draw(s, a) {
  const dist = calm ? 0 : s.distance + s.speed * a; // scenery scroll is decoration
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  BULBS.forEach(([x, y, r, R], i) => { // hanging bulbs: a warm glow, a cord, the bulb
    ctx.fillStyle = glows[i]; ctx.fillRect(x - R, Math.max(0, y - R), R * 2, R * 2);
    ctx.fillStyle = rgba(IVORY, .28); ctx.fillRect(x - .5, 0, 1, y - r);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = rgba(GLOW, .95); ctx.fill();
  });
  for (const [x0, rx, ry, col, f, alpha] of HILLS) {
    const x = ((((x0 - dist * f) % SPAN) + SPAN) % SPAN) - 350;
    if (x - rx > W || x + rx < 0) continue;
    ctx.beginPath(); ctx.ellipse(x, GROUND, rx, ry, 0, Math.PI, 0);
    ctx.fillStyle = rgba(col, alpha); ctx.fill(); ctx.strokeStyle = rgba(IVORY, .14); ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.fillStyle = C.ground; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = rgba(CHAMP, .75); ctx.fillRect(0, GROUND, W, 1.5);
  ctx.fillStyle = rgba(CHAMP, .3);
  for (let x = -(dist % 88); x < W; x += 88) ctx.fillRect(x, GROUND + 14, 18, 1.5);

  const lead = s.speed * a; // between two ticks, draw where things are heading
  for (const [ox, ow, oh, base, kind] of s.obstacles) obstacle(ox - lead, ow, oh, base, kind);
  const y = Math.max(0, s.y > 0 ? s.y + s.vy * a : 0);
  cup(GROUND - PLAYER_H - Math.floor(y / UNITS), s.y > 0 && !s.boosted && s.vy > 0, s.dead);
}

// ---------- the run ----------
let cur = null; // { id, loop }
let phase = 'idle'; // idle | play | paused | over
let raf = 0, last = 0, shown = -1;

function setScore(n) { if (n !== shown) { shown = n; el.score.textContent = num(n); } }
function frame(now) {
  if (phase !== 'play') return;
  const loop = cur.loop;
  loop.advance(now - last);
  last = now;
  const done = loop.done();
  draw(loop.state, done ? 0 : loop.alpha());
  setScore(loop.state.distance);
  if (done) return finish();
  raf = requestAnimationFrame(frame);
}
function go() { phase = 'play'; last = performance.now(); raf = requestAnimationFrame(frame); }

function open(run) {
  cur = { id: run.run_id, practice: !member, loop: createLoop(run.seed) };
  el.over.hidden = true; el.pause.hidden = true;
  if (!el.stage.open) el.stage.showModal();
  el.view.focus({ preventScroll: true });
  size(); setScore(0); draw(cur.loop.state, 0);
  go();
}
function quit() {
  phase = 'idle'; cur = null;
  cancelAnimationFrame(raf);
  if (el.stage.open) el.stage.close();
}
function setBusy(on) {
  busy = on;
  for (const b of [el.play, el.again]) { b.disabled = on; b.lastElementChild.textContent = on ? t('Indul…') : (b === el.again ? againLabel() : PLAY); }
}
// the server's own error texts are English: show ours instead
const runError = (e, fallback) => (e.status === 429 ? t('Ez most sok futam volt egy órán belül. Tarts egy kis szünetet, és próbáld újra később.')
  : e.status === 410 ? t('Ez a futam lejárt. Kezdj egy újat.') : fallback);
async function start() {
  if (busy) return;
  if (!member) { open({ run_id: null, seed: seed32() }); return; } // practice: nothing goes to the server
  setBusy(true);
  try {
    open(await call('POST', 'game/start', {}));
  } catch (e) {
    if (e.status === 401) { token.drop(); member = false; quit(); paint(); } // the session ran out
    else {
      const msg = runError(e, t('Valami félrement. Próbáld meg újra.'));
      if (el.stage.open) el.overMsg.textContent = msg; else toast(msg);
    }
  } finally { setBusy(false); }
}
async function finish() {
  const { id, loop, practice } = cur;
  phase = 'over';
  el.getCard.hidden = !practice;
  el.again.lastElementChild.textContent = againLabel();
  if (practice) {
    el.overTitle.textContent = t('{n} — szép futam.', { n: num(loop.state.distance) });
    el.overMsg.textContent = t('Szerezz hűségkártyát, és a pontod felkerül a ranglistára');
    el.again.disabled = false; el.over.hidden = false;
    const c = cur; setTimeout(() => { if (cur === c && phase === 'over') el.again.focus(); }, 450);
    return;
  }
  el.overTitle.textContent = t('Ennyi volt — próbáld újra.');
  el.overMsg.innerHTML = `<i class="spinner" aria-hidden="true"></i> ${t('Számoljuk a futamot…')}`;
  el.again.disabled = true;
  el.over.hidden = false;
  let msg;
  try {
    const res = await call('POST', 'game/finish', { run_id: id, jumps: loop.jumps });
    if (cur?.id === id) setScore(res.score);
    msg = t('{n} — szép futam.', { n: num(res.score) });
  } catch (e) { msg = runError(e, t('Ezt a futamot nem tudtuk beszámítani. Próbáld újra.')); }
  if (cur?.id === id) {
    el.overMsg.textContent = msg;
    el.again.disabled = false;
    setTimeout(() => { if (cur?.id === id && phase === 'over') el.again.focus(); }, 450); // not under a thumb still mashing
  }
  reloadBoard();
  loadBest();
}
function pause() { if (phase !== 'play') return; phase = 'paused'; cancelAnimationFrame(raf); el.pause.hidden = false; }
function resume() { if (phase !== 'paused') return; el.pause.hidden = true; go(); }
function press() { if (phase === 'play') cur.loop.press(); else if (phase === 'paused') resume(); else return false; return true; }

el.play.addEventListener('click', start);
el.again.addEventListener('click', start);
el.quit.addEventListener('click', quit);
el.close.addEventListener('click', quit);
el.stage.addEventListener('cancel', (e) => { e.preventDefault(); quit(); });
el.stage.addEventListener('contextmenu', (e) => e.preventDefault());
el.stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  e.preventDefault();
  press();
});
addEventListener('keydown', (e) => {
  if (!el.stage.open || !(e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter')) return;
  if (press()) e.preventDefault();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pagehide', pause);
addEventListener('resize', () => { if (el.stage.open && cur) { size(); draw(cur.loop.state, 0); } });

init();
