"""Seed the catalog and editorial content from data/*.json.

Each section only touches its own collection — the previous pair of scripts both
wiped `products`, so running the wrong one destroyed the catalog.

    python -m app.seed              # products + content
    python -m app.seed --products   # catalog only
    python -m app.seed --content    # What's New only
    python -m app.seed --force      # discard admin edits, make the DB match the files
    python -m app.seed --prices     # take every price from catalog.json, keep other admin edits

Two sources of truth have to coexist here: these files, which arrive by git
push, and the admin dashboard, which writes straight to MongoDB. Anything saved
through the dashboard carries `edited_at`, and the seeder leaves those items
alone — otherwise the next deploy would silently revert a price someone fixed in
the browser. `--force` is the deliberate way back to the file version.

`--prices` is the narrow version of that, for when the till's price list has
changed and catalog.json carries the new figures: it overwrites `price_huf` on
every product, edited or not, and touches nothing else. An item edited in the
dashboard stays marked as edited, so its photos and copy stay protected.
"""
import argparse
import json
import sys

from pymongo import MongoClient

from app.config import DATA_DIR, settings
from app.models import PostUpsert, ProductUpsert

CATALOG_FILE = DATA_DIR / "catalog.json"
CONTENT_FILE = DATA_DIR / "whats_new.json"

SECTIONS = {
    "products": (CATALOG_FILE, "products"),
    "content": (CONTENT_FILE, "posts"),
}

# The fields a document of each kind can carry. A field the file leaves out is
# removed from the database, so taking a key out of catalog.json (say,
# "stock_photos") actually takes it off the site — $set alone only ever adds.
KNOWN_FIELDS = {
    "products": set(ProductUpsert.model_fields) - {"id", "active"},
    "content": set(PostUpsert.model_fields) - {"id", "active"},
}


def _load(path, key):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)[key]


def file_document(section: str, doc_id: str) -> dict | None:
    """One item as it stands in data/*.json — what "revert" restores."""
    path, key = SECTIONS[section]
    return next((d for d in _load(path, key) if d["id"] == doc_id), None)


def _upsert(collection, documents, force: bool = False,
            known: frozenset = frozenset()) -> tuple[int, int, int]:
    """Upsert by id, archive what the file no longer lists, keep admin edits.

    Upserting rather than wiping means member-facing ids stay stable. Skipping
    `edited_at` documents means the dashboard and git can both own content
    without one quietly undoing the other.
    """
    seeded, kept, file_ids = 0, 0, []
    for doc in documents:
        file_ids.append(doc["id"])
        if not force:
            existing = collection.find_one({"id": doc["id"]}, {"edited_at": 1})
            if existing and existing.get("edited_at"):
                kept += 1
                continue
        # `active` defaults to True, so a product the file lists again is taken
        # back out of the archive. An explicit `"active": false` is honoured
        # instead: that is how the merch stays in the catalog, with its copy and
        # images intact, while staying off the site.
        fields = {**doc, "active": doc.get("active", True)}
        unset = {field: "" for field in known if field not in doc}
        if force:
            unset.update(edited_at="", edited_by="")
        update = {"$set": fields}
        if unset:
            update["$unset"] = unset
        collection.update_one({"id": doc["id"]}, update, upsert=True)
        seeded += 1

    # Anything the file dropped gets archived — but only if the file is still
    # its owner. Without the `edited_at` guard, a product added in the
    # dashboard would disappear on the next boot for not being in catalog.json.
    stale = {"id": {"$nin": file_ids}, "active": {"$ne": False}}
    if not force:
        stale["edited_at"] = {"$exists": False}
    archived = collection.update_many(stale, {"$set": {"active": False}}).modified_count
    return seeded, archived, kept


def sync_prices(collection, documents) -> list[tuple[str, int, int]]:
    """Set each product's price to the file's, ignoring `edited_at`.

    Only products already in the database are touched — this never creates or
    archives anything. Returns (id, old, new) for every price that changed.
    """
    changed = []
    for doc in documents:
        existing = collection.find_one({"id": doc["id"]}, {"price_huf": 1})
        if existing is None or existing.get("price_huf") == doc["price_huf"]:
            continue
        collection.update_one({"id": doc["id"]}, {"$set": {"price_huf": doc["price_huf"]}})
        changed.append((doc["id"], existing.get("price_huf"), doc["price_huf"]))
    return changed


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--products", action="store_true", help="seed the catalog only")
    parser.add_argument("--content", action="store_true", help="seed What's New only")
    parser.add_argument("--force", action="store_true",
                        help="overwrite items edited in the admin dashboard")
    parser.add_argument("--prices", action="store_true",
                        help="only set product prices from catalog.json, even on edited items")
    args = parser.parse_args(argv)
    both = not (args.products or args.content)

    client = MongoClient(settings.mongo_url)
    database = client[settings.db_name]
    try:
        if args.prices:
            changed = sync_prices(database["products"], _load(CATALOG_FILE, "products"))
            for doc_id, old, new in changed:
                print(f"  {doc_id}: {old} -> {new} Ft")
            print(f"prices: {len(changed)} changed")
            return 0
        for name, wanted in (("products", both or args.products),
                             ("content", both or args.content)):
            if not wanted:
                continue
            path, key = SECTIONS[name]
            seeded, archived, kept = _upsert(
                database[name], _load(path, key), force=args.force,
                known=frozenset(KNOWN_FIELDS[name]))
            note = f", {kept} left as edited in /admin" if kept else ""
            print(f"{name}: {seeded} seeded, {archived} archived{note}")
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
