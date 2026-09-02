"""Bros Cafe API — application assembly."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from app import db
from app.config import settings
from app.routers import (
    admin, content, customer_auth, members, meta, opening, scan, staff_auth, track, wallet,
)
from app.security import hash_password, verify_password

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

api = APIRouter(prefix="/api")
for module in (meta, staff_auth, customer_auth, members, scan, opening,
               track, content, wallet, admin):
    api.include_router(module.router)

app = FastAPI(title="Bros Cafe API", version="2.0.0")
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=settings.cors_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _seed_admin() -> None:
    """Keep the configured admin account in sync with the environment."""
    if not (settings.admin_email and settings.admin_password):
        logger.warning("ADMIN_EMAIL/ADMIN_PASSWORD unset — no admin account provisioned")
        return
    existing = await db.users.find_one({"email": settings.admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": "Bros Cafe Admin",
            "email": settings.admin_email,
            "password_hash": hash_password(settings.admin_password),
            "role": "admin", "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user %s", settings.admin_email)
    elif not verify_password(settings.admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": settings.admin_email},
            {"$set": {"password_hash": hash_password(settings.admin_password)}})
        logger.info("Updated admin password for %s", settings.admin_email)


def _seed_content_from_files() -> None:
    """Load data/catalog.json and data/whats_new.json into the database.

    Runs on boot when SEED_ON_STARTUP is true, which is what makes editing a
    product's copy or image a `git push` rather than a manual step: the deploy
    restarts the container and the new content lands with it.

    The seeder upserts by id and archives what is no longer in the files, so it
    is safe to run on every boot. Turn it off once you start editing products
    through the admin UI, or a deploy will overwrite those edits.
    """
    if not settings.seed_on_startup:
        return
    from app import seed

    try:
        seed.main([])
    except Exception:
        # Never let a content problem stop the API from serving.
        logger.exception("Seeding from data files failed; continuing without it")


@app.on_event("startup")
async def on_startup() -> None:
    await db.ensure_indexes()
    await _seed_admin()
    _seed_content_from_files()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    db.close()
