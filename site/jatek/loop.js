// Coffee Runner: the fixed-timestep driver around the shared simulation (runnerSim.js, the one copy the server
// replay in worker/src/game must match). No DOM here, so node can replay it against the Worker (worker/src/game).
import { MAX_TICKS, TICK_RATE, createRun } from './runnerSim.js';

export const STEP_MS = 1000 / TICK_RATE;

export function createLoop(seed) {
  const run = createRun(seed);
  const s = run.state;
  const jumps = [];
  let carry = 0;
  let pending = false;
  const done = () => s.dead || s.tick >= MAX_TICKS;

  return {
    state: s,
    jumps,
    done,
    press() { pending = true; },
    /** How far into the next tick the clock is (0–1), for drawing between ticks. */
    alpha: () => carry / STEP_MS,
    /** Run the ticks that fit into `ms`. Catch-up is capped so a stalled tab does not fast-forward the run. */
    advance(ms) {
      carry += ms;
      if (carry > 250) carry = 250;
      while (carry >= STEP_MS && !done()) {
        const pressed = pending;
        pending = false;
        // Every press the simulation acts on goes to the server: the jump and the mid-air boost.
        if (pressed && (s.y === 0 || (!s.boosted && s.vy > 0))) jumps.push(s.tick);
        run.step(pressed);
        carry -= STEP_MS;
      }
    },
  };
}
