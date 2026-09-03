/**
 * The Coffee Runner simulation.
 *
 * A line-for-line mirror of backend/app/game/runner.py, which is the authority
 * on every score: this file draws the game, that one decides what it was worth.
 * If the two ever disagree, honest players get told they cheated — so there is
 * no floating-point arithmetic anywhere here, and every shift is written the
 * way JavaScript needs to match Python's 32-bit integer behaviour.
 *
 * Any change here must be made there too, and proved by the parity test.
 */
export const TICK_RATE = 60;
export const UNITS = 1000;

export const GRAVITY = 455;
export const JUMP_VELOCITY = 10010;
export const PLAYER_X = 60;
export const PLAYER_W = 34;
export const PLAYER_H = 40;

export const START_SPEED = 6;
const SPEED_STEP = 1;
const SPEED_EVERY = 600;
export const MAX_TICKS = 60 * 60 * 10;

export const OBSTACLE_W = 26;
const OBSTACLE_H = [34, 52];
const GAP_MIN = 260;
const GAP_SPREAD = 220;
export const WORLD_W = 800;

/** xorshift32. `>>> 0` keeps it unsigned, and `>>>` matches Python's shift on
 *  a masked positive integer — `>>` would sign-extend and diverge. */
function xorshift(state) {
  state ^= (state << 13) >>> 0;
  state >>>= 0;
  state ^= state >>> 17;
  state ^= (state << 5) >>> 0;
  return state >>> 0;
}

/**
 * Replay a run. Returns the score and, optionally, the frames for drawing.
 *
 * @param {number} seed        issued by the server
 * @param {number[]} jumps     ticks on which the player pressed
 * @param {object} [options]
 * @param {number} [options.untilTick]  stop early, for live play
 * @param {boolean} [options.trace]     keep per-tick state for rendering
 */
export function createRun(seed) {
  let rng = (seed >>> 0) || 1;
  rng = xorshift(rng);

  const state = {
    tick: 0,
    y: 0,
    vy: 0,
    distance: 0,
    speed: START_SPEED,
    obstacles: [],
    nextGap: GAP_MIN + (rng % GAP_SPREAD),
    sinceSpawn: 0,
    dead: false,
  };

  /** Advance exactly one tick. `pressed` is whether the player jumped on it. */
  function step(pressed) {
    if (state.dead) return state;
    const t = state.tick;

    if (pressed && state.y === 0) state.vy = JUMP_VELOCITY;

    if (state.vy !== 0 || state.y > 0) {
      state.y += state.vy;
      state.vy -= GRAVITY;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
      }
    }

    state.speed = START_SPEED + Math.floor(t / SPEED_EVERY) * SPEED_STEP;
    state.distance += state.speed;
    state.sinceSpawn += state.speed;

    if (state.sinceSpawn >= state.nextGap) {
      state.sinceSpawn = 0;
      rng = xorshift(rng);
      const height = (rng & 1) === 1 ? OBSTACLE_H[1] : OBSTACLE_H[0];
      rng = xorshift(rng);
      const spread = GAP_SPREAD - Math.min(GAP_SPREAD - 40, (state.speed - START_SPEED) * 12);
      let gap = GAP_MIN + (rng % Math.max(40, spread)) - (state.speed - START_SPEED) * 6;
      state.nextGap = Math.max(140, gap);
      state.obstacles.push([WORLD_W, OBSTACLE_W, height]);
    }

    const moved = [];
    let hit = false;
    for (const [ox0, ow, oh] of state.obstacles) {
      const ox = ox0 - state.speed;
      if (ox + ow < 0) continue;
      moved.push([ox, ow, oh]);
      if (ox < PLAYER_X + PLAYER_W && ox + ow > PLAYER_X && Math.floor(state.y / UNITS) < oh) {
        hit = true;
      }
    }
    state.obstacles = moved;
    state.dead = hit;
    state.tick = t + 1;
    return state;
  }

  return { state, step };
}

/** Replay a whole run. Uses the same stepper the live game does. */
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
