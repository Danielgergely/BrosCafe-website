"""Admin surface: stats, member list, transactions, thresholds, product editing."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.models import ProductUpsert, SettingsUpdate
from app.security import require_admin
from app.services import analytics, app_settings, members
from app.wallet import apple, google

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)], tags=["admin"])


# ------------------------------------------------------------------ overview
@router.get("/stats")
async def stats():
    rows = await db.members.aggregate([
        {"$group": {"_id": None,
                    "coffees": {"$sum": "$total_coffees"},
                    "rewards": {"$sum": "$rewards_redeemed"}}}
    ]).to_list(1)
    totals = rows[0] if rows else {"coffees": 0, "rewards": 0}
    return {
        "members": await db.members.count_documents({}),
        "coffees": totals["coffees"],
        "rewards_redeemed": totals["rewards"],
    }


@router.get("/members")
async def list_members():
    docs = await db.members.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [members.public(d) for d in docs]


@router.get("/transactions")
async def list_transactions(limit: int = 200, type: Optional[str] = None,
                            code: Optional[str] = None):
    query = {k: v for k, v in (("type", type), ("code", code)) if v}
    return await db.transactions.find(query, {"_id": 0}).sort("at", -1).to_list(limit)


# ------------------------------------------------------------------ settings
@router.get("/settings")
async def read_settings():
    return await app_settings.read()


@router.put("/settings")
async def write_settings(body: SettingsUpdate):
    return await app_settings.write(body.model_dump(exclude_none=True))


# ------------------------------------------------------------------ analytics
@router.get("/analytics/overview")
async def analytics_overview():
    return await analytics.overview()


@router.get("/analytics/funnel")
async def analytics_funnel():
    return await analytics.funnel()


@router.get("/analytics/customers")
async def analytics_customers():
    return await analytics.customers()


@router.get("/analytics/coffee")
async def analytics_coffee():
    return await analytics.coffee()


@router.get("/analytics/rewards")
async def analytics_rewards():
    return await analytics.rewards()


@router.get("/analytics/retention")
async def analytics_retention():
    return await analytics.retention()


@router.get("/analytics/segments")
async def analytics_segments():
    return await analytics.segments()


# ------------------------------------------------------------------ catalog
@router.get("/products")
async def admin_list_products():
    """Includes archived products, which the public endpoint hides."""
    return await db.products.find({}, {"_id": 0}).sort("order", 1).to_list(200)


@router.post("/products")
async def upsert_product(body: ProductUpsert):
    doc = body.model_dump(exclude_none=True)
    await db.products.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
    return doc


@router.delete("/products/{product_id}")
async def archive_product(product_id: str):
    """Archives rather than deletes, so pairings pointing at it never dangle."""
    result = await db.products.update_one({"id": product_id}, {"$set": {"active": False}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"id": product_id, "active": False}


# ------------------------------------------------------------------ wallet
@router.get("/wallet/status")
async def wallet_status():
    stats_doc = await db.wallet_stats.find_one({"_id": "stats"}) or {}
    last = await db.members.find(
        {"wallet_updated_at": {"$exists": True}},
        {"_id": 0, "wallet_updated_at": 1}).sort("wallet_updated_at", -1).to_list(1)
    return {
        "config": apple.config_status(),
        "google_config": google.config_status(),
        "passes_issued": await db.members.count_documents({"wallet_serial": {"$exists": True}}),
        "google_passes_issued": await db.members.count_documents(
            {"google_object_id": {"$exists": True}}),
        "active_registrations": await db.wallet_registrations.count_documents({}),
        "last_update": last[0]["wallet_updated_at"] if last else None,
        "generation_failures": stats_doc.get("gen_failures", 0),
        "push_failures": stats_doc.get("push_failures", 0),
        "google_generation_failures": stats_doc.get("google_gen_failures", 0),
        "google_push_failures": stats_doc.get("google_push_failures", 0),
    }
