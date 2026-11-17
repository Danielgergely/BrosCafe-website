// Coffee Runner: seeds out, replays in, scores decided here. Port of backend/app/routers/game.py.
import { HttpError, Invalid, queryInt, str, type Router } from '../http';
import { getCurrentCustomer } from '../security';
import { TICK_RATE, simulate } from '../game/runner';
import { isoAt, parseIso, tokenUrlsafe } from '../util';

const RUN_TTL_MINUTES = 20;
const RUNS_PER_HOUR = 60;
const MIN_ELAPSED_RATIO = 0.55;

const DAY = 86_400_000;
const PERIODS: Record<string, number | null> = { week: 7 * DAY, month: 30 * DAY, year: 365 * DAY, all: null };

/** secrets.randbelow(2**32 - 1) + 1 */
function randomSeed(): number {
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < 2 ** 32 - 1) return buf[0] + 1;
  }
}

/** How FastAPI rendered a datetime read back from Mongo (naive UTC, millisecond precision): `.isoformat()`. */
function naiveIsoformat(stored: string): string {
  const iso = parseIso(stored).toISOString().slice(0, -1); // YYYY-MM-DDTHH:MM:SS.mmm
  return iso.endsWith('.000') ? iso.slice(0, -4) : `${iso}000`;
}

/** list[int] with pydantic's lax parsing: ints, integral floats and integer strings. */
function intList(v: unknown, field: string, inv: Invalid, max: number): number[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    inv.add(field, 'Input should be a valid list', 'list_type');
    return [];
  }
  const out: number[] = [];
  v.forEach((x, i) => {
    const n = typeof x === 'string' && /^\s*[+-]?\d+\s*$/.test(x) ? Number.parseInt(x, 10) : typeof x === 'boolean' ? NaN : x;
    if (typeof n !== 'number' || !Number.isInteger(n)) inv.errors.push({ loc: ['body', field, i], msg: 'Input should be a valid integer', type: 'int_type' });
    else out.push(n);
  });
  if (v.length > max) inv.add(field, `List should have at most ${max} items after validation, not ${v.length}`, 'too_long');
  return out;
}

export function register(api: Router) {
  api.post('/game/start', async (c) => {
    const member = await getCurrentCustomer(c);
    const since = isoAt(new Date(Date.now() - 3600_000));
    const recent = await c.db.game_runs.countDocuments({ code: member.code, started_at: { $gte: since } });
    if (recent >= RUNS_PER_HOUR) throw new HttpError(429, 'That is a lot of coffee. Try again later.');

    const run = {
      run_id: tokenUrlsafe(18),
      code: member.code,
      name: member.name,
      seed: randomSeed(),
      started_at: isoAt(new Date()),
      finished: false,
    };
    await c.db.game_runs.insertOne({ ...run });
    return { run_id: run.run_id, seed: run.seed };
  });

  api.post('/game/finish', async (c) => {
    const member = await getCurrentCustomer(c);
    const b = await c.json();
    const inv = new Invalid();
    const runId = str(b.run_id, 'run_id', inv, { min: 8, max: 64 });
    const jumps = intList(b.jumps, 'jumps', inv, 4000);
    inv.throwIfAny();

    const run = await c.db.game_runs.findOne({ run_id: runId, code: member.code });
    if (!run) throw new HttpError(404, 'Unknown run');
    if (run.finished) throw new HttpError(409, 'That run has already been scored');

    const started = parseIso(run.started_at).getTime();
    const now = new Date();
    if (now.getTime() - started > RUN_TTL_MINUTES * 60_000) throw new HttpError(410, 'That run expired — start a new one');

    const result = simulate(run.seed, jumps);

    const elapsed = (now.getTime() - started) / 1000;
    const played = result.ticks / TICK_RATE;
    if (elapsed < played * MIN_ELAPSED_RATIO) {
      console.warn(`Run ${runId} claimed ${played.toFixed(1)}s of play in ${elapsed.toFixed(1)}s — rejected`);
      await c.db.game_runs.updateOne({ run_id: runId }, { $set: { finished: true, rejected: true } });
      throw new HttpError(400, 'That run could not be verified');
    }

    await c.db.game_runs.updateOne({ run_id: runId }, {
      $set: { finished: true, score: result.score, ticks: result.ticks, finished_at: isoAt(now), jump_count: jumps.length },
    });
    return { score: result.score, ticks: result.ticks, died: result.died };
  });

  api.get('/game/leaderboard', async (c) => {
    const period = c.query.get('period') ?? 'week';
    const limit = queryInt(c, 'limit', 10);
    if (!(period in PERIODS)) throw new HttpError(400, 'Unknown period');

    // $match → $sort {score: -1, finished_at: 1} → $group by code taking the first → $sort {score: -1, at: 1} → $limit
    const window = PERIODS[period];
    const match: Record<string, unknown> = { finished: true, score: { $gt: 0 }, rejected: { $ne: true } };
    if (window) match.finished_at = { $gte: isoAt(new Date(Date.now() - window)) };
    const where = c.db.game_runs.where(match);
    const { results } = await c.db.d1
      .prepare(
        `SELECT name, score, at FROM (
           SELECT json_extract(doc, '$.name') AS name, json_extract(doc, '$.score') AS score,
                  json_extract(doc, '$.finished_at') AS at,
                  ROW_NUMBER() OVER (PARTITION BY json_extract(doc, '$.code')
                                     ORDER BY json_extract(doc, '$.score') DESC, json_extract(doc, '$.finished_at') ASC, _id) AS rn
           FROM game_runs WHERE ${where.sql}
         ) WHERE rn = 1 ORDER BY score DESC, at ASC LIMIT ?`,
      )
      .bind(...where.args, Math.max(1, Math.min(limit, 50)))
      .all<{ name: unknown; score: number; at: string }>();

    return results.map((r) => ({ name: r.name, score: r.score, at: naiveIsoformat(r.at) }));
  });

  api.get('/game/me', async (c) => {
    const member = await getCurrentCustomer(c);
    const out: Record<string, number> = {};
    for (const [name, window] of Object.entries(PERIODS)) {
      const match: Record<string, unknown> = { code: member.code, finished: true, rejected: { $ne: true } };
      if (window) match.finished_at = { $gte: isoAt(new Date(Date.now() - window)) };
      const best = await c.db.game_runs.find(match, { projection: { score: 1 }, sort: { score: -1 }, limit: 1 });
      out[name] = best.length ? best[0].score : 0;
    }
    return out;
  });
}
