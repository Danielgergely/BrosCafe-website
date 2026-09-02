"""Photography and video uploaded through the admin dashboard.

Bytes live on a mounted volume; a row in `media` records what each file is, so
the dashboard can list a library without walking the directory.

Files are named by a hash of their own content. That makes uploading the same
photo twice a no-op instead of a duplicate, and it means a given URL can never
point at different bytes — so they are safe to cache permanently.
"""
import hashlib
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from app import db
from app.config import settings

logger = logging.getLogger(__name__)

# What the site can actually display. The value is the extension we store under,
# so this table also decides the filename.
ALLOWED = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
}

# Longest signature we compare against, so callers know how much to read.
SNIFF_BYTES = 16

# Content-hash names are the only thing we ever write, so anything else is
# either a stale link or someone probing for ../ — refuse both before touching
# the filesystem.
FILENAME = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp|avif|mp4)$")


def sniff(head: bytes) -> str | None:
    """Content type from magic bytes, ignoring what the client claimed.

    A browser will happily label anything `image/png`. Since the stored type is
    what we later serve the file back as, deriving it from the bytes keeps a
    mislabelled upload from being served as something it is not.
    """
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand == b"avif":
            return "image/avif"
        if brand in (b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"M4V "):
            return "video/mp4"
    return None


def directory() -> Path:
    path = Path(settings.media_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def public_url(filename: str) -> str:
    """Site-relative on purpose.

    An absolute URL baked in here would pin every image to the domain that was
    live when it was uploaded, breaking the library on any other hostname.
    """
    return f"/api/media/{filename}"


async def save(data: bytes, original_name: str, content_type: str, by: str) -> dict:
    digest = hashlib.sha256(data).hexdigest()[:32]
    filename = f"{digest}{ALLOWED[content_type]}"
    path = directory() / filename

    if not path.exists():
        path.write_bytes(data)

    doc = {
        "id": digest,
        "filename": filename,
        "url": public_url(filename),
        "content_type": content_type,
        "bytes": len(data),
        "original_name": original_name[:120],
        "uploaded_at": datetime.now(timezone.utc),
        "uploaded_by": by,
    }
    # Re-uploading the same photo refreshes the label rather than adding a row.
    await db.media.update_one({"id": digest}, {"$set": doc}, upsert=True)
    return doc


async def listing(limit: int = 300) -> list[dict]:
    return await db.media.find({}, {"_id": 0}).sort("uploaded_at", -1).to_list(limit)


async def find(filename: str) -> dict | None:
    return await db.media.find_one({"filename": filename}, {"_id": 0})


async def usage(url: str) -> list[str]:
    """Where a file is referenced, so the dashboard can warn before deleting."""
    products = await db.products.find(
        {"images": url}, {"_id": 0, "id": 1}).to_list(200)
    posts = await db.content.find(
        {"image": url}, {"_id": 0, "id": 1}).to_list(200)
    return [d["id"] for d in products] + [d["id"] for d in posts]


async def delete(filename: str) -> bool:
    doc = await find(filename)
    if not doc:
        return False
    path = directory() / filename
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.exception("Could not remove media file %s", filename)
    await db.media.delete_one({"filename": filename})
    return True
