// Bros Delivery: the order page (delivery/), the group order page (delivery/csoport/) and the admin page
// (admin/delivery/). Spec: docs/delivery.md · backend contract: docs/delivery-api.md
(() => {
  const B = window.BROS, { esc, ft } = B.shell;
  const t = B.t, loc = B.locale;
  const tn = (key, n, vars) => t(B.en && n === 1 ? `${key}|1` : key, { n, ...vars }); // English singular: "1 drink"
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 619.98px)');

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
    menuShow: 4,            // drinks listed per category on a phone before "show all"
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
  // a cup: { id, who, milk, size, iced }
  const newCup = (id) => ({ uid: Math.random().toString(36).slice(2, 9), id, who: '', milk: '', size: 0, iced: false });
  const cupPrice = (c) => { const d = menu.get(c.id); return (d.sizes[c.size] ? d.sizes[c.size].price : d.price) + (c.milk ? CONFIG.milkExtra : 0); };
  const cupLabel = (c) => { const d = menu.get(c.id); return [d.name, d.sizes[c.size] && d.sizes[c.size].label, c.milk && t(MILKS[c.milk] || c.milk), c.iced && t('jeges')].filter(Boolean).join(' · '); };
  const cupItem = (c) => ({ product_id: c.id, who: c.who.trim(), milk: c.milk, size: c.size, iced: c.iced });
  function optionSelects(d, c) {
    const sel = (k, label, opts) => `<select data-k="${k}" aria-label="${esc(`${t(label)}: ${d.name}`)}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(c[k]) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return (d.sizes.length ? sel('size', 'Méret', d.sizes.map((s, i) => [i, `${s.label} · ${ft(s.price)}`])) : '') +
      (d.milks.length ? sel('milk', 'Tej', [['', t('Tehéntej')], ...d.milks.map((m) => [m, t(MILKS[m] || m)])]) : '') +
      (d.temp === 'both' ? sel('iced', 'Forró vagy jeges', [['false', t('Forró')], ['true', t('Jeges')]]) : '');
  }
  const readOpt = (c, el) => { const k = el.dataset.k; c[k] = k === 'size' ? Number(el.value) : k === 'iced' ? el.value === 'true' : el.value; };

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
    });
    addressBox(zf.elements.address, () => zf.requestSubmit());

    const form = $('#dl-form'), F = (n) => form.elements[n], setErr = errors(form);
    window.BROS_TERMS?.bind(form, 'dl');
    const menuEl = $('#dl-menu'), moreEl = $('#dl-more'), catsEl = $('#dl-cats'), cupsEl = $('#dl-cups'), daysEl = $('#dl-days'), slotsEl = $('#dl-slots'), sum = $('#dl-sum'), result = $('#dl-result'), ret = $('#dl-return'), payBtn = $('#dl-pay');
    let cups = [], cat = CONFIG.cats[0], showAll = false, data = null, day = null, slot = null, capShown = false, sending = false, liveTimer = null; // slot: a slot id or 'rush'
    const kind = () => F('pay').value;

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
      const all = [...menu.values()].filter((d) => d.cat === cat), cut = phone.matches && !showAll && all.length > CONFIG.menuShow + 1;
      const list = cut ? all.filter((d, i) => i < CONFIG.menuShow || count(d.id)) : all;
      menuEl.innerHTML = list.map((d) => `
        <li class="dl-item" data-id="${d.id}">
          ${d.photo ? `<img src="${d.photo}" alt="" loading="lazy" width="96" height="96">` : `<span class="dl-item__ph">${B.drinkArt ? B.drinkArt(d) : ''}</span>`}
          <span class="dl-item__txt"><b>${esc(d.name)}</b><small>${d.sizes.length ? d.sizes.map((x) => ft(x.price)).join(' / ') : ft(d.price)}</small></span>
          <span class="dl-qty"><button type="button" data-step="-1" aria-label="${esc(`${t('Eggyel kevesebb')}: ${d.name}`)}">−</button><output aria-label="${esc(`${d.name}: ${t('darab')}`)}">0</output><button type="button" data-step="1" aria-label="${esc(`${t('Eggyel több')}: ${d.name}`)}">+</button></span>
        </li>`).join('');
      moreEl.hidden = list.length === all.length;
      $('button', moreEl).textContent = t('Mind a(z) {n} ital ebben a kategóriában', { n: all.length });
      syncMenu();
    }
    function syncMenu() {
      $$('.dl-item', menuEl).forEach((li) => { const n = count(li.dataset.id); $('output', li).textContent = n; li.classList.toggle('is-on', n > 0); $('[data-step="-1"]', li).setAttribute('aria-disabled', n ? 'false' : 'true'); });
    }
    let whoShown = false; // the empty name fields stay red once the guest tried to send
    function renderCups() {
      $('#dl-cups-wrap').hidden = !cups.length;
      cupsEl.innerHTML = cups.map((c, i) => { const d = menu.get(c.id); return `
        <li class="dl-cup" data-uid="${c.uid}">
          <span class="dl-cup__no" aria-hidden="true">${i + 1}</span>
          <span class="dl-cup__name"><b>${esc(d.name)}</b><small data-price>${ft(cupPrice(c))}</small></span>
          <button type="button" class="dl-cup__del" data-del aria-label="${esc(`${t('Pohár törlése')}: ${d.name}`)}">${cross}</button>
          <div class="dl-cup__opts"><input type="text" data-k="who" value="${esc(c.who)}" maxlength="24" autocomplete="off" required${whoShown && !c.who.trim() ? ' aria-invalid="true" aria-describedby="err-who"' : ''} placeholder="${t('Név a pohárra')}" aria-label="${esc(`${t('Név a pohárra')}: ${i + 1}. ${d.name}`)}">${optionSelects(d, c)}</div>
        </li>`; }).join('');
    }
    catsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; showAll = false; renderMenu(); $(`[data-cat="${cat}"]`, catsEl).focus(); });
    moreEl.addEventListener('click', () => { const n = $$('.dl-item', menuEl).length; showAll = true; renderMenu(); $$('.dl-item [data-step="1"]', menuEl)[n]?.focus(); });
    menuEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]'); if (!b) return;
      const id = b.closest('.dl-item').dataset.id;
      if (b.dataset.step === '1') cups.push(newCup(id));
      else { const i = cups.map((c) => c.id).lastIndexOf(id); if (i < 0) return; cups.splice(i, 1); }
      setErr('cups', ''); syncMenu(); renderCups(); summary();
    });
    cupsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      const i = cups.findIndex((c) => c.uid === b.closest('.dl-cup').dataset.uid);
      cups.splice(i, 1); syncMenu(); renderCups(); summary();
      ($$('[data-del]', cupsEl)[Math.min(i, cups.length - 1)] || $('[data-step="1"]', menuEl))?.focus();
    });
    cupsEl.addEventListener('input', (e) => {
      const li = e.target.closest('.dl-cup'); if (!li || !e.target.dataset.k) return;
      const c = cups.find((x) => x.uid === li.dataset.uid); readOpt(c, e.target);
      $('[data-price]', li).textContent = ft(cupPrice(c)); summary();
      if (whoShown && e.target.dataset.k === 'who') { if (c.who.trim()) e.target.removeAttribute('aria-invalid'); if (!cups.some((x) => !x.who.trim())) check1('who'); }
    });

    // 2 · when
    const curSlot = () => (slot === 'rush' ? null : (data?.days.find((d) => d.date === day) || { slots: [] }).slots.find((s) => s.id === slot));
    const slotText = () => (slot === 'rush' ? t('Rush — amint lehet') : curSlot() ? `${dayLabel(day)} · ${hm(curSlot().time)}` : '');
    function renderSlots() {
      if (!data) return;
      const rush = data.rush.on;
      daysEl.innerHTML = data.days.map((d) => `<button type="button" class="chip" data-day="${d.date}" aria-pressed="${d.date === day && slot !== 'rush'}">${dayLabel(d.date)}</button>`).join('');
      const d0 = data.days.find((x) => x.date === day);
      // a slot whose order deadline has passed is not shown at all (also between two reloads of the page)
      const d = d0 && { ...d0, slots: d0.slots.filter((s) => !gone(s)) };
      const why = { full: t('Betelt'), closed: t('Ezen a napon ekkor nem szállítunk') };
      slotsEl.innerHTML = (rush ? `<label class="dl-slot dl-slot--rush"><input type="radio" name="slot" value="rush"${slot === 'rush' ? ' checked' : ''}><span><b>${t('Rush — amint lehet')}</b><small>${t('Kérésként megy: 10 percen belül visszaigazoljuk, mikorra visszük (általában kb. {m} perc). Addig csak zároljuk az összeget. Legfeljebb {n} ital.', { m: data.rush.eta_min, n: data.rush.max_drinks })}</small></span></label>` : '') +
        (d ? d.slots.map((s) => `<label class="dl-slot${s.status === 'open' ? '' : ' is-off'}"><input type="radio" name="slot" value="${s.id}"${s.id === slot ? ' checked' : ''}${s.status === 'open' ? '' : ' disabled'}><span><b>${hm(s.time)}</b><small>${s.status === 'open' ? `${t('Rendelés {t}-ig', { t: clock(s.cutoff_at) })} · ${tn('még {n} pohár fér', s.left)}` : why[s.status]}</small></span></label>`).join('') : '') ||
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
        if (data.bookings_open === false) ordersClosed(form);
        else if (data.payments_ready === false) notReady(ret);
        setRules(data.free_from, data.fee); setZone(data.zone_m);
        // a day whose every slot is already past is not offered at all
        data.days = data.days.filter((d) => !d.slots.length || d.slots.some((s) => s.status !== 'past'));
        const open = (d) => d.slots.some((s) => s.status === 'open');
        if (!day || !data.days.some((d) => d.date === day)) { day = (data.days.find(open) || data.days[0] || {}).date || null; if (slot !== 'rush') slot = null; }
        if (slot === 'rush' ? !data.rush.on : !curSlot() || curSlot().status !== 'open') slot = null;
        renderSlots();
        const times = [...new Set(data.days.flatMap((d) => d.slots.map((s) => hm(s.time))))].sort((a, b) => a.padStart(5, '0').localeCompare(b.padStart(5, '0'))).join(' · ');
        $('#dl-fact-slots').textContent = times ? `${t('Időpontok')}: ${times}` : t('Időpontok hamarosan');
      } catch (e) { data = null; slotsEl.innerHTML = `<p class="dl-state" role="alert">${t('Az időpontok most nem érhetők el. Próbáld újra egy perc múlva.')}</p>`; }
      summary();
    }
    daysEl.addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (!b) return; day = b.dataset.day; slot = null; renderSlots(); summary(); $(`[data-day="${day}"]`, daysEl).focus(); });
    slotsEl.addEventListener('change', (e) => { if (e.target.name !== 'slot') return; slot = e.target.value; setErr('slot', ''); capShown = false; $$('[data-day]', daysEl).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.day === day && slot !== 'rush'))); summary(); });
    // the basket no longer fits the chosen time: say so right away, not only on submit
    const capMsg = () => (!data || !slot ? '' : slot === 'rush' ? (cups.length > data.rush.max_drinks ? t('Rush rendelésben legfeljebb {n} ital lehet.', { n: data.rush.max_drinks }) : '') : curSlot() && cups.length > curSlot().left ? tn('Erre az időpontra már csak {n} pohár fér.', curSlot().left) : '');

    // 4 · who pays
    function mode() {
      const g = kind() === 'group';
      const inv = !g || F('inv_want').checked;
      $('#dl-inv').hidden = !inv; $('#dl-inv-want').hidden = !g; $('#dl-group-hint').hidden = !g;
      $('#dl-inv-head').textContent = g ? t('Számlázási adatok') : t('Céges számla');
      $('#dl-inv-name-label').textContent = g ? t('Név vagy cégnév') : t('Cégnév');
      if (!inv) INV.forEach((n) => setErr(n, ''));
      payBtn.textContent = g ? t('Csoportos rendelés indítása') : t('Fizetés');
      setErr('slot', ''); capShown = false; summary();
    }
    form.addEventListener('change', (e) => { if (e.target.name === 'pay' || e.target.name === 'inv_want') mode(); });
    const needInv = (k) => k === 'company' || F('inv_want').checked; // a group organiser's invoice is optional (private person: till receipt)
    F('tax_number').addEventListener('blur', (e) => { e.target.value = taxFmt(e.target.value); });

    // summary + the phone bar
    const bar = $('#dl-bar'), barBtn = $('#dl-bar-btn');
    function summary() {
      const n = cups.length, sub = cups.reduce((s, c) => s + cupPrice(c), 0), fee = n ? feeFor(n) : 0;
      const lines = new Map(); cups.forEach((c) => { const k = cupLabel(c), l = lines.get(k) || { n: 0, sum: 0 }; l.n++; l.sum += cupPrice(c); lines.set(k, l); });
      const row = (k, v, cls) => `<div${cls ? ` class="${cls}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`;
      sum.innerHTML =
        (n ? [...lines].map(([k, l]) => row(`${l.n} × ${esc(k)}`, ft(l.sum), 'dl-sum__cup')).join('') : row(t('Italok'), `<span class="is-empty">${t('Még nincs kiválasztva')}</span>`)) +
        row(t('Kiszállítás'), n ? (fee ? `${ft(fee)}<small>${t('{n} italtól ingyenes', { n: RULES.freeFrom })}</small>` : t('ingyenes')) : `<span class="is-empty">${t('{n} italtól ingyenes, alatta {fee}', { n: RULES.freeFrom, fee: ft(RULES.fee) })}</span>`) +
        `<div class="dl-sum__prog">${progress(n)}</div>` +
        row(t('Időpont'), slotText() || `<span class="is-empty">${t('Még nincs kiválasztva')}</span>`) +
        row(t('Fizetendő'), ft(sub + fee), 'dl-sum__total');
      const cap = capMsg();
      if (cap) { setErr('slot', cap); capShown = true; } else if (capShown) { setErr('slot', ''); capShown = false; }
      $('#dl-bar-sum').textContent = n ? ft(sub + fee) : t('{n} italtól ingyenes', { n: RULES.freeFrom });
      $('#dl-bar-txt').textContent = n ? `${tn('{n} ital', n)}${slotText() ? ` · ${slotText()}` : ''}` : t('alatta {fee} a kiszállítás', { fee: ft(RULES.fee) });
      barBtn.textContent = n ? t('Tovább') : t('Rendelek');
      barBtn.setAttribute('href', !n ? '#rendeles' : !slot ? '#dl-days' : '#dl-sum-card');
      // screen readers hear the total once the basket settles, not on every keystroke
      clearTimeout(liveTimer); liveTimer = setTimeout(() => { $('#dl-sum-live').textContent = n ? `${tn('{n} ital', n)}, ${t('Fizetendő')}: ${ft(sub + fee)}` : ''; }, 900);
    }
    const heroBtn = $('.dl-hero__actions'), sumCard = $('#dl-sum-card');
    const placeBar = () => { bar.hidden = heroBtn.getBoundingClientRect().bottom > 60 || sumCard.getBoundingClientRect().top < innerHeight - 80; };
    addEventListener('scroll', placeBar, { passive: true }); addEventListener('resize', placeBar); placeBar();
    phone.addEventListener('change', () => { if (menu.size) renderMenu(); });

    // validation
    const BASE = ['cups', 'who', 'slot', 'company', 'street', 'floor', 'name', 'email', 'phone'], INV = ['inv_name', 'tax_number', 'zip', 'city', 'inv_street'];
    const rules = {
      cups: (v, k) => (cups.length ? '' : k === 'group' ? t('Add hozzá a saját italodat: a csoportos rendelést is egy itallal indítod.') : t('Válassz legalább egy italt.')),
      who: () => (cups.some((c) => !c.who.trim()) ? t('Írj nevet minden pohárra.') : ''),
      slot: (v, k) => (!slot ? t('Válassz időpontot.') : k === 'group' && slot === 'rush' ? t('Csoportos rendeléshez válassz időpontot, ne a rusht.') : capMsg()),
      company: (v) => (v.length >= 2 ? '' : t('Add meg a cég vagy az iroda nevét.')),
      street: (v) => (v.length < 4 ? t('Add meg az utcát és a házszámot.') : zone.v === v && zone.status === 'out_of_zone' ? t(ZONE_OUT) : ''),
      floor: (v) => (v.length >= 1 ? '' : t('Add meg az emeletet.')),
      name: (v) => (v.length >= 2 ? '' : t('Add meg a neved.')),
      email: (v) => (EMAIL.test(v) ? '' : t('Adj meg egy érvényes e-mail-címet.')),
      phone: (v) => (v.replace(/\D/g, '').length >= 7 ? '' : t('Adj meg egy telefonszámot, amin elérünk.')),
      inv_name: (v, k) => (v.length >= 2 ? '' : k === 'group' ? t('Add meg a számlán szereplő nevet.') : t('Add meg a cég nevét.')),
      tax_number: (v, k) => ((k === 'group' && !v) || /^\d{8}-\d-\d{2}$/.test(taxFmt(v)) ? '' : t('Az adószám formátuma: 12345678-1-12.')),
      zip: (v) => (/^\d{4}$/.test(v) ? '' : t('A magyar irányítószám 4 számjegy.')),
      city: (v) => (v.length >= 2 ? '' : t('Add meg a várost.')),
      inv_street: (v) => (v.length >= 4 ? '' : t('Add meg az utcát és a házszámot.')),
      terms: () => (F('terms').checked ? '' : t('A rendeléshez el kell fogadnod a feltételeket.')),
    };
    const val = (n) => (F(n) instanceof Element && F(n).type !== 'checkbox' ? F(n).value.trim() : '');
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
      check1('street');
    }
    addressBox(F('street'), checkZone);
    F('street').addEventListener('change', checkZone);
    F('street').addEventListener('input', () => { zoneNote.hidden = true; });
    form.addEventListener('focusout', (e) => { const n = e.target.name; if (rules[n] && !['terms', 'slot'].includes(n) && (e.target.value || e.target.getAttribute('aria-invalid'))) check1(n, kind()); });
    F('terms').addEventListener('change', () => check1('terms'));
    const focusBad = (n) => (n === 'cups' ? $('[data-step="1"]', menuEl) : n === 'who' ? $('[data-k="who"][aria-invalid]', cupsEl) : n === 'slot' ? $('input[name="slot"]:not([disabled])', slotsEl) || $('[data-day]', daysEl) : F(n))?.focus();

    function payload(k) {
      const s = curSlot();
      return { kind: k, date: slot === 'rush' ? today() : day, slot_id: s ? s.id : null, rush: slot === 'rush', items: cups.map(cupItem),
        address: { company: val('company'), street: val('street'), postcode: F('street').dataset.postcode || '', floor: val('floor'), note: val('note') }, contact: { name: val('name'), email: val('email'), phone: val('phone') },
        invoice: needInv(k) ? { name: val('inv_name'), tax_number: val('tax_number'), zip: val('zip'), city: val('city'), street: val('inv_street') } : null, terms: true, lang: B.lang,
        return_path: location.pathname }; // Stripe sends the payer back under this page, wherever the site is mounted
    }
    const problem = (err) => (err.code === 'bookings_closed' ? t(CLOSED) : err.code === 'payments_not_configured' ? t(NOT_READY) : err.code === 'slot_full' ? tn('Erre az időpontra már csak {n} pohár fér.', err.left ?? 0) : err.code === 'slot_closed' || err.code === 'rush_off' ? t('Ez az időpont közben lezárult. Válassz másikat.') : t('Most nem sikerült elküldeni a rendelést. Próbáld újra egy perc múlva.'));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      const k = kind();
      result.hidden = true;
      F('tax_number').value = taxFmt(F('tax_number').value);
      sending = true; busy(payBtn, true);
      await checkZone();
      const bad = [...BASE, ...(needInv(k) ? INV : []), 'terms'].filter((n) => !check1(n, k));
      if (bad.length) { sending = false; busy(payBtn, false); return focusBad(bad[0]); }
      const p = payload(k), text = slotText();
      try {
        const res = k === 'company' ? await api.order(p) : await api.createGroup(p);
        try { sessionStorage.setItem(LAST, JSON.stringify({ n: p.items.length, text, company: p.address.company, wd: parse(p.date).getUTCDay(), time: curSlot() ? curSlot().time : '', rush: p.rush })); } catch (err) { /* no storage: the thank-you view is shorter */ }
        if (res.checkout_url) { location.assign(res.checkout_url); return; } // stays busy while the browser leaves
        throw new Error('no_checkout_url'); // a 200 without a payment link is a failure
      } catch (err) {
        if (err.code === 'invalid' && err.fields?.includes('who')) { check1('who'); focusBad('who'); }
        else if (err.code === 'out_of_zone') { zone = { v: val('street'), zip: F('street').dataset.postcode || '', status: 'out_of_zone' }; zoneNote.hidden = true; check1('street'); F('street').focus(); }
        else { result.textContent = problem(err); result.hidden = false; result.focus(); if (err.code) loadSlots(); }
      }
      sending = false; busy(payBtn, false);
    });

    mode(); renderCups();
    loadSlots();
    menuEl.innerHTML = `<li class="dl-state" role="status">${t('Itallap betöltése…')}</li>`;
    const menuReady = loadMenu().then(() => { if (!menu.size) throw new Error('empty'); renderMenu(); }).catch(() => { menuEl.innerHTML = `<li class="dl-state" role="alert">${t('Az itallap most nem érhető el. Próbáld újra egy perc múlva.')}</li>`; });

    // signed in: the details of the last order fill the empty fields; "Újra rendelem" (or ?ujra=<id> from /fiok/) also
    // brings back the drinks. Nothing is remembered for guests without an account.
    const again = $('#dl-again');
    function fill(o, all) {
      const set = (n, v) => { const el = F(n); if (el && v != null && (all || !el.value.trim())) el.value = v; };
      if (all) { form.elements.pay.value = o.kind; F('inv_want').checked = o.kind === 'group' && !!o.invoice; mode(); }
      Object.entries({ company: o.address.company, street: o.address.street, floor: o.address.floor, note: o.address.note, name: o.contact.name, email: o.contact.email, phone: o.contact.phone }).forEach(([n, v]) => set(n, v));
      if (o.invoice && (all || o.kind === kind())) Object.entries({ inv_name: o.invoice.name, tax_number: o.invoice.tax_number, zip: o.invoice.zip, city: o.invoice.city, inv_street: o.invoice.street }).forEach(([n, v]) => set(n, v));
      if (all) {
        const known = o.items.filter((i) => menu.has(i.product_id));
        cups = known.map((i) => { const d = menu.get(i.product_id); return { ...newCup(i.product_id), who: i.who, milk: d.milks.includes(i.milk) ? i.milk : '', size: d.sizes[i.size] ? i.size : 0, iced: d.temp === 'both' && i.iced }; });
        setErr('cups', ''); syncMenu(); renderCups(); summary();
        const gone = o.items.length - known.length;
        again.innerHTML = `<p>${esc(tn('Betöltöttük: {n} ital, {company}. Válassz időpontot, és nézd át a többit.', cups.length, { company: o.address.company }))}${gone ? ` ${esc(tn('{n} ital már nincs az itallapon.', gone))}` : ''}</p>`;
      }
      if (val('street')) checkZone();
    }
    (async () => {
      const want = returned(['ujra']).ujra;
      let o = null;
      try { o = await lastOrder(want); } catch (e) { return; }
      if (!o) return;
      await menuReady;
      if (want) { fill(o, true); again.hidden = false; again.scrollIntoView({ block: 'center' }); return; }
      fill(o, false);
      again.innerHTML = `<p>${esc(tn('Legutóbb: {n} ital, {company}.', o.items.length, { company: o.address.company }))}</p><button type="button" class="btn btn--ghost" data-again>${t('Újra rendelem')}</button>`;
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
      setRules(g.free_from, g.fee);
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
      window.BROS_TERMS?.bind(form, 'dl');
      if (guestToken()) B.shell.customer.me().then((m) => { if (!m) return; ['name', 'email', 'loyalty_email'].forEach((n) => { if (!F(n).value) F(n).value = n === 'name' ? m.name : m.email; }); }).catch(() => {});
      const price = () => { btn.textContent = cup ? `${t('Hozzáadom és fizetek')} · ${ft(cupPrice(cup))}` : t('Hozzáadom és fizetek'); };
      cup = null;
      const drink = () => {
        cup = F('drink').value && menu.has(F('drink').value) ? newCup(F('drink').value) : null; setErr('drink', '');
        const d = cup && menu.get(cup.id), html = d ? optionSelects(d, cup) : '';
        opts.innerHTML = html; opts.hidden = !html; price();
        $('#dl-stamp').textContent = d && d.cat !== 'coffee' && !CONFIG.stampSpecials.includes(d.id) ? t('Ezért az italért nem jár pecsét.') : t('Ha megadod, a kávéd pecsétet ér a kártyádon.');
      };
      F('drink').addEventListener('change', drink);
      const inv = () => F('inv_want').checked, INV = ['inv_name', 'tax_number', 'zip', 'city', 'inv_street'];
      F('inv_want').addEventListener('change', () => { $('#dl-j-inv').hidden = !inv(); if (!inv()) INV.forEach((n) => setErr(n, '')); });
      F('tax_number').addEventListener('blur', (e) => { e.target.value = taxFmt(e.target.value); });
      opts.addEventListener('input', (e) => { if (e.target.dataset.k && cup) { readOpt(cup, e.target); price(); } });
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
    const NEXT = { new: 'Elkezdem készíteni', making: 'Elindultam vele', out: 'Kézbesítve' };
    const pill = (st) => `<span class="dla__pill" data-st="${esc(st)}">${t(ST_HU[st] || st)}</span>`;
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
              <summary><span><b>${esc(o.company)}</b><small>${o.id} · ${tn('{n} ital', o.drinks)} · ${o.type === 'company' ? t('cég fizet') : t('csoportos')}${o.eta_at ? ` · ${t('érkezés kb. {time}', { time: clock(o.eta_at) })}` : ''}</small></span>${pill(o.status)}</summary>
              <ul>${o.cups.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
              <p>${esc(o.address)} · ${esc(o.contact)}${o.note ? `<br>${esc(t(o.note))}` : ''}</p>
              ${o.status === 'requested' ? `<div class="dla__answer" role="group" aria-label="${t('Mikorra visszük?')}">
                <p><b>${t('Mikorra visszük?')}</b> ${t('Válasz {time}-ig, utána magától elutasítjuk.', { time: clock(o.answer_by) })}</p>
                <div class="dla__answer-row">${[15, 20, 30].map((m) => `<button type="button" class="btn" data-ans="${o.id}" data-min="${m}">${t('{m} perc', { m })}</button>`).join('')}</div>
                <div class="dla__answer-row"><label class="dla__at"><span>${t('vagy ekkorra')}</span><input type="time" data-at="${o.id}"></label><button type="button" class="btn btn--ghost" data-ans="${o.id}" data-time>${t('Elfogadom')}</button></div>
                <button type="button" class="dla__mini" data-ans="${o.id}" data-no>${t('Most nem megy')}</button></div>` : ''}
              ${NEXT[o.status] ? `<button type="button" class="btn" data-next="${o.id}" data-to="${ST[ST.indexOf(o.status) + 1]}">${t(NEXT[o.status])}</button>` : ''}
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

  const view = document.body.dataset.dl;
  if (view === 'order') orderPage();
  else if (view === 'group') groupPage();
  else if (view === 'admin') adminPage();
})();
