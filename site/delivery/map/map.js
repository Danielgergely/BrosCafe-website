// Bros Delivery: the 3D zone map ("Hova visszük?"). Loaded by delivery.js only when the block is on screen.
// Everything is self-hosted: MapLibre in /shared/vendor, the buildings in zone.json (worker/scripts/build_zone_map.py).
// Green = a whole street block we deliver to (the same outline the server's address check uses), grey = outside.
// Tapping a building with an address offers it to the order form ("dl:pick"); a checked address flies the map to it ("dl:checked").
// DLZoneMap.mount(el, { cooperative }) -> Promise<map>: one map per container (delivery.js: the zone block and the address picker).
(() => {
  const B = window.BROS, t = B.t, { esc } = B.shell, ml = window.maplibregl;
  if (!ml) return;
  const css = getComputedStyle(document.documentElement), v = (n, d) => css.getPropertyValue(n).trim() || d;
  const C = { ground: v('--ivory', '#F3EBDD'), water: '#BFD0D3', park: '#DEDFCB', street: '#FFFDF8', zone: v('--olive', '#68704B'), inB: '#8C9765', outB: '#D3CDC1', sel: v('--champagne', '#C6A875') };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const zoneBounds = (fc) => { const pts = JSON.stringify(fc).match(/-?\d+\.\d+,-?\d+\.\d+/g).map((x) => x.split(',').map(Number)); return [[Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]]; };

  let data = null;
  const load = () => (data ||= fetch('/delivery/map/zone.json').then((r) => { if (!r.ok) throw new Error('zone'); return r.json(); }));
  const mount = (root, opts = {}) => load().then((d) => draw(root, structuredClone(d), opts));
  window.DLZoneMap = { mount };

  function draw(root, d, { cooperative = false } = {}) {
    const byAddr = new Map();
    d.buildings.features.forEach((f, i) => { f.id = i; if (f.properties.a) byAddr.set(norm(f.properties.a), f); });
    const map = new ml.Map({
      container: root, center: d.cafe, zoom: 15, pitch: 50, bearing: -18, minZoom: 13.4, maxZoom: 18.5, maxPitch: 70,
      maxBounds: [[d.cafe[0] - 0.045, d.cafe[1] - 0.03], [d.cafe[0] + 0.045, d.cafe[1] + 0.03]],
      cooperativeGestures: cooperative, attributionControl: false, fadeDuration: 0,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': t('A térkép mozgatásához használd a Ctrl + görgetést'),
        'CooperativeGesturesHandler.MacHelpText': t('A térkép mozgatásához használd a ⌘ + görgetést'),
        'CooperativeGesturesHandler.MobileHelpText': t('Két ujjal mozgathatod a térképet'),
        'NavigationControl.ZoomIn': t('Nagyítás'), 'NavigationControl.ZoomOut': t('Kicsinyítés'), 'NavigationControl.ResetBearing': t('Észak felé'),
      },
      style: {
        version: 8,
        sources: {
          water: { type: 'geojson', data: d.water }, parks: { type: 'geojson', data: d.parks }, streets: { type: 'geojson', data: d.streets },
          zone: { type: 'geojson', data: d.zone }, buildings: { type: 'geojson', data: d.buildings },
        },
        layers: [
          { id: 'ground', type: 'background', paint: { 'background-color': C.ground } },
          { id: 'zone', type: 'fill', source: 'zone', paint: { 'fill-color': C.zone, 'fill-opacity': 0.1 } },
          { id: 'parks', type: 'fill', source: 'parks', paint: { 'fill-color': C.park } },
          { id: 'water', type: 'fill', source: 'water', paint: { 'fill-color': C.water } },
          { id: 'streets', type: 'line', source: 'streets', layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': C.street, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, ['case', ['==', ['get', 'k'], 1], 3, 1.2], 18, ['case', ['==', ['get', 'k'], 1], 26, 12]] } },
          { id: 'zone-edge', type: 'line', source: 'zone', paint: { 'line-color': C.zone, 'line-width': 1.6, 'line-dasharray': [3, 2] } },
          { id: 'buildings', type: 'fill-extrusion', source: 'buildings',
            paint: {
              'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'sel'], false], C.sel, ['==', ['get', 'z'], 1], C.inB, C.outB],
              'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.94, 'fill-extrusion-vertical-gradient': true,
            } },
        ],
      },
    });
    // the whole zone in view: fitted flat, then a little further out so the tilted near corners still fit
    const narrow = root.clientWidth < 600, cam = map.cameraForBounds(zoneBounds(d.zone), { padding: narrow ? 16 : 30 });
    if (cam) map.jumpTo({ center: cam.center, zoom: cam.zoom - (narrow ? 0.45 : 0.1), bearing: -18, pitch: narrow ? 45 : 50 });
    map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ml.AttributionControl({ compact: false, customAttribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }), 'bottom-right');

    const marker = (cls, html, lngLat) => { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(map); return el; };
    marker('dl-map3d__cafe', `<span>Bros Cafe</span>`, d.cafe);
    d.landmarks.forEach((m) => marker(`dl-map3d__lm${m.z ? '' : ' is-out'}`, esc(t(m.label)), [m.lon, m.lat]));
    d.labels.forEach((m) => marker('dl-map3d__label', esc(t(m.label)), [m.lon, m.lat]));

    let sel = null;
    const popup = new ml.Popup({ closeButton: true, maxWidth: '260px', className: 'dl-map3d__pop', focusAfterOpen: true });
    popup.on('close', () => select(null));
    function select(f) {
      if (sel != null) map.setFeatureState({ source: 'buildings', id: sel }, { sel: false });
      sel = f ? f.id : null;
      if (f) map.setFeatureState({ source: 'buildings', id: sel }, { sel: true });
    }
    function show(f, lngLat) {
      const p = f.properties, inZone = p.z === 1, title = p.a || p.n || (inZone ? t('Épület a körzetben') : t('Épület a körzeten kívül'));
      select(f);
      popup.setLngLat(lngLat).setHTML(`<p class="dl-map3d__pt">${esc(title)}</p>
        <p class="dl-map3d__ps" data-s="${inZone ? 'in' : 'out'}">${inZone ? t('Ide szállítunk.') : t('Ez már kívül esik a körzeten, de elvitelre kérheted.')}</p>
        ${inZone && p.a ? `<button type="button" class="btn dl-map3d__pick" data-pick="${esc(p.a)}">${t('Ide kérem')}</button>`
          : inZone ? `<p class="dl-map3d__ps">${t('Ennek az épületnek nincs címe a térképen: írd be kézzel.')}</p>`
          : `<button type="button" class="btn btn--ghost dl-map3d__pick" data-pickup>${t('Elvitelre kérem')}</button>`}`).addTo(map);
    }
    map.on('click', 'buildings', (e) => { if (e.features[0]) show(e.features[0], e.lngLat); });
    map.on('mouseenter', 'buildings', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'buildings', () => { map.getCanvas().style.cursor = ''; });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick], [data-pickup]'); if (!b) return;
      document.dispatchEvent(new CustomEvent('dl:pick', { detail: b.dataset.pick != null ? { address: b.dataset.pick, inZone: true } : { pickup: true } }));
      popup.remove();
    });
    // an address checked in a form: show that building
    document.addEventListener('dl:checked', (e) => {
      const f = byAddr.get(norm(e.detail.address || '')); if (!f) return;
      const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
      const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
      popup.remove(); map[calm ? 'jumpTo' : 'flyTo']({ center: c, zoom: 16.6, pitch: 55 }); select(f);
    });
    map.once('load', () => { root.dataset.state = 'ready'; });
    return map;
  }
  // "Váci u. 12B" and "Váci utca 12/b" are the same house
  function norm(s) {
    return s.toLocaleLowerCase('hu').replace(/\s+/g, ' ').trim().replace(/\bu\.(?=\s|$)/g, 'utca').replace(/\bkrt\.(?=\s|$)/g, 'körút').replace(/(\d+)\s*\/?\s*([a-z])\b/g, '$1/$2').replace(/[.,]+$/, '');
  }
})();
