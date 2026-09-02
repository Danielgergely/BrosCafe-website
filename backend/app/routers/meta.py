"""Service metadata and public café details."""
from fastapi import APIRouter

from app.config import settings
from app.wallet import apple, google

router = APIRouter(tags=["meta"])


@router.get("/")
async def root():
    return {"message": "Bros Cafe API"}


@router.get("/cafe")
async def cafe_info():
    return {
        **settings.cafe,
        "apple_wallet_configured": apple.is_configured(),
        "google_wallet_configured": google.is_configured(),
    }
