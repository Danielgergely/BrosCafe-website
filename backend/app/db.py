"""Mongo client, collection handles and index setup."""
import logging

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(settings.mongo_url)
db = client[settings.db_name]

users = db.users
members = db.members
transactions = db.transactions
analytics_events = db.analytics_events
magic_tokens = db.magic_tokens
app_settings = db.settings
content = db.content
products = db.products
media = db.media
contact_log = db.contact_log
game_runs = db.game_runs
wallet_registrations = db.wallet_registrations
voided_passes = db.voided_passes
wallet_stats = db.wallet_stats


async def ensure_indexes() -> None:
    await users.create_index("email", unique=True)
    await users.create_index("id")
    await members.create_index("code", unique=True)
    await members.create_index("email", unique=True)
    await members.create_index("wallet_serial")
    await members.create_index("loyalty_token")
    await transactions.create_index("at")
    await transactions.create_index("code")
    await analytics_events.create_index("at")
    await analytics_events.create_index("type")
    await magic_tokens.create_index("token_hash")
    await magic_tokens.create_index("expires_at", expireAfterSeconds=0)
    await products.create_index("id", unique=True)
    await content.create_index("id", unique=True)
    await media.create_index("id", unique=True)
    await media.create_index("uploaded_at")
    # The contact-form rate limiter only looks back an hour, so let Mongo drop
    # the rows rather than accumulating them forever.
    await contact_log.create_index("at", expireAfterSeconds=7200)
    await game_runs.create_index("run_id", unique=True)
    # The leaderboard sorts finished runs by score within a time window.
    await game_runs.create_index([("finished", 1), ("finished_at", -1), ("score", -1)])
    await game_runs.create_index([("code", 1), ("started_at", -1)])
    await wallet_registrations.create_index([("device_id", 1), ("serial", 1)])
    await wallet_registrations.create_index("serial")
    # Only registrations for a closed card carry expire_at, so live members are
    # untouched — Mongo drops a device token once its void has had time to land.
    await wallet_registrations.create_index("expire_at", expireAfterSeconds=0)
    await voided_passes.create_index("serial", unique=True)


def close() -> None:
    client.close()
