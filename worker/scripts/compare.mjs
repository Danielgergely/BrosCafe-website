#!/usr/bin/env node
// The switch-night gate: compares a fresh mongoexport of the old system with what is in D1, document by document.
// Members are matched by code and checked field by field (stamps, tiers, wallet tokens, everything); every other
// collection must contain exactly the same documents. Exit code 1 on any difference: do not switch.
//
// Usage: node scripts/compare.mjs <export dir> [--remote]
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [dir, ...flags] = process.argv.slice(2);
const where = flags.includes('--remote') ? '--remote' : '--local';
if (!dir) {
  console.error('usage: compare.mjs <export dir> [--remote]');
  process.exit(1);
}

const COLLECTIONS = [
  'users', 'members', 'transactions', 'analytics_events', 'magic_tokens', 'settings', 'content', 'products', 'media',
  'contact_log', 'game_runs', 'wallet_registrations', 'voided_passes', 'wallet_stats', 'sales_days', 'live_sales',
  'sales_forecasts', 'special_days', 'social_posts',
];
const isoAt = (d) => d.toISOString().replace(/\.(\d{3})Z$/, '.$1000+00:00');
function convert(v) {
  if (Array.isArray(v)) return v.map(convert);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0].startsWith('$')) {
      const x = v[keys[0]];
      if (keys[0] === '$date') return isoAt(new Date(typeof x === 'object' ? Number(x.$numberLong) : x));
      return Number(x);
    }
    const o = {};
    for (const [k, x] of Object.entries(v)) if (k !== '_id') o[k] = convert(x);
    return o;
  }
  return v;
}
/** JSON with sorted keys, so field order never counts as a difference. */
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

function d1(collection) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'broscafe', where, '--json', '--command', `SELECT doc FROM ${collection}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return JSON.parse(out)[0].results.map((r) => JSON.parse(r.doc));
}

let problems = 0;
const report = (line) => {
  problems++;
  console.log('  ✗', line);
};

for (const c of COLLECTIONS) {
  const file = join(dir, `${c}.json`);
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).map(convert) : [];
  const now = d1(c);
  const before = problems;
  if (c === 'members') {
    const byCode = new Map(now.map((m) => [m.code, m]));
    for (const m of old) {
      const n = byCode.get(m.code);
      if (!n) {
        report(`member ${m.code} missing`);
        continue;
      }
      byCode.delete(m.code);
      for (const k of new Set([...Object.keys(m), ...Object.keys(n)])) {
        if (canon(m[k]) !== canon(n[k])) report(`member ${m.code} ${k}: old ${canon(m[k])} new ${canon(n[k])}`);
      }
    }
    for (const code of byCode.keys()) report(`member ${code} only in the new system`);
  } else {
    const count = new Map();
    for (const d of old) count.set(canon(d), (count.get(canon(d)) ?? 0) + 1);
    for (const d of now) count.set(canon(d), (count.get(canon(d)) ?? 0) - 1);
    for (const [doc, n] of count) if (n) report(`${c}: ${n > 0 ? 'missing in new' : 'extra in new'} ${doc.slice(0, 160)}`);
  }
  console.log(`${problems === before ? '✓' : '✗'} ${c}: old ${old.length}, new ${now.length}`);
}
console.log(problems ? `\n${problems} difference(s). Do not switch.` : '\nEverything matches.');
process.exit(problems ? 1 : 0);
