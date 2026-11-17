// Bros Cafe · D · Kollázs — the shell: one header, one bottom tab bar, the "Extrák" and "Több" sheets, on every page.
// Include as the first thing in <body>, after /i18n.js in <head>. Contract: /SHELL.md
(() => {
  const B = window.BROS || (window.BROS = { lang: 'hu', en: false, mount() {} });
  const en = B.lang === 'en';
  const t = B.t || ((s) => s);

  // ---------- customer session, analytics consent, tracking: same storage keys and rules as the React app ----------
  const ls = {
    get(k, s = localStorage) { try { return s.getItem(k); } catch (e) { return null; } },
    set(k, v, s = localStorage) { try { s.setItem(k, v); } catch (e) { /* private mode */ } },
    del(k, s = localStorage) { try { s.removeItem(k); } catch (e) { /* private mode */ } },
  };
  const TOKEN = 'bros_customer_token', EXPIRED = 'bros-expired', CHECKED = 'bros-me';
  let meCall = null;
  const customer = {
    token: () => ls.get(TOKEN),
    set(token) { ls.set(TOKEN, token); ls.del(EXPIRED, sessionStorage); },
    signOut() { ls.del(TOKEN); ls.del(EXPIRED, sessionStorage); ls.del(CHECKED, sessionStorage); meCall = null; },
    // true once: a stored session was rejected (not just absent), so the sign-in form can say why
    expired: () => ls.get(EXPIRED, sessionStorage) === '1',
    // GET /api/customer/me -> the member, or null for a guest. Every answer carries a renewed token (sliding session).
    // A rejected token signs out; a network failure throws and keeps the session.
    me(force) {
      const token = customer.token();
      if (!token) return Promise.resolve(null);
      if (meCall && !force) return meCall;
      const call = meCall = fetch('/api/customer/me', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }).then(async (r) => {
        if (!r.ok) { ls.del(TOKEN); ls.set(EXPIRED, '1', sessionStorage); return null; }
        const { session_token: fresh, ...member } = await r.json();
        if (fresh && customer.token()) ls.set(TOKEN, fresh);
        ls.set(CHECKED, '1', sessionStorage);
        return member;
      });
      call.catch(() => { if (meCall === call) meCall = null; });
      return call;
    },
  };
  const signedIn = !!customer.token();
  // a signed-in visitor has no use for the sign-up page
  if (signedIn && document.body.dataset.page === 'husegkartya') { document.documentElement.style.visibility = 'hidden'; location.replace('/fiok/'); }

  const CONSENT = 'bros-consent', SESSION = 'bros_session';
  const consent = {
    read() { const v = ls.get(CONSENT); return v === 'granted' || v === 'denied' ? v : null; },
    // declining also drops the identifier already created
    set(v) { ls.set(CONSENT, v); if (v === 'denied') ls.del(SESSION); window.dispatchEvent(new Event('bros-consent-change')); },
  };
  // Fire-and-forget funnel event (POST /api/track). Does nothing, and creates no session id, without consent.
  const track = (type, extra = {}) => {
    try {
      if (consent.read() !== 'granted') return;
      let id = ls.get(SESSION);
      if (!id) { id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set(SESSION, id); }
      fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, session_id: id, ...extra }) }).catch(() => {});
    } catch (e) { /* never in the way */ }
  };

  // The single nav config. One line per entry; the header, the tab bar, the sheets and the footer are all built from it.
  //   tab: true      -> its own tab on phones (keep to 3 with Főoldal)
  //   extra: true    -> one of the extras: always a top-level link on desktop, a big photo card in the phone "Extrák" sheet
  //                     (needs img, wash, line, tease, go; those texts are keys in i18n.js)
  //   isNew: true    -> the small "Új" badge
  //   short          -> shorter label for the tab bar and the desktop row
  //   desktop: false -> not in the desktop link row (the logo already goes home)
  //   everything else goes into "Több" on phones
  const NAV = [
    { id: 'home', href: '/', hu: 'Főoldal', en: 'Home', icon: 'home', tab: true, desktop: false },
    { id: 'etlap', href: '/etlap/', hu: 'Étlap', en: 'Menu', icon: 'cup', tab: true },
    { id: 'husegkartya', href: signedIn ? '/fiok/' : '/husegkartya/', hu: 'Hűségkártya', en: 'Loyalty card', short: { hu: 'Kártya', en: 'Card' }, icon: 'card', tab: true },
    { id: 'after-hours', href: '/after-hours/', hu: 'Bros After Hours', en: 'Bros After Hours', short: { hu: 'After Hours', en: 'After Hours' }, icon: 'moon', extra: true, isNew: true,
      img: '/shared/media/after-hours-lounge-evening-4x5', wash: 'blush', line: 'Privát kávézó különleges alkalmakra — 14 900 Ft-tól', tease: 'privát este', go: 'Estét választok' },
    { id: 'delivery', href: '/delivery/', hu: 'Bros Delivery', en: 'Bros Delivery', short: { hu: 'Delivery', en: 'Delivery' }, icon: 'box', extra: true, isNew: true,
      img: '/shared/media/delivery-paper-cup-handwritten-4x5', wash: 'glow', line: 'Kávé az irodába — 5 italtól ingyen kiszállítás', tease: 'kávé az irodába', go: 'Rendelek' },
    { id: 'ujdonsagok', href: '/ujdonsagok/', hu: 'Újdonságok', en: 'What’s new', icon: 'spark' },
    { id: 'jatek', href: '/jatek/', hu: 'Játék', en: 'Game', icon: 'game' },
    { id: 'kapcsolat', href: '/kapcsolat/', hu: 'Kapcsolat', en: 'Contact', icon: 'pin' },
  ];

  const ICONS = {
    home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5"/>',
    card: '<rect x="3" y="5.75" width="18" height="12.5" rx="2.5"/><circle cx="8" cy="12" r="1.7"/><path d="M12.5 10.25h5M12.5 13.75h3.5"/>',
    game: '<path d="M7.5 8h9a4.5 4.5 0 0 1 4.4 5.4l-.5 2.4a2.6 2.6 0 0 1-4.6 1L14.5 15h-5l-1.3 1.8a2.6 2.6 0 0 1-4.6-1l-.5-2.4A4.5 4.5 0 0 1 7.5 8z"/><path d="M8 10.25v3M6.5 11.75h3M15.75 11.75h.01"/>',
    spark: '<path d="m11 4 1.8 4.7 4.7 1.8-4.7 1.8L11 17l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M18 15v4M16 17h4"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    box: '<path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z"/><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"/>',
    plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    dot: '<circle cx="12" cy="12" r="3"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
    exit: '<path d="M14 4.5h3.500a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10.500 8 6.500 12l4 4M6.500 12h9"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.dot}</svg>`;

  const L = (hu, e) => (en ? e : hu);
  const label = (n, short) => { const s = short && n.short; return s ? s[B.lang] || s.hu : n[B.lang] || n.hu; };
  const page = document.body.dataset.page || '';
  const navPage = page === 'fiok' || page === 'card' ? 'husegkartya' : page; // the account and the card page belong to the card tab
  const cur = (n) => (n.id === navPage ? ' aria-current="page"' : '');
  const tabs = NAV.filter((n) => n.tab);
  const extras = NAV.filter((n) => n.extra);
  const more = NAV.filter((n) => !n.tab && !n.extra);
  const inMore = more.some((n) => n.id === page), inExtra = extras.some((n) => n.id === page);
  const badge = (n) => (n.isNew ? ` <span class="new">${L('Új', 'New')}</span>` : '');
  const sheetHead = (id, title) => `<div class="sheet__grab"><div class="sheet__head"><h2 class="sheet__title" id="${id}">${title}</h2><button class="sheet__close" type="button" aria-label="${L('Bezárás', 'Close')}">${icon('close')}</button></div></div>`;
  const opener = (cls, target, text, on, lead = '') => `<button class="${cls}${on ? ' is-active' : ''}" type="button" data-sheet="${target}" aria-haspopup="dialog" aria-expanded="false" aria-controls="${target}">${lead}${text}</button>`;

  document.body.insertAdjacentHTML('afterbegin', `
<a class="skip" href="#tartalom">${L('Ugrás a tartalomra', 'Skip to content')}</a>
<header class="site-header" id="site-header">
  <div class="site-header__row">
    <a class="brand" href="/"${page === 'home' ? ' aria-current="page"' : ''} aria-label="${L('Bros Cafe, főoldal', 'Bros Cafe, home')}"><img src="/shared/img/mark-olive.png" alt="" width="26" height="30"><span>Bros Cafe</span></a>
    <nav class="site-nav" aria-label="${L('Fő navigáció', 'Main navigation')}">${NAV.filter((n) => n.desktop !== false).map((n) => `<a href="${n.href}"${cur(n)}${n.tab || n.extra ? '' : ' data-more'}>${label(n, n.extra)}${badge(n)}</a>`).join('')}${opener('site-nav__more', 'more-sheet', L('Több', 'More'), inMore)}</nav>
    <div data-lang-switch></div>
    <a class="site-acct${signedIn ? ' is-in' : ''}" href="${signedIn ? '/fiok/' : '/husegkartya/'}"${page === 'fiok' ? ' aria-current="page"' : ''} aria-label="${signedIn ? L('A Bros Cafe fiókod', 'Your Bros Cafe account') : L('Lépj be, vagy kérd a hűségkártyát', 'Sign in or get your loyalty card')}">${icon('user')}</a>
  </div>
</header>
<nav class="tabbar" id="site-tabbar" aria-label="${L('Alsó navigáció', 'Bottom navigation')}">
  ${tabs.map((n) => `<a class="tabbar__tab" href="${n.href}"${cur(n)}><span class="tabbar__ico">${icon(n.icon)}</span><span>${label(n, true)}</span></a>`).join('')}
  ${opener('tabbar__tab', 'extra-sheet', `<span>${L('Extrák', 'Extras')}</span>`, inExtra, `<span class="tabbar__ico">${icon('plus')}</span><span class="tabbar__new" aria-hidden="true">${L('Új', 'New')}</span>`)}
  ${opener('tabbar__tab', 'more-sheet', `<span>${L('Több', 'More')}</span>`, inMore, `<span class="tabbar__ico">${icon('more')}</span>`)}
</nav>
<dialog class="sheet" id="extra-sheet" aria-labelledby="extra-title">
  ${sheetHead('extra-title', L('Új a Brosnál', 'New at Bros'))}
  <div class="picks">${extras.map((n) => `<a class="pick wash--${n.wash}" href="${n.href}"${cur(n)}><span class="pick__pic"><picture><source srcset="${n.img}.webp" type="image/webp"><img src="${n.img}.jpg" alt="" width="1080" height="1350" loading="lazy"></picture></span><span class="pick__txt"><span class="pick__name">${label(n)}</span><span class="pick__line">${t(n.line).replace(/(\d) (?=\d|Ft)/g, '$1\u00a0')}</span><span class="pick__go">${t(n.go)} →</span></span></a>`).join('')}</div>
</dialog>
<dialog class="sheet" id="more-sheet" aria-labelledby="more-title">
  ${sheetHead('more-title', L('Több', 'More'))}
  <ul class="sheet__list"><li><a href="${signedIn ? '/fiok/' : '/husegkartya/'}"${page === 'fiok' ? ' aria-current="page"' : ''}>${icon('user')}<span>${signedIn ? L('Fiókom', 'My account') : L('Belépés', 'Sign in')}</span>${icon('chevron')}</a></li>${more.map((n) => `<li><a href="${n.href}"${cur(n)}>${icon(n.icon)}<span>${label(n)}</span>${icon('chevron')}</a></li>`).join('')}${signedIn ? `<li><a href="/" data-sign-out>${icon('exit')}<span>${L('Kijelentkezés', 'Sign out')}</span></a></li>` : ''}</ul>
  <p class="sheet__lang"><span>${L('Nyelv', 'Language')}</span><span data-lang-switch></span></p>
</dialog>`);

  const $ = (s) => document.querySelector(s);
  B.mount($('#site-header')); B.mount($('#more-sheet'));
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-sign-out]')) customer.signOut(); }); // then the link goes home

  // styles for the two things only the shell draws: the account entry and the consent banner
  document.head.insertAdjacentHTML('beforeend', `<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><style>
.site-acct { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border: var(--edge); border-radius: 50%; background: var(--surface); color: var(--text); transition: transform var(--tap); }
.site-acct:active { transform: scale(.92); }
.site-acct svg { width: 22px; height: 22px; }
.site-acct.is-in { background: var(--olive); border-color: var(--olive-deep); color: var(--on-accent); }
.consent { position: fixed; z-index: 60; left: 10px; right: 10px; bottom: calc(var(--bottom-h) + 10px); display: grid; gap: 12px; max-width: 760px; margin: 0 auto; padding: 16px 18px; border: var(--edge); border-radius: var(--r-md); background: var(--surface); box-shadow: var(--press-ink); font-size: 15px; line-height: 1.5; }
.consent b { display: block; font: 650 16px/1.3 var(--sans); }
.consent p { color: var(--text-soft); }
.consent a { color: var(--olive-deep); font-weight: 600; }
.consent__btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.consent__btns .btn { min-height: 46px; padding-inline: 14px; }
@media (min-width: 760px) { .consent { grid-template-columns: 1fr auto; align-items: center; gap: 22px; padding: 18px 22px; } .consent__btns { grid-template-columns: auto auto; } }
</style>`);

  // Asked once, on the first visit; both answers weigh the same. Changing your mind: /adatvedelem/.
  if (consent.read() === null && !['scanner', 'belepes', 'admin-app'].includes(page)) {
    document.body.insertAdjacentHTML('beforeend', `<div class="consent" role="dialog" aria-live="polite" aria-label="${L('Beleszámíthatjuk a látogatásod?', 'Can we count your visit?')}">
  <div><b>${L('Beleszámíthatjuk a látogatásod?', 'Can we count your visit?')}</b>
    <p>${L('Saját, egyszerű statisztikát vezetünk arról, melyik oldalt használják valóban. Nincs reklám, nincs külső követő, és nem azonosítunk téged név szerint. A belépés és a nyelvválasztás ettől függetlenül működik.', 'We use our own basic analytics to see which pages people actually use. No advertising, no third-party trackers, and nothing that identifies you by name. Signing in and your language choice work either way.')}
    <a href="/adatvedelem/">${L('Elolvasom az adatkezelési tájékoztatót', 'Read our privacy statement')}</a></p></div>
  <div class="consent__btns"><button class="btn btn--light" type="button" data-consent="denied">${L('Köszönöm, nem', 'No thanks')}</button><button class="btn" type="button" data-consent="granted">${L('Rendben', 'Allow')}</button></div>
</div>`);
    const banner = $('.consent');
    banner.addEventListener('click', (e) => { const b = e.target.closest('[data-consent]'); if (b) consent.set(b.dataset.consent); });
    window.addEventListener('bros-consent-change', () => banner.remove());
  }
  // keep the session sliding: once per browser session, off the critical path (the account page asks anyway)
  if (signedIn && page !== 'fiok' && page !== 'verify' && ls.get(CHECKED, sessionStorage) !== '1') setTimeout(() => customer.me().catch(() => {}), 1500);

  // skip link: works whatever id the page's <main> has
  $('.skip').addEventListener('click', (e) => {
    const m = $('main'); if (!m) return;
    e.preventDefault(); m.tabIndex = -1; m.focus({ preventScroll: true }); m.scrollIntoView();
  });

  // ---------- physical sheets (see SHELL.md, "Motion") ----------
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const desk = matchMedia('(min-width: 900px)');
  // A spring from the value on screen, with the velocity it already has. damping 1 = no overshoot; response = seconds.
  const spring = (from, to, v0, { damping = 1, response = 0.35 } = {}, set, done) => {
    const k = (2 * Math.PI / response) ** 2, c = 2 * damping * Math.sqrt(k);
    let x = from, v = v0 || 0, last = performance.now(), id = 0;
    const step = (now) => {
      const dt = Math.min(0.032, Math.max(0, now - last) / 1000) / 4; last = now;
      for (let i = 0; i < 4; i++) { v += (-k * (x - to) - c * v) * dt; x += v * dt; }
      if (Math.abs(x - to) < 0.5 && Math.abs(v) < 8) { set(to); done && done(); return; }
      set(x); id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return { stop() { cancelAnimationFrame(id); return v; } };
  };
  const project = (v, d = 0.998) => (v / 1000) * d / (1 - d); // where a flick would come to rest
  const rubber = (x, dim, c = 0.55) => (x * dim * c) / (dim + c * Math.abs(x));
  // sheet(dialog, { wide, hide }) -> { open, close }. Below `wide` the dialog rises on a spring, follows the finger on its
  // .sheet__grab and can be thrown down; at any moment it can be caught again. Above it, and under reduced motion,
  // it opens with a plain showModal() and closes through `hide` (default: dialog.close()).
  const sheet = (dlg, { wide = desk, hide = () => dlg.close() } = {}) => {
    let y = 0, h = 0, anim = null, drag = null;
    const physical = () => !calm.matches && !wide.matches;
    const set = (v) => { y = v; dlg.style.transform = v ? `translate3d(0, ${v}px, 0)` : ''; dlg.style.setProperty('--sheet-p', h ? Math.max(0, Math.min(1, 1 - v / h)).toFixed(3) : 1); };
    const halt = () => { const v = anim ? anim.stop() : 0; anim = null; return v; };
    const to = (target, v, o, done) => { const v0 = halt(); anim = spring(y, target, v == null ? v0 : v, o, set, () => { anim = null; done && done(); }); };
    const open = () => {
      if (!physical()) { halt(); set(0); if (!dlg.open) dlg.showModal(); return; }
      if (!dlg.open) { dlg.showModal(); h = dlg.offsetHeight; set(h); }
      to(0, null, { damping: 1, response: 0.38 });
    };
    const close = (v) => {
      if (!dlg.open) return;
      if (!physical()) { halt(); set(0); hide(); return; }
      h = dlg.offsetHeight;
      to(h, v, { damping: 1, response: 0.32 }, () => { dlg.close(); set(0); });
    };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('.sheet__close, [data-close]')) close(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted && dlg.open) { halt(); set(0); dlg.close(); } });
    wide.addEventListener('change', () => { if (dlg.open) { halt(); set(0); } });
    const grab = dlg.querySelector('.sheet__grab');
    if (grab) {
      grab.addEventListener('pointerdown', (e) => {
        if (!physical() || e.button || e.target.closest('button, a')) return;
        const caught = !!anim; halt(); h = dlg.offsetHeight;
        drag = { id: e.pointerId, y0: e.clientY, base: y, on: caught, hist: [[e.timeStamp, e.clientY]] };
        try { grab.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      });
      grab.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = e.clientY - drag.y0;
        if (!drag.on) { if (Math.abs(dy) < 10) return; drag.on = true; drag.y0 += Math.sign(dy) * 10; }
        const next = drag.base + e.clientY - drag.y0;
        set(next < 0 ? -rubber(-next, h) : next); // past the top it resists, it does not stop dead
        drag.hist.push([e.timeStamp, e.clientY]); if (drag.hist.length > 6) drag.hist.shift();
      });
      const drop = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag; drag = null;
        if (!d.on) return;
        const a = d.hist[0], b = d.hist[d.hist.length - 1];
        const v = e.type === 'pointerup' && b[0] > a[0] ? ((b[1] - a[1]) / (b[0] - a[0])) * 1000 : 0;
        if (y + project(v) > h * 0.5) close(v); else to(0, v, { damping: 0.8, response: 0.3 });
      };
      grab.addEventListener('pointerup', drop);
      grab.addEventListener('pointercancel', drop);
    }
    return { open, close };
  };

  const sheets = {};
  document.querySelectorAll('dialog.sheet').forEach((d) => {
    const openers = [...document.querySelectorAll(`[data-sheet="${d.id}"]`)];
    const ctl = sheets[d.id] = sheet(d);
    openers.forEach((o) => o.addEventListener('click', () => {
      if (!d.showModal) { location.href = (d.id === 'extra-sheet' ? extras : more)[0].href; return; }
      ctl.open(); openers.forEach((x) => x.setAttribute('aria-expanded', 'true'));
    }));
    d.addEventListener('close', () => openers.forEach((x) => x.setAttribute('aria-expanded', 'false')));
  });
  desk.addEventListener('change', () => document.querySelectorAll('dialog.sheet[open]').forEach((d) => d.close()));

  // desktop: if the link row no longer fits, Újdonságok / Játék / Kapcsolat move behind a "Több" button; the extras never fold
  const header = $('#site-header'), row = header.firstElementChild;
  const fit = () => { header.classList.remove('is-compact'); header.classList.toggle('is-compact', row.scrollWidth > row.clientWidth); };
  fit();
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  // ---------- view transitions (see SHELL.md) ----------
  // [data-vt="name"]: a fixed view-transition-name, set when the page loads (or call BROS.shell.vt(root) after rendering).
  const vt = (root = document) => root.querySelectorAll('[data-vt]').forEach((el) => { el.style.viewTransitionName = el.dataset.vt; });
  // [data-vt-click="name"] on (or inside) a link: named only while that link is being followed, so a whole list can share one name.
  const KEY = 'bros-vt';
  const vtEl = (a) => (a.matches('[data-vt-click]') ? a : a.querySelector('[data-vt-click]'));
  // the link that was followed, or (coming back) the first link to that page that carries a name
  const mark = (href, on, a) => {
    const el = a ? vtEl(a) : [...document.querySelectorAll('a[href]')].filter((x) => x.getAttribute('href') === href).map(vtEl).find(Boolean);
    if (el) el.style.viewTransitionName = on ? el.dataset.vtClick : '';
    return el;
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || calm.matches) return;
    const href = a.getAttribute('href');
    try { if (mark(href, true, a)) sessionStorage.setItem(KEY, href); else sessionStorage.removeItem(KEY); } catch (err) { /* */ }
  });
  // coming back: name the same item again so the detail morphs back into it, then clear
  window.addEventListener('pagereveal', (e) => {
    let href = null; try { href = sessionStorage.getItem(KEY); } catch (err) { /* */ }
    if (!href) return;
    if (!e.viewTransition) { mark(href, false); return; }
    mark(href, true);
    e.viewTransition.finished.catch(() => {}).then(() => mark(href, false));
  });
  // same-document change (open a detail, switch a tab) with a transition where supported
  const transition = (update) => {
    if (!document.startViewTransition || calm.matches) { update(); return null; }
    const tr = document.startViewTransition(update);
    // a transition cut short (another one starts, the tab is hidden) rejects these; that is not an error
    [tr.ready, tr.updateCallbackDone, tr.finished].forEach((p) => p.catch(() => {}));
    return tr;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => vt()); else vt();

  // ---------- shared helpers: price, opening status, footer ----------
  const nf = new Intl.NumberFormat('hu-HU', { useGrouping: 'always' });
  const ft = (n) => `${nf.format(Number(n) || 0)} Ft`;

  // minutes from midnight, Sunday first; null = closed. Always Budapest time, whatever the device says.
  const HOURS = [null, [450, 1080], [450, 1080], [450, 1080], [450, 1080], [450, 1080], [510, 1020]];
  const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const budapest = () => {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Budapest', weekday: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), min: +p.hour * 60 + +p.minute, year: +p.year };
  };
  // { open, day (0 = Sunday), text }
  const status = () => {
    const { day, min } = budapest(), h = HOURS[day];
    if (h && min >= h[0] && min < h[1]) return { open: true, day, text: B.t('Most nyitva · {a}-ig', { a: hm(h[1]) }) };
    for (let d = 0; d < 7; d++) {
      const o = HOURS[(day + d) % 7];
      if (!o || (d === 0 && min >= o[0])) continue;
      const key = d === 0 ? 'Zárva · ma {a}-kor nyitunk' : d === 1 ? 'Zárva · holnap {a}-kor nyitunk' : 'Zárva · hétfőn {a}-kor nyitunk';
      return { open: false, day, text: B.t(key, { a: hm(o[0]) }) };
    }
    return { open: false, day, text: B.t('Zárva') };
  };
  // which extra fits the moment: weekday mornings (6–11h in Budapest) the office delivery, otherwise the private evening
  const extraNow = () => { const { day, min } = budapest(); return extras[day >= 1 && day <= 5 && min >= 360 && min < 660 ? 1 : 0]; };
  // [data-open-status]: the live line; [data-day="1 2 3"]: marked when today is one of those days
  const paintStatus = () => {
    const s = status();
    document.querySelectorAll('[data-open-status]').forEach((el) => { el.textContent = s.text; el.classList.toggle('is-open', s.open); el.hidden = false; });
    document.querySelectorAll('[data-day]').forEach((el) => el.classList.toggle('is-today', el.dataset.day.split(' ').includes(String(s.day))));
  };

  // The one footer, on every page: call once, when the page's own content is in place.
  const MAP = 'https://www.google.com/maps/search/?api=1&amp;query=Bros%20Cafe%2C%201132%20Budapest%2C%20Csan%C3%A1dy%20u.%204%2Fb';
  const footer = () => {
    if ($('footer.end')) return;
    const end = document.createElement('footer');
    end.className = 'end';
    end.innerHTML = `<div class="wrap">
      <div class="end__grid">
        <div class="end__brand"><img class="end__logo" src="/shared/img/logo-full-olive.png" alt="Bros Cafe" width="961" height="992" loading="lazy">
          <p class="end__tag">Specialty kávé,<br><em>szeretettel készítve.</em></p></div>
        <div class="end__pages"><h2>Oldalak</h2><nav class="end__nav" aria-label="${L('Oldalak', 'Pages')}">${NAV.map((n) => `<a href="${n.href}"${cur(n)}>${label(n)}${badge(n)}</a>`).join('')}</nav></div>
        <div class="end__facts"><h2>Gyere el hozzánk</h2>
          <p class="end__status" data-open-status hidden></p>
          <p><a href="${MAP}" target="_blank" rel="noopener">1132 Budapest, Csanády u. 4/b</a></p>
          <p class="end__hours"><span>Hétfő–péntek 7:30–18:00</span> <span>Szombat 8:30–17:00</span> <span>Vasárnap zárva</span></p>
          <p><a href="mailto:hello@broscafe.hu">hello@broscafe.hu</a><br><a href="https://instagram.com/broscafe.co" target="_blank" rel="noopener" aria-label="${L('A Bros Cafe az Instagramon', 'Bros Cafe on Instagram')}">@broscafe.co</a></p></div>
      </div>
      <p class="end__end"><span>© ${budapest().year} Bros Cafe · ${L('Jó kávéval készült', 'Made with good coffee')}</span><a href="/adatvedelem/">Adatkezelés</a><a href="/segitseg/">Segítség</a><a href="/pult/">Munkatársaknak</a></p>
    </div>`;
    document.body.append(end);
    paintStatus(); setInterval(paintStatus, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) paintStatus(); });
  };

  B.shell = { nav: NAV, page, icon, vt, transition, ft, status, paintStatus, footer, extraNow, sheet, sheets, customer, consent, track };
})();
