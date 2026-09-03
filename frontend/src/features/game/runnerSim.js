/**
 * The Coffee Runner simulation.
 *
 * A line-for-line mirror of backend/app/game/runner.py, which is the authority
 * on every score: this file draws the game, that one decides what it was worth.
 * If the two ever disagree, honest players get told they cheated — so there is
 * no floating-point arithmetic anywhere here, and every shift is written the
 * way JavaScript needs to match Python's 32-bit integer behaviour.
 *
 * Change one, change the other, then run `yarn runner:check`.
 */
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
const SPEED_STEP = 1;
const SPEED_EVERY = 900;
export const MAX_SPEED = 17;
export const MAX_TICKS = 60 * 60 * 10;

/** width, height, kind — kind picks the drawing, the box is the physics. */
export const OBSTACLES = [
  [24, 30, 0],
  [26, 54, 1],
  [62, 32, 2],
  [34, 76, 3],
];
const UNLOCK_AT = [0, 0, 900, 2100];

const GAP_SAFETY_NUM = 17;
const GAP_SAFETY_DEN = 10;
const GAP_SPREAD = 260;

function xorshift(state) {
  state ^= (state << 13) >>> 0;
  state >>>= 0;
  state ^= state >>> 17;
  state ^= (state << 5) >>> 0;
  return state >>> 0;
}

export function speedAt(tick) {
  return Math.min(MAX_SPEED, START_SPEED + Math.floor(tick / SPEED_EVERY) * SPEED_STEP);
}

/** Never closer than a full jump plus a quarter, whatever the speed. */
export function minGapAt(speed) {
  return Math.floor((AIRTIME * speed * GAP_SAFETY_NUM) / GAP_SAFETY_DEN);
}

export function createRun(seed) {
  let rng = (seed >>> 0) || 1;
  rng = xorshift(rng);

  const state = {
    tick: 0,
    y: 0,
    vy: 0,
    boosted: false,
    distance: 0,
    speed: START_SPEED,
    obstacles: [],
    nextGap: minGapAt(START_SPEED) + (rng % GAP_SPREAD),
    sinceSpawn: 0,
    passed: 0,
    dead: false,
  };

  function step(pressed) {
    if (state.dead) return state;
    const t = state.tick;

    if (pressed) {
      if (state.y === 0) {
        state.vy = JUMP_VELOCITY;
        state.boosted = false;
      } else if (!state.boosted && state.vy > 0) {
        state.vy += BOOST_VELOCITY;
        state.boosted = true;
      }
    }

    if (state.vy !== 0 || state.y > 0) {
      state.y += state.vy;
      state.vy -= GRAVITY;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
        state.boosted = false;
      }
    }

    state.speed = speedAt(t);
    state.distance += state.speed;
    state.sinceSpawn += state.speed;

    if (state.sinceSpawn >= state.nextGap) {
      state.sinceSpawn = 0;
      rng = xorshift(rng);
      const choices = [];
      for (let i = 0; i < UNLOCK_AT.length; i += 1) if (t >= UNLOCK_AT[i]) choices.push(i);
      const [width, height, kind] = OBSTACLES[choices[rng % choices.length]];
      rng = xorshift(rng);
      state.nextGap = minGapAt(state.speed) + (rng % GAP_SPREAD);
      state.obstacles.push([WORLD_W, width, height, kind]);
    }

    const playerY = Math.floor(state.y / UNITS);
    const remaining = [];
    let hit = false;
    for (const [ox0, ow, oh, kind] of state.obstacles) {
      const ox = ox0 - state.speed;
      if (ox + ow < 0) {
        state.passed += 1;
        continue;
      }
      remaining.push([ox, ow, oh, kind]);
      if (ox < PLAYER_X + PLAYER_W && ox + ow > PLAYER_X && playerY < oh) hit = true;
    }
    state.obstacles = remaining;
    state.dead = hit;
    state.tick = t + 1;
    return state;
  }

  return { state, step };
}

/** Replay a whole run through the same stepper the live game uses. */
export function simulate(seed, jumps, options = {}) {
  const { untilTick = MAX_TICKS } = options;
  const pressAt = new Set(jumps.map((t) => Math.trunc(t)).filter((t) => t >= 0 && t < MAX_TICKS));
  const run = createRun(seed);
  const limit = Math.min(untilTick, MAX_TICKS);

  for (let tick = 0; tick < limit; tick += 1) {
    run.step(pressAt.has(tick));
    if (run.state.dead) {
      return { score: run.state.distance, ticks: tick, died: true, reason: "hit" };
    }
  }
  return { score: run.state.distance, ticks: limit, died: false, reason: "ceiling" };
}
