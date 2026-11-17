// Bros Cafe · admin: analytics tabs (overview, funnel, customers, coffee, rewards, retention, segments) and the
// transactions list. Endpoints as in the React panels: /admin/analytics/*, /admin/transactions?limit=150.
(() => {
  const BA = window.BA; const { T, esc, card, tile, tiles } = BA;
  const sim = (root, path, draw) => BA.load(root, () => BA.api(path), draw);

  // The Worker returns English keys; the React admin showed them raw, so the HU/EN labels live here.
  const FUNNEL = { 'QR Scanned': ['QR beolvasva', 'QR scanned'], 'Loyalty Page Viewed': ['Hűségoldal megnyitva', 'Loyalty page viewed'], 'Registration Started': ['Regisztráció elkezdve', 'Registration started'], 'Registration Completed': ['Regisztráció kész', 'Registration completed'], 'Wallet Card Added': ['Kártya a tárcában', 'Wallet card added'], 'Coffee #1': ['1. kávé', 'Coffee #1'], 'Coffee #2': ['2. kávé', 'Coffee #2'], 'Coffee #3': ['3. kávé', 'Coffee #3'], 'Coffee #4': ['4. kávé', 'Coffee #4'], 'Free Coffee Redeemed': ['Ingyen kávé beváltva', 'Free coffee redeemed'] };
  const RETENTION = { New: ['Új', 'New'], Returning: ['Visszatérő', 'Returning'], 'Visited Once': ['Egyszer járt', 'Visited once'], 'Reached 2': ['2-ig jutott', 'Reached 2'], 'Reached 4': ['4-ig jutott', 'Reached 4'], Redeemed: ['Beváltotta', 'Redeemed'], Churned: ['Lemorzsolódott', 'Churned'] };
  const SEGMENT = { New: ['Új', 'New'], Active: ['Aktív', 'Active'], 'Almost Reward': ['Jutalom közeli', 'Almost reward'], 'Reward Available': ['Jutalom elérhető', 'Reward available'], Inactive: ['Inaktív', 'Inactive'], Loyal: ['Hűséges', 'Loyal'] };

  BA.tab('overview', {
    icon: '📊',
    render(root) {
      sim(root, '/admin/analytics/overview', (d) => {
        const metrics = [['qr_scans', 'qrScans'], ['new_customers', 'newCustomers'], ['coffees', 'coffees'], ['rewards_redeemed', 'rewardsRedeemed']];
        root.innerHTML = `<div class="ad-panel" data-testid="overview-panel">${['today', 'week', 'month'].map((p) => card(T(`admin.periods.${p}`), tiles(metrics.map(([f, l]) => tile(BA.num(d[p][f]), T(`admin.stats.${l}`)))))).join('')}
          ${card(T('admin.periods.totals'), tiles([tile(BA.num(d.totals.total_customers), T('admin.stats.totalCustomers')), tile(BA.num(d.totals.active_customers), T('admin.stats.activeCustomers')), tile(BA.num(d.totals.total_coffees), T('admin.stats.coffeesServed')), tile(BA.num(d.totals.total_rewards_redeemed), T('admin.stats.freeCoffeesGiven'))]))}</div>`;
      });
    },
  });

  BA.tab('funnel', {
    icon: '▽',
    render(root) {
      sim(root, '/admin/analytics/funnel', (stages) => {
        root.innerHTML = `<div class="ad-panel">${card(T('admin.funnelTitle'), `<div class="ad-bars" data-testid="funnel-panel">${stages.map((s, i) => `<div><span class="lab">${esc(FUNNEL[s.stage] ? FUNNEL[s.stage][BA.lang === 'hu' ? 0 : 1] : s.stage)}</span><div class="track"><i style="width:${Math.max(s.pct, 6)}%;opacity:${1 - i * 0.06}">${esc(s.count)}</i></div><span class="val">${esc(s.pct)}%</span></div>`).join('')}</div>`)}</div>`;
      });
    },
  });

  BA.tab('customers', {
    icon: '👥',
    render(root) {
      sim(root, '/admin/analytics/customers', (d) => {
        const list = [[d.total, 'total', 'members'], [d.new, 'new'], [d.returning, 'returning'], [d.active, 'active'], [d.inactive, 'inactive'], [d.avg_coffees_per_customer, 'avgCoffees'], [d.avg_visits, 'avgVisits'], [BA.duration(d.avg_hours_between_purchases), 'avgBetween'], [BA.duration(d.avg_hours_to_reward), 'avgToReward'], [BA.pct(d.reward_redemption_rate), 'redemptionRate']];
        root.innerHTML = `<div class="ad-panel" data-testid="customers-panel">${tiles(list.map(([v, key, go]) => tile(BA.num(v), T(`admin.stats.${key}`), go ? { go, hint: T('admin.viewMembers') } : {})), 4)}</div>`;
      });
    },
  });

  /** Share of cups by drink: a bar list, the unrecorded row on the same scale as the rest. */
  function drinkMix(rows) {
    if (!rows || !rows.length) return `<p class="ad-muted">${esc(T('admin.noDrinkData'))}</p>`;
    const top = rows[0].count || 1;
    return `<div class="ad-bars" data-testid="drink-mix">${rows.map((r) => `<div><span class="lab ${r.id === 'unrecorded' ? 'q' : ''}">${esc((r.name && r.name[BA.lang]) || T('admin.unrecorded'))}</span><div class="track thin"><i class="thin ${r.id === 'unrecorded' ? 'grey' : ''}" style="width:${(r.count / top) * 100}%"></i></div><span class="val">${esc(r.count)} · ${esc(r.share)}%</span></div>`).join('')}</div>`;
  }

  BA.tab('coffee', {
    icon: '☕',
    render(root) {
      sim(root, '/admin/analytics/coffee', (d) => {
        let period = 'month';
        const mixTitle = (p) => T(p === 'all' ? 'admin.stats.allTime' : `admin.periods.${p}`);
        root.innerHTML = `<div class="ad-panel" data-testid="coffee-panel">
          ${tiles([[d.today, T('admin.periods.today')], [d.week, T('admin.periods.week')], [d.month, T('admin.periods.month')], [d.year, T('admin.stats.thisYear')], [d.total, T('admin.stats.allTime')]].map(([v, l]) => tile(BA.num(v), l)), 5)}
          ${card(T('admin.dailyTrend'), '<div id="ad-daily"></div>')}
          ${card(T('admin.hourlyTrend'), '<div id="ad-hourly"></div>')}
          ${card(T('admin.drinkMix'), `<div class="ad-seg" role="group">${['week', 'month', 'all'].map((p) => `<button type="button" data-p="${p}" aria-pressed="${p === period}">${esc(mixTitle(p))}</button>`).join('')}</div><div id="ad-mix"></div>`)}
          ${card(T('admin.freeMix'), drinkMix(d.free_mix))}
          ${card(T('admin.mostActive'), `<ol class="ad-list" data-testid="most-active">${d.most_active.length ? d.most_active.map((e, i) => `<li><span>${i + 1}. ${esc(e.name)}</span><span class="ad-pos">${esc(e.coffees)} ${esc(T('admin.stats.coffees').toLowerCase())}</span></li>`).join('') : `<li class="ad-muted">${esc(T('admin.noPurchases'))}</li>`}</ol>`)}
          <p class="ad-small">${esc(T('x.chartHint'))}</p></div>`;
        const daily = d.trend_daily || []; const hourly = d.trend_hourly || [];
        BA.chart(root.querySelector('#ad-daily'), (w) => BA.cartesian(w, { h: 230, xs: daily.map((x) => x.date), xEvery: Math.ceil(daily.length / Math.max(Math.floor(w / 60), 1)) || 1, lines: [{ v: daily.map((x) => x.count), dots: true }], yFmt: (v) => Math.round(v), tip: (i) => `${daily[i].date}\n${daily[i].count}` }));
        BA.chart(root.querySelector('#ad-hourly'), (w) => BA.cartesian(w, { h: 210, xs: hourly.map((x) => x.hour), xEvery: w < 480 ? 2 : 1, bars: [{ v: hourly.map((x) => x.count) }], yFmt: (v) => Math.round(v), tip: (i) => `${hourly[i].hour}\n${hourly[i].count}` }));
        const mix = () => { root.querySelector('#ad-mix').innerHTML = drinkMix((d.drink_mix || {})[period]); };
        mix();
        root.querySelector('.ad-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; period = b.dataset.p; root.querySelectorAll('.ad-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); mix(); });
      });
    },
  });

  BA.tab('rewards', {
    icon: '🎁',
    render(root) {
      sim(root, '/admin/analytics/rewards', (d) => {
        const list = [[d.earned, 'rewardsEarned'], [d.redeemed, 'rewardsRedeemed'], [d.waiting, 'rewardsWaiting'], [BA.pct(d.redemption_rate), 'redemptionRate'], [BA.duration(d.avg_hours_to_earn), 'avgToEarn']];
        root.innerHTML = `<div class="ad-panel" data-testid="rewards-panel">${tiles(list.map(([v, key]) => tile(BA.num(v), T(`admin.stats.${key}`))), 3)}</div>`;
      });
    },
  });

  BA.tab('retention', {
    icon: '↻',
    render(root) {
      sim(root, '/admin/analytics/retention', (raw) => {
        const rows = raw.map((r) => ({ ...r, label: RETENTION[r.label] ? RETENTION[r.label][BA.lang === 'hu' ? 0 : 1] : r.label }));
        root.innerHTML = `<div class="ad-panel" data-testid="retention-panel">${card(T('admin.retentionTitle'), '<div id="ad-ret"></div>')}<p class="ad-small">${esc(T('x.chartHint'))}</p></div>`;
        BA.chart(root.querySelector('#ad-ret'), (w) => BA.cartesian(w, { h: 280, xs: rows.map((r) => r.label), bars: [{ v: rows.map((r) => r.count), cell: (i) => (i % 2 ? 'soft' : '') }], yFmt: (v) => Math.round(v), xEvery: w < 560 ? Math.ceil(rows.length / 3) : 1, tip: (i) => `${rows[i].label}\n${rows[i].count}` }));
      });
    },
  });

  BA.tab('segments', {
    icon: '◔',
    render(root) {
      sim(root, '/admin/analytics/segments', (rows) => {
        root.innerHTML = `<div class="ad-panel" data-testid="segments-panel">${tiles(rows.map((r) => tile(BA.num(r.count), SEGMENT[r.segment] ? SEGMENT[r.segment][BA.lang === 'hu' ? 0 : 1] : r.segment)), 3)}<p class="ad-small">${esc(T('admin.segmentsNote'))}</p></div>`;
      });
    },
  });

  const TYPE_CLS = { registration: 'ad-muted', coffee_added: 'ad-pos', reward_earned: '', reward_redeemed: 'ad-neg', manual_adjustment: 'ad-muted', opening_redeemed: '' };
  BA.tab('transactions', {
    icon: '☰',
    render(root) {
      sim(root, '/admin/transactions?limit=150', (rows) => {
        const heads = ['when', 'customer', 'type', 'balance', 'by'];
        root.innerHTML = `<div class="ad-panel">${card(T('admin.transactionsTitle'), `<div class="ad-tw"><table class="ad-t" data-testid="transactions-table"><thead><tr>${heads.map((h) => `<th>${esc(T(`admin.table.${h}`))}</th>`).join('')}</tr></thead><tbody>
          ${rows.length ? rows.map((r) => `<tr><td class="ad-muted" style="white-space:nowrap">${esc(BA.dateTime(r.at))}</td><td>${esc(r.customer_name)}</td><td><b class="${TYPE_CLS[r.type] || ''}">${esc(T(`admin.txTypes.${r.type}`))}</b></td><td class="ad-num">${esc(r.prev_stamps)} → ${esc(r.new_stamps)}</td><td class="ad-muted">${esc(r.employee)}</td></tr>`).join('') : `<tr><td colspan="5" class="ad-muted" style="text-align:center;padding:30px">${esc(T('admin.noTransactions'))}</td></tr>`}</tbody></table></div>`)}</div>`;
      });
    },
  });
})();
