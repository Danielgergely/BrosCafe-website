// Bros Cafe · admin: live sales (today against the forecast and the break-even line, self-scoring, unusual days,
// Instagram posts, week, month). One screen: six figures on top, today on the left with the past days in pages,
// the rest in a side column. Styles: admin-live.css (.lv). Same endpoints as LiveSalesPanel.jsx: GET /admin/live-sales, PUT/DELETE
// /admin/live-sales/unusual/{day} and /posts/{day}.
(() => {
  const BA = window.BA; const { T, esc, ft, k, signed, progress } = BA;
  const CPS = ['9', '12', '15'];

  // WMO weather codes, roughly: 0-1 clear, 2 partly cloudy, 3 overcast, 45-48 fog, 51-67 and 80-82 rain, 71-77 and 85-86 snow, 95+ storm.
  const wIcon = (c) => (c == null ? '' : c >= 95 ? '⛈️' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? '🌨️' : c >= 51 ? '🌧️' : c >= 45 ? '🌫️' : c === 3 ? '☁️' : c === 2 ? '⛅' : '☀️');
  const weather = (w) => (w ? `<span title="${esc(T('admin.live.weather'))}">${wIcon(w.code)} ${Math.round(w.temp)}°<span class="ad-muted"> · ${esc(w.rain_mm > 0 ? T('admin.live.rain', { mm: w.rain_mm }) : T('admin.live.dry'))}</span></span>` : '');
  const PAYDAY_DAYS = 3;
  function context(ctx, w) {
    const out = [];
    if (ctx && ctx.school_break) out.push(['🎒', T(`admin.live.schoolBreak.${ctx.school_break}`)]);
    if (ctx && ctx.days_since_payday === 0) out.push(['💰', T('admin.live.payday')]);
    else if (ctx && ctx.days_since_payday <= PAYDAY_DAYS) out.push(['💰', T('admin.live.afterPayday', { n: ctx.days_since_payday })]);
    if (w && w.sunset) out.push(['🌇', T('admin.live.sunset', { time: w.sunset })]);
    return out;
  }
  const dayName = (d) => (BA.lang === 'hu' ? d && d.name_hu : d && d.name) || (d && d.name) || '';
  const change = (pct) => (pct == null ? '' : `<span class="${pct >= 0 ? 'ad-pos' : 'ad-neg'}">${pct >= 0 ? '▲' : '▼'} ${esc(signed(pct))}</span>`);
  const kpi = (label, value, sub) => `<div class="lv-kpi"><span class="lv-kpi__l">${esc(label)}</span><b class="lv-kpi__v">${value}</b>${sub ? `<span class="lv-kpi__s">${sub}</span>` : ''}</div>`;
  const explain = (text) => `<details class="lv-how"><summary>${esc(T('admin.live.explain'))}</summary><p class="ad-small">${text}</p></details>`;
  const head = (title, extra) => `<div class="lv-head"><h3 class="ad-card__t">${esc(title)}</h3>${extra || ''}</div>`;
  /** Previous / next with "1–7 / 30". Page 0 is the newest. The ends stay focusable (aria-disabled), so the keyboard focus never drops. */
  const pager = (key, page, size, total) => {
    if (total <= size) return '';
    const last = Math.ceil(total / size) - 1;
    const btn = (step, off, label, sign) => `<button type="button" class="lv-pg" data-pg="${key}:${step}" aria-disabled="${off ? 'true' : 'false'}" aria-label="${esc(T(label))}" title="${esc(T(label))}">${sign}</button>`;
    return `<div class="lv-pager" role="group" aria-label="${esc(T('admin.live.pages'))}">${btn(-1, page <= 0, 'admin.live.prevPage', '‹')}<span class="lv-pager__n ad-num" aria-live="polite">${page * size + 1}–${Math.min((page + 1) * size, total)} / ${total}</span>${btn(1, page >= last, 'admin.live.nextPage', '›')}</div>`;
  };
  const errCls = (p) => (p == null ? 'ad-muted' : Math.abs(p) <= 5 ? 'ad-err-ok' : Math.abs(p) <= 15 ? 'ad-err-mid' : 'ad-err-bad');

  function hourRows(s) {
    const hours = [...Object.keys(s.hours || {}), ...Object.keys(s.average_hours || {})].map(Number);
    if (!hours.length) return null;
    const rows = [];
    for (let h = Math.min(...hours); h <= Math.max(...hours); h += 1) rows.push({ h, today: (s.hours || {})[h] ?? null, usual: (s.average_hours || {})[h] ?? null });
    return rows;
  }

  function drawHours(el, s) {
    const rows = hourRows(s); const now = BA.hourBudapest(s.updated_at);
    BA.chart(el, (w) => BA.cartesian(w, {
      h: 210, xs: rows.map((r) => r.h),
      bars: [{ v: rows.map((r) => r.today), cell: (i) => (rows[i].h === now ? 'now' : (rows[i].today ?? 0) >= (rows[i].usual ?? 0) ? '' : 'soft') }],
      lines: [{ v: rows.map((r) => r.usual), cls: 'usual', dots: true }],
      tip: (i) => `${rows[i].h}:00–${rows[i].h + 1}:00\n${T('admin.live.series.today')}: ${ft(rows[i].today ?? 0)}\n${T('admin.live.series.usual')}: ${ft(rows[i].usual ?? 0)}`,
    }));
  }

  /** The running total against an ordinary day, the forecast for the close and the break-even line. */
  function drawCumulative(el, s) {
    const rows = hourRows(s); const now = BA.hourBudapest(s.updated_at);
    let a = 0; let b = 0;
    const today = []; const usual = [];
    rows.forEach((r) => { a += r.today || 0; b += r.usual || 0; today.push(r.h <= now || r.today != null ? a : null); usual.push(b); });
    let last = -1; today.forEach((v, i) => { if (v != null) last = i; });
    const fc = rows.map(() => null);
    if (s.forecast && last >= 0 && last < rows.length - 1) {
      const from = today[last]; const to = s.forecast.value; const span = rows.length - 1 - last;
      for (let i = last; i < rows.length; i += 1) fc[i] = from + ((to - from) * (i - last)) / span;
    }
    BA.chart(el, (w) => BA.cartesian(w, {
      h: 210, xs: rows.map((r) => r.h), lines: [{ v: usual, cls: 'usual' }, { v: fc, cls: 'fc' }, { v: today, cls: '', dots: true }],
      hline: s.target ? { v: s.target, label: `${T('x.breakEvenLine')} ${ft(s.target)}` } : undefined,
      tip: (i) => `${rows[i].h}:00–${rows[i].h + 1}:00\n${T('admin.live.series.today')}: ${today[i] == null ? '–' : ft(today[i])}\n${T('admin.live.series.usual')}: ${ft(usual[i])}`,
    }));
  }

  function forecastToday(s) {
    const { checkpoints } = s;
    return `<div class="ad-cps lv-cps">${CPS.map((cp) => { const c = (checkpoints || {})[cp];
        return `<div class="ad-cp"><small>${cp}:00</small>${c ? `<b>${k(c.value)}</b><small>${k(c.low)}–${k(c.high)}</small>${c.late ? `<small class="ad-neg">${esc(T('admin.live.late'))}</small>` : ''}` : `<small>${esc(T('admin.live.notYet'))}</small>`}</div>`; }).join('')}</div>`;
  }

  function products(s) {
    if (!s.products || !s.products.length) return `<p class="ad-muted">${esc(T('admin.live.noSalesYet'))}</p>`;
    return `<ol class="ad-list lv-list">${s.products.map((p, i) => `<li><span><span class="ad-muted">${i + 1}.</span> ${esc(p.name)}</span><span class="ad-num"><b>${s.products_estimated ? '≈ ' : ''}${esc(ft(p.gross))}</b> <span class="ad-small">${esc(T('admin.live.sold', { n: p.count }))}${s.total ? ` · ${Math.round((p.gross / s.total) * 100)}%` : ''}</span></span></li>`).join('')}</ol>
      ${s.products_estimated ? explain(esc(T('admin.live.productsEstimated'))) : ''}`;
  }

  const accuracy = (acc) => `<div class="lv-acc">${CPS.map((cp) => { const a = (acc || {})[cp] || {};
    return `<div><small>${cp}:00</small><b>±${a.mean_abs_error ?? '–'}%</b><span class="ad-small">${esc(T('admin.live.withinRange', { n: a.within_range, of: a.days }))}<br>${esc(T('admin.live.lastWeek', { pct: a.last_week_abs_error ?? '–' }))}</span></div>`; }).join('')}</div>`;

  /** One page of the past days: the forecast error per checkpoint, weather, and the two marks (post, unusual). */
  function days(hist, page, size) {
    const flagBtn = (attr, date, on, label, sign) => `<button type="button" class="ad-ib" data-${attr}="${esc(date)}" data-on="${on ? 1 : 0}" aria-pressed="${on ? 'true' : 'false'}" title="${esc(T(label))}" aria-label="${esc(T(label))}">${sign}</button>`;
    const rows = hist.slice(page * size, (page + 1) * size).map((row) => {
      const kind = (row.day && row.day.kind) || 'normal'; const name = dayName(row.day);
      const ctx = context(row.context, null).map(([i, tx]) => `<span title="${esc(tx)}">${i}</span>`).join(' ');
      const w = row.weather;
      return `<tr class="${kind === 'normal' ? '' : 'is-off'}"><td><div class="lv-day"><span class="lv-day__d">${esc(BA.shortDay(row.date))}${row.replayed ? '<span class="ad-muted">*</span>' : ''}</span>${w ? `<span class="lv-day__w" title="${esc(w.rain_mm > 0 ? T('admin.live.rain', { mm: w.rain_mm }) : T('admin.live.dry'))}">${wIcon(w.code)} ${Math.round(w.temp)}°</span>` : ''}${ctx ? `<span>${ctx}</span>` : ''}${kind !== 'normal' ? `<span class="ad-small">${esc(T(`admin.live.dayKind.${kind}`))}${name ? `: ${esc(name)}` : ''}</span>` : ''}</div></td>
        <td class="r ad-num">${k(row.actual)}</td>
        ${CPS.map((cp) => { const c = (row.checkpoints || {})[cp]; return `<td class="cp ${errCls(c && c.error_pct)}" title="${c ? esc(`${ft(c.value)} (${ft(c.low)}–${ft(c.high)})`) : ''}">${c ? esc(signed(c.error_pct, 0)) : '–'}</td>`; }).join('')}
        <td class="lv-wx ad-small">${weather(w)}</td>
        <td class="lv-marks">${flagBtn('post', row.date, row.posted, row.posted ? 'admin.live.unmarkPost' : 'admin.live.posted', '📷')}${kind === 'normal' || kind === 'unusual' ? flagBtn('flag', row.date, kind === 'unusual', kind === 'unusual' ? 'admin.live.unmarkUnusual' : 'admin.live.markUnusual', '⚑') : ''}</td></tr>`;
    }).join('');
    return `<div class="lv-tw" style="--rows:${Math.min(size, hist.length)}"><table class="ad-t lv-t"><thead><tr><th>${esc(T('admin.live.day'))}</th><th class="r">${esc(T('admin.live.actual'))}</th>${CPS.map((c) => `<th class="r">${c}:00</th>`).join('')}<th class="lv-wx">${esc(T('admin.live.weather'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="lv-foot">${explain(`${esc(T('admin.live.replayedNote'))} ${esc(T('admin.live.notScored'))}`)}${pager('days', page, size, hist.length)}</div>`;
  }

  function posts(data, page, size) {
    const p = data.posts || { posts: [] };
    if (!p.posts.length) return `<p class="ad-muted">${esc(T('admin.live.postsEmpty'))}</p>`;
    return `${p.average_lift_pct != null ? `<p class="lv-lift"><b>${esc(T('admin.live.averageLift', { pct: signed(p.average_lift_pct) }))}</b> <span class="ad-small">${esc(T('admin.live.averageLiftNote', { n: p.finished }))}</span></p>` : ''}
      <ol class="ad-list lv-list">${p.posts.slice(page * size, (page + 1) * size).map((x) => `<li><span><span class="ad-muted">${esc(BA.shortDay(x.date))}${x.time ? ` ${esc(x.time)}` : ''}</span> ${esc(x.note)}</span>
        <span class="ad-num" title="${x.lift_pct != null ? esc(`${ft(x.actual)} / ${ft(x.expected)}`) : ''}">${x.lift_pct == null ? `<span class="ad-small">${esc(T('admin.live.notMeasurable'))}</span>` : `${change(x.lift_pct)}${x.provisional ? ` <span class="ad-small">${esc(T('admin.live.provisional'))}</span>` : ''}`}</span></li>`).join('')}</ol>
      <div class="lv-foot">${explain(esc(T('admin.live.postsHow')))}${pager('posts', page, size, p.posts.length)}</div>`;
  }

  function drawWeek(el, s) {
    const days = s.week.days;
    const xs = days.map((d) => BA.shortDay(d.date, { weekday: 'short' }));
    BA.chart(el, (w) => BA.cartesian(w, {
      h: 150, xs, bars: [{ v: days.map((d) => d.last_week), cls: 'soft' }, { v: days.map((d) => d.total) }],
      tip: (i) => `${xs[i]}\n${T('admin.live.series.thisWeek')}: ${ft(days[i].total)}\n${T('admin.live.series.lastWeek')}: ${ft(days[i].last_week)}`,
    }));
  }

  function month(s) {
    const m = s.month; if (!m || !m.target) return `<p class="ad-muted">–</p>`;
    const ahead = m.total - m.target_to_date;
    return `<p class="lv-month ad-num"><b>${esc(ft(m.total))}</b> <span class="ad-muted">/ ${esc(ft(m.target))}</span></p>${progress(m.total / m.target)}
      <p class="${ahead >= 0 ? 'ad-pos' : 'ad-neg'}">${esc(ahead >= 0 ? T('admin.live.aheadOfBreakEven', { amount: ft(ahead), days: m.open_days }) : T('admin.live.behindBreakEven', { amount: ft(-ahead), days: m.open_days }))}</p>
      <p class="ad-small">${esc(T('admin.live.monthAverage', { amount: ft(m.average_day) }))}</p>`;
  }

  const WIDE = 900; // the tab's own width from which the side column sits beside the table
  const POSTS_PER_PAGE = 5;

  BA.tab('live', {
    icon: '⚡',
    async render(root) {
      let busy = false; let error = null; let data = null;
      let view = 'hours'; let dayPage = 0; let postPage = 0;
      const wide = () => root.clientWidth >= WIDE;
      let perPage = wide() ? 10 : 7;
      const clamp = (page, size, total) => Math.max(0, Math.min(page, Math.ceil(total / size) - 1));

      /** Redraw, and put the keyboard focus back on the same control if it was inside. */
      const keep = (fn) => {
        const el = document.activeElement;
        const q = el && root.contains(el) ? ['pg', 'act', 'post', 'flag', 'view'].filter((key) => el.dataset[key] != null).map((key) => `[data-${key}="${el.dataset[key]}"]`).join('') : '';
        fn();
        const next = q && root.querySelector(q);
        if (next) next.focus({ preventScroll: true });
      };
      /** The new page comes in from the side it was asked from; a plain swap with reduced motion. */
      const slideIn = (el, dir) => {
        if (!el || !el.animate || !dir || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        el.animate([{ opacity: 0, transform: `translateX(${dir * 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      };

      const paintChart = () => {
        const el = root.querySelector('#lv-chart'); if (!el) return;
        const s = data.summary; const cum = view === 'cum';
        el.innerHTML = '<div></div>';
        (cum ? drawCumulative : drawHours)(el.firstChild, s);
        root.querySelector('#lv-legend').innerHTML = cum
          ? `<span><i class="dash"></i>${esc(T('admin.live.series.usual'))}</span><span><i></i>${esc(T('admin.live.series.today'))}</span>${s.target ? `<span><i class="red"></i>${esc(T('x.breakEvenLine'))}</span>` : ''}`
          : `<span><i></i>${esc(T('admin.live.series.today'))}</span><span><i class="dash"></i>${esc(T('admin.live.series.usual'))}</span>`;
        root.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'));
      };
      const paintDays = (dir) => {
        const hist = data.forecast_history || [];
        dayPage = clamp(dayPage, perPage, hist.length);
        keep(() => { root.querySelector('#lv-days').innerHTML = days(hist, dayPage, perPage); });
        slideIn(root.querySelector('#lv-days table'), dir);
      };
      const paintPosts = (dir) => {
        postPage = clamp(postPage, POSTS_PER_PAGE, ((data.posts && data.posts.posts) || []).length);
        keep(() => { root.querySelector('#lv-posts').innerHTML = posts(data, postPage, POSTS_PER_PAGE); });
        slideIn(root.querySelector('#lv-posts ol'), dir);
      };

      const draw = () => keep(() => {
        const s = data.summary; const reached = Boolean(s.target_reached_at);
        const postedToday = ((data.posts && data.posts.posts) || []).some((p) => p.date === s.date);
        const kind = (s.day && s.day.kind) || 'normal';
        const hasHours = hourRows(s); const m = s.month;
        const off = busy ? 'disabled' : '';
        root.innerHTML = `<div class="ad-panel lv" data-testid="live-panel">
          <div class="lv-bar">
            <div class="ad-ctx"><span class="lv-fresh"><button type="button" class="lv-pg" data-act="refresh" ${off} aria-label="${esc(T('admin.live.refresh'))}" title="${esc(T('admin.live.refresh'))}">↻</button>${esc(T('admin.live.updated', { time: BA.clock(s.updated_at) }))}</span>${weather(s.weather)}${context(s.context, s.weather).map(([i, tx]) => `<span>${i} ${esc(tx)}</span>`).join('')}
              ${data.refresh_failed ? `<span class="ad-neg">${esc(T('admin.live.refreshFailed'))}</span>` : ''}${error ? `<span class="ad-neg">${esc(error)}</span>` : ''}</div>
            <div class="ad-row">
              <button type="button" class="ad-btn ad-btn--ghost ${postedToday ? 'ad-btn--on' : ''}" data-act="post-today" data-on="${postedToday ? 1 : 0}" ${off}>📷 ${esc(T(postedToday ? 'admin.live.posted' : 'admin.live.markPost'))}</button>
              ${kind === 'normal' ? `<button type="button" class="ad-btn ad-btn--ghost" data-act="flag-today" ${off}>⚑ ${esc(T('admin.live.markUnusual'))}</button>` : ''}
            </div></div>
          ${kind !== 'normal' ? `<div class="ad-banner"><p><b>${esc(T(`admin.live.dayKind.${kind}`))}${dayName(s.day) ? `: ${esc(dayName(s.day))}` : ''}</b> <span class="ad-muted">${esc(T(`admin.live.dayNote.${kind}`))}</span></p>${kind === 'unusual' ? `<button type="button" class="link" data-flag="${esc(s.date)}" data-on="1">${esc(T('admin.live.unmarkUnusual'))}</button>` : ''}</div>` : ''}
          <div class="lv-kpis">
            ${kpi(T('admin.live.today'), esc(ft(s.total)), `${change(s.diff_pct)} ${esc(T(`admin.live.vsBasis.${(s.day && s.day.basis) || 'weekday'}`, { n: s.compared_days }))}${s.record_ever || s.record_weekday ? ` <b class="ad-pos">🏆 ${esc(T(s.record_ever ? 'admin.live.recordEver' : 'admin.live.recordWeekday'))}</b>` : ''}`)}
            ${kpi(T('admin.live.breakEven'), reached ? `✓ ${esc(s.target_reached_at)}` : esc(ft(s.target_missing)), `${esc(reached ? T('admin.live.reached') : s.target_eta ? T('admin.live.missingEta', { time: s.target_eta }) : T('admin.live.missing'))}${s.target ? `${progress(s.target_progress)}${esc(T('admin.live.breakEvenDay', { amount: ft(s.target) }))}` : ''}`)}
            ${kpi(T('admin.live.forecast'), s.forecast ? `≈ ${esc(ft(s.forecast.value))}` : '–', s.forecast ? esc(T('admin.live.range', { low: k(s.forecast.low), high: k(s.forecast.high) })) : '')}
            ${kpi(T('admin.live.basket'), s.basket ? esc(ft(s.basket)) : '–', `${esc(T('admin.live.receipts', { n: s.receipts }))}${s.usual_basket ? ` · ${esc(T('admin.live.usualBasket', { amount: ft(s.usual_basket) }))}` : ''}`)}
            ${kpi(T('admin.live.weekTitle'), esc(ft(s.week.total)), `${change(s.week.last_week ? ((s.week.total - s.week.last_week) / s.week.last_week) * 100 : null)} ${esc(T('admin.live.vsLastWeek'))}`)}
            ${kpi(T('admin.live.monthTitle'), m && m.target ? esc(ft(m.total)) : '–', m && m.target ? `${progress(m.total / m.target)}${esc(T('admin.live.monthCovered', { pct: Math.round((m.total / m.target) * 100) }))}` : '')}
          </div>
          <div class="lv-cols">
            <div class="lv-col">
              <section class="ad-card">${head(T('admin.live.hoursTitle'), hasHours ? `<div class="ad-seg" role="group" aria-label="${esc(T('admin.live.hoursTitle'))}"><button type="button" data-view="hours">${esc(T('admin.live.viewHours'))}</button><button type="button" data-view="cum">${esc(T('admin.live.viewCumulative'))}</button></div>` : '')}
                ${hasHours ? `<div id="lv-chart"></div><div class="lv-foot"><div class="ad-legend" id="lv-legend"></div>${explain(`${esc(T('admin.live.hoursLegend'))} ${esc(T('x.chartHint'))}`)}</div>` : `<p class="ad-muted">${esc(T('admin.live.noSalesYet'))}</p>`}</section>
              <section class="ad-card">${head(T('admin.live.forecastTitle'), explain(esc(T('admin.live.forecastHow'))))}${forecastToday(s)}</section>
              <section class="ad-card">${head(T('admin.live.scorecardTitle'))}${accuracy(data.accuracy)}<div id="lv-days"></div></section>
            </div>
            <div class="lv-col lv-col--side">
              <section class="ad-card">${head(T('admin.live.productsTitle'))}${products(s)}</section>
              <section class="ad-card">${head(T('admin.live.weekTitle'), `<div class="ad-legend"><span><i></i>${esc(T('admin.live.series.thisWeek'))}</span><span><i class="soft"></i>${esc(T('admin.live.series.lastWeek'))}</span></div>`)}<div id="lv-week"></div></section>
              <section class="ad-card">${head(T('admin.live.monthTitle'))}${month(s)}</section>
              <section class="ad-card">${head(T('admin.live.postsTitle'))}<div id="lv-posts"></div></section>
            </div>
          </div></div>`;
        if (hasHours) paintChart();
        paintDays(0); paintPosts(0);
        drawWeek(root.querySelector('#lv-week'), s);
      });

      const load = async (fresh) => {
        busy = true; if (data) draw();
        try { data = await BA.api('/admin/live-sales', { params: { fresh: fresh ? 'true' : 'false' } }); error = null; }
        catch (e) { error = e.message; if (!data) { root.innerHTML = BA.errorBox(e.message); root.querySelector('[data-retry]').addEventListener('click', () => { root.innerHTML = BA.loading(); load(true); }); busy = false; return; } }
        busy = false; draw();
      };

      const markDay = async (date, unusual) => {
        let note = null;
        if (unusual) { note = await BA.ask({ title: T('admin.live.markUnusual'), label: T('admin.live.unusualPrompt') }); if (note == null) return; }
        busy = true; draw();
        try { if (unusual) await BA.api(`/admin/live-sales/unusual/${date}`, { method: 'PUT', body: { note } }); else await BA.api(`/admin/live-sales/unusual/${date}`, { method: 'DELETE' }); }
        catch (e) { error = e.message; }
        await load(false);
      };
      const markPost = async (date, posted) => {
        let body = null;
        if (posted) {
          const answer = await BA.ask({ title: T('admin.live.markPost'), label: T('admin.live.postPrompt'), placeholder: '14:30 …' });
          if (answer == null) return;
          const m = answer.trim().match(/^(\d{1,2}[:.]\d{2})\s*(.*)$/);
          body = m ? { time: m[1], note: m[2] } : { time: null, note: answer.trim() };
        }
        busy = true; draw();
        try { if (posted) await BA.api(`/admin/live-sales/posts/${date}`, { method: 'PUT', body }); else await BA.api(`/admin/live-sales/posts/${date}`, { method: 'DELETE' }); }
        catch (e) { error = e.message; }
        await load(false);
      };

      const turn = (b) => {
        if (b.getAttribute('aria-disabled') === 'true') return;
        const [key, step] = b.dataset.pg.split(':'); const dir = Number(step);
        if (key === 'days') { dayPage += dir; paintDays(dir); } else { postPage += dir; paintPosts(dir); }
      };
      root.onclick = (e) => {
        const b = e.target.closest('button'); if (!b || !data) return;
        if (b.dataset.pg) { turn(b); return; }
        if (b.dataset.view) { if (view !== b.dataset.view) { view = b.dataset.view; paintChart(); } return; }
        if (busy) return;
        if (b.dataset.act === 'refresh') load(true);
        else if (b.dataset.act === 'post-today') markPost(data.summary.date, b.dataset.on !== '1');
        else if (b.dataset.act === 'flag-today') markDay(data.summary.date, true);
        else if (b.dataset.post) markPost(b.dataset.post, b.dataset.on !== '1');
        else if (b.dataset.flag) markDay(b.dataset.flag, b.dataset.on !== '1');
      };
      // ← → on a pager turn the page
      root.onkeydown = (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const box = e.target.closest && e.target.closest('.lv-pager'); if (!box) return;
        const b = box.querySelector(`[data-pg$=":${e.key === 'ArrowLeft' ? -1 : 1}"]`);
        if (b) { e.preventDefault(); b.focus(); turn(b); }
      };
      // ten days a page beside the side column, seven when the tab is one column
      if (window.ResizeObserver) new ResizeObserver(() => {
        const n = wide() ? 10 : 7;
        if (n === perPage || !data || !root.querySelector('#lv-days')) return;
        dayPage = Math.floor((dayPage * perPage) / n); perPage = n; paintDays(0);
      }).observe(root);

      root.innerHTML = BA.loading();
      await load(true);
    },
  });
})();
