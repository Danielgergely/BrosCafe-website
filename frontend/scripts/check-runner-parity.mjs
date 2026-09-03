/**
 * Proves the Coffee Runner simulations still agree.
 *
 * The score a player gets is decided by backend/app/game/runner.py replaying
 * their input. This file runs the browser's copy over a spread of seeds and
 * input patterns, hands the results to the Python one, and fails if they
 * differ anywhere.
 *
 * It matters because a divergence does not crash anything. It quietly rejects
 * runs that really happened, and the first sign would be a customer saying
 * their score did not count. Run it after touching either simulation.
 *
 * On sensitivity, measured rather than assumed: collisions are quantised to
 * whole pixels, so a constant that differs by one produces no behavioural
 * difference at all — 0 of 3000 runs. From two upwards it shows in 13% and
 * this check fails loudly. So it catches what matters and tolerates what
 * cannot.
 *
 *   yarn runner:check
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { simulate } from "../src/features/game/runnerSim.js";

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, "..", "..", "backend");
const python = join(backend, ".venv", "bin", "python");

// A spread that covers never jumping, sparse play, metronomic play and
// mashing — the last one matters because presses while airborne are ignored,
// and that rule has to be ignored identically on both sides.
function buildCases(count = 400) {
  let state = 987654321;
  const rand = (n) => {
    state ^= (state << 13) >>> 0; state >>>= 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    return (state >>> 0) % n;
  };
  const cases = [];
  for (let i = 0; i < count; i += 1) {
    const seed = rand(4294967294) + 1;
    let jumps = [];
    if (i % 4 === 1) {
      for (let k = 0; k < 1 + rand(40); k += 1) jumps.push(rand(900));
    } else if (i % 4 === 2) {
      const every = [7, 11, 23][rand(3)];
      for (let tick = 0; tick < 700; tick += every) jumps.push(tick);
    } else if (i % 4 === 3) {
      for (let k = 0; k < 140; k += 1) jumps.push(rand(1400));
    }
    jumps = [...new Set(jumps)].sort((a, b) => a - b);
    cases.push([seed, jumps]);
  }
  return cases;
}

const cases = buildCases();
const mine = cases.map(([seed, jumps]) => {
  const r = simulate(seed, jumps);
  return [r.score, r.ticks, r.died ? 1 : 0];
});

const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(backend)})
from app.game.runner import simulate
cases = json.loads(sys.stdin.read())
print(json.dumps([[ (r := simulate(s, j)).score, r.ticks, 1 if r.died else 0 ] for s, j in cases]))
`;

let theirs;
try {
  theirs = JSON.parse(execFileSync(python, ["-c", script], {
    input: JSON.stringify(cases),
    encoding: "utf8",
    env: { ...process.env, MONGO_URL: "x", DB_NAME: "x", JWT_SECRET: "x" },
  }));
} catch (error) {
  console.error("Could not run the Python simulation. Is backend/.venv set up?");
  console.error(String(error.stderr || error.message).slice(0, 400));
  process.exit(2);
}

const bad = [];
for (let i = 0; i < cases.length; i += 1) {
  const [a, b] = [mine[i], theirs[i]];
  if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) {
    bad.push({ seed: cases[i][0], jumps: cases[i][1].length, js: a, python: b });
  }
}

console.log(`runner parity: ${cases.length} cases`);
if (bad.length) {
  console.error(`\n✗ ${bad.length} divergence(s) — real scores would be rejected\n`);
  for (const b of bad.slice(0, 5)) console.error(" ", JSON.stringify(b));
  process.exit(1);
}
console.log("✓ the browser and the server agree");
