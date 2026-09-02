"""Serving uploaded photography.

Public, because these are the images on the website. Uploading and deleting
live in routers/admin.py behind the admin guard.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services import media

router = APIRouter(prefix="/media", tags=["media"])

@router.get("/{filename}")
async def serve(filename: str):
    if not media.FILENAME.match(filename):
        raise HTTPException(status_code=404, detail="Not found")

    path = media.directory() / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    doc = await media.find(filename)
    return FileResponse(
        path,
        media_type=(doc or {}).get("content_type", "application/octet-stream"),
        headers={
            # The name is a hash of the bytes, so this URL is immutable.
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": "inline",
        },
    )
