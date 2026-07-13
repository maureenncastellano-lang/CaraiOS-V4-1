"""Auth routes"""
import secrets, hashlib
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import bcrypt, jwt
from datetime import datetime, timedelta
from core.config import settings
from core.database import get_db, User

router = APIRouter()

def hash_pw(pw): return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
def check_pw(pw, h): return bcrypt.checkpw(pw.encode(), h.encode())
def make_jwt(uid, admin=False):
    return jwt.encode({"sub": uid, "admin": admin,
                       "exp": datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRE_HOURS)},
                      settings.JWT_SECRET, algorithm="HS256")

async def get_current_user(request=None, db: AsyncSession = Depends(get_db)):
    from fastapi import Request
    from fastapi.security import HTTPBearer
    token = None
    if request and hasattr(request, 'cookies'):
        token = request.cookies.get("caraios_token")
    if not token and request:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        if not settings.AUTH_ENABLED:
            r = await db.execute(select(User).where(User.is_admin==True).limit(1))
            return r.scalar_one_or_none()
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        r = await db.execute(select(User).where(User.id==payload["sub"]))
        return r.scalar_one_or_none()
    except Exception:
        raise HTTPException(401, "Invalid token")

class LoginReq(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(req: LoginReq, response: Response, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.username==req.username))
    user = r.scalar_one_or_none()
    if not user or not check_pw(req.password, user.hashed_password or ""):
        raise HTTPException(401, "Invalid credentials")
    token = make_jwt(user.id, user.is_admin)
    response.set_cookie("caraios_token", token, httponly=True, samesite="lax",
                        max_age=settings.JWT_EXPIRE_HOURS*3600)
    return {"token": token, "user": {"id": user.id, "username": user.username,
                                      "email": user.email, "is_admin": user.is_admin}}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("caraios_token")
    return {"status": "ok"}

@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user: raise HTTPException(401)
    return {"id": user.id, "username": user.username, "email": user.email, "is_admin": user.is_admin}
