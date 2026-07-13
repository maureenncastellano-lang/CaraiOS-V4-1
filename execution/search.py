"""
Execution Layer — Web Search.
The Brain calls search_web() to get information.
Like code execution, this is a capability the Brain USES, not drives itself.
"""

import httpx
from core.config import settings


async def search_web(query: str, max_results: int = 5,
                     depth: str = "basic", topic: str = "general") -> dict:
    """Search the web. Returns structured results for the Brain to reason about."""
    if settings.TAVILY_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post("https://api.tavily.com/search", json={
                    "api_key": settings.TAVILY_API_KEY,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": depth,
                    "include_answer": True,
                    "topic": topic,
                })
                r.raise_for_status()
                data = r.json()
                return {
                    "answer": data.get("answer"),
                    "results": [
                        {"title": x.get("title", ""), "url": x.get("url", ""),
                         "content": x.get("content", ""), "score": x.get("score", 0)}
                        for x in data.get("results", [])
                    ],
                    "backend": "tavily",
                }
        except Exception as e:
            pass  # Fall through to SearXNG

    # SearXNG fallback
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{settings.SEARXNG_URL}/search",
                            params={"q": query, "format": "json"})
            r.raise_for_status()
            data = r.json()
            return {
                "answer": None,
                "results": [
                    {"title": x.get("title", ""), "url": x.get("url", ""),
                     "content": x.get("content", "")}
                    for x in data.get("results", [])[:max_results]
                ],
                "backend": "searxng",
            }
    except Exception:
        pass

    return {"answer": None, "results": [], "backend": "none",
            "error": "No search backend configured (set TAVILY_API_KEY in .env)"}
