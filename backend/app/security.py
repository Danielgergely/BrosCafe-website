"""Password hashing, JWT issue/verify and the FastAPI auth dependencies."""
import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from app import db
from app.config import settings

TOKEN_STAFF = "access"
TOKEN_CUSTOMER = "customer"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _encode(payload: dict, days: int) -> str:
    payload = {**payload, "exp": datetime.now(timezone.utc) + timedelta(days=days)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_staff_token(user_id: str, email: str, role: str) -> str:
    return _encode({"sub": user_id, "email": email, "role": role, "type": TOKEN_STAFF},
                   settings.staff_token_days)


def create_customer_token(code: str, email: str) -> str:
    return _encode({"sub": code, "email": email, "type": TOKEN_CUSTOMER},
                   settings.customer_token_days)


def _bearer(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return header[7:]


def _decode(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload


async def get_current_user(request: Request) -> dict:
    payload = _decode(_bearer(request), TOKEN_STAFF)
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def get_current_customer(request: Request) -> dict:
    payload = _decode(_bearer(request), TOKEN_CUSTOMER)
    member = await db.members.find_one({"code": payload["sub"]})
    if not member:
        raise HTTPException(status_code=401, detail="Member not found")
    return member
