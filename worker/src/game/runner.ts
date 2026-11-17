// The Coffee Runner simulation, and the authority on every score. Line-for-line port of backend/app/game/runner.py,
// which is mirrored in frontend/src/features/game/runnerSim.js. Integer arithmetic only: every value stays well
// inside 2^53, and the generator is xorshift32 with `>>> 0` where Python masks with 0xFFFFFFFF.

export const TICK_RATE = 60;
export const UNITS = 1000;

export const GRAVITY = 455;
export const JUMP_VELOCITY = 10010;
export const BOOST_VELOCITY = 5600;
export const AIRTIME = Math.floor((2 * JUMP_VELOCITY) / GRAVITY);

export const WORLD_W = 960;
export const PLAYER_X = 80;
export const PLAYER_W = 34;
export const PLAYER_H = 40;

export const START_SPEED = 6;
export const SPEED_STEP = 1;
export const SPEED_EVERY = 900;

export const LATE_FROM = 1800;
export const LATE_SPEED_EVERY = 220;

export const MAX_TICKS = 60 * 60 * 10;

/** (width, height, base, kind) */
export const OBSTACLES: readonly (readonly [number, number, number, number])[] = [
  [24, 30, 0, 0],
  [26, 54, 0, 1],
  [62, 32, 0, 2],
  [34, 76, 0, 3],
  [54, 40, 58, 4],
];
export const UNLOCK_AT = [0, 0, 600, 1500, 1000];

export const SAFETY_START = 152;
export const SAFETY_FLOOR = 106;
export const SAFETY_DECAY_EVERY = 26;

export const SPREAD_START = 260;
export const SPREAD_FLOOR = 70;
export const SPREAD_DECAY_EVERY = 7;

function xorshift(state: number): number {
  state = (state ^ (state << 13)) >>> 0;
  state = (state ^ (state >>> 17)) >>> 0;
  state = (state ^ (state << 5)) >>> 0;
  return state;
}

export function speedAt(tick: number): number {
  if (tick < LATE_FROM) return START_SPEED + Math.floor(tick / SPEED_EVERY) * SPEED_STEP;
  const settled = START_SPEED + Math.floor(LATE_FROM / SPEED_EVERY) * SPEED_STEP;
  return settled + Math.floor((tick - LATE_FROM) / LATE_SPEED_EVERY) * SPEED_STEP;
}

export const safetyAt = (tick: number) => Math.max(SAFETY_FLOOR, SAFETY_START - Math.floor(tick / SAFETY_DECAY_EVERY));
export const spreadAt = (tick: number) => Math.max(SPREAD_FLOOR, SPREAD_START - Math.floor(tick / SPREAD_DECAY_EVERY));
export const minGapAt = (speed: number, tick: number) => Math.floor((AIRTIME * speed * safetyAt(tick)) / 100);

export interface Result {
  score: number;
  ticks: number;
  died: boolean;
  reason: string;
  obstacles_passed: number;
}

/** Python's `seed & 0xFFFFFFFF` for any integer, including ones beyond 2^32 or negative. */
function low32(seed: number): number {
  return Number(BigInt.asUintN(32, BigInt(Math.trunc(seed))));
}

export function simulate(seed: number, jumps: number[]): Result {
  let rng = low32(seed) || 1;
  const pressAt = new Set<number>();
  for (const j of jumps) {
    const t = Math.trunc(j);
    if (t >= 0 && t < MAX_TICKS) pressAt.add(t);
  }

  const s = { y: 0, vy: 0, boosted: false, distance: 0, speed: START_SPEED, obstacles: [] as number[][], nextGap: 0, sinceSpawn: 0, passed: 0 };
  rng = xorshift(rng);
  s.nextGap = minGapAt(START_SPEED, 0) + (rng % spreadAt(0));

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    if (pressAt.has(tick)) {
      if (s.y === 0) {
        s.vy = JUMP_VELOCITY;
        s.boosted = false;
      } else if (!s.boosted && s.vy > 0) {
        s.vy += BOOST_VELOCITY;
        s.boosted = true;
      }
    }

    if (s.vy !== 0 || s.y > 0) {
      s.y += s.vy;
      s.vy -= GRAVITY;
      if (s.y <= 0) {
        s.y = 0;
        s.vy = 0;
        s.boosted = false;
      }
    }

    s.speed = speedAt(tick);
    s.distance += s.speed;
    s.sinceSpawn += s.speed;

    if (s.sinceSpawn >= s.nextGap) {
      s.sinceSpawn = 0;
      rng = xorshift(rng);
      const choices: number[] = [];
      UNLOCK_AT.forEach((unlock, i) => { if (tick >= unlock) choices.push(i); });
      const [width, height, base, kind] = OBSTACLES[choices[rng % choices.length]];
      rng = xorshift(rng);
      s.nextGap = minGapAt(s.speed, tick) + (rng % spreadAt(tick));
      s.obstacles.push([WORLD_W, width, height, base, kind]);
    }

    const playerY = Math.floor(s.y / UNITS);
    const remaining: number[][] = [];
    for (const [ox0, ow, oh, base, kind] of s.obstacles) {
      const ox = ox0 - s.speed;
      if (ox + ow < 0) {
        s.passed += 1;
        continue;
      }
      remaining.push([ox, ow, oh, base, kind]);
      if (ox < PLAYER_X + PLAYER_W && ox + ow > PLAYER_X && playerY < base + oh && playerY + PLAYER_H > base) {
        s.obstacles = remaining;
        return { score: s.distance, ticks: tick, died: true, reason: 'hit', obstacles_passed: s.passed };
      }
    }
    s.obstacles = remaining;
  }

  return { score: s.distance, ticks: MAX_TICKS, died: false, reason: 'ceiling', obstacles_passed: s.passed };
}
