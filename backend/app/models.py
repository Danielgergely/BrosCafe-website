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
    # Whoever's link they arrived through, from /loyalty?ref=<code>.
    ref: Optional[str] = Field(default=None, max_length=64)
    # Which language to write to them in, and what we remember for later mail.
    lang: Optional[Literal["hu", "en"]] = None


class VerifyRequest(BaseModel):
    token: str


class ChangeEmail(BaseModel):
    email: EmailStr


class DrinkChoice(BaseModel):
    """Which drink the stamp was for. None means staff didn't record it."""

    drink: Optional[str] = Field(default=None, max_length=50)


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
#
# One category per group on the printed menu, rather than a handful of broad
# buckets: with seventy-odd products, "sweet" alone would have run to three
# separate counters' worth of cakes, cookies and pastries in one flat list.
CATEGORIES = Literal[
    "coffee", "specialty", "tea", "smoothie",
    "sandwich", "pastry", "cake", "dessert", "bottled", "merch",
]
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
    milks: list[str] = []
    temp: Optional[str] = None
    video: Optional[str] = None
    pairings: list[str] = []
    active: bool = True
    # Marks the gallery as placeholder stock photography, which the site says
    # out loud on the image. Untick it in /admin once a product has been shot
    # properly, and the note disappears for that product alone.
    stock_photos: bool = False


class RunFinish(BaseModel):
    """A finished Coffee Runner run: the seed's id, and when the player jumped.

    No score field — the server works that out. The cap on `jumps` is not a
    game rule but a request-size limit; ten minutes of frantic pressing is
    nowhere near it.
    """
    run_id: str = Field(min_length=8, max_length=64)
    jumps: list[int] = Field(default_factory=list, max_length=4000)


class ContactMessage(BaseModel):
    """A message from the website's contact form.

    Lengths are capped because this endpoint sends email: without a ceiling it
    is a relay for anyone who finds it.
    """
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    message: str = Field(min_length=5, max_length=4000)
    # Hidden in the form and never filled by a person. Bots fill every input
    # they find, so anything here means the submission is automated.
    website: str = ""


class FreeCoffeeGrant(BaseModel):
    """Bank or remove free drinks by hand — the weekly game winner, or a fix."""

    delta: int = Field(ge=-10, le=10)


class TierGrant(BaseModel):
    """`tier: null` hands the member back to the automatic ladder."""
    tier: Optional[Literal["base", "bronze", "silver", "gold", "diamond"]] = None


class PostUpsert(BaseModel):
    """Mirrors data/whats_new.json so admin-written posts match seeded ones."""
    id: str = Field(pattern=r"^[a-z0-9-]{2,50}$")
    order: int = 99
    # `kind` predates tags and is kept so existing rows still validate; the
    # site reads `tags`, falling back to the old single kind when empty.
    kind: POST_KINDS = "house"
    tags: list[str] = []
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    product_ids: list[str] = []
    image: str = ""
    title: Localized
    blurb: Localized
    body: Localized
    active: bool = True
