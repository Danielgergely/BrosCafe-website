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
  const L = (hu, en) => (B.lang === 'en' ? en : hu);
  // menus and their pages; a tab not listed here falls into the last menu so nothing gets lost
  const GROUPS = [
    { id: 'live', label: T('admin.tabs.live'), tabs: ['live'] },
    { id: 'stats', label: L('Statisztika', 'Statistics'), tabs: ['overview', 'funnel', 'customers', 'coffee', 'rewards', 'retention', 'segments'] },
    { id: 'loyalty', label: L('Hűségprogram', 'Loyalty'), tabs: ['members', 'transactions', 'wallet'] },
    { id: 'site', label: L('Weboldal', 'Website'), tabs: ['products', 'journal', 'photos'] },
    { id: 'settings', label: L('Beállítások', 'Settings'), tabs: ['settings', 'staff'] },
  ].map((g) => ({ ...g, tabs: g.tabs.filter((t) => ids.includes(t)) })).filter((g) => g.tabs.length);
  const listed = new Set(GROUPS.flatMap((g) => g.tabs));
  ids.filter((t) => !listed.has(t)).forEach((t) => GROUPS[GROUPS.length - 1].tabs.push(t));
  const groupOf = (tab) => GROUPS.find((g) => g.tabs.includes(tab)) || GROUPS[0];
  const chev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

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
        <div class="ad-nav__row" role="list">
          ${GROUPS.map((g) => `<button type="button" class="ad-nav__grp" role="listitem" data-group="${g.id}" aria-expanded="false" aria-controls="ad-sub-${g.id}">${esc(g.label)}${g.tabs.length > 1 ? chev : ''}</button>`).join('')}
          <button type="button" class="ad-nav__grp ad-nav__grp--book" role="listitem" data-group="bookings" aria-expanded="false" aria-controls="ad-sub-bookings">${esc(L('Foglalások', 'Bookings'))}${chev}</button>
        </div>
        ${GROUPS.map((g) => `<div class="ad-nav__row ad-nav__sub" id="ad-sub-${g.id}" data-sub="${g.id}" hidden>${g.tabs.map((id) => `<a href="?tab=${id}" data-tab="${id}" data-testid="tab-${id}">${esc(label(id))}</a>`).join('')}</div>`).join('')}
        <div class="ad-nav__row ad-nav__sub" id="ad-sub-bookings" data-sub="bookings" hidden>${ext.map((e) => `<a href="${e.href}" data-ext="${e.id}">${esc(e.label)}</a>`).join('')}</div>
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
    openGroup(groupOf(id).id);
    const fresh = document.createElement('div');
    fresh.className = 'ad-panel';
    view.replaceChildren(fresh);
    BA.tabs[id].render(fresh, { user });
  }
  BA.navigate = (id) => { if (id !== active) show(id, true); };

  /** Shows one menu's pages; a single-page menu needs no second row. */
  function openGroup(gid) {
    const g = GROUPS.find((x) => x.id === gid);
    nav.querySelectorAll('[data-group]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.group === gid)));
    nav.querySelectorAll('[data-sub]').forEach((r) => { r.hidden = r.dataset.sub !== gid || (g && g.tabs.length < 2); });
    const cur = nav.querySelector(`[data-sub="${gid}"] [aria-current]`);
    if (cur) cur.parentElement.scrollTo({ left: Math.max(0, cur.offsetLeft - 16) });
  }

  nav.addEventListener('click', (e) => {
    const gb = e.target.closest('[data-group]');
    if (gb) {
      const g = GROUPS.find((x) => x.id === gb.dataset.group);
      if (g && !g.tabs.includes(active)) return BA.navigate(g.tabs[0]); // a menu opens on its first page
      return openGroup(gb.dataset.group);
    }
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
