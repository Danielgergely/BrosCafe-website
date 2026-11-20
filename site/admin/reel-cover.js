// Bros Cafe · admin: make a reel cover in the browser (admin → Videók → Borító készítése). Same look as the Claude skill
// reel-cover (its HTML template is the reference: frame full-bleed, espresso fade, Fraunces title, Inter kicker, text inside
// Instagram's 3:4 grid crop), drawn on a 1080×1920 canvas in a Hungarian and an English version. The video never leaves
// the device; only the two JPEGs do. → BA.coverMaker({ onDone({ hu, en, name, caption }) })
(() => {
  const BA = window.BA; const { esc } = BA;
  const L = (hu, en) => (BA.lang === 'en' ? en : hu);
  const W = 1080, H = 1920, PAD = 84, TEXT_BOTTOM = H - 300, CANDIDATES = 8;
  // the series we have; their English names fill in by themselves
  const SERIES_EN = { 'Főni a kávézóban': 'The boss at the café' };
  const kickerEn = (k) => { const m = /^(\d+)\.\s*rész$/i.exec(k.trim()); return m ? `Part ${m[1]}` : k; };

  const seek = (v, t) => new Promise((ok) => {
    const done = () => { v.removeEventListener('seeked', done); ok(); };
    v.addEventListener('seeked', done); v.currentTime = Math.min(Math.max(t, 0), Math.max(0, v.duration - 0.05));
  });
  const fit = (ctx, v, w, h) => {
    const s = Math.max(w / v.videoWidth, h / v.videoHeight), dw = v.videoWidth * s, dh = v.videoHeight * s;
    ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
  };
  // lines that fit maxW, then the narrowest width with the same line count (CSS text-wrap: balance)
  const wrap = (ctx, text, maxW) => {
    const out = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const t = line ? `${line} ${w}` : w;
        if (!line || ctx.measureText(t).width <= maxW) line = t; else { out.push(line); line = w; }
      }
      if (line) out.push(line);
    }
    return out;
  };
  const balanced = (ctx, text, maxW) => {
    const n = wrap(ctx, text, maxW).length;
    if (n < 2) return wrap(ctx, text, maxW);
    let lo = maxW / 2, hi = maxW;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (wrap(ctx, text, mid).length <= n) hi = mid; else lo = mid; }
    return wrap(ctx, text, hi);
  };
  const baseline = (ctx, lineH) => { const m = ctx.measureText('ÁHgy'); return (lineH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent; };

  /** One cover on `cv` (1080×1920) from the frame already drawn on `frame`. */
  function draw(cv, frame, title, kicker) {
    const ctx = cv.getContext('2d');
    ctx.drawImage(frame, 0, 0);
    if (!title && !kicker) return;
    const g = ctx.createLinearGradient(0, H, 0, H - 1060);
    g.addColorStop(0, 'rgb(37 37 28 / .92)'); g.addColorStop(560 / 1060, 'rgb(37 37 28 / .72)'); g.addColorStop(1, 'rgb(37 37 28 / 0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const n = title.length, size = n <= 12 ? 150 : n <= 22 ? 128 : n <= 34 ? 110 : 92, lh = size * 1.02;
    // heavier than the skill's 480: a canvas can't set Fraunces' SOFT/opsz axes, which make the CSS version look fuller
    ctx.font = `560 ${size}px Fraunces`; ctx.letterSpacing = `${-0.025 * size}px`;
    const lines = title ? balanced(ctx, title, W - 2 * PAD) : [];
    const top = TEXT_BOTTOM - lines.length * lh, off = baseline(ctx, lh);
    ctx.fillStyle = '#F3EBDD'; ctx.shadowColor = 'rgb(0 0 0 / .35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 2;
    lines.forEach((l, i) => ctx.fillText(l, PAD, top + i * lh + off));
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (kicker) {
      const ruleTop = top - 28 - 4, kTop = ruleTop - 24 - 46 * 1.2;
      ctx.font = '700 46px Inter'; ctx.letterSpacing = `${0.12 * 46}px`; ctx.fillStyle = '#C6A875';
      ctx.fillText(kicker.toLocaleUpperCase('hu'), PAD, kTop + baseline(ctx, 46 * 1.2));
      ctx.fillRect(PAD, ruleTop, 96, 4);
    }
    ctx.letterSpacing = '0px';
  }
  const jpeg = (cv) => new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('cover'))), 'image/jpeg', 0.88));

  BA.coverMaker = ({ onDone }) => {
    let v = null, url = '', name = 'borito', at = 0, enTouched = false, frame = null, urls = [];
    const canvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const cvHu = canvas(), cvEn = canvas();
    const dlg = BA.dialog({
      title: L('Borító készítése', 'Make a cover'), wide: true,
      html: `<div class="rc">
        <label class="ad-drop" data-pick><b>${esc(L('Videó kiválasztása', 'Pick the video'))}</b><span class="ad-small">${esc(L('Lehetőleg a felirat nélküli változat (Instagram → 02_Nyers). A videó nem töltődik fel, csak a két borító.', 'Preferably the version without subtitles (Instagram → 02_Nyers). The video is not uploaded, only the two covers.'))}</span><input type="file" accept="video/*" hidden></label>
        <p class="ad-small" data-status hidden></p>
        <div class="rc__frames" data-frames hidden></div>
        <label class="ad-small" data-fine hidden>${esc(L('Finomhangolás', 'Fine-tune'))}<input type="range" min="0" max="1" step="0.04" value="0"></label>
        <div class="rc__form" data-form hidden>
          <label class="ad-small">${esc(L('Felső sor (nem kötelező), pl. „3. rész”', 'Top line (optional), e.g. “3. rész”'))}<input class="ad-sel" data-k="kicker" maxlength="40"></label>
          <label class="ad-small">${esc(L('Cím, pl. „Főni a kávézóban”', 'Title, e.g. “Főni a kávézóban”'))}<input class="ad-sel" data-k="title" maxlength="60"></label>
          <label class="ad-small">${esc(L('Felső sor angolul', 'Top line in English'))}<input class="ad-sel" data-k="kickerEn" maxlength="40"></label>
          <label class="ad-small">${esc(L('Cím angolul', 'Title in English'))}<input class="ad-sel" data-k="titleEn" maxlength="60"></label>
        </div>
        <div class="rc__out" data-out hidden><figure><figcaption>HU</figcaption></figure><figure><figcaption>EN</figcaption></figure></div>
        <div class="ad-row ad-row--end" data-acts hidden><a class="ad-btn ad-btn--ghost" data-dl="hu">${esc(L('Letöltés (HU)', 'Download (HU)'))}</a><a class="ad-btn ad-btn--ghost" data-dl="en">${esc(L('Letöltés (EN)', 'Download (EN)'))}</a><button type="button" class="ad-btn" data-use>${esc(L('Borítók használata', 'Use these covers'))}</button></div>
      </div>`,
    });
    const $ = (s) => dlg.querySelector(s), val = (k) => $(`[data-k="${k}"]`).value.trim();
    const figs = dlg.querySelectorAll('.rc__out figure');
    figs[0].prepend(cvHu); figs[1].prepend(cvEn);
    const status = (t) => { $('[data-status]').hidden = !t; $('[data-status]').textContent = t || ''; };
    dlg.addEventListener('close', () => { if (url) URL.revokeObjectURL(url); urls.forEach((u) => URL.revokeObjectURL(u)); v?.remove(); });

    let queued = false;
    const paint = () => {
      if (queued || !frame) return; queued = true;
      requestAnimationFrame(() => {
        queued = false;
        draw(cvHu, frame, val('title'), val('kicker'));
        draw(cvEn, frame, val('titleEn'), val('kickerEn'));
        // links are made fresh on each tap of Letöltés (below), so a stale picture is never saved
      });
    };
    const grabFrame = async (t) => {
      at = t; await seek(v, t);
      frame = frame || canvas(); fit(frame.getContext('2d'), v, W, H); paint();
    };
    const pick = async (file) => {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(file); name = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'borito';
      v?.remove();
      v = Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'auto', src: url });
      v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px';
      dlg.appendChild(v);
      status(L('Képkockák betöltése…', 'Loading frames…'));
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error(L('Ezt a videót a böngésző nem tudja megnyitni.', 'The browser cannot open this video.'))); });
      await v.play().catch(() => {}); v.pause(); // iOS Safari draws no frame of a video that never played
      const d = v.duration || 1, times = Array.from({ length: CANDIDATES }, (_, i) => 0.8 + (i * (Math.max(d - 1.6, 0))) / (CANDIDATES - 1));
      const box = $('[data-frames]'); box.innerHTML = ''; box.hidden = false;
      const small = document.createElement('canvas'); small.width = 180; small.height = 320;
      for (const t of times) {
        await seek(v, t); fit(small.getContext('2d'), v, 180, 320);
        const b = await new Promise((ok) => small.toBlob(ok, 'image/jpeg', 0.7)), u = URL.createObjectURL(b); urls.push(u);
        box.insertAdjacentHTML('beforeend', `<button type="button" data-t="${t}"><img src="${u}" alt="${Math.round(t)} s"></button>`);
      }
      status('');
      const fine = $('[data-fine] input'); fine.max = String(d); $('[data-fine]').hidden = false;
      $('[data-form]').hidden = false; $('[data-out]').hidden = false; $('[data-acts]').hidden = false;
      select(box.querySelector('button'));
    };
    const select = (b) => {
      dlg.querySelectorAll('[data-t]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('[data-fine] input').value = b.dataset.t; grabFrame(Number(b.dataset.t));
    };

    $('[data-pick] input').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) pick(f).catch((err) => { status(''); BA.fail(err); }); });
    $('[data-frames]').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) select(b); });
    $('[data-fine] input').addEventListener('input', (e) => grabFrame(Number(e.target.value)));
    dlg.querySelector('[data-form]').addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (k === 'titleEn' || k === 'kickerEn') enTouched = true;
      if (!enTouched && (k === 'title' || k === 'kicker')) {
        $('[data-k="titleEn"]').value = SERIES_EN[val('title')] ?? val('title');
        $('[data-k="kickerEn"]').value = kickerEn(val('kicker'));
      }
      paint();
    });
    dlg.addEventListener('click', async (e) => {
      const dl = e.target.closest('[data-dl]');
      if (dl) {
        e.preventDefault();
        const blob = await jpeg(dl.dataset.dl === 'en' ? cvEn : cvHu), u = URL.createObjectURL(blob); urls.push(u);
        const a = Object.assign(document.createElement('a'), { href: u, download: `${name}_borito${dl.dataset.dl === 'en' ? '_en' : ''}.jpg` });
        document.body.appendChild(a); a.click(); a.remove();
        return;
      }
      if (e.target.closest('[data-use]')) {
        const hu = await jpeg(cvHu), en = (val('titleEn') || val('kickerEn')) ? await jpeg(cvEn) : null;
        const caption = [val('title'), val('kicker')].filter(Boolean).join(' · ');
        dlg.close(); onDone({ hu, en, name, caption });
      }
    });
    // fonts for the canvas (the site's own Fraunces + Inter, incl. ő/ű from latin-ext)
    Promise.all(['560 100px Fraunces', '700 46px Inter'].map((f) => document.fonts.load(f, 'Főni ű Á'))).then(paint, () => {});
    return dlg;
  };
})();
