from fastapi import APIRouter, Depends, Request
from core.database import get_db
from api.routes.auth import get_current_user
from core.config import settings
import asyncio

router = APIRouter()

@router.get("")
async def list_all(request: Request, db=Depends(get_db)):
    await get_current_user(request, db)
    from brain.llm import BrainLLM
    results = await asyncio.gather(*[BrainLLM(provider=p).list_models(p) for p in settings.available_providers], return_exceptions=True)
    return {"models": [m for r in results if isinstance(r,list) for m in r], "providers": settings.available_providers}

@router.get("/settings")
async def get_settings(request: Request, db=Depends(get_db)):
    await get_current_user(request, db)
    from memory.store import MemoryStore
    return {"providers": settings.available_providers, "default_provider": settings.DEFAULT_PROVIDER,
            "ollama_host": settings.OLLAMA_HOST, "has_tavily": settings.has_tavily,
            "has_supabase": settings.has_supabase, "memory_backend": MemoryStore().backend}
