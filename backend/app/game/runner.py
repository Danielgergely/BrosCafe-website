"""The Coffee Runner simulation, and the authority on every score.

A browser can claim any score it likes, so it does not get to. The client
sends the seed it was issued and the ticks on which the player pressed; this
module replays the run and works out the score itself. Nothing the browser
says about its own result is trusted.

That only holds if both implementations agree exactly, which is why there is
not a single floating-point number in here: floats drift between JavaScript
and Python, and a drift of one unit at tick 900 is an honest player being told
they cheated. Everything is 32-bit integer arithmetic, mirrored line for line
in frontend/src/features/game/runnerSim.js.

If you change anything here, change it there too and run `yarn runner:check`.
A divergence does not crash — it quietly rejects real scores, which is worse.
"""
from dataclasses import dataclass, field

# --- timing ----------------------------------------------------------------
TICK_RATE = 60
UNITS = 1000            # vertical positions are in thousandths of a pixel

# --- the jump --------------------------------------------------------------
GRAVITY = 455
JUMP_VELOCITY = 10010   # ~110px, about 44 ticks in the air
# A second press while still rising. Deliberately a help rather than a
# requirement: a player who never discovers it can still clear everything.
BOOST_VELOCITY = 5600
AIRTIME = 2 * JUMP_VELOCITY // GRAVITY

# --- the world -------------------------------------------------------------
WORLD_W = 960
PLAYER_X = 80
PLAYER_W = 34
PLAYER_H = 40

START_SPEED = 6
SPEED_STEP = 1
SPEED_EVERY = 900       # +1 every 15 seconds
# Capped, because past this the player cannot see an obstacle in time to
# react. Difficulty keeps rising through what is on the track, not raw pace.
MAX_SPEED = 17

MAX_TICKS = 60 * 60 * 10

# (width, height, base, kind). `base` is how far off the ground it floats, so
# a shelf is cleared by *not* jumping — the first thing on the track that
# punishes a nervous player rather than a slow one. Kind picks the drawing.
#   0 bean         low and narrow, a hop
#   1 portafilter  tall
#   2 sack         wide and low
#   3 grinder      tall, comfortable only with the boost
#   4 shelf        floats overhead: stay down, or lose the run to your own jump
OBSTACLES = (
    (24, 30, 0, 0),
    (26, 54, 0, 1),
    (62, 32, 0, 2),
    (34, 76, 0, 3),
    (54, 40, 58, 4),
)
# Each shape waits its turn, so the opening is readable and the later run is
# the part that sorts people out.
UNLOCK_AT = (0, 0, 600, 1500, 1000)

# Obstacles are never placed closer together than a jump takes, so a run is
# always physically survivable. What tightens is the margin on top: it starts
# generous and decays, taking the time spent on the ground between jumps from
# about half a second down to a tenth. That is where the difficulty lives —
# not in raw speed, which only removes the chance to see anything coming.
SAFETY_START = 152      # percent of a jump's length
SAFETY_FLOOR = 106      # never below 100, or the run becomes impossible
SAFETY_DECAY_EVERY = 26 # lose a point of margin this often

# The luck: how much slack the generator may add on top. It shrinks too, so
# late runs are uniformly tight and an early one can be kind.
SPREAD_START = 260
SPREAD_FLOOR = 70
SPREAD_DECAY_EVERY = 7


def _xorshift(state: int) -> int:
    """xorshift32, chosen because it reproduces exactly in JavaScript with
    `>>>` — most generators do not."""
    state ^= (state << 13) & 0xFFFFFFFF
    state ^= state >> 17
    state ^= (state << 5) & 0xFFFFFFFF
    return state & 0xFFFFFFFF


def speed_at(tick: int) -> int:
    return min(MAX_SPEED, START_SPEED + (tick // SPEED_EVERY) * SPEED_STEP)


def safety_at(tick: int) -> int:
    """The margin over a bare jump, as a percentage, decaying with the run."""
    return max(SAFETY_FLOOR, SAFETY_START - tick // SAFETY_DECAY_EVERY)


def spread_at(tick: int) -> int:
    return max(SPREAD_FLOOR, SPREAD_START - tick // SPREAD_DECAY_EVERY)


def min_gap_at(speed: int, tick: int) -> int:
    """The closest two obstacles may be at this point in the run."""
    return AIRTIME * speed * safety_at(tick) // 100


@dataclass
class Result:
    score: int
    ticks: int
    died: bool
    reason: str
    obstacles_passed: int = 0


@dataclass
class _State:
    tick: int = 0
    y: int = 0
    vy: int = 0
    boosted: bool = False
    distance: int = 0
    speed: int = START_SPEED
    obstacles: list = field(default_factory=list)
    next_gap: int = 0
    since_spawn: int = 0
    passed: int = 0
    dead: bool = False


def simulate(seed: int, jumps: list[int]) -> Result:
    """Replay a run and return what actually happened.

    `jumps` is every tick the player pressed on. On the ground that starts a
    jump; while rising it spends the one boost. A press that can do neither is
    ignored rather than rejected — real players mash the button, and punishing
    that would fail honest runs.
    """
    rng = (seed & 0xFFFFFFFF) or 1
    press_at = {int(t) for t in jumps if 0 <= int(t) < MAX_TICKS}

    s = _State()
    rng = _xorshift(rng)
    s.next_gap = min_gap_at(START_SPEED, 0) + (rng % spread_at(0))

    for tick in range(MAX_TICKS):
        if tick in press_at:
            if s.y == 0:
                s.vy = JUMP_VELOCITY
                s.boosted = False
            elif not s.boosted and s.vy > 0:
                s.vy += BOOST_VELOCITY
                s.boosted = True

        if s.vy != 0 or s.y > 0:
            s.y += s.vy
            s.vy -= GRAVITY
            if s.y <= 0:
                s.y = 0
                s.vy = 0
                s.boosted = False

        s.speed = speed_at(tick)
        s.distance += s.speed
        s.since_spawn += s.speed

        if s.since_spawn >= s.next_gap:
            s.since_spawn = 0
            rng = _xorshift(rng)
            choices = [i for i, unlock in enumerate(UNLOCK_AT) if tick >= unlock]
            width, height, base, kind = OBSTACLES[choices[rng % len(choices)]]
            rng = _xorshift(rng)
            s.next_gap = min_gap_at(s.speed, tick) + (rng % spread_at(tick))
            s.obstacles.append([WORLD_W, width, height, base, kind])

        player_y = s.y // UNITS
        remaining = []
        for ox, ow, oh, base, kind in s.obstacles:
            ox -= s.speed
            if ox + ow < 0:
                s.passed += 1
                continue
            remaining.append([ox, ow, oh, base, kind])
            # Boxes overlap on both axes now, so something can hang overhead
            # and be missed by staying on the ground.
            if (ox < PLAYER_X + PLAYER_W and ox + ow > PLAYER_X
                    and player_y < base + oh and player_y + PLAYER_H > base):
                s.obstacles = remaining
                return Result(s.distance, tick, True, "hit", s.passed)
        s.obstacles = remaining

    return Result(s.distance, MAX_TICKS, False, "ceiling", s.passed)
