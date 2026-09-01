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
wallet_registrations = db.wallet_registrations
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
    await wallet_registrations.create_index([("device_id", 1), ("serial", 1)])


def close() -> None:
    client.close()
