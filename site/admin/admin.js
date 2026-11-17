// Bros Cafe · admin: the frame (guard, tabs, ?tab=<name> routing). The tabs live in admin-{live,content,stats,people}.js.
// ?tab names are the live dashboard's: live products journal photos overview funnel customers coffee rewards retention
// segments transactions members wallet (+ settings, staff, which were dialogs on the old site).
(async () => {
  const B = window.BROS; const BA = window.BA; const { T, esc } = BA;
  const root = document.getElementById('ad-root');
  const DEFAULT = 'products';
  const ext = [
    { id: 'after-hours', href: '/admin/after-hours/', label: T('x.afterHours') },
    { id: 'delivery', href: '/admin/delivery/', label: T('x.delivery') },
  ];

  let user;
  try { user = await B.staff.guard({ adminOnly: true }); } catch (e) {
    root.innerHTML = BA.errorBox(e.message || T('x.offline'));
    root.querySelector('[data-retry]').addEventListener('click', () => location.reload());
    return;
  }
  if (!user) return;

  const ids = BA.order;
  const fromUrl = () => { const t = new URLSearchParams(location.search).get('tab'); return ids.includes(t) ? t : DEFAULT; };
  let active = null;

  const label = (id) => T(`admin.tabs.${id}`);
  const SEP_BEFORE = 'settings';

  root.innerHTML = `
    <div class="ad-top">
      <div><p class="eyebrow">${esc(T('admin.kicker'))}</p><h1 data-vt="page-title">${esc(T('admin.title'))}</h1></div>
      <div class="ad-tools">
        <span class="ad-who">${esc(T('x.signedIn', { name: user.name || user.email }))}</span>
        <a class="link" href="/pult/">${esc(T('admin.scanner'))}</a>
        <button type="button" class="ad-btn ad-btn--ghost" data-add-staff data-testid="add-staff-top">＋ ${esc(T('admin.addStaff'))}</button>
        <button type="button" class="link" data-logout data-testid="admin-logout-btn">${esc(T('account.logOut'))}</button>
      </div>
    </div>
    <div class="ad-layout">
      <nav class="ad-nav" aria-label="${esc(T('x.tabsLabel'))}">
        ${ids.map((id) => `${id === SEP_BEFORE ? '<i class="ad-nav__sep" aria-hidden="true"></i>' : ''}<a href="?tab=${id}" data-tab="${id}" data-testid="tab-${id}">${esc(label(id))}</a>`).join('')}
        <i class="ad-nav__sep" aria-hidden="true"></i>
        ${ext.map((e) => `<a class="ad-nav__ext" href="${e.href}" data-ext="${e.id}">${esc(e.label)}</a>`).join('')}
      </nav>
      <div class="ad-panel" id="ad-view" tabindex="-1" aria-live="polite"></div>
    </div>
    <p id="ad-toast" role="status" hidden></p>`;

  const view = root.querySelector('#ad-view');
  const nav = root.querySelector('.ad-nav');

  function show(id, push) {
    if (push) history.pushState({ tab: id }, '', `?tab=${id}`);
    active = id;
    nav.querySelectorAll('[data-tab]').forEach((a) => { if (a.dataset.tab === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const cur = nav.querySelector(`[data-tab="${id}"]`);
    if (cur && cur.scrollIntoView && nav.scrollWidth > nav.clientWidth) { const x = cur.offsetLeft - 16; nav.scrollTo({ left: x }); }
    const fresh = document.createElement('div');
    fresh.className = 'ad-panel';
    view.replaceChildren(fresh);
    BA.tabs[id].render(fresh, { user });
  }
  BA.navigate = (id) => { if (id !== active) show(id, true); };

  nav.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tab]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    BA.navigate(a.dataset.tab);
  });
  view.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g && BA.tabs[g.dataset.go]) BA.navigate(g.dataset.go); });
  window.addEventListener('popstate', () => show(fromUrl(), false));
  root.querySelector('[data-logout]').addEventListener('click', () => B.staff.signOut());
  root.querySelector('[data-add-staff]').addEventListener('click', async () => {
    BA.navigate('staff');
    for (let i = 0; i < 40 && !BA.addStaff; i += 1) await new Promise((r) => setTimeout(r, 50));
    if (BA.addStaff) BA.addStaff();
  });

  show(fromUrl(), false);
})();
