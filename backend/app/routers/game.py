"""Coffee Runner: seeds out, replays in, scores decided here.

The browser never reports its own score. It asks for a run, plays the seed it
is given, and sends back the ticks on which the player jumped; the server
replays that input through the same simulation and works out the result
itself. A forged score would have to be a forged *run* that genuinely survives
that long, which is a different problem from editing a number.

Members only, so a leaderboard names real people and the weekly winner is
someone who can actually be handed a coffee.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.game.runner import MAX_TICKS, TICK_RATE, simulate
from app.models import RunFinish
from app.security import get_current_customer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/game", tags=["game"])

# A run has to be finished in a sitting. Long enough for a ten-minute game
# plus a slow connection, short enough that seeds cannot be hoarded.
RUN_TTL_MINUTES = 20
RUNS_PER_HOUR = 60

# A replay claiming 90 seconds of play that arrives 4 seconds after the seed
# was issued did not happen at a keyboard. The allowance is generous: phones
# throttle background tabs, and a stutter must never cost someone a real run.
MIN_ELAPSED_RATIO = 0.55

PERIODS = {
    "week": timedelta(days=7),
    "month": timedelta(days=30),
    "year": timedelta(days=365),
    "all": None,
}


@router.post("/start")
async def start_run(member: dict = Depends(get_current_customer)):
    """Issue a seed. The world the player sees is decided here, not there."""
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = await db.game_runs.count_documents(
        {"code": member["code"], "started_at": {"$gte": since}})
    if recent >= RUNS_PER_HOUR:
        raise HTTPException(status_code=429, detail="That is a lot of coffee. Try again later.")

    run = {
        "run_id": secrets.token_urlsafe(18),
        "code": member["code"],
        "name": member["name"],
        "seed": secrets.randbelow(2**32 - 1) + 1,
        "started_at": datetime.now(timezone.utc),
        "finished": False,
    }
    await db.game_runs.insert_one(dict(run))
    return {"run_id": run["run_id"], "seed": run["seed"]}


@router.post("/finish")
async def finish_run(body: RunFinish, member: dict = Depends(get_current_customer)):
    run = await db.game_runs.find_one({"run_id": body.run_id, "code": member["code"]})
    if not run:
        raise HTTPException(status_code=404, detail="Unknown run")
    if run.get("finished"):
        # One score per seed, or a good run could be submitted repeatedly.
        raise HTTPException(status_code=409, detail="That run has already been scored")

    started = run["started_at"].replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if now - started > timedelta(minutes=RUN_TTL_MINUTES):
        raise HTTPException(status_code=410, detail="That run expired — start a new one")

    result = simulate(run["seed"], body.jumps)

    elapsed = (now - started).total_seconds()
    played = result.ticks / TICK_RATE
    if elapsed < played * MIN_ELAPSED_RATIO:
        logger.warning("Run %s claimed %.1fs of play in %.1fs — rejected",
                       body.run_id, played, elapsed)
        await db.game_runs.update_one({"run_id": body.run_id},
                                      {"$set": {"finished": True, "rejected": True}})
        raise HTTPException(status_code=400, detail="That run could not be verified")

    await db.game_runs.update_one({"run_id": body.run_id}, {"$set": {
        "finished": True,
        "score": result.score,
        "ticks": result.ticks,
        "finished_at": now,
        "jump_count": len(body.jumps),
    }})
    return {"score": result.score, "ticks": result.ticks, "died": result.died}


@router.get("/leaderboard")
async def leaderboard(period: str = "week", limit: int = 10):
    """Best single run per player, for the period. Ties go to whoever got
    there first, which rewards the person who actually set the bar."""
    if period not in PERIODS:
        raise HTTPException(status_code=400, detail="Unknown period")

    match: dict = {"finished": True, "score": {"$gt": 0}, "rejected": {"$ne": True}}
    window = PERIODS[period]
    if window:
        match["finished_at"] = {"$gte": datetime.now(timezone.utc) - window}

    rows = await db.game_runs.aggregate([
        {"$match": match},
        {"$sort": {"score": -1, "finished_at": 1}},
        {"$group": {"_id": "$code", "name": {"$first": "$name"},
                    "score": {"$first": "$score"}, "at": {"$first": "$finished_at"}}},
        {"$sort": {"score": -1, "at": 1}},
        {"$limit": max(1, min(limit, 50))},
    ]).to_list(50)

    return [{"name": r["name"], "score": r["score"], "at": r["at"].isoformat()}
            for r in rows]


@router.get("/me")
async def my_best(member: dict = Depends(get_current_customer)):
    """Someone's own bests, so the board means something even from 40th."""
    out = {}
    for name, window in PERIODS.items():
        match: dict = {"code": member["code"], "finished": True, "rejected": {"$ne": True}}
        if window:
            match["finished_at"] = {"$gte": datetime.now(timezone.utc) - window}
        best = await db.game_runs.find(match, {"_id": 0, "score": 1}).sort("score", -1).to_list(1)
        out[name] = best[0]["score"] if best else 0
    return out
