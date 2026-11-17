// Bros Cafe · D · admin core: text lookup, API (same token and endpoints as the React dashboard), small UI helpers
// (toast, dialogs, tables) and the SVG chart kit. The tab files add themselves to BA.tabs. → window.BA
(() => {
  const B = window.BROS;
  const BA = (window.BA = { tabs: {}, order: [] });
  const lang = B.lang === 'en' ? 'en' : 'hu';
  const TX = window.BROS_ADMIN_TEXT;
  BA.lang = lang;
  BA.locale = lang === 'en' ? 'en-GB' : 'hu-HU';

  // ---------- text ----------
  const dig = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  /** T('admin.live.range', { low, high }). Falls back to Hungarian, then to the key. */
  BA.T = (path, vars) => {
    let v = dig(TX[lang], path);
    if (v == null) v = dig(TX.hu, path);
    if (v == null) return path;
    if (typeof v === 'string' && vars) v = v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? '' : vars[k]));
    return v;
  };
  const T = BA.T;
  BA.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = BA.esc;
  /** Text of a bilingual {hu,en} pair in the page language. */
  BA.pick = (pair) => (pair && (pair[lang] || pair.hu || pair.en)) || '';

  // ---------- formats ----------
  const nf = new Intl.NumberFormat('hu-HU');
  BA.ft = (n) => (n == null || Number.isNaN(Number(n)) ? '' : `${nf.format(Math.round(Number(n)))} Ft`);
  BA.k = (n) => (n == null ? '–' : `${Math.round(n / 1000)}k`);
  BA.num = (n) => (n == null ? '–' : typeof n === 'string' ? n : nf.format(n));
  BA.pct = (n) => (n == null ? '–' : `${nf.format(n)}%`);
  BA.signed = (n, digits = 1) => (n == null ? '–' : `${n >= 0 ? '+' : ''}${n.toLocaleString('hu-HU', { maximumFractionDigits: digits })}%`);
  BA.dateTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(BA.locale); };
  BA.shortDay = (iso, opts = { weekday: 'short', month: 'numeric', day: 'numeric' }) => new Date(iso).toLocaleDateString(BA.locale, opts);
  BA.clock = (iso) => new Date(iso).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Budapest' });
  BA.hourBudapest = (iso) => Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Budapest' }));
  BA.duration = (hours) => (hours == null ? '–' : hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours}h`);
  BA.size = (bytes) => (!bytes ? '' : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

  // ---------- API ----------
  const S = () => B.staff;
  /** Calls /api with the staff token. Throws an Error whose message is ready to show. FormData bodies pass through. */
  BA.api = async (path, { method = 'GET', body, params } = {}) => {
    const headers = { Accept: 'application/json' };
    const tok = S().token();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    let r;
    try { r = await fetch(`/api${path}${qs}`, { method, headers, body: payload }); } catch (e) {
      const err = new Error(T('x.offline')); err.status = 0; throw err;
    }
    let data = null;
    try { data = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) {
      if (r.status === 401) { try { localStorage.removeItem(S().KEY); } catch (e) { /* */ } S().toLogin(); }
      const err = new Error(S().message(data && data.detail, T('common.somethingWrong'))); err.status = r.status; err.detail = data && data.detail; throw err;
    }
    return data;
  };

  // ---------- toast ----------
  let toastTimer;
  BA.toast = (msg, bad) => {
    const el = document.getElementById('ad-toast');
    if (!el) return;
    el.textContent = msg; el.dataset.bad = bad ? '1' : ''; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, bad ? 6000 : 3200);
  };
  BA.fail = (e) => BA.toast(e && e.message ? e.message : T('common.somethingWrong'), true);

  // ---------- dialogs ----------
  /** A modal sheet. `html` is the body; `mount(dlg)` wires it. Returns the <dialog>. */
  BA.dialog = ({ title, html, wide, mount }) => {
    const dlg = document.createElement('dialog');
    dlg.className = `ad-dlg${wide ? ' ad-dlg--wide' : ''}`;
    dlg.innerHTML = `<div class="ad-dlg__head"><h2>${esc(title)}</h2><button type="button" class="ad-x" data-close aria-label="${esc(T('x.close'))}">×</button></div><div class="ad-dlg__body">${html}</div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    if (mount) mount(dlg);
    return dlg;
  };
  /** Text prompt in the page (window.prompt can be silenced by the browser). Resolves with the text, or null. */
  BA.ask = ({ title, label, placeholder = '', ok }) => new Promise((resolve) => {
    let answer = null;
    const dlg = BA.dialog({
      title,
      html: `<form class="ad-form"><label class="ad-f"><span>${esc(label)}</span><input name="a" autocomplete="off" placeholder="${esc(placeholder)}"></label>
        <div class="ad-row ad-row--end"><button type="button" class="ad-btn ad-btn--ghost" data-close>${esc(T('x.cancel'))}</button><button class="ad-btn">${esc(ok || T('x.ok'))}</button></div></form>`,
      mount: (d) => {
        d.querySelector('input').focus();
        d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); answer = d.querySelector('input').value; d.close(); });
      },
    });
    dlg.addEventListener('close', () => resolve(answer));
  });
  BA.confirm = ({ title, text, ok, danger }) => new Promise((resolve) => {
    let yes = false;
    const dlg = BA.dialog({
      title,
      html: `<p class="ad-p">${esc(text)}</p><div class="ad-row ad-row--end"><button type="button" class="ad-btn ad-btn--ghost" data-close>${esc(T('x.cancel'))}</button><button type="button" class="ad-btn${danger ? ' ad-btn--danger' : ''}" data-yes>${esc(ok || T('x.ok'))}</button></div>`,
      mount: (d) => d.querySelector('[data-yes]').addEventListener('click', () => { yes = true; d.close(); }),
    });
    dlg.addEventListener('close', () => resolve(yes));
  });

  // ---------- building blocks ----------
  BA.loading = () => `<p class="ad-wait" role="status"><span class="ad-spin" aria-hidden="true"></span><span class="ad-sr">${esc(T('x.loading'))}</span></p>`;
  BA.errorBox = (msg) => `<div class="ad-err" role="alert"><p>${esc(msg)}</p><button type="button" class="ad-btn ad-btn--ghost" data-retry>${esc(T('x.retry'))}</button></div>`;
  BA.card = (title, body, cls = '') => `<section class="ad-card ${cls}">${title ? `<h3 class="ad-card__t">${esc(title)}</h3>` : ''}${body}</section>`;
  BA.tile = (value, label, { hint, go, cls = '' } = {}) => {
    const inner = `<b class="ad-tile__v">${esc(value)}</b><span class="ad-tile__l">${esc(label)}</span>${hint ? `<em class="ad-tile__h">${esc(hint)}</em>` : ''}`;
    return go ? `<button type="button" class="ad-tile ad-tile--go ${cls}" data-go="${esc(go)}">${inner}</button>` : `<div class="ad-tile ${cls}">${inner}</div>`;
  };
  BA.tiles = (list, cols = 4) => `<div class="ad-tiles" style="--cols:${cols}">${list.join('')}</div>`;
  BA.progress = (v) => `<div class="ad-prog"><i style="width:${Math.max(0, Math.min(v, 1)) * 100}%"></i></div>`;
  BA.badge = (text, cls = '') => `<span class="ad-badge ${cls}">${esc(text)}</span>`;

  /** Run `fn` against a root element; the tab files use it so a failed load shows a retry instead of a blank page. */
  BA.load = async (root, loader, draw) => {
    root.innerHTML = BA.loading();
    try { const data = await loader(); if (!root.isConnected) return; draw(data); }
    catch (e) {
      if (!root.isConnected) return;
      root.innerHTML = BA.errorBox(e.message);
      root.querySelector('[data-retry]').addEventListener('click', () => BA.load(root, loader, draw));
    }
  };

  // ---------- charts: inline SVG, drawn at the real width and redrawn when it changes ----------
  /** Mount `draw(width)` (returns an SVG string) into `el`; tooltips come from data-tip on any element. */
  BA.chart = (el, draw) => {
    el.classList.add('ad-chart');
    el.innerHTML = '<div class="ad-chart__svg"></div><div class="ad-tip" hidden></div>';
    const holder = el.firstChild; const tip = el.lastChild;
    let w = 0;
    const paint = () => { const nw = Math.floor(el.clientWidth); if (nw < 40 || nw === w) return; w = nw; holder.innerHTML = draw(w); };
    paint();
    if (window.ResizeObserver) new ResizeObserver(paint).observe(el);
    const show = (e) => {
      const t = e.target.closest('[data-tip]');
      if (!t) { tip.hidden = true; return; }
      tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
      const box = el.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX - box.left, 70), box.width - 70);
      tip.style.left = `${x}px`; tip.style.top = `${Math.max(e.clientY - box.top - 34, 0)}px`;
    };
    el.addEventListener('pointermove', show);
    el.addEventListener('click', show);
    el.addEventListener('pointerleave', () => { tip.hidden = true; });
  };

  /** Top of the axis so that four equal steps land on round numbers. */
  const niceMax = (m) => {
    if (!(m > 0)) return 4;
    const raw = m / 4; const p = 10 ** Math.floor(Math.log10(raw)); const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p * 4;
  };
  /**
   * Cartesian chart. xs: labels. bars: [{ v: [..], cls, cell: (i) => cls }] (grouped). lines: [{ v: [..], cls, dots }].
   * hline: { v, label } a horizontal reference. tip(i) → text for column i. yFmt formats the axis.
   */
  BA.cartesian = (w, { h = 220, xs, bars = [], lines = [], hline, tip, yFmt = BA.k, xEvery = 1 }) => {
    const m = { t: 10, r: 10, b: 26, l: 40 };
    const iw = w - m.l - m.r; const ih = h - m.t - m.b; const n = xs.length;
    const all = [...bars.flatMap((b) => b.v), ...lines.flatMap((l) => l.v), hline ? hline.v : 0].filter((v) => v != null);
    const max = niceMax(Math.max(0, ...all) * 1.04);
    const y = (v) => m.t + ih - (v / max) * ih;
    const band = iw / Math.max(n, 1);
    let s = `<svg class="ad-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`;
    for (let g = 0; g <= 4; g += 1) {
      const gv = (max / 4) * g;
      s += `<line class="ad-grid" x1="${m.l}" x2="${w - m.r}" y1="${y(gv)}" y2="${y(gv)}"/><text class="ad-ax" x="${m.l - 6}" y="${y(gv) + 4}" text-anchor="end">${esc(yFmt(gv))}</text>`;
    }
    xs.forEach((lab, i) => { if (i % xEvery === 0) s += `<text class="ad-ax" x="${m.l + band * (i + 0.5)}" y="${h - 8}" text-anchor="middle">${esc(lab)}</text>`; });
    const bw = Math.min(band * 0.8 / Math.max(bars.length, 1), 34);
    bars.forEach((b, bi) => {
      b.v.forEach((v, i) => {
        if (v == null) return;
        const cls = (b.cell && b.cell(i)) || b.cls || '';
        const x = m.l + band * (i + 0.5) - (bw * bars.length) / 2 + bw * bi;
        s += `<rect class="ad-bar ${cls}" x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(m.t + ih - y(v), 0)}" rx="3"/>`;
      });
    });
    lines.forEach((l) => {
      const pts = l.v.map((v, i) => (v == null ? null : [m.l + band * (i + 0.5), y(v)]));
      let d = ''; let pen = false;
      pts.forEach((p) => { if (!p) { pen = false; return; } d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`; pen = true; });
      s += `<path class="ad-line ${l.cls || ''}" d="${d}" fill="none"/>`;
      if (l.dots) pts.forEach((p) => { if (p) s += `<circle class="ad-dot ${l.cls || ''}" cx="${p[0]}" cy="${p[1]}" r="3"/>`; });
    });
    if (hline) s += `<line class="ad-hline" x1="${m.l}" x2="${w - m.r}" y1="${y(hline.v)}" y2="${y(hline.v)}"/><text class="ad-hlabel" x="${w - m.r - 4}" y="${y(hline.v) - 5}" text-anchor="end">${esc(hline.label)}</text>`;
    if (tip) for (let i = 0; i < n; i += 1) s += `<rect class="ad-hit" data-tip="${esc(tip(i))}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}"/>`;
    return `${s}</svg>`;
  };

  // ---------- registry ----------
  /** BA.tab('live', { icon, link?: href, render(root, ctx) }) in tab order. */
  BA.tab = (id, def) => { BA.tabs[id] = def; BA.order.push(id); };
  BA.go = (tab) => { if (BA.navigate) BA.navigate(tab); };
})();
