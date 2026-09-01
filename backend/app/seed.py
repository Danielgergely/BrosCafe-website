"""Seed the catalog and editorial content from data/*.json.

Each section only touches its own collection — the previous pair of scripts both
wiped `products`, so running the wrong one destroyed the catalog.

    python -m app.seed              # products + content
    python -m app.seed --products   # catalog only
    python -m app.seed --content    # What's New only
"""
import argparse
import json
import sys

from pymongo import MongoClient

from app.config import DATA_DIR, settings

CATALOG_FILE = DATA_DIR / "catalog.json"
CONTENT_FILE = DATA_DIR / "whats_new.json"


def _load(path, key):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)[key]


def _upsert(collection, documents) -> tuple[int, int]:
    """Upsert by id and archive anything no longer in the source file.

    Upserting rather than wiping means member-facing ids stay stable and any
    field an admin edited through the API is replaced deliberately, not lost.
    """
    seeded_ids = []
    for doc in documents:
        doc = {**doc, "active": True}
        collection.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        seeded_ids.append(doc["id"])
    archived = collection.update_many(
        {"id": {"$nin": seeded_ids}, "active": {"$ne": False}},
        {"$set": {"active": False}}).modified_count
    return len(seeded_ids), archived


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--products", action="store_true", help="seed the catalog only")
    parser.add_argument("--content", action="store_true", help="seed What's New only")
    args = parser.parse_args(argv)
    both = not (args.products or args.content)

    client = MongoClient(settings.mongo_url)
    database = client[settings.db_name]
    try:
        if both or args.products:
            seeded, archived = _upsert(database.products, _load(CATALOG_FILE, "products"))
            print(f"products: {seeded} seeded, {archived} archived")
        if both or args.content:
            seeded, archived = _upsert(database.content, _load(CONTENT_FILE, "posts"))
            print(f"content:  {seeded} seeded, {archived} archived")
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
