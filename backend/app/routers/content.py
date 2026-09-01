"""Public catalog and editorial content. The DB is the single source of truth;
data/catalog.json and data/whats_new.json are what seeds it."""
from fastapi import APIRouter, HTTPException

from app import db

router = APIRouter(tags=["content"])


@router.get("/whats-new")
async def whats_new():
    """Archived posts stay in the database but drop out of the feed, matching
    how the catalog endpoint treats archived products."""
    return await db.content.find(
        {"active": {"$ne": False}}, {"_id": 0}).sort("order", 1).to_list(50)


@router.get("/products")
async def list_products():
    return await db.products.find({"active": {"$ne": False}}, {"_id": 0}).sort("order", 1).to_list(200)


@router.get("/products/{product_id}")
async def get_product(product_id: str):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return doc
