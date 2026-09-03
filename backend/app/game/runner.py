"""The Coffee Runner simulation, and the authority on every score.

A browser can claim any score it likes, so it does not get to. The client
sends the seed it was issued and the ticks on which the player jumped; this
module replays the run and works out the score itself. Nothing the browser
says about its own result is trusted.

That only holds if both implementations agree exactly, which is why there is
not a single floating-point number in here: floats drift between JavaScript
and Python, and a drift of one unit at tick 900 is an honest player being told
they cheated. Everything is 32-bit integer arithmetic, mirrored line for line
in frontend/src/features/game/runnerSim.js, and tests/test_runner_parity
checks the two still agree.
"""
from dataclasses import dataclass

# --- world -----------------------------------------------------------------
TICK_RATE = 60          # simulation steps per second
UNITS = 1000            # vertical positions are in thousandths of a pixel

GRAVITY = 455           # units per tick, per tick
JUMP_VELOCITY = 10010   # roughly a 110px arc lasting ~0.75s
PLAYER_X = 60           # px, fixed — the world moves, the cup does not
PLAYER_W = 34
PLAYER_H = 40

START_SPEED = 6         # px per tick
SPEED_STEP = 1          # +1 px per tick ...
SPEED_EVERY = 600       # ... every 10 seconds, without limit, so a run ends
MAX_TICKS = 60 * 60 * 10  # ten minutes: a hard ceiling on any single run

OBSTACLE_W = 26
OBSTACLE_H = (34, 52)   # short and tall variants
GAP_MIN = 260           # px between obstacles at the slowest speed
GAP_SPREAD = 220        # plus up to this much, chosen by the seeded generator


def _xorshift(state: int) -> int:
    """xorshift32. Chosen because it is exactly reproducible in JavaScript
    with Math.imul and >>> 0, which most generators are not."""
    state ^= (state << 13) & 0xFFFFFFFF
    state ^= state >> 17
    state ^= (state << 5) & 0xFFFFFFFF
    return state & 0xFFFFFFFF


@dataclass
class Result:
    score: int          # distance travelled, in px
    ticks: int
    died: bool
    reason: str


def simulate(seed: int, jumps: list[int]) -> Result:
    """Replay a run and return what actually happened.

    `jumps` is the ticks on which the player pressed. A press while airborne
    is ignored rather than rejected — a real player mashes the button, and
    punishing that would fail honest runs.
    """
    seed = seed & 0xFFFFFFFF
    if seed == 0:
        seed = 1
    rng = seed

    pressed = sorted({int(t) for t in jumps if 0 <= int(t) < MAX_TICKS})
    press_at = set(pressed)

    y = 0               # units above the ground
    vy = 0
    distance = 0
    speed = START_SPEED

    # Obstacles are (x_px, width, height); x decreases as the world scrolls.
    obstacles: list[tuple[int, int, int]] = []
    rng = _xorshift(rng)
    next_gap = GAP_MIN + (rng % GAP_SPREAD)
    since_spawn = 0

    for tick in range(MAX_TICKS):
        if tick in press_at and y == 0:
            vy = JUMP_VELOCITY

        # Vertical motion first, so a jump on the same tick as an obstacle
        # arriving behaves the same in both implementations.
        if vy != 0 or y > 0:
            y += vy
            vy -= GRAVITY
            if y <= 0:
                y = 0
                vy = 0

        speed = START_SPEED + (tick // SPEED_EVERY) * SPEED_STEP
        distance += speed
        since_spawn += speed

        if since_spawn >= next_gap:
            since_spawn = 0
            rng = _xorshift(rng)
            tall = (rng & 1) == 1
            height = OBSTACLE_H[1] if tall else OBSTACLE_H[0]
            rng = _xorshift(rng)
            # The gap shrinks as the world speeds up, so the run has an end.
            spread = GAP_SPREAD - min(GAP_SPREAD - 40, (speed - START_SPEED) * 12)
            next_gap = GAP_MIN + (rng % max(40, spread)) - (speed - START_SPEED) * 6
            next_gap = max(140, next_gap)
            obstacles.append((800, OBSTACLE_W, height))

        player_top = PLAYER_H + (y // UNITS)
        moved: list[tuple[int, int, int]] = []
        for ox, ow, oh in obstacles:
            ox -= speed
            if ox + ow < 0:
                continue
            moved.append((ox, ow, oh))
            # Axis-aligned overlap in whole pixels.
            if ox < PLAYER_X + PLAYER_W and ox + ow > PLAYER_X:
                if (y // UNITS) < oh:
                    return Result(distance, tick, True, "hit")
        obstacles = moved

    return Result(distance, MAX_TICKS, False, "ceiling")
