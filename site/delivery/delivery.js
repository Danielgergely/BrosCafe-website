// Bros Delivery: the order page (delivery/), the group order page (delivery/csoport/) and the admin page
// (admin/delivery/). Spec: docs/delivery.md · backend contract: docs/delivery-api.md
(() => {
  const B = window.BROS, { esc, ft } = B.shell;
  const t = B.t, loc = B.locale;
  const tn = (key, n, vars) => t(B.en && n === 1 ? `${key}|1` : key, { n, ...vars }); // English singular: "1 drink"
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- CONFIG: the page-side values (draft until the proposal is agreed); the server owns slots and fees ----------
  const CONFIG = {
    draft: true,
    newSlot: { time: '09:00', cutoffMin: 45, capacity: 8 }, // the admin's first slot when none is left
    slotHours: ['07:30', '18:00'], // a slot must be inside the opening hours
    daysAhead: 5,           // how many delivery days the picker offers
    rushOffMin: 45,         // rush switches itself off after this many minutes (server-side)
    cats: ['coffee', 'specialty', 'tea', 'smoothie', 'bottled'], // every drink category
    stampSpecials: ['pistachio-latte', 'caramel-latte', 'pumpkin-spice-latte', 'espresso-tonic'], // + every 'coffee': COFFEE_SPECIALS in worker/src/services/drinks.ts
    milkExtra: 0,           // Ft for plant milk; not in the catalogue yet
    areas: ['Váci út', 'Lehel utca, Lehel tér', 'Duna-parti irodák'],
  };

  // The fee rule comes from the API (GET /slots, GET /groups/:code); these are the values until it answers.
  const RULES = { freeFrom: 5, fee: 490 };
  const FEE_TEXT = { chip: '{n} italtól ingyenes kiszállítás, alatta {fee}', how: 'Ami addig ki van fizetve, azt visszük. {n} italtól ingyenes a kiszállítás.' };
  function setRules(freeFrom, fee) {
    if (Number.isFinite(freeFrom)) RULES.freeFrom = freeFrom;
    if (Number.isFinite(fee)) RULES.fee = fee;
    $$('[data-fee]').forEach((el) => { el.textContent = t(FEE_TEXT[el.dataset.fee], { n: RULES.freeFrom, fee: ft(RULES.fee) }); });
  }

  const COFFEE_SET = new Set('espresso espresso-macchiato cortado cappuccino flat-white latte americano matcha-latte'.split(' ')); // /shared/media/coffee-<id>-1x1
  const hm = (s) => s.replace(/^0/, '');
  const feeFor = (n) => (n >= RULES.freeFrom ? 0 : RULES.fee);
  const draftPill = (text) => (CONFIG.draft ? `<span class="dl-draft dl-draft--wrap">${t(text || 'Tervezet')}</span>` : '');
  const taxFmt = (v) => { const d = v.replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 8)}-${d[8]}-${d.slice(9)}` : v.trim(); }; // 11 digits -> 12345678-1-12

  // ---------- dates: Europe/Budapest everywhere, never the device clock's zone ----------
  // A day is 'YYYY-MM-DD'; as a Date it is 00:00 UTC of that day (only for day arithmetic and formatting).
  const TZ = 'Europe/Budapest';
  const bpFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const bp = (ms = Date.now()) => { const p = {}; for (const x of bpFmt.formatToParts(ms)) p[x.type] = x.value; return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
  const parse = (s) => new Date(`${s}T00:00:00Z`);
  const today = () => bp().date;
  const dShort = new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dWk = new Intl.DateTimeFormat(loc, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dLong = new Intl.DateTimeFormat(loc, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const clockFmt = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const clock = (isoTime) => hm(clockFmt.format(new Date(isoTime)));
  const dayLabel = (s) => { const diff = Math.round((parse(s) - parse(today())) / 864e5); return diff === 0 ? `${t('Ma')}, ${dShort.format(parse(s))}` : diff === 1 ? `${t('Holnap')}, ${dShort.format(parse(s))}` : dWk.format(parse(s)); };
  // run fn when the Budapest day changes in an open tab
  function watchDay(fn) {
    let last = today();
    const tick = () => { if (today() !== last) { last = today(); fn(); } };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    setInterval(tick, 60000);
  }
  const EVERY = B.en
    ? ['every Sunday', 'every Monday', 'every Tuesday', 'every Wednesday', 'every Thursday', 'every Friday', 'every Saturday']
    : ['minden vasárnap', 'minden hétfőn', 'minden kedden', 'minden szerdán', 'minden csütörtökön', 'minden pénteken', 'minden szombaton'];
  const WD = B.en ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] : ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'];

  // ---------- the menu: live products, every drink ----------
  const CATS = { coffee: 'Kávék', specialty: 'Különlegességek', tea: 'Teák', smoothie: 'Smoothie-k', bottled: 'Italok' };
  const MILKS = { Oat: 'Zabtej', CoconutRice: 'Kókusz-rizs tej', Pea: 'Borsótej' };
  const nice = (s) => (s && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLocaleLowerCase(loc) : s || '');
  const menu = new Map();
  async function loadMenu() {
    const r = await fetch('/api/products', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('products');
    const list = await r.json();
    menu.clear();
    for (const p of Array.isArray(list) ? list : list.products || []) {
      if (p.active === false || !CONFIG.cats.includes(p.cat)) continue;
      const own = (p.images || []).find((s) => typeof s === 'string' && s.startsWith('/images/products/')); // never a third-party image
      const sizes = ((p.sizes && (p.sizes[B.lang] || p.sizes.hu)) || []).map((s) => { const [label, price] = s.split('—'); return { label: label.trim(), price: Number((price || '').replace(/\D/g, '')) || p.price_huf }; });
      menu.set(p.id, { id: p.id, cat: p.cat, name: nice(p.name[B.lang] || p.name.hu), price: p.price_huf, photo: COFFEE_SET.has(p.id) ? `/shared/media/coffee-${p.id}-1x1.jpg` : own ? own.replace('/images/products/', '/shared/photos/') : null, milks: p.milks || [], sizes, temp: p.temp });
    }
    return menu;
  }
  // free extras: which drinks offer them comes from the server (GET /slots, GET /groups/:code)
  const EXTRAS = { decaf: 'koffeinmentes', cream: 'tejszínhabbal' }, extraIds = { decaf: [], cream: [] };
  const setExtras = (x) => { if (x) Object.keys(EXTRAS).forEach((k) => { extraIds[k] = x[k] || []; }); };
  const offers = (d, k) => extraIds[k].includes(d.id);
  // a cup: { id, who, milk, size, iced, decaf, cream, note }; a plain + adds it with the defaults
  const newCup = (id) => ({ uid: Math.random().toString(36).slice(2, 9), id, who: '', milk: '', size: 0, iced: false, decaf: false, cream: false, note: '' });
  const cupPrice = (c) => { const d = menu.get(c.id); return (d.sizes[c.size] ? d.sizes[c.size].price : d.price) + (c.milk ? CONFIG.milkExtra : 0); };
  const cupOpts = (c) => { const d = menu.get(c.id); return [d.sizes[c.size] && d.sizes[c.size].label, c.milk && t(MILKS[c.milk] || c.milk), c.iced && t('jeges'), ...Object.keys(EXTRAS).filter((k) => c[k] && offers(d, k)).map((k) => t(EXTRAS[k]))].filter(Boolean); };
  const cupItem = (c) => ({ product_id: c.id, who: c.who.trim(), milk: c.milk, size: c.size, iced: c.iced, decaf: c.decaf, cream: c.cream, note: c.note.trim() });
  const cupLine = (c) => [ft(cupPrice(c)), ...cupOpts(c), c.note.trim() && `„${c.note.trim()}”`].filter(Boolean);
  // milk and decaf as pills right on the cup in the basket (the sheet keeps size, temperature, cream and the note)
  const cupPills = (c, d) => {
    const milk = d.milks.length ? [['', 'Tehéntej'], ...d.milks.map((m) => [m, MILKS[m] || m])].map(([v, l]) => `<label class="dl-pill dl-pill--sm"><input type="radio" name="m-${c.uid}" data-k="milk" value="${esc(v)}"${c.milk === v ? ' checked' : ''}><span>${esc(t(l))}</span></label>`).join('') : '';
    const decaf = offers(d, 'decaf') ? `<label class="dl-pill dl-pill--sm dl-pill--toggle"><input type="checkbox" data-k="decaf"${c.decaf ? ' checked' : ''}><span>${t('Koffeinmentes')}</span></label>` : '';
    return milk || decaf ? `<div class="dl-cup__pills" role="group" aria-label="${esc(d.name)}">${milk}${decaf}</div>` : '';
  };
  const readOpt = (c, el) => { const k = el.dataset.k; c[k] = k === 'size' ? Number(el.value) : k === 'iced' ? el.value === 'true' : el.type === 'checkbox' ? el.checked : el.value; };
  const sliders = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>';

  // "Testreszabás": the options of one cup in a sheet (McDonald's style: hidden in the normal flow, one tap away)
  // add(qty, cup): "add" mode (long press on a drink): a quantity on top, the button puts that many cups in the basket
  let sheetApi = null, sheetCup = null, sheetDone = null, sheetBack = null, sheetAdd = null, sheetQty = 1, sheetMax = 1;
  function customize(c, onChange, back, add, max = 50) {
    let dlg = $('#dl-custom');
    if (!dlg) {
      ($('main.dl') || document.body).insertAdjacentHTML('beforeend', `<dialog class="sheet dl-sheet" id="dl-custom" aria-labelledby="dl-custom-title">
        <div class="sheet__grab"><div class="sheet__head"><h2 class="sheet__title" id="dl-custom-title"></h2><button class="sheet__close" type="button" aria-label="${t('Bezárás')}">${cross}</button></div></div>
        <div class="dl-custom" id="dl-custom-body"></div>
        <button class="btn dl-custom__done" type="button" id="dl-custom-done" data-close>${t('Kész')}</button></dialog>`);
      dlg = $('#dl-custom');
      sheetApi = B.shell.sheet(dlg);
      const done = $('#dl-custom-done');
      const label = () => { if (sheetAdd) done.textContent = `${t('Kosárba')} · ${sheetQty} × ${ft(cupPrice(sheetCup))}`; };
      $('#dl-custom-body').addEventListener('input', (e) => { if (sheetCup && e.target.dataset.k) { readOpt(sheetCup, e.target); sheetDone && sheetDone(); label(); } });
      $('#dl-custom-body').addEventListener('click', (e) => {
        const b = e.target.closest('[data-q]'); if (!b) return;
        sheetQty = Math.max(1, Math.min(sheetMax, sheetQty + Number(b.dataset.q)));
        $('#dl-custom-qty').textContent = sheetQty; label();
      });
      done.addEventListener('click', () => { if (sheetAdd) { const f = sheetAdd; sheetAdd = null; f(sheetQty, sheetCup); } });
      dlg.addEventListener('close', () => { sheetAdd = null; sheetBack && sheetBack(); });
      dlg.dl = { label };
    }
    const d = menu.get(c.id), uid = c.uid;
    sheetCup = c; sheetDone = onChange; sheetBack = back; sheetAdd = add || null; sheetQty = 1; sheetMax = Math.max(1, max); // back: puts the focus where the sheet was opened from
    const pills = (k, label, opts) => `<fieldset class="dl-custom__group"><legend>${t(label)}</legend><div class="dl-custom__pills">${opts.map(([v, l]) => `<label class="dl-pill"><input type="radio" name="c-${k}-${uid}" data-k="${k}" value="${esc(String(v))}"${String(c[k]) === String(v) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`;
    const box = (k, label) => `<label class="dl-pill dl-pill--toggle"><input type="checkbox" data-k="${k}"${c[k] ? ' checked' : ''}><span>${t(label)}</span></label>`;
    $('#dl-custom-title').textContent = d.name;
    $('#dl-custom-body').innerHTML =
      (add ? `<div class="dl-custom__qty"><span>${t('Darab')}</span><span class="dl-qty"><button type="button" data-q="-1" aria-label="${t('Eggyel kevesebb')}">−</button><output id="dl-custom-qty" aria-live="polite">1</output><button type="button" data-q="1" aria-label="${t('Eggyel több')}">+</button></span></div>` : '') +
      (d.sizes.length ? pills('size', 'Méret', d.sizes.map((s, i) => [i, `${s.label} · ${ft(s.price)}`])) : '') +
      (d.temp === 'both' ? pills('iced', 'Forró vagy jeges', [['false', t('Forró')], ['true', t('Jeges')]]) : '') +
      (d.milks.length ? pills('milk', 'Tej', [['', t('Tehéntej')], ...d.milks.map((m) => [m, t(MILKS[m] || m)])]) : '') +
      (offers(d, 'decaf') || offers(d, 'cream') ? `<div class="dl-custom__group dl-custom__pills">${offers(d, 'decaf') ? box('decaf', 'Koffeinmentes') : ''}${offers(d, 'cream') ? box('cream', 'Tejszínhabbal') : ''}</div>` : '') +
      `<div class="dl-field dl-custom__note"><label for="dl-custom-note">${t('Megjegyzés a baristának')} <i>(${t('nem kötelező')})</i></label><input id="dl-custom-note" type="text" data-k="note" maxlength="80" value="${esc(c.note)}" placeholder="${t('Pl. extra forró, kevés hab')}" autocomplete="off"></div>`;
    $('#dl-custom-done').textContent = t('Kész'); $('#dl-custom').dl.label();
    sheetApi.open();
  }

  // ---------- data access: everything the pages read or write goes through `api` ----------
  const guestToken = () => B.shell.customer?.token() || null; // the loyalty account (magic link), not staff
  // a signed-in guest's earlier Delivery order (GET /api/customer/reorder): everything but the date and time
  async function lastOrder(id) {
    if (!guestToken()) return null;
    const r = await fetch(`/api/customer/reorder${id ? `?order=${encodeURIComponent(id)}` : ''}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${guestToken()}` } });
    return r.ok ? (await r.json()).order : null;
  }
  // The worker: worker/src/routers/delivery.ts, docs/delivery-api.md.
  const api = (() => {
    const base = '/api/delivery';
    const call = async (path, opts) => {
      // admin calls carry the staff token (belepes/staff.js); a dead session goes back to the login
      const headers = { 'Content-Type': 'application/json' }, staff = path.startsWith('/admin') && B.staff;
      if (staff && staff.token()) headers.Authorization = `Bearer ${staff.token()}`;
      else if (!staff && guestToken()) headers.Authorization = `Bearer ${guestToken()}`; // signed in: stamps go on their card
      const r = await fetch(base + path, { credentials: 'same-origin', headers, ...opts });
      const body = await r.json().catch(() => ({}));
      if (r.status === 401 && staff) staff.toLogin();
      if (!r.ok) throw Object.assign(new Error(body.error || r.statusText), { status: r.status, code: body.error, left: body.left, fields: body.fields });
      return body;
    };
    const post = (path, data) => call(path, { method: 'POST', body: JSON.stringify(data || {}) });
    const put = (path, data) => call(path, { method: 'PUT', body: JSON.stringify(data || {}) });
    return {
      slots: () => call(`/slots?days=${CONFIG.daysAhead}`),
      checkAddress: (address, postcode) => post('/address-check', { address, postcode }), // -> { status, radius_m }
      suggest: (q) => call(`/address-suggest?q=${encodeURIComponent(q)}`), // -> { items: [{ street, postcode, district, house }] }
      order: (payload) => post('/orders', payload), // -> { checkout_url }
      status: (orderId, token) => call(`/orders/${encodeURIComponent(orderId)}/status?t=${encodeURIComponent(token)}`), // -> { status, rush, answer_by, eta_at }
      recurring: (orderId, rule, token) => post(`/orders/${encodeURIComponent(orderId)}/recurring`, { rule, token }),
      createGroup: (payload) => post('/groups', payload), // -> { code, url, checkout_url }
      group: (code) => call(`/groups/${encodeURIComponent(code)}`),
      join: (code, payload) => post(`/groups/${encodeURIComponent(code)}/participants`, payload), // -> { checkout_url }
      close: (code, token) => post(`/groups/${encodeURIComponent(code)}/close`, { token }), // organiser only -> the group view
      cancelInfo: (token) => call(`/cancel/${encodeURIComponent(token)}`), // the payer's link from the email or /fiok/
      cancelConfirm: (token) => post(`/cancel/${encodeURIComponent(token)}`),
      admin: {
        board: (date) => call(`/admin/board?date=${date}`),
        setStatus: (id, status) => put(`/admin/orders/${id}/status`, { status }),
        setRush: (on) => put('/admin/rush', { on }),
        settings: () => call('/admin/settings'),
        saveSettings: (s) => put('/admin/settings', s),
        closeSlot: (date, slotId, closed) => put(`/admin/days/${date}/slots/${slotId}`, { closed }),
        recurring: () => call('/admin/recurring'),
        setRecurring: (id, active) => put(`/admin/recurring/${id}`, { active }),
        cancelOrder: (id) => post(`/admin/orders/${id}/cancel`),
        answer: (id, body) => post(`/admin/orders/${id}/answer`, body), // { minutes } | { time } | { accept: false }
      },
    };
  })();

  // Online payment is not switched on yet (the worker answers 503 payments_not_configured): say so instead of failing at the end.
  const NOT_READY = 'Az online fizetés még nincs bekapcsolva, ezért itt most nem lehet rendelni. Írj nekünk: hello@broscafe.hu';
  function notReady(anchor, where = 'afterend') {
    if ($('#dl-notready') || !anchor) return;
    anchor.insertAdjacentHTML(where, `<div class="dl-return" id="dl-notready" data-s="cancelled" role="status"><p>${t(NOT_READY)}</p></div>`);
  }
  // Online ordering switched off on this server (BOOKINGS_OPEN): the information stays, the form becomes a contact block.
  const CLOSED = 'Az online rendelés hamarosan indul. Addig írj nekünk, és egyeztetünk.';
  function ordersClosed(form) {
    CONFIG.draft = false; $$('.dl-draft:not(.dl-g__tags .dl-draft), #dl-notready').forEach((el) => el.remove());
    if (!form || $('#dl-closed')) return;
    form.hidden = true;
    // the section's own heading and intro talk about ordering now: the closed message takes their place
    const head = $('#rendeles-cim'); if (head && form.id === 'dl-form') { head.textContent = t('Az online rendelés hamarosan indul.'); const intro = head.nextElementSibling; if (intro && intro.matches('p.body')) intro.hidden = true; }
    form.insertAdjacentHTML('beforebegin', `<div class="dl-return" id="dl-closed" role="status"><p>${t('Addig írj nekünk, és egyeztetünk.')}</p><p style="margin-top:14px"><a class="btn" href="/kapcsolat/">${t('Írj nekünk')}</a></p></div>`);
  }

  // ---------- shared bits ----------
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const LAST = 'bros-delivery-last'; // what was ordered, kept for the thank-you view after the Stripe round trip
  const cross = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  // one segment per drink up to the free-delivery threshold + the sentence under it
  function progress(n) {
    const need = RULES.freeFrom, left = Math.max(0, need - n);
    const text = left ? tn('Még {n} ital az ingyenes kiszállításig.', left) : t('Megvan: a kiszállítás ingyenes.');
    return `<div class="dl-prog" role="img" aria-label="${esc(`${tn('{n} ital', n)} / ${need}. ${text}`)}">${Array.from({ length: need }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('')}</div><p class="dl-prog__text">${text}</p>`;
  }
  // error under a field (creates the <p> on first use), shared by both forms
  function errors(form) {
    return (name, msg) => {
      const input = form.elements[name] instanceof Element ? form.elements[name] : null;
      let el = $(`#err-${name}`, form);
      if (!el && input) { el = document.createElement('p'); el.className = 'dl-err'; el.id = `err-${name}`; el.hidden = true; (input.closest('.dl-check') || input).after(el); }
      if (!el) return;
      el.textContent = msg; el.hidden = !msg;
      if (input) { if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', el.id); } else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); } }
    };
  }
  const busy = (btn, on) => { if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); btn.disabled = !!on; };
  // Stripe return parameters, removed from the address bar once read
  function returned(keys) {
    const q = new URLSearchParams(location.search), out = {};
    keys.forEach((k) => { out[k] = q.get(k); q.delete(k); });
    if (keys.some((k) => out[k] != null)) history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
    return out;
  }
  const openWide = () => { if (matchMedia('(min-width: 980px)').matches) $$('details[data-open-wide]').forEach((d) => { d.open = true; }); };
  // a link to a folded block (#zona, #csoportos, #aszf) opens it
  function openTarget() { const el = location.hash.length > 1 && document.getElementById(location.hash.slice(1)); if (el && el.tagName === 'DETAILS') { el.open = true; el.scrollIntoView({ block: 'start' }); $('summary', el).focus({ preventScroll: true }); } }

  // Address combobox (Photon via the worker): typing suggests Budapest streets and house numbers; a pick stores the
  // postcode on the input, which tells same-named streets in two districts apart for the zone check.
  function addressBox(input, onPick) {
    const id = `${input.id}-list`, list = document.createElement('ul');
    let items = [], active = -1, timer = 0, seq = 0;
    list.id = id; list.className = 'dl-sugg'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', t('Címjavaslatok')); list.hidden = true;
    Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': id, autocomplete: 'off' }).forEach(([k, v]) => input.setAttribute(k, v));
    input.parentElement.classList.add('dl-field--sugg'); input.after(list);
    const show = () => {
      list.innerHTML = items.map((x, i) => `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${i === active}"><b>${esc(x.street)}</b><small>${esc([x.postcode, x.district].filter(Boolean).join(' · '))}</small></li>`).join('');
      list.hidden = !items.length; list.style.top = `${input.offsetTop + input.offsetHeight + 6}px`; input.setAttribute('aria-expanded', String(items.length > 0));
      if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-${active}`); else input.removeAttribute('aria-activedescendant');
    };
    const close = () => { active = -1; list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
    const pick = (i) => {
      const x = items[i]; if (!x) return;
      close(); items = [];
      if (!x.house) { input.value = `${x.street} `; delete input.dataset.postcode; return; } // a street (may span postcodes): the house number comes next
      input.value = x.street; input.dataset.postcode = x.postcode; onPick(x);
    };
    input.addEventListener('input', () => {
      delete input.dataset.postcode; clearTimeout(timer);
      const q = input.value.trim(), n = ++seq;
      if (q.length < 3) { items = []; close(); return; }
      timer = setTimeout(async () => { const r = await api.suggest(q).catch(() => ({ items: [] })); if (n !== seq) return; items = r.items || []; active = -1; show(); }, 250);
    });
    input.addEventListener('keydown', (e) => {
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; show(); }
      else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); close(); }
    });
    list.addEventListener('mousedown', (e) => e.preventDefault()); // keeps the focus (and the list) in the field
    list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) pick(Number(li.dataset.i)); });
    input.addEventListener('blur', close);
  }
  const ZONE_OUT = 'Ez a cím sajnos kívül esik a körzetünkön.';
  // the radius comes from the worker (DELIVERY_RADIUS_M): numbers in [data-zone] follow it, "half" for the inner ring
  function setZone(m) {
    if (!Number.isFinite(m)) return;
    const sub = (s, v) => s.replace(/\d+(?= m)/, v);
    $$('[data-zone]').forEach((el) => {
      const v = el.dataset.zone === 'half' ? Math.round(m / 2) : m;
      if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', sub(el.getAttribute('aria-label'), v));
      else if (!el.children.length && sub(el.textContent, v) !== el.textContent) el.textContent = sub(el.textContent, v);
    });
  }

  // The 3D zone map (map/map.js + self-hosted MapLibre), loaded on first use; devices without WebGL keep the sketch.
  const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  let mapLib = null;
  const loadMap = () => (mapLib ||= (() => {
    const load = (src) => new Promise((ok, no) => {
      const css = src.endsWith('.css'), el = document.createElement(css ? 'link' : 'script');
      if (css) { el.rel = 'stylesheet'; el.href = src; } else el.src = src;
      el.onload = ok; el.onerror = no; document.head.append(el);
    });
    const lib = '/shared/vendor/maplibre-gl-4.7.1/maplibre-gl';
    return Promise.all([load(`${lib}.css`), load(`${lib}.js`)]).then(() => load('/delivery/map/map.js')).catch((e) => { mapLib = null; throw e; });
  })());
  // the map in "Hova visszük?": once its block is on screen
  function map3d() {
    const box = $('#dl-map3d'), fig = box && box.closest('.dl-map');
    if (!fig || !webgl || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return;
      io.disconnect();
      loadMap().then(() => {
        fig.classList.add('is-3d'); box.hidden = false; // the container needs its size before the map starts
        $('#dl-map-cap').textContent = t('Zölddel a házak, ahova szállítunk. Koppints egy épületre: ha ide kéred, beírjuk a címét.');
        return window.DLZoneMap.mount(box, { cooperative: true });
      }).catch(() => { fig.classList.remove('is-3d'); box.hidden = true; });
    }, { rootMargin: '300px' });
    io.observe(fig);
  }
  // "Válaszd ki a térképen" under the address: the same map in a popup; "Ide kérem" fills the address and closes it
  function mapPicker() {
    const btn = $('#dl-mappick');
    if (!btn || !webgl) return;
    btn.hidden = false;
    let dlg = null, sheetApi2 = null, map = null;
    btn.addEventListener('click', async () => {
      if (!dlg) {
        ($('main.dl') || document.body).insertAdjacentHTML('beforeend', `<dialog class="sheet dl-sheet dl-mapsheet" id="dl-mapsheet" aria-labelledby="dl-mapsheet-title">
          <div class="sheet__grab"><div class="sheet__head"><h2 class="sheet__title" id="dl-mapsheet-title">${t('Válaszd ki a házat')}</h2><button class="sheet__close" type="button" aria-label="${t('Bezárás')}">${cross}</button></div></div>
          <p class="fine dl-mapsheet__hint">${t('Zölddel a házak, ahova szállítunk. Koppints a tiédre, majd: Ide kérem.')}</p>
          <div class="dl-map3d dl-mapsheet__map" id="dl-mapsheet-map"></div></dialog>`);
        dlg = $('#dl-mapsheet'); sheetApi2 = B.shell.sheet(dlg);
        dlg.addEventListener('close', () => btn.focus());
        document.addEventListener('dl:pick', () => { if (dlg.open) sheetApi2.close(); });
      }
      sheetApi2.open();
      if (map) { map.resize(); return; }
      try { await loadMap(); map = await window.DLZoneMap.mount($('#dl-mapsheet-map')); }
      catch (e) { $('#dl-mapsheet-map').innerHTML = `<p class="dl-state" role="alert">${t('A térkép most nem érhető el. Írd be a címet kézzel.')}</p>`; }
    });
  }

  // ---------- order page ----------
  function orderPage() {
    const video = $('.dl-hero__video video');
    if (video && !calm) { video.autoplay = true; video.play().catch(() => {}); }
    openWide(); addEventListener('hashchange', openTarget); openTarget();

    // zone list + address check
    $('#dl-areas').innerHTML = CONFIG.areas.map((a) => `<li>${esc(t(a))}</li>`).join('');
    const zf = $('#dl-zone-form'), zr = $('#dl-zone-result');
    zf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = zf.elements.address, v = input.value.trim(), zb = zf.querySelector('button');
      if (zb.disabled) return;
      if (v.length < 4) { zr.textContent = t('Írd be az utcát és a házszámot.'); zr.hidden = false; input.focus(); return; }
      busy(zb, true);
      const res = await api.checkAddress(v, input.dataset.postcode).catch(() => ({ status: 'confirm' }));
      busy(zb, false);
      zr.innerHTML = res.status === 'in_zone' ? esc(t('Ide szállítunk.')) : res.status === 'out_of_zone' ? esc(t(ZONE_OUT))
        : `${esc(t('Ezt a címet nem találtuk a térképen.'))} <a href="/kapcsolat/">${esc(t('Írj nekünk'))}</a>, ${esc(t('és megnézzük.'))}`;
      zr.hidden = false;
      document.dispatchEvent(new CustomEvent('dl:checked', { detail: { address: v } }));
    });
    addressBox(zf.elements.address, () => zf.requestSubmit());
    map3d(); mapPicker();

    const form = $('#dl-form'), F = (n) => form.elements[n], setErr = errors(form);
    window.BROS_TERMS?.bind(form, 'dl', { linkOnly: true });
    const menuEl = $('#dl-menu'), catsEl = $('#dl-cats'), cupsEl = $('#dl-cups'), daysEl = $('#dl-days'), slotsEl = $('#dl-slots'), sum = $('#dl-sum'), result = $('#dl-result'), ret = $('#dl-return'), payBtn = $('#dl-pay');
    let bag = null, cups = [], cat = CONFIG.cats[0], data = null, day = null, slot = null, capShown = false, sending = false, liveTimer = null; // slot: a slot id or 'rush'
    const kind = () => (pickup() ? 'company' : F('pay').value || 'company'); // pickup has no "who pays" choice
    const pickup = () => F('how').value === 'pickup', delivery = () => F('how').value === 'delivery';

    // back from Stripe: ?order=<id>&paid=1[&t=<token>] or ?cancelled=1 (docs/delivery-api.md)
    (() => {
      const r = returned(['order', 'paid', 'cancelled', 't']);
      if (r.cancelled === '1') { ret.innerHTML = `<h3>${t('A fizetés megszakadt.')}</h3><p>${t('Nem történt terhelés, és a rendelés nem jött létre. Ha szeretnéd, kezdd újra.')}</p>`; ret.dataset.s = 'cancelled'; }
      else if (r.paid === '1' && r.order) {
        let last = null; try { last = JSON.parse(sessionStorage.getItem(LAST)); sessionStorage.removeItem(LAST); } catch (e) { /* no storage */ }
        ret.innerHTML = `<h3>${last && last.rush ? t('Megkaptuk a kérést!') : t('Köszönjük, megvan a rendelés!')}</h3>
          <p>${t('Azonosító')}: <b>${esc(r.order)}</b>${last ? `<br>${tn('{n} ital', last.n)} · ${esc(last.text)} · ${esc(last.company)}` : ''}</p><p>${t('A visszaigazolást és a számlát e-mailben küldjük.')}</p>
          ${last && !last.rush ? `<fieldset class="dl-repeat"><legend>${t('Ismételd minden…')} ${draftPill('Tervezet · a módja még nyitott')}</legend>
            <div class="dl-repeat__row"><label class="dl-pill"><input type="radio" name="repeat" value="weekdays" checked><span>${t('munkanapon')}</span></label><label class="dl-pill"><input type="radio" name="repeat" value="${last.wd}"><span>${EVERY[last.wd].split(' ').pop()}</span></label>
            <button type="button" class="btn btn--ghost" data-repeat>${t('Ismétlés beállítása')}</button></div>
            <p class="dl-preview" data-repeat-out role="status" hidden></p></fieldset>` : ''}`;
        ret.dataset.s = 'paid';
        if (r.t) rushState(r.order, r.t);
        ret.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-repeat]'); if (!b || b.disabled) return;
          const rule = $('input[name="repeat"]:checked', ret).value, out = $('[data-repeat-out]', ret);
          busy(b, true);
          try {
            await api.recurring(r.order, rule, r.t);
            const when = rule === 'weekdays' ? t('minden munkanapon') : EVERY[rule];
            out.textContent = t('Beállítva: {when} {time}-ra előkészítjük ezt a rendelést, és előtte e-mailben küldünk egy fizetési linket. Bármikor leállíthatod.', { when, time: hm(last.time) });
          } catch (err) { out.textContent = t('Most nem sikerült beállítani. Próbáld újra egy perc múlva.'); }
          busy(b, false); out.hidden = false;
        });
      } else return;
      ret.hidden = false;
      requestAnimationFrame(() => { ret.scrollIntoView({ block: 'center' }); ret.focus({ preventScroll: true }); });
    })();

    // a rush order is a request: follow it live until the counter answers (GET /orders/:id/status)
    async function rushState(id, token) {
      let st;
      try { st = await api.status(id, token); } catch (e) { return; }
      if (!st.rush) return;
      let box = $('[data-rush]', ret);
      if (!box) { ret.insertAdjacentHTML('beforeend', '<p class="dl-rush-state" data-rush role="status"></p>'); box = $('[data-rush]', ret); }
      const done = ['new', 'making', 'out', 'delivered'].includes(st.status);
      $('h3', ret).textContent = done ? t('Köszönjük, megvan a rendelés!') : t('Megkaptuk a kérést!');
      box.dataset.s = done ? 'ok' : st.status === 'declined' ? 'no' : 'wait';
      box.textContent = done ? t('Elfogadva: kb. {time}-ra ott vagyunk.', { time: clock(st.eta_at) })
        : st.status === 'declined' ? t('Most sajnos nem megy. A zárolást feloldottuk, semmit nem terheltünk a kártyádra.')
        : st.status === 'requested' ? t('Elküldtük a kérést a kávézónak. {time}-ig visszaigazoljuk, mikorra visszük; addig csak zároltuk az összeget.', { time: clock(st.answer_by) })
        : t('Várjuk a fizetés visszaigazolását…');
      if (!done && st.status !== 'declined' && st.status !== 'cancelled') setTimeout(() => rushState(id, token), 5000);
    }

    // 1 · drinks
    const count = (id) => cups.filter((c) => c.id === id).length;
    function renderMenu() {
      const cats = CONFIG.cats.filter((c) => [...menu.values()].some((d) => d.cat === c));
      if (!cats.includes(cat)) cat = cats[0];
      catsEl.innerHTML = cats.map((c) => `<button type="button" class="chip" data-cat="${c}" aria-pressed="${c === cat}">${t(CATS[c] || c)}</button>`).join('');
      menuEl.innerHTML = [...menu.values()].filter((d) => d.cat === cat).map((d) => `
        <li class="dl-item" data-id="${d.id}"><button type="button" class="dl-item__btn" aria-describedby="dl-menu-hint">
          ${d.photo ? `<img src="${d.photo}" alt="" loading="lazy" width="96" height="96">` : `<span class="dl-item__ph">${B.drinkArt ? B.drinkArt(d) : ''}</span>`}
          <span class="dl-item__txt"><b>${esc(d.name)}</b><small>${d.sizes.length ? ft(Math.min(...d.sizes.map((x) => x.price))) : ft(d.price)}</small></span>
          <span class="dl-item__n" aria-hidden="true"></span><span class="visually-hidden" data-n></span>
        </button></li>`).join('');
      syncMenu();
    }
    function syncMenu() {
      $$('.dl-item', menuEl).forEach((li) => { const n = count(li.dataset.id); $('.dl-item__n', li).textContent = n || ''; $('[data-n]', li).textContent = n ? `, ${tn('{n} a kosárban', n)}` : ''; li.classList.toggle('is-on', n > 0); });
    }
    // one order holds at most MAX cups (the server's MAX_CUPS); the limit is only mentioned when it is reached
    const MAX = 50, full = () => cups.length >= MAX;
    const sayFull = () => B.shell.toast?.(t('Egy rendelésbe legfeljebb {n} ital fér.', { n: MAX }));
    function addCups(c, n = 1) {
      n = Math.min(n, MAX - cups.length); if (n <= 0) { sayFull(); return; }
      for (let k = 0; k < n; k += 1) cups.push({ ...c, uid: newCup(c.id).uid, who: '' });
      setErr('cups', ''); result.hidden = true; syncMenu(); renderCups(); summary(); 
    }
    let whoShown = false; // the empty name fields stay red once the guest tried to send
    function renderCups() {
      $('#dl-cups-empty').hidden = !!cups.length; $('#dl-cups-hint').hidden = !cups.length;
      cupsEl.innerHTML = cups.map((c, i) => { const d = menu.get(c.id), extra = cupLine(c).slice(1); return `
        <li class="dl-cup" data-uid="${c.uid}">
          <button type="button" class="dl-cup__name${extra.length ? ' is-set' : ''}" data-custom aria-label="${esc(`${t('Testreszabás')}: ${i + 1}. ${d.name}`)}"><b>${esc(d.name)}</b><small data-price>${esc(cupLine(c).join(' · '))}</small></button>
          <input type="text" class="dl-cup__who" data-k="who" value="${esc(c.who)}" maxlength="24" autocomplete="off" required${whoShown && !c.who.trim() ? ' aria-invalid="true" aria-describedby="err-who"' : ''} placeholder="${t('Név')}" aria-label="${esc(`${t('Név a pohárra')}: ${i + 1}. ${d.name}`)}">
          <span class="dl-cup__qty"><button type="button" data-del aria-label="${esc(`${t('Pohár törlése')}: ${d.name}`)}">−</button><button type="button" data-dup aria-label="${esc(`${t('Még egy ugyanilyen')}: ${d.name}`)}">+</button></span>
          ${cupPills(c, d)}
        </li>`; }).join('');
    }
    catsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; renderMenu(); $(`[data-cat="${cat}"]`, catsEl).focus(); });
    // a tap puts the drink in the basket; a long press (or right click) opens its options with a quantity first
    const openAdd = (id) => {
      if (full()) { sayFull(); return; }
      customize(newCup(id), null, () => $(`.dl-item[data-id="${id}"] button`, menuEl)?.focus(), (n, c) => addCups(c, n), MAX - cups.length);
    };
    let press = null, longDone = false;
    menuEl.addEventListener('pointerdown', (e) => {
      const li = e.target.closest('.dl-item'); if (!li || e.button) return;
      longDone = false; clearTimeout(press?.timer);
      press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { longDone = true; navigator.vibrate?.(12); openAdd(li.dataset.id); }, 450) };
    });
    const unpress = () => { clearTimeout(press?.timer); press = null; };
    menuEl.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) unpress(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => menuEl.addEventListener(ev, unpress));
    menuEl.addEventListener('contextmenu', (e) => { const li = e.target.closest('.dl-item'); if (!li) return; e.preventDefault(); if (!longDone) { unpress(); longDone = true; openAdd(li.dataset.id); } });
    menuEl.addEventListener('click', (e) => {
      const li = e.target.closest('.dl-item'); if (!li) return;
      if (longDone) { longDone = false; return; } // the long press already opened the options
      addCups(newCup(li.dataset.id));
    });
    cupsEl.addEventListener('click', (e) => {
      const li = e.target.closest('.dl-cup'); if (!li) return;
      if (e.target.closest('[data-dup], [data-del]')) result.hidden = true;
      const i = cups.findIndex((c) => c.uid === li.dataset.uid);
      if (e.target.closest('[data-custom]')) {
        const uid = li.dataset.uid;
        customize(cups[i], () => { renderCups(); summary(); }, () => $(`.dl-cup[data-uid="${uid}"] [data-custom]`, cupsEl)?.focus());
        return;
      }
      if (e.target.closest('[data-dup]')) {
        if (!dupCup(i)) return;
        $(`.dl-cup[data-uid="${cups[i + 1].uid}"] .dl-cup__who`, cupsEl)?.focus();
        return;
      }
      if (!e.target.closest('[data-del]')) return;
      delCup(i);
      ($$('[data-del]', cupsEl)[Math.min(i, cups.length - 1)] || $('.dl-item button', menuEl))?.focus();
    });
    // the same edits from the basket card and from the paper bag
    function dupCup(i) {
      if (full()) { sayFull(); return false; }
      cups.splice(i + 1, 0, { ...cups[i], uid: newCup(cups[i].id).uid, who: '' }); syncMenu(); renderCups(); summary();
      return true;
    }
    function delCup(i) { cups.splice(i, 1); syncMenu(); renderCups(); summary(); }
    cupsEl.addEventListener('input', (e) => {
      const li = e.target.closest('.dl-cup'), k = e.target.dataset.k; if (!li || !k) return;
      const c = cups.find((x) => x.uid === li.dataset.uid); readOpt(c, e.target);
      if (k !== 'who') {
        const line = cupLine(c);
        $('[data-price]', li).textContent = line.join(' · '); $('.dl-cup__name', li).classList.toggle('is-set', line.length > 1);
        summary(); return;
      }
      if (whoShown) { if (c.who.trim()) e.target.removeAttribute('aria-invalid'); if (!cups.some((x) => !x.who.trim())) check1('who'); }
    });

    // 2 · when
    const curSlot = () => (slot === 'rush' ? null : (data?.days.find((d) => d.date === day) || { slots: [] }).slots.find((s) => s.id === slot));
    const slotText = () => (slot === 'rush' ? t('Rush — amint lehet') : curSlot() ? `${dayLabel(day)} · ${hm(curSlot().time)}` : '');
    function renderSlots() {
      if (!data) return;
      const rush = data.rush.on && !pickup();
      daysEl.innerHTML = data.days.map((d) => `<button type="button" class="chip" data-day="${d.date}" aria-pressed="${d.date === day && slot !== 'rush'}">${dayLabel(d.date)}</button>`).join('');
      const d0 = data.days.find((x) => x.date === day);
      // a slot whose order deadline has passed is not shown at all (also between two reloads of the page)
      const d = d0 && { ...d0, slots: d0.slots.filter((s) => !gone(s)) };
      const why = { full: t('Betelt'), closed: t('Ezen a napon ekkor nem szállítunk') };
      slotsEl.innerHTML = (rush ? `<label class="dl-slot dl-slot--rush"><input type="radio" name="slot" value="rush"${slot === 'rush' ? ' checked' : ''}><span><b>${t('Rush — amint lehet')}</b><small>${t('Kérésként megy: 10 percen belül visszaigazoljuk, mikorra visszük (általában kb. {m} perc). Addig csak zároljuk az összeget. Legfeljebb {n} ital.', { m: data.rush.eta_min, n: data.rush.max_drinks })}</small></span></label>` : '') +
        (d ? d.slots.map((s) => `<label class="dl-slot${s.status === 'open' ? '' : ' is-off'}"><input type="radio" name="slot" value="${s.id}"${s.id === slot ? ' checked' : ''}${s.status === 'open' ? '' : ' disabled'}><span><b>${hm(s.time)}</b><small>${s.status === 'open' ? `${t('Rendelés {t}-ig', { t: clock(s.cutoff_at) })}` : why[s.status]}</small></span></label>`).join('') : '') ||
        `<p class="dl-state">${t('Most nincs rendelhető időpont. Nézz vissza később!')}</p>`;
    }
    const gone = (s) => s.status === 'past' || (s.cutoff_at && Date.parse(s.cutoff_at) <= Date.now());
    // every 15 s: drop slots whose deadline just passed; a chosen one is unselected
    setInterval(() => {
      if (!data || document.hidden) return;
      const d = data.days.find((x) => x.date === day);
      if (!d || !d.slots.some((s) => s.status !== 'past' && gone(s))) return;
      d.slots.forEach((s) => { if (gone(s)) s.status = 'past'; });
      if (slot && slot !== 'rush' && !d.slots.some((s) => s.id === slot && s.status === 'open')) { slot = null; setErr('slot', t('Erre az időpontra közben lezárult a rendelés. Válassz másikat.')); }
      renderSlots(); summary();
    }, 15000);
    async function loadSlots() {
      if (!data) slotsEl.innerHTML = `<p class="dl-state" role="status">${t('Időpontok betöltése…')}</p>`;
      try {
        data = await api.slots();
        setExtras(data.extras);
        if (data.bookings_open === false) ordersClosed(form);
        else if (data.payments_ready === false) notReady(ret);
        setRules(data.free_from, data.fee); setZone(data.zone_m);
        // a day whose every slot is already past is not offered at all
        data.days = data.days.filter((d) => !d.slots.length || d.slots.some((s) => s.status !== 'past'));
        const open = (d) => d.slots.some((s) => s.status === 'open');
        if (!day || !data.days.some((d) => d.date === day)) { day = (data.days.find(open) || data.days[0] || {}).date || null; if (slot !== 'rush') slot = null; }
        if (slot === 'rush' ? !data.rush.on || pickup() : !curSlot() || curSlot().status !== 'open') slot = null;
        if (!slot) slot = firstOpen(); // the earliest free time is pre-selected
        renderSlots();
        const times = [...new Set(data.days.flatMap((d) => d.slots.map((s) => hm(s.time))))].sort((a, b) => a.padStart(5, '0').localeCompare(b.padStart(5, '0'))).join(' · ');
        $('#dl-fact-slots').textContent = times ? `${t('Időpontok')}: ${times}` : t('Időpontok hamarosan');
      } catch (e) { data = null; slotsEl.innerHTML = `<p class="dl-state" role="alert">${t('Az időpontok most nem érhetők el. Próbáld újra egy perc múlva.')}</p>`; }
      summary();
    }
    const firstOpen = () => (data?.days.find((d) => d.date === day)?.slots || []).find((s) => s.status === 'open' && !gone(s))?.id || null;
    daysEl.addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (!b) return; day = b.dataset.day; slot = firstOpen(); setErr('slot', ''); renderSlots(); summary(); $(`[data-day="${day}"]`, daysEl).focus(); });
    slotsEl.addEventListener('change', (e) => { if (e.target.name !== 'slot') return; slot = e.target.value; setErr('slot', ''); capShown = false; $$('[data-day]', daysEl).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.day === day && slot !== 'rush'))); summary(); });
    // the basket no longer fits the chosen time: say so right away, not only on submit
    const capMsg = () => (!data || !slot ? '' : slot === 'rush' ? (cups.length > data.rush.max_drinks ? t('Rush rendelésben legfeljebb {n} ital lehet.', { n: data.rush.max_drinks }) : '') : curSlot() && cups.length > curSlot().left ? t('Erre az időpontra már nem fér be ennyi ital. Válaszd a következő szabad időpontot.') : '');

    // 1 · delivery or pickup, who pays
    // an invoice only on request: the button opens its fields
    let invOn = false;
    const invRequired = () => false;
    const needInv = () => invOn;
    const invBtn = $('#dl-inv-want');
    const setInv = (on) => { invOn = on; invBtn.setAttribute('aria-expanded', String(on)); $('#dl-inv').hidden = !on; $('span', invBtn).textContent = on ? '−' : '+'; if (!on) INV.forEach((n) => setErr(n, '')); };
    invBtn.addEventListener('click', () => { setInv(!invOn); if (invOn) F('inv_name').focus(); });
    function mode() {
      const pick = pickup();
      const g = kind() === 'group';
      $('#dl-where').hidden = !delivery(); $('#dl-who-pays').hidden = !delivery(); $('#dl-addr-more').hidden = !delivery(); $('#dl-group-hint').hidden = !g;
      if (F('how').value) setErr('how', ''); if (F('pay').value) setErr('pay', '');
      $('#dl-inv-want-txt').textContent = g ? t('Számlát kérek a saját italomról') : t('Számlát kérek');
      if (pick) ['company', 'street', 'floor'].forEach((n) => setErr(n, ''));
      if (pick && slot === 'rush') slot = null;
      payBtn.textContent = g ? t('Csoportos rendelés indítása') : t('Fizetés');
      setErr('slot', ''); capShown = false; renderSlots(); summary();
    }
    form.addEventListener('change', (e) => { if (['pay', 'how', 'inv_want'].includes(e.target.name)) mode(); });
    $('[data-pickup]').addEventListener('click', () => { F('how').value = 'pickup'; mode(); $('input[name="how"][value="pickup"]').focus(); });
    // a building picked on the 3D map: its address goes into the form (or pickup, outside the zone)
    document.addEventListener('dl:pick', (e) => {
      F('how').value = e.detail.pickup ? 'pickup' : 'delivery'; mode();
      if (!e.detail.pickup) {
        F('street').value = e.detail.address; delete F('street').dataset.postcode;
        if (e.detail.inZone) zone = { v: val('street'), zip: '', status: 'in_zone' }; // our own map: no need to ask the address service
        checkZone();
      }
      $('#dl-step-where').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => (e.detail.pickup ? $('input[name="how"][value="pickup"]') : F('street')).focus({ preventScroll: true }), calm ? 0 : 500);
    });
    F('tax_number').addEventListener('blur', (e) => { e.target.value = taxFmt(e.target.value); });

    // summary, the bag (phone), the steps and the pay button follow every change
    function summary() {
      const n = cups.length, sub = cups.reduce((s, c) => s + cupPrice(c), 0), pick = pickup(), fee = n && !pick ? feeFor(n) : 0;
      const row = (k, v, cls) => `<div${cls ? ` class="${cls}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`;
      sum.innerHTML =
        (n ? row(t('Italok'), ft(sub)) : '') +
        (pick ? row(t('Elvitel'), t('a pultnál, díjmentes'))
          : row(t('Kiszállítás'), n ? (fee ? `${ft(fee)}<small>${t('{n} italtól ingyenes', { n: RULES.freeFrom })}</small>` : t('ingyenes')) : `<span class="is-empty">${t('{n} italtól ingyenes, alatta {fee}', { n: RULES.freeFrom, fee: ft(RULES.fee) })}</span>`) +
            `<div class="dl-sum__prog">${progress(n)}</div>`) +
        row(t('Időpont'), slotText() || `<span class="is-empty">${t('Még nincs kiválasztva')}</span>`) +
        row(t('Fizetendő'), ft(sub + fee), 'dl-sum__total');
      const cap = capMsg();
      if (cap) { setErr('slot', cap); capShown = true; } else if (capShown) { setErr('slot', ''); capShown = false; }
      fillBag(n, sub, fee);
      steps();
      // screen readers hear the total once the basket settles, not on every keystroke
      clearTimeout(liveTimer); liveTimer = setTimeout(() => { $('#dl-sum-live').textContent = n ? `${tn('{n} ital', n)}, ${t('Fizetendő')}: ${ft(sub + fee)}` : ''; }, 900);
    }

    // the four steps: a finished one folds to one line with a check once the guest moves on (a time folds when picked)
    const stepEls = $$('.dl-step', form), tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
    stepEls.forEach((el) => {
      $('legend', el).insertAdjacentHTML('beforeend', `<span class="dl-step__sum"></span><button type="button" class="dl-step__edit">${t('Módosítás')}</button>`);
      $('.dl-step__no', el).insertAdjacentHTML('beforeend', tick);
      el.addEventListener('click', (e) => { if (el.classList.contains('is-closed') && e.target.closest('legend')) openStep(el, true); });
    });
    const isOk = (n) => !rules[n](val(n), kind());
    const stepDone = [
      () => pickup() || (delivery() && !!F('pay').value && val('street').length >= 4 && zone.v === val('street') && !!zone.status && zone.status !== 'out_of_zone'),
      () => cups.length > 0,
      () => !!slot && isOk('slot'),
      () => [...(pickup() ? [] : ['floor']), 'name', 'email', ...(invOn ? INV : [])].every(isOk),
    ];
    const stepSum = [
      () => (pickup() ? `${t('Elvitel')} · Csanády u. 4/b` : `${val('street')} · ${kind() === 'group' ? t('Mindenki a sajátját') : t('Egyben fizetek')}`),
      () => `${tn('{n} ital', cups.length)} · ${ft(cups.reduce((x, c) => x + cupPrice(c), 0))}`,
      () => slotText(),
      () => [val('name'), val('email')].filter(Boolean).join(' · '),
    ];
    function steps() {
      stepEls.forEach((el, i) => {
        const ok = stepDone[i]();
        el.classList.toggle('is-done', ok);
        if (!ok) el.classList.remove('is-closed');
        $('.dl-step__sum', el).textContent = ok ? stepSum[i]() : '';
      });
      railSet();
    }
    function openStep(el, focus) { el.classList.remove('is-closed'); if (focus) $('input:not([type="hidden"]):not([disabled]), .dl-item button', el)?.focus({ preventScroll: true }); }
    // steps never fold by themselves (Daniel 2026-11-19: it jumped while scrolling); the pay button is always active and shows what is missing
    // the "Még hiányzik…" line goes as soon as the guest edits anything again
    const editing = () => { if (!sending) result.hidden = true; };
    form.addEventListener('input', () => { editing(); steps(); });
    form.addEventListener('change', steps); // not editing(): a field's late change on blur (Enter to submit) would hide the fresh message

    // the side rail (1-4) and the paper bag (phone): components.js; the bag hides once the basket card is on screen
    const sumCard = $('#dl-sum-card'), orderSec = $('#rendeles');
    const rail = window.DLRail?.mount({ steps: stepEls.map((el) => ({ label: $('.dl-step__t', el)?.textContent || '', target: el })), onGo: (no, el) => { openStep(el); } });
    const curStep = () => { let k = 0; stepEls.forEach((el, i) => { if (el.getBoundingClientRect().top < innerHeight * 0.45) k = i; }); return k; };
    function railSet() { rail?.set({ current: curStep() + 1, done: stepEls.map((el, i) => (el.classList.contains('is-done') ? i + 1 : 0)).filter(Boolean) }); }
    bag = window.DLBag?.mount({ label: (n) => tn('Kosár: {n} ital', n), onCheckout: () => { sumCard.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' }); } }) || null;
    bag?.list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-uid]'); if (!li) return;
      const i = cups.findIndex((c) => c.uid === li.dataset.uid); if (i < 0) return;
      const btns = (k) => $$(`.dl-bag-line [data-${k}]`, bag.list);
      if (e.target.closest('[data-dup]')) { if (dupCup(i)) btns('dup')[i + 1]?.focus(); return; }
      if (e.target.closest('[data-del]')) { delCup(i); btns('del')[Math.min(i, cups.length - 1)]?.focus(); return; }
      if (e.target.closest('[data-custom]')) {
        bag.close();
        customize(cups[i], () => { renderCups(); summary(); }, () => { bag.open(); });
      }
    });
    function fillBag(n, sub, fee) {
      if (!bag) return;
      bag.set(n);
      bag.list.innerHTML = cups.map((c) => { const d = menu.get(c.id), extra = [...cupOpts(c), c.who.trim()].filter(Boolean); return `<li class="dl-bag-line" data-uid="${c.uid}">
        <button type="button" class="dl-bag-line__name" data-custom aria-label="${esc(`${t('Testreszabás')}: ${d.name}`)}"><b>${esc(d.name)}</b>${extra.length ? `<small>${esc(extra.join(' · '))}</small>` : `<small>${t('Testreszabás')}</small>`}</button>
        <span class="dl-bag-line__price">${ft(cupPrice(c))}</span>
        <span class="dl-cup__qty"><button type="button" data-del aria-label="${esc(`${t('Pohár törlése')}: ${d.name}`)}">−</button><button type="button" data-dup aria-label="${esc(`${t('Még egy ugyanilyen')}: ${d.name}`)}">+</button></span></li>`; }).join('') +
        (fee ? `<li><span>${t('Kiszállítás')}</span><span>${ft(fee)}</span></li>` : '');
      bag.total.textContent = ft(sub + fee);
    }
    const place = () => {
      const r = orderSec.getBoundingClientRect(), s2 = sumCard.getBoundingClientRect();
      bag?.hide(s2.top < innerHeight - 80 && s2.bottom > 0); // only while the basket card itself is on screen
      rail?.show(r.top < innerHeight * 0.5 && s2.bottom > innerHeight * 0.3);
      railSet();
    };
    addEventListener('scroll', place, { passive: true }); addEventListener('resize', place);

    // validation
    const BASE = ['how', 'pay', 'street', 'cups', 'who', 'slot', 'floor', 'name', 'email'], PLACE = ['pay', 'street', 'floor'], INV = ['inv_name', 'tax_number', 'zip', 'city', 'inv_street'];
    const rules = {
      cups: (v, k) => (cups.length ? '' : k === 'group' ? t('Add hozzá a saját italodat: a csoportos rendelést is egy itallal indítod.') : t('Válassz legalább egy italt.')),
      who: () => (cups.some((c) => !c.who.trim()) ? t('Írj nevet minden pohárra.') : ''),
      slot: (v, k) => (!slot ? t('Válassz időpontot.') : (k === 'group' || pickup()) && slot === 'rush' ? t('Ehhez a rendeléshez válassz időpontot, ne a rusht.') : capMsg()),
      how: () => (F('how').value ? '' : t('Válaszd ki: kiszállítás vagy elvitel.')),
      pay: () => (F('pay').value ? '' : t('Válaszd ki, ki fizet.')),
      street: (v) => (v.length < 4 ? t('Add meg az utcát és a házszámot.') : zone.v === v && zone.status === 'out_of_zone' ? t(ZONE_OUT) : ''),
      floor: (v) => (v.length >= 1 ? '' : t('Add meg az emeletet.')),
      name: (v) => (v.length >= 2 ? '' : t('Add meg a neved.')),
      email: (v) => (EMAIL.test(v) ? '' : t('Adj meg egy érvényes e-mail-címet.')),
      inv_name: (v, k) => (v.length >= 2 ? '' : !invRequired(k) ? t('Add meg a számlán szereplő nevet.') : t('Add meg a cég nevét.')),
      tax_number: (v, k) => ((!invRequired(k) && !v) || /^\d{8}-\d-\d{2}$/.test(taxFmt(v)) ? '' : t('Az adószám formátuma: 12345678-1-12.')),
      zip: (v) => (/^\d{4}$/.test(v) ? '' : t('A magyar irányítószám 4 számjegy.')),
      city: (v) => (v.length >= 2 ? '' : t('Add meg a várost.')),
      inv_street: (v) => (v.length >= 4 ? '' : t('Add meg az utcát és a házszámot.')),
      terms: () => (F('terms').checked ? '' : t('A rendeléshez el kell fogadnod a feltételeket.')),
    };
    const val = (n) => (F(n) instanceof Element && F(n).type !== 'checkbox' ? F(n).value.trim() : '');
    const LABEL = { how: 'kiszállítás vagy elvitel', pay: 'ki fizet', street: 'cím', cups: 'ital', who: 'név a poharakon', slot: 'időpont', floor: 'emelet', name: 'neved', email: 'e-mail', inv_name: 'számlázási adatok', tax_number: 'számlázási adatok', zip: 'számlázási adatok', city: 'számlázási adatok', inv_street: 'számlázási adatok', terms: 'a feltételek elfogadása' };
    const check1 = (n, k) => {
      const msg = rules[n](val(n), k); setErr(n, msg);
      if (n === 'who') { whoShown = !!msg; $$('[data-k="who"]', cupsEl).forEach((el) => { if (msg && !el.value.trim()) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'err-who'); } else el.removeAttribute('aria-invalid'); }); }
      return !msg;
    };
    // zone: checked when an address is picked or the field is left; only "outside" stops the order
    let zone = { v: '', zip: '', status: null };
    const zoneNote = $('#dl-street-zone');
    async function checkZone() {
      const v = val('street'), zip = F('street').dataset.postcode || '';
      if (v.length < 4) { zoneNote.hidden = true; return; }
      if (zone.v !== v || zone.zip !== zip) {
        const res = await api.checkAddress(v, zip).catch(() => ({ status: 'confirm' }));
        if (val('street') !== v) return; // typed on meanwhile
        zone = { v, zip, status: res.status };
      }
      zoneNote.innerHTML = zone.status === 'in_zone' ? esc(t('Ide szállítunk.')) : zone.status === 'confirm' ? `${esc(t('Ezt a címet nem találtuk a térképen: rendelhetsz, és visszaigazoljuk. Ha bizonytalan vagy,'))} <a href="/kapcsolat/">${esc(t('írj nekünk'))}</a>.` : '';
      zoneNote.dataset.s = zone.status; zoneNote.hidden = zone.status === 'out_of_zone';
      $('#dl-out').hidden = zone.status !== 'out_of_zone';
      check1('street');
      document.dispatchEvent(new CustomEvent('dl:checked', { detail: { address: v } }));
    }
    addressBox(F('street'), checkZone);
    F('street').addEventListener('change', checkZone);
    F('street').addEventListener('input', () => { zoneNote.hidden = true; $('#dl-out').hidden = true; });
    form.addEventListener('focusout', (e) => { const n = e.target.name; if (rules[n] && !['terms', 'slot'].includes(n) && (e.target.value || e.target.getAttribute('aria-invalid'))) check1(n, kind()); });
    F('terms').addEventListener('change', () => check1('terms'));
    const focusBad = (n) => { const el = focusOf(n); el?.closest('.dl-step')?.classList.remove('is-closed'); el?.focus({ preventScroll: true }); el?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' }); };
    const focusOf = (n) => (n === 'how' || n === 'pay' ? $(`input[name="${n}"]`, form) : n === 'street' && !$('#dl-out').hidden ? $('[data-pickup]') : n === 'cups' ? $('.dl-item button', menuEl) : n === 'who' ? $('[data-k="who"][aria-invalid]', cupsEl) : n === 'slot' ? $('input[name="slot"]:not([disabled])', slotsEl) || $('[data-day]', daysEl) : F(n));

    function payload(k) {
      const s = curSlot();
      return { kind: k, pickup: pickup(), date: slot === 'rush' ? today() : day, slot_id: s ? s.id : null, rush: slot === 'rush', items: cups.map(cupItem),
        address: { company: val('company'), street: val('street'), postcode: F('street').dataset.postcode || '', floor: val('floor'), note: val('note') }, contact: { name: val('name'), email: val('email'), phone: '' },
        invoice: needInv(k) ? { name: val('inv_name'), tax_number: val('tax_number'), zip: val('zip'), city: val('city'), street: val('inv_street') } : null, terms: true, lang: B.lang,
        return_path: location.pathname }; // Stripe sends the payer back under this page, wherever the site is mounted
    }
    const problem = (err) => (err.code === 'bookings_closed' ? t(CLOSED) : err.code === 'payments_not_configured' ? t(NOT_READY) : err.code === 'slot_full' ? t('Erre az időpontra már nem fér be ennyi ital. Válaszd a következő szabad időpontot.') : err.code === 'slot_closed' || err.code === 'rush_off' ? t('Ez az időpont közben lezárult. Válassz másikat.') : t('Most nem sikerült elküldeni a rendelést. Próbáld újra egy perc múlva.'));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      const k = kind();
      result.hidden = true;
      F('tax_number').value = taxFmt(F('tax_number').value);
      sending = true; busy(payBtn, true);
      if (!pickup()) await checkZone();
      const bad = [...BASE.filter((n) => delivery() || !PLACE.includes(n)), ...(needInv(k) ? INV : []), 'terms'].filter((n) => !check1(n, k));
      if (bad.length) {
        sending = false; busy(payBtn, false);
        result.textContent = `${t('Még hiányzik')}: ${[...new Set(bad.map((n) => t(LABEL[n] || n)))].join(', ')}.`; result.hidden = false;
        return focusBad(bad[0]);
      }
      const p = payload(k), text = slotText();
      try {
        const res = k === 'company' ? await api.order(p) : await api.createGroup(p);
        try { sessionStorage.setItem(LAST, JSON.stringify({ n: p.items.length, text, company: p.pickup ? t('elvitel') : p.address.company || p.address.street, wd: parse(p.date).getUTCDay(), time: curSlot() ? curSlot().time : '', rush: p.rush })); } catch (err) { /* no storage: the thank-you view is shorter */ }
        if (res.checkout_url) { location.assign(res.checkout_url); return; } // stays busy while the browser leaves
        throw new Error('no_checkout_url'); // a 200 without a payment link is a failure
      } catch (err) {
        if (err.code === 'invalid' && err.fields?.includes('who')) { check1('who'); focusBad('who'); }
        else if (err.code === 'out_of_zone') { zone = { v: val('street'), zip: F('street').dataset.postcode || '', status: 'out_of_zone' }; zoneNote.hidden = true; $('#dl-out').hidden = false; check1('street'); focusBad('street'); }
        else { result.textContent = problem(err); result.hidden = false; result.focus(); if (err.code) loadSlots(); }
      }
      sending = false; busy(payBtn, false);
    });

    mode(); renderCups(); place();
    loadSlots();
    menuEl.innerHTML = `<li class="dl-state" role="status">${t('Itallap betöltése…')}</li>`;
    const menuReady = loadMenu().then(() => { if (!menu.size) throw new Error('empty'); renderMenu(); }).catch(() => { menuEl.innerHTML = `<li class="dl-state" role="alert">${t('Az itallap most nem érhető el. Próbáld újra egy perc múlva.')}</li>`; });

    // signed in: the details of the last order fill the empty fields; "Újra rendelem" (or ?ujra=<id> from /fiok/) also
    // brings back the drinks. Nothing is remembered for guests without an account.
    const again = $('#dl-again');
    function fill(o, all) {
      const set = (n, v) => { const el = F(n); if (el && v != null && (all || !el.value.trim())) el.value = v; };
      if (all) { F('how').value = o.pickup ? 'pickup' : 'delivery'; F('pay').value = o.pickup ? '' : o.kind; setInv(!!o.invoice); mode(); }
      Object.entries({ company: o.address.company, street: o.address.street, floor: o.address.floor, note: o.address.note, name: o.contact.name, email: o.contact.email }).forEach(([n, v]) => set(n, v));
      if (o.invoice && (all || o.kind === kind())) setInv(true);
      if (o.invoice && (all || o.kind === kind())) Object.entries({ inv_name: o.invoice.name, tax_number: o.invoice.tax_number, zip: o.invoice.zip, city: o.invoice.city, inv_street: o.invoice.street }).forEach(([n, v]) => set(n, v));
      if (all) {
        const known = o.items.filter((i) => menu.has(i.product_id));
        cups = known.map((i) => { const d = menu.get(i.product_id); return { ...newCup(i.product_id), who: i.who, milk: d.milks.includes(i.milk) ? i.milk : '', size: d.sizes[i.size] ? i.size : 0, iced: d.temp === 'both' && i.iced, decaf: !!i.decaf, cream: !!i.cream, note: i.note || '' }; });
        setErr('cups', ''); syncMenu(); renderCups(); summary();
        const gone = o.items.length - known.length;
        again.innerHTML = `<p>${esc(tn('Betöltöttük: {n} ital, {company}. Válassz időpontot, és nézd át a többit.', cups.length, { company: o.pickup ? t('elvitel') : o.address.company || o.address.street }))}${gone ? ` ${esc(tn('{n} ital már nincs az itallapon.', gone))}` : ''}</p>`;
      }
      if (val('street') && !pickup()) checkZone();
    }
    (async () => {
      const want = returned(['ujra']).ujra;
      let o = null;
      try { o = await lastOrder(want); } catch (e) { return; }
      if (!o) return;
      await menuReady;
      if (want) { fill(o, true); again.hidden = false; again.scrollIntoView({ block: 'center' }); return; }
      fill(o, false);
      again.innerHTML = `<p>${esc(tn('Legutóbb: {n} ital, {company}.', o.items.length, { company: o.pickup ? t('elvitel') : o.address.company || o.address.street }))}</p><button type="button" class="btn btn--ghost" data-again>${t('Újra rendelem')}</button>`;
      again.hidden = false;
      $('[data-again]', again).addEventListener('click', () => { fill(o, true); again.focus(); });
    })();
    watchDay(loadSlots);
    setInterval(() => { if (!document.hidden && !sending) loadSlots(); }, 60000); // cutoffs pass and rush switches itself off while the page is open
  }

  // link + copy button, used on both pages
  function shareBox(url) {
    return `<div class="dl-share"><label class="visually-hidden" for="dl-share-url">${t('A csoportos rendelés linkje')}</label><input id="dl-share-url" type="text" readonly value="${esc(url)}"><button type="button" class="btn btn--ghost" data-copy>${t('Link másolása')}</button></div><p class="visually-hidden" role="status" data-copied></p>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const input = b.parentNode.querySelector('input');
    let ok = false; try { await navigator.clipboard.writeText(input.value); ok = true; } catch (err) { input.focus(); input.select(); }
    b.textContent = ok ? t('Kimásolva') : t('Jelöld ki és másold');
    const live = b.parentNode.parentNode.querySelector('[data-copied]'); if (live) live.textContent = b.textContent;
    if (ok) setTimeout(() => { b.textContent = t('Link másolása'); }, 2500);
  });
  document.addEventListener('focusin', (e) => { if (e.target.id === 'dl-share-url') e.target.select(); });

  // ---------- group order page ----------
  function groupPage() {
    const root = $('#dl-group-root'), code = (new URLSearchParams(location.search).get('g') || '').toUpperCase();
    const back = returned(['paid', 'cancelled', 'o']);
    // the organiser's key (Stripe return or confirmation email) stays on this device for this group
    const ORG = `bros_dl_org_${code}`;
    let orgTok = back.o || '';
    try { if (orgTok) localStorage.setItem(ORG, orgTok); else orgTok = localStorage.getItem(ORG) || ''; } catch (err) { /* no storage: only this visit */ }
    let g = null, timer = null, cup = null, sending = false, closing = false;
    const FEE_RULE = {
      organiser: 'Ha a határidőig nem gyűlik össze {n} ital, a {fee} kiszállítási díjat a szervező fizeti.',
      split: 'Ha a határidőig nem gyűlik össze {n} ital, a {fee} kiszállítási díjat a résztvevők között osztjuk el.',
      cancel: 'Ha a határidőig nem gyűlik össze {n} ital, a rendelést töröljük, és mindenki visszakapja a pénzét.',
    };
    const left = () => new Date(g.cutoff_at) - Date.now();
    function countdown() {
      const el = $('#dl-count'); if (!el) return;
      const s = Math.max(0, Math.floor(left() / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
      el.textContent = h ? t('{h} óra {m} perc', { h, m }) : t('{m} perc {s} mp', { m, s: String(s % 60).padStart(2, '0') });
      if (s <= 0 && g.status === 'open') load();
    }
    const who = () => (g.participants.length ? `<ul class="dl-who">${g.participants.map((p) => `<li><span><b>${esc(p.name)}</b><small>${p.items.map(esc).join(', ')}</small></span><span class="dl-tag" data-st="${p.paid ? 'paid' : 'wait'}">${p.paid ? t('fizetve') : t('fizetésre vár')}</span></li>`).join('')}</ul>` : `<p class="dl-state">${t('Még senki nem adott hozzá italt. Legyél te az első!')}</p>`);
    // the left column is redrawn on every change; the join form is built once, so a poll never wipes what someone typed
    function view() {
      const open = g.status === 'open', addr = [g.company, g.address.street, g.address.floor].filter(Boolean).map(esc).join(', ');
      setRules(g.free_from, g.fee); setExtras(g.extras);
      let main = $('#dl-g-main'); if (!main) { root.innerHTML = '<div class="dl-g__main" id="dl-g-main"></div>'; main = $('#dl-g-main'); }
      main.innerHTML = `
          <section class="dl-card" aria-labelledby="dl-g-title">
            <p class="dl-g__tags"><span class="dl-tag dl-tag--big" data-st="${open ? 'open' : 'locked'}">${open ? t('Nyitva') : t('Lezárva')}</span></p>
            <h2 id="dl-g-title" tabindex="-1">${dayLabel(g.date)} · ${hm(g.time)}</h2>
            <p class="dl-g__addr">${addr}<br>${t('Szervező')}: ${esc(g.organiser)}</p>
            ${open ? `<p class="dl-g__count"><span>${t('Lezárásig')}</span><b id="dl-count" role="timer"></b></p>` : `<p class="dl-g__locked">${g.closed_early ? t('A szervező elküldte a rendelést, már készítjük. {time}-kor visszük.', { time: hm(g.time) }) : t('A rendelés lezárult, már készítjük. {time}-kor visszük.', { time: hm(g.time) })}</p>`}
            <div class="dl-g__prog"><div id="dl-g-prog">${progress(g.drinks)}</div><p class="fine">${open && g.drinks < g.free_from ? `${t(FEE_RULE[g.fee_rule] || FEE_RULE.organiser, { n: g.free_from, fee: ft(g.fee) })} ${draftPill()}` : !open && g.fee_due ? t('Kiszállítási díj: {fee}.', { fee: ft(g.fee_due) }) : ''}</p></div>
          </section>
          <section class="dl-card" aria-labelledby="dl-who-title">
            <h2 id="dl-who-title">${t('Kik vannak benne')} <span class="dl-g__n">${tn('{n} ital', g.drinks)}</span></h2>
            <div id="dl-who">${who()}</div>
            <p class="visually-hidden" role="status">${tn('{n} ital', g.drinks)}</p>
          </section>
          ${open && orgTok ? `<section class="dl-card dl-g__close" aria-labelledby="dl-close-title"><h2 id="dl-close-title">${t('Mindenki rendelt?')}</h2>
            <p>${t('Szervezőként a határidő előtt is elküldheted: amit eddig kifizettek, azt elkészítjük, és {time}-kor visszük. A még nem fizetett italok kimaradnak.', { time: hm(g.time) })}</p>
            <button type="button" class="btn btn--ghost" data-close-group>${t('Rendelés küldése')}</button><p class="dl-err" role="alert" data-close-err hidden></p></section>` : ''}
          ${open ? `<section class="dl-card dl-card--tint" aria-labelledby="dl-inv-title"><h2 id="dl-inv-title">${t('Hívd meg a kollégákat')}</h2>${shareBox(`${location.origin}${location.pathname}?g=${g.code}`)}</section>` : ''}`;
      clearInterval(timer);
      const form = $('#dl-join');
      if (open) { countdown(); timer = setInterval(countdown, 1000); if (!form) { root.insertAdjacentHTML('beforeend', joinForm()); bindForm(); } }
      else form?.remove();
    }
    function joinForm() {
      const groups = CONFIG.cats.map((c) => [c, [...menu.values()].filter((d) => d.cat === c)]).filter(([, l]) => l.length);
      return `<form class="dl-card dl-join" id="dl-join" novalidate aria-labelledby="dl-join-title">
        <h2 id="dl-join-title">${t('Add hozzá a tiédet')}</h2>
        <div class="dl-fields">
          <div class="dl-field dl-field--wide"><label for="dl-j-name">${t('A neved')}</label><input id="dl-j-name" name="name" type="text" autocomplete="name" required></div>
          <div class="dl-field dl-field--wide"><label for="dl-j-drink">${t('Ital')}</label><select id="dl-j-drink" name="drink"><option value="">${t('Válassz…')}</option>${groups.map(([c, l]) => `<optgroup label="${t(CATS[c] || c)}">${l.map((d) => `<option value="${d.id}">${esc(d.name)} · ${ft(d.sizes.length ? d.sizes[0].price : d.price)}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div class="dl-join__opts dl-field--wide" id="dl-join-opts" hidden></div>
          <div class="dl-field dl-field--wide"><label for="dl-j-email">${t('E-mail')} <i>(${t('ide küldjük a visszaigazolást')})</i></label><input id="dl-j-email" name="email" type="email" autocomplete="email" inputmode="email" required></div>
          <div class="dl-field dl-field--wide"><label for="dl-j-loyalty">${t('Hűségkártyád e-mail-címe')} <i>(${t('nem kötelező')})</i></label><input id="dl-j-loyalty" name="loyalty_email" type="email" autocomplete="email" inputmode="email"><small id="dl-stamp">${t('Ha megadod, a kávéd pecsétet ér a kártyádon.')}</small></div>
        </div>
        <label class="dl-check"><input type="checkbox" name="inv_want"><span>${t('Számlát kérek')}</span></label>
        <div class="dl-fields dl-fields--inv" id="dl-j-inv" hidden>
          <div class="dl-field dl-field--wide"><label for="dl-j-inv-name">${t('Név vagy cégnév')}</label><input id="dl-j-inv-name" name="inv_name" type="text" autocomplete="name"></div>
          <div class="dl-field dl-field--wide"><label for="dl-j-tax">${t('Adószám')} <i>(${t('nem kötelező')})</i></label><input id="dl-j-tax" name="tax_number" type="text" inputmode="numeric" placeholder="12345678-1-12" autocomplete="off"></div>
          <div class="dl-field dl-field--zip"><label for="dl-j-zip">${t('Irányítószám')}</label><input id="dl-j-zip" name="zip" type="text" autocomplete="postal-code" inputmode="numeric" maxlength="4"></div>
          <div class="dl-field"><label for="dl-j-city">${t('Város')}</label><input id="dl-j-city" name="city" type="text" autocomplete="address-level2"></div>
          <div class="dl-field dl-field--wide"><label for="dl-j-inv-street">${t('Számlázási cím: utca, házszám')}</label><input id="dl-j-inv-street" name="inv_street" type="text" autocomplete="off"></div>
        </div>
        <label class="dl-check"><input type="checkbox" name="terms" required><span>${t('Elfogadom az')} <a href="/aszf/" target="_blank" rel="noopener">${t('általános szerződési feltételeket')}</a>.</span></label>
        <button class="btn dl-join__btn" type="submit">${t('Hozzáadom és fizetek')}</button>
        <p class="dl-preview" id="dl-join-result" role="alert" tabindex="-1" hidden></p>
        <p class="fine">${t('Mindenki a saját italát fizeti, online: bankkártyával, Apple Pay-jel vagy Google Pay-jel. Ha számlát kérsz, e-mailben kapod; különben a kávézó pénztárgépe ad nyugtát.')}</p>
      </form>`;
    }
    function bindForm() {
      const form = $('#dl-join'), setErr = errors(form), F = (n) => form.elements[n], opts = $('#dl-join-opts'), btn = $('.dl-join__btn', form), out = $('#dl-join-result');
      window.BROS_TERMS?.bind(form, 'dl', { linkOnly: true });
      if (guestToken()) B.shell.customer.me().then((m) => { if (!m) return; ['name', 'email', 'loyalty_email'].forEach((n) => { if (!F(n).value) F(n).value = n === 'name' ? m.name : m.email; }); }).catch(() => {});
      const price = () => { btn.textContent = cup ? `${t('Hozzáadom és fizetek')} · ${ft(cupPrice(cup))}` : t('Hozzáadom és fizetek'); };
      cup = null;
      const drink = () => {
        cup = F('drink').value && menu.has(F('drink').value) ? newCup(F('drink').value) : null; setErr('drink', '');
        const d = cup && menu.get(cup.id);
        showCup(); opts.hidden = !d; price();
        $('#dl-stamp').textContent = d && d.cat !== 'coffee' && !CONFIG.stampSpecials.includes(d.id) ? t('Ezért az italért nem jár pecsét.') : t('Ha megadod, a kávéd pecsétet ér a kártyádon.');
      };
      F('drink').addEventListener('change', drink);
      const inv = () => F('inv_want').checked, INV = ['inv_name', 'tax_number', 'zip', 'city', 'inv_street'];
      F('inv_want').addEventListener('change', () => { $('#dl-j-inv').hidden = !inv(); if (!inv()) INV.forEach((n) => setErr(n, '')); });
      F('tax_number').addEventListener('blur', (e) => { e.target.value = taxFmt(e.target.value); });
      // the chosen drink as it will be made + "Testreszabás" (milk, decaf, cream, note) in the sheet
      function showCup() {
        if (!cup) { opts.innerHTML = ''; return; }
        const extra = [...cupOpts(cup), cup.note.trim() && `„${cup.note.trim()}”`].filter(Boolean);
        opts.innerHTML = `<p class="dl-join__cup"><span>${esc(extra.length ? extra.join(' · ') : t('Ahogy a pultnál szoktuk.'))}</span><button type="button" class="btn btn--ghost dl-join__custom" data-custom>${sliders}${t('Testreszabás')}</button></p>`;
      }
      opts.addEventListener('click', (e) => { if (e.target.closest('[data-custom]') && cup) customize(cup, () => { showCup(); price(); }, () => $('[data-custom]', opts)?.focus()); });
      const rules = {
        name: (v) => (v.length >= 2 ? '' : t('Add meg a neved.')),
        drink: (v) => (cup && cup.id === v ? '' : t('Válassz egy italt.')), // the cup must be the one the select shows
        email: (v) => (EMAIL.test(v) ? '' : t('Adj meg egy érvényes e-mail-címet.')),
        loyalty_email: (v) => (!v || EMAIL.test(v) ? '' : t('Adj meg egy érvényes e-mail-címet.')),
        inv_name: (v) => (!inv() || v.length >= 2 ? '' : t('Add meg a számlán szereplő nevet.')),
        tax_number: (v) => (!inv() || !v || /^\d{8}-\d-\d{2}$/.test(taxFmt(v)) ? '' : t('Az adószám formátuma: 12345678-1-12.')),
        zip: (v) => (!inv() || /^\d{4}$/.test(v) ? '' : t('A magyar irányítószám 4 számjegy.')),
        city: (v) => (!inv() || v.length >= 2 ? '' : t('Add meg a várost.')),
        inv_street: (v) => (!inv() || v.length >= 4 ? '' : t('Add meg az utcát és a házszámot.')),
        terms: () => (F('terms').checked ? '' : t('A rendeléshez el kell fogadnod a feltételeket.')),
      };
      const check1 = (n) => { const msg = rules[n](F(n).type === 'checkbox' ? '' : F(n).value.trim()); setErr(n, msg); return !msg; };
      form.addEventListener('focusout', (e) => { const n = e.target.name; if (rules[n] && !['drink', 'terms'].includes(n) && (e.target.value || e.target.getAttribute('aria-invalid'))) check1(n); });
      F('terms').addEventListener('change', () => check1('terms'));
      const say = (msg) => { out.textContent = msg; out.hidden = false; out.focus({ preventScroll: true }); out.scrollIntoView({ block: 'nearest' }); };
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); if (sending) return; out.hidden = true;
        const bad = Object.keys(rules).filter((n) => !check1(n));
        if (bad.length) return F(bad[0]).focus();
        sending = true; busy(btn, true);
        try {
          const res = await api.join(g.code, { name: F('name').value.trim(), email: F('email').value.trim(), loyalty_email: F('loyalty_email').value.trim(),
            invoice: inv() ? { name: F('inv_name').value.trim(), tax_number: taxFmt(F('tax_number').value.trim()), zip: F('zip').value.trim(), city: F('city').value.trim(), street: F('inv_street').value.trim() } : null, items: [{ ...cupItem(cup), who: F('name').value.trim() }], terms: true, lang: B.lang, return_path: location.pathname });
          if (res.checkout_url) { location.assign(res.checkout_url); return; } // stays busy while the browser leaves
          throw new Error('no_checkout_url');
        } catch (err) {
          say(err.code === 'bookings_closed' ? t(CLOSED) : err.code === 'payments_not_configured' ? t(NOT_READY) : err.code === 'locked' ? t('A rendelés közben lezárult.') : err.code === 'slot_full' ? t('Erre az időpontra sajnos betelt a hely.') : t('Most nem sikerült hozzáadni. Próbáld újra egy perc múlva.'));
          if (err.code === 'locked') load();
        }
        sending = false; busy(btn, false);
      });
      if (back.paid === '1') say(t('Köszönjük, kifizetve: az italod a listán van. A számlát e-mailben küldjük.'));
      else if (back.cancelled === '1') say(t('A fizetés megszakadt, nem történt terhelés. Az italod nincs a listán: add hozzá újra, ha kéred.'));
      back.paid = back.cancelled = null;
    }
    async function load(soft) {
      try {
        const next = await api.group(code);
        if (soft && g && JSON.stringify(next) === JSON.stringify(g)) return;
        g = next; view();
        if (g.bookings_open === false) ordersClosed($('#dl-join'));
        else if (g.payments_ready === false && g.status === 'open') notReady(root, 'beforebegin');
      } catch (err) {
        if (soft) return;
        clearInterval(timer);
        root.innerHTML = `<section class="dl-card dl-g__none"><h2>${err.code === 'not_found' ? t('Ez a csoportos rendelés nem található.') : t('A csoportos rendelés most nem érhető el.')}</h2><p>${t('Lehet, hogy a link hibás vagy már lejárt. Kérj újat a szervezőtől.')}</p>
          <p class="actions"><a class="link" href="../">Bros Delivery</a></p></section>`;
      }
    }
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-close-group]'); if (!btn || closing) return;
      if (!confirm(t('Elküldöd most a rendelést? Utána már senki nem tud italt hozzáadni.'))) return;
      const fail = (msg) => { const el = $('[data-close-err]', root); if (el) { el.textContent = msg; el.hidden = false; } };
      closing = true; busy(btn, true);
      try { g = await api.close(code, orgTok); view(); $('#dl-g-title')?.focus(); }
      catch (err) {
        if (err.code === 'forbidden') { orgTok = ''; try { localStorage.removeItem(ORG); } catch (x) { /* ignore */ } view(); }
        else if (err.code === 'locked') load();
        else { fail(err.code === 'nothing_paid' ? t('Még egy ital sincs kifizetve, így most nem küldhető el.') : t('Most nem sikerült elküldeni. Próbáld újra egy perc múlva.')); busy(btn, false); }
      }
      closing = false;
    });
    root.innerHTML = `<p class="dl-state" role="status">${t('Csoportos rendelés betöltése…')}</p>`;
    loadMenu().catch(() => {}).then(() => load());
    setInterval(() => { if (!document.hidden) load(true); }, 8000); // the list stays live
    watchDay(() => { if (g) view(); }); // "Ma" / "Holnap" labels
  }

  // ---------- admin ----------
  async function adminPage() {
    if (!B.staff) return;
    await B.staff.guard(); // the board is counter work; saving settings and cancelling need the admin role
    const root = $('#dl-admin'), live = $('#dla-live');
    const ST = ['new', 'making', 'out', 'delivered'], ST_HU = { requested: 'kérés', new: 'új', making: 'készül', out: 'úton', delivered: 'kézbesítve' };
    const NEXT = { new: 'Elkezdem készíteni', making: 'Elindultam vele', out: 'Kézbesítve' }, NEXT_PICKUP = { making: 'Kész, átveheti', out: 'Átvette' }; // pickup: 'out' = ready at the counter
    const pill = (st, pick) => `<span class="dla__pill" data-st="${esc(st)}">${t(pick && st === 'out' ? 'átvehető' : pick && st === 'delivered' ? 'átvette' : ST_HU[st] || st)}</span>`;
    const openIds = new Set();
    let date = today(), dayList = [date], board = null, settings = null, rec = [], working = false;
    const say = (s) => { live.textContent = ''; setTimeout(() => { live.textContent = s; }, 30); };
    const FAIL = 'Nem sikerült. Próbáld újra egy perc múlva.';
    // one admin action at a time; a failure is said out loud and the screen goes back to what the server has
    async function act(fn, ok, part) {
      if (working) return false;
      working = true;
      try { await fn(); await refresh(part); if (ok) say(ok); return true; } catch (e) { await refresh(part).catch(() => {}); say(t(e.code === 'payments_not_configured' ? 'Az online fizetés (Stripe) nincs beállítva, ezért innen nem indítható visszatérítés.' : FAIL)); return false; } finally { working = false; }
    }

    root.innerHTML = `
      <section class="dla__rush" id="dla-rush" aria-labelledby="dla-rush-title"></section>
      <section class="dla__panel dla__panel--board" aria-labelledby="dla-board-title"><h2 id="dla-board-title">${t('Tábla')} <small id="dla-board-date"></small></h2>
        <div class="chips dla__dates" id="dla-dates" role="group" aria-label="${t('Nap')}"></div>
        <p class="fine">${t('Egy későbbi napot választva előre lezárhatsz egy időpontot arra a napra. Ünnepnapokon nincs kiszállítás.')}</p>
        <div class="dla__board" id="dla-board"></div></section>
      <section class="dla__panel" aria-labelledby="dla-slots-title"><h2 id="dla-slots-title">${t('Időpontok')}</h2><p class="fine">${t('Idő, rendelési határidő és hány pohár fér egy körbe. A változás azonnal él a rendelési oldalon.')}</p><div id="dla-slots"></div><p class="dla__msg" id="dla-slots-msg" role="alert"></p></section>
      <section class="dla__panel" aria-labelledby="dla-rec-title"><h2 id="dla-rec-title">${t('Ismétlődő rendelések')}</h2><div class="dla__list" id="dla-rec"></div></section>`;
    const rushEl = $('#dla-rush'), boardEl = $('#dla-board'), datesEl = $('#dla-dates'), slotsEl = $('#dla-slots'), recEl = $('#dla-rec'), slotsMsg = $('#dla-slots-msg');

    function renderRush() {
      const on = board.rush, mins = on && board.rush_until ? Math.max(1, Math.ceil((new Date(board.rush_until) - Date.now()) / 60000)) : 0;
      const sw = $('.dla__switch', rushEl), had = sw && document.activeElement === sw;
      rushEl.innerHTML = `<div><h2 id="dla-rush-title">${t('Azonnali kiszállítás')}</h2><p>${on ? `${t('Bekapcsolva: a vendégek most „amint lehet” kiszállítást is rendelhetnek, nem csak a fix időpontokra.')} <b>${mins ? t('Még {m} perc, utána magától kikapcsol.', { m: mins }) : ''}</b>` : t('Alapból csak a fix időpontokra lehet rendelni. Ha most csendes a kávézó és egyikőtök el tud indulni, kapcsold be: {m} percig a vendégek „amint lehet” kiszállítást kérhetnek. Minden ilyen rendelés kérés: itt csipog, és 10 percen belül elfogadod (15 / 20 / 30 perc vagy időpont) vagy elutasítod; addig csak zároljuk az összeget. Utána magától kikapcsol.', { m: CONFIG.rushOffMin })}</p></div>
        <button type="button" class="dla__switch" role="switch" aria-checked="${on}" aria-labelledby="dla-rush-title"><i aria-hidden="true"></i><span>${on ? t('BE') : t('KI')}</span></button>`;
      const reqs = board.slots.flatMap((c) => c.orders).filter((o) => o.status === 'requested');
      if (reqs.length) rushEl.insertAdjacentHTML('beforeend', `<a class="dla__alert" href="#req-${reqs[0].id}">${tn('Új azonnali kérés: {n}', reqs.length)} · ${t('válasz {time}-ig', { time: clock(reqs[0].answer_by) })} →</a>`);
      rushEl.classList.toggle('is-on', on);
      if (had) $('.dla__switch', rushEl).focus();
    }
    function renderBoard() {
      const isToday = date === today();
      $('#dla-board-date').textContent = dLong.format(parse(date));
      datesEl.innerHTML = dayList.map((d) => `<button type="button" class="chip" data-date="${d}" aria-pressed="${d === date}">${dayLabel(d)}</button>`).join('');
      boardEl.innerHTML = board.slots.length ? board.slots.map((s) => `
        <div class="dla__col${s.status === 'closed' ? ' is-closed' : ''}">
          <div class="dla__col-head"><h3>${s.rush ? 'Rush' : hm(s.time)}</h3><p>${tn('{n} ital', s.drinks)}${s.rush ? '' : ` / ${s.capacity} · ${t('határidő')} ${clock(s.cutoff_at)}`}</p>
            <div class="dla__bar" aria-hidden="true"><i style="width:${Math.min(100, Math.round(s.drinks / Math.max(1, s.capacity) * 100))}%"></i></div>
            ${s.rush ? '' : `<button type="button" class="dla__mini" data-close="${s.id}" aria-pressed="${s.status === 'closed'}">${s.status === 'closed' ? t('Lezárva · megnyitom') : isToday ? t('Lezárom mára') : t('Lezárom erre a napra')}</button>`}</div>
          ${s.orders.length ? s.orders.map((o) => `
            <details class="dla__order${o.status === 'requested' ? ' is-request' : ''}" id="req-${o.id}" data-id="${o.id}"${openIds.has(o.id) || o.status === 'requested' ? ' open' : ''}>
              <summary><span><b>${esc(o.company)}</b><small>${o.id} · ${tn('{n} ital', o.drinks)} · ${o.pickup ? t('ELVITEL') : o.type === 'company' ? t('cég fizet') : t('csoportos')}${o.eta_at ? ` · ${t('érkezés kb. {time}', { time: clock(o.eta_at) })}` : ''}</small></span>${pill(o.status, o.pickup)}</summary>
              <ul>${o.cups.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
              <p>${esc(o.address)} · ${esc(o.contact)}${o.note ? `<br>${esc(t(o.note))}` : ''}</p>
              ${o.status === 'requested' ? `<div class="dla__answer" role="group" aria-label="${t('Mikorra visszük?')}">
                <p><b>${t('Mikorra visszük?')}</b> ${t('Válasz {time}-ig, utána magától elutasítjuk.', { time: clock(o.answer_by) })}</p>
                <div class="dla__answer-row">${[15, 20, 30].map((m) => `<button type="button" class="btn" data-ans="${o.id}" data-min="${m}">${t('{m} perc', { m })}</button>`).join('')}</div>
                <div class="dla__answer-row"><label class="dla__at"><span>${t('vagy ekkorra')}</span><input type="time" data-at="${o.id}"></label><button type="button" class="btn btn--ghost" data-ans="${o.id}" data-time>${t('Elfogadom')}</button></div>
                <button type="button" class="dla__mini" data-ans="${o.id}" data-no>${t('Most nem megy')}</button></div>` : ''}
              ${NEXT[o.status] ? `<button type="button" class="btn" data-next="${o.id}" data-to="${ST[ST.indexOf(o.status) + 1]}">${t((o.pickup && NEXT_PICKUP[o.status]) || NEXT[o.status])}</button>` : ''}
              ${NEXT[o.status] ? `<button type="button" class="dla__mini" data-cancel="${o.id}">${t('Törlés és teljes visszatérítés')}</button>` : ''}
            </details>`).join('') : `<p class="dla__empty">${t('Erre az időpontra még nincs rendelés.')}</p>`}
        </div>`).join('') : `<p class="dla__empty">${t('Nincs beállított időpont.')}</p>`;
    }
    function renderSlots(focus) {
      slotsEl.innerHTML = `<div class="dla__slots">${settings.slots.map((s, i) => `
        <fieldset class="dla__slot" data-i="${i}"><legend class="visually-hidden">${t('Időpont')} ${hm(s.time)}</legend>
          <label><span>${t('Idő')}</span><input type="time" data-f="time" value="${s.time}" min="${CONFIG.slotHours[0]}" max="${CONFIG.slotHours[1]}" required></label>
          <label><span>${t('Határidő (perc)')}</span><input type="number" data-f="cutoffMin" value="${s.cutoffMin}" min="0" max="600" step="5" inputmode="numeric"></label>
          <label><span>${t('Pohár')}</span><input type="number" data-f="capacity" value="${s.capacity}" min="0" max="99" inputmode="numeric"></label>
          <button type="button" class="dla__del" data-del="${i}" aria-label="${esc(`${t('Időpont törlése')}: ${hm(s.time)}`)}">${cross}</button>
        </fieldset>`).join('')}</div>
        <button type="button" class="btn btn--ghost" data-add>${t('Új időpont')}</button>
        <fieldset class="dla__days"><legend>${t('Szállítási napok')} <small>${t('(vasárnap zárva a kávézó)')}</small></legend>${[1, 2, 3, 4, 5, 6].map((d) => `<label class="dl-pill"><input type="checkbox" data-day="${d}"${settings.days.includes(d) ? ' checked' : ''}><span>${WD[d]}</span></label>`).join('')}</fieldset>`;
      if (focus) $(focus, slotsEl)?.focus();
    }
    const ruleText = (r) => (r === 'weekdays' ? t('minden munkanapon') : EVERY[r]);
    // pages of 8 so a long list of regular offices stays short; the page survives a refresh
    let recPage = 0;
    const REC_PER = 8;
    function renderRec() {
      const pages = Math.max(1, Math.ceil(rec.length / REC_PER));
      recPage = Math.min(recPage, pages - 1);
      recEl.innerHTML = (rec.slice(recPage * REC_PER, recPage * REC_PER + REC_PER).map((r) => `<div class="dla__rec${r.active ? '' : ' is-paused'}"><span><b>${esc(r.company)}</b><small>${ruleText(r.rule)} · ${hm(r.time)} · ${tn('{n} ital', r.drinks)}</small></span>
        <span class="dla__pill" data-st="${r.active ? 'on' : 'off'}">${r.active ? t('aktív') : t('szünetel')}</span><button type="button" class="dla__mini" data-rec="${r.id}" data-to="${!r.active}">${r.active ? t('Szüneteltetés') : t('Folytatás')}</button></div>`).join('') || `<p class="dla__empty">${t('Még nincs ismétlődő rendelés.')}</p>`)
        + (pages > 1 ? `<nav class="dla__pager" aria-label="${t('Oldalak')}"><button type="button" class="dla__mini" data-rec-page="-1"${recPage ? '' : ' disabled'}>‹ ${t('Előző')}</button><span>${recPage + 1} / ${pages}</span><button type="button" class="dla__mini" data-rec-page="1"${recPage < pages - 1 ? '' : ' disabled'}>${t('Következő')} ›</button></nav>` : '');
    }
    // the days the board can show: today and the next delivery days
    const loadDays = async () => { dayList = [...new Set([today(), ...(await api.slots()).days.map((d) => d.date)])].sort(); if (!dayList.includes(date)) date = dayList[0]; };
    async function refresh(part) {
      if (!part) await loadDays();
      if (!part || part === 'board') { board = await api.admin.board(date); renderRush(); renderBoard(); alarm(); }
      if (!part || part === 'settings') { settings = await api.admin.settings(); if (!part) renderSlots(); rec = (await api.admin.recurring()).recurring; renderRec(); }
    }

    rushEl.addEventListener('click', async (e) => {
      if (!e.target.closest('.dla__switch')) return;
      const on = !board.rush;
      if (await act(() => api.admin.setRush(on), on ? t('Azonnali kiszállítás bekapcsolva, {m} perc múlva magától kikapcsol', { m: CONFIG.rushOffMin }) : t('Azonnali kiszállítás kikapcsolva'), 'board')) $('.dla__switch', rushEl).focus();
    });
    datesEl.addEventListener('click', async (e) => { const b = e.target.closest('[data-date]'); if (!b || working) return; date = b.dataset.date; await act(async () => {}, '', 'board'); $(`[data-date="${date}"]`, datesEl)?.focus(); });
    boardEl.addEventListener('toggle', (e) => { const d = e.target.closest('.dla__order'); if (d) d.open ? openIds.add(d.dataset.id) : openIds.delete(d.dataset.id); }, true);
    boardEl.addEventListener('click', async (e) => {
      const next = e.target.closest('[data-next]'), close = e.target.closest('[data-close]'), cancel = e.target.closest('[data-cancel]'), ans = e.target.closest('[data-ans]');
      if (ans) {
        const id = ans.dataset.ans;
        let body, ok;
        if (ans.hasAttribute('data-no')) {
          if (!confirm(t('{id}: most nem visszük? A vendég kártyáján feloldjuk a zárolást.', { id }))) return;
          body = { accept: false }; ok = t('{id}: elutasítva, a zárolás feloldva', { id });
        } else if (ans.hasAttribute('data-time')) {
          const v = $(`[data-at="${id}"]`, boardEl).value;
          if (!/^\d\d:\d\d$/.test(v)) { say(t('Adj meg egy időpontot.')); $(`[data-at="${id}"]`, boardEl).focus(); return; }
          body = { time: v }; ok = t('{id}: elfogadva, érkezés kb. {time}', { id, time: hm(v) });
        } else { body = { minutes: Number(ans.dataset.min) }; ok = t('{id}: elfogadva, {m} perc', { id, m: ans.dataset.min }); }
        busy(ans, true);
        if (!(await act(() => api.admin.answer(id, body), ok, 'board'))) say(t('{id}: ez a kérés közben lezárult vagy nem sikerült a terhelés. Nézd meg a táblát.', { id }));
        $(`[data-id="${id}"] summary`, boardEl)?.focus();
      } else if (cancel) {
        const id = cancel.dataset.cancel;
        if (!confirm(t('{id}: töröljük a rendelést, és mindenki visszakapja a teljes összeget?', { id }))) return;
        busy(cancel, true);
        await act(() => api.admin.cancelOrder(id), t('{id}: törölve, visszatérítve', { id }), 'board');
      } else if (next) {
        const id = next.dataset.next, to = next.dataset.to; busy(next, true);
        await act(() => api.admin.setStatus(id, to), `${id}: ${t(ST_HU[to])}`, 'board');
        ($(`[data-next="${id}"]`, boardEl) || $(`[data-id="${id}"] summary`, boardEl))?.focus();
      } else if (close) {
        const id = close.dataset.close, closed = close.getAttribute('aria-pressed') !== 'true';
        await act(() => api.admin.closeSlot(date, id, closed), `${dayLabel(date)} · ${hm(board.slots.find((s) => s.id === id).time)}: ${closed ? t('lezárva') : t('nyitva')}`, 'board');
        $(`[data-close="${id}"]`, boardEl)?.focus();
      }
    });
    // a slot must be inside the opening hours and no two slots may share a time
    const slotProblem = () => { const times = settings.slots.map((s) => s.time); return times.some((x) => x < CONFIG.slotHours[0] || x > CONFIG.slotHours[1]) ? t('Az időpont a nyitvatartáson belül legyen ({a}–{b}).', { a: hm(CONFIG.slotHours[0]), b: CONFIG.slotHours[1] }) : new Set(times).size !== times.length ? t('Két időpont nem lehet ugyanakkor.') : ''; };
    async function save(focus) {
      const bad = slotProblem();
      slotsMsg.textContent = bad;
      if (bad) return; // nothing is saved until it is valid; the fields keep what was typed
      const ok = await act(() => api.admin.saveSettings(settings), t('Mentve'), 'settings');
      if (!ok) { slotsMsg.textContent = t('Nem sikerült menteni. Próbáld újra.'); renderSlots(focus); } else { board = await api.admin.board(date).catch(() => board); renderBoard(); }
    }
    slotsEl.addEventListener('change', (e) => {
      const f = e.target.dataset.f, day = e.target.dataset.day;
      if (f) {
        const s = settings.slots[e.target.closest('[data-i]').dataset.i];
        if (f === 'time') { if (!/^\d\d:\d\d$/.test(e.target.value)) { e.target.value = s.time; return; } s.time = e.target.value; }
        else { const n = Math.max(0, Math.round(Number(e.target.value)) || 0); s[f] = n; e.target.value = n; }
      } else if (day != null) settings.days = $$('[data-day]:checked', slotsEl).map((c) => Number(c.dataset.day));
      else return;
      save();
    });
    slotsEl.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { settings.slots.splice(Number(del.dataset.del), 1); renderSlots('[data-add]'); save('[data-add]'); }
      else if (e.target.closest('[data-add]')) {
        // the first free half hour after the last slot, inside the opening hours
        const used = new Set(settings.slots.map((s) => s.time)), last = settings.slots[settings.slots.length - 1], toMin = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)), toStr = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        let m = last ? toMin(last.time) + 60 : toMin(CONFIG.newSlot.time);
        const lo = toMin(CONFIG.slotHours[0]), hi = toMin(CONFIG.slotHours[1]);
        for (let i = 0; i < 48 && (m > hi || m < lo || used.has(toStr(m))); i++) m = m + 30 > hi ? lo : m + 30;
        settings.slots.push({ id: `s${Date.now().toString(36)}`, time: toStr(m), cutoffMin: last ? last.cutoffMin : CONFIG.newSlot.cutoffMin, capacity: last ? last.capacity : CONFIG.newSlot.capacity });
        const sel = `[data-i="${settings.slots.length - 1}"] input`; renderSlots(sel); save(sel);
      }
    });
    recEl.addEventListener('click', async (e) => {
      const pg = e.target.closest('[data-rec-page]');
      if (pg) { recPage += Number(pg.dataset.recPage); renderRec(); return; }
      const b = e.target.closest('[data-rec]'); if (!b) return;
      const id = b.dataset.rec, on = b.dataset.to === 'true';
      await act(() => api.admin.setRecurring(id, on), on ? t('aktív') : t('szünetel'), 'settings'); $(`[data-rec="${id}"]`, recEl)?.focus();
    });
    // a new rush request: a short double beep and a marked tab title (the browser allows sound after the first tap)
    const seen = new Set();
    let audio = null;
    addEventListener('pointerdown', () => { try { audio = audio || new AudioContext(); audio.resume(); } catch (e) { /* no audio */ } }, { once: true });
    function alarm() {
      const reqs = (board?.slots || []).flatMap((c) => c.orders).filter((o) => o.status === 'requested').map((o) => o.id);
      const fresh = reqs.filter((id) => !seen.has(id));
      reqs.forEach((id) => seen.add(id));
      document.title = `${reqs.length ? '● ' : ''}${document.title.replace(/^● /, '')}`;
      if (!fresh.length || !audio) return;
      try { [0, 0.25].forEach((at) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; g.gain.value = 0.2; o.connect(g).connect(audio.destination); o.start(audio.currentTime + at); o.stop(audio.currentTime + at + 0.15); }); } catch (e) { /* no audio */ }
      say(tn('Új azonnali kérés: {n}', fresh.length));
    }
    const first = () => refresh().catch(() => { boardEl.innerHTML = `<p class="dla__empty" role="alert">${t('Az adatok most nem érhetők el. Próbáld újra egy perc múlva.')}</p>`; });
    first();
    watchDay(() => { date = today(); first(); }); // the board left open overnight moves to the new day
    // new orders, cutoffs, the rush countdown: redraw only what changed, so the poll never steals the focus
    setInterval(async () => {
      if (working || !board) return; // also in a background tab: a rush request must not wait
      try { const next = await api.admin.board(date), same = JSON.stringify(next.slots) === JSON.stringify(board.slots); if (working) return; board = next; renderRush(); if (!same) renderBoard(); alarm(); } catch (e) { /* next round */ }
    }, 15000);
  }

  // ---------- the guest cancels (link in the confirmation email and on /fiok/): until the order deadline, minus the fee ----------
  async function cancelPage() {
    const root = $('#dl-cancel'), token = new URLSearchParams(location.search).get('t') || '';
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    let working = false, info = null;
    const view = (r, done, error) => {
      const o = r.order, deadline = clock(o.deadline);
      root.innerHTML = `
        <h2 id="dl-cx-title" tabindex="-1">${o.time ? `${dayLabel(o.date)} · ${hm(o.time)}` : dayLabel(o.date)}</h2>
        <p class="dl-g__addr">${esc(o.place)}</p>
        <dl class="dl-sum__list">
          ${row(t('Azonosító'), esc(o.id))}
          ${row(t('Italok'), r.drinks.map(esc).join('<br>'))}
          ${row(t('Kifizetve'), ft(r.amount))}
          ${r.fee_huf ? row(t('Kezelési költség'), `−${ft(r.fee_huf)} <small>${t('a befizetett összeg {p}%-a', { p: r.fee_percent })}</small>`) : ''}
          ${row(t('Visszatérítés'), `<b>${ft(r.refund_huf)}</b>`)}
        </dl>
        ${done ? `<p class="dl-preview" role="status" tabindex="-1">${t('Lemondtuk. A visszatérítés ({sum}) néhány napon belül megérkezik a kártyádra. E-mailben is elküldtük.', { sum: ft(r.refund_huf) })}</p>`
          : `<p class="fine">${r.organiser && o.kind === 'group' ? (r.others ? tn('Szervezőként az egész csoportos rendelést lemondod: {n} kolléga a teljes összeget visszakapja.', r.others) : t('Szervezőként az egész csoportos rendelést lemondod.')) : o.kind === 'group' ? t('Csak a saját italodat mondod le, a csoportos rendelés megy tovább.') : t('Az egész rendelést lemondod.')}
            ${t('{time}-ig mondhatod le, utána már készítjük.', { time: deadline })}</p>
          ${error ? `<p class="dl-err" role="alert">${t('Most nem sikerült lemondani. Próbáld újra egy perc múlva, vagy írj nekünk: hello@broscafe.hu')}</p>` : ''}
          <div class="dl-cx__actions"><button type="button" class="btn" data-confirm>${t('Lemondom')}</button><a class="btn btn--ghost" href="/delivery/">${t('Mégsem, megtartom')}</a></div>`}`;
      if (done) $('.dl-preview', root).focus(); else if (error) $('[data-confirm]', root).focus();
    };
    try { if (!token) throw new Error('no_token'); info = await api.cancelInfo(token); view(info); }
    catch (e) { root.innerHTML = `<p role="alert">${e.status === 410 ? t('Ezt a rendelést már nem lehet online lemondani: lejárt a határidő, vagy már le van mondva. Ha kérdésed van, írj nekünk: hello@broscafe.hu') : t('Ez a lemondó link nem érvényes. Írj nekünk: hello@broscafe.hu')}</p>`; return; }
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-confirm]'); if (!btn || working) return;
      working = true; busy(btn, true);
      try { view(await api.cancelConfirm(token), true); } catch (err) { if (err.status === 410) { root.innerHTML = `<p role="alert">${t('Ezt a rendelést már nem lehet online lemondani: lejárt a határidő, vagy már le van mondva. Ha kérdésed van, írj nekünk: hello@broscafe.hu')}</p>`; } else view(info, false, true); }
      working = false;
    });
  }

  const view = document.body.dataset.dl;
  if (view === 'order') orderPage();
  else if (view === 'group') groupPage();
  else if (view === 'admin') adminPage();
  else if (view === 'cancel') cancelPage();
})();
