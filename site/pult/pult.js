// Bros Cafe — the counter scanner (/pult/). Same API calls as the React ScannerPage; session in ../belepes/staff.js.
(() => {
  const B = window.BROS, S = B.staff, t = B.t, lang = B.lang;
  const $ = (s) => document.querySelector(s);
  const main = $('#tartalom'), card = $('#st-card'), actions = $('#st-actions'), toast = $('#st-toast');
  const video = $('#st-video'), camBox = $('#st-cam'), camState = $('#st-camstate'), startBtn = $('#st-start'), flipBtn = $('#st-flip');
  const form = $('#st-form'), codeIn = $('#st-code');
  const view = (v) => { main.dataset.view = v; $('#st-wait').hidden = v !== 'loading'; $('#st-scan').hidden = v !== 'scan'; $('#st-member').hidden = v !== 'member'; };

  let user = null, drinks = [], member = null, busy = false, freeMode = false, offer = null;
  let stream = null, facing = 'environment', scanning = false, detector = null, worker = null, workerBusy = false, lastLookup = { code: '', at: 0 };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };

  // ---------- feedback: sound, haptics, banner ----------
  let soundOn = store('bros_staff_sound') !== '0', actx = null;
  const soundBtn = $('#st-sound');
  const paintSound = () => { soundBtn.setAttribute('aria-pressed', soundOn); soundBtn.textContent = t(soundOn ? 'Hang: be' : 'Hang: ki'); };
  soundBtn.addEventListener('click', () => { soundOn = !soundOn; store('bros_staff_sound', soundOn ? '1' : '0'); paintSound(); if (soundOn) beep('ok'); });
  paintSound();
  function beep(kind) {
    if (navigator.vibrate) try { navigator.vibrate(kind === 'ok' ? 40 : [90, 60, 90]); } catch (e) { /* */ }
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const notes = kind === 'ok' ? [[880, 0, .09], [1320, .09, .12]] : [[220, 0, .18], [180, .2, .22]];
      for (const [f, at, d] of notes) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === 'ok' ? 'sine' : 'square'; o.frequency.value = f; g.gain.value = .0001;
        o.connect(g); g.connect(actx.destination);
        const s = actx.currentTime + at; g.gain.exponentialRampToValueAtTime(.18, s + .01); g.gain.exponentialRampToValueAtTime(.0001, s + d);
        o.start(s); o.stop(s + d + .02);
      }
    } catch (e) { /* no audio: the banner still shows */ }
  }
  let toastTimer = 0;
  function say(text, kind = 'ok', undo) {
    clearTimeout(toastTimer);
    toast.className = `st__toast st__toast--${kind}`;
    toast.textContent = '';
    const p = document.createElement('span'); p.textContent = text; toast.append(p);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'st__x'; x.textContent = '✕'; x.setAttribute('aria-label', t('Bezárás'));
    x.addEventListener('click', () => { toast.hidden = true; }); toast.append(x);
    toast.hidden = false; beep(kind);
    if (kind === 'ok') toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }

  // ---------- session ----------
  async function init() {
    try { user = await S.guard(); } catch (e) { view('scan'); return say(e.message, 'err'); }
    $('#st-who').textContent = user.name || user.email;
    if (user.role === 'admin') $('#st-admin').hidden = false;
    $('#st-logout').addEventListener('click', () => { stopCamera(); S.signOut(); });
    S.api('/scan/drinks').then((d) => { drinks = d; if (member) renderMember(); }).catch(() => {});
    view('scan');
    camState.textContent = t('Kamera kikapcsolva');
  }

  // ---------- camera ----------
  function setCam(state, text) { camBox.dataset.state = state; camState.textContent = text; }
  async function openStream() {
    const tries = [{ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }, { video: true, audio: false }];
    let last;
    for (const c of tries) { try { return await navigator.mediaDevices.getUserMedia(c); } catch (e) { last = e; if (e.name === 'NotAllowedError' || e.name === 'SecurityError') break; } }
    throw last;
  }
  async function startCamera() {
    if (scanning) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setCam('off', t('Ez a böngésző nem éri el a kamerát.')); return say(t('Nem sikerült elérni a kamerát. Írd be a kódot kézzel.'), 'err'); }
    startBtn.disabled = true; setCam('wait', t('Kamera indítása…'));
    try {
      stream = await openStream();
      video.srcObject = stream; await video.play();
    } catch (e) {
      stopCamera(); startBtn.disabled = false;
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      setCam('off', denied ? t('Nincs kamera-engedély. Engedélyezd a böngésző beállításaiban.') : t('Kamera kikapcsolva'));
      return say(t('Nem sikerült elérni a kamerát. Írd be a kódot kézzel.'), 'err');
    }
    scanning = true; startBtn.disabled = false; startBtn.textContent = t('Leállítás'); startBtn.classList.add('sb--ghost'); startBtn.classList.remove('sb--main');
    setCam('on', t('Keresem a QR-kódot…'));
    if (!detector && 'BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
    if (!detector && !worker) worker = new Worker('/pult/qr-worker.js');
    try { const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); flipBtn.hidden = cams.length < 2; } catch (e) { /* */ }
    loop();
  }
  function stopCamera() {
    scanning = false;
    if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
    video.srcObject = null; flipBtn.hidden = true;
    startBtn.textContent = t('Olvasás indítása'); startBtn.classList.remove('sb--ghost'); startBtn.classList.add('sb--main'); startBtn.disabled = false;
    setCam('off', t('Kamera kikapcsolva'));
  }
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  let lastTry = 0;
  async function loop(now = 0) {
    if (!scanning) return;
    requestAnimationFrame(loop);
    if (now - lastTry < 110 || video.readyState < 2 || !video.videoWidth) return;
    try {
      if (detector) {
        lastTry = now;
        const r = await detector.detect(video);
        if (r.length && r[0].rawValue) found(r[0].rawValue);
      } else if (!workerBusy) {
        lastTry = now;
        const k = Math.min(1, 720 / video.videoWidth), w = Math.round(video.videoWidth * k), h = Math.round(video.videoHeight * k);
        cv.width = w; cv.height = h; cx.drawImage(video, 0, 0, w, h);
        const img = cx.getImageData(0, 0, w, h);
        workerBusy = true;
        worker.onmessage = (e) => { workerBusy = false; if (e.data.text) found(e.data.text); };
        worker.onerror = () => { workerBusy = false; };
        worker.postMessage({ id: 1, data: img.data.buffer, width: w, height: h }, [img.data.buffer]);
      }
    } catch (e) { /* a frame that cannot be read is a miss */ }
  }
  function found(raw) {
    if (!scanning) return;
    stopCamera(); lookUp(raw);
  }
  startBtn.addEventListener('click', () => (scanning ? stopCamera() : startCamera()));
  flipBtn.addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; stopCamera(); startCamera(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && scanning) stopCamera(); });
  window.addEventListener('pagehide', stopCamera);
  // test hook for the decoder: BROS.pult.decode(imageData) — used with a QR image file, no camera needed
  B.pult = { decode: (img) => new Promise((ok) => { const w = new Worker('/pult/qr-worker.js'); w.onmessage = (e) => { w.terminate(); ok(e.data.text); }; w.postMessage({ id: 0, data: img.data.buffer, width: img.width, height: img.height }, [img.data.buffer]); }) };

  // ---------- lookup ----------
  // A card may be shown as a bare code or as the card-page link; both end in the code.
  const codeOf = (raw) => { const s = String(raw).trim(); const m = s.match(/\/card\/([^/?#\s]+)/i); return (m ? m[1] : s).trim(); };
  async function lookUp(raw) {
    const code = codeOf(raw);
    if (!code || busy) return;
    if (code === lastLookup.code && Date.now() - lastLookup.at < 1500) return;
    lastLookup = { code, at: Date.now() };
    busy = true; $('#st-find').disabled = true;
    try {
      member = await S.api(`/scan/${encodeURIComponent(code)}`);
      freeMode = false; offer = null; done = null; toast.hidden = true; renderMember(); view('member'); window.scrollTo(0, 0);
    } catch (e) {
      say(e.status === 404 ? t('Nincs ilyen kártya') : e.message, 'err'); view('scan');
    } finally { busy = false; $('#st-find').disabled = false; }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (codeIn.value.trim()) lookUp(codeIn.value); });

  // ---------- member ----------
  let done = null; // what just happened: { text, undo } — the picker stays hidden until the barista chooses "one more"
  const dname = (id) => { const d = drinks.find((x) => x.id === id); return d && d.name ? (d.name[lang] || d.name.hu || id) : id; };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; };

  function renderMember() {
    const m = member; card.textContent = ''; actions.textContent = '';
    const need = m.stamps_required;
    card.append(el('p', 'mc__eyebrow', t('Vendég')), el('h2', 'mc__name', m.name));
    if (m.tier && m.tier !== 'base') card.append(el('p', 'mc__tier', t(({ bronze: 'Bronz', silver: 'Ezüst', gold: 'Arany', diamond: 'Gyémánt' })[m.tier] || m.tier) + ' · ' + t('szint')));
    if (m.always_free) card.append(el('p', 'mc__big', t('Minden kávé a ház ajándéka')));
    else {
      card.append(el('p', 'mc__count', `${m.stamps} / ${need} ${t('kávé')}`));
      const dots = el('div', 'dots'); dots.setAttribute('role', 'img'); dots.setAttribute('aria-label', `${m.stamps} / ${need}`);
      for (let i = 0; i < need; i++) dots.append(el('span', i < m.stamps ? 'dot dot--on' : 'dot'));
      card.append(dots);
    }
    if (m.usual) card.append(el('p', 'mc__usual', `${t('Általában:')} ${dname(m.usual.drink)} (${m.usual.count}/${m.usual.of})`));
    if (m.free_coffees > 0) {
      const b = el('div', 'mc__flag mc__flag--gift', t(m.free_coffees === 1 ? '1 ingyen kávé a fiókban' : '{n} ingyen kávé a fiókban', { n: m.free_coffees })); card.append(b);
    }
    if (m.reward_ready && !freeMode) card.append(el('div', 'mc__flag mc__flag--reward', t('Ingyen kávé jár')));

    if (done) return renderDone();
    if (m.free_coffees > 0 && !freeMode) actions.append(btn('sb sb--gift sb--xl', t('Ingyen kávé beváltása a fiókból'), () => { freeMode = true; renderMember(); }));
    const free = freeMode || m.reward_ready;
    const h = el('p', 'ma__label', t(free ? 'Melyik italt kapja ingyen?' : 'Melyik ital?')); actions.append(h);
    if (freeMode) actions.append(btn('sb sb--ghost', t('← Mégis pecsétet adok'), () => { freeMode = false; renderMember(); }));
    if (!drinks.length) {
      // the menu did not load: the counter still works
      actions.append(btn('sb sb--main sb--xl', t(m.reward_ready ? 'Ingyen kávé beváltása' : 'Kávé hozzáadása'), () => pour(null)));
    } else {
      const usual = m.usual && m.usual.drink;
      const grid = el('div', 'drinks');
      [...drinks].sort((a, b) => (b.id === usual) - (a.id === usual)).forEach((d) => {
        const b = btn('drink' + (d.id === usual ? ' drink--usual' : ''), (d.id === usual ? '★ ' : '') + (d.name[lang] || d.name.hu), () => pour(d.id));
        b.dataset.drink = d.id; grid.append(b);
      });
      actions.append(grid, btn('sb sb--quiet', t('Nem rögzítem, csak a pecsét'), () => pour(null)));
    }
    openingPanel();
    actions.append(btn('sb sb--ghost sb--next', t('Következő vendég'), next));
  }

  function renderDone() {
    const box = el('div', 'done-box');
    box.append(el('p', 'done-box__tick', '✓'), el('p', 'done-box__text', done.text));
    actions.append(box);
    const row = el('div', 'ma__row');
    if (done.undo) row.append(btn('sb sb--undo', t('Visszavonás (−1 kávé)'), undo));
    if (done.more) row.append(btn('sb sb--ghost', t('Még egy kávé'), () => { done = null; renderMember(); }));
    if (row.childNodes.length) actions.append(row);
    actions.append(btn('sb sb--main sb--xl sb--next', t('Következő vendég'), next));
    openingPanel();
  }

  function openingPanel() {
    const m = member;
    if (!(offer || !['none', 'redeemed'].includes(m.opening_status))) return;
    const p = el('div', 'op'); p.append(el('p', 'ma__label', t('Nyitónapi ajándék')));
    if (!offer) p.append(btn('sb', t('Ajándék felfedése'), revealOpening));
    else {
      p.append(el('p', 'op__title', t('Kiderült!')));
      const ul = el('ul', 'op__list'); offer.forEach((i) => ul.append(el('li', '', i))); p.append(ul);
      if (m.opening_status === 'redeemed') p.append(el('p', 'op__ok', '✓ ' + t('Az ajándékot átvette — köszönjük, hogy itt volt az első napon.')));
      else p.append(btn('sb sb--main', t('Átvettnek jelölöm'), redeemOpening));
    }
    actions.append(p);
  }

  function next() { member = null; offer = null; done = null; freeMode = false; codeIn.value = ''; view('scan'); toast.hidden = true; }

  // One request at a time; the buttons are dead while it runs, so a double tap cannot stamp twice.
  async function run(path, body, ok, fail) {
    if (busy) return;
    busy = true; actions.classList.add('is-busy');
    try { await ok(await S.api(path, { method: 'POST', body })); }
    catch (e) { say(e.message, 'err'); if (fail) fail(e); }
    finally { busy = false; actions.classList.remove('is-busy'); }
  }
  function pour(drink) {
    const kind = freeMode ? 'redeem-free' : member.reward_ready ? 'redeem' : 'add-coffee';
    const body = { drink };
    run(`/scan/${encodeURIComponent(member.code)}/${kind}`, body, (data) => {
      const wasAlwaysFree = data.always_free;
      member = data; freeMode = false;
      const text = kind === 'redeem-free' ? t('Ingyen kávé átadva') : kind === 'redeem' ? t('Ingyen kávé beváltva') : wasAlwaysFree ? t('Ingyen kávé beváltva') : t(data.reward_ready ? 'Megvan a jutalom — jár az ingyen kávé.' : 'Kávé hozzáadva');
      done = { text: (drink ? dname(drink) + ' · ' : '') + text, undo: kind === 'add-coffee' && !wasAlwaysFree, more: kind === 'add-coffee' && !data.reward_ready && !wasAlwaysFree };
      renderMember(); say(text, 'ok');
    });
  }
  function undo() {
    run(`/scan/${encodeURIComponent(member.code)}/adjust`, { delta: -1 }, (data) => { member = data; done = null; renderMember(); say(t('Javítva (−1 kávé)'), 'ok'); });
  }
  function revealOpening() { run(`/scan/${encodeURIComponent(member.code)}/opening/reveal`, undefined, (d) => { offer = d.offer; renderMember(); }); }
  function redeemOpening() {
    run(`/scan/${encodeURIComponent(member.code)}/opening/redeem`, undefined, (d) => { member = { ...member, opening_status: 'redeemed' }; offer = d.offer; renderMember(); say(t('Nyitónapi ajándék átvéve'), 'ok'); });
  }

  init();
})();
