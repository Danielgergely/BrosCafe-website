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
    # A year, and renewed on every visit (see /customer/me), so anyone who
    # uses the café at all never meets a sign-in screen again. The card is
    # worth one free coffee, which is the right weight for this trade.
    customer_token_days = _int("CUSTOMER_TOKEN_DAYS", 365)
    magic_link_minutes = _int("MAGIC_LINK_MINUTES", 20)
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")

    # --- loyalty programme ----------------------------------------------
    stamps_required = _int("STAMPS_REQUIRED", 10)

    # Stamps a new member is given on sign-up, so the first free coffee is
    # closer than a full card. Clamped below the target: a welcome bonus that
    # met it would hand out a free coffee before anyone had bought anything.
    @property
    def welcome_stamps(self) -> int:
        return max(0, min(_int("WELCOME_STAMPS", 5), self.stamps_required - 1))
    opening_datetime = _opening_datetime()

    # --- content ---------------------------------------------------------
    # Re-seed products and journal posts from data/*.json on every boot, so a
    # deploy ships content changes. Items edited through /admin are skipped by
    # the seeder, so this can stay on alongside in-browser editing.
    seed_on_startup = os.environ.get("SEED_ON_STARTUP", "false").lower() == "true"

    # --- uploaded media --------------------------------------------------
    # Photography uploaded through /admin. Must be a persistent volume: unlike
    # data/*.json these files exist nowhere else, so a bare container path
    # loses every image on redeploy.
    media_dir = os.environ.get("MEDIA_DIR", str(BASE_DIR / "media"))
    max_upload_mb = _int("MAX_UPLOAD_MB", 20)

    # --- email ----------------------------------------------------------
    # Resend (https://resend.com). The magic-link sign-in is the only way a
    # customer gets into their account, so an unconfigured mailer means nobody
    # can log in at all.
    resend_api_key = os.environ.get("RESEND_API_KEY", "")
    email_from = os.environ.get("EMAIL_FROM", "Bros Cafe <hello@broscafe.hu>")
    email_from_name = os.environ.get("EMAIL_FROM_NAME", "Bros Cafe")
    email_reply_to = os.environ.get("EMAIL_REPLY_TO", "")
    # Where the website's contact form delivers. Falls back to the café
    # address so the form never silently posts into nowhere.
    support_email = os.environ.get("SUPPORT_EMAIL", "") or os.environ.get(
        "CAFE_EMAIL", "hello@broscafe.hu")
    contact_per_hour = _int("CONTACT_PER_HOUR", 5)

    @property
    def email_configured(self) -> bool:
        return bool(self.resend_api_key and self.email_from)

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
