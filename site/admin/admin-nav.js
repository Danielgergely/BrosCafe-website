// The admin menu, shared by /admin/ (tabs switch in place, admin.js) and the bookings admin pages (plain links).
// A row of menus; under it the current menu's pages. "Foglalások" (After Hours, Delivery) is its own button.
// Bookings pages: <div data-admin-nav="after-hours|delivery"></div> is replaced by the menu.
(() => {
  const en = (window.BROS && window.BROS.lang) === 'en', L = (hu, e) => (en ? e : hu);
  const TABS = {
    live: L('Élő forgalom', 'Live sales'), overview: L('Áttekintés', 'Overview'), funnel: L('Tölcsér', 'Funnel'), customers: L('Vendégek', 'Customers'),
    coffee: L('Kávé', 'Coffee'), rewards: L('Jutalmak', 'Rewards'), retention: L('Megtartás', 'Retention'), segments: L('Szegmensek', 'Segments'),
    members: L('Tagok', 'Members'), transactions: L('Tranzakciók', 'Transactions'), wallet: L('Pénztárca', 'Wallet'),
    products: L('Étlap', 'Menu'), journal: L('Napló', 'Journal'), photos: L('Képek', 'Photos'), settings: L('Beállítások', 'Settings'), staff: L('Munkatársak', 'Staff'),
  };
  const GROUPS = [
    { id: 'live', label: TABS.live, tabs: ['live'] },
    { id: 'stats', label: L('Statisztika', 'Statistics'), tabs: ['overview', 'funnel', 'customers', 'coffee', 'rewards', 'retention', 'segments'] },
    { id: 'loyalty', label: L('Hűségprogram', 'Loyalty'), tabs: ['members', 'transactions', 'wallet'] },
    { id: 'site', label: L('Weboldal', 'Website'), tabs: ['products', 'journal', 'photos'] },
    { id: 'settings', label: L('Beállítások', 'Settings'), tabs: ['settings', 'staff'] },
  ];
  const BOOKINGS = [{ id: 'after-hours', href: '/admin/after-hours/', label: 'Bros After Hours' }, { id: 'delivery', href: '/admin/delivery/', label: 'Bros Delivery' }];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const here = (on, kind = 'page') => (on ? ` aria-current="${kind}"` : '');

  /** { tab } on /admin/, { bookings: 'after-hours' | 'delivery' } on the bookings pages. */
  function render({ tab = null, bookings = null } = {}) {
    const group = bookings ? null : GROUPS.find((g) => g.tabs.includes(tab)) || GROUPS[0];
    const main = GROUPS.map((g) => `<a class="ad-nav__grp" href="/admin/?tab=${g.tabs[0]}" data-tab="${g.tabs[0]}"${here(g === group, 'true')}>${esc(g.label)}</a>`).join('')
      + `<a class="ad-nav__grp ad-nav__grp--book" href="${BOOKINGS[0].href}"${here(!!bookings, 'true')}>${esc(L('Foglalások', 'Bookings'))}</a>`;
    const sub = bookings ? BOOKINGS.map((b) => `<a href="${b.href}"${here(b.id === bookings)}>${esc(b.label)}</a>`).join('')
      : group.tabs.length > 1 ? group.tabs.map((t) => `<a href="/admin/?tab=${t}" data-tab="${t}"${here(t === tab)}>${esc(TABS[t] || t)}</a>`).join('') : '';
    return `<nav class="ad-nav" aria-label="${esc(L('Admin menü', 'Admin menu'))}"><div class="ad-nav__row ad-nav__main">${main}</div>${sub ? `<div class="ad-nav__row ad-nav__sub">${sub}</div>` : ''}</nav>`;
  }

  window.BROS_ADMIN_NAV = { render, GROUPS, TABS };
  document.querySelectorAll('[data-admin-nav]').forEach((el) => { el.outerHTML = render({ bookings: el.dataset.adminNav }); });
  const cur = document.querySelector('.ad-nav__sub [aria-current="page"]');
  if (cur) cur.parentElement.scrollLeft = Math.max(0, cur.offsetLeft - 16);
})();
