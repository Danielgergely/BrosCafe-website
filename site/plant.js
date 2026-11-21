// Bros Cafe — the coffee plant (docs/ideas.md §2): one SVG from the plant the API sends (/customer/me → plant).
// Height, nodes and branches follow growth continuously, so every coffee shows; colours are CSS tokens (customer.css).
(() => {
  const W = 240, BASE = 248;
  // growth → stem height (px), matched to the stage thresholds 1/5/15/35/70/140/280/500
  const HEIGHTS = [[0, 0], [1, 5], [5, 24], [15, 46], [35, 72], [70, 98], [140, 124], [280, 146], [500, 164]];
  const f1 = (n) => Math.round(n * 10) / 10;

  function heightOf(g, flushes) {
    if (g >= 500) return 164 + Math.min(14, flushes * 1.5);
    for (let i = 1; i < HEIGHTS.length; i++) {
      const [g1, h1] = HEIGHTS[i], [g0, h0] = HEIGHTS[i - 1];
      if (g <= g1) return h0 + ((g - g0) / (g1 - g0)) * (h1 - h0);
    }
    return 164;
  }

  // a small deterministic PRNG per member, so each plant has its own lean and leaf angles
  function rng(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }

  const leaf = (x, y, len, ang, cls = 'lf') => {
    const w = len * 0.36;
    return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(ang)})"><path class="${cls}" d="M0 0C${f1(len * .28)} ${f1(-w)} ${f1(len * .74)} ${f1(-w * .82)} ${f1(len)} 0C${f1(len * .74)} ${f1(w * .82)} ${f1(len * .28)} ${f1(w)} 0 0Z"/><path class="rib" d="M${f1(len * .08)} 0L${f1(len * .86)} 0"/></g>`;
  };
  const flower = (x, y, r = 2.6) => `<g class="fl" transform="translate(${f1(x)} ${f1(y)})">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="${r}" ry="${f1(r * .45)}" cx="${f1(r)}" transform="rotate(${a})"/>`).join('')}<circle class="fl__c" r="${f1(r * .4)}"/></g>`;
  const cherries = (x, y, cls) => `<g class="ch ${cls}">${[[-2.4, 0], [2.4, .4], [0, 3.4]].map(([dx, dy]) => `<circle cx="${f1(x + dx)}" cy="${f1(y + dy)}" r="2.9"/>`).join('')}</g>`;

  // a point and the direction on a quadratic stem
  const onCurve = (p0, c, p1, t) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y,
  });

  /** plant: the API's plant object; m: the member (code, stamps, stamps_required, reward_ready). */
  function svg(plant, m) {
    const g = plant.growth || 0, stage = plant.stage || 0, state = plant.state || 'ok';
    const rand = rng(m.code || 'bros');
    const level = Math.min(4, 1 + Math.floor(g / 250));
    const potH = 44 + (level - 1) * 8, potTop = 84 + (level - 1) * 14, potBot = potTop * 0.7;
    const rimY = BASE - potH, soilY = rimY + 7, cx = W / 2;
    const dead = state === 'dead';
    const droop = { ok: 0, seed: 0, droopy: 34, wilted: 62, dead: 0 }[state] ?? 0;
    const leafCls = state === 'wilted' ? 'lf lf--dry' : state === 'droopy' ? 'lf lf--pale' : 'lf';
    let H = Math.min(heightOf(g, plant.flushes || 0), soilY - 12);
    if (dead) H = Math.min(H * 0.55, 70);
    const lean = (rand() - 0.5) * 14 + (state === 'wilted' ? 10 : 0);
    const p0 = { x: cx, y: soilY }, p1 = { x: cx + lean, y: soilY - H }, c = { x: cx - lean * 0.5, y: soilY - H * 0.5 };
    const back = [], front = [], fruit = [], onTop = [];

    // where flowers and cherries sit: leaf axils, filled in as the stamps grow (the free coffee is the harvest)
    const sites = [];

    if (g > 0 && !dead) {
      if (stage <= 1) {
        // the bean cracking, with a tiny hook
        onTop.push(`<g transform="translate(${cx} ${soilY - 1}) rotate(-18)"><ellipse class="bean" rx="7.5" ry="5"/><path class="bean__line" d="M-6 .4C-2-1.6 2 2.2 6-.2"/></g>`);
        if (g >= 3) onTop.push(`<path class="stem" d="M${cx + 3} ${soilY - 5}c1-4 4-6 7-5"/>`);
      } else {
        const stemW = stage < 4 ? 2.2 : f1(Math.min(7.5, 2.4 + (g - 35) / 70));
        back.push(`<path class="stem${stage >= 7 ? ' stem--wood' : ''}" stroke-width="${stemW}" d="M${p0.x} ${p0.y}Q${f1(c.x)} ${f1(c.y)} ${f1(p1.x)} ${f1(p1.y)}"/>`);
        if (stage === 2) {
          // sprout: two round seed leaves
          front.push(leaf(p1.x, p1.y, 11, -30 + droop, leafCls), `<g transform="translate(${f1(p1.x)} ${f1(p1.y)}) scale(-1 1)">${leaf(0, 0, 11, -30 + droop, leafCls)}</g>`);
        } else {
          const step = 15, nodes = Math.max(1, Math.floor((H - 10) / step));
          for (let i = 0; i < nodes; i++) {
            const t = (10 + i * step) / H, age = nodes - 1 - i, at = onCurve(p0, c, p1, t);
            const fore = i % 2 ? 0.62 : 1; // opposite pairs, every other pair turned towards us
            const len = Math.min(stage >= 4 ? 30 : 22, 9 + age * 3.2) * fore;
            for (const side of [1, -1]) {
              const ang = -28 + (rand() - 0.5) * 16 + droop + age * 2;
              const L = `<g transform="translate(${f1(at.x)} ${f1(at.y)}) scale(${side} 1)">${leaf(0, 0, len, ang, leafCls)}</g>`;
              (fore < 1 ? back : front).push(L);
              // branches from stage 4 (young bush), longer the older the node
              if (stage >= 4 && age >= 2) {
                const bl = Math.min(98, (age - 1) * 8 * fore * (1 + (plant.flushes || 0) * 0.02));
                const a = ((Math.min(4, -30 + age * 2.5) + (rand() - 0.5) * 8 + droop * 0.6) * Math.PI) / 180;
                const ex = at.x + side * Math.cos(a) * bl, ey = at.y + Math.sin(a) * bl;
                back.push(`<path class="stem stem--br${stage >= 7 ? ' stem--wood' : ''}" stroke-width="${f1(Math.max(1.4, stemW * 0.45))}" d="M${f1(at.x)} ${f1(at.y)}Q${f1(at.x + side * bl * 0.55)} ${f1(at.y - bl * 0.15)} ${f1(ex)} ${f1(ey)}"/>`);
                const pairs = Math.max(1, Math.floor(bl / 15));
                for (let k = 1; k <= pairs; k++) {
                  const bt = k / pairs, bx = at.x + (ex - at.x) * bt, by = at.y + (ey - at.y) * bt - Math.sin(bt * Math.PI) * bl * 0.08;
                  const bLen = Math.min(26, 8 + (pairs - k) * 4 + 6);
                  front.push(`<g transform="translate(${f1(bx)} ${f1(by)}) scale(${side} 1)">${leaf(0, 0, bLen, -24 + droop + (rand() - 0.5) * 14, leafCls)}${leaf(0, 0, bLen * 0.8, 38 + droop * 0.5 + (rand() - 0.5) * 14, leafCls)}</g>`);
                  if (k < pairs || pairs === 1) sites.push({ x: bx, y: by + 4 });
                }
              }
            }
            if (age >= 1) sites.push({ x: at.x + (i % 2 ? -4 : 4), y: at.y + 3 });
          }
          // the growing tip
          front.push(`<g transform="translate(${f1(p1.x)} ${f1(p1.y)})">${leaf(0, 0, 8, -70 + droop, leafCls)}<g transform="scale(-1 1)">${leaf(0, 0, 8, -70 + droop, leafCls)}</g></g>`);
        }
      }

      // flowers from stage 5; cherries from 6, ripening with the stamps on the card
      if (stage >= 5 && state !== 'wilted' && sites.length) {
        const want = { 5: 5, 6: 6, 7: 9, 8: 12 }[stage] + Math.min(8, plant.flushes || 0);
        const picked = sites.filter((_, i) => i % 2 === 0).concat(sites.filter((_, i) => i % 2)).slice(0, want);
        const req = m.stamps_required || 10, p = m.reward_ready ? 1 : Math.min(1, (m.stamps || 0) / req);
        picked.forEach((s, k) => {
          if (stage === 5) return fruit.push(flower(s.x, s.y));
          const t = (k + 1) / picked.length;
          fruit.push(p >= t ? cherries(s.x, s.y, 'ch--ripe') : p >= t - 0.5 ? cherries(s.x, s.y, 'ch--green') : flower(s.x, s.y));
        });
      }
    }

    if (dead) {
      // a dry stick with two stubs
      const top = onCurve(p0, c, p1, 0.6);
      back.push(`<path class="stem stem--dry" stroke-width="3" d="M${p0.x} ${p0.y}Q${f1(c.x)} ${f1(c.y)} ${f1(p1.x)} ${f1(p1.y)}"/>`,
        `<path class="stem stem--dry" stroke-width="2" d="M${f1(top.x)} ${f1(top.y)}l12-10M${f1(top.x)} ${f1(top.y + 12)}l-10-7"/>`,
        `<path class="lf lf--dry" d="M${cx - 18} ${soilY - 1}c4-5 9-5 12-1c-4 2-8 2-12 1Z"/>`);
    }

    const pot = `<path class="pot" d="M${cx - potTop / 2} ${rimY + 9}L${cx - potBot / 2} ${BASE}H${cx + potBot / 2}L${cx + potTop / 2} ${rimY + 9}Z"/>`
      + `<rect class="pot__rim" x="${cx - potTop / 2 - 5}" y="${rimY}" width="${potTop + 10}" height="12" rx="3"/>`
      + `<ellipse class="soil" cx="${cx}" cy="${soilY}" rx="${potTop / 2 - 2}" ry="4.5"/>`
      + (level > 1 ? `<path class="pot__band" d="M${cx - potTop / 2 + 4} ${rimY + 22}H${cx + potTop / 2 - 4}"/>` : '');
    const drops = `<g class="drops" aria-hidden="true">${[-14, 0, 13].map((dx, i) => `<path style="--i:${i}" d="M${cx + dx} ${f1(soilY - H - 18)}c-3 5-4 7-4 9a4 4 0 0 0 8 0c0-2-1-4-4-9Z"/>`).join('')}</g>`;

    const vbH = Math.max(150, BASE + 6 - (soilY - H - 22)), vbW = Math.min(W, vbH * 0.96);
    return `<svg class="plant-svg plant-svg--${state}" viewBox="${f1((W - vbW) / 2)} ${f1(BASE + 6 - vbH)} ${f1(vbW)} ${f1(vbH)}" role="img" aria-hidden="true" style="--ox:${cx}px;--oy:${soilY}px;--fall:${f1(H + 10)}px">`
      + `<ellipse class="pot__shadow" cx="${cx}" cy="${BASE}" rx="${potBot / 2 + 16}" ry="3.5"/>`
      + `<g class="plant-svg__sway">${back.join('')}${front.join('')}${fruit.join('')}</g>${pot}${onTop.join('')}${drops}</svg>`;
  }

  window.BROS_PLANT = { svg };
})();
