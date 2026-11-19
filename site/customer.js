// Bros Cafe — customer area: /fiok/, /card/<code>, /auth/verify/, /adatvedelem/, /aszf/, /segitseg/, /404.html.
// Same API calls and storage keys as the old React app; texts in customer-texts.js.
(() => {
  const B = window.BROS, S = B.shell, { esc, toast } = S, en = B.lang === 'en';
  const page = document.body.dataset.page;
  const app = document.getElementById('app');
  const $ = (s, r = app) => r.querySelector(s);
  const $$ = (s, r = app) => [...r.querySelectorAll(s)];
  const TX = (window.BROS_TEXTS || {})[B.lang] || {};
  const tx = (path, vars = {}) => {
    const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), TX);
    if (typeof v !== 'string') return path;
    return Object.keys(vars).reduce((s, k) => s.split(`{${k}}`).join(vars[k]), v);
  };
  const X = (hu, e) => (en ? e : hu); // strings the live site has no key for
  const HOME = '/', SIGNUP = '/husegkartya/', ACCOUNT = '/fiok/', GAME = '/jatek/', NEWS = '/ujdonsagok/';
  const EMAIL = 'hello@broscafe.hu';
  const ICON = {
    gift: '<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M12 9v11M3.5 13h17M12 9c-2.5 0-4.5-1-4.5-2.8S9.5 4 12 9zm0 0c2.5 0 4.5-1 4.5-2.8S14.5 4 12 9z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    party: '<path d="m4 20 4-11 7 7-11 4z"/><path d="M13 5v.01M18 8v.01M17 3v2M20 12h2"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>',
    coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3"/>',
  };
  const ico = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  // ---------- helpers ----------
  const token = () => S.customer.token();
  async function api(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (auth && token()) headers.Authorization = `Bearer ${token()}`;
    if (body && body.__lang) { headers['X-Lang'] = B.lang; delete body.__lang; }
    const r = await fetch(`/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) { const err = new Error(r.status); err.status = r.status; err.detail = data && data.detail; throw err; }
    return data;
  }
  // FastAPI error shapes -> one sentence (frontend/src/lib/api.js formatError)
  const message = (err, fallback) => {
    const d = err && err.detail;
    if (d == null) return fallback;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).join(' ');
    return typeof d.msg === 'string' ? d.msg : String(d);
  };
  function setTitle(hu, e) { document.title = `${X(hu, e)} · Bros Cafe`; }
  function finish() { S.footer(); B.mount(); }
  const view = (html) => { app.innerHTML = html; };
  const loading = (text) => view(`<div class="wrap"><div class="centre centre--wait"><span class="centre__ico"><img src="/shared/img/mark-olive.png" alt="" width="34" height="40"></span><h1>${esc(text)}</h1></div></div>`);
  const fail = (title, sub, btn) => view(`<div class="wrap"><div class="centre"><span class="centre__ico"><img src="/shared/img/mark-olive.png" alt="" width="34" height="40"></span><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}${btn ? `<a class="btn btn--ghost" href="${btn.href}">${esc(btn.text)}</a>` : ''}</div></div>`);
  const fmtMonth = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(B.locale, { month: 'long', year: 'numeric' }); };

  // ---------- QR (vendored qrcodegen, no network) ----------
  function qr(text) {
    if (!window.qrcodegen) return '';
    const q = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM), n = q.size, b = 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.getModule(x, y)) d += `M${x + b},${y + b}h1v1h-1z`;
    return `<span class="qr"><svg viewBox="0 0 ${n + 2 * b} ${n + 2 * b}" role="img" aria-label="QR" shape-rendering="crispEdges"><rect width="100%" height="100%"/><path d="${d}"/></svg></span>`;
  }

  // ---------- the pass (mirrors LoyaltyCardVisual: same tier band, same three figures) ----------
  function pass(m, { withQr = false, last = false } = {}) {
    const req = m.stamps_required ?? 10, tier = m.tier || 'base', free = m.always_free, rem = req - m.stamps;
    const head = free
      ? `<p class="pass__k">${tx('card.member')}</p><h2 class="pass__name">${esc(m.name)}</h2><p class="pass__sub">${tx('loyalty.tierAlwaysFree')}</p>`
      : m.reward_ready
        ? `<p class="pass__k">${tx('card.rewardReady')}</p><h2 class="pass__name">${tx('card.freeCoffee')}</h2><p class="pass__sub">${tx('card.showCounter')}</p>`
        : `<p class="pass__k">${tx('card.member')}</p><h2 class="pass__name">${esc(m.name)}</h2><p class="pass__sub">${m.stamps} / ${req} · ${rem === 1 ? tx('card.remainingOne') : tx('card.remainingMany', { n: rem })}</p>`;
    const cols = req > 5 ? Math.ceil(req / 2) : req;
    const slots = free ? '' : `<div class="pass__slots" style="--cols:${cols}" aria-hidden="true">${Array.from({ length: req }, (_, i) => `<i class="${i < m.stamps ? 'on' : ''}${last && i === m.stamps - 1 ? ' pop' : ''}"></i>`).join('')}</div>`;
    const nextLabel = m.next_tier ? tx('card.toTier', { tier: tx(`loyalty.tiers.${m.next_tier}`) }) : tx('card.topTier');
    return `<div class="pass pass--${esc(tier)}${m.reward_ready ? ' pass--ready' : ''}">
      <div class="pass__top"><span class="pass__brand"><img src="/shared/img/mark-cream.png" alt="" width="20" height="24">Bros Cafe</span><span class="pass__tier">${tx(`loyalty.tiers.${tier}`)}</span></div>
      <div>${head}</div>${slots}
      <div class="pass__stats"><div><b>${m.total_coffees ?? 0}</b><span>${tx('card.totalCoffees')}</span></div><div><b>${m.rewards_redeemed ?? 0}</b><span>${tx('card.freeCoffees')}</span></div><div><b>${m.next_tier ? m.coffees_to_next : '—'}</b><span>${esc(nextLabel)}</span></div></div>
      ${withQr ? `<div class="pass__stub">${qr(m.code)}<p>${tx('card.scanCounter')}</p><span class="pass__code">${esc(m.code)}</span></div>` : ''}
    </div>`;
  }

  // ---------- Apple / Google Wallet (same endpoints and tracking as hooks/useWallet.js) ----------
  const walletHTML = () => `<div class="wallet"><button class="btn" type="button" data-wallet="apple">${tx('card.addApple')}</button><button class="btn btn--ghost" type="button" data-wallet="google">${tx('card.addGoogle')}</button></div>`;
  function wallet(root, code) {
    const avail = { apple: false, google: false };
    const apple = $('[data-wallet=apple]', root), google = $('[data-wallet=google]', root);
    api('cafe').then((d) => { avail.apple = !!d.apple_wallet_configured; avail.google = !!d.google_wallet_configured; google.classList.toggle('is-off', !avail.google); }).catch(() => {});
    apple.addEventListener('click', () => {
      if (!avail.apple) return toast(tx('card.walletUnavailable'));
      S.track('wallet_added', { code, src: 'apple' });
      location.href = `/api/members/${encodeURIComponent(code)}/wallet/apple?lang=${B.lang}`;
    });
    google.addEventListener('click', async () => {
      if (!avail.google) return toast(tx('card.googleSoon'));
      const label = google.innerHTML; google.disabled = true; google.textContent = tx('card.addingGoogle');
      try {
        const d = await api(`members/${encodeURIComponent(code)}/wallet/google?lang=${B.lang}`);
        if (d && d.save_url) { S.track('wallet_added', { code, src: 'google' }); location.href = d.save_url; } else toast(tx('card.googleSoon'));
      } catch (e) { toast(tx('card.walletUnavailable')); } finally { google.disabled = false; google.innerHTML = label; }
    });
  }

  // =====================================================================================================================
  // /auth/verify/ — the magic link lands here: ?token= is exchanged once for a session, then the account opens
  // =====================================================================================================================
  async function verify() {
    setTitle('Belépés', 'Signing in');
    loading(tx('auth.verifying'));
    const params = new URLSearchParams(location.search), tok = params.get('token');
    const bad = () => { setTitle('Lejárt link', 'Link expired'); fail(tx('auth.verifyFailed'), X('Kérj egy újat: add meg az e-mail-címed, és küldünk egy friss belépő linket.', 'Ask for a new one: enter your email and we will send a fresh sign-in link.'), { href: SIGNUP, text: tx('loyalty.backToForm') }); finish(); };
    if (!tok) return bad();
    history.replaceState(null, '', location.pathname); // a single-use credential does not belong in the address bar or history
    try {
      const data = await api('auth/verify', { method: 'POST', body: { token: tok } });
      if (!data || !data.token) throw new Error('no token');
      S.customer.set(data.token);
      location.replace(`${ACCOUNT}?welcome=1`);
    } catch (e) { bad(); }
  }

  // =====================================================================================================================
  // /fiok/ — the account
  // =====================================================================================================================
  async function fiok() {
    setTitle('A fiókom', 'My account');
    if (!token()) return location.replace(SIGNUP);
    loading(X('Betöltjük a fiókod…', 'Loading your account…'));
    let m;
    try { m = await S.customer.me(true); }
    catch (e) { fail(X('Most nem érjük el a fiókod', "We can't reach your account right now"), X('A belépésed megvan. Próbáld újra egy perc múlva.', 'You are still signed in. Please try again in a minute.'), { href: location.href, text: X('Újra', 'Try again') }); return finish(); }
    if (!m) return location.replace(SIGNUP); // session rejected: the sign-up page says why
    draw(m);
    finish();
  }
  function draw(m) {
    const req = m.stamps_required ?? 10, welcome = new URLSearchParams(location.search).get('welcome') === '1', rem = req - m.stamps;
    const picks = (() => { try { return JSON.parse(localStorage.getItem('bros-favs') || '[]'); } catch (e) { return []; } })();
    const invite = `${location.origin}${SIGNUP}?ref=${encodeURIComponent(m.code)}`;
    view(`
<section class="phero acct-hero"><div class="wrap">
  <p class="eyebrow">${tx('account.greeting')}</p>
  <h1 data-vt="page-title">${esc(m.name)}.</h1>
  <p class="phero__lead">${tx('account.memberSince', { since: esc(fmtMonth(m.created_at)) })}</p>
  ${welcome ? `<div class="welcome" role="status">${ico('gift')}<div><b>${tx('loyalty.welcomeNewTitle')}</b><span>${tx('loyalty.welcomeNewSub', { welcome: 5, n: req })}</span><span>${tx('loyalty.welcomeBonus', { left: rem })}</span></div></div>` : ''}
</div></section>
<section class="sec sec--last"><div class="wrap acct">
  <div class="acct__card">
    ${pass(m, { withQr: true })}
    <div class="acct__row"><a class="btn" href="/card/${encodeURIComponent(m.code)}">${tx('loyalty.openWalletCard')}</a><a class="btn btn--ghost" href="${GAME}">${tx('game.playWhileYouWait')}</a></div>
  </div>
  <div class="acct__side">
    <div class="paper" data-testid="account-rewards"><h2 class="label">${tx('account.rewardsTitle')}</h2><p class="big">${ico('gift')}${tx('account.rewardsAvailable', { n: m.reward_ready ? 1 : 0 })}</p></div>
    <div class="paper acct-orders" id="orders" hidden><h2 class="label">${X('RENDELÉSEIM', 'MY ORDERS')}</h2><div id="order-list"></div></div>
    <div class="paper" data-testid="account-invite"><h2 class="label">${tx('account.inviteTitle')}</h2>
      ${m.free_coffees > 0 ? `<p class="banked">${tx('account.bankedFree', { n: m.free_coffees })}</p>` : ''}
      <p>${tx('account.inviteBody')}</p><button class="btn" type="button" data-share>${tx('account.inviteShare')}</button></div>
    <div class="paper" data-testid="account-wallet"><h2 class="label">${tx('account.walletTitle')}</h2>${walletHTML()}</div>
    <div class="paper" id="picks" hidden><h2 class="label">${tx('account.picks')}</h2><div class="chips" id="pick-list"></div></div>
    <div class="paper" data-testid="account-news"><a class="link" href="${NEWS}">${tx('account.whatsNew')} →</a></div>
    <div class="acct-set" data-testid="account-settings"><h2 class="label">${tx('account.title')}</h2>
      <p class="kv">${tx('account.emailLabel')}: <b id="mail-now">${esc(m.email)}</b></p>
      <form class="mail-form" id="mail-form" hidden novalidate><label class="field"><span>${tx('account.changeEmailPrompt')}</span><input type="email" name="email" autocomplete="email" inputmode="email" required value="${esc(m.email)}"></label>
        <p class="note note--err" data-msg role="alert" hidden></p>
        <div class="row"><button class="btn" type="submit">${X('Mentés', 'Save')}</button><button class="btn btn--ghost" type="button" data-cancel>${X('Mégse', 'Cancel')}</button></div></form>
      <div class="links"><button class="link" type="button" data-change>${tx('account.changeEmail')}</button><button class="link" type="button" data-out data-testid="logout-btn">${tx('account.logOut')}</button></div>
    </div>
  </div>
</div></section>`);

    wallet(app, m.code);
    orders();
    $('[data-share]').addEventListener('click', async () => {
      try {
        if (navigator.share) { await navigator.share({ title: 'Bros Cafe', text: tx('account.inviteMessage'), url: invite }); return; }
        await navigator.clipboard.writeText(invite); toast(tx('account.inviteCopied'));
      } catch (e) { /* a cancelled share sheet is not an error */ }
    });
    // changing the e-mail: inline instead of window.prompt, same call
    const form = $('#mail-form'), field = form.elements.email, note = $('[data-msg]', form);
    const say = (s) => { note.hidden = !s; note.textContent = s || ''; };
    $('[data-change]').addEventListener('click', () => { form.hidden = false; field.focus(); field.select(); });
    $('[data-cancel]').addEventListener('click', () => { form.hidden = true; say(''); field.value = $('#mail-now').textContent; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); say('');
      const next = field.value.trim();
      if (!field.checkValidity() || !next) { field.setAttribute('aria-invalid', 'true'); return say(X('Érvényes e-mail-címet adj meg.', 'Enter a valid email address.')); }
      field.removeAttribute('aria-invalid');
      if (next === $('#mail-now').textContent) { form.hidden = true; return; }
      const btn = $('[type=submit]', form); btn.disabled = true;
      try {
        const d = await api('customer/change-email', { method: 'POST', body: { email: next }, auth: true });
        $('#mail-now').textContent = (d && d.email) || next; form.hidden = true; toast(tx('account.emailChanged'));
      } catch (err) { say(err.status === 400 ? X('Ezzel az e-mail-címmel már van hűségkártya.', 'That email already has a loyalty card.') : err.status === 422 ? X('Érvényes e-mail-címet adj meg.', 'Enter a valid email address.') : message(err, tx('common.somethingWrong'))); } finally { btn.disabled = false; }
    });
    $('[data-out]').addEventListener('click', () => { S.customer.signOut(); toast(tx('account.loggedOut')); setTimeout(() => location.assign(HOME), 700); });

    // favourites live in this browser (bros-favs); names come from the menu
    if (picks.length) api('products').then((list) => {
      const byId = Object.fromEntries(list.map((p) => [p.id, p]));
      const chips = picks.filter((id) => byId[id]).map((id) => { const n = byId[id].name; return `<a class="chip" href="/etlap/#${encodeURIComponent(id)}">${esc(typeof n === 'object' ? n[B.lang] || n.hu || n.en : n)}</a>`; });
      if (chips.length) { $('#pick-list').innerHTML = chips.join(''); $('#picks').hidden = false; }
    }).catch(() => {});
  }

  // "Rendeléseim": Delivery orders (as payer) and After Hours bookings of this email, newest first (GET /api/customer/orders)
  const ST = {
    open: ['Gyűjtés folyik', 'Collecting'], new: ['Beérkezett', 'Received'], making: ['Készül', 'Being made'], out: ['Úton', 'On the way'],
    delivered: ['Kézbesítve', 'Delivered'], paid: ['Fizetve', 'Paid'], cancelled: ['Lemondva', 'Cancelled'], refunded: ['Visszatérítve', 'Refunded'],
    expired: ['Lejárt', 'Expired'],
  };
  const SHOW = 5;
  async function orders() {
    const box = $('#orders'), out = $('#order-list');
    let d;
    try { d = await api('customer/orders', { auth: true }); } catch (e) { return; } // the rest of the account still works
    const year = new Date().getFullYear();
    const day = (iso) => { const x = new Date(`${iso}T12:00:00`); return x.toLocaleDateString(B.locale, { month: 'short', day: 'numeric', ...(x.getFullYear() !== year ? { year: 'numeric' } : {}) }); };
    const link = (href, text) => `<a class="link" href="${esc(href)}">${esc(text)}</a>`;
    const items = [
      ...d.delivery.map((o) => ({ date: o.date, html: `
        <div class="order__main"><b>Bros Delivery · ${esc(X(`${o.drinks} ital`, `${o.drinks} ${o.drinks === 1 ? 'drink' : 'drinks'}`))}</b>
          <span>${esc([day(o.date), o.rush ? X('azonnali', 'rush') : o.time, o.pickup ? X('elvitel', 'pickup') : o.company].filter(Boolean).join(' · '))}</span></div>
        <div class="order__end"><b>${S.ft(o.amount)}</b><span class="order__st" data-s="${esc(o.status)}">${esc(X(...(ST[o.status] || [o.status, o.status])))}</span></div>
        <div class="order__acts">${o.group_code && o.status === 'open' ? link(`/delivery/csoport/?g=${encodeURIComponent(o.group_code)}`, X('A csoportos rendelés', 'The group order')) : ''}${link(`/delivery/?ujra=${encodeURIComponent(o.id)}#rendeles`, X('Újra rendelem', 'Order again'))}</div>` })),
      ...d.after_hours.map((b) => ({ date: b.date, html: `
        <div class="order__main"><b>Bros After Hours · ${esc(X(`${b.guests} fő`, `${b.guests} guests`))}</b><span>${esc(`${day(b.date)} · ${b.time}`)}</span></div>
        <div class="order__end"><b>${S.ft(b.amount)}</b><span class="order__st" data-s="${esc(b.status)}">${esc(X(...(ST[b.status] || [b.status, b.status])))}</span></div>
        ${b.modify_url || b.cancel_url ? `<div class="order__acts">${b.modify_url ? link(b.modify_url, X('Módosítás', 'Change')) : ''}${b.cancel_url ? link(b.cancel_url, X('Lemondás', 'Cancel')) : ''}</div>` : ''}` })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const paint = (all) => {
      out.innerHTML = items.length
        ? `<ul class="orders">${items.slice(0, all ? items.length : SHOW).map((x) => `<li class="order">${x.html}</li>`).join('')}</ul>${!all && items.length > SHOW ? `<button class="link" type="button" data-all>${esc(X(`Mind a(z) ${items.length}`, `All ${items.length}`))}</button>` : ''}`
        : `<p>${X('Még nincs rendelésed. Itt látod majd a <a class="link" href="/delivery/">Bros Delivery</a> rendeléseidet és az <a class="link" href="/after-hours/">After Hours</a> estéidet.', 'No orders yet. Your <a class="link" href="/delivery/">Bros Delivery</a> orders and <a class="link" href="/after-hours/">After Hours</a> evenings will show up here.')}</p>`;
      $('[data-all]', out)?.addEventListener('click', () => { paint(true); $$('.order', out)[SHOW]?.querySelector('a')?.focus(); });
    };
    paint(false);
    box.hidden = false;
  }

  // =====================================================================================================================
  // /card/<code> — the public card page every Wallet pass links to (code = last path segment; polled every 5 s)
  // =====================================================================================================================
  function card() {
    setTitle('Hűségkártya', 'Loyalty card');
    const seg = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
    const code = /^(card|index\.html)$/.test(seg) ? '' : seg;
    const notFound = (sub) => { fail(tx('card.notFound'), sub, { href: SIGNUP, text: tx('card.getNew') }); finish(); };
    if (!code) return notFound('');
    loading(X('Betöltjük a kártyád…', 'Loading your card…'));
    let member = null, timer = null, celebrating = false;
    const paint = (first) => {
      const m = member, ready = m.reward_ready;
      const keep = window.scrollY;
      view(`<div class="wrap"><div class="cardpage">
        <div class="tools"><button class="round" type="button" data-refresh aria-label="${tx('card.refresh')}" data-testid="refresh-card-btn">${ico('refresh')}</button></div>
        ${ready ? `<div class="banner" data-testid="reward-banner">${ico('party', 'pill-ico')}<div><b>${tx('card.bannerTitle')}</b><span>${tx('card.bannerSub')}</span></div></div>` : ''}
        ${pass(m, { withQr: true, last: first })}
        ${walletHTML()}
        <p class="hint">${tx('card.walletHint')}</p>
        <a class="btn btn--ghost" href="${GAME}">${tx('game.playWhileYouWait')}</a>
        <div class="tiles"><div><b>${m.total_coffees ?? 0}</b><span>${tx('card.coffeesBought')}</span></div><div><b>${m.rewards_redeemed ?? 0}</b><span>${tx('card.freeCoffees')}</span></div></div>
      </div></div>`);
      window.scrollTo(0, keep);
      wallet(app, code);
      $('[data-refresh]').addEventListener('click', (e) => { const b = e.currentTarget; b.classList.add('spin'); load().finally(() => setTimeout(() => b.classList.remove('spin'), 500)); });
    };
    const celebrate = () => {
      if (celebrating) return; celebrating = true;
      document.body.insertAdjacentHTML('beforeend', `<div class="celebrate" role="status"><div><h2>${tx('card.celebrateTitle')}</h2><p>${tx('card.celebrateSub')}</p></div></div>`);
      setTimeout(() => { document.querySelector('.celebrate')?.remove(); celebrating = false; }, 3500);
    };
    async function load() {
      try {
        const d = await api(`members/${encodeURIComponent(code)}`);
        const prev = member; member = d;
        if (!prev) { paint(true); finish(); }
        else if (JSON.stringify(prev) !== JSON.stringify(d)) paint(false);
        if (d.reward_ready && prev && !prev.reward_ready) celebrate(); // only on the way into "reward ready"
      } catch (e) {
        if (!member) { clearInterval(timer); notFound(e.status === 404 ? X('Nézd meg, hogy a teljes linket nyitottad-e meg, vagy kérj új kártyát.', 'Check that you opened the full link, or get a new card.') : message(e, '')); }
      }
    }
    load();
    timer = setInterval(() => { if (!document.hidden) load(); }, 5000);
  }

  // =====================================================================================================================
  // /aszf/ — terms and conditions for After Hours and Delivery (texts in customer-texts.js)
  function terms() {
    setTitle('ÁSZF', 'Terms');
    const T = TX.terms;
    view(`<section class="phero"><div class="wrap"><p class="eyebrow">${X('ÁSZF', 'Terms')}</p><h1 data-vt="page-title">${esc(T.title)}</h1></div></section>
<div class="wrap"><div class="legal"><p class="upd">${esc(T.updated)}</p><p class="lead">${esc(T.intro)}</p>
${T.sections.map((s) => `<section><h2>${esc(s.h)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('')}
<p>${esc(T.contactLine)} <a href="mailto:${EMAIL}">${EMAIL}</a></p></div></div>`);
  }

  // /adatvedelem/ — privacy statement + the consent switch
  // =====================================================================================================================
  function privacy() {
    setTitle('Adatkezelés', 'Privacy');
    const sections = TX.privacy.sections || [];
    view(`<section class="phero"><div class="wrap"><p class="eyebrow">${X('Adatkezelés', 'Privacy')}</p><h1 data-vt="page-title">${esc(TX.privacy.title)}</h1></div></section>
<div class="wrap"><div class="legal"><p class="upd">${esc(TX.privacy.updated)}</p><p class="lead">${esc(TX.privacy.intro)}</p>
${sections.map((s) => `<section><h2>${esc(s.h)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('')}
<div class="choice"><h2>${esc(TX.privacy.choiceTitle)}</h2><p id="choice-state"></p><div class="acct__row"><button class="btn" type="button" data-set="granted" data-testid="privacy-allow">${esc(TX.privacy.allow)}</button><button class="btn btn--light" type="button" data-set="denied" data-testid="privacy-withdraw">${esc(TX.privacy.withdraw)}</button></div></div>
<p>${esc(TX.privacy.contactLine)} <a href="mailto:${EMAIL}">${EMAIL}</a></p></div></div>`);
    const sync = () => {
      const c = S.consent.read();
      $('#choice-state').textContent = TX.privacy[c === 'granted' ? 'choiceGranted' : c === 'denied' ? 'choiceDenied' : 'choiceUnset'];
      $$('[data-set]').forEach((b) => { b.disabled = b.dataset.set === c; });
    };
    $$('[data-set]').forEach((b) => b.addEventListener('click', () => S.consent.set(b.dataset.set)));
    window.addEventListener('bros-consent-change', sync);
    sync(); finish();
  }

  // =====================================================================================================================
  // /segitseg/ — help: POST /api/contact (not sent on the preview unless ?live=1, see shell.js)
  // =====================================================================================================================
  function help() {
    setTitle('Írj nekünk', 'Write to us');
    const H = TX.help;
    view(`<section class="phero"><div class="wrap"><p class="eyebrow">${X('Segítség', 'Help')}</p><h1 data-vt="page-title">${esc(H.title)}</h1><p class="phero__lead">${esc(H.intro)}</p></div></section>
<div class="wrap"><div class="helpwrap" id="hw">
<form class="form" id="help-form" novalidate data-testid="help-form">
  <label class="field"><span>${esc(tx('auth.firstNameLabel'))}</span><input name="name" maxlength="80" autocomplete="name" required data-err="${X('Add meg a neved.', 'Please enter your name.')}"></label>
  <label class="field"><span>${esc(tx('auth.emailLabel'))}</span><input type="email" name="email" autocomplete="email" inputmode="email" required data-err="${X('Érvényes e-mail-címet adj meg.', 'Enter a valid email address.')}"></label>
  <label class="field"><span>${esc(H.messageLabel)}</span><textarea name="message" rows="7" minlength="5" maxlength="4000" required data-err="${X('Írj legalább pár szót.', 'Please write a few words.')}"></textarea></label>
  <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <p class="note note--err" data-msg role="alert" hidden></p>
  <button class="btn" type="submit">${esc(H.send)}</button>
</form>
<p class="alt">${esc(H.orEmail)} <a href="mailto:${EMAIL}">${EMAIL}</a></p></div></div>`);
    const form = $('#help-form'), btn = $('[type=submit]', form), note = $('[data-msg]', form), label = btn.innerHTML;
    const say = (s) => { note.hidden = !s; note.textContent = s || ''; };
    const sent = (title, body) => { const hw = $('#hw'); hw.innerHTML = `<div class="done" role="status" tabindex="-1"><span class="done__ico">${ico('mail', 'pill-ico')}</span><h2>${esc(title)}</h2><p data-testid="help-sent">${esc(body)}</p><a class="link" href="${HOME}">← ${esc(tx('staff.backToSite'))}</a></div>`; window.scrollTo({ top: 0 }); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (btn.disabled) return;
      const f = form.elements, bad = ['name', 'email', 'message'].map((k) => f[k]).find((x) => !x.checkValidity() || !x.value.trim() || (x.minLength > 0 && x.value.trim().length < x.minLength));
      $$('[aria-invalid]', form).forEach((x) => x.removeAttribute('aria-invalid'));
      if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); return say(bad.dataset.err); }
      say('');
      if (S.guard) return sent(X('Előnézet', 'Preview'), X('Ez egy előnézet: a valódi oldalon itt elküldjük az üzeneted a Bros Cafénak.', 'This is a preview: on the real site your message would be sent to Bros Cafe here.'));
      btn.disabled = true; btn.innerHTML = `<i class="spinner" aria-hidden="true"></i> ${esc(H.sending)}`;
      try {
        await api('contact', { method: 'POST', body: { __lang: 1, name: f.name.value, email: f.email.value, message: f.message.value, website: f.website.value } });
        sent(H.sentTitle, H.sentBody);
      } catch (err) {
        say(err.status === 429 ? H.tooMany : err.status === 502 ? H.notSent : message(err, tx('common.somethingWrong')));
        btn.disabled = false; btn.innerHTML = label;
      }
    });
    finish();
  }

  // =====================================================================================================================
  // /404.html
  // =====================================================================================================================
  function notFound() {
    setTitle('Nincs ilyen oldal', 'Page not found');
    view(`<div class="wrap"><div class="centre"><span class="centre__ico"><img src="/shared/img/mark-olive.png" alt="" width="34" height="40"></span><p class="eyebrow">404</p><h1>${X('Ez az oldal <em>elfogyott.</em>', 'This page has <em>sold out.</em>')}</h1><p>${X('Nincs itt semmi ilyen, de az étlap és a kávé megvan.', 'Nothing here, but the menu and the coffee are still on.')}</p><p class="actions"><a class="btn" href="${HOME}">${X('Vissza a főoldalra', 'Back to home')}</a> <a class="btn btn--ghost" href="/etlap/">${X('Étlap', 'Menu')}</a></p></div></div>`);
    finish();
  }

  ({ fiok, card, verify, adatvedelem: privacy, aszf: terms, segitseg: help, 404: notFound }[page] || (() => {}))();
})();
