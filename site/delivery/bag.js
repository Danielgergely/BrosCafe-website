/* Bros Delivery · floating paper bag (basket) + step rail. No dependencies; uses BROS.t when present.
   const bag = DLBag.mount({ onOpen, onClose, onCheckout, label: (n) => "Kosár: 3 ital", parent });
   bag.set(n)  count on the sticker (bounces when it grows; 0 hides the bag) · bag.hide(bool) · bag.open() / close() / toggle()
   bag.head / bag.list / bag.total / bag.foot: the popup's slots (elements) for the page to fill
   const rail = DLRail.mount({ steps: [{ label: "Hova?", target: "#dl-step-where" }, …], onGo(no, el), parent });
   rail.set({ current: 2, done: [1] }) · rail.show(bool)   (step numbers start at 1) */
(() => {
  'use strict';
  const t = (window.BROS && window.BROS.t) || ((s, v) => { for (const k in v || {}) s = s.replace(`{${k}}`, v[k]); return s; });
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

  // kraft bag, 3/4 view: back handle, inside, front handle, face with a turned-down top, side gusset, grain on top
  const BAG = `<svg viewBox="0 0 72 96" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="dlb-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D9B282"/><stop offset=".45" stop-color="#C89C69"/><stop offset="1" stop-color="#B58653"/></linearGradient>
<linearGradient id="dlb-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9A6E40"/><stop offset=".5" stop-color="#8A6037"/><stop offset=".52" stop-color="#A77A49"/><stop offset="1" stop-color="#94683B"/></linearGradient>
<linearGradient id="dlb-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8C6238"/><stop offset="1" stop-color="#5E3F22"/></linearGradient>
<radialGradient id="dlb-sh"><stop offset="0" stop-color="#14140E" stop-opacity=".42"/><stop offset="1" stop-color="#14140E" stop-opacity="0"/></radialGradient>
<filter id="dlb-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.3 .7" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .3  0 0 0 0 .18  0 0 0 0 .07  0 0 0 -1.1 .72" result="f"/><feComposite in="f" in2="SourceAlpha" operator="in" result="g"/><feBlend in="SourceGraphic" in2="g" mode="multiply"/></filter>
</defs>
<ellipse cx="37" cy="90.5" rx="33" ry="4.6" fill="url(#dlb-sh)"/>
<g fill="none" stroke-linecap="round"><path d="M30 24C30 3 53 3 53 24" stroke="#8E6439" stroke-width="2.8"/><path d="M30 24C30 3 53 3 53 24" stroke="#6F4B28" stroke-width="2.8" stroke-dasharray="1.2 2"/></g>
<g filter="url(#dlb-grain)">
<path d="M5 27 18 21.5 67 21.5 54 27Z" fill="url(#dlb-in)"/>
<path d="M54 27 67 21.5 66.4 84 54 90Z" fill="url(#dlb-side)"/>
<path d="M54 27 60.4 33 67 21.5Z" fill="#7B5430" opacity=".55"/>
<path d="M54 76 60.3 70 66.4 73" fill="none" stroke="#6F4B28" stroke-width=".6" opacity=".6"/>
</g>
<g fill="none" stroke-linecap="round"><path d="M16 31C16 7 40 7 40 31" stroke="#B78B58" stroke-width="3"/><path d="M16 31C16 7 40 7 40 31" stroke="#8A6037" stroke-width="3" stroke-dasharray="1.2 2"/><path d="M15.2 29C15.6 8 39 6.5 40.6 27" stroke="#E6C79C" stroke-width=".7" opacity=".7"/></g>
<g filter="url(#dlb-grain)">
<path d="M5 27H54V90H6Z" fill="url(#dlb-face)"/>
<path d="M5 27H54V33.5H5.1Z" fill="#DDB88A"/>
</g>
<path d="M5.1 33.7H54" stroke="#8A6037" stroke-width=".7" opacity=".55"/><path d="M5.2 34.6H54" stroke="#F0D7B0" stroke-width=".5" opacity=".5"/>
<path d="M5 27H54" stroke="#F3DDB9" stroke-width=".8" opacity=".8"/><path d="M54 27V90" stroke="#7B5430" stroke-width=".6" opacity=".7"/>
<path d="M5.9 78H54M6 78l8 12M54 78l-8 12" fill="none" stroke="#8A6037" stroke-width=".5" opacity=".35"/>
<path d="M5 27 6 90" stroke="#F0D7B0" stroke-width=".7" opacity=".45"/>
<text x="29.5" y="83.5" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-size="8.5" font-weight="500" fill="#5E3F22" opacity=".62">Bros</text>
</svg>`;

  function mountBag(o = {}) {
    const label = o.label || ((n) => t('Kosár: {n} ital', { n }));
    const btn = el(`<button type="button" class="dl-bag" data-n="0" aria-haspopup="dialog" aria-expanded="false" aria-controls="dl-bag-pop"><span class="dl-bag__art">${BAG}</span><span class="dl-bag__n" aria-hidden="true">0</span></button>`);
    const veil = el('<div class="dl-bag-veil"></div>');
    const pop = el(`<section class="dl-bag-pop" id="dl-bag-pop" role="dialog" aria-labelledby="dl-bag-title" tabindex="-1" inert>
<header class="dl-bag-pop__head"><h3 id="dl-bag-title">${t('Kosár')}</h3></header>
<ul class="dl-bag-pop__list"></ul>
<footer class="dl-bag-pop__foot"><p class="dl-bag-pop__total"><span>${t('Összesen')}</span><output></output></p><button type="button" class="btn dl-bag-pop__go">${t('Tovább a fizetéshez')}</button></footer></section>`);
    (o.parent || document.body).append(btn, veil, pop); // this order: Tab goes from the bag straight into the popup
    const num = btn.querySelector('.dl-bag__n');
    let n = 0, isOpen = false;
    const api = {
      el: btn, pop, head: pop.querySelector('.dl-bag-pop__head'), list: pop.querySelector('.dl-bag-pop__list'),
      foot: pop.querySelector('.dl-bag-pop__foot'), total: pop.querySelector('output'),
      set(v) {
        v = Math.max(0, v | 0);
        const more = v > n; n = v;
        btn.dataset.n = v; num.textContent = v > 99 ? '99+' : v; btn.setAttribute('aria-label', label(v));
        if (!v) api.close();
        if (more && !still()) { btn.classList.remove('is-drop'); void btn.offsetWidth; btn.classList.add('is-drop'); }
      },
      hide(on = true) { btn.classList.toggle('is-away', on); if (on) api.close(); },
      open() {
        if (isOpen || !n) return;
        isOpen = true; flip(); pop.focus({ preventScroll: true }); o.onOpen && o.onOpen(api);
      },
      close(refocus) {
        if (!isOpen) return;
        isOpen = false; flip(); if (refocus) btn.focus({ preventScroll: true }); o.onClose && o.onClose(api);
      },
      toggle() { isOpen ? api.close() : api.open(); },
    };
    function flip() {
      btn.setAttribute('aria-expanded', isOpen); pop.inert = !isOpen;
      pop.classList.toggle('is-open', isOpen); veil.classList.toggle('is-open', isOpen);
    }
    btn.addEventListener('click', api.toggle);
    btn.addEventListener('animationend', () => btn.classList.remove('is-drop'));
    veil.addEventListener('click', () => api.close());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) { e.preventDefault(); api.close(true); } });
    pop.querySelector('.dl-bag-pop__go').addEventListener('click', () => { api.close(); o.onCheckout && o.onCheckout(api); });
    api.set(o.count || 0);
    return api;
  }

  function mountRail(o = {}) {
    const steps = o.steps || [];
    const nav = el(`<nav class="dl-rail" aria-label="${t('A rendelés lépései')}"><ol>${steps.map((s, i) =>
      `<li><button type="button" data-no="${i + 1}"><span class="dl-rail__label">${i + 1} · ${t(s.label)}</span></button></li>`).join('')}</ol></nav>`);
    (o.parent || document.body).append(nav);
    const ol = nav.firstElementChild, items = [...ol.children];
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const no = +b.dataset.no, s = steps[no - 1];
      const target = typeof s.target === 'string' ? document.querySelector(s.target) : s.target;
      if (o.onGo && o.onGo(no, target) === false) return;
      if (target) target.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' });
    });
    const api = {
      el: nav,
      set({ current = 1, done = [] } = {}) {
        items.forEach((li, i) => {
          li.classList.toggle('is-done', done.includes(i + 1) && i + 1 !== current);
          i + 1 === current ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current');
        });
        const reach = Math.max(current, ...done); // the thread reaches the furthest step touched
        ol.style.setProperty('--p', steps.length > 1 ? (Math.min(reach, steps.length) - 1) / (steps.length - 1) : 0);
      },
      show(on = true) { nav.classList.toggle('is-on', on); },
    };
    api.set(o);
    return api;
  }

  window.DLBag = { mount: mountBag };
  window.DLRail = { mount: mountRail };
})();
