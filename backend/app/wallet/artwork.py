"""The strip image on the Apple pass.

Apple renders `secondaryFields` and `auxiliaryFields` as a single row of
columns — they do not stack — so anything shown beside the stamps steals the
width the stamps need, and ten of them get cut off. Drawing the stamps into
the strip artwork instead takes them out of that competition entirely and
frees the field row for the running totals.

The strip is 375x123 points. The member's name is drawn over its upper half by
Wallet itself, so everything here lives in the lower half.
"""
import io
from functools import lru_cache

from PIL import Image, ImageDraw

# Ground, band and accent per tier. Diamond is granted rather than earned, so
# it keeps a dark platinum ground instead of the brand green.
TIERS = {
    "base": {"ground": (94, 106, 68), "band": (168, 177, 135), "accent": (245, 240, 230)},
    "bronze": {"ground": (94, 106, 68), "band": (190, 128, 72), "accent": (226, 162, 108)},
    "silver": {"ground": (94, 106, 68), "band": (186, 194, 204), "accent": (214, 222, 232)},
    "gold": {"ground": (94, 106, 68), "band": (222, 182, 88), "accent": (242, 202, 108)},
    "diamond": {"ground": (18, 21, 27), "band": (150, 190, 224), "accent": (176, 212, 238)},
}

WIDTH, HEIGHT = 375, 123

# Google fetches images from a URL rather than reading them out of the pass, so
# the same stamp row is rendered again at the hero-image size it expects. 3:1,
# and wider than Apple's strip, so the stamps get their own band across it.
HERO_WIDTH, HERO_HEIGHT = 1032, 336

# Pillow draws shapes with hard pixel edges — no antialiasing — so circles come
# out visibly stepped. Drawing at this multiple and scaling back down with
# Lanczos is the usual fix: the downsample does the smoothing.
SUPERSAMPLE = 4


def _draw(tier: str, stamps: int, required: int, scale: int) -> bytes:
    look = TIERS.get(tier, TIERS["base"])
    final = (WIDTH * scale, HEIGHT * scale)
    w, h = final[0] * SUPERSAMPLE, final[1] * SUPERSAMPLE
    im = Image.new("RGB", (w, h), look["ground"])
    d = ImageDraw.Draw(im)

    d.rectangle([0, 0, w, max(2, 4 * scale * SUPERSAMPLE)], fill=look["band"])

    if required <= 0:
        # Diamond: no card to fill, so the strip stays clean and the name has
        # the whole panel to itself.
        return _encode(im, final)

    # Sized to fit whatever the card length is, so a seven-stamp gold card and
    # a ten-stamp new card both sit on one line with even margins.
    unit = scale * SUPERSAMPLE
    margin = 18 * unit
    gap = max(4 * unit, int((w - margin * 2) * 0.018))
    size = min(26 * unit, (w - margin * 2 - gap * (required - 1)) // required)
    total = size * required + gap * (required - 1)
    x = (w - total) // 2
    y = h - size - 18 * unit

    for i in range(required):
        box = [x + i * (size + gap), y, x + i * (size + gap) + size, y + size]
        if i < stamps:
            d.ellipse(box, fill=look["accent"])
        else:
            d.ellipse(box, outline=look["accent"], width=max(1, 2 * unit))
    return _encode(im, final)


def _encode(im: Image.Image, size: tuple[int, int]) -> bytes:
    buf = io.BytesIO()
    im.resize(size, Image.LANCZOS).save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@lru_cache(maxsize=256)
def strip(tier: str, stamps: int, required: int, scale: int = 1) -> bytes:
    """Cached: there are only a few dozen distinct cards across all members."""
    return _draw(tier, max(0, stamps), max(0, required), scale)


def _draw_hero(tier: str, stamps: int, required: int) -> bytes:
    """The banner on the Google Wallet card.

    Google owns the typography and layout, so this image is the only place the
    tier band and the stamp row can appear at all — without it an Android
    customer sees a plain coloured card with a number on it.
    """
    look = TIERS.get(tier, TIERS["base"])
    w, h = HERO_WIDTH * 2, HERO_HEIGHT * 2      # drawn large, scaled down
    im = Image.new("RGB", (w, h), look["ground"])
    d = ImageDraw.Draw(im)

    d.rectangle([0, 0, w, int(h * 0.045)], fill=look["band"])

    if required > 0:
        margin = int(w * 0.06)
        gap = max(6, int((w - margin * 2) * 0.016))
        size = min(int(h * 0.30), (w - margin * 2 - gap * (required - 1)) // required)
        total = size * required + gap * (required - 1)
        x = (w - total) // 2
        y = (h - size) // 2 + int(h * 0.04)
        for i in range(required):
            box = [x + i * (size + gap), y, x + i * (size + gap) + size, y + size]
            if i < stamps:
                d.ellipse(box, fill=look["accent"])
            else:
                d.ellipse(box, outline=look["accent"], width=max(2, size // 12))

    buf = io.BytesIO()
    im.resize((HERO_WIDTH, HERO_HEIGHT), Image.LANCZOS).save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@lru_cache(maxsize=128)
def hero(tier: str, stamps: int, required: int) -> bytes:
    return _draw_hero(tier, max(0, stamps), max(0, required))
