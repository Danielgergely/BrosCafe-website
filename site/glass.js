// Bros Cafe · Üveg: keeps the glass header and tab bar glassy through page changes (glass.css). Deferred on every page.
(() => {
  const root = document.documentElement;
  // A view transition snapshots the header and the tab bar without what is behind them. While a page change runs the
  // bars drop their own backdrop filter (html.vt-on) and their transition groups carry it instead (look.css), so the
  // glass looks the same all the way through.
  const until = (vt) => {
    if (!vt) return;
    root.classList.add('vt-on');
    vt.finished.catch(() => {}).then(() => root.classList.remove('vt-on'));
  };
  if ((navigator.vendor || '').startsWith('Apple')) root.classList.add('wk'); // see look.css, view transitions
  let paused = [];
  window.addEventListener('pageswap', (e) => {
    if (!e.viewTransition) return;
    root.classList.add('vt-on');
    // a playing film can make Chromium's snapshot of the page being left come out blank: hold it for the capture
    paused = [...document.querySelectorAll('video')].filter((v) => !v.paused);
    paused.forEach((v) => v.pause());
  });
  window.addEventListener('pagereveal', (e) => until(e.viewTransition));
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    root.classList.remove('vt-on');
    paused.forEach((v) => v.play().catch(() => {})); paused = [];
  });
  if (document.activeViewTransition) until(document.activeViewTransition);
})();
