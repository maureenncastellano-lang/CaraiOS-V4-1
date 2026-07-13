from fastapi import APIRouter
from core.config import settings

router = APIRouter()

@router.get("")
async def health():
    from memory.store import MemoryStore
    return {"status": "ok", "memory": MemoryStore().backend,
            "providers": settings.available_providers, "tavily": settings.has_tavily}
