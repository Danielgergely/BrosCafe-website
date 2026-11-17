// Bros Cafe · admin: live sales (today against the forecast and the break-even line, self-scoring, unusual days,
// Instagram posts, week, month). Same endpoints as LiveSalesPanel.jsx: GET /admin/live-sales, PUT/DELETE
// /admin/live-sales/unusual/{day} and /posts/{day}.
(() => {
  const BA = window.BA; const { T, esc, ft, k, signed, card, tile, progress } = BA;
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
  const liveTile = (label, value, extra, cls) => `<div class="ad-tile ${cls || ''}"><span class="ad-tile__l">${esc(label)}</span><b class="ad-tile__v">${value}</b>${extra ? `<span class="ad-tile__s">${extra}</span>` : ''}</div>`;
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
      h: 230, xs: rows.map((r) => r.h),
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
      h: 230, xs: rows.map((r) => r.h), lines: [{ v: usual, cls: 'usual' }, { v: fc, cls: 'fc' }, { v: today, cls: '', dots: true }],
      hline: s.target ? { v: s.target, label: `${T('x.breakEvenLine')} ${ft(s.target)}` } : undefined,
      tip: (i) => `${rows[i].h}:00–${rows[i].h + 1}:00\n${T('admin.live.series.today')}: ${today[i] == null ? '–' : ft(today[i])}\n${T('admin.live.series.usual')}: ${ft(usual[i])}`,
    }));
  }

  function forecastToday(s) {
    const { forecast, checkpoints } = s;
    return `${forecast ? `<div><p class="ad-muted">${esc(T('admin.live.forecastNow'))}</p><p class="ad-bigf">≈ ${esc(ft(forecast.value))}</p><p class="ad-small">${esc(T('admin.live.range', { low: ft(forecast.low), high: ft(forecast.high) }))}</p></div>` : ''}
      <div class="ad-cps">${CPS.map((cp) => { const c = (checkpoints || {})[cp];
        return `<div class="ad-cp"><small>${cp}:00</small>${c ? `<b>${k(c.value)}</b><small>${k(c.low)}–${k(c.high)}</small>${c.late ? `<small class="ad-neg">${esc(T('admin.live.late'))}</small>` : ''}` : `<small>${esc(T('admin.live.notYet'))}</small>`}</div>`; }).join('')}</div>
      <p class="ad-small">${esc(T('admin.live.forecastHow'))}</p>`;
  }

  function products(s) {
    if (!s.products || !s.products.length) return `<p class="ad-muted">${esc(T('admin.live.noSalesYet'))}</p>`;
    return `<ol class="ad-list">${s.products.map((p, i) => `<li><span><span class="ad-muted">${i + 1}.</span> ${esc(p.name)}</span><span class="ad-num"><b>${s.products_estimated ? '≈ ' : ''}${esc(ft(p.gross))}</b> <span class="ad-small">${esc(T('admin.live.sold', { n: p.count }))}${s.total ? ` · ${Math.round((p.gross / s.total) * 100)}%` : ''}</span></span></li>`).join('')}</ol>
      ${s.products_estimated ? `<p class="ad-small">${esc(T('admin.live.productsEstimated'))}</p>` : ''}`;
  }

  function scorecard(data) {
    const acc = data.accuracy; const hist = data.forecast_history || [];
    const head = `<div class="ad-cps">${CPS.map((cp) => { const a = acc[cp] || {};
      return `<div class="ad-cp"><small>${cp}:00</small><b>±${a.mean_abs_error ?? '–'}%</b><small>${esc(T('admin.live.withinRange', { n: a.within_range, of: a.days }))}</small><small>${esc(T('admin.live.lastWeek', { pct: a.last_week_abs_error ?? '–' }))}</small></div>`; }).join('')}</div>`;
    const rows = hist.map((row) => {
      const kind = (row.day && row.day.kind) || 'normal'; const name = dayName(row.day);
      const ctx = context(row.context, null).map(([i, tx]) => `<span title="${esc(tx)}">${i}</span>`).join(' ');
      return `<tr class="${kind === 'normal' ? '' : 'is-off'}"><td>${esc(BA.shortDay(row.date))}${row.replayed ? ' <span class="ad-muted">*</span>' : ''} ${ctx}${kind !== 'normal' ? ` <span class="ad-small">· ${esc(T(`admin.live.dayKind.${kind}`))}${name ? `: ${esc(name)}` : ''}</span>` : ''}</td>
        <td class="r ad-num">${k(row.actual)}</td>
        ${CPS.map((cp) => { const c = (row.checkpoints || {})[cp]; return `<td class="cp ${errCls(c && c.error_pct)}" title="${c ? esc(`${ft(c.value)} (${ft(c.low)}–${ft(c.high)})`) : ''}">${c ? esc(signed(c.error_pct, 0)) : '–'}</td>`; }).join('')}
        <td class="ad-small">${weather(row.weather)}</td>
        <td class="r" style="white-space:nowrap"><button type="button" class="ad-ib" data-post="${esc(row.date)}" data-on="${row.posted ? 1 : 0}" aria-pressed="${row.posted ? 'true' : 'false'}" title="${esc(T(row.posted ? 'admin.live.unmarkPost' : 'admin.live.posted'))}" aria-label="${esc(T(row.posted ? 'admin.live.unmarkPost' : 'admin.live.posted'))}">📷</button>${kind === 'normal' || kind === 'unusual' ? `<button type="button" class="ad-ib" data-flag="${esc(row.date)}" data-on="${kind === 'unusual' ? 1 : 0}" aria-pressed="${kind === 'unusual' ? 'true' : 'false'}" title="${esc(T(kind === 'unusual' ? 'admin.live.unmarkUnusual' : 'admin.live.markUnusual'))}" aria-label="${esc(T(kind === 'unusual' ? 'admin.live.unmarkUnusual' : 'admin.live.markUnusual'))}">⚑</button>` : ''}</td></tr>`;
    }).join('');
    return `${head}<div class="ad-tw"><table class="ad-t"><thead><tr><th>${esc(T('admin.live.day'))}</th><th class="r">${esc(T('admin.live.actual'))}</th>${CPS.map((c) => `<th class="r">${c}:00</th>`).join('')}<th>${esc(T('admin.live.weather'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="ad-small">${esc(T('admin.live.replayedNote'))} ${esc(T('admin.live.notScored'))}</p>`;
  }

  function posts(data) {
    const p = data.posts || { posts: [] };
    if (!p.posts.length) return `<p class="ad-muted">${esc(T('admin.live.postsEmpty'))}</p>`;
    return `${p.average_lift_pct != null ? `<div><p class="ad-bigf">${esc(T('admin.live.averageLift', { pct: signed(p.average_lift_pct) }))}</p><p class="ad-small">${esc(T('admin.live.averageLiftNote', { n: p.finished }))}</p></div>` : ''}
      <ol class="ad-list">${p.posts.map((x) => `<li><span><span class="ad-muted">${esc(BA.shortDay(x.date))}${x.time ? ` ${esc(x.time)}` : ''}</span> ${esc(x.note)}</span>
        <span class="ad-num" title="${x.lift_pct != null ? esc(`${ft(x.actual)} / ${ft(x.expected)}`) : ''}">${x.lift_pct == null ? `<span class="ad-small">${esc(T('admin.live.notMeasurable'))}</span>` : `${change(x.lift_pct)}${x.provisional ? ` <span class="ad-small">${esc(T('admin.live.provisional'))}</span>` : ''}`}</span></li>`).join('')}</ol>
      <p class="ad-small">${esc(T('admin.live.postsHow'))}</p>`;
  }

  function drawWeek(el, s) {
    const days = s.week.days;
    const xs = days.map((d) => BA.shortDay(d.date, { weekday: 'short' }));
    BA.chart(el, (w) => BA.cartesian(w, {
      h: 210, xs, bars: [{ v: days.map((d) => d.last_week), cls: 'soft' }, { v: days.map((d) => d.total) }],
      tip: (i) => `${xs[i]}\n${T('admin.live.series.thisWeek')}: ${ft(days[i].total)}\n${T('admin.live.series.lastWeek')}: ${ft(days[i].last_week)}`,
    }));
  }

  function month(s) {
    const m = s.month; if (!m || !m.target) return `<p class="ad-muted">–</p>`;
    const ahead = m.total - m.target_to_date;
    return `<div><p class="ad-bigf">${esc(ft(m.total))} <span class="ad-muted" style="font-size:.55em">/ ${esc(ft(m.target))}</span></p>${progress(m.total / m.target)}<p class="ad-small">${esc(T('admin.live.monthCovered', { pct: Math.round((m.total / m.target) * 100) }))}</p></div>
      <p class="${ahead >= 0 ? 'ad-pos' : 'ad-neg'}">${esc(ahead >= 0 ? T('admin.live.aheadOfBreakEven', { amount: ft(ahead), days: m.open_days }) : T('admin.live.behindBreakEven', { amount: ft(-ahead), days: m.open_days }))}</p>
      <p class="ad-small">${esc(T('admin.live.monthAverage', { amount: ft(m.average_day) }))}</p>`;
  }

  BA.tab('live', {
    icon: '⚡',
    async render(root) {
      let busy = false; let error = null; let data = null;

      const draw = () => {
        const s = data.summary; const reached = Boolean(s.target_reached_at);
        const postedToday = ((data.posts && data.posts.posts) || []).some((p) => p.date === s.date);
        const kind = (s.day && s.day.kind) || 'normal';
        const hasHours = hourRows(s);
        root.innerHTML = `<div class="ad-panel" data-testid="live-panel">
          <div class="ad-row ad-row--between">
            <div class="ad-ctx"><span>${esc(T('admin.live.updated', { time: BA.clock(s.updated_at) }))}</span>${weather(s.weather)}${context(s.context, s.weather).map(([i, tx]) => `<span>${i} ${esc(tx)}</span>`).join('')}
              ${data.refresh_failed ? `<span class="ad-neg">${esc(T('admin.live.refreshFailed'))}</span>` : ''}${error ? `<span class="ad-neg">${esc(error)}</span>` : ''}</div>
            <div class="ad-row">
              <button type="button" class="ad-btn ad-btn--ghost ${postedToday ? 'ad-btn--on' : ''}" data-act="post-today" data-on="${postedToday ? 1 : 0}" ${busy ? 'disabled' : ''}>📷 ${esc(T(postedToday ? 'admin.live.posted' : 'admin.live.markPost'))}</button>
              ${kind === 'normal' ? `<button type="button" class="ad-btn ad-btn--ghost" data-act="flag-today" ${busy ? 'disabled' : ''}>⚑ ${esc(T('admin.live.markUnusual'))}</button>` : ''}
              <button type="button" class="ad-btn" data-act="refresh" ${busy ? 'disabled' : ''}>↻ ${esc(T('admin.live.refresh'))}</button>
            </div></div>
          ${kind !== 'normal' ? `<div class="ad-banner"><p><b>${esc(T(`admin.live.dayKind.${kind}`))}${dayName(s.day) ? `: ${esc(dayName(s.day))}` : ''}</b> <span class="ad-muted">${esc(T(`admin.live.dayNote.${kind}`))}</span></p>${kind === 'unusual' ? `<button type="button" class="link" data-flag="${esc(s.date)}" data-on="1">${esc(T('admin.live.unmarkUnusual'))}</button>` : ''}</div>` : ''}
          <div class="ad-tiles" style="--cols:4">
            ${liveTile(T('admin.live.today'), esc(ft(s.total)), `${change(s.diff_pct)} ${esc(T(`admin.live.vsBasis.${(s.day && s.day.basis) || 'weekday'}`, { n: s.compared_days }))}${s.record_ever || s.record_weekday ? ` <b class="ad-pos">🏆 ${esc(T(s.record_ever ? 'admin.live.recordEver' : 'admin.live.recordWeekday'))}</b>` : ''}`)}
            ${liveTile(T('admin.live.breakEven'), reached ? `✓ ${esc(s.target_reached_at)}` : esc(ft(s.target_missing)), `${esc(reached ? T('admin.live.reached') : s.target_eta ? T('admin.live.missingEta', { time: s.target_eta }) : T('admin.live.missing'))}${s.target ? `${progress(s.target_progress)}<br>${esc(T('admin.live.breakEvenDay', { amount: ft(s.target) }))}` : ''}`)}
            ${liveTile(T('admin.live.forecast'), s.forecast ? `≈ ${k(s.forecast.value)}` : '–', s.forecast ? esc(T('admin.live.range', { low: k(s.forecast.low), high: k(s.forecast.high) })) : '')}
            ${liveTile(T('admin.live.basket'), s.basket ? esc(ft(s.basket)) : '–', `${esc(T('admin.live.receipts', { n: s.receipts }))}${s.usual_basket ? ` · ${esc(T('admin.live.usualBasket', { amount: ft(s.usual_basket) }))}` : ''}`)}
          </div>
          ${card(T('admin.live.hoursTitle'), hasHours ? `<div id="ad-hours"></div><div class="ad-legend"><span><i></i>${esc(T('admin.live.series.today'))}</span><span><i class="dash"></i>${esc(T('admin.live.series.usual'))}</span></div><p class="ad-small">${esc(T('admin.live.hoursLegend'))}</p><div id="ad-cum" style="margin-top:14px"></div><div class="ad-legend"><span><i class="dash"></i>${esc(T('admin.live.series.usual'))}</span><span><i></i>${esc(T('admin.live.series.today'))}</span>${s.target ? `<span><i class="red"></i>${esc(T('x.breakEvenLine'))}</span>` : ''}</div>` : `<p class="ad-muted">${esc(T('admin.live.noSalesYet'))}</p>`)}
          <div class="ad-grid2">${card(T('admin.live.forecastTitle'), forecastToday(s))}${card(T('admin.live.productsTitle'), products(s))}</div>
          ${card(T('admin.live.scorecardTitle'), scorecard(data))}
          ${card(T('admin.live.postsTitle'), posts(data))}
          <div class="ad-grid2">${card(T('admin.live.weekTitle'), `<p class="ad-muted">${esc(ft(s.week.total))} · ${esc(T('admin.live.vsLastWeek'))} ${change(s.week.last_week ? ((s.week.total - s.week.last_week) / s.week.last_week) * 100 : null)}</p><div id="ad-week"></div><div class="ad-legend"><span><i></i>${esc(T('admin.live.series.thisWeek'))}</span><span><i class="soft"></i>${esc(T('admin.live.series.lastWeek'))}</span></div>`)}${card(T('admin.live.monthTitle'), month(s))}</div>
          <p class="ad-small">${esc(T('x.chartHint'))}</p></div>`;
        if (hasHours) { drawHours(root.querySelector('#ad-hours'), s); drawCumulative(root.querySelector('#ad-cum'), s); }
        drawWeek(root.querySelector('#ad-week'), s);
      };

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

      root.onclick = (e) => {
        const b = e.target.closest('button'); if (!b || busy) return;
        if (b.dataset.act === 'refresh') load(true);
        else if (b.dataset.act === 'post-today') markPost(data.summary.date, b.dataset.on !== '1');
        else if (b.dataset.act === 'flag-today') markDay(data.summary.date, true);
        else if (b.dataset.post) markPost(b.dataset.post, b.dataset.on !== '1');
        else if (b.dataset.flag) markDay(b.dataset.flag, b.dataset.on !== '1');
      };
      root.innerHTML = BA.loading();
      await load(true);
    },
  });
})();
