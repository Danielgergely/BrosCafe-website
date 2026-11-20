// Bros Cafe — subpage logic (menu, card sign-up, news, contact, game board) and the footer. Header and nav: /shell.js.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const B = window.BROS;
  const t = B.t;
  const S = B.shell, { esc, ft } = S;
  const hu = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v[B.lang] ?? v.hu ?? v.en ?? '' : v ?? '');
  // the hash is user input: survive a broken %-escape
  const hashId = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ''; } };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const still = calm || !!(navigator.connection && navigator.connection.saveData); // no video: the still shows
  const page = document.body.dataset.page;
  document.documentElement.classList.add('js');

  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
    insta: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><path d="M16.6 7.4h.01"/>',
    out: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
    wallet: '<rect x="3.5" y="6" width="17" height="12.5" rx="2.5"/><path d="M3.5 10h17M15.5 14.250h2"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    pause: '<path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z"/>',
  };
  const ico = (n) => (ICONS[n] ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n]}</svg>` : S.icon(n));

  // No photo yet: a small line drawing instead (menu cards, /delivery/ rows).
  const ART = {
    cup: '<path d="M12 21h22v7a11 11 0 0 1-22 0z" fill="var(--surface)"/><path d="M34 24h2.5a4.5 4.5 0 0 1 0 9H33M9 42.5h28M19 15c-2-2.200 2-3.800 0-6M27 15c-2-2.200 2-3.800 0-6"/>',
    tea: '<path d="M12 21h22v7a11 11 0 0 1-22 0z" fill="var(--surface)"/><path d="M34 24h2.5a4.5 4.5 0 0 1 0 9H33M9 42.500h28M22 21v-7.500l6.500-3"/><path d="M28.500 6.500h6.500v8h-6.500z" fill="var(--champagne)"/>',
    bottle: '<path d="M20 5h8v8l4.500 6.500V40a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V19.500L20 13z" fill="var(--surface)"/><path d="M15.500 25h17v9.500h-17z" fill="var(--champagne)"/><path d="M19.500 9h9"/>',
    glass: '<path d="M13 13h22l-2.600 27.200a2 2 0 0 1-2 1.800H17.600a2 2 0 0 1-2-1.800z" fill="var(--surface)"/><path d="M14 21.500h20M27.500 13 32 4h4.500"/><path d="M18.500 26h5.500v5.500h-5.500zM25 32.500h4.500V37H25z" fill="var(--ivory-2)"/>',
    plate: '<circle cx="24" cy="25" r="16" fill="var(--surface)"/><circle cx="24" cy="25" r="9.500"/><path d="M20 22.500c2.500-2 5.500-2 8 0M20.500 27h7"/>',
  };
  const artKind = (p) => (p.cat === 'bottled' ? 'bottle' : p.cat === 'tea' ? 'tea' : p.cat === 'smoothie' || p.temp === 'iced' ? 'glass' : ['sandwich', 'pastry', 'cake', 'dessert'].includes(p.cat) ? 'plate' : 'cup');
  const art = (p) => { const k = artKind(p); return `<span class="art art--${k}"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ART[k]}</svg></span>`; };
  B.drinkArt = art; // also used by /delivery/ and the admin

  async function api(path) {
    const r = await fetch(`/api/${path}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function post(path, body, headers = {}) {
    const r = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body) });
    let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) {
      const err = new Error(r.status); err.status = r.status;
      // a 422 names the field: detail[].loc = ['body', '<field>']
      if (Array.isArray(data?.detail)) err.field = data.detail.map((d) => (d.loc || []).at(-1)).find((x) => typeof x === 'string');
      throw err;
    }
    return data;
  }
  const track = S.track; // funnel events as on the live site: page_view on the menu and contact pages, wallet_added (customer.js)
  const previewPanel = (text, back) => `<span class="done__ico">${ico('mail')}</span><h2>${t('Előnézet')}</h2><p>${t(text)}</p><button class="link" type="button" data-back>${t(back)}</button>`;
  const store = {
    get(k, s = sessionStorage) { try { return s.getItem(k); } catch (e) { return null; } },
    set(k, v, s = sessionStorage) { try { s.setItem(k, v); } catch (e) { /* private mode */ } },
  };

  // ---------- footer and live opening status come from /shell.js ----------
  function chrome() {
    $$('[data-ico]').forEach((el) => { el.outerHTML = ico(el.dataset.ico); });
    S.footer();
    B.mount();
    reveal();
  }

  let io;
  function reveal(root = document) {
    const els = $$('[data-r]:not(.in)', root);
    if (calm || !('IntersectionObserver' in window)) return els.forEach((el) => el.classList.add('in'));
    io ??= new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  }

  // A form that posts to the API: busy button, inline error, success panel in place of the form.
  function liveForm(form, { send, done, tooMany = 'Túl sok próbálkozás. Várj pár percet, és próbáld újra.' }) {
    const btn = $('button[type=submit]', form), note = $('[data-msg]', form), label = btn.innerHTML;
    const say = (msg) => { note.hidden = !msg; note.textContent = msg || ''; if (msg) note.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' }); };
    form.addEventListener('input', (e) => { e.target.removeAttribute('aria-invalid'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const short = (f) => f.minLength > 0 && f.value.trim().length < f.minLength; // minlength alone passes untouched or blank-padded text
      const bad = $$('input, textarea', form).find((f) => !f.closest('[hidden], .hp') && (!f.checkValidity() || short(f)));
      $$('[aria-invalid]', form).forEach((f) => f.removeAttribute('aria-invalid'));
      if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); return say(t(bad.dataset.err || 'Ezt a mezőt töltsd ki.')); }
      say('');
      btn.disabled = true; btn.innerHTML = `<i class="spinner" aria-hidden="true"></i> ${t('Küldés…')}`;
      try {
        const panel = await send(say);
        if (panel) {
          const box = document.createElement('div');
          box.className = 'done'; box.setAttribute('role', 'status'); box.tabIndex = -1; box.innerHTML = panel;
          form.hidden = true; form.after(box);
          box.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' }); box.focus({ preventScroll: true });
          $('[data-back]', box)?.addEventListener('click', () => { box.remove(); form.hidden = false; $('input', form).focus(); });
          if (done) done();
        }
      } catch (err) {
        const f = err.status === 422 && err.field && form.elements[err.field];
        if (f && f.dataset && f.dataset.err) { f.setAttribute('aria-invalid', 'true'); f.focus(); return say(t(f.dataset.err)); }
        say(t(err.status === 422 ? 'Ezt nem tudtuk elfogadni. Nézd át a mezőket, és próbáld újra.' : err.status === 429 ? tooMany : err.status === 502 ? 'Ezt most nem sikerült elküldeni. Írj inkább közvetlenül e-mailben.' : err.status ? 'Valami félrement. Próbáld meg újra.' : 'Nincs kapcsolat. Nézd meg az internetet, és próbáld újra.'));
      } finally { btn.disabled = false; btn.innerHTML = label; }
    });
  }

  // ---------- étlap ----------
  const T = {
    sections: { coffee: 'Kávé & különlegességek', cold: 'Hideg italok', savoury: 'Reggeli & szendvicsek', sweet: 'Édességek' },
    short: { coffee: 'Kávé', cold: 'Hideg', savoury: 'Reggeli', sweet: 'Édes' },
    cats: { coffee: 'Kávék', specialty: 'Különlegességek', tea: 'Teák', smoothie: 'Smoothie-k', sandwich: 'Szendvicsek', pastry: 'Pékáru', cake: 'Sütemények', dessert: 'Helyben készült édességek', bottled: 'Italok', beans: 'Szemes kávé', merch: 'Merch' },
    sectionOfCat: { coffee: 'coffee', specialty: 'coffee', tea: 'coffee', beans: 'coffee', smoothie: 'cold', bottled: 'cold', sandwich: 'savoury', pastry: 'savoury', cake: 'sweet', dessert: 'sweet' },
    allergens: { Milk: 'Tej', Gluten: 'Glutén', Egg: 'Tojás', Nuts: 'Diófélék', Fish: 'Hal', Soy: 'Szója' },
    milks: { Oat: 'Zabtej', CoconutRice: 'Kókusz-rizs tej', Pea: 'Borsótej' },
    scales: [['bitterSweet', 'Keserű', 'Édes'], ['lightBold', 'Könnyed', 'Testes'], ['mildIntense', 'Lágy', 'Intenzív'], ['milkyCreamy', 'Tejes', 'Krémes']],
    temp: { hot: 'Forró', iced: 'Jeges', both: 'Forró vagy jeges' },
  };
  // the café's own product shots (/shared/photos/<id>.jpg)
  const SHOTS = new Set('americano belgian-hot-chocolate brownie-sundae cappuccino caramel-latte chocolate-cookie chocolate-muffin cortado cranberry-oat-cookie espresso-macchiato espresso-tonic espresso flat-white latte mango-chia-pudding mango-matcha mango-smoothie matcha-latte mixed-berry-smoothie nutella-waffle pesto-sandwich pistachio-croissant pistachio-latte prosciutto-croissant pumpkin-spice-latte triple-cheese-sandwich'.split(' '));
  const MEDIA = new Set('espresso espresso-macchiato cortado cappuccino flat-white latte americano matcha-latte'.split(' ')); // /shared/media/coffee-<id>-4x5
  const shot = (p) => {
    if (MEDIA.has(p.id)) return `/shared/media/coffee-${p.id}-4x5.jpg`;
    const own = (p.images || []).find((s) => typeof s === 'string' && s.startsWith('/'));
    if (own) return own.replace(/^\/images\/products\//, '/shared/photos/');
    return SHOTS.has(p.id) ? `/shared/photos/${p.id}.jpg` : null;
  };
  // The till sends names in capitals; show them in sentence case, brand names kept.
  const NAMES = [['san benedetto', 'San Benedetto'], ['coca-cola', 'Coca-Cola'], [' zero', ' Zero'], ['dr pepper', 'Dr Pepper'], ['colombian', 'Colombian'], ['brazilian', 'Brazilian'], ['&t indian tonic', '&T Indian Tonic'], ['&t persian rose tonic', '&T Persian Rose Tonic'], ['&t yuzu tonic', '&T Yuzu Tonic'], ['broscafé', 'BrosCafé'], ['broscafe', 'BrosCafe'], ['nutell', 'Nutell'], ['oreó', 'Oreó'], ['oreo', 'Oreo'], ['ham & eggs', 'Ham & Eggs'], ['pumpkin spice', 'Pumpkin Spice']];
  const nice = (s) => {
    if (!s || s !== s.toUpperCase()) return s || '';
    let out = s.toLocaleLowerCase(B.locale);
    out = out.charAt(0).toLocaleUpperCase(B.locale) + out.slice(1);
    for (const [a, b] of NAMES) out = out.split(a).join(b).split(a.charAt(0).toUpperCase() + a.slice(1)).join(b);
    return out;
  };
  // <img>, with the .webp twin for everything in /shared/media/
  const pic = (src, attrs) => (src.startsWith('/shared/media/') ? `<picture><source srcset="${esc(src.replace(/\.jpg$/, '.webp'))}" type="image/webp"><img src="${esc(src)}" ${attrs}></picture>` : `<img src="${esc(src)}" ${attrs}>`);
  const CACHE = 'bros-d-products';
  const vtName = (el, name) => { if (el) { el.style.viewTransitionName = name || ''; el.style.viewTransitionClass = name ? 'product' : ''; } };

  function etlap() {
    const out = $('#menu'), bar = $('#menu-tabs'), q = $('#menu-q'), clear = $('#menu-clear'), menubar = $('.menubar'), toggle = $('#menu-search'), dlg = $('#detail'), box = $('#detail-box');
    // the group labels stick right under the tab bar, whatever its height is
    const barH = () => document.documentElement.style.setProperty('--mbar-h', `${menubar.offsetHeight}px`);
    barH(); if ('ResizeObserver' in window) new ResizeObserver(barH).observe(menubar);
    let items = [], byId = {}, secs = [], active = null, openId = null;
    const want = hashId();
    track('page_view', { src: 'menu' });
    // search ignores case and accents ("edes" finds "édes")
    const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    function load(list) {
      items = list.filter((p) => p.active !== false && p.cat !== 'merch');
      items.forEach((p) => { p.section ||= T.sectionOfCat[p.cat] || 'coffee'; p.img = shot(p); p.n = nice(hu(p.name)); p.fn = fold(p.n); p.rest = fold([hu(p.desc), t(T.cats[p.cat] || ''), t(T.sections[p.section] || '')].join(' ')); });
      items.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      byId = Object.create(null);
      items.forEach((p) => { byId[p.id] = p; });
      secs = Object.keys(T.sections).filter((s) => items.some((p) => p.section === s));
      if (!secs.includes(active)) active = (byId[want] && byId[want].section) || secs[0];
      bar.innerHTML = secs.map((s) => `<button type="button" data-s="${s}" aria-pressed="false"><span class="seg__short">${T.short[s]}</span><span class="seg__long">${T.sections[s]}</span></button>`).join('');
      draw();
    }
    const card = (p, drawn) => (p.img || drawn
      ? `<button class="item" type="button" data-id="${esc(p.id)}"><span class="item__ph">${p.img ? pic(p.img, 'alt="" loading="lazy" width="400" height="500"') : art(p)}${p.temp === 'iced' || p.temp === 'both' ? `<span class="item__temp">${p.temp === 'iced' ? 'Jeges' : 'Jegesen is'}</span>` : ''}</span><span class="item__body"><span class="item__name">${esc(p.n)}</span><span class="item__price">${ft(p.price_huf)}</span></span></button>`
      : `<button class="mrow" type="button" data-id="${esc(p.id)}"><span class="item__name">${esc(p.n)}</span><span class="item__price">${ft(p.price_huf)}</span>${S.icon('chevron')}</button>`);
    const group = (l) => (l.some((p) => p.img) ? `<div class="mgrid">${l.map((p) => card(p, true)).join('')}</div>` : l.length ? `<div class="mrows">${l.map((p) => card(p)).join('')}</div>` : '');
    function draw() {
      const term = fold(q.value.trim());
      clear.hidden = !term;
      $$('button', bar).forEach((b) => b.setAttribute('aria-pressed', !term && b.dataset.s === active));
      let html = '', n = 0;
      if (term) {
        // name matches first (names starting with the term on top), then description / category matches; allergens are not searched
        const rank = (p) => (p.fn.startsWith(term) ? 0 : p.fn.includes(term) ? 1 : p.rest.includes(term) ? 2 : 3);
        const hits = [0, 1, 2].map((r) => items.filter((p) => rank(p) === r));
        const names = [...hits[0], ...hits[1]];
        n = names.length + hits[2].length;
        if (n) html = `<section class="msec"><h2 class="msec__title">${t('{n} találat', { n })}</h2>${group(names)}${names.length && hits[2].length ? `<h3 class="mcat mcat--plain"><span>${t('A leírásban')}</span></h3>` : ''}${group(hits[2])}</section>`;
      } else {
        const list = items.filter((p) => p.section === active);
        const cats = [...new Set(list.map((p) => p.cat))];
        const of = (c) => list.filter((p) => p.cat === c);
        // more than one group: chips on top jump to a group, and each group's label stays in sight while it scrolls by
        if (list.length) html = `<section class="msec"><h2 class="msec__title">${T.sections[active]}</h2>
          ${cats.length > 1 ? `<div class="mjump" role="group" aria-label="${t('Ugrás a csoporthoz')}">${cats.map((c) => `<button class="chip" type="button" data-jump="cat-${esc(c)}">${T.cats[c] || esc(c)}<small>${of(c).length}</small></button>`).join('')}</div>` : ''}
          ${cats.map((c) => `<div class="mgroup" id="cat-${esc(c)}"><h3 class="mcat"><span>${T.cats[c] || esc(c)}</span></h3>${group(of(c))}</div>`).join('')}</section>`;
      }
      out.innerHTML = html ? `<p class="visually-hidden" role="status">${term ? t('{n} találat', { n }) : ''}</p>${html}` : `<p class="state">${items.length ? 'Ilyen még nincs — de szólj, és elgondolkodunk rajta.' : 'Az étlap most nem érhető el. Próbáld újra egy perc múlva.'}</p>`;
    }
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      q.value = ''; active = b.dataset.s;
      S.transition(draw);
      const top = menubar.previousElementSibling.getBoundingClientRect().bottom + scrollY - parseFloat(getComputedStyle(document.body).paddingTop);
      if (scrollY > top) window.scrollTo({ top, behavior: 'auto' });
    });
    q.addEventListener('input', draw);
    clear.addEventListener('click', () => { q.value = ''; draw(); q.focus(); });
    toggle.addEventListener('click', () => {
      const on = menubar.classList.toggle('is-searching');
      toggle.setAttribute('aria-expanded', on);
      if (on) q.focus(); else if (q.value) { q.value = ''; draw(); }
    });

    const detail = (p) => {
      const list = (k, title) => ((hu(p[k]) || []).length ? `<details class="fold"><summary>${title}</summary><ul class="plain">${hu(p[k]).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '');
      const tags = (arr, map, title, cls = '') => ((arr || []).length ? `<div><h3>${title}</h3><p class="tags">${arr.map((a) => `<span class="tag ${cls}">${t(map[a] || a)}</span>`).join('')}</p></div>` : '');
      const fl = p.flavor ? `<div><h3>Ízvilág</h3>${T.scales.map(([k, a, b]) => (p.flavor[k] == null ? '' : `<div class="scale"><span>${a}</span><i style="--v:${Math.max(0, Math.min(100, p.flavor[k]))}"></i><span>${b}</span></div>`)).join('')}</div>` : '';
      const pairs = (p.pairings || []).map((x) => byId[x]).filter(Boolean);
      const sizes = hu(p.sizes) || [];
      return `<button class="detail__close" type="button" data-close aria-label="${t('Bezárás')}">${S.icon('close')}</button>
        <div class="detail__in">${p.img ? `<div class="detail__ph">${pic(p.img, `alt="${esc(p.n)}" width="800" height="1000"`)}</div>` : '<div class="detail__ph detail__ph--none"></div>'}
        <div class="detail__body">
          <p class="detail__kind">${t(T.cats[p.cat] || '')}${T.temp[p.temp] ? ' · ' + t(T.temp[p.temp]) : ''}</p>
          <div class="detail__head"><h2 id="detail-title">${esc(p.n)}</h2><p class="detail__price">${ft(p.price_huf)}</p></div>
          ${hu(p.desc) ? `<p class="detail__desc">${esc(hu(p.desc))}</p>` : ''}
          <div class="detail__facts">
            ${sizes.length ? `<div><h3>Méret</h3><p class="tags">${sizes.map((x) => `<span class="tag tag--plain">${esc(x)}</span>`).join('')}</p></div>` : ''}
            ${tags(p.allergens, T.allergens, 'Allergének', 'tag--plain')}${tags(p.milks, T.milks, 'Alternatív tejek')}
            ${hu(p.tip) ? `<div><h3>Bros tipp</h3><p class="tip">${esc(hu(p.tip))}</p></div>` : ''}
            ${fl}${list('ingredients', 'Összetevők')}${list('behind', 'A csésze mögött')}
            ${pairs.length ? `<div><h3>Jól megy hozzá</h3><div class="chips">${pairs.map((x) => `<button class="chip" type="button" data-id="${esc(x.id)}">${esc(x.n)}</button>`).join('')}</div></div>` : ''}
          </div>
        </div></div>`;
    };
    const cardImg = (id) => { const el = id && $(`[data-id="${CSS.escape(id)}"] img`, out); if (!el) return null; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight ? el : null; };
    const morphs = !!document.startViewTransition && !calm;
    // Phones: a sheet that rises on a spring, follows the finger on its grab bar and can be thrown away (BROS.shell.sheet).
    // Desktop and reduced motion: a panel; closing it morphs the photo back into its card.
    const ctl = S.sheet(dlg, { wide: matchMedia('(min-width: 760px)'), hide: closeMorph });
    function open(id, { instant = false } = {}) {
      const p = byId[id]; if (!p) return;
      const from = !instant && !dlg.open && morphs && cardImg(id);
      const fill = (show) => {
        vtName(from, ''); vtName($('.detail__ph img', dlg), '');
        box.innerHTML = detail(p);
        dlg.classList.toggle('no-anim', instant || !!from);
        if (!dlg.open) show();
        vtName($('.detail__ph img', dlg), `product-${id}`);
        $('.detail__body', dlg).scrollTop = 0; $('.detail__in', dlg).scrollTop = 0;
        openId = id;
      };
      if (instant) fill(() => dlg.showModal());
      else if (from) { vtName(from, `product-${id}`); S.transition(() => fill(() => dlg.showModal())); } // the card's photo flies into the detail
      else if (dlg.open) S.transition(() => fill());
      else fill(() => ctl.open());
      history.replaceState(null, '', `#${id}`);
    }
    function closeMorph() {
      if (!dlg.open) return;
      const back = cardImg(openId), id = openId;
      const tr = S.transition(() => { vtName($('.detail__ph img', dlg), ''); dlg.close(); vtName(back, `product-${id}`); });
      const tidy = () => vtName(back, '');
      if (tr) tr.finished.catch(() => {}).then(tidy); else tidy();
    }
    out.addEventListener('click', (e) => {
      const j = e.target.closest('[data-jump]');
      if (j) return document.getElementById(j.dataset.jump)?.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
      const b = e.target.closest('[data-id]'); if (b) open(b.dataset.id);
    });
    dlg.addEventListener('click', (e) => { const pair = e.target.closest('[data-id]'); if (pair) open(pair.dataset.id); }); // closing: BROS.shell.sheet
    window.addEventListener('hashchange', () => { const id = hashId(); if (id && id !== openId && byId[id]) { if (byId[id].section !== active) { active = byId[id].section; q.value = ''; draw(); } open(id); } });
    dlg.addEventListener('close', () => { openId = null; history.replaceState(null, '', location.pathname + location.search); });

    // Cached menu first (so a card opened from another page is there before the first paint), then the live one.
    let cached = null;
    try { cached = JSON.parse(store.get(CACHE)); } catch (e) { /* */ }
    if (Array.isArray(cached) && cached.length) { load(cached); if (want) open(want, { instant: true }); }
    else if (want && SHOTS.has(want)) {
      box.innerHTML = `<div class="detail__in"><div class="detail__ph">${pic(shot({ id: want }), 'alt="" width="800" height="1000"')}</div><div class="detail__body"><p class="state"><i class="spinner" aria-hidden="true"></i></p></div></div>`;
      dlg.classList.add('no-anim'); dlg.showModal(); vtName($('.detail__ph img', dlg), `product-${want}`);
    }
    api('products').then((list) => {
      const raw = JSON.stringify(list);
      if (raw === store.get(CACHE) && items.length) return;
      store.set(CACHE, raw);
      const was = openId || (dlg.open ? want : null);
      load(list);
      if (was && byId[was]) open(was, { instant: true }); else if (dlg.open) dlg.close();
      else if (want && !cached) open(want, { instant: true });
    }).catch(() => { if (!items.length) { if (dlg.open) dlg.close(); draw(); } });
  }

  // ---------- hűségkártya ----------
  function husegkartya() {
    const card = $('.lcard'), slots = $$('.lcard__grid i'), line = $('#card-line');
    let n = 0;
    const set = (k) => {
      n = k; slots.forEach((s, i) => s.classList.toggle('on', i < n));
      line.textContent = n >= 10 ? t('Összejött az ingyen kávé! Mutasd a kártyát a pultnál.') : n === 9 ? t('Még egy kávé, és a következő ingyen van.') : t('Még {n} kávé az ingyenesig.', { n: 10 - n });
      card.classList.toggle('full', n >= 10);
    };
    set(5);
    card.addEventListener('click', () => set(n >= 10 ? 5 : n + 1));

    const form = $('#join-form'), email = form.elements.email, name = form.elements.first_name, nameBox = $('#join-name');
    const last = store.get('bros-last-email', localStorage);
    if (last && !email.value) email.value = last;
    // a stored session was rejected: say so, instead of looking as if the site forgot them
    if (S.customer.expired()) form.insertAdjacentHTML('afterbegin', `<div class="note" role="status"><b>${t('Lejárt a belépésed')}</b><br>${t('A belépés 30 napig él, ezért kiléptettünk. A kártyád és minden pecsétje megvan — add meg az e-mail-címed, és küldünk egy új linket.')}</div>`);
    liveForm(form, {
      async send() {
        const addr = email.value.trim();
        if (S.guard) return previewPanel('Ez egy előnézet: a valódi oldalon itt elküldjük a belépő linket az e-mail-címedre, és elkészül a kártyád.', 'Másik e-mail-címet adok meg');
        const data = await post('auth/request-link', { email: addr, first_name: name.value.trim(), lang: B.lang, ref: new URLSearchParams(location.search).get('ref') || undefined });
        // a new address: nothing was created or sent yet, ask for the name first
        if (data && data.needs_name) { nameBox.hidden = false; name.required = true; name.focus(); return null; }
        store.set('bros-last-email', addr, localStorage);
        try { sessionStorage.removeItem('bros-expired'); } catch (e) { /* */ }
        return `<span class="done__ico">${ico('mail')}</span><h2>${t('Nézd meg a postafiókod')}</h2>
          <p>${esc(t('Elküldtük a belépő linket a {email} címre. Húsz percig érvényes.', { email: addr }))}</p>
          <p class="note">${t('Nem látod? Nézd meg a spam vagy a levélszemét mappát is — az első levelünk sajnos gyakran oda kerül.')}</p>
          <button class="link" type="button" data-back>${t('Másik e-mail-címet adok meg')}</button>`;
      },
    });
  }

  // ---------- újdonságok ----------
  const TAGS = { house: 'A kávénk', pastry: 'Péksütemény', brewing: 'Kávékészítés', origin: 'Termőterület', event: 'Esemény', team: 'A pult mögött' };
  // docs/media-picks.md; all in /shared/media/
  const TAG_PHOTO = { house: 'place-bean-shelf-4x5', pastry: 'menu-croissant-sandwich-4x5', brewing: 'coffee-flat-white-4x5', origin: 'coffee-americano-4x5', event: 'place-dining-room-daylight-4x5', team: 'team-brothers-3x2' };
  const CLIPS = [['hero-iced-pour-hands', 'Jeges kávé készül'], ['place-serving-table', 'Érkezik a rendelés'], ['place-espresso-bar', 'A pult mögött'], ['after-hours-lounge-evening', 'Esti fények']];
  // "2026-09-10" is a calendar day (shown as written, wherever the reader is); a full timestamp is shown in Budapest time
  const date = (d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')), fmt = { year: 'numeric', month: 'long', day: 'numeric' };
    const at = m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : new Date(d);
    return isNaN(at) ? String(d || '') : at.toLocaleDateString(B.locale, { ...fmt, timeZone: m ? 'UTC' : 'Europe/Budapest' });
  };
  function clips() {
    const row = $('#clips'); if (!row) return;
    const src = (n) => `/shared/media/${n}-9x16`;
    row.innerHTML = CLIPS.map(([n, cap]) => (still
      ? `<figure class="clip">${pic(`${src(n)}.jpg`, 'alt="" loading="lazy" width="720" height="1280"')}<figcaption class="clip__cap">${cap}</figcaption></figure>`
      : `<button class="clip" type="button" aria-pressed="false" aria-label="${esc(t(cap))} — ${t('videó megállítása vagy indítása')}"><video muted loop playsinline preload="none" poster="${src(n)}.jpg" width="720" height="1280"><source src="${src(n)}.mp4" type="video/mp4"></video><span class="clip__state" hidden>${ico('play')}</span><span class="clip__cap">${cap}</span></button>`)).join('')
      + `<a class="clip clip--ig" href="https://instagram.com/broscafe.co" target="_blank" rel="noopener">${ico('insta')}<b>Még több az Instagramon</b><span>@broscafe.co</span></a>`;
    if (still || !('IntersectionObserver' in window)) return;
    // play only what is on screen; a tap pauses that clip for good
    const seen = new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target; v.dataset.on = e.isIntersecting ? '1' : '';
      if (e.isIntersecting && !v.dataset.stop) v.play().catch(() => {}); else v.pause();
    }), { threshold: 0.5 });
    $$('video', row).forEach((v) => seen.observe(v));
    row.addEventListener('click', (e) => {
      const b = e.target.closest('button.clip'); if (!b) return;
      const v = $('video', b), stop = !v.dataset.stop;
      v.dataset.stop = stop ? '1' : ''; b.setAttribute('aria-pressed', stop); $('.clip__state', b).hidden = !stop;
      if (stop) v.pause(); else if (v.dataset.on) v.play().catch(() => {});
    });
    document.addEventListener('visibilitychange', () => $$('video', row).forEach((v) => { if (document.hidden) v.pause(); else if (v.dataset.on && !v.dataset.stop) v.play().catch(() => {}); }));
  }
  // Our Instagram reels (worker: services/reels.ts, picked in the admin): our own covers in a row; a tap plays the reel in
  // Instagram's player in a sheet, so nothing loads from Instagram before that. Until staff add reels the four clips stay.
  async function reels() {
    const row = $('#clips'); if (!row) return true;
    let f;
    try { const r = await fetch('/api/reels', { headers: { Accept: 'application/json' } }); if (!r.ok) return false; f = await r.json(); } catch (e) { return false; }
    if (!f.items || !f.items.length) return false;
    // a cover carries its own title (skill reel-cover); a reel without one is a title tile in the café colours
    const coverOf = (r) => (B.lang === 'en' && r.cover_en) || r.cover;
    row.innerHTML = f.items.map((r, i) => `<button class="clip clip--reel${coverOf(r) ? '' : ' clip--text'}" type="button" data-reel="${i}" aria-label="${esc(`${t('Videó lejátszása')}${r.caption ? `: ${r.caption}` : ''}`)}">
        ${coverOf(r) ? `<img src="${esc(coverOf(r))}" alt="" loading="lazy" width="720" height="1280">` : ''}<span class="clip__play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>
        ${r.caption && !coverOf(r) ? `<span class="clip__title">${esc(r.caption)}</span>` : ''}</button>`).join('')
      + `<a class="clip clip--ig" href="${esc(f.profile)}" target="_blank" rel="noopener">${ico('insta')}<b>${t('Még több az Instagramon')}</b><span>@broscafe.co</span></a>`;
    let dlg = null, ctl = null, last = null;
    row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-reel]'); if (!b) return;
      last = b;
      const r = f.items[Number(b.dataset.reel)];
      if (!dlg) {
        document.body.insertAdjacentHTML('beforeend', `<dialog class="sheet reel-sheet" id="reel-sheet" aria-labelledby="reel-title">
          <div class="sheet__grab"><div class="sheet__head"><span class="sheet__title" id="reel-title">@broscafe.co</span><button class="sheet__close" type="button" aria-label="${t('Bezárás')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></div>
          <div class="reel-sheet__frame"></div>
          <div class="reel-sheet__acts"><a class="btn" href="${esc(f.profile)}" target="_blank" rel="noopener">${t('Kövess minket az Instagramon')}</a><a class="link" data-open target="_blank" rel="noopener">${t('Megnyitás az Instagramon')}</a></div>
          <p class="reel-sheet__fine">${t('A videót az Instagram lejátszója mutatja.')}</p></dialog>`);
        dlg = $('#reel-sheet'); ctl = S.sheet(dlg);
        dlg.addEventListener('close', () => { $('.reel-sheet__frame', dlg).innerHTML = ''; last?.focus(); }); // emptying the frame stops the reel
      }
      $('.reel-sheet__frame', dlg).innerHTML = `<iframe src="https://www.instagram.com/reel/${encodeURIComponent(r.code)}/embed/" title="${esc(r.caption || 'Instagram reel')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      $('[data-open]', dlg).href = r.link;
      ctl.open();
    });
    return true;
  }
  async function ujdonsagok() {
    reels().then((ok) => { if (!ok) clips(); });
    const out = $('#posts');
    let posts = [], products = [];
    try { [posts, products] = await Promise.all([api('whats-new'), api('products').catch(() => [])]); }
    catch (e) { out.innerHTML = '<p class="state">A hírek most nem érhetők el. Próbáld újra egy perc múlva.</p>'; return; }
    posts = posts.filter((p) => p.active !== false).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const names = Object.fromEntries(products.map((p) => [p.id, nice(hu(p.name))]));
    out.innerHTML = posts.map((p, i) => {
      const own = typeof p.image === 'string' && p.image.startsWith('/') ? p.image : null;
      const photo = own || `/shared/media/${TAG_PHOTO[(p.tags || []).find((x) => TAG_PHOTO[x])] || 'place-dining-room-daylight-4x5'}.jpg`;
      const linked = (p.product_ids || []).filter((id) => names[id]);
      return `<article class="post" id="${esc(p.id)}">
        <div class="post__top"><span class="cut post__pic">${pic(photo, 'alt="" loading="lazy" width="400" height="500"')}</span>
          <div><p class="post__meta"><span>${esc(date(p.date))}</span>${(p.tags || []).filter((x) => TAGS[x]).map((x) => `<span class="tag">${TAGS[x]}</span>`).join('')}</p><h3>${esc(hu(p.title))}</h3></div></div>
        <p class="post__blurb">${esc(hu(p.blurb))}</p>
        ${hu(p.body) ? `<details class="fold"><summary>Elolvasom</summary>${hu(p.body).split(/\n\s*\n/).map((x) => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
        ${linked.length ? `<div class="post__more"><p class="label">Kóstold meg</p><div class="chips">${linked.map((id) => `<a class="chip" href="/etlap/#${esc(id)}">${esc(names[id])}</a>`).join('')}</div></div>` : ''}
      </article>`;
    }).join('') || '<p class="state">Hamarosan jövünk az első hírrel.</p>';
    const hit = hashId() && document.getElementById(hashId());
    if (hit) { const d = $('details', hit); if (d) d.open = true; hit.scrollIntoView({ block: 'start' }); }
  }

  // ---------- kapcsolat ----------
  function kapcsolat() {
    track('page_view', { src: 'contact' });
    api('cafe').then((c) => {
      const tel = (c.phone || '').trim(); if (!tel) return;
      $('#reach').insertAdjacentHTML('afterbegin', `<a href="tel:${esc(tel.replace(/[^+\d]/g, ''))}">${ico('phone')}<span>${esc(tel)}</span></a>`);
    }).catch(() => {});
    const form = $('#contact-form');
    liveForm(form, {
      tooMany: 'Már küldtél néhány üzenetet — hagyj egy kis időt, hogy válaszolni tudjunk.',
      async send() {
        const f = form.elements;
        if (S.preview) { form.reset(); return previewPanel('Ez egy előnézet: a valódi oldalon itt elküldjük az üzeneted a Bros Cafe csapatának.', 'Írok még egyet'); }
        await post('contact', { name: f.name.value.trim(), email: f.email.value.trim(), message: f.message.value.trim(), website: f.website.value }, { 'X-Lang': B.lang });
        form.reset();
        return `<span class="done__ico">${ico('mail')}</span><h2>${t('Köszönjük, elküldtük')}</h2>
          <p>${t('Megkaptuk, és a megadott címre válaszolunk — általában egy napon belül.')}</p>
          <button class="link" type="button" data-back>${t('Írok még egyet')}</button>`;
      },
    });
  }

  // ---------- játék ----------
  function jatek() {
    const out = $('#board'), bar = $('#periods');
    let turn = 0;
    const load = async (period) => {
      const mine = ++turn;
      out.innerHTML = '<li class="state"><i class="spinner" aria-hidden="true"></i></li>';
      let html;
      try {
        const rows = await api(`game/leaderboard?period=${period}`);
        html = rows.length ? rows.slice(0, 10).map((r, i) => `<li><b>${i + 1}</b><span>${esc(r.name)}</span><em>${Number(r.score).toLocaleString(B.locale)}</em></li>`).join('')
          : `<li class="state">${period === 'all' ? 'Még senki sem futott. Legyél te az első.' : 'Ebben az időszakban még senki sem futott. Legyél te az első.'}</li>`;
      } catch (e) { html = '<li class="state">A ranglista most nem érhető el.</li>'; }
      if (mine === turn) out.innerHTML = html;
    };
    bar.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; $$('.chip', bar).forEach((c) => c.setAttribute('aria-pressed', c === b)); load(b.dataset.p); });
    load('week');
  }


  chrome();
  ({ etlap, husegkartya, ujdonsagok, kapcsolat, jatek }[page] || (() => {}))();
})();
