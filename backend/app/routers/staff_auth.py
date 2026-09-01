"""Password login for staff and admins, plus staff account management."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.models import LoginRequest, StaffCreate
from app.security import (
    create_staff_token, get_current_user, hash_password, require_admin, verify_password,
)

router = APIRouter(tags=["staff-auth"])

ROLES = ("staff", "admin")


@router.post("/auth/login")
async def login(body: LoginRequest):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "token": create_staff_token(user["id"], user["email"], user["role"]),
        "user": {"id": user["id"], "name": user["name"],
                 "email": user["email"], "role": user["role"]},
    }



@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}


@router.post("/staff")
async def create_staff(body: StaffCreate, admin: dict = Depends(require_admin)):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": str(uuid.uuid4()), "name": body.name, "email": email,
        "password_hash": hash_password(body.password),
        "role": body.role if body.role in ROLES else "staff",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "email": doc["email"], "role": doc["role"]}


@router.get("/staff")
async def list_staff(admin: dict = Depends(require_admin)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
