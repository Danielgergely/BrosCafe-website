// Bros Cafe — home: films, the "next" tabs and the index rail, the scroll driver for browsers without scroll-driven
// animations, live opening status, the time-aware extra, detail panels. The motion itself is CSS (style.css, "motion").
(() => {
  const B = window.BROS, t = B.t, shell = B.shell, esc = shell.esc;
  const root = document.documentElement;
  const still = root.classList.contains('still');
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const scenes = $$('.scene');
  const desk = matchMedia('(min-width: 900px)');
  const MAPS = 'https://www.google.com/maps/search/?api=1&query=Bros%20Cafe%2C%201132%20Budapest%2C%20Csan%C3%A1dy%20u.%204%2Fb';

  // ---------- films ----------
  // One <video> per clip (data-film="a.mp4|b.mp4|…"; a single clip gets a twin of itself); shortly before a clip ends the
  // next one starts on top and fades in, so the loop shows no hard cut. A film plays while it is on screen.
  // data-clip (the file name) lets CSS grade each clip on its own.
  // iPhone Safari only starts a muted video that is visible on screen, so no clip is ever hidden: all stay stacked
  // (current on top), the next starts underneath and the top one fades out. The first shows the still as its poster.
  const FADE = 0.6;
  const build = (media) => {
    const list = ((desk.matches && media.dataset.filmWide) || media.dataset.film).split('|');
    const img = media.querySelector('img'), poster = img ? img.currentSrc || img.src : '';
    const vids = (list.length > 1 ? list : [list[0], list[0]]).map((u, i) => {
      const v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'none'; v.disablePictureInPicture = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
      if (i === 0 && poster) v.poster = poster;
      v.style.zIndex = i === 0 ? 2 : 0;
      v.src = u; v.dataset.clip = u.split('/').pop().replace(/-\d+x\d+\.mp4$/, '');
      media.appendChild(v);
      return v;
    });
    const film = { vids, cur: 0, on: false, seen: false, fading: false };
    vids.forEach((v, i) => {
      v.addEventListener('playing', () => {
        if (film.cur !== i) return;
        const next = vids[(i + 1) % vids.length]; // fetch the next clip while this one plays
        if (next !== v && next.readyState === 0) { next.preload = 'auto'; next.load(); }
      });
      v.addEventListener('timeupdate', () => {
        if (film.cur !== i || !film.on || film.fading || !v.duration || v.duration - v.currentTime > FADE) return;
        const n = (i + 1) % vids.length, next = vids[n];
        film.cur = n; film.fading = true;
        try { next.currentTime = 0; } catch (e) { /* not loaded yet */ }
        next.style.zIndex = 1; next.play().catch(() => {});
        v.classList.add('is-out');
        setTimeout(() => { v.style.zIndex = 0; v.classList.remove('is-out'); next.style.zIndex = 2; film.fading = false; }, FADE * 1000 + 80);
      });
    });
    return film;
  };
  const run = (film, on) => {
    if (film.on === on) return;
    film.on = on;
    if (on) film.vids[film.cur].play().catch(() => {}); // autoplay refused (low power mode): the still stays
    else film.vids.forEach((v) => v.pause());
  };
  if (!root.classList.contains('novideo') && 'IntersectionObserver' in window) {
    const films = new Map();
    const io = new IntersectionObserver((es) => es.forEach((e) => { const f = films.get(e.target); f.seen = e.isIntersecting; run(f, f.seen && !document.hidden); }), { threshold: 0.4 });
    $$('.film[data-film]').forEach((m) => { films.set(m, build(m)); io.observe(m); });
    document.addEventListener('visibilitychange', () => films.forEach((f) => run(f, f.seen && !document.hidden)));
  }

  // ---------- stops: the hero, the act's start (cups) and end (the two cards), the visit ----------
  // "next" tabs on phones, the index rail on desktop. A scene with data-stops="A|B" has a stop at its top and one at its end.
  shell.footer();
  const act = $('.act'), stage = $('.act__stage');
  const pinned = () => !still && getComputedStyle(stage).position === 'sticky';
  const headH = () => parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY - headH();
  const stops = [];
  scenes.forEach((s) => {
    (s.dataset.stops || s.dataset.name).split('|').forEach((name, n) => stops.push({
      name: t(name), id: n ? 'extrak' : s.id,
      y: () => (n && pinned() ? pageTop(s) + s.offsetHeight - stage.offsetHeight : pageTop(n ? $('#extrak') : s)),
    }));
  });
  const smooth = () => (still ? 'auto' : 'smooth');
  const go = (i) => window.scrollTo({ top: i >= stops.length || i < 0 ? 0 : Math.max(0, stops[i].y()), behavior: smooth() });
  const tabs = scenes.map((s, i) => {
    if (!i) return null;
    const a = document.createElement('a');
    a.className = 'scene__tab'; a.href = `#${s.id}`;
    a.innerHTML = `<span>${esc(t(s.dataset.name))}</span>${shell.icon('chevron')}`;
    a.addEventListener('click', (e) => { e.preventDefault(); go(stops.findIndex((x) => x.id === s.id)); });
    s.prepend(a);
    return a;
  });
  const reel = $('#reel');
  reel.innerHTML = `<ol>${stops.map((s, i) => `<li><a href="#${s.id}" data-i="${i}" title="${esc(s.name)}" aria-label="${esc(s.name)}"><span class="reel__name" aria-hidden="true">${esc(s.name)}</span></a></li>`).join('')}</ol>`
    + `<button class="reel__next" type="button"><span></span>${shell.icon('chevron')}</button>`;
  const dots = $$('a', reel), next = $('.reel__next', reel);
  let current = -1;
  const setCurrent = (i) => {
    if (i === current) return;
    current = i;
    dots.forEach((d, n) => { if (n === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    const last = i === stops.length - 1;
    const label = last ? t('Az elejére') : stops[i + 1].name;
    next.firstElementChild.textContent = label;
    next.setAttribute('aria-label', last ? label : t('Következő: {a}', { a: label }));
    next.classList.toggle('is-up', last);
  };
  reel.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) { e.preventDefault(); go(+a.dataset.i); } else if (e.target.closest('.reel__next')) go(current + 1);
  });
  reel.hidden = false;
  // the current stop: the last one the scroll has (almost) reached
  const locate = () => {
    const y = window.scrollY + innerHeight * 0.4;
    let i = 0;
    stops.forEach((s, n) => { if (s.y() <= y) i = n; });
    setCurrent(i);
    // a tab is a way forward: once its scene is on screen it has done its job (on desktop it is only the sheet's edge)
    tabs.forEach((a, n) => {
      if (!a) return;
      const past = scenes[n].getBoundingClientRect().top < innerHeight * 0.6;
      a.classList.toggle('is-past', past && !desk.matches); a.inert = past || desk.matches;
    });
  };
  window.addEventListener('scroll', locate, { passive: true });
  window.addEventListener('resize', locate);
  desk.addEventListener('change', () => { current = -1; locate(); });
  locate();

  // keyboard: a cup or a card that takes focus while the stage is pinned is brought on screen by scrolling to its moment
  const cupLinks = $$('.cup');
  act.addEventListener('focusin', (e) => {
    if (!pinned() || !e.target.matches(':focus-visible')) return;
    const a = e.target.closest('.cup, .half, .act__foot a');
    if (!a) return;
    const w0 = parseFloat(getComputedStyle(stage).getPropertyValue('--w0')) || 0, n = cupLinks.length, i = cupLinks.indexOf(a);
    // the wheel turns from cup -w0 to cup (n - 1 + w0) in the middle, between .03 and .58 of the pinned stretch
    const p = i < 0 ? (a.matches('.half') ? 1 : 0) : 0.03 + 0.55 * Math.max(0, Math.min(1, (i + w0) / (n - 1 + 2 * w0 || 1)));
    // after the browser's own scroll-into-view, which cannot know where a turning cup will be
    const settle = () => window.scrollTo({ top: pageTop(act) + p * (act.offsetHeight - stage.offsetHeight), behavior: 'instant' });
    setTimeout(settle, 0);
    window.addEventListener('scrollend', settle, { once: true });
  });

  // ---------- scroll driver, only where scroll-driven animations are missing ----------
  // The numbers the view timelines give: --pin = how far a scene has come up into the window between the header and
  // the tab bar, --pout = how far it has left it, --p = how far the pinned act has been scrolled.
  // style.css scrubs the keyframes with them.
  if (!still && root.classList.contains('no-sda')) {
    const tls = $$('.scene, .loy, .story');
    let tops = [], hs = [], top = 0, bot = 0, queued = false;
    const last = tls.map(() => [-1, -1, -1]);
    const measure = () => {
      const cs = getComputedStyle(document.body);
      top = parseFloat(cs.paddingTop) || 0; bot = innerHeight - (parseFloat(cs.paddingBottom) || 0);
      tops = tls.map((s) => s.getBoundingClientRect().top + window.scrollY); hs = tls.map((s) => s.offsetHeight);
    };
    const clamp = (v) => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
    const put = (s, i, k, name, v) => { if (v !== last[i][k]) { s.style.setProperty(name, v); last[i][k] = v; } };
    const paint = () => {
      queued = false;
      const y = window.scrollY, port = bot - top;
      tls.forEach((s, i) => {
        const r = tops[i] - y, h = Math.min(hs[i], port);
        put(s, i, 0, '--pin', clamp((bot - r) / h));
        put(s, i, 1, '--pout', clamp((top - r - (hs[i] - h)) / h));
        if (s === act) put(s, i, 2, '--p', clamp((top - r) / Math.max(1, hs[i] - port)));
      });
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
    measure(); paint();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', () => { measure(); queue(); });
    window.addEventListener('load', () => { measure(); queue(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); queue(); }).observe(document.body);
  }

  // ---------- icons: the gift stamps on the pass ----------
  $$('.pass__grid .on').forEach((el) => { el.innerHTML = shell.icon('cup'); });

  // ---------- opening status and the extra that fits the moment, live: hours and wording live in shell.js ----------
  const status = shell.status;
  const paintStatus = () => {
    const s = status();
    $$('[data-status]').forEach((el) => {
      el.hidden = false; el.classList.toggle('is-open', s.open);
      $('[data-status-text]', el).textContent = s.text;
    });
    const x = shell.extraNow(), chip = $('[data-now]');
    if (x && chip) {
      chip.href = x.href; chip.hidden = false;
      $('[data-now-name]', chip).textContent = x[B.lang] || x.hu;
      $('[data-now-line]', chip).textContent = t(x.tease);
    }
  };
  paintStatus();
  setInterval(paintStatus, 30000);

  // ---------- detail panel ----------
  // Phones: a sheet with the shell's physics (rises on a spring, can be dragged and thrown down).
  // From 700 px: a centred dialog; the coffee photo grows out of its card through a view transition.
  const panel = $('#panel'), inner = $('#panel-in');
  const roomy = matchMedia('(min-width: 700px)'), calm = matchMedia('(prefers-reduced-motion: reduce)');
  $('.panel__close', panel).innerHTML = shell.icon('close');
  let morph = null; // { card, name }: the coffee photo that grew into the panel photo
  const closeRoomy = () => {
    const m = morph; morph = null;
    const tr = shell.transition(() => {
      if (m) {
        const ph = $('.panel__photo', inner);
        if (ph) ph.style.viewTransitionName = '';
        m.card.style.viewTransitionName = m.name;
      }
      panel.close(); // the dialog hands focus back to the opener
    });
    if (m) (tr ? tr.finished : Promise.resolve()).then(() => { m.card.style.viewTransitionName = ''; });
  };
  const ctl = shell.sheet(panel, { wide: roomy, hide: closeRoomy });
  const products = {};
  const price = (p) => shell.ft(p.price_huf);
  const VIEWS = {
    coffee(id, opener) {
      const p = products[id], L = B.lang, name = $('.cup__name', opener).textContent, img = $('img', opener);
      return {
        photo: true,
        html: `<img class="panel__photo" src="${esc(img.currentSrc || img.src)}" alt="" width="1200" height="1500">
<div class="panel__body">
  <h2 class="panel__title" id="panel-title">${esc(name)}</h2>
  <p class="panel__price">${price(p)}</p>
  <p class="body">${esc((p.desc && (p.desc[L] || p.desc.hu)) || '')}</p>
  ${p.tip && (p.tip[L] || p.tip.hu) ? `<p class="panel__tip"><b>${t('Bros tipp')}</b>${esc(p.tip[L] || p.tip.hu)}</p>` : ''}
  <p class="actions"><a class="btn" href="/etlap/#${esc(id)}">${t('Megnézem az étlapon')} <span aria-hidden="true">→</span></a></p>
</div>`,
      };
    },
    hours() {
      const s = status(), row = (label, val, on) => `<tr${on ? ' class="is-today"' : ''}><th scope="row">${t(label)}</th><td>${val}</td></tr>`;
      return {
        html: `<div class="panel__body">
  <h2 class="panel__title" id="panel-title">${t('Nyitvatartás')}</h2>
  <p class="panel__status${s.open ? ' is-open' : ''}"><i aria-hidden="true"></i>${esc(s.text)}</p>
  <table class="hours">${row('Hétfő–péntek', '7:30–18:00', s.day >= 1 && s.day <= 5)}${row('Szombat', '8:30–17:00', s.day === 6)}${row('Vasárnap', t('zárva'), s.day === 0)}</table>
  <p class="body">1132 Budapest, Csanády u. 4/b</p>
  <p class="actions"><a class="btn" href="${MAPS}" target="_blank" rel="noopener">${t('Útvonal')} <span aria-hidden="true">↗</span></a><a class="link" href="/kapcsolat/">${t('Kapcsolat')} <span aria-hidden="true">→</span></a></p>
</div>`,
      };
    },
    loyalty() {
      return {
        html: `<div class="panel__body">
  <p class="eyebrow">${t('Ajándék induláskor')}</p>
  <h2 class="panel__title" id="panel-title">${t('5 pecsét ajándékba')}</h2>
  <p class="body">${t('5 pecsétet ajándékba adunk, így az első ingyen kávéd már csak 5 kávéra van. Kérd a digitális kártyád — pár másodperc, app, jelszó és papírmunka nélkül.')}</p>
  <p class="body">${t('Minden kávé pecsétet ér, a kávés különlegességek is: pisztáciás, karamell és pumpkin spice latte, espresso tonic. A kártya a telefonod pénztárcájában lakik, és tíz másodperc alatt megvan.')}</p>
  <p class="actions"><a class="btn" href="/husegkartya/">${t('Kérem a kártyám')} <span aria-hidden="true">→</span></a></p>
</div>`,
      };
    },
  };
  const openPanel = (view, arg, opener) => {
    if (!panel.showModal) return false;
    const v = VIEWS[view](arg, opener);
    const fill = () => { inner.innerHTML = v.html; panel.classList.toggle('panel--photo', !!v.photo); };
    if (!roomy.matches && !calm.matches) { fill(); ctl.open(); panel.scrollTop = 0; return true; }
    const cardImg = view === 'coffee' ? $('img', opener) : null;
    if (cardImg) cardImg.style.viewTransitionName = `product-${arg}`;
    shell.transition(() => {
      fill();
      if (cardImg) {
        morph = { card: cardImg, name: `product-${arg}` };
        cardImg.style.viewTransitionName = '';
        $('.panel__photo', inner).style.viewTransitionName = morph.name;
      }
      panel.showModal();
      panel.scrollTop = 0;
    });
    return true;
  };
  $$('[data-panel]').forEach((b) => {
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', () => openPanel(b.dataset.panel, null, b));
  });

  // ---------- Google reviews: the rating (Places API, daily) and the comments staff picked; hidden until there is one ----------
  fetch('/api/reviews').then((r) => (r.ok ? r.json() : Promise.reject())).then((g) => {
    const badge = $('[data-rate]'); // the stamp on the hero: jumps to the reviews
    if (badge && g.rating) {
      const r = g.rating.toLocaleString(B.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      $('[data-rate-n]', badge).textContent = r;
      $('[data-rate-c]', badge).textContent = t('{n} Google-értékelés', { n: g.count });
      badge.setAttribute('aria-label', t('{r} csillag a Google-on, {n} értékelés', { r, n: g.count }));
      badge.hidden = false;
      // phones: the round stamp carries the rating instead of the pill (fewer things to tap)
      const stamp = $('[data-stamp]');
      if (stamp) {
        $('[data-stamp-n]', stamp).textContent = r;
        Object.assign(stamp, { href: '#ertekelesek' }); stamp.removeAttribute('aria-hidden'); stamp.removeAttribute('tabindex');
        stamp.setAttribute('aria-label', badge.getAttribute('aria-label')); stamp.classList.add('is-rated');
      }
    }
    const box = $('[data-revs]'); if (!box || (!g.rating && !g.items.length)) return;
    const star = (n) => `<span class="revs__fill" style="--p:${Math.max(0, Math.min(100, (n / 5) * 100))}%">★★★★★</span>`;
    if (g.rating) {
      $('[data-rev-rating]', box).textContent = g.rating.toLocaleString(B.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      $('[data-rev-stars]', box).innerHTML = star(g.rating);
      $('[data-rev-count]', box).textContent = t('{n} értékelés a Google-on', { n: g.count });
      $('[data-rev-score]', box).hidden = false;
    }
    $('[data-rev-list]', box).innerHTML = g.items.map((r) => `<li class="revs__card"><span class="revs__stars" aria-label="${esc(t('{n} csillag', { n: r.stars }))}">${star(r.stars)}</span>
      <blockquote>${esc(r.text)}</blockquote><p class="revs__who"><b>${esc(r.name)}</b>${r.date ? ` · ${esc(r.date)}` : ''}</p></li>`).join('');
    // Google's own reviews replace the hand-picked ones, fetched fresh once the visitor is near (Google forbids storing them)
    const near = $('#tortenet') || box, list = $('[data-rev-list]', box);
    const google = () => fetch(`/api/reviews/google?lang=${B.lang === 'en' ? 'en' : 'hu'}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((live) => {
      if (!live.items || !live.items.length) return;
      list.innerHTML = live.items.map((r) => `<li class="revs__card">
        <p class="revs__by">${r.photo ? `<img src="${esc(r.photo)}" alt="" width="32" height="32" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${r.author_url ? `<a href="${esc(r.author_url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : `<b>${esc(r.name)}</b>`}<small>${esc(r.when)}</small></span></p>
        ${r.stars ? `<span class="revs__stars" aria-label="${esc(t('{n} csillag', { n: r.stars }))}">${star(r.stars)}</span>` : ''}
        <blockquote>${esc(r.text)}</blockquote>
        ${r.url ? `<a class="revs__src" href="${esc(r.url)}" target="_blank" rel="noopener">${t('Megnézem a Google Mapsen')} <span aria-hidden="true">↗</span></a>` : ''}</li>`).join('');
      $('[data-rev-note]', box).hidden = false;
      box.hidden = false;
    }).catch(() => { /* the picked ones stay */ });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); google(); } }, { rootMargin: '600px 0px' });
      io.observe(near);
    } else google();
    const all = $('[data-rev-all]', box), write = $('[data-rev-write]', box);
    if (g.url) { all.href = g.url; all.hidden = false; }
    if (g.write_url) { write.href = g.write_url; write.hidden = false; }
    box.hidden = false;
  }).catch(() => { /* no reviews: the block stays hidden */ });

  // ---------- coffees: prices and details from the live menu ----------
  fetch('/api/products').then((r) => (r.ok ? r.json() : Promise.reject())).then((list) => {
    list.forEach((p) => { if (p && p.active !== false) products[p.id] = p; });
    $$('.cup').forEach((c) => {
      const p = products[c.dataset.id];
      if (!p) return;
      $('.cup__price', c).textContent = price(p);
      c.setAttribute('aria-haspopup', 'dialog');
      c.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        if (openPanel('coffee', c.dataset.id, c)) e.preventDefault();
      });
    });
  }).catch(() => { /* no API: the cards stay plain links to the menu */ });
})();
