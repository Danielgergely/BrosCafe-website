// Bros Cafe · D — Bros After Hours: the public booking page, the guest's cancel page and the admin mock-up.
// Spec: docs/after-hours.md · backend contract: docs/after-hours-api.md
(() => {
  const B = window.BROS || { t: (s) => s, en: false, lang: 'hu', locale: 'hu-HU' };
  const t = B.t, loc = B.locale;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const still = calm || !!(navigator.connection && navigator.connection.saveData); // no video: the still shows

  // ---------- the offer (docs/after-hours.md, Daniel 2026-11-17). The server computes the same price: docs/after-hours-api.md ----------
  const CONFIG = {
    open: '18:00', close: '22:00',       // the evening; a booking is a start time + a number of hours inside it
    lastStart: '20:00', startStep: 30,   // starts: 18:00, 18:30 … 20:00 (minutes between them)
    baseHours: 2, maxHours: 4,
    minGuests: 2, baseGuests: 6, maxGuests: 12,
    base: 14900,                         // 2–6 people, 2 hours, snack plate, unlimited coffee and tea, one of the team serving
    extraGuest: 1990,                    // DRAFT amount: per person above baseGuests (7–12)
    extraHour: 5900,                     // DRAFT amount: per hour above baseHours
    draft: true, windowMonths: 3,
    closedDays: ['12-24', '12-25', '12-26', '12-31', '01-01'], // 'MM-DD', blocked every year unless the admin opens the day
    voucher: { AFTER25: 25 },            // % off the base fee only; the server is authoritative (the mock mirrors it)
    groupDiscount: [{ from: 4, to: 7, pct: 25 }, { from: 8, pct: 35 }], // on food only, information: how food is paid is not decided
    packages: [ // the three food selections: placeholders, contents and prices TBD, paid on site
      { id: 'food1', name: '1. ételválogatás' }, { id: 'food2', name: '2. ételválogatás' }, { id: 'food3', name: '3. ételválogatás' },
    ],
  };
  const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const STARTS = (() => { const out = []; for (let m = mins(CONFIG.open); m <= mins(CONFIG.lastStart); m += CONFIG.startStep) out.push(hm(m)); return out; })();
  const maxHoursFrom = (start) => Math.min(CONFIG.maxHours, Math.floor((mins(CONFIG.close) - mins(start)) / 60)); // must end by closing
  const endOf = (start, hours) => hm(mins(start) + hours * 60);
  const slot = (b) => `${b.start}–${endOf(b.start, b.hours)}`;
  // deposit = base + surcharges: 6 p/2 h 14 900 · 8 p/2 h 18 880 · 6 p/3 h 20 800 · 12 p/4 h 38 640
  const extraGuests = (guests) => Math.max(0, guests - CONFIG.baseGuests), extraHours = (hours) => Math.max(0, hours - CONFIG.baseHours);
  const total = (guests, hours) => CONFIG.base + CONFIG.extraGuest * extraGuests(guests) + CONFIG.extraHour * extraHours(hours);
  const ft = (n) => `${new Intl.NumberFormat('hu-HU', { useGrouping: 'always' }).format(n)} Ft`;
  const hoursTxt = (n) => t('{n} óra', { n });
  // '14 900 Ft + 2 × 1 990 Ft + 1 × 5 900 Ft', or nothing when only the base was paid
  const breakdown = (b) => (extraGuests(b.guests) || extraHours(b.hours) || b.discount ? `<small>${ft(CONFIG.base)}${extraGuests(b.guests) ? ` + ${extraGuests(b.guests)} × ${ft(CONFIG.extraGuest)}` : ''}${extraHours(b.hours) ? ` + ${extraHours(b.hours)} × ${ft(CONFIG.extraHour)}` : ''}${b.discount ? ` − ${ft(b.discount)} (${esc(b.voucher_code)})` : ''}</small>` : '');
  const packPrice = () => t('Hamarosan');
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
  const http = (() => {
    const base = '/api/after-hours';
    const call = async (path, opts) => {
      // admin calls carry the staff token (belepes/staff.js); a dead session goes back to the login
      const headers = { 'Content-Type': 'application/json' }, staff = path.startsWith('/admin') && B.staff;
      if (staff && staff.token()) headers.Authorization = `Bearer ${staff.token()}`;
      const r = await fetch(base + path, { credentials: 'same-origin', headers, ...opts });
      const body = await r.json().catch(() => ({}));
      if (r.status === 401 && staff) staff.toLogin();
      if (!r.ok) throw Object.assign(new Error(body.error || r.statusText), { status: r.status, code: body.error });
      return body;
    };
    const post = (path, data) => call(path, { method: 'POST', body: JSON.stringify(data || {}) });
    return {
      availability: (from, to, code) => call(`/availability?from=${from}&to=${to}${code ? `&code=${encodeURIComponent(code)}` : ''}`), // code -> also { voucher: { valid, code, percent, discount } }
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

  // MOCK: in-memory sample data generated from today, so the preview always has open evenings. Nothing is saved or sent.
  const mock = (() => {
    const wait = (v) => new Promise((res) => setTimeout(() => res(v), calm ? 0 : 280));
    const overrides = new Map(); // date -> open (what the admin toggled)
    const closedDay = (d) => CONFIG.closedDays.includes(iso(d).slice(5));
    // Mon–Sat are open unless blocked (a fixed pattern stands in for the admin's choices); Sundays and the closed days are off.
    const defaultOpen = (d) => d.getUTCDay() !== 0 && !closedDay(d) && (iso(d) === LAUNCH_DATE || (d.getUTCDate() * 7 + d.getUTCMonth() * 3) % 5 !== 0);
    const isOpen = (s) => (overrides.has(s) ? overrides.get(s) : defaultOpen(parse(s)));
    const sample = [ // days after the first bookable evening, name, guests, start, hours, …
      [1, 'Minta Anna', 8, '18:30', 3, 'birthday', 'paid', ['food2'], 'Egy vendég laktózérzékeny.'],
      [4, 'Minta Bence', 10, '18:00', 4, 'team', 'paid', ['food1', 'food3'], '', 'Minta Kft.', '12345678-1-42'],
      [8, 'Minta Csilla', 4, '19:00', 2, 'friends', 'cancelled', [], ''],
      [10, 'Minta Dávid', 6, '18:00', 2, 'family', 'paid', ['food1'], 'Két gyerek is jön.'],
      [15, 'Minta Emma', 5, '20:00', 2, 'friends', 'refunded', [], ''],
    ];
    const used = new Set();
    const bookings = sample.map(([off, name, guests, start, hours, occasion, status, packages, note, company, tax], i) => {
      let d = addDays(WIN.min, off); // days after the first bookable evening; never a Sunday or a closed day
      while (d.getUTCDay() === 0 || closedDay(d) || used.has(iso(d))) d = addDays(d, 1);
      used.add(iso(d));
      const first = name.split(' ')[1].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
      if (status === 'paid') overrides.set(iso(d), true);
      return {
        id: `AH-${String(i + 1).padStart(4, '0')}`, date: iso(d), start, hours, guests, name, email: `minta.${first}@example.com`, phone: `+36 30 000 000${i + 1}`,
        billing: { zip: '0000', city: 'Mintaváros', street: `Minta utca ${i + 1}.`, company: company || '', tax_number: tax || '' },
        occasion, note, packages, status, cake: i === 0, voucher_code: i === 0 ? 'AFTER25' : null, discount: i === 0 ? Math.round(CONFIG.base * .25) : 0, amount: total(guests, hours) - (i === 0 ? Math.round(CONFIG.base * .25) : 0),
        cancelled_at: status === 'paid' ? null : new Date(Date.now() - 864e5).toISOString(), refund_percent: status === 'refunded' ? 100 : null,
      };
    });
    const mockVoucher = (c) => { const k = String(c).trim().toUpperCase(), pct = CONFIG.voucher[k]; return pct ? { valid: true, code: k, percent: pct, discount: Math.round(CONFIG.base * pct / 100) } : { valid: false }; };
    const taken = (s) => bookings.find((b) => b.date === s && b.status === 'paid');
    const range = (from, to, fn) => { const out = []; for (let d = parse(from), e = parse(to); d <= e; d = addDays(d, 1)) { const r = fn(iso(d)); if (r) out.push(r); } return out; };
    const find = (id) => { const b = bookings.find((x) => x.id === id); if (!b) throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' }); return b; };
    const refund = (b) => { const p = refundPercent(b); return { booking: { ...b }, refund_percent: p, refund_huf: Math.round(b.amount * p / 100) }; };
    return {
      // Only opened days are returned; a booked evening stays in the list as 'booked'.
      availability: (from, to, code) => wait({ ...(code ? { voucher: mockVoucher(code) } : {}), days: range(from, to, (s) => (isOpen(s) || taken(s)) && parse(s) >= WIN.min && parse(s) <= WIN.max && { date: s, status: taken(s) ? 'booked' : 'open' }) }),
      book: (p) => wait().then(() => { if (taken(p.date) || !isOpen(p.date)) throw Object.assign(new Error('day_taken'), { status: 409, code: 'day_taken' }); const v = p.voucher ? mockVoucher(p.voucher) : null; if (p.voucher && !v.valid) throw Object.assign(new Error('invalid_voucher'), { status: 400, code: 'invalid_voucher' }); return { preview: true, booking_id: 'AH-0000', amount: total(p.guests, p.hours) - (v ? v.discount : 0) }; }),
      // The guest's own cancel link (signed token in the confirmation email). The mock always shows the first sample booking.
      cancelInfo: () => wait(refund(bookings[0])),
      cancelConfirm: () => wait().then(() => { const b = bookings[0], r = refund(b); b.status = 'refunded'; b.cancelled_at = new Date().toISOString(); b.refund_percent = r.refund_percent; return { ...r, booking: { ...b } }; }),
      admin: {
        days: (from, to) => wait({ days: range(from, to, (s) => ({ date: s, open: isOpen(s) || !!taken(s), booking_id: taken(s)?.id || null })) }),
        setDay: (date, open) => { overrides.set(date, open); return wait({ date, open }); },
        bookings: () => wait({ bookings: bookings.map((b) => ({ ...b })) }),
        cancel: (id) => wait().then(() => { const b = find(id); b.status = 'cancelled'; b.cancelled_at = new Date().toISOString(); return { ...b }; }),
        refund: (id, percent) => wait().then(() => { const b = find(id); b.status = 'refunded'; b.refund_percent = percent; return { ...b }; }),
      },
    };
  })();

  // Real API by default. Mock data for local work without the worker: open the page once with ?mock=1 (kept in this browser), ?mock=0 switches back.
  const USE_MOCK = (() => { try { const q = new URLSearchParams(location.search).get('mock'); if (q === '1') localStorage.setItem('bros-mock', '1'); if (q === '0') localStorage.removeItem('bros-mock'); return localStorage.getItem('bros-mock') === '1'; } catch (e) { return false; } })();
  // real pages: no "sample" labels (the markup carries them for the mock)
  if (!USE_MOCK) { document.title = document.title.replace(' (minta)', '').replace(' (sample)', ''); $$('.aha__sample, [data-mock-only]').forEach((el) => el.remove()); }
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
  const api = USE_MOCK ? mock : http;

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
    ['Saját, privát kávézó (2 óra)', ico('<path d="M8 20h32l-3-9H11z"/><path d="M11 20v18h26V20"/><path d="M20 38V28h8v10"/>')],
    ['3 választható ételválogatás a társaságodnak', ico('<circle cx="24" cy="26" r="12"/><circle cx="24" cy="26" r="6"/><path d="M6 12v10M10 12v10M6 17h4M42 12c-3 3-3 8 0 10v-10z"/>')],
    ['1 ingyenes ital minden vendégnek', ico('<path d="M12 14h24l-3 24H15z"/><path d="M14 22h20"/><path d="M26 14l5-8"/>')],
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
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const openWide = () => { if (matchMedia('(min-width: 980px)').matches) $$('details[data-open-wide]').forEach((d) => { d.open = true; }); };
  // a link to a folded block (#lemondas, #aszf, #csomagok) opens it
  function openTarget() { const el = location.hash.length > 1 && document.getElementById(location.hash.slice(1)); if (el && el.tagName === 'DETAILS') { el.open = true; el.scrollIntoView({ block: 'start' }); $('summary', el).focus({ preventScroll: true }); } }

  // ---------- public page ----------
  function publicPage() {
    const video = $('.ah-hero__video video');
    if (video) { if (still) video.remove(); else { video.autoplay = true; video.play().catch(() => {}); } }
    openWide(); addEventListener('hashchange', openTarget); openTarget();

    // the offer: one price, what is in it, what costs extra
    const C = CONFIG, eg = (g, h) => `${t('{n} fő', { n: g })}, ${hoursTxt(h)}: <b>${ft(total(g, h))}</b>`;
    $('#ah-inc4').innerHTML = INC.map(([txt, svg]) => `<li>${svg}<span>${t(txt)}</span></li>`).join('');
    $('#ah-occ').innerHTML = OCC_TILES.map(([txt, svg], i) => `<li class="ah-occ__tile" style="--tilt:${[-1.5, 1, -.8, 1.6, -1.2, .8, -1][i]}deg">${svg}<span>${t(txt)}</span></li>`).join('');
    $('#ah-tiers').innerHTML = `
      <article class="ah-offer">
        <div class="ah-price">
          <p class="ah-price__name">${t('Privát este')}</p>
          <p class="ah-price__sum">${ft(C.base)}</p>
          <p class="ah-price__for">${t('{a}–{b} fő', { a: C.minGuests, b: C.baseGuests })} · ${hoursTxt(C.baseHours)}</p>
        </div>
        <div class="ah-offer__more">
          <dl class="ah-extra__list">
            <div><dt>${t('További vendég ({a}–{b} fő)', { a: C.baseGuests + 1, b: C.maxGuests })}</dt><dd>+ ${ft(C.extraGuest)} ${t('/ fő')}</dd></div>
            <div><dt>${t('További óra ({t}-ig)', { t: C.close })}</dt><dd>+ ${ft(C.extraHour)} ${t('/ óra')}</dd></div>
          </dl>
          <p class="fine ah-eg"><span class="ah-eg__ex">${t('Például')}: ${eg(8, 2)} · ${eg(6, 3)} · ${eg(12, 4)}</span> ${draftPill()}</p>
          <div class="ah-group">
            <p class="ah-group__tags"><span class="sticker sticker--white">25%</span><span class="sticker sticker--white">35%</span></p>
            <p>${t('Minél többen jöttök, annál nagyobb a kedvezmény: 25% kedvezmény az ételekre 4–7 fő esetén, 35% 8 főtől.')}</p>
            <p class="fine">${t('A három ételválogatás részleteit hamarosan közöljük; a helyszínen fizetitek')}</p>
          </div>
        </div>
      </article>`;
    // S6: the surcharges sit next to the controls they belong to
    $('#ah-hours-hint').textContent = `+ ${ft(C.extraHour)} ${t('/ óra')}`;
    $('#ah-guests-hint').innerHTML = `<span>${t('{a}–{b} fő', { a: C.minGuests, b: C.maxGuests })}</span><span>${t('+ {sum} / fő {n} fő felett', { sum: ft(C.extraGuest).replace(' Ft', '\u00a0Ft'), n: C.baseGuests })}</span>`;

    // packages: the picker in the form
    $('#ah-food-note').textContent = t('A három ételválogatás részleteit hamarosan közöljük; a helyszínen fizetitek') + '. ' + t('Itt csak jelzitek, melyik érdekel titeket, hogy készülni tudjunk.');
    $('#ah-pick').innerHTML = C.packages.map((p) => `<label><input type="checkbox" name="packages" value="${p.id}"><span><b>${t(p.name)}</b><small>${t('Hamarosan · a tartalma még készül')}</small></span><em>${packPrice(p)}</em></label>`).join('');

    const form = $('#ah-form'), guests = $('#ah-guests'), sum = $('#ah-sum'), result = $('#ah-result'), calRoot = $('#ah-cal'), ret = $('#ah-return');
    const F = (n) => form.elements[n];
    let days = new Map(), picked = null, cal = null, nGuests = Number(guests.value) || CONFIG.minGuests, start = STARTS[0], hours = CONFIG.baseHours, sending = false, vch = null;
    $('#ah-cal-mock').hidden = !USE_MOCK;

    // back from Stripe: ?booking=<id>&paid=1 or ?cancelled=1 (docs/after-hours-api.md)
    (() => {
      const q = new URLSearchParams(location.search), paid = q.get('paid') === '1' && q.get('booking'), cancelled = q.get('cancelled') === '1';
      if (!paid && !cancelled) return;
      ret.innerHTML = paid
        ? `<h3>${t('Köszönjük, a foglalás végleges!')}</h3><p>${t('Azonosító')}: <b>${esc(paid)}</b>. ${t('A visszaigazolást és a számlát e-mailben küldjük.')}</p>${USE_MOCK ? `<p class="fine">${t('Előnézet: valójában nem történt foglalás és fizetés.')}</p>` : ''}`
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
    function summary() {
      const n = nGuests, sumNow = total(n, hours) - (vch ? vch.discount : 0), packs = C.packages.filter((p) => form.querySelector(`[name="packages"][value="${p.id}"]`).checked);
      const row = (k, v, cls) => `<div${cls ? ` class="${cls}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`;
      sum.innerHTML =
        row(t('Este'), `${picked ? longDate.format(parse(picked)) : `<span class="is-empty">${t('Még nincs kiválasztva')}</span>`}<small>${start}–${endOf(start, hours)} · ${hoursTxt(hours)} · ${t('{n} fő', { n })}</small>`) +
        row(t('Alapár'), `${ft(C.base)}<small>${t('{a}–{b} fő', { a: C.minGuests, b: C.baseGuests })} · ${hoursTxt(C.baseHours)}</small>`) +
        (extraGuests(n) ? row(t('További vendégek'), `${ft(C.extraGuest * extraGuests(n))}<small>${extraGuests(n)} × ${ft(C.extraGuest)}</small>`) : '') +
        (extraHours(hours) ? row(t('További órák'), `${ft(C.extraHour * extraHours(hours))}<small>${extraHours(hours)} × ${ft(C.extraHour)}</small>`) : '') +
        (vch ? row(t('Kuponkód'), `−${ft(vch.discount)}<small>${esc(vch.code)} · −${vch.percent}% ${t('az alapárból')}</small>`, 'ah-sum__disc') : '') +
        (packs.length ? row(t('Ételválogatás'), `${packs.map((p) => t(p.name)).join(', ')}<small>${t('a helyszínen fizetendő')}</small>`) : '') +
        (F('cake').checked ? row(t('Ünnepi torta'), `${t('kérünk')}<small>${t('10 000 Ft-tól, a helyszínen fizetendő')}</small>`) : '') +
        row(t('Most fizetendő előleg'), ft(sumNow), 'ah-sum__total') +
        `<div class="ah-sum__terms"><p class="fine"><span class="ah-eg__ex">${t('Az ár 2–6 főre és 2 órára szól, a kávézó csak a tiétek, minden vendégnek egy ital jár. További vendégek és órák felárral.')}</span> ${draftPill()}</p></div>`;
      $('#ah-bar-sum').textContent = ft(sumNow);
      $('#ah-bar-txt').textContent = `${t('{n} fő', { n })} · ${picked ? `${shortDate.format(parse(picked))}, ` : ''}${start}–${endOf(start, hours)}`;
      barBtn.textContent = picked ? t('Tovább a fizetéshez') : t('Estét választok');
      barBtn.setAttribute('href', picked ? '#ah-sum-card' : '#foglalas');
    }
    form.addEventListener('change', (e) => { if (e.target.name === 'packages' || e.target.name === 'cake') summary(); });
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
        if (r.voucher && r.voucher.valid) { vch = r.voucher; codeIn.value = r.voucher.code; voucherMsg(t('Kuponkód érvényes: −{sum} az alapárból.', { sum: ft(r.voucher.discount) }), true); }
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
      const input = name === 'date' ? null : F(name);
      let el = $(`#err-${name}`);
      if (!el && input) { el = document.createElement('p'); el.className = 'ah-err'; el.id = `err-${name}`; el.hidden = true; input.after(el); }
      if (!el) return;
      el.textContent = msg; el.hidden = !msg;
      if (input) { if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', el.id); } else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); } }
    }
    const rules = {
      date: () => (picked ? '' : t('Válassz egy szabad estét a naptárban.')),
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
    const check1 = (name) => { const msg = rules[name](name === 'date' || name === 'terms' ? '' : F(name).value.trim()); setErr(name, msg); return !msg; };
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
        else F(bad[0]).focus();
        return;
      }
      if (codeIn.value.trim() && !vch && !(await applyCode())) { codeIn.focus(); return; }
      const v = (n) => F(n).value.trim();
      const payload = {
        date: picked, start, hours, guests: nGuests, tier: 'base', name: v('name'), email: v('email'), phone: v('phone'),
        billing: { zip: v('zip'), city: v('city'), street: v('street'), company: toggle.checked ? v('company') : '', tax_number: toggle.checked ? v('tax_number') : '' },
        occasion: v('occasion'), note: v('note'), packages: [...form.querySelectorAll('[name="packages"]:checked')].map((c) => c.value), cake: F('cake').checked, voucher: vch ? vch.code : '', terms: true, lang: B.lang,
        return_path: location.pathname, // Stripe sends the guest back to this page, wherever the site is mounted
      };
      const btn = form.querySelector('[type="submit"]');
      sending = true; btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      try {
        const res = await api.book(payload);
        if (res.checkout_url) { location.assign(res.checkout_url); return; } // stays busy while the browser leaves
        if (!USE_MOCK || !res.preview) throw new Error('no_checkout_url');
        const back = (q) => `${location.pathname}?${q}`;
        result.innerHTML = `${t('Ez egy előnézet: a valódi oldalon itt a fizetés következne (Stripe).')} ${t('Nézd meg, mi jön utána:')} <a href="${back(`booking=${res.booking_id}&paid=1`)}">${t('sikeres fizetés')}</a> · <a href="${back('cancelled=1')}">${t('megszakított fizetés')}</a>`;
      } catch (err) {
        if (err.code === 'bookings_closed') bookingsClosed();
        else if (err.code === 'payments_not_configured') { notReady(ret); result.textContent = t(NOT_READY); }
        else if (err.code === 'invalid_voucher') { vch = null; voucherMsg(t('Ez a kuponkód nem érvényes. Ellenőrizd, vagy hagyd üresen a mezőt.')); summary(); result.textContent = t('Ez a kuponkód nem érvényes. Ellenőrizd, vagy hagyd üresen a mezőt.'); }
        else if (err.code === 'day_taken') { result.textContent = t('Ezt az estét közben lefoglalták. Válassz másikat.'); picked = null; load(); }
        else result.textContent = t('Most nem sikerült elindítani a foglalást. Próbáld újra egy perc múlva.');
      }
      sending = false; btn.removeAttribute('aria-busy'); btn.disabled = false;
      result.hidden = false; result.focus();
    });

    drawTime();
    setGuests(nGuests);
    load();
  }

  // ---------- admin ----------
  async function adminPage() {
    if (!USE_MOCK) { if (!B.staff) return; await B.staff.guard({ adminOnly: true }); } // refunds: admins only
    const root = $('#ah-admin');
    const ST = { pending: 'fizetésre vár', paid: 'fizetve', cancelled: 'lemondva', refunded: 'visszatérítve', expired: 'lejárt' };
    const OCC = { birthday: 'Születésnap', friends: 'Baráti este', team: 'Céges este, csapatépítő', family: 'Családi alkalom', other: 'Egyéb' };
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
        <span><b>${esc(x.name)}</b><small>${shortDate.format(parse(x.date))} · ${slot(x)} · ${t('{n} fő', { n: x.guests })} · ${ft(x.amount)}${x.voucher_code ? ` · ${esc(x.voucher_code)}` : ''}${x.cake ? ` · ${t('torta')}` : ''}</small></span>${pill(x.status, x.id === fresh)}</button>`).join('') : `<p class="aha__empty">${t('Még nincs foglalás.')}</p>`;
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
      const packs = b.packages.map((p) => t(CONFIG.packages.find((x) => x.id === p)?.name || p)).join(', ') || '–';
      const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
      // paid: what a cancellation would give back now; cancelled: what the terms gave at the moment of cancelling
      const at = b.status === 'cancelled' && b.cancelled_at ? Date.parse(b.cancelled_at) : Date.now(), pct = refundPercent(b, at), back = ft(Math.round(b.amount * pct / 100));
      const hint = b.status === 'paid' ? t('Visszatérítés a lemondási feltételek szerint, ha most mondják le: {p}% ({sum}).', { p: pct, sum: back })
        : b.status === 'cancelled' ? t('Lemondva: {when}. A feltételek szerint ekkor {p}% járt vissza ({sum}).', { when: b.cancelled_at ? stamp.format(new Date(b.cancelled_at)) : '–', p: pct, sum: back }) : '';
      dlg.innerHTML = `
        <div class="aha__dlg-head"><div><h2 id="aha-dlg-title">${esc(b.name)}</h2><p>${pill(b.status, b.id === fresh)}</p></div>
          <button type="button" class="aha__close" data-close aria-label="${t('Bezárás')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
        <dl class="aha__dl" data-id="${esc(b.id)}">
          ${row(t('Azonosító'), esc(b.id))}${row(t('Dátum'), longDate.format(parse(b.date)))}${row(t('Időpont'), `${slot(b)} · ${hoursTxt(b.hours)}`)}${row(t('Vendégszám'), t('{n} fő', { n: b.guests }))}
          ${row(t('Alkalom'), t(OCC[b.occasion] || '–'))}${row(t('Ételválogatás'), `${packs}${b.packages.length ? ` (${t('a helyszínen fizetendő')})` : ''}`)}${row(t('Ünnepi torta'), b.cake ? `${t('kérnek tortát')} (${t('a helyszínen fizetendő')})` : '–')}${b.voucher_code ? row(t('Kuponkód'), `${esc(b.voucher_code)} · −${ft(b.discount || 0)}`) : ''}
          ${row(t('Előleg'), `${ft(b.amount)}${b.status === 'refunded' ? ` · ${t('visszatérítve')}: ${b.refund_percent ?? 0}%` : ''}${breakdown(b)}`)}
          ${row(t('E-mail'), esc(b.email))}${row(t('Telefonszám'), esc(b.phone))}
          ${row(t('Számlázási cím'), esc(`${b.billing.company ? `${b.billing.company} (${b.billing.tax_number}), ` : ''}${b.billing.zip} ${b.billing.city}, ${b.billing.street}`))}
          ${row(t('Megjegyzés'), esc(t(b.note)) || '–')}
        </dl>
        ${hint ? `<p class="aha__hint">${hint}</p>` : ''}
        ${error ? `<p class="ah-err" role="alert">${error === 'payments_not_configured' ? t('Az online fizetés (Stripe) nincs beállítva, ezért innen nem indítható visszatérítés.') : t('Nem sikerült. Próbáld újra egy perc múlva.')}</p>` : ''}
        <div class="aha__actions">
          ${b.status === 'paid' ? `<button type="button" class="btn btn--ghost" data-act="cancel">${t('Foglalás lemondása')}</button>` : ''}
          ${b.status === 'cancelled' ? `<button type="button" class="btn" data-act="refund" data-pct="${pct}">${t('Előleg visszatérítése')} · ${pct}%</button>` : ''}
        </div>
        <p class="fine" style="margin-top:14px">${USE_MOCK ? t('Minta: a gombok csak itt, a képernyőn változtatnak, pénz nem mozog.') : b.invoice_no ? `${t('Számla')}: ${esc(b.invoice_no)}` : b.status === 'paid' ? t('Számla még nincs kiállítva.') : ''}</p>`;
      if (!dlg.open) dlg.showModal();
      (focusSel && $(focusSel, dlg) || $('[data-close]', dlg)).focus();
    }
    list.addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) detail(r.dataset.id); });
    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      const act = e.target.closest('[data-act]'); if (!act || working) return;
      const id = $('.aha__dl', dlg).dataset.id;
      if (!USE_MOCK && !confirm(act.dataset.act === 'cancel' ? t('{id}: lemondjuk a foglalást? A vendég e-mailt kap róla.', { id }) : t('{id}: visszautaljuk az előleg {pct}%-át?', { id, pct: act.dataset.pct }))) return;
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

  // ---------- the guest's cancel page (mock-up of the signed link in the confirmation email) ----------
  async function cancelPage() {
    const root = $('#ah-cancel');
    const token = new URLSearchParams(location.search).get('t') || (USE_MOCK ? 'minta' : '');
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    let working = false;
    const view = (r, done, error) => {
      const b = r.booking;
      root.innerHTML = `
        <h2 id="ah-cancel-name">${esc(b.name)}</h2>
        <dl class="aha__dl">
          ${row(t('Azonosító'), esc(b.id))}${row(t('Dátum'), longDate.format(parse(b.date)))}${row(t('Időpont'), `${slot(b)} · ${hoursTxt(b.hours)}`)}${row(t('Vendégszám'), t('{n} fő', { n: b.guests }))}${row(t('Kifizetett előleg'), `${ft(b.amount)}${breakdown(b)}`)}
          ${row(t('Visszatérítés'), `<b>${ft(r.refund_huf)}</b> (${r.refund_percent}%)`)}
        </dl>
        ${done ? `<p class="ah-preview" role="status" tabindex="-1">${t('A foglalást lemondtuk.')} ${r.refund_huf ? t('A visszatérítés {sum}, néhány napon belül érkezik a fizetéshez használt kártyára.', { sum: ft(r.refund_huf) }) : ''} ${USE_MOCK ? t('Ez egy előnézet: valójában nem történt lemondás és visszatérítés.') : ''}</p>`
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
