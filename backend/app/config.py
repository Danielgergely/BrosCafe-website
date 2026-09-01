"""All environment-driven configuration in one place.

Nothing else in the backend reads os.environ directly, so adding a knob means
adding it here and to .env.example — no hunting through routers.
"""
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ASSETS_DIR = BASE_DIR / "assets"

load_dotenv(BASE_DIR / ".env")

CAFE_TZ = ZoneInfo(os.environ.get("CAFE_TIMEZONE", "Europe/Budapest"))


def _int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


def _opening_datetime() -> datetime:
    """Grand-opening moment, café-local. Single source for API, countdowns and copy."""
    raw = os.environ.get("OPENING_DATETIME", "2026-09-16T08:00:00")
    try:
        return datetime.fromisoformat(raw).replace(tzinfo=CAFE_TZ)
    except ValueError:
        return datetime(2026, 9, 16, 8, 0, tzinfo=CAFE_TZ)


class Settings:
    # --- infrastructure -------------------------------------------------
    mongo_url = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
    db_name = os.environ.get("DB_NAME", "broscafe")
    cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")

    # --- auth -----------------------------------------------------------
    jwt_algorithm = "HS256"
    staff_token_days = _int("STAFF_TOKEN_DAYS", 7)
    customer_token_days = _int("CUSTOMER_TOKEN_DAYS", 30)
    magic_link_minutes = _int("MAGIC_LINK_MINUTES", 20)
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")

    # --- loyalty programme ----------------------------------------------
    stamps_required = _int("STAMPS_REQUIRED", 4)
    opening_datetime = _opening_datetime()

    # --- email ----------------------------------------------------------
    email_base_url = os.environ.get("EMAIL_BASE_URL", "https://integrations.emergentagent.com")
    email_key = os.environ.get("EMERGENT_EMAIL_KEY", "")
    email_from_name = os.environ.get("EMAIL_FROM_NAME", "Bros Cafe")

    # --- café details (surfaced at /api/cafe) ----------------------------
    @property
    def cafe(self) -> dict:
        return {
            "name": os.environ.get("CAFE_NAME", "Bros Cafe"),
            "address": os.environ.get("CAFE_ADDRESS", ""),
            "instagram": os.environ.get("CAFE_INSTAGRAM", ""),
            "phone": os.environ.get("CAFE_PHONE", ""),
            "email": os.environ.get("CAFE_EMAIL", ""),
            "hours_weekdays": os.environ.get("CAFE_HOURS_WEEKDAYS", "Mon–Fri · 7:30–19:00"),
            "hours_weekend": os.environ.get("CAFE_HOURS_WEEKEND", "Sat–Sun · 9:00–18:00"),
            "stamps_required": self.stamps_required,
            "opening_datetime": self.opening_datetime.isoformat(),
        }

    @property
    def jwt_secret(self) -> str:
        """Read lazily so a missing secret fails on use, not at import time."""
        try:
            return os.environ["JWT_SECRET"]
        except KeyError as exc:
            raise RuntimeError("JWT_SECRET is not set — see .env.example") from exc


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
