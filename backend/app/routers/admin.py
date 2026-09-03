"""Admin surface: stats, members, transactions, thresholds, and the content
editor — catalog, journal posts and uploaded photography."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app import db, seed
from app.config import settings
from app.models import PostUpsert, ProductUpsert, SettingsUpdate
from app.security import require_admin
from app.services import analytics, app_settings, media, members
from app.wallet import apple, google

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)], tags=["admin"])


def _stamp(doc: dict, user: dict) -> dict:
    """Mark a row as dashboard-owned.

    `edited_at` is what stops the file seeder from overwriting this item on the
    next deploy — see app/seed.py. Without it, saving a price here would last
    only until the next git push.
    """
    return {**doc, "edited_at": datetime.now(timezone.utc),
            "edited_by": user.get("email", "admin")}


async def _revert_to_file(collection, section: str, doc_id: str) -> dict:
    """Hand ownership of one item back to data/*.json."""
    original = seed.file_document(section, doc_id)
    if not original:
        raise HTTPException(status_code=404,
                            detail="This item only exists in the dashboard, "
                                   "so there is no file version to restore")
    await collection.update_one(
        {"id": doc_id},
        {"$set": {**original, "active": True},
         "$unset": {"edited_at": "", "edited_by": ""}})
    return original


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


@router.delete("/members/{code}")
async def erase_member(code: str):
    """Delete a member and all their personal data. Not reversible."""
    result = await members.erase(code)
    if not result:
        raise HTTPException(status_code=404, detail="Member not found")
    return result


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


# Fields a product may legitimately not have. Sent as null they mean "remove",
# which $set cannot express — see upsert_product.
OPTIONAL_PRODUCT_FIELDS = (
    "flavor", "tip", "ingredients", "behind", "sizes", "material", "video", "temp",
)


# ------------------------------------------------------------------ catalog
@router.get("/products")
async def admin_list_products():
    """Includes archived products, which the public endpoint hides."""
    return await db.products.find({}, {"_id": 0}).sort("order", 1).to_list(200)


@router.post("/products")
async def upsert_product(body: ProductUpsert, user: dict = Depends(require_admin)):
    doc = _stamp(body.model_dump(exclude_none=True), user)

    # Distinguish "field omitted" from "field explicitly cleared". Dropping a
    # flavour profile has to $unset it: $set-ing null would leave the site
    # rendering four empty bars, since the template only checks for presence.
    update: dict = {"$set": doc}
    cleared = {
        field: ""
        for field in OPTIONAL_PRODUCT_FIELDS
        if field in body.model_fields_set and getattr(body, field) is None
    }
    if cleared:
        update["$unset"] = cleared

    await db.products.update_one({"id": doc["id"]}, update, upsert=True)
    return doc


@router.post("/products/{product_id}/reset")
async def reset_product(product_id: str):
    """Discard dashboard edits and restore the version in data/catalog.json."""
    return await _revert_to_file(db.products, "products", product_id)


@router.delete("/products/{product_id}")
async def archive_product(product_id: str):
    """Archives rather than deletes, so pairings pointing at it never dangle."""
    result = await db.products.update_one(
        {"id": product_id}, {"$set": {"active": False, "edited_at": datetime.now(timezone.utc)}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"id": product_id, "active": False}


# ------------------------------------------------------------------ journal
@router.get("/whats-new")
async def admin_list_posts():
    """Includes archived posts, which the public feed hides."""
    return await db.content.find({}, {"_id": 0}).sort("order", 1).to_list(100)


@router.post("/whats-new")
async def upsert_post(body: PostUpsert, user: dict = Depends(require_admin)):
    doc = _stamp(body.model_dump(exclude_none=True), user)
    await db.content.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
    return doc


@router.delete("/whats-new/{post_id}")
async def archive_post(post_id: str):
    result = await db.content.update_one(
        {"id": post_id}, {"$set": {"active": False, "edited_at": datetime.now(timezone.utc)}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Post not found")
    return {"id": post_id, "active": False}


@router.post("/whats-new/{post_id}/reset")
async def reset_post(post_id: str):
    """Discard dashboard edits and restore the version in data/whats_new.json."""
    return await _revert_to_file(db.content, "content", post_id)


# ------------------------------------------------------------------ media
@router.get("/media")
async def list_media():
    return await media.listing()


@router.post("/media")
async def upload_media(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    limit = settings.max_upload_mb * 1024 * 1024
    # Read one byte past the limit: enough to know it was exceeded without
    # pulling an arbitrarily large upload into memory.
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413,
                            detail=f"Keep files under {settings.max_upload_mb} MB")

    kind = media.sniff(data[:media.SNIFF_BYTES])
    if kind not in media.ALLOWED:
        raise HTTPException(status_code=415,
                            detail="Upload a JPEG, PNG, WebP, AVIF or MP4")
    return await media.save(data, file.filename or "upload", kind,
                            user.get("email", "admin"))


@router.delete("/media/{filename}")
async def delete_media(filename: str):
    if not media.FILENAME.match(filename):
        raise HTTPException(status_code=404, detail="Not found")

    # Deleting a file that is still on the site would leave a broken image with
    # no clue where. Name the items using it instead.
    used_by = await media.usage(media.public_url(filename))
    if used_by:
        raise HTTPException(status_code=409,
                            detail=f"Still used by: {', '.join(used_by)}")
    if not await media.delete(filename):
        raise HTTPException(status_code=404, detail="Not found")
    return {"filename": filename, "deleted": True}


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
