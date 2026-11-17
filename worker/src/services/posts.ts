// Did an Instagram post bring people in? Port of backend/app/services/posts.py (the method is explained there).
// Pure functions, like services/forecasts.ts.
import { addDays, daysBetween, NORMAL } from './daytypes';
import { mean, pyRound } from './forecasts';

const DAYS_AFTER = 1;
const MAX_WEEKS = 2;

type Days = Record<string, { hours: Record<string, number>; kind?: string }>;
type Post = Record<string, any>;

function fromHour(hours: Record<string, number>, hour: number): number {
  let total = 0;
  for (const [h, v] of Object.entries(hours)) if (Number.parseInt(h, 10) >= hour) total += v;
  return total;
}

/** int(text) as Python parses it (ValueError → SyntaxError, the expected-failure class here). */
function pyInt(text: string): number {
  if (!/^\s*[+-]?\d+(_\d+)*\s*$/.test(text)) throw new SyntaxError(`invalid literal for int() with base 10: '${text}'`);
  return Number(text.trim().replace(/_/g, ''));
}

function window(post: Post, days: Days): [string, number][] {
  const hour = post.time ? pyInt(String(post.time).slice(0, 2)) : 0;
  const out: [string, number][] = post.date in days ? [[post.date, hour]] : [];
  const later = Object.keys(days).filter((d) => d > post.date).sort();
  for (const d of later.slice(0, DAYS_AFTER)) if (daysBetween(d, post.date) <= 3) out.push([d, 0]);
  return out;
}

function effect(post: Post, days: Days, blocked: Set<string>): Post {
  let actual = 0;
  let expected = 0;
  const compared: string[] = [];
  const measured: string[] = [];
  let provisional = false;
  for (const [day, hour] of window(post, days)) {
    if ((days[day].kind ?? NORMAL) !== NORMAL) continue;
    const sides: string[] = [];
    for (const direction of [-1, 1]) {
      let found = false;
      for (let weeks = 1; weeks <= MAX_WEEKS; weeks++) {
        const other = addDays(day, 7 * weeks * direction);
        const doc = days[other];
        if (doc && (doc.kind ?? NORMAL) === NORMAL && !blocked.has(other)) {
          sides.push(other);
          found = true;
          break;
        }
      }
      if (!found && direction === 1) provisional = true;
    }
    if (!sides.length) continue;
    actual += fromHour(days[day].hours, hour);
    expected += mean(sides.map((other) => fromHour(days[other].hours, hour)));
    compared.push(...sides);
    measured.push(day);
  }
  return {
    ...post,
    measured_days: measured,
    compared_days: compared,
    actual: pyRound(actual),
    expected: pyRound(expected),
    lift_pct: expected ? pyRound(((actual - expected) / expected) * 100, 1) : null,
    provisional,
  };
}

export function effects(posts: Post[], days: Days) {
  const blocked = new Set(posts.flatMap((post) => window(post, days).map(([day]) => day)));
  const results = [...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).map((post) => effect(post, days, blocked));
  const finished = results.filter((r) => r.lift_pct !== null && !r.provisional).map((r) => r.lift_pct as number);
  return {
    posts: results,
    average_lift_pct: finished.length ? pyRound(mean(finished), 1) : null,
    finished: finished.length,
  };
}
