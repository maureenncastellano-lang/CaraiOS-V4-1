from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from core.database import get_db
from api.routes.auth import get_current_user
from execution.files import FileService

router = APIRouter()

class SearchReq(BaseModel):
    query: str; max_results: int = 5
    search_depth: str = "basic"; topic: str = "general"

class FileSearchReq(BaseModel):
    query: str
    project_id: str = "default"
    max_results: int = 20

@router.post("")
async def web_search(req: SearchReq, request: Request, db=Depends(get_db)):
    await get_current_user(request, db)
    from execution.search import search_web
    return await search_web(req.query, req.max_results, req.search_depth, req.topic)

@router.post("/files")
async def search_files(req: FileSearchReq, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    service = FileService(user.id, req.project_id)
    tree = service.tree()
    query = req.query.strip()
    if not query:
        return {"files": []}

    query_lower = query.lower()
    results = []
    for item in tree:
        if item["type"] != "file":
            continue

        score = 0
        snippet = None
        chunk = None

        if query_lower in item["path"].lower():
            score += 20

        if not item["is_binary"]:
            try:
                content = service.read(item["path"])["content"]
            except Exception:
                content = ""
            content_lower = content.lower()
            idx = content_lower.find(query_lower)
            if idx >= 0:
                score += 10 + content_lower.count(query_lower)
                start = content.rfind("\n", 0, idx) + 1
                end = content.find("\n", idx)
                if end < 0:
                    end = len(content)
                start_line = content.count("\n", 0, start)
                end_line = content.count("\n", 0, end)
                snippet = content[start:end].strip()
                chunk = {"startLine": start_line, "endLine": end_line}

        if score > 0:
            results.append({
                "path": item["path"],
                "score": score,
                "is_binary": item["is_binary"],
                "chunk": chunk,
                "snippet": snippet,
            })

    results.sort(key=lambda r: r["score"], reverse=True)
    return {"files": results[:req.max_results]}


@router.get("/index/status")
async def get_index_status(project_id: str = "default", request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    service = FileService(user.id, project_id)
    tree = service.tree()
    files = sum(1 for item in tree if item["type"] == "file")
    directories = sum(1 for item in tree if item["type"] == "dir")
    return {"documents": files, "files": files, "directories": directories}


@router.post("/index/reindex")
async def reindex(project_id: str = "default", request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    service = FileService(user.id, project_id)
    tree = service.tree()
    files = sum(1 for item in tree if item["type"] == "file")
    directories = sum(1 for item in tree if item["type"] == "dir")
    return {"documents": files, "files": files, "directories": directories}
