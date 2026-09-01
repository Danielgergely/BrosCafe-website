"""Public member lookup and registration."""
from fastapi import APIRouter, HTTPException

from app import db
from app.models import MemberCreate
from app.services import members

router = APIRouter(tags=["members"])


@router.post("/members")
async def create_member(body: MemberCreate):
    email = body.email.lower().strip()
    existing = await db.members.find_one({"email": email})
    if existing:
        return members.public(existing)
    return members.public(await members.create(body.name, email))


@router.get("/find-card")
async def find_card(email: str):
    doc = await db.members.find_one({"email": email.lower().strip()})
    if not doc:
        raise HTTPException(status_code=404, detail="No loyalty card found for that email")
    return members.public(doc)


@router.get("/members/{code}")
async def get_member(code: str):
    doc = await db.members.find_one({"code": code})
    if not doc:
        raise HTTPException(status_code=404, detail="Loyalty card not found")
    return members.public(doc)
