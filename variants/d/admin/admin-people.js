// Bros Cafe · D · admin: members (tier, free coffees, erase), wallet status, analytics settings, staff users.
// Endpoints as in the React dashboard: /admin/members, /admin/wallet/status, /admin/settings, /staff.
(() => {
  const BA = window.BA; const { T, esc, card, tile, tiles } = BA;
  const TIERS = ['base', 'bronze', 'silver', 'gold', 'diamond'];

  BA.tab('members', {
    icon: '🧑',
    async render(root) {
      let members = null;
      const load = async () => { try { members = await BA.api('/admin/members'); } catch (e) { members = members || []; BA.fail(e); } draw(); };
      const draw = () => {
        const heads = [T('admin.name'), T('admin.email'), T('admin.table.progress'), T('admin.stats.coffees'), T('admin.table.rewards'), T('admin.freeCoffees'), T('admin.tier')];
        root.innerHTML = `<div class="ad-panel">${card(`${T('admin.membersTitle')} (${members.length})`, `<div class="ad-tw"><table class="ad-t" data-testid="members-table"><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}<th></th></tr></thead><tbody>
          ${members.map((m) => `<tr data-testid="member-row-${esc(m.code)}"><td><b>${esc(m.name)}</b></td><td class="ad-muted">${esc(m.email)}</td>
            <td>${m.reward_ready ? BA.badge(T('admin.rewardReady'), 'ad-badge--ok') : `<span class="ad-num">${esc(m.stamps)} / ${esc(m.stamps_required)}</span>`}</td>
            <td class="ad-num">${esc(m.total_coffees)}</td><td class="ad-num">${esc(m.rewards_redeemed)}</td>
            <td><div class="ad-row" style="gap:2px;flex-wrap:nowrap"><button type="button" class="ad-ib" data-free="-1" data-code="${esc(m.code)}" ${m.free_coffees ? '' : 'disabled'} aria-label="${esc(T('admin.freeRemove'))}">−</button><b class="ad-num ${m.free_coffees ? 'ad-pos' : 'ad-muted'}" style="min-width:18px;text-align:center" data-testid="free-${esc(m.code)}">${esc(m.free_coffees ?? 0)}</b><button type="button" class="ad-ib" data-free="1" data-code="${esc(m.code)}" aria-label="${esc(T('admin.freeGrant'))}">+</button></div></td>
            <td><select class="ad-sel" data-tier="${esc(m.code)}" aria-label="${esc(T('admin.tier'))}"><option value="">${esc(T('admin.tierAuto', { tier: T(`loyalty.tiers.${m.tier}`) }))}</option>${TIERS.map((t) => `<option value="${t}"${m.tier_granted && m.tier === t ? ' selected' : ''}>${esc(T(`loyalty.tiers.${t}`))}</option>`).join('')}</select></td>
            <td class="r"><button type="button" class="ad-ib ad-ib--danger" data-erase="${esc(m.code)}" aria-label="${esc(T('admin.erase'))}" title="${esc(T('admin.eraseHint'))}">🗑</button></td></tr>`).join('')}</tbody></table></div>
          <p class="ad-small">${esc(T('admin.eraseNote'))}</p>`)}</div>`;
      };
      const find = (code) => members.find((m) => m.code === code);

      const erase = (m) => {
        BA.dialog({
          title: T('admin.erase'),
          html: `<form class="ad-form" data-testid="erase-dialog"><p class="ad-p">${esc(T('admin.eraseWarning', { name: m.name }))}</p>
            <label class="ad-f"><span>${esc(T('admin.eraseTypeName'))}</span><input data-testid="erase-confirm-input" autocomplete="off" placeholder="${esc(m.name)}"></label>
            <div class="ad-row ad-row--end"><button type="button" class="ad-btn ad-btn--ghost" data-close>${esc(T('admin.eraseCancel'))}</button><button class="ad-btn ad-btn--danger" disabled data-testid="erase-confirm-btn">${esc(T('admin.erase'))}</button></div></form>`,
          mount(dlg) {
            const inp = dlg.querySelector('input'); const go = dlg.querySelector('.ad-btn--danger');
            const ok = () => inp.value.trim().toLowerCase() === (m.name || '').trim().toLowerCase();
            inp.addEventListener('input', () => { go.disabled = !ok(); });
            dlg.querySelector('form').addEventListener('submit', async (e) => {
              e.preventDefault(); if (!ok()) return; go.disabled = true;
              try {
                const d = await BA.api(`/admin/members/${m.code}`, { method: 'DELETE' });
                const gone = Object.values((d && d.removed) || {}).reduce((a, b) => a + b, 0);
                dlg.close(); BA.toast(T('admin.erased', { name: m.name, n: gone })); await load();
              } catch (err) { BA.fail(err); go.disabled = false; }
            });
            inp.focus();
          },
        });
      };

      root.onclick = async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.free) {
          const m = find(b.dataset.code);
          try { await BA.api(`/admin/members/${m.code}/free-coffees`, { method: 'PUT', body: { delta: Number(b.dataset.free) } }); BA.toast(T('admin.freeSaved', { name: m.name })); await load(); } catch (err) { BA.fail(err); }
        } else if (b.dataset.erase) erase(find(b.dataset.erase));
      };
      root.onchange = async (e) => {
        const s = e.target.closest('[data-tier]'); if (!s) return;
        const m = find(s.dataset.tier);
        try { await BA.api(`/admin/members/${m.code}/tier`, { method: 'PUT', body: { tier: s.value || null } }); BA.toast(T('admin.tierSaved', { name: m.name })); await load(); } catch (err) { BA.fail(err); }
      };
      root.innerHTML = BA.loading();
      await load();
    },
  });

  BA.tab('wallet', {
    icon: '🎫',
    render(root) {
      BA.load(root, () => BA.api('/admin/wallet/status'), (d) => {
        const list = [[d.passes_issued, 'passesIssued'], [d.google_passes_issued, 'googlePassesIssued'], [d.active_registrations, 'deviceRegistrations'], [d.generation_failures, 'generationFailures'], [d.push_failures, 'pushFailures'], [d.google_push_failures, 'googlePushFailures']];
        const bad = ['generationFailures', 'pushFailures', 'googlePushFailures'];
        const platform = (key, title, cfg) => card(title, `<p data-testid="wallet-status-${key}">${BA.badge(T(cfg && cfg.configured ? 'admin.walletLive' : 'admin.walletOff'), cfg && cfg.configured ? 'ad-badge--ok' : 'ad-badge--bad')}</p>
          ${cfg && cfg.configured ? '' : `<div class="ad-banner" style="display:block"><b>${esc(T('admin.walletMissing'))}</b><ul style="margin:8px 0 8px 20px">${((cfg && cfg.missing) || []).map((n) => `<li><code class="ad-mono">${esc(n)}</code></li>`).join('')}</ul><p class="ad-small">${esc(T('admin.walletNote'))}</p></div>`}`);
        root.innerHTML = `<div class="ad-panel" data-testid="wallet-panel">
          <div class="ad-grid2">${platform('apple', T('admin.walletTitle'), d.config)}${platform('google', T('admin.walletGoogleTitle'), d.google_config)}</div>
          ${tiles(list.map(([v, key]) => tile(BA.num(v ?? 0), T(`admin.stats.${key}`), { cls: bad.includes(key) && v > 0 ? 'is-bad' : '' })), 3)}
          ${card(T('admin.lastPassUpdate'), `<p>${d.last_update ? esc(BA.dateTime(d.last_update)) : '—'}</p>`)}</div>`;
      });
    },
  });

  const SETTINGS = ['active_days', 'inactive_days', 'new_days', 'almost_reward_stamps', 'loyal_cycles'];
  BA.tab('settings', {
    icon: '⚙',
    render(root) {
      BA.load(root, () => BA.api('/admin/settings'), (s) => {
        root.innerHTML = `<div class="ad-panel">${card(T('admin.settingsTitle'), `<form class="ad-form" data-testid="settings-form" style="max-width:520px">
          ${SETTINGS.map((f) => `<label class="ad-f"><span>${esc(T(`admin.settingsFields.${f}`))}</span><input type="number" min="1" name="${f}" data-testid="setting-${f}" value="${esc(s[f])}"></label>`).join('')}
          <div><button class="ad-btn" data-testid="settings-save-btn">${esc(T('admin.save'))}</button></div></form>`)}</div>`;
        root.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const body = Object.fromEntries(SETTINGS.map((f) => [f, Number(e.target.elements[f].value)]));
          try { await BA.api('/admin/settings', { method: 'PUT', body }); BA.toast(T('admin.saved')); } catch (err) { BA.fail(err); }
        });
      });
    },
  });

  BA.tab('staff', {
    icon: '🧑‍🍳',
    async render(root, ctx) {
      let users = null;
      const load = async () => { try { users = await BA.api('/staff'); } catch (e) { users = users || []; BA.fail(e); } draw(); };
      const draw = () => {
        root.innerHTML = `<div class="ad-panel"><div class="ad-row ad-row--between"><h2 class="ad-card__t" style="margin:0">${esc(T('x.staffTitle'))} (${users.length})</h2><button type="button" class="ad-btn" data-add data-testid="add-staff-btn">＋ ${esc(T('admin.addStaff'))}</button></div>
          ${card('', users.length ? `<div class="ad-tw"><table class="ad-t"><thead><tr><th>${esc(T('admin.name'))}</th><th>${esc(T('admin.email'))}</th><th>${esc(T('admin.role'))}</th></tr></thead><tbody>${users.map((u) => `<tr><td><b>${esc(u.name)}</b>${ctx.user && ctx.user.email === u.email ? ` ${BA.badge(T('x.you'), 'ad-badge--dim')}` : ''}</td><td class="ad-muted">${esc(u.email)}</td><td>${esc(T(u.role === 'admin' ? 'admin.roleAdmin' : 'admin.roleStaff'))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="ad-muted">${esc(T('x.staffEmpty'))}</p>`)}</div>`;
      };
      BA.addStaff = () => {
        BA.dialog({
          title: T('admin.createStaff'),
          html: `<form class="ad-form"><label class="ad-f"><span>${esc(T('admin.name'))}</span><input name="name" required data-testid="staff-name-input"></label>
            <label class="ad-f"><span>${esc(T('admin.email'))}</span><input name="email" type="email" required data-testid="staff-email-input"></label>
            <label class="ad-f"><span>${esc(T('admin.password'))}</span><input name="password" type="password" required autocomplete="new-password" data-testid="staff-password-input"></label>
            <label class="ad-f"><span>${esc(T('admin.role'))}</span><select name="role" data-testid="staff-role-select"><option value="staff">${esc(T('admin.roleStaff'))}</option><option value="admin">${esc(T('admin.roleAdmin'))}</option></select></label>
            <button class="ad-btn" style="min-height:54px" data-testid="staff-submit-btn">${esc(T('admin.create'))}</button></form>`,
          mount(dlg) {
            dlg.querySelector('form').addEventListener('submit', async (e) => {
              e.preventDefault();
              const el = e.target.elements;
              try {
                await BA.api('/staff', { method: 'POST', body: { name: el.name.value, email: el.email.value, password: el.password.value, role: el.role.value } });
                dlg.close(); BA.toast(T('admin.staffAdded'));
                if (users) await load();
              } catch (err) { BA.fail(err); }
            });
          },
        });
      };
      root.onclick = (e) => { if (e.target.closest('[data-add]')) BA.addStaff(); };
      root.innerHTML = BA.loading();
      await load();
    },
  });
})();
