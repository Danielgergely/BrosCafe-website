// Bros After Hours: the public booking page, the guest's cancel page and the admin page.
// Spec: docs/after-hours.md · backend contract: docs/after-hours-api.md
(() => {
  const B = window.BROS, { esc, ft } = B.shell;
  const t = B.t, loc = B.locale;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const still = calm || !!(navigator.connection && navigator.connection.saveData); // no video: the still shows

  // ---------- the offer (docs/after-hours.md, owner 2026-11-17). The server (POST /quote) is the source of truth; this mirrors it ----------
  const CONFIG = {
    open: '18:00', close: '22:00',       // the evening; a booking is a start time + a number of hours inside it
    lastStart: '20:00', startStep: 30,   // starts: 18:00, 18:30 … 20:00 (minutes between them)
    baseHours: 2, maxHours: 4,
    minGuests: 2, maxGuests: 12,
    base: 12900,                         // the private café for 2 hours, any group size
    extraHour: 5900,                     // per hour above baseHours
    draft: false, windowMonths: 3,
    // one per-person package for the whole group; Alap: welcome drink + one board, menu: welcome drink + 3 dishes (+ extras)
    tiers: {
      alap: { name: 'Alap csomag', short: 'Alap', perPerson: 2500, pick: 1, from: ['waffle', 'veggie'], extras: false },
      menu: { name: 'Fingerfood menü', short: 'Fingerfood menü', perPerson: 3900, pick: 3, from: ['waffle', 'pizza', 'veggie', 'burger', 'sandwich', 'cheese'], extras: true },
    },
    dishes: [ // `extra` = per person as an additional dish on the menu
      { id: 'waffle', name: 'Waffle board', desc: 'Gofri, gyümölcsök, csokoládé és feltétek', extra: 1500 },
      { id: 'pizza', name: 'Mini pizza bites', desc: 'Mini pizzák paradicsomos szósszal és sajttal', extra: 1500 },
      { id: 'veggie', name: 'Fresh fruit & veggie board', desc: 'Friss gyümölcsök, zöldségek és mártogatósok', extra: 1500 },
      { id: 'burger', name: 'Mini burger sliders', desc: 'Mini hamburgerek sajttal és salátával', extra: 1800 },
      { id: 'sandwich', name: 'Mini sandwich selection', desc: 'Mini szendvicsek változatos töltelékekkel', extra: 1500 },
      { id: 'cheese', name: 'Cheese & charcuterie board', desc: 'Sajtok, szalámi, kekszek és gyümölcsök', extra: 2000 },
    ],
    legacy: { food1: '1. ételválogatás', food2: '2. ételválogatás', food3: '3. ételválogatás' }, // bookings before 2026-11-17
  };
  const DISH = Object.fromEntries(CONFIG.dishes.map((d) => [d.id, d]));
  const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const STARTS = (() => { const out = []; for (let m = mins(CONFIG.open); m <= mins(CONFIG.lastStart); m += CONFIG.startStep) out.push(hm(m)); return out; })();
  const maxHoursFrom = (start) => Math.min(CONFIG.maxHours, Math.floor((mins(CONFIG.close) - mins(start)) / 60)); // must end by closing
  const endOf = (start, hours) => hm(mins(start) + hours * 60);
  const slot = (b) => `${b.start}–${endOf(b.start, b.hours)}`;
  const extraHours = (hours) => Math.max(0, hours - CONFIG.baseHours);
  const hoursTxt = (n) => t('{n} óra', { n });
  const names = (ids) => ids.map((d) => t(DISH[d] ? DISH[d].name : d)).join(', ');
  // The same lines as quote() in worker/src/services/after_hours.ts, so the page shows a price before the server answers.
  // Checks: alap 2 p 2 h 17 900 · alap 6 p 27 900 · menu 6 p 36 300 · menu 12 p 4 h 71 500 · menu 6 p + sajt 48 300 · alap 4 p AFTER25 19 675.
  function localQuote(s) {
    const C = CONFIG, tier = C.tiers[s.tier], lines = [];
    const line = (kind, label, qty, unit) => lines.push({ kind, label, qty, unit, amount: qty * unit });
    line('cafe', t('Privát kávézó, {n} óra', { n: C.baseHours }), 1, C.base);
    line('package', `${t(tier.name)}${s.dishes.length ? ` (${t('üdvözlőital')} + ${names(s.dishes)})` : ''}`, s.guests, tier.perPerson);
    if (tier.extras) s.extras.forEach((d) => line('extra', `${t('Extra fogás')}: ${t(DISH[d].name)}`, s.guests, DISH[d].extra));
    if (extraHours(s.hours)) line('hours', t('További óra'), extraHours(s.hours), C.extraHour);
    if (s.voucher) line('voucher', t('Kuponkód {code} (−{p}% a kávézó díjából)', { code: s.voucher.code, p: s.voucher.percent }), 1, -s.voucher.discount);
    return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
  }
  const lineLabel = (l) => l.label || (B.lang === 'en' ? l.en : l.hu); // server lines carry both languages
  // 'Fingerfood menü (üdvözlőital + …)' -> the name, with the contents small under it
  const splitLabel = (x) => { const i = x.indexOf(' ('); return i < 0 || !x.endsWith(')') ? esc(x) : `${esc(x.slice(0, i))}<small>${esc(x.slice(i + 2, -1))}</small>`; };
  const money = (n) => (n < 0 ? `−${ft(-n)}` : ft(n));
  // stored price lines of a booking, small, under its total (admin + cancel page); nothing for bookings before 2026-11-17
  const breakdown = (b) => (b.lines && b.lines.length ? `<small>${b.lines.map((l) => esc(`${lineLabel(l)}: ${l.qty > 1 ? `${l.qty} × ${ft(l.unit)} = ` : ''}${money(l.amount)}`)).join('<br>')}</small>` : '');
  const draftPill = () => (CONFIG.draft ? `<span class="ah-draft ah-draft--wrap">${t('Tervezet · az árak még változhatnak')}</span>` : '');

  // ---------- dates: Europe/Budapest everywhere, never the device clock's zone ----------
  // A calendar day is a Date at 00:00 UTC of that day ('YYYY-MM-DD' on the wire).
  const TZ = 'Europe/Budapest';
  const bpFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const bp = (ms = Date.now()) => { const p = {}; for (const x of bpFmt.formatToParts(ms)) p[x.type] = x.value; return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
  const bpInstant = (date, time) => { const g = Date.parse(`${date}T${time}:00Z`), w = bp(g); return g - (Date.parse(`${w.date}T${w.time}:00Z`) - g); }; // ms of a Budapest wall time
  const iso = (d) => d.toISOString().slice(0, 10);
  const parse = (s) => new Date(`${s}T00:00:00Z`);
  const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
  const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const monthDays = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const addMonths = (d, n) => { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)); m.setUTCDate(Math.min(d.getUTCDate(), monthDays(m))); return m; }; // 30 Nov + 3 months = 28 Feb
  // First bookable evening = the later of the launch date and three full days' notice (one more once today's slot has started).
  const LAUNCH_DATE = '2026-12-01', NOTICE_DAYS = 3;
  let today = parse(bp().date);
  const win = () => { const notice = addDays(today, NOTICE_DAYS + (bp().time >= CONFIG.open ? 1 : 0)), launch = parse(LAUNCH_DATE); return { min: notice > launch ? notice : launch, max: addMonths(today, CONFIG.windowMonths) }; };
  let WIN = win();
  // An open tab must notice midnight (and 18:00) in Budapest.
  function watchDay(fn) {
    const tick = () => { today = parse(bp().date); const w = win(); if (iso(w.min) + iso(w.max) !== iso(WIN.min) + iso(WIN.max)) { WIN = w; fn(); } };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    setInterval(tick, 60000);
  }
  const longDate = new Intl.DateTimeFormat(loc, { dateStyle: 'full', timeZone: 'UTC' });
  const shortDate = new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' });
  const stamp = new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });

  // The agreed cancellation terms: full refund 7+ days before, 50 % until 48 h, nothing after. (The server decides; this mirrors it.)
  const refundPercent = (b, at = Date.now()) => { const h = (bpInstant(b.date, b.start || CONFIG.open) - at) / 3600e3; return h >= 7 * 24 ? 100 : h >= 48 ? 50 : 0; };
  // 11 digits typed without hyphens become 12345678-1-12
  const taxFmt = (v) => { const d = v.replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 8)}-${d[8]}-${d.slice(9)}` : v.trim(); };

  // ---------- data access: everything the pages read or write goes through `api` ----------
  // The worker: worker/src/routers/after_hours.ts, docs/after-hours-api.md.
  const api = (() => {
    const base = '/api/after-hours';
    const call = async (path, opts) => {
      // admin calls carry the staff token (belepes/staff.js); a dead session goes back to the login
      const headers = { 'Content-Type': 'application/json' }, staff = path.startsWith('/admin') && B.staff;
      if (staff && staff.token()) headers.Authorization = `Bearer ${staff.token()}`;
      const r = await fetch(base + path, { credentials: 'same-origin', headers, ...opts });
      const body = await r.json().catch(() => ({}));
      if (r.status === 401 && staff) staff.toLogin();
      if (!r.ok) throw Object.assign(new Error(body.error || r.statusText), { status: r.status, code: body.error, fields: body.fields });
      return body;
    };
    const post = (path, data) => call(path, { method: 'POST', body: JSON.stringify(data || {}) });
    return {
      availability: (from, to, code) => call(`/availability?from=${from}&to=${to}${code ? `&code=${encodeURIComponent(code)}` : ''}`), // code -> also { voucher: { valid, code, percent, discount } }
      quote: (payload) => post('/quote', payload), // -> { lines [{ kind, hu, en, qty, unit, amount }], total, voucher }
      book: (payload) => post('/bookings', payload), // -> { checkout_url }
      cancelInfo: (token) => call(`/cancel/${encodeURIComponent(token)}`), // -> { booking, refund_percent, refund_huf }
      cancelConfirm: (token) => post(`/cancel/${encodeURIComponent(token)}`),
      admin: {
        days: (from, to) => call(`/admin/days?from=${from}&to=${to}`),
        setDay: (date, open) => call(`/admin/days/${date}`, { method: 'PUT', body: JSON.stringify({ open }) }),
        bookings: () => call('/admin/bookings'),
        cancel: (id) => post(`/admin/bookings/${id}/cancel`),
        refund: (id, percent) => post(`/admin/bookings/${id}/refund`, { percent }),
      },
    };
  })();

  // Online payment is not switched on yet (the worker answers 503 payments_not_configured): say so instead of failing at the end.
  const NOT_READY = 'Az online fizetés még nincs bekapcsolva, ezért itt most nem lehet foglalni. Írj nekünk, és megbeszéljük: hello@broscafe.hu';
  function notReady(anchor) {
    if ($('#ah-notready') || !anchor) return;
    anchor.insertAdjacentHTML('afterend', `<div class="ah-return" id="ah-notready" data-s="cancelled" role="status"><p>${t(NOT_READY)}</p></div>`);
  }
  // Online booking switched off on this server (BOOKINGS_OPEN): the information stays, the form becomes a contact block.
  function bookingsClosed() {
    if ($('#ah-closed')) return;
    CONFIG.draft = false; $$('.ah-draft, #ah-notready').forEach((el) => el.remove());
    const form = $('#ah-form'); if (!form) return;
    form.hidden = true;
    // the section's own heading and intro talk about booking now: the closed message takes their place
    const head = $('#foglalas-cim'); if (head) { head.textContent = t('Az online foglalás hamarosan indul.'); const intro = head.nextElementSibling; if (intro && intro.matches('p.body')) intro.hidden = true; }
    form.insertAdjacentHTML('beforebegin', `<div class="ah-return" id="ah-closed" role="status"><p>${t('Addig írj nekünk, és egyeztetünk.')}</p><p style="margin-top:14px"><a class="btn" href="/kapcsolat/">${t('Írj nekünk')}</a></p></div>`);
  }

  // ---------- month calendar (shared by both pages) ----------
  // o: range() -> { min, max } (Date) · start (Date) · legend [{s, label}] · day(iso) -> { s, label, disabled, pressed } · pick(iso)
  function calendar(root, o) {
    const fmtMonth = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const wdShort = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }), wdLong = new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' });
    const week = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i))); // 1 Jan 2024 is a Monday
    const clamp = (d) => { const r = o.range(); return d < r.min ? r.min : d > r.max ? r.max : d; };
    let focus = clamp(o.start || o.range().min), view = monthStart(focus);
    const id = `cal-${Math.random().toString(36).slice(2, 7)}`;

    function render(refocus) {
      const r = o.range(), lead = (view.getUTCDay() + 6) % 7, dim = monthDays(view);
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push('<td></td>');
      for (let n = 1; n <= dim; n++) {
        const d = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth(), n)), s = iso(d), st = o.day(s);
        cells.push(`<td role="gridcell"><button type="button" class="ah-day${s === iso(today) ? ' is-today' : ''}" data-date="${s}" data-s="${st.s}" tabindex="${s === iso(focus) ? 0 : -1}"${st.pressed == null ? '' : ` aria-pressed="${st.pressed}"`}${st.disabled ? ' aria-disabled="true"' : ''} aria-label="${esc(`${longDate.format(d)}, ${st.label}`)}">${n}</button></td>`);
      }
      while (cells.length % 7) cells.push('<td></td>');
      const rows = []; for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
      root.innerHTML = `
        <div class="ah-cal__head">
          <button type="button" class="ah-cal__nav ah-cal__nav--prev" data-nav="-1" aria-label="${t('Előző hónap')}"${view <= monthStart(r.min) ? ' disabled' : ''}>${chevron}</button>
          <div class="ah-cal__month" id="${id}" aria-live="polite">${fmtMonth.format(view)}</div>
          <button type="button" class="ah-cal__nav" data-nav="1" aria-label="${t('Következő hónap')}"${view >= monthStart(r.max) ? ' disabled' : ''}>${chevron}</button>
        </div>
        <table role="grid" aria-labelledby="${id}" aria-describedby="${id}-help">
          <thead><tr>${week.map((d) => `<th scope="col" abbr="${wdLong.format(d)}">${wdShort.format(d).replace('.', '')}</th>`).join('')}</tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
        <p class="visually-hidden" id="${id}-help">${t('Nyilakkal léphetsz a napok között, Page Up és Page Down a hónapot váltja.')}</p>
        <div class="ah-cal__legend" aria-hidden="true">${o.legend.map((l) => `<span><i data-s="${l.s}"></i>${l.label}</span>`).join('')}</div>`;
      if (refocus) $(`[data-date="${iso(focus)}"]`, root)?.focus();
    }
    function go(d, refocus) { focus = clamp(d); view = monthStart(focus); render(refocus); }

    root.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        focus = clamp(addMonths(focus, Number(nav.dataset.nav))); view = monthStart(addMonths(view, Number(nav.dataset.nav))); render();
        (root.querySelector(`[data-nav="${nav.dataset.nav}"]:not([disabled])`) || root.querySelector('[data-nav]:not([disabled])'))?.focus();
        return;
      }
      const day = e.target.closest('.ah-day');
      if (!day) return;
      focus = parse(day.dataset.date);
      if (day.getAttribute('aria-disabled') !== 'true') o.pick(day.dataset.date);
      render(true);
    });
    root.addEventListener('keydown', (e) => {
      if (!e.target.closest('.ah-day')) return;
      const dow = (focus.getUTCDay() + 6) % 7, d = focus;
      const to = { ArrowLeft: () => addDays(d, -1), ArrowRight: () => addDays(d, 1), ArrowUp: () => addDays(d, -7), ArrowDown: () => addDays(d, 7), Home: () => addDays(d, -dow), End: () => addDays(d, 6 - dow),
        PageUp: () => addMonths(d, -1), PageDown: () => addMonths(d, 1) }[e.key];
      if (!to) return;
      e.preventDefault(); go(to(), true);
    });
    render();
    return { render: () => { focus = clamp(focus); view = monthStart(focus); render(root.contains(document.activeElement) && document.activeElement.classList.contains('ah-day')); }, go };
  }
  const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const ico = (d) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const INC = [ // the four things in the price
    ['Az egész kávézó csak a tiétek, 2 órára', ico('<path d="M8 20h32l-3-9H11z"/><path d="M11 20v18h26V20"/><path d="M20 38V28h8v10"/>')],
    ['Falatok az egész társaságnak: egy tál vagy 3 fogásos menü', ico('<circle cx="24" cy="26" r="12"/><circle cx="24" cy="26" r="6"/><path d="M6 12v10M10 12v10M6 17h4M42 12c-3 3-3 8 0 10v-10z"/>')],
    ['Üdvözlőital minden vendégnek', ico('<path d="M12 14h24l-3 24H15z"/><path d="M14 22h20"/><path d="M26 14l5-8"/>')],
    ['Ünnepi torta már 10 000 Ft-tól (opcionális)', ico('<path d="M8 30h32v10H8z"/><path d="M12 30v-8h24v8"/><path d="M24 22v-6M24 8c-2 3-2 5 0 6 2-1 2-3 0-6z"/>')],
  ];
  const OCC_TILES = [ // "Tökéletes választás": typographic tiles, no photos
    ['Születésnapok', ico('<path d="M10 28h28v10H10z"/><path d="M14 28v-6h20v6"/><path d="M19 22v-5M24 22v-7M29 22v-5"/>')],
    ['Karácsonyi összejövetelek', ico('<path d="M24 6l-9 13h5l-8 12h24l-8-12h5z"/><path d="M24 31v9"/>')],
    ['Évfordulók és eljegyzések', ico('<circle cx="24" cy="30" r="10"/><path d="M18 14l6-7 6 7-6 6z"/>')],
    ['Ballagások, diplomaosztók', ico('<path d="M4 18l20-9 20 9-20 9z"/><path d="M12 22v9c4 4 20 4 24 0v-9"/><path d="M42 19v11"/>')],
    ['Kisvállalati / céges összejövetelek', ico('<rect x="8" y="18" width="32" height="22" rx="3"/><path d="M18 18v-5h12v5M8 28h32"/>')],
    ['Baráti és családi alkalmak', ico('<circle cx="16" cy="16" r="5"/><circle cx="33" cy="18" r="4"/><path d="M6 38c0-8 4-12 10-12s10 4 10 12M27 38c0-6 3-9 7-9s8 3 8 9"/>')],
    ['Csak egy különleges élményért', ico('<path d="M24 7l4.5 10.5L40 19l-8.5 7.5L34 38l-10-6-10 6 2.5-11.5L8 19l11.5-1.5z"/>')],
  ];
  const openWide = () => { if (matchMedia('(min-width: 980px)').matches) $$('details[data-open-wide]').forEach((d) => { d.open = true; }); };
  // a link to a folded block (#lemondas, #aszf, #csomagok) opens it
  function openTarget() { const el = location.hash.length > 1 && document.getElementById(location.hash.slice(1)); if (el && el.tagName === 'DETAILS') { el.open = true; el.scrollIntoView({ block: 'start' }); $('summary', el).focus({ preventScroll: true }); } }

  // ---------- public page ----------
  function publicPage() {
    const video = $('.ah-hero__video video');
    if (video) { if (still) video.remove(); else { video.autoplay = true; video.play().catch(() => {}); } }
    openWide(); addEventListener('hashchange', openTarget); openTarget();

    // the offer: the café fee, the two packages, the six dishes. Stays visible when online booking is closed.
    const C = CONFIG, perP = (n) => `${ft(n)} ${t('/ fő')}`;
    const eg = (tier, g, dishes) => `${t(C.tiers[tier].short)}, ${t('{n} fő', { n: g })}: <b>${ft(localQuote({ tier, guests: g, hours: C.baseHours, dishes, extras: [] }).total)}</b>`;
    $('#ah-inc4').innerHTML = INC.map(([txt, svg]) => `<li>${svg}<span>${t(txt)}</span></li>`).join('');
    $('#ah-occ').innerHTML = OCC_TILES.map(([txt, svg]) => `<li class="ah-occ__tile">${svg}<span>${t(txt)}</span></li>`).join('');
    const packCard = (id, items) => `
      <article class="ah-pack">
        <p class="ah-price__name">${t(C.tiers[id].name)}</p>
        <p class="ah-pack__sum">${ft(C.tiers[id].perPerson)} <small>${t('/ fő')}</small></p>
        <ul class="ah-pack__list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>
      </article>`;
    $('#ah-tiers').innerHTML = `
      <div class="ah-offer">
        <div class="ah-price">
          <p class="ah-price__name">${t('Privát kávézó')}</p>
          <p class="ah-price__sum">${ft(C.base)}</p>
          <p class="ah-price__for">${hoursTxt(C.baseHours)} · ${t('{a}–{b} fő', { a: C.minGuests, b: C.maxGuests })}</p>
          <p class="fine ah-price__plus">${t('További óra')}: + ${ft(C.extraHour)} (${t('legfeljebb {t}-ig', { t: C.close })})</p>
        </div>
        <div class="ah-offer__more">
          <p class="ah-offer__lead">${t('Mellé egy csomagot választotok az egész társaságnak:')}</p>
          <div class="ah-packs">
            ${packCard('alap', [t('Üdvözlőital minden vendégnek (bármelyik ital az étlapról)'), t('Egy tál a társaságnak: Waffle board vagy Fresh fruit & veggie board')])}
            ${packCard('menu', [t('Üdvözlőital minden vendégnek (bármelyik ital az étlapról)'), t('3 különböző fogás a hatból, egymás után tálalva'), t('Kérhettek extra fogást is')])}
          </div>
        </div>
      </div>
      <div class="ah-menu">
        <h3 class="ah-sub">${t('A hat fogás')}</h3>
        <dl class="ah-extra__list">${C.dishes.map((d) => `<div><dt><b>${t(d.name)}</b><small>${t(d.desc)}</small></dt><dd>${t('extra')}: + ${perP(d.extra)}</dd></div>`).join('')}</dl>
        <p class="fine ah-eg">${t('Az extra fogás a Fingerfood menühöz kérhető, a nem választott fogásokból, fejenként.')}</p>
        <p class="fine ah-eg"><span class="ah-eg__ex">${t('Például')}: ${eg('alap', 2, ['waffle'])} · ${eg('alap', 6, ['waffle'])} · ${eg('menu', 6, ['pizza', 'burger', 'cheese'])}</span></p>
        <p class="fine ah-eg">${t('Mindent előre, online fizettek; csak az ünnepi tortát (10 000 Ft-tól) fizetitek a helyszínen.')} ${draftPill()}</p>
      </div>`;
    $('#ah-hours-hint').textContent = `+ ${ft(C.extraHour)} ${t('/ óra')}`;
    $('#ah-guests-hint').innerHTML = `<span>${t('{a}–{b} fő', { a: C.minGuests, b: C.maxGuests })}</span><span>${t('A csomag ára fejenként számít.')}</span>`;

    // the package picker in the form: tier cards, then the board (Alap) or 3 dishes (menu), then extras (menu only)
    const sel = { tier: 'alap', board: 'waffle', dishes: [], extras: [] };
    const chosen = () => (sel.tier === 'alap' ? [sel.board].filter(Boolean) : sel.dishes);
    $('#ah-tierpick').innerHTML = Object.entries(C.tiers).map(([id, x]) => `<label><input type="radio" name="tier" value="${id}"${id === sel.tier ? ' checked' : ''}><span><b>${t(x.name)}</b><small>${id === 'alap' ? t('Üdvözlőital + egy tál (Waffle board vagy Fresh fruit & veggie board)') : t('Üdvözlőital + 3 fogás a hatból')}</small></span><em>${perP(x.perPerson)}</em></label>`).join('');
    function drawDishes() {
      const tier = C.tiers[sel.tier], pick = $('#ah-dishpick'), menu = sel.tier === 'menu';
      $('#ah-dish-title').textContent = menu ? t('Válasszatok 3 fogást') : t('Melyik tál legyen?');
      $('#ah-dish-count').textContent = menu ? t('{n}/3 kiválasztva', { n: sel.dishes.length }) : '';
      pick.innerHTML = tier.from.map((id) => {
        const d = DISH[id], on = chosen().includes(id), full = menu && !on && sel.dishes.length >= tier.pick;
        return `<label${full ? ' class="is-off"' : ''}><input type="${menu ? 'checkbox' : 'radio'}" name="dish" value="${id}"${on ? ' checked' : ''}${full ? ' disabled' : ''}><span><b>${t(d.name)}</b><small>${t(d.desc)}</small></span></label>`;
      }).join('');
      const ex = $('#ah-extrapick');
      ex.innerHTML = menu
        ? C.dishes.filter((d) => !sel.dishes.includes(d.id)).map((d) => `<label><input type="checkbox" name="extra" value="${d.id}"${sel.extras.includes(d.id) ? ' checked' : ''}><span><b>${t(d.name)}</b><small>${t(d.desc)}</small></span><em>+ ${perP(d.extra)}</em></label>`).join('')
        : `<p class="fine">${t('Az Alap csomaghoz nem kérhető extra fogás. Ha több falatot szeretnétek, válasszátok a Fingerfood menüt.')}</p>`;
    }
    $('#ah-pkg').addEventListener('change', (e) => {
      const el = e.target;
      if (el.name === 'tier') { sel.tier = el.value; if (sel.tier === 'alap') sel.extras = []; }
      else if (el.name === 'dish') {
        if (sel.tier === 'alap') sel.board = el.value;
        else { sel.dishes = el.checked ? [...sel.dishes, el.value].slice(0, 3) : sel.dishes.filter((d) => d !== el.value); sel.extras = sel.extras.filter((d) => !sel.dishes.includes(d)); }
        setErr('dishes', '');
      } else if (el.name === 'extra') sel.extras = el.checked ? [...sel.extras, el.value] : sel.extras.filter((d) => d !== el.value);
      else return;
      const again = el.name === 'tier' ? `[name="tier"][value="${el.value}"]` : el.name === 'dish' ? `[name="dish"][value="${el.value}"]` : `[name="extra"][value="${el.value}"]`;
      drawDishes(); $(again, form)?.focus(); summary();
    });

    const form = $('#ah-form'), guests = $('#ah-guests'), sum = $('#ah-sum'), result = $('#ah-result'), calRoot = $('#ah-cal'), ret = $('#ah-return');
    const F = (n) => form.elements[n];
    let days = new Map(), picked = null, cal = null, nGuests = Number(guests.value) || CONFIG.minGuests, start = STARTS[0], hours = CONFIG.baseHours, sending = false, vch = null;

    // back from Stripe: ?booking=<id>&paid=1 or ?cancelled=1 (docs/after-hours-api.md)
    (() => {
      const q = new URLSearchParams(location.search), paid = q.get('paid') === '1' && q.get('booking'), cancelled = q.get('cancelled') === '1';
      if (!paid && !cancelled) return;
      ret.innerHTML = paid
        ? `<h3>${t('Köszönjük, a foglalás végleges!')}</h3><p>${t('Azonosító')}: <b>${esc(paid)}</b>. ${t('A visszaigazolást és a számlát e-mailben küldjük.')}</p>`
        : `<h3>${t('A fizetés megszakadt.')}</h3><p>${t('Nem történt terhelés, és a foglalás nem jött létre. Ha szeretnétek, kezdjétek újra.')}</p>`;
      ret.hidden = false; ret.dataset.s = paid ? 'paid' : 'cancelled';
      ['booking', 'paid', 'cancelled'].forEach((k) => q.delete(k));
      history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
      requestAnimationFrame(() => { ret.scrollIntoView({ block: 'center' }); ret.focus({ preventScroll: true }); });
    })();

    // calendar
    const dayState = (s) => {
      const st = days.get(s);
      if (st === 'open') return { s: 'open', label: s === picked ? t('kiválasztva') : t('szabad'), pressed: s === picked };
      if (st === 'booked') return { s: 'booked', label: t('már foglalt'), disabled: true };
      return { s: 'off', label: t('nem foglalható'), disabled: true };
    };
    async function load() {
      calRoot.innerHTML = `<p class="ah-cal__state" role="status">${t('Szabad esték betöltése…')}</p>`; cal = null;
      try {
        const res = await api.availability(iso(WIN.min), iso(WIN.max));
        if (res.bookings_open === false) { bookingsClosed(); return; }
        if (res.payments_ready === false) notReady(ret);
        days = new Map(res.days.map((d) => [d.date, d.status]));
        if (picked && days.get(picked) !== 'open') picked = null;
        const firstOpen = res.days.find((d) => d.status === 'open');
        if (!firstOpen) { calRoot.innerHTML = `<p class="ah-cal__state">${t('Most nincs foglalható este. Nézz vissza később!')}</p>`; summary(); return; }
        calRoot.innerHTML = '';
        cal = calendar(calRoot, { range: () => WIN, start: parse(picked || firstOpen.date), day: dayState,
          legend: [{ s: 'open', label: t('szabad') }, { s: 'booked', label: t('már foglalt') }, { s: 'off', label: t('nem foglalható') }],
          pick: (s) => { picked = s; setErr('date', ''); summary(); } });
      } catch (e) {
        calRoot.innerHTML = `<p class="ah-cal__state" role="alert">${t('A naptár most nem érhető el. Próbáld újra egy perc múlva.')}</p>`;
      }
      summary();
    }
    watchDay(load);

    // start time and length: every start is offered; the lengths that would end after closing are off
    const startEl = $('#ah-start'), hoursEl = $('#ah-hours'), slotEl = $('#ah-slot');
    const slotNote = $('#ah-slot-note');
    function drawTime() {
      const max = maxHoursFrom(start), cut = hours > max;
      if (cut) hours = max;
      slotNote.textContent = cut ? t('{s}-tól legfeljebb {n} óra fér bele {t}-ig.', { s: start, n: max, t: C.close }) : t('Az este {t}-ig tart.', { t: C.close });
      slotNote.classList.toggle('is-cut', cut);
      startEl.innerHTML = STARTS.map((s) => `<button type="button" class="ah-opt" data-start="${s}" aria-pressed="${s === start}">${s}</button>`).join('');
      hoursEl.innerHTML = Array.from({ length: C.maxHours - C.baseHours + 1 }, (_, i) => C.baseHours + i).map((h) => `<button type="button" class="ah-opt ah-opt--wide" data-hours="${h}" aria-pressed="${h === hours}"${h > max ? ' disabled' : ''}><b>${hoursTxt(h)}</b><small>${h > max ? t('{t} után már nem', { t: C.close }) : h === C.baseHours ? t('az árban') : `+ ${ft(C.extraHour * extraHours(h))}`}</small></button>`).join('');
      slotEl.textContent = `${start}–${endOf(start, hours)} · ${hoursTxt(hours)}`;
    }
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-start], [data-hours]'); if (!b || b.disabled) return;
      const key = b.dataset.start ? 'start' : 'hours', wasFocus = `[data-${key}="${b.dataset[key]}"]`;
      if (b.dataset.start) start = b.dataset.start; else hours = Number(b.dataset.hours);
      drawTime(); $(wasFocus, form)?.focus(); summary();
    });

    // guests: an empty or invalid entry keeps the last valid number
    const readGuests = () => { const n = Math.round(Number(guests.value)); return guests.value.trim() !== '' && Number.isFinite(n) ? Math.min(C.maxGuests, Math.max(C.minGuests, n)) : nGuests; };
    function setGuests(n, write = true) {
      nGuests = n; if (write) guests.value = n;
      form.querySelector('[data-step="-1"]').disabled = n <= C.minGuests;
      form.querySelector('[data-step="1"]').disabled = n >= C.maxGuests;
      summary();
    }
    form.addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) setGuests(Math.min(C.maxGuests, Math.max(C.minGuests, readGuests() + Number(b.dataset.step)))); });
    guests.addEventListener('input', () => setGuests(readGuests(), false));
    ['change', 'blur'].forEach((ev) => guests.addEventListener(ev, () => setGuests(readGuests())));

    // company fields
    const company = $('#ah-company'), toggle = $('#ah-company-toggle');
    toggle.addEventListener('change', () => { company.hidden = !toggle.checked; if (!toggle.checked) ['company', 'tax_number'].forEach((n) => setErr(n, '')); });
    F('tax_number').addEventListener('blur', (e) => { e.target.value = taxFmt(e.target.value); });

    // summary + the phone bar
    const bar = $('#ah-bar'), barBtn = $('#ah-bar-btn');
    // the price: computed here at once, then replaced by the server's quote for the same choice (the amount charged is always the server's)
    let served = null, quoteKey = '', quoteTimer = 0;
    const state = () => ({ tier: sel.tier, dishes: chosen(), extras: sel.tier === 'menu' ? sel.extras : [], guests: nGuests, hours, voucher: vch });
    const complete = () => chosen().length === C.tiers[sel.tier].pick;
    function askServer(s) {
      const key = JSON.stringify([s.tier, s.dishes, s.extras, s.guests, s.hours, s.voucher && s.voucher.code]);
      if (key === quoteKey) return;
      quoteKey = key; served = null; clearTimeout(quoteTimer);
      if (!complete()) return;
      quoteTimer = setTimeout(async () => {
        try {
          const r = await api.quote({ tier: s.tier, dishes: s.dishes, extras: s.extras, guests: s.guests, hours: s.hours, voucher: s.voucher ? s.voucher.code : '' });
          if (key !== quoteKey) return;
          if (r.total !== localQuote(s).total) console.warn('After Hours: page and server price differ', localQuote(s), r);
          served = r; summary();
        } catch (e) { /* the local price stays; the booking itself is priced by the server */ }
      }, 250);
    }
    function summary() {
      const n = nGuests, s = state(); askServer(s);
      const q = served || localQuote(s);
      const row = (k, v, cls) => `<div${cls ? ` class="${cls}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`;
      const left = C.tiers[sel.tier].pick - chosen().length;
      sum.innerHTML =
        row(t('Este'), `${picked ? longDate.format(parse(picked)) : `<span class="is-empty">${t('Még nincs kiválasztva')}</span>`}<small>${start}–${endOf(start, hours)} · ${hoursTxt(hours)} · ${t('{n} fő', { n })}</small>`) +
        q.lines.map((l) => row(splitLabel(lineLabel(l)), `${money(l.amount)}${l.qty > 1 ? `<small>${l.qty} × ${ft(l.unit)}</small>` : ''}`, l.kind === 'voucher' ? 'ah-sum__disc' : '')).join('') +
        (left > 0 ? row(t('Fogások'), `<span class="is-empty">${t('Válasszatok még {n} fogást', { n: left })}</span>`) : '') +
        (F('cake').checked ? row(t('Ünnepi torta'), `${t('kérünk')}<small>${t('10 000 Ft-tól, a helyszínen fizetendő')}</small>`) : '') +
        row(t('Most fizetendő'), ft(q.total), 'ah-sum__total') +
        `<div class="ah-sum__terms"><p class="fine">${t('Az étel és az ital is benne van az előre fizetett összegben; a torta a helyszínen fizetendő.')} ${draftPill()}</p></div>`;
      $('#ah-bar-sum').textContent = ft(q.total);
      $('#ah-bar-txt').textContent = `${t('{n} fő', { n })} · ${picked ? `${shortDate.format(parse(picked))}, ` : ''}${start}–${endOf(start, hours)}`;
      barBtn.textContent = picked ? t('Tovább a fizetéshez') : t('Estét választok');
      barBtn.setAttribute('href', picked ? '#ah-sum-card' : '#foglalas');
    }
    form.addEventListener('change', (e) => { if (e.target.name === 'cake') summary(); });
    // the bar shows between the hero button and the summary card (phones only, see the CSS)
    const heroBtn = $('.ah-hero__actions'), sumCard = $('#ah-sum-card');
    const placeBar = () => { bar.hidden = heroBtn.getBoundingClientRect().bottom > 60 || sumCard.getBoundingClientRect().top < innerHeight - 80; };
    addEventListener('scroll', placeBar, { passive: true }); addEventListener('resize', placeBar); placeBar();

    // voucher: the server validates (availability?code=); the base-fee discount shows in the summary
    const codeIn = F('voucher'), codeBtn = $('#ah-code-btn');
    const voucherMsg = (msg, ok) => { setErr('voucher', msg); const el = $('#err-voucher'); el.classList.toggle('ah-ok', !!ok); if (ok) codeIn.removeAttribute('aria-invalid'); };
    async function applyCode() {
      const c = codeIn.value.trim();
      vch = null;
      if (!c) { voucherMsg(''); summary(); return true; }
      codeBtn.setAttribute('aria-busy', 'true');
      try {
        const r = await api.availability(iso(WIN.min), iso(WIN.min), c);
        if (r.voucher && r.voucher.valid) { vch = r.voucher; codeIn.value = r.voucher.code; voucherMsg(t('Kuponkód érvényes: −{sum} a kávézó díjából.', { sum: ft(r.voucher.discount) }), true); }
        else voucherMsg(t('Ez a kuponkód nem érvényes. Ellenőrizd, vagy hagyd üresen a mezőt.'));
      } catch (e) { voucherMsg(t('A kuponkódot most nem tudtuk ellenőrizni. Próbáld újra egy perc múlva, vagy hagyd üresen a mezőt.')); }
      codeBtn.removeAttribute('aria-busy'); summary();
      return !!vch;
    }
    codeBtn.addEventListener('click', applyCode);
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } });
    codeIn.addEventListener('input', () => { if (vch || $('#err-voucher').textContent) { vch = null; voucherMsg(''); summary(); } });

    // validation
    function setErr(name, msg) {
      const input = name === 'date' || name === 'dishes' ? null : F(name);
      let el = $(`#err-${name}`);
      if (!el && input) { el = document.createElement('p'); el.className = 'ah-err'; el.id = `err-${name}`; el.hidden = true; input.after(el); }
      if (!el) return;
      el.textContent = msg; el.hidden = !msg;
      if (input) { if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', el.id); } else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); } }
    }
    const rules = {
      date: () => (picked ? '' : t('Válassz egy szabad estét a naptárban.')),
      dishes: () => (complete() ? '' : sel.tier === 'menu' ? t('Válasszatok pontosan 3 fogást.') : t('Válasszatok egy tálat.')),
      name: (v) => (v.length >= 2 ? '' : t('Add meg a neved.')),
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : t('Adj meg egy érvényes e-mail-címet.')),
      phone: (v) => (v.replace(/\D/g, '').length >= 7 ? '' : t('Adj meg egy telefonszámot, amin elérünk.')),
      zip: (v) => (/^\d{4}$/.test(v) ? '' : t('A magyar irányítószám 4 számjegy.')),
      city: (v) => (v.length >= 2 ? '' : t('Add meg a várost.')),
      street: (v) => (v.length >= 3 ? '' : t('Add meg az utcát és a házszámot.')),
      company: (v) => (!toggle.checked || v.length >= 2 ? '' : t('Add meg a cég nevét.')),
      tax_number: (v) => (!toggle.checked || /^\d{8}-\d-\d{2}$/.test(taxFmt(v)) ? '' : t('Az adószám formátuma: 12345678-1-12.')),
      terms: () => (F('terms').checked ? '' : t('A foglaláshoz el kell fogadnod a feltételeket.')),
    };
    const check1 = (name) => { const msg = rules[name](['date', 'terms', 'dishes'].includes(name) ? '' : F(name).value.trim()); setErr(name, msg); return !msg; };
    form.addEventListener('focusout', (e) => { const n = e.target.name; if (rules[n] && n !== 'terms' && (e.target.value || e.target.getAttribute('aria-invalid'))) check1(n); });
    F('terms').addEventListener('change', () => check1('terms'));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      result.hidden = true;
      setGuests(readGuests());
      F('tax_number').value = taxFmt(F('tax_number').value);
      const bad = Object.keys(rules).filter((n) => !check1(n));
      if (bad.length) {
        if (bad[0] === 'date') { $('#ah-step-date').scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' }); (calRoot.querySelector('.ah-day[tabindex="0"]') || calRoot).focus({ preventScroll: true }); }
        else if (bad[0] === 'dishes') { $('#csomagok').scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' }); $('#ah-dishpick input:not([disabled])', form)?.focus({ preventScroll: true }); }
        else F(bad[0]).focus();
        return;
      }
      if (codeIn.value.trim() && !vch && !(await applyCode())) { codeIn.focus(); return; }
      const v = (n) => F(n).value.trim();
      const payload = {
        date: picked, start, hours, guests: nGuests, tier: sel.tier, dishes: chosen(), extras: sel.tier === 'menu' ? sel.extras : [], name: v('name'), email: v('email'), phone: v('phone'),
        billing: { zip: v('zip'), city: v('city'), street: v('street'), company: toggle.checked ? v('company') : '', tax_number: toggle.checked ? v('tax_number') : '' },
        occasion: v('occasion'), note: v('note'), cake: F('cake').checked, voucher: vch ? vch.code : '', terms: true, lang: B.lang,
        return_path: location.pathname, // Stripe sends the guest back to this page, wherever the site is mounted
      };
      const btn = form.querySelector('[type="submit"]');
      sending = true; btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      try {
        const res = await api.book(payload);
        if (res.checkout_url) { location.assign(res.checkout_url); return; } // stays busy while the browser leaves
        throw new Error('no_checkout_url');
      } catch (err) {
        if (err.code === 'bookings_closed') bookingsClosed();
        else if (err.code === 'payments_not_configured') { notReady(ret); result.textContent = t(NOT_READY); }
        else if (err.code === 'invalid_voucher') { vch = null; voucherMsg(t('Ez a kuponkód nem érvényes. Ellenőrizd, vagy hagyd üresen a mezőt.')); summary(); result.textContent = t('Ez a kuponkód nem érvényes. Ellenőrizd, vagy hagyd üresen a mezőt.'); }
        else if (err.code === 'invalid' && err.fields && err.fields.includes('dishes')) { check1('dishes'); result.textContent = t('Válasszatok pontosan 3 fogást.'); }
        else if (err.code === 'day_taken') { result.textContent = t('Ezt az estét közben lefoglalták. Válassz másikat.'); picked = null; load(); }
        else result.textContent = t('Most nem sikerült elindítani a foglalást. Próbáld újra egy perc múlva.');
      }
      sending = false; btn.removeAttribute('aria-busy'); btn.disabled = false;
      result.hidden = false; result.focus();
    });

    drawTime();
    drawDishes();
    setGuests(nGuests);
    load();
  }

  // ---------- admin ----------
  async function adminPage() {
    if (!B.staff) return;
    await B.staff.guard({ adminOnly: true }); // refunds: admins only
    const root = $('#ah-admin');
    const ST = { pending: 'fizetésre vár', paid: 'fizetve', cancelled: 'lemondva', refunded: 'visszatérítve', expired: 'lejárt' };
    const OCC = { birthday: 'Születésnap', romantic: 'Romantikus este', friends: 'Baráti összejövetel', team: 'Céges', family: 'Családi alkalom', other: 'Egyéb' };
    const tierName = (b) => (CONFIG.tiers[b.tier] ? t(CONFIG.tiers[b.tier].short) : '');
    const pill = (st, fresh) => `<span class="aha__pill${fresh ? ' is-new' : ''}" data-st="${esc(st)}">${t(ST[st] || st)}</span>`;
    const range = () => ({ min: monthStart(today), max: WIN.max });
    let days = new Map(), bookings = [], cal = null, fresh = null, working = false;

    root.innerHTML = `
      <section class="aha__panel" aria-labelledby="aha-cal-title">
        <h2 id="aha-cal-title">${t('Nyitott esték')}</h2>
        <p class="fine">${t('Koppints egy napra a megnyitáshoz vagy a lezáráshoz. A vasárnap és az ünnepnapok (dec. 24–26., dec. 31., jan. 1.) alapból zárva, de megnyithatók.')}</p>
        <div class="ah-cal" id="aha-cal"></div>
        <p class="aha__msg" role="status" id="aha-live"></p>
      </section>
      <section class="aha__panel" aria-labelledby="aha-list-title">
        <h2 id="aha-list-title">${t('Foglalások')}</h2>
        <p class="fine">${t('Koppints egy foglalásra a részletekért.')}</p>
        <div class="aha__list" id="aha-list"></div>
      </section>
      <dialog class="aha__dlg" id="aha-dlg" aria-labelledby="aha-dlg-title"></dialog>`;
    const dlg = $('#aha-dlg'), list = $('#aha-list'), live = $('#aha-live');

    const dayState = (s) => {
      const d = days.get(s);
      if (parse(s) < today) return { s: 'past', label: t('elmúlt nap'), disabled: true };
      if (d?.booking_id) { const b = bookings.find((x) => x.id === d.booking_id); return { s: 'booked', label: `${t('foglalt')}: ${b ? b.name : ''}` }; }
      return d?.open ? { s: 'open', label: t('nyitva'), pressed: true } : { s: 'blocked', label: t('zárva'), pressed: false };
    };
    async function refresh() {
      try {
        const r = range(), [d, b] = await Promise.all([api.admin.days(iso(r.min), iso(r.max)), api.admin.bookings()]);
        days = new Map(d.days.map((x) => [x.date, x])); bookings = b.bookings.sort((x, y) => x.date.localeCompare(y.date));
      } catch (e) { live.textContent = t('Az adatok most nem érhetők el. Próbáld újra egy perc múlva.'); return; }
      cal ? cal.render() : (cal = calendar($('#aha-cal'), { range, start: today, day: dayState, pick,
        legend: [{ s: 'open', label: t('nyitva') }, { s: 'blocked', label: t('zárva') }, { s: 'booked', label: t('foglalt') }] }));
      list.innerHTML = bookings.length ? bookings.map((x) => `<button type="button" class="aha__row" data-id="${x.id}">
        <span><b>${esc(x.name)}</b><small>${shortDate.format(parse(x.date))} · ${slot(x)} · ${t('{n} fő', { n: x.guests })}${tierName(x) ? ` · ${tierName(x)}` : ''} · ${ft(x.amount)}${x.voucher_code ? ` · ${esc(x.voucher_code)}` : ''}${x.cake ? ` · ${t('torta')}` : ''}</small></span>${pill(x.status, x.id === fresh)}</button>`).join('') : `<p class="aha__empty">${t('Még nincs foglalás.')}</p>`;
      fresh = null;
    }
    async function pick(s) {
      const d = days.get(s);
      if (d?.booking_id) return detail(d.booking_id);
      const open = !d?.open;
      days.set(s, { ...d, date: s, open }); // optimistic; the calendar re-renders right after pick()
      live.textContent = `${longDate.format(parse(s))}: ${open ? t('nyitva') : t('zárva')}`;
      try { await api.admin.setDay(s, open); } catch (e) { days.set(s, { ...d, date: s, open: !open }); cal.render(); live.textContent = t('Nem sikerült menteni. Próbáld újra.'); }
    }

    function detail(id, focusSel, error) {
      const b = bookings.find((x) => x.id === id); if (!b) return;
      const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
      const perPersonOf = (x) => { const l = (x.lines || []).find((y) => y.kind === 'package'); return l ? l.unit : CONFIG.tiers[x.tier].perPerson; }; // the price it was booked at
      const legacy = (b.packages || []).map((p) => t(CONFIG.legacy[p] || p)).join(', ');
      const food = CONFIG.tiers[b.tier]
        ? row(t('Csomag'), `${tierName(b)} · ${ft(perPersonOf(b))} ${t('/ fő')}`) + row(b.tier === 'alap' ? t('Tál') : t('Fogások'), esc(names(b.dishes || [])) || '–') + row(t('Extra fogások'), esc(names(b.extras || [])) || '–')
        : row(t('Ételválogatás'), legacy ? `${legacy} (${t('a helyszínen fizetendő')})` : '–'); // bookings before 2026-11-17
      // paid: what a cancellation would give back now; cancelled: what the terms gave at the moment of cancelling
      const at = b.status === 'cancelled' && b.cancelled_at ? Date.parse(b.cancelled_at) : Date.now(), pct = refundPercent(b, at), back = ft(Math.round(b.amount * pct / 100));
      const hint = b.status === 'paid' ? t('Visszatérítés a lemondási feltételek szerint, ha most mondják le: {p}% ({sum}).', { p: pct, sum: back })
        : b.status === 'cancelled' ? t('Lemondva: {when}. A feltételek szerint ekkor {p}% járt vissza ({sum}).', { when: b.cancelled_at ? stamp.format(new Date(b.cancelled_at)) : '–', p: pct, sum: back }) : '';
      dlg.innerHTML = `
        <div class="aha__dlg-head"><div><h2 id="aha-dlg-title">${esc(b.name)}</h2><p>${pill(b.status, b.id === fresh)}</p></div>
          <button type="button" class="aha__close" data-close aria-label="${t('Bezárás')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
        <dl class="aha__dl" data-id="${esc(b.id)}">
          ${row(t('Azonosító'), esc(b.id))}${row(t('Dátum'), longDate.format(parse(b.date)))}${row(t('Időpont'), `${slot(b)} · ${hoursTxt(b.hours)}`)}${row(t('Vendégszám'), t('{n} fő', { n: b.guests }))}
          ${row(t('Alkalom'), t(OCC[b.occasion] || '–'))}${food}${row(t('Ünnepi torta'), b.cake ? `${t('kérnek tortát')} (${t('a helyszínen fizetendő')})` : '–')}${b.voucher_code ? row(t('Kuponkód'), `${esc(b.voucher_code)} · −${ft(b.discount || 0)}`) : ''}
          ${row(t('Fizetve'), `${ft(b.amount)}${b.status === 'refunded' ? ` · ${t('visszatérítve')}: ${b.refund_percent ?? 0}%` : ''}${breakdown(b)}`)}
          ${row(t('E-mail'), esc(b.email))}${row(t('Telefonszám'), esc(b.phone))}
          ${row(t('Számlázási cím'), esc(`${b.billing.company ? `${b.billing.company} (${b.billing.tax_number}), ` : ''}${b.billing.zip} ${b.billing.city}, ${b.billing.street}`))}
          ${row(t('Megjegyzés'), esc(t(b.note)) || '–')}
        </dl>
        ${hint ? `<p class="aha__hint">${hint}</p>` : ''}
        ${error ? `<p class="ah-err" role="alert">${error === 'payments_not_configured' ? t('Az online fizetés (Stripe) nincs beállítva, ezért innen nem indítható visszatérítés.') : t('Nem sikerült. Próbáld újra egy perc múlva.')}</p>` : ''}
        <div class="aha__actions">
          ${b.status === 'paid' ? `<button type="button" class="btn btn--ghost" data-act="cancel">${t('Foglalás lemondása')}</button>` : ''}
          ${b.status === 'cancelled' ? `<button type="button" class="btn" data-act="refund" data-pct="${pct}">${t('Visszatérítés')} · ${pct}%</button>` : ''}
        </div>
        <p class="fine" style="margin-top:14px">${b.invoice_no ? `${t('Számla')}: ${esc(b.invoice_no)}` : b.status === 'paid' ? t('Számla még nincs kiállítva.') : ''}</p>`;
      if (!dlg.open) dlg.showModal();
      (focusSel && $(focusSel, dlg) || $('[data-close]', dlg)).focus();
    }
    list.addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) detail(r.dataset.id); });
    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      const act = e.target.closest('[data-act]'); if (!act || working) return;
      const id = $('.aha__dl', dlg).dataset.id;
      if (!confirm(act.dataset.act === 'cancel' ? t('{id}: lemondjuk a foglalást? A vendég e-mailt kap róla.', { id }) : t('{id}: visszautaljuk a kifizetett összeg {pct}%-át?', { id, pct: act.dataset.pct }))) return;
      working = true; act.setAttribute('aria-busy', 'true'); act.textContent = t('Folyamatban…');
      try {
        await (act.dataset.act === 'cancel' ? api.admin.cancel(id) : api.admin.refund(id, Number(act.dataset.pct)));
        fresh = id; await refresh(); fresh = id; detail(id, '[data-act]'); fresh = null;
      } catch (err) { detail(id, '[data-act]', err.code || true); }
      working = false;
    });
    watchDay(() => { cal = null; $('#aha-cal').innerHTML = ''; refresh(); });
    refresh();
  }

  // ---------- the guest's cancel page (the signed link in the confirmation email) ----------
  async function cancelPage() {
    const root = $('#ah-cancel');
    const token = new URLSearchParams(location.search).get('t') || '';
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    let working = false;
    const view = (r, done, error) => {
      const b = r.booking;
      root.innerHTML = `
        <h2 id="ah-cancel-name">${esc(b.name)}</h2>
        <dl class="aha__dl">
          ${row(t('Azonosító'), esc(b.id))}${row(t('Dátum'), longDate.format(parse(b.date)))}${row(t('Időpont'), `${slot(b)} · ${hoursTxt(b.hours)}`)}${row(t('Vendégszám'), t('{n} fő', { n: b.guests }))}${row(t('Kifizetett összeg'), `${ft(b.amount)}${breakdown(b)}`)}
          ${row(t('Visszatérítés'), `<b>${ft(r.refund_huf)}</b> (${r.refund_percent}%)`)}
        </dl>
        ${done ? `<p class="ah-preview" role="status" tabindex="-1">${t('A foglalást lemondtuk.')} ${r.refund_huf ? t('A visszatérítés {sum}, néhány napon belül érkezik a fizetéshez használt kártyára.', { sum: ft(r.refund_huf) }) : ''}</p>`
          : `<p class="aha__hint">${t('A visszatérítés a lemondás időpontjától függ: legalább 7 nappal előtte 100%, legkésőbb 48 órával előtte 50%, azon belül 0%.')}</p>
        ${error ? `<p class="ah-err" role="alert">${t('Most nem sikerült lemondani. Próbáld újra egy perc múlva, vagy írj nekünk: hello@broscafe.hu')}</p>` : ''}
        <div class="aha__actions"><button type="button" class="btn" data-confirm>${t('Lemondom a foglalást')}</button><a class="btn btn--ghost" href="../">${t('Mégsem, megtartom')}</a></div>`}`;
      if (done) $('.ah-preview', root).focus(); else if (error) $('[data-confirm]', root).focus();
    };
    let info;
    try { if (!token) throw new Error('no_token'); info = await api.cancelInfo(token); view(info); } catch (e) { root.innerHTML = `<p role="alert">${t('Ez a lemondó link már nem érvényes. Írj nekünk: hello@broscafe.hu')}</p>`; return; }
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-confirm]'); if (!btn || working) return;
      working = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = t('Folyamatban…');
      try { view(await api.cancelConfirm(token), true); } catch (err) { view(info, false, true); }
      working = false;
    });
  }

  const page = document.body.dataset.page;
  if (page === 'after-hours') publicPage();
  else if (page === 'after-hours-admin') adminPage();
  else if (page === 'after-hours-cancel') cancelPage();
})();
