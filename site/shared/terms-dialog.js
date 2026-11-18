// Terms popup for the booking forms: the points that matter to the guest first, the full ÁSZF folded below.
// BROS_TERMS.bind(form, 'ah' | 'dl') makes the terms checkbox, its ÁSZF link and an unaccepted submit open the popup;
// "Elfogadom" ticks the box (and continues the submit that opened it).
(() => {
  const B = window.BROS, en = B.lang === 'en', L = (hu, e) => (en ? e : hu);
  const POINTS = {
    ah: [
      L('Most mindent online fizettek; a torta és az estén rendelt extrák a helyszínen fizetendők.', 'You pay everything now, online; the cake and extras ordered on the evening are paid on site.'),
      L('Lemondás: 7+ nappal előtte 100%, 48 óráig 50% jár vissza, utána nincs visszatérítés.', 'Cancelling: 7+ days before you get 100% back, up to 48 hours before 50%, after that nothing.'),
      L('A visszatérítésből 3% kezelési költséget levonunk (a kártyás fizetés díja).', 'We keep 3% of a refund as a handling fee (the card payment cost).'),
      L('Ha mi mondjuk le az estét, mindent visszakaptok.', 'If we cancel the evening, you get everything back.'),
      L('Késés esetén az este nem hosszabbodik meg; legfeljebb 12 fő.', 'Arriving late does not extend the evening; up to 12 people.'),
      L('A számlát e-mailben küldjük: előlegszámla most, végszámla az est napján.', 'Invoices come by email: advance invoice now, final invoice on the day.'),
    ],
    dl: [
      L('Kávézói árak, online fizetés; 5 italtól ingyenes a kiszállítás, alatta 490 Ft.', 'Café prices, paid online; delivery is free from 5 drinks, 490 Ft below that.'),
      L('A rendelési határidőig díjmentesen lemondhatod (az időpontnál látod), utána már készítjük.', 'You can cancel free of charge until the order deadline (shown with each time); after that we are making it.'),
      L('Csoportos rendelésnél azt visszük, amit a határidőig kifizettek; a késve érkező fizetés teljesen visszajár.', 'In a group order we bring what is paid by the deadline; a late payment is refunded in full.'),
      L('Számla: céges rendelésnél automatikusan, egyébként ha kéred.', 'Invoice: automatic for company orders, otherwise if you ask for one.'),
      L('Ha bármi nem stimmel, szólj, és megoldjuk.', 'If anything is not right, tell us and we will sort it out.'),
    ],
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const css = document.createElement('style');
  css.textContent = `
.tdlg { width: min(560px, calc(100% - 24px)); max-height: calc(100dvh - 24px); padding: clamp(20px, 3vw, 30px); border: 0; border-radius: var(--r-lg); background: var(--ivory-hi); color: var(--text); box-shadow: inset 0 1px 0 #fff, var(--shadow-lg); overflow: auto; overscroll-behavior: contain; }
.tdlg::backdrop { background: rgb(var(--espresso-rgb) / .42); }
.tdlg h2 { font: 420 27px/1.1 var(--serif); font-variation-settings: var(--soft); letter-spacing: -.02em; }
.tdlg__lead { margin-top: 8px; color: var(--text-soft); font-size: 15px; }
.tdlg ul { margin: 14px 0 0; padding-left: 20px; list-style: disc; display: grid; gap: 8px; font-size: 15.5px; line-height: 1.45; }
.tdlg details { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 12px; }
.tdlg summary { cursor: pointer; font-weight: 600; min-height: 44px; display: flex; align-items: center; }
.tdlg__full { font-size: 14px; line-height: 1.5; color: var(--text-soft); }
.tdlg__full h3 { margin-top: 14px; font-size: 15px; color: var(--text); }
.tdlg__full p { margin-top: 6px; }
.tdlg__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
html:has(.tdlg[open]) { overflow: hidden; }`;
  document.head.append(css);

  let texts = null;
  const loadTexts = () => texts || (texts = new Promise((ok, fail) => {
    if (window.BROS_TEXTS) return ok(window.BROS_TEXTS);
    const s = document.createElement('script');
    s.src = '/customer-texts.js'; s.onload = () => ok(window.BROS_TEXTS); s.onerror = fail;
    document.head.append(s);
  }));

  /** Resolves true when the guest accepts, false when they close it. */
  function open(kind) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'tdlg';
      dlg.setAttribute('aria-labelledby', 'tdlg-title');
      dlg.innerHTML = `
        <h2 id="tdlg-title">${esc(kind === 'ah' ? L('Mielőtt foglaltok', 'Before you book') : L('Mielőtt rendelsz', 'Before you order'))}</h2>
        <p class="tdlg__lead">${esc(L('A legfontosabbak röviden:', 'The key points in short:'))}</p>
        <ul>${POINTS[kind].map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        <details><summary>${esc(L('A teljes ÁSZF', 'The full terms'))}</summary><div class="tdlg__full"><p>…</p></div></details>
        <div class="tdlg__actions"><button type="button" class="btn" data-ok>${esc(L('Elfogadom', 'I accept'))}</button><button type="button" class="btn btn--ghost" data-no>${esc(L('Mégsem', 'Cancel'))}</button></div>`;
      document.body.append(dlg);
      let done = false;
      const finish = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
      dlg.querySelector('[data-ok]').onclick = () => finish(true);
      dlg.querySelector('[data-no]').onclick = () => finish(false);
      dlg.addEventListener('close', () => finish(false));
      dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); });
      dlg.querySelector('details').addEventListener('toggle', async (e) => {
        if (!e.target.open) return;
        const box = dlg.querySelector('.tdlg__full');
        try {
          const T = (await loadTexts())[en ? 'en' : 'hu'].terms;
          box.innerHTML = `<p>${esc(T.updated)}</p>${T.sections.map((s) => `<h3>${esc(s.h)}</h3>${s.p.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')}<p><a href="/aszf/" target="_blank" rel="noopener">${esc(L('Megnyitás külön oldalon', 'Open as a page'))}</a></p>`;
        } catch { box.innerHTML = `<p><a href="/aszf/" target="_blank" rel="noopener">${esc(L('Az ÁSZF megnyitása', 'Open the terms'))}</a></p>`; }
      }, { once: true });
      dlg.showModal();
      dlg.querySelector('[data-ok]').focus();
    });
  }

  /** The checkbox can only be ticked through the popup; an unaccepted submit opens it and continues after "Elfogadom". */
  function bind(form, kind) {
    const box = form.querySelector('input[name="terms"]');
    if (!box || box.dataset.terms) return;
    box.dataset.terms = '1';
    const accept = async () => {
      if (!(await open(kind))) return false;
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    box.addEventListener('click', (e) => { if (box.checked) { e.preventDefault(); accept(); } }); // the click has already ticked it
    box.closest('label')?.querySelectorAll('a[href="/aszf/"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); accept(); }));
    document.addEventListener('submit', async (e) => {
      if (e.target !== form || box.checked) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (await accept()) form.requestSubmit();
    }, true);
  }

  window.BROS_TERMS = { open, bind };
})();
