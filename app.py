"""CaraiOS v3 — Brain + Execution + Governance + Agency Agents + AIS-OS Workspace"""
import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from core.config import settings
from core.database import init_db

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("caraios")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 CaraiOS v3 starting…")
    await init_db()
    await _create_admin()
    await _init_memory()
    await _start_scheduler()
    from governance.checkpoint import CheckpointManager
    CheckpointManager().cleanup_old(48)
    logger.info("✅ CaraiOS v3 ready → http://localhost:8000")
    yield

async def _create_admin():
    import secrets as _s
    from core.database import AsyncSessionLocal, User
    from sqlalchemy import select
    import bcrypt
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.is_admin==True).limit(1))
        if r.scalar_one_or_none(): return
        pw = settings.ADMIN_PASSWORD or _s.token_urlsafe(12)
        hashed = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
        db.add(User(username=settings.ADMIN_USER, email=settings.ADMIN_EMAIL, hashed_password=hashed, is_admin=True))
        await db.commit()
        if not settings.ADMIN_PASSWORD:
            print(f"\n{'═'*52}\n  Admin: {settings.ADMIN_USER} / {pw}\n{'═'*52}\n")

async def _init_memory():
    from memory.store import MemoryStore
    await MemoryStore().init()

async def _start_scheduler():
    try:
        from api.scheduler import start_scheduler
        await start_scheduler()
    except Exception as e:
        logger.warning(f"Scheduler: {e}")

class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        try:
            response = await call_next(request)
            if response.status_code >= 400:
                from governance.observability import ObservabilityStore
                ObservabilityStore().record_error(
                    component="http",
                    message=f"{request.method} {request.url.path} -> {response.status_code}",
                    status_code=response.status_code,
                )
            return response
        except Exception as exc:
            from governance.observability import ObservabilityStore
            ObservabilityStore().record_error(
                component="http",
                message=f"{request.method} {request.url.path} -> 500: {exc}",
                status_code=500,
            )
            logger.exception("Unhandled request error for %s %s", request.method, request.url.path)
            raise
        finally:
            if request.url.path.startswith("/api"):
                logger.info("request %s %s finished in %.3fs", request.method, request.url.path, time.monotonic() - start)

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/static") or request.url.path == "/api/health":
            return await call_next(request)
        user_id = "anonymous"
        token = request.cookies.get("caraios_token") or request.headers.get("Authorization","").replace("Bearer ","")
        if token:
            try:
                import jwt
                payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
                user_id = payload.get("sub","anonymous")
            except: pass
        from governance.ratelimit import RateLimiter
        allowed, remaining, reason = await RateLimiter().check_api(user_id)
        if not allowed:
            return JSONResponse(status_code=429, content={"detail": reason}, headers={"Retry-After":"60"})
        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response

app = FastAPI(title="CaraiOS", version="3.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.ALLOWED_ORIGINS,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.add_middleware(ObservabilityMiddleware)
app.add_middleware(RateLimitMiddleware)
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
templates = Jinja2Templates(directory="frontend/templates")

from api.routes import auth, chat, loop, scripts, memory, search, models, health, governance, extras, files, vcs, terminal, comms, workers, secrets as secrets_routes
app.include_router(auth.router,       prefix="/api/auth",       tags=["auth"])
app.include_router(chat.router,       prefix="/api/chat",       tags=["chat"])
app.include_router(loop.router,       prefix="/api/loop",       tags=["loop"])
app.include_router(scripts.router,    prefix="/api/scripts",    tags=["scripts"])
app.include_router(memory.router,     prefix="/api/memory",     tags=["memory"])
app.include_router(search.router,     prefix="/api/search",     tags=["search"])
app.include_router(models.router,     prefix="/api/models",     tags=["models"])
app.include_router(health.router,     prefix="/api/health",     tags=["health"])
app.include_router(governance.router, prefix="/api/governance", tags=["governance"])
app.include_router(extras.router,     prefix="/api/extras",     tags=["extras"])
app.include_router(files.router,      prefix="/api/files",      tags=["files"])
app.include_router(vcs.router,        prefix="/api/vcs",        tags=["vcs"])
app.include_router(terminal.router,   prefix="/api/terminal",   tags=["terminal"])
app.include_router(comms.router,      prefix="/api/comms",      tags=["comms"])
app.include_router(workers.router,    prefix="/api/workers",    tags=["workers"])
app.include_router(secrets_routes.router, prefix="/api/secrets", tags=["secrets"])

@app.get("/{full_path:path}", response_class=HTMLResponse)
async def spa(request: Request, full_path: str):
    return templates.TemplateResponse("index.html", {"request": request})
