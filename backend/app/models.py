"""Request/response schemas."""
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class StaffCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "staff"


class MemberCreate(BaseModel):
    name: str
    email: EmailStr


class LinkRequest(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None


class VerifyRequest(BaseModel):
    token: str


class ChangeEmail(BaseModel):
    email: EmailStr


class AdjustRequest(BaseModel):
    delta: int


class TrackEvent(BaseModel):
    type: str
    session_id: str
    code: Optional[str] = None
    src: Optional[str] = None


class SettingsUpdate(BaseModel):
    active_days: Optional[int] = None
    inactive_days: Optional[int] = None
    new_days: Optional[int] = None
    loyal_cycles: Optional[int] = None
    almost_reward_stamps: Optional[int] = None
    cafe_lat: Optional[float] = None
    cafe_lng: Optional[float] = None


class Localized(BaseModel):
    en: str
    hu: str


class LocalizedList(BaseModel):
    en: list[str]
    hu: list[str]


# The menu filters on these exactly, and the journal renders its tag through
# i18n `news.tags.<kind>` — a free-text value in either would silently produce
# a product nothing lists or a post with a missing label.
CATEGORIES = Literal["coffee", "cold", "food", "sweet", "merch"]
POST_KINDS = Literal["guest", "house", "pastry"]


class ProductUpsert(BaseModel):
    """Mirrors data/catalog.json so admin-created products match seeded ones."""
    id: str = Field(pattern=r"^[a-z0-9-]{2,50}$")
    cat: CATEGORIES
    order: int = 99
    price_huf: int = Field(ge=0)
    name: Localized
    desc: Localized
    images: list[str] = []
    tip: Optional[Localized] = None
    ingredients: Optional[LocalizedList] = None
    behind: Optional[LocalizedList] = None
    sizes: Optional[LocalizedList] = None
    material: Optional[Localized] = None
    flavor: Optional[dict] = None
    allergens: list[str] = []
    temp: Optional[str] = None
    video: Optional[str] = None
    pairings: list[str] = []
    active: bool = True


class PostUpsert(BaseModel):
    """Mirrors data/whats_new.json so admin-written posts match seeded ones."""
    id: str = Field(pattern=r"^[a-z0-9-]{2,50}$")
    order: int = 99
    kind: POST_KINDS = "house"
    image: str = ""
    title: Localized
    blurb: Localized
    body: Localized
    active: bool = True
