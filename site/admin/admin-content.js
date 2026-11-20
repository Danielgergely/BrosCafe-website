// Bros Cafe · admin: content tabs (products, what's new/journal, photos). Same endpoints and payloads as
// ProductsPanel / JournalPanel / MediaPanel: /admin/products, /admin/whats-new, /admin/media, each with edited_at,
// archive (DELETE) and "revert to the file version" (POST .../reset).
(() => {
  const BA = window.BA; const { T, esc, card, badge } = BA;
  const CATS = ['coffee', 'specialty', 'tea', 'smoothie', 'sandwich', 'pastry', 'cake', 'dessert', 'bottled', 'beans', 'merch'];
  const SECTIONS = ['coffee', 'cold', 'savoury', 'sweet'];
  const SECTION_OF_CAT = { coffee: 'coffee', specialty: 'coffee', tea: 'coffee', beans: 'coffee', smoothie: 'cold', bottled: 'cold', sandwich: 'savoury', pastry: 'savoury', cake: 'sweet', dessert: 'sweet' };
  const FLAVOUR = ['bitterSweet', 'lightBold', 'mildIntense', 'milkyCreamy'];
  const MILKS = ['Oat', 'CoconutRice', 'Pea'];
  const JOURNAL_TAGS = ['house', 'pastry', 'brewing', 'origin', 'event', 'team'];
  const FILE_MIME = 'image/jpeg,image/png,image/webp,image/avif';

  // ---------- the photo library, shared by the editors and the Photos tab ----------
  const media = {
    items: null,
    async refresh() { try { media.items = await BA.api('/admin/media'); } catch (e) { media.items = media.items || []; BA.fail(e); } return media.items; },
    async upload(files) {
      const saved = [];
      try {
        for (const file of Array.from(files || [])) { const body = new FormData(); body.append('file', file); saved.push(await BA.api('/admin/media', { method: 'POST', body })); }
        if (saved.length) BA.toast(T('content.uploaded', { n: saved.length }));
      } catch (e) { BA.fail(e); }
      await media.refresh();
      return saved;
    },
    async remove(filename) {
      try { await BA.api(`/admin/media/${filename}`, { method: 'DELETE' }); BA.toast(T('content.photoDeleted')); await media.refresh(); return true; }
      catch (e) { BA.fail(e); return false; }
    },
  };

  // ---------- form fields ----------
  const lab = (t) => `<span class="ad-lab">${esc(t)}</span>`;
  const pairField = (path, label, rows) => `<div class="ad-f">${lab(label)}<div class="ad-pair">${['hu', 'en'].map((c) => {
    const ph = esc(T(`content.lang.${c}`));
    return rows ? `<textarea data-path="${path}.${c}" rows="${rows}" placeholder="${ph}" aria-label="${ph}"></textarea>` : `<input data-path="${path}.${c}" placeholder="${ph}" aria-label="${ph}">`;
  }).join('')}</div></div>`;
  const listField = (path, label, hint) => `<div class="ad-f">${lab(label)}<div class="ad-pair">${['hu', 'en'].map((c) => {
    const ph = esc(T(`content.lang.${c}`));
    return `<textarea data-list="${path}.${c}" rows="5" placeholder="${ph}" aria-label="${ph}"></textarea>`;
  }).join('')}</div>${hint ? `<p class="ad-small">${esc(hint)}</p>` : ''}</div>`;
  const multi = (path, label, hint, options) => `<div class="ad-f">${lab(label)}<div class="ad-chips">${options.map((o) => `<label class="ad-chip"><input type="checkbox" data-multi="${path}" value="${esc(o.id)}">${esc(o.label)}</label>`).join('')}</div>${hint ? `<p class="ad-small">${esc(hint)}</p>` : ''}</div>`;

  const getp = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setp = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] == null || typeof a[k] !== 'object' ? (a[k] = {}) : a[k]), o); t[last] = v; };

  /** Fill the dialog's inputs from `f` and keep `f` in step with them. */
  function bind(dlg, f) {
    dlg.querySelectorAll('[data-path]').forEach((el) => {
      const v = getp(f, el.dataset.path);
      if (el.type === 'checkbox') el.checked = el.dataset.invert ? v === false : v === true;
      else el.value = v == null ? '' : v;
    });
    dlg.querySelectorAll('[data-list]').forEach((el) => { el.value = (getp(f, el.dataset.list) || []).join('\n'); });
    dlg.querySelectorAll('[data-multi]').forEach((el) => { el.checked = (getp(f, el.dataset.multi) || []).includes(el.value); });
    dlg.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.path) setp(f, el.dataset.path, el.type === 'checkbox' ? (el.dataset.invert ? el.checked : el.checked) : el.value);
      else if (el.dataset.list) setp(f, el.dataset.list, el.value.split('\n'));
      else if (el.dataset.multi) { const cur = getp(f, el.dataset.multi) || []; setp(f, el.dataset.multi, el.checked ? [...cur.filter((x) => x !== el.value), el.value] : cur.filter((x) => x !== el.value)); }
    });
  }

  // Same-origin images only (no third-party requests): anything else shows the menu drawing + a "külső kép" hint.
  const sameOrigin = (u) => typeof u === 'string' && ((u.startsWith('/') && !u.startsWith('//')) || u.startsWith(`${location.origin}/`));
  const extHint = () => (BA.lang === 'hu' ? 'külső kép' : 'external image');
  const pic = (u, cls, p, extra = '') => (sameOrigin(u)
    ? `<img class="${cls}" src="${esc(u.replace(/^\/images\/products\//, '/shared/photos/'))}" alt=""${extra}>`
    : `<span class="${cls} ad-ext" title="${esc(extHint())}">${(window.BROS && window.BROS.drinkArt ? window.BROS.drinkArt(p || {}) : '')}<small>${esc(extHint())}</small></span>`);

  // ---------- gallery (several photos) and image picker (one) ----------
  function mountGallery(host, f) {
    const draw = () => {
      const imgs = f.images || [];
      host.innerHTML = `<span class="ad-lab">${esc(T('content.gallery'))}</span>
        <div style="display:grid;gap:8px">${imgs.map((u, i) => `<div class="ad-gal">${pic(u, 'ad-gal__img', f)}<div><b class="ad-eyebrow">${i === 0 ? esc(T('content.mainPhoto')) : `${i + 1}.`}</b><p title="${esc(u)}">${esc(u)}</p></div>
          <button type="button" class="ad-ib" data-mv="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(T('content.moveUp'))}" title="${esc(T('content.moveUp'))}">↑</button>
          <button type="button" class="ad-ib" data-mv="${i}" data-d="1" ${i === imgs.length - 1 ? 'disabled' : ''} aria-label="${esc(T('content.moveDown'))}" title="${esc(T('content.moveDown'))}">↓</button>
          <button type="button" class="ad-ib ad-ib--danger" data-rm="${i}" aria-label="${esc(T('content.clear'))}" title="${esc(T('content.clear'))}">${BA.ico('trash')}</button></div>`).join('')}
          ${imgs.length ? '' : `<p class="ad-small" style="border:1.5px dashed var(--line-strong);border-radius:12px;padding:14px;text-align:center">${esc(T('content.noPhotos'))}</p>`}</div>
        <div class="ad-row"><button type="button" class="ad-btn ad-btn--ghost" data-up>${esc(T('content.upload'))}</button><button type="button" class="ad-btn ad-btn--ghost" data-browse>${esc(T('content.browse'))}</button></div>
        <div class="ad-row" style="flex-wrap:nowrap"><input class="ad-sel" style="flex:1;width:100%" data-url placeholder="${esc(T('content.imageUrl'))}"><button type="button" class="ad-btn ad-btn--ghost" data-addurl>${esc(T('content.addUrl'))}</button></div>
        <div data-lib></div><input type="file" multiple accept="${FILE_MIME}" hidden>`;
    };
    const add = (u) => { if (u && !(f.images || []).includes(u)) { f.images = [...(f.images || []), u]; draw(); } };
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mv != null) { const i = +b.dataset.mv; const j = i + +b.dataset.d; const a = [...f.images]; [a[i], a[j]] = [a[j], a[i]]; f.images = a; draw(); }
      else if (b.dataset.rm != null) { f.images = f.images.filter((_, i) => i !== +b.dataset.rm); draw(); }
      else if (b.dataset.up != null) host.querySelector('input[type=file]').click();
      else if (b.dataset.addurl != null) { const inp = host.querySelector('[data-url]'); add(inp.value.trim()); }
      else if (b.dataset.browse != null) {
        const lib = host.querySelector('[data-lib]');
        if (lib.innerHTML) { lib.innerHTML = ''; return; }
        const items = media.items || await media.refresh();
        lib.innerHTML = items.length ? `<div class="ad-pick">${items.filter((x) => x.content_type !== 'video/mp4').map((x) => `<button type="button" data-pick="${esc(x.url)}" title="${esc(x.original_name)}" class="${(f.images || []).includes(x.url) ? 'is-on' : ''}"><img src="${esc(x.url)}" alt=""></button>`).join('')}</div>` : `<p class="ad-small">${esc(T('content.libraryEmpty'))}</p>`;
      } else if (b.dataset.pick) add(b.dataset.pick);
    });
    host.addEventListener('change', async (e) => {
      if (e.target.type !== 'file') return;
      const saved = await media.upload(e.target.files); e.target.value = '';
      if (saved.length) { f.images = [...(f.images || []), ...saved.map((x) => x.url)]; draw(); }
    });
    draw();
  }

  function mountImage(host, f, key, label) {
    const draw = () => {
      host.innerHTML = `<span class="ad-lab">${esc(label)}</span><div class="ad-row" style="align-items:flex-start;flex-wrap:nowrap">
        ${f[key] ? `${pic(f[key], 'ad-prev', f)}` : '<span class="ad-prev">▣</span>'}
        <div style="flex:1;min-width:0;display:grid;gap:8px"><input class="ad-sel" style="width:100%" data-url value="${esc(f[key] || '')}" placeholder="${esc(T('content.imageUrl'))}">
        <div class="ad-row"><button type="button" class="ad-btn ad-btn--ghost" data-up>${esc(T('content.upload'))}</button><button type="button" class="ad-btn ad-btn--ghost" data-browse>${esc(T('content.browse'))}</button>${f[key] ? `<button type="button" class="ad-btn ad-btn--ghost" data-clear>${esc(T('content.clear'))}</button>` : ''}</div></div></div><div data-lib></div><input type="file" accept="${FILE_MIME},video/mp4" hidden>`;
    };
    host.addEventListener('input', (e) => { if (e.target.matches('[data-url]')) f[key] = e.target.value; });
    host.addEventListener('change', (e) => { if (e.target.matches('[data-url]')) { f[key] = e.target.value; draw(); } });
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.up != null) host.querySelector('input[type=file]').click();
      else if (b.dataset.clear != null) { f[key] = ''; draw(); }
      else if (b.dataset.browse != null) {
        const lib = host.querySelector('[data-lib]');
        if (lib.innerHTML) { lib.innerHTML = ''; return; }
        const items = media.items || await media.refresh();
        lib.innerHTML = items.length ? `<div class="ad-pick">${items.map((x) => `<button type="button" data-pick="${esc(x.url)}" title="${esc(x.original_name)}" class="${f[key] === x.url ? 'is-on' : ''}"><img src="${esc(x.url)}" alt=""></button>`).join('')}</div>` : `<p class="ad-small">${esc(T('content.libraryEmpty'))}</p>`;
      } else if (b.dataset.pick) { f[key] = b.dataset.pick; draw(); }
    });
    host.addEventListener('change', async (e) => {
      if (e.target.type !== 'file') return;
      const [saved] = await media.upload(e.target.files); e.target.value = '';
      if (saved) { f[key] = saved.url; draw(); }
    });
    draw();
  }

  function mountFlavour(host, f) {
    const scales = T('product.scales');
    const draw = () => {
      if (!f.flavor) { host.innerHTML = `${lab(T('content.flavour'))}<div><button type="button" class="ad-btn ad-btn--ghost" data-add>＋ ${esc(T('content.addFlavour'))}</button></div><p class="ad-small">${esc(T('content.flavourHint'))}</p>`; return; }
      host.innerHTML = `<div class="ad-row ad-row--between">${lab(T('content.flavour'))}<button type="button" class="link" data-del>${esc(T('content.removeFlavour'))}</button></div>
        <div style="display:grid;gap:10px;padding:14px;border:1.5px solid var(--line);border-radius:12px;background:var(--ivory)">${FLAVOUR.map((key, i) => `<label class="ad-slider"><b><span>${esc((scales[i] || [])[0])}</span><span data-v="${key}">${f.flavor[key] ?? 50}</span><span>${esc((scales[i] || [])[1])}</span></b><input type="range" min="0" max="100" step="1" data-fl="${key}" value="${f.flavor[key] ?? 50}"></label>`).join('')}</div>`;
    };
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) { f.flavor = Object.fromEntries(FLAVOUR.map((k) => [k, 50])); draw(); }
      if (e.target.closest('[data-del]')) { f.flavor = null; draw(); }
    });
    host.addEventListener('input', (e) => { const k = e.target.dataset.fl; if (k) { f.flavor[k] = Number(e.target.value); host.querySelector(`[data-v="${k}"]`).textContent = e.target.value; } });
    draw();
  }

  // ---------- row actions shared by products and journal ----------
  const editedBadge = (it) => (it.edited_at ? `<span class="ad-badge" title="${esc(T('content.editedNote'))}">${esc(T('content.edited'))}</span>` : '');
  const archivedBadge = (it) => (it.active === false ? badge(T('content.archived'), 'ad-badge--dim') : '');
  const actions = (it, id) => `<div class="ad-row" style="gap:2px;justify-content:flex-end;flex-wrap:nowrap">
    <button type="button" class="ad-ib" data-edit="${esc(id)}" aria-label="${esc(T('content.edit'))}" title="${esc(T('content.edit'))}">${BA.ico('edit')}</button>
    <button type="button" class="ad-ib" data-toggle="${esc(id)}" aria-label="${esc(T(it.active === false ? 'content.show' : 'content.hide'))}" title="${esc(T(it.active === false ? 'content.show' : 'content.hide'))}">${BA.ico(it.active === false ? 'show' : 'hide')}</button>
    ${it.edited_at ? `<button type="button" class="ad-ib" data-revert="${esc(id)}" aria-label="${esc(T('content.revert'))}" title="${esc(T('content.revert'))}">${BA.ico('revert')}</button>` : ''}</div>`;
  const slug = (v) => v.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // ---------- products ----------
  const BLANK_PRODUCT = () => ({ id: '', cat: 'coffee', order: 99, price_huf: 0, name: { en: '', hu: '' }, desc: { en: '', hu: '' }, images: [], allergens: [], milks: [], active: true, stock_photos: false });
  const lines = (pair) => {
    const hu = ((pair && pair.hu) || []).map((l) => l.trim()).filter(Boolean);
    const en = ((pair && pair.en) || []).map((l) => l.trim()).filter(Boolean);
    return hu.length || en.length ? { hu, en } : null;
  };

  BA.tab('products', {
    icon: '☕',
    async render(root) {
      let products = null;
      const load = async () => { try { products = await BA.api('/admin/products'); } catch (e) { products = products || []; BA.fail(e); } draw(); };
      const catLabel = (c) => { const k = `product.cats.${c}`, v = T(k); return v === k ? c : v; }; // old archived items have retired categories

      const draw = () => {
        root.innerHTML = `<div class="ad-panel"><div class="ad-row ad-row--between"><p class="ad-hint">${esc(T('content.productsHint'))}</p><button type="button" class="ad-btn" data-add data-testid="add-product-btn">＋ ${esc(T('content.addProduct'))}</button></div>
          ${card('', `<div class="ad-tw"><table class="ad-t"><thead><tr><th>${esc(T('content.photo'))}</th><th>${esc(T('content.name'))}</th><th>${esc(T('content.category'))}</th><th class="r">${esc(T('content.price'))}</th><th class="r">${esc(T('content.order'))}</th><th></th></tr></thead><tbody>
          ${products.map((p) => `<tr class="${p.active === false ? 'is-off' : ''}" data-testid="product-row-${esc(p.id)}"><td>${p.images && p.images[0] ? `${pic(p.images[0], 'ad-thumb', p, ' loading="lazy"')}` : '<span class="ad-thumb"></span>'}</td>
            <td><b>${esc(BA.pick(p.name))}</b>${editedBadge(p)}${archivedBadge(p)}</td><td class="ad-muted">${esc(catLabel(p.cat))}</td><td class="r ad-num">${esc(BA.ft(p.price_huf))}</td><td class="r ad-num ad-muted">${esc(p.order)}</td><td>${actions(p, p.id)}</td></tr>`).join('')}</tbody></table></div>`)}</div>`;
      };

      const setActive = async (p, active) => {
        try { if (active) await BA.api('/admin/products', { method: 'POST', body: { ...p, active: true } }); else await BA.api(`/admin/products/${p.id}`, { method: 'DELETE' }); await load(); } catch (e) { BA.fail(e); }
      };
      const revert = async (p) => {
        if (!(await BA.confirm({ title: T('content.revert'), text: T('content.revertConfirm') }))) return;
        try { await BA.api(`/admin/products/${p.id}/reset`, { method: 'POST' }); BA.toast(T('content.reverted')); await load(); } catch (e) { BA.fail(e); }
      };

      const openForm = (product) => {
        const f = JSON.parse(JSON.stringify(product));
        const exists = products.some((p) => p.id === f.id);
        const opt = (list, fn, cur) => list.map((c) => `<option value="${c}"${c === cur ? ' selected' : ''}>${esc(fn(c))}</option>`).join('');
        const mapMilk = T('product.milkMap');
        BA.dialog({
          title: exists ? T('content.editProduct') : T('content.addProduct'), wide: true,
          html: `<form class="ad-form" data-testid="product-form">
            <div class="ad-cols2">
              <label class="ad-f"><span>${esc(T('content.id'))}</span><input data-path="id" required ${exists ? 'disabled' : ''}></label>
              <label class="ad-f"><span>${esc(T('content.category'))}</span><select data-path="cat">${opt(CATS, catLabel, f.cat)}</select></label>
              <label class="ad-f"><span>${esc(T('content.section'))}</span><select data-path="section"></select></label>
              <label class="ad-f"><span>${esc(T('content.priceHuf'))}</span><input type="number" min="0" step="10" data-path="price_huf"></label>
            </div>
            ${pairField('name', T('content.name'))}${pairField('desc', T('content.desc'), 3)}${pairField('tip', T('content.tip'), 2)}
            <div class="ad-f" data-gallery></div>
            <label class="ad-check"><input type="checkbox" data-path="stock_photos"><span>${esc(T('content.stockPhotos'))}<br><small class="ad-small">${esc(T('content.stockPhotosHint'))}</small></span></label>
            <div class="ad-f" data-flavour></div>
            ${listField('behind', T('content.behind'), T('content.behindHint'))}
            ${multi('milks', T('content.milks'), T('content.milksHint'), MILKS.map((m) => ({ id: m, label: mapMilk[m] || m })))}
            <div class="ad-cols2"><label class="ad-f"><span>${esc(T('content.order'))}</span><input type="number" min="1" data-path="order"></label>
              <label class="ad-check" style="align-self:end;min-height:48px"><input type="checkbox" data-path="active" data-invert="" checked><span>${esc(T('content.showOnMenu'))}</span></label></div>
            <button class="ad-btn" style="min-height:54px" data-save>${esc(T('content.save'))}</button>
            ${f.edited_at ? `<p class="ad-small">↺ ${esc(T('content.editedNote'))}</p>` : ''}</form>`,
          mount(dlg) {
            // "active" is stored true/false; undefined counts as shown
            if (f.active === undefined) f.active = true;
            bind(dlg, f);
            dlg.querySelector('[data-path="active"]').checked = f.active !== false;
            dlg.querySelector('[data-path="active"]').dataset.invert = '';
            dlg.querySelector('[data-path="stock_photos"]').checked = f.stock_photos === true;
            const sec = dlg.querySelector('[data-path="section"]');
            const fillSection = () => {
              sec.innerHTML = `<option value="">${esc(T('content.sectionAuto', { section: T(`product.sections.${SECTION_OF_CAT[f.cat] || 'coffee'}`) }))}</option>${opt(SECTIONS, (s) => T(`product.sections.${s}`), f.section || '')}`;
              sec.value = f.section || '';
            };
            fillSection();
            dlg.querySelector('[data-path="cat"]').addEventListener('change', fillSection);
            dlg.querySelector('[data-path="id"]').addEventListener('input', (e) => { const v = slug(e.target.value); e.target.value = v; f.id = v; });
            mountGallery(dlg.querySelector('[data-gallery]'), f);
            mountFlavour(dlg.querySelector('[data-flavour]'), f);
            dlg.querySelector('form').addEventListener('submit', async (e) => {
              e.preventDefault();
              const btn = dlg.querySelector('[data-save]'); btn.disabled = true; btn.textContent = T('content.saving');
              try {
                await BA.api('/admin/products', { method: 'POST', body: { ...f, order: Number(f.order) || 99, milks: f.milks || [], stock_photos: f.stock_photos === true, price_huf: Number(f.price_huf) || 0, flavor: f.flavor ?? null, section: f.section || null, behind: lines(f.behind) } });
              } catch (err) { BA.fail(err); btn.disabled = false; btn.textContent = T('content.save'); return; }
              dlg.close(); BA.toast(T('content.saved')); await load();
            });
          },
        });
      };

      root.onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const find = (id) => products.find((p) => p.id === id);
        if (b.dataset.add != null) openForm(BLANK_PRODUCT());
        else if (b.dataset.edit) openForm(find(b.dataset.edit));
        else if (b.dataset.toggle) { const p = find(b.dataset.toggle); setActive(p, p.active === false); }
        else if (b.dataset.revert) revert(find(b.dataset.revert));
      };
      root.innerHTML = BA.loading();
      await load();
    },
  });

  // ---------- what's new / journal ----------
  const today = () => new Date().toISOString().slice(0, 10);
  const BLANK_POST = () => ({ id: '', order: 99, tags: [], date: today(), product_ids: [], image: '', title: { en: '', hu: '' }, blurb: { en: '', hu: '' }, body: { en: '', hu: '' }, active: true });
  /** The tags a post shows: its own list, else the older single `tag`. */
  const postTags = (p) => (Array.isArray(p.tags) && p.tags.length ? p.tags : p.tag ? [p.tag] : []);

  BA.tab('journal', {
    icon: '📰',
    async render(root) {
      let posts = null; let catalog = [];
      const load = async () => { try { posts = await BA.api('/admin/whats-new'); } catch (e) { posts = posts || []; BA.fail(e); } draw(); };
      const draw = () => {
        root.innerHTML = `<div class="ad-panel"><div class="ad-row ad-row--between"><p class="ad-hint">${esc(T('content.journalHint'))}</p><button type="button" class="ad-btn" data-add data-testid="add-post-btn">＋ ${esc(T('content.addPost'))}</button></div>
          <div class="ad-cards">${posts.map((p) => `<article class="ad-post ${p.active === false ? 'is-off' : ''}" data-testid="post-card-${esc(p.id)}">
            ${p.image ? `${pic(p.image, 'ad-post__img', p, ' loading="lazy"')}` : '<div style="height:130px;border-radius:12px;background:var(--ivory)"></div>'}
            <span class="ad-eyebrow">${esc(postTags(p).map((k) => T(`news.tags.${k}`)).join(' · '))}</span>
            <h4>${esc(BA.pick(p.title))}${editedBadge(p)}${archivedBadge(p)}</h4><p>${esc(BA.pick(p.blurb))}</p>
            <div style="border-top:1px solid var(--line);padding-top:6px">${actions(p, p.id)}</div></article>`).join('')}</div></div>`;
      };
      const setActive = async (p, active) => {
        try { if (active) await BA.api('/admin/whats-new', { method: 'POST', body: { ...p, active: true } }); else await BA.api(`/admin/whats-new/${p.id}`, { method: 'DELETE' }); await load(); } catch (e) { BA.fail(e); }
      };
      const revert = async (p) => {
        if (!(await BA.confirm({ title: T('content.revert'), text: T('content.revertConfirm') }))) return;
        try { await BA.api(`/admin/whats-new/${p.id}/reset`, { method: 'POST' }); BA.toast(T('content.reverted')); await load(); } catch (e) { BA.fail(e); }
      };
      const openForm = (post) => {
        const f = JSON.parse(JSON.stringify(post));
        const exists = posts.some((p) => p.id === f.id);
        BA.dialog({
          title: exists ? T('content.editPost') : T('content.addPost'), wide: true,
          html: `<form class="ad-form" data-testid="post-form">
            <div class="ad-cols3"><label class="ad-f"><span>${esc(T('content.id'))}</span><input data-path="id" required ${exists ? 'disabled' : ''}></label>
              <label class="ad-f"><span>${esc(T('content.date'))}</span><input type="date" data-path="date"></label>
              <label class="ad-f"><span>${esc(T('content.order'))}</span><input type="number" min="1" data-path="order"></label></div>
            ${pairField('title', T('content.title'))}${pairField('blurb', T('content.blurb'), 3)}${pairField('body', T('content.body'), 8)}
            <p class="ad-small">${esc(T('content.bodyHint'))}</p>
            ${multi('tags', T('content.tags'), T('content.tagsHint'), JOURNAL_TAGS.map((k) => ({ id: k, label: T(`news.tags.${k}`) })))}
            ${multi('product_ids', T('content.linkedCoffees'), T('content.linkedCoffeesHint'), catalog.map((p) => ({ id: p.id, label: BA.pick(p.name) || p.id })))}
            <div class="ad-f" data-image></div>
            <label class="ad-check"><input type="checkbox" data-path="active"><span>${esc(T('content.showOnSite'))}</span></label>
            <button class="ad-btn" style="min-height:54px" data-save>${esc(T('content.save'))}</button>
            ${f.edited_at ? `<p class="ad-small">↺ ${esc(T('content.editedNote'))}</p>` : ''}</form>`,
          mount(dlg) {
            if (f.active === undefined) f.active = true;
            bind(dlg, f);
            dlg.querySelector('[data-path="active"]').checked = f.active !== false;
            dlg.querySelector('[data-path="id"]').addEventListener('input', (e) => { const v = slug(e.target.value); e.target.value = v; f.id = v; });
            mountImage(dlg.querySelector('[data-image]'), f, 'image', T('content.photo'));
            dlg.querySelector('form').addEventListener('submit', async (e) => {
              e.preventDefault();
              const btn = dlg.querySelector('[data-save]'); btn.disabled = true; btn.textContent = T('content.saving');
              try { await BA.api('/admin/whats-new', { method: 'POST', body: { ...f, order: Number(f.order) || 99, date: f.date || null } }); }
              catch (err) { BA.fail(err); btn.disabled = false; btn.textContent = T('content.save'); return; }
              dlg.close(); BA.toast(T('content.saved')); await load();
            });
          },
        });
      };
      root.onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const find = (id) => posts.find((p) => p.id === id);
        if (b.dataset.add != null) openForm(BLANK_POST());
        else if (b.dataset.edit) openForm(find(b.dataset.edit));
        else if (b.dataset.toggle) { const p = find(b.dataset.toggle); setActive(p, p.active === false); }
        else if (b.dataset.revert) revert(find(b.dataset.revert));
      };
      root.innerHTML = BA.loading();
      BA.api('/admin/products').then((l) => { catalog = l.filter((p) => p.active !== false); }).catch(() => {});
      await load();
    },
  });

  // ---------- photos ----------
  BA.tab('photos', {
    icon: '🖼',
    async render(root) {
      const draw = () => {
        const items = media.items;
        root.innerHTML = `<div class="ad-panel"><p class="ad-hint">${esc(T('content.photosHint'))}</p>
          <button type="button" class="ad-drop" data-drop data-testid="media-dropzone"><b>${esc(T('content.dropHere'))}</b><span class="ad-small">${esc(T('content.dropHint'))}</span></button>
          <input type="file" multiple accept="${FILE_MIME},video/mp4" hidden>
          ${items.length ? `<div class="ad-media">${items.map((x) => `<figure data-testid="media-${esc(x.id)}"><div class="ph">${x.content_type === 'video/mp4' ? `<video src="${esc(x.url)}" muted preload="metadata"></video>` : `<img src="${esc(x.url)}" alt="" loading="lazy">`}</div>
            <figcaption><p title="${esc(x.original_name)}">${esc(x.original_name)}</p><span class="ad-small ad-num">${esc(BA.size(x.bytes))}</span>
            <div class="ad-row ad-row--between"><button type="button" class="ad-ib" data-copy="${esc(x.url)}" title="${esc(T('content.copyLink'))}" aria-label="${esc(T('content.copyLink'))}">${BA.ico('copy')}</button><button type="button" class="ad-ib ad-ib--danger" data-del="${esc(x.filename)}" title="${esc(T('content.delete'))}" aria-label="${esc(T('content.delete'))}">${BA.ico('trash')}</button></div></figcaption></figure>`).join('')}</div>`
            : card('', `<p class="ad-muted" style="text-align:center;padding:20px 0">${esc(T('content.libraryEmpty'))}</p>`)}</div>`;
      };
      const up = async (files) => { const drop = root.querySelector('[data-drop]'); if (drop) drop.querySelector('b').textContent = T('content.uploading'); await media.upload(files); draw(); };
      root.onclick = async (e) => {
        if (e.target.closest('[data-drop]')) { root.querySelector('input[type=file]').click(); return; }
        const copy = e.target.closest('[data-copy]'); const del = e.target.closest('[data-del]');
        if (copy) { try { await navigator.clipboard.writeText(`${location.origin}${copy.dataset.copy}`); BA.toast(T('content.linkCopied')); } catch (err) { BA.toast(T('content.copyFailed'), true); } }
        if (del && (await media.remove(del.dataset.del))) draw();
      };
      root.onchange = (e) => { if (e.target.type === 'file') { up(e.target.files); e.target.value = ''; } };
      root.ondragover = (e) => { e.preventDefault(); const d = root.querySelector('[data-drop]'); if (d) d.classList.add('is-over'); };
      root.ondragleave = () => { const d = root.querySelector('[data-drop]'); if (d) d.classList.remove('is-over'); };
      root.ondrop = (e) => { e.preventDefault(); up(e.dataTransfer.files); };
      root.innerHTML = BA.loading();
      await media.refresh(); draw();
    },
  });

  // ---------- Instagram: which reels are featured on /ujdonsagok/ (the API cannot tell which are pinned) ----------
  // Instagram reels on /ujdonsagok/ (worker services/reels.ts): paste the reel's link, pick a cover (a screenshot, or the
  // reel video itself with a slider for the frame). The cover is stored by us; Instagram's player opens on a tap.
  BA.tab('reels', {
    icon: '🎬',
    async render(root) {
      const L = (hu, en) => (BA.lang === 'en' ? en : hu);
      let items = [], draft = { code: '' }; // draft.file / .url / .video once a cover is picked
      const codeOf = (s) => (/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p)\/([\w-]{5,40})/.exec(String(s)) || [])[1] || '';
      const save = async (next) => { items = (await BA.api('/admin/reels', { method: 'PUT', body: { items: next } })).items; };
      const item = (r, i) => `<li class="ad-reel" data-i="${i}"><img src="${esc(r.cover)}" alt="">
          <div class="ad-reel__f"><input class="ad-sel" data-k="caption" maxlength="140" value="${esc(r.caption)}" placeholder="${esc(L('Felirat (nem kötelező)', 'Caption (optional)'))}">
            <div class="ad-row"><button type="button" class="ad-btn ad-btn--ghost" data-mv="-1"${i ? '' : ' disabled'} aria-label="${esc(L('Előrébb', 'Up'))}">↑</button><button type="button" class="ad-btn ad-btn--ghost" data-mv="1"${i < items.length - 1 ? '' : ' disabled'} aria-label="${esc(L('Hátrébb', 'Down'))}">↓</button>
              <a class="ad-btn ad-btn--ghost" href="https://www.instagram.com/reel/${esc(r.code)}/" target="_blank" rel="noopener">${esc(L('Megnyitás', 'Open'))}</a>
              <button type="button" class="ad-btn ad-btn--ghost" data-del>${esc(L('Törlés', 'Delete'))}</button></div></div></li>`;
      const adder = () => {
        if (items.length >= 12) return `<p class="ad-small">${esc(L('Elérted a 12 reelt: törölj egyet, ha újat tennél fel.', '12 reels is the maximum: delete one to add another.'))}</p>`;
        const d = draft;
        return `<div class="ad-reel ad-reel--new">${d.url ? (d.video ? `<video src="${esc(d.url)}" muted playsinline preload="auto"></video>` : `<img src="${esc(d.url)}" alt="">`) : `<div class="ad-reel__ph" aria-hidden="true">🎬</div>`}
          <div class="ad-reel__f"><b>${esc(L('Új reel', 'New reel'))}</b>
            <span class="ad-small">${esc(L('1. Az Instagramon: Megosztás → Link másolása, aztán:', '1. On Instagram: Share → Copy link, then:'))}</span>
            <div class="ad-row"><input class="ad-sel" style="flex:1 1 200px;min-width:0" data-link inputmode="url" value="${esc(d.code ? `https://www.instagram.com/reel/${d.code}/` : '')}" placeholder="https://www.instagram.com/reel/…"><button type="button" class="ad-btn${d.code ? ' ad-btn--ghost' : ''}" data-paste>${esc(L('Link beillesztése', 'Paste link'))}</button></div>
            ${d.code ? `<span class="ad-small">${esc(L('2. Borítókép: egy képernyőkép vagy maga a videó', '2. Cover: a screenshot or the video itself'))}</span>
            <label class="ad-btn${d.url ? ' ad-btn--ghost' : ''}" style="justify-self:start">${esc(d.url ? L('Másik borítókép', 'Another cover') : L('Borítókép kiválasztása', 'Pick a cover'))}<input type="file" accept="image/*,video/*" data-cover hidden></label>
            ${d.video ? `<label class="ad-small">${esc(L('Húzd a csúszkát a borítóképhez', 'Drag the slider to choose the frame'))}<input type="range" data-seek min="0" max="1" step="0.04" value="0" style="width:100%"></label>` : ''}
            ${d.url ? `<input class="ad-sel" data-cap maxlength="140" value="${esc(d.caption || '')}" placeholder="${esc(L('Felirat (nem kötelező)', 'Caption (optional)'))}">
            <div class="ad-row"><button type="button" class="ad-btn" data-add>${esc(L('Mentés', 'Save'))}</button><button type="button" class="ad-btn ad-btn--ghost" data-cancel>${esc(L('Mégse', 'Cancel'))}</button></div>` : ''}` : ''}
          </div></div>`;
      };
      const draw = () => {
        root.innerHTML = `<div class="ad-panel">
          <p class="ad-hint">${esc(L('Az Újdonságok oldalon ebben a sorrendben látszanak (legfeljebb 12); koppintásra az Instagram lejátszója nyílik meg. Amíg nincs itt reel, a régi négy klip látszik.', "Shown on the news page in this order (12 at most); a tap opens Instagram's player. Until there are reels here, the old four clips show."))}</p>
          ${adder()}${items.length ? `<ol class="ad-reels">${items.map(item).join('')}</ol>` : ''}</div>`;
        const v = root.querySelector('.ad-reel--new video'), seek = root.querySelector('[data-seek]');
        if (v && seek) {
          v.addEventListener('loadedmetadata', () => { seek.max = String(v.duration || 1); v.currentTime = seek.value = String(Math.min(1, (v.duration || 0) / 2)); }, { once: true });
          seek.oninput = () => { v.currentTime = Number(seek.value); };
        }
      };
      const setLink = (text) => {
        const code = codeOf(text);
        if (!code) { BA.toast(L('Ez nem Instagram-reel link.', 'That is not an Instagram reel link.'), true); return; }
        if (items.some((r) => r.code === code)) { BA.toast(L('Ez a reel már fent van.', 'This reel is already on the list.'), true); return; }
        draft = { ...draft, code }; draw();
      };
      // the cover, at most 720 px wide, as a JPEG: from the picked image or the shown video frame
      const grab = (el) => new Promise((ok, no) => {
        const w0 = el.videoWidth || el.naturalWidth, h0 = el.videoHeight || el.naturalHeight, c = document.createElement('canvas');
        c.width = Math.min(720, w0); c.height = Math.round(c.width * h0 / w0);
        c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? ok(b) : no(new Error(L('A borítóképet nem sikerült elkészíteni.', 'Could not make the cover.')))), 'image/jpeg', 0.85);
      });
      const reset = () => { if (draft.url) URL.revokeObjectURL(draft.url); draft = { code: '' }; draw(); };
      root.onchange = async (e) => {
        if (e.target.matches('[data-link]')) { if (e.target.value.trim()) setLink(e.target.value); return; }
        if (e.target.matches('[data-cover]')) {
          const file = e.target.files[0]; if (!file) return;
          if (draft.url) URL.revokeObjectURL(draft.url);
          draft = { ...draft, caption: root.querySelector('[data-cap]')?.value, url: URL.createObjectURL(file), video: file.type.startsWith('video/') };
          draw(); return;
        }
        const f = e.target.closest('[data-k]'); if (!f) return;
        const i = Number(f.closest('[data-i]').dataset.i);
        try { await save(items.map((r, j) => (j === i ? { ...r, [f.dataset.k]: f.value } : r))); BA.toast(L('Mentve', 'Saved')); } catch (err) { BA.fail(err); }
        draw();
      };
      root.onclick = async (e) => {
        if (e.target.closest('[data-paste]')) {
          try { setLink(await navigator.clipboard.readText()); }
          catch (err) { const inp = root.querySelector('[data-link]'); inp.focus(); BA.toast(L('Illeszd be a linket a mezőbe.', 'Paste the link into the field.')); }
          return;
        }
        if (e.target.closest('[data-cancel]')) return reset();
        if (e.target.closest('[data-add]')) {
          const btn = e.target.closest('[data-add]'); btn.disabled = true;
          try {
            const body = new FormData();
            body.append('file', new File([await grab(root.querySelector('.ad-reel--new video, .ad-reel--new img'))], 'cover.jpg', { type: 'image/jpeg' }));
            const c = await BA.api('/admin/media', { method: 'POST', body });
            await save([{ code: draft.code, cover: c.url, caption: root.querySelector('[data-cap]').value }, ...items]);
            BA.toast(L('A reel felkerült.', 'Reel added.')); reset();
          } catch (err) { BA.fail(err); btn.disabled = false; }
          return;
        }
        const li = e.target.closest('[data-i]'); if (!li) return;
        const i = Number(li.dataset.i), mv = e.target.closest('[data-mv]');
        if (mv) {
          const j = i + Number(mv.dataset.mv), next = [...items]; [next[i], next[j]] = [next[j], next[i]];
          try { await save(next); } catch (err) { BA.fail(err); }
          return draw();
        }
        if (e.target.closest('[data-del]') && confirm(L('Törlöd ezt a reelt az oldalról?', 'Remove this reel from the site?'))) {
          const gone = items[i];
          try { await save(items.filter((_, j) => j !== i)); } catch (err) { BA.fail(err); return; }
          BA.api(`/admin/media/${gone.cover.split('/').pop()}`, { method: 'DELETE' }).catch(() => {});
          draw();
        }
      };
      root.innerHTML = BA.loading();
      try { items = (await BA.api('/admin/reels')).items; draw(); } catch (e) { BA.fail(e); root.innerHTML = ''; }
    },
  });
})();
