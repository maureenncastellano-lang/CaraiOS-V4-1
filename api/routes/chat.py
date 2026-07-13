"""Chat route — plain streaming chat (no autonomous loop)"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, desc
from core.database import get_db, ChatSession, Message
from api.routes.auth import get_current_user

router = APIRouter()

class ChatReq(BaseModel):
    message: str
    session_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None

@router.get("/sessions")
async def list_sessions(request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(ChatSession).where(ChatSession.user_id==user.id).order_by(desc(ChatSession.updated_at)).limit(50))
    sessions = r.scalars().all()
    return [{"id":s.id,"title":s.title,"provider":s.provider,"model":s.model,"mode":s.mode,"updated_at":s.updated_at} for s in sessions]

@router.delete("/sessions/{sid}")
async def del_session(sid: str, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(ChatSession).where(ChatSession.id==sid, ChatSession.user_id==user.id))
    s = r.scalar_one_or_none()
    if not s: from fastapi import HTTPException; raise HTTPException(404)
    await db.delete(s); await db.commit()
    return {"status":"deleted"}

@router.get("/sessions/{sid}/messages")
async def get_messages(sid: str, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(Message).where(Message.session_id==sid).order_by(Message.created_at))
    return [{"role":m.role,"content":m.content,"created_at":m.created_at} for m in r.scalars().all()]

@router.post("/send")
async def send(req: ChatReq, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    session = None
    if req.session_id:
        r = await db.execute(select(ChatSession).where(ChatSession.id==req.session_id, ChatSession.user_id==user.id))
        session = r.scalar_one_or_none()
    if not session:
        session = ChatSession(user_id=user.id, title=req.message[:60],
                               provider=req.provider or "ollama", model=req.model or "",
                               mode="chat", system_prompt=req.system_prompt)
        db.add(session); await db.flush()

    # Load history
    r = await db.execute(select(Message).where(Message.session_id==session.id).order_by(Message.created_at).limit(40))
    history = r.scalars().all()
    messages = [{"role":"system","content":req.system_prompt or session.system_prompt or "You are CaraiOS, a helpful AI assistant."}]
    messages += [{"role":m.role,"content":m.content} for m in history]
    messages.append({"role":"user","content":req.message})

    db.add(Message(session_id=session.id, role="user", content=req.message))
    session.updated_at = datetime.utcnow()
    if not history: session.title = req.message[:80]
    await db.commit()

    from brain.llm import BrainLLM
    brain = BrainLLM(provider=req.provider or session.provider, model=req.model or session.model or None)

    async def sse():
        full = ""
        try:
            text = await brain.stream_chat(messages)
            # Simulate streaming by chunking
            for i in range(0, len(text), 8):
                chunk = text[i:i+8]
                full += chunk
                yield f"data: {json.dumps({'delta':chunk,'session_id':session.id})}\n\n"
        except Exception as e:
            full = f"Error: {e}"
            yield f"data: {json.dumps({'delta':full,'session_id':session.id})}\n\n"
        async with db:
            db.add(Message(session_id=session.id, role="assistant", content=full))
            await db.commit()
        yield f"data: {json.dumps({'done':True,'session_id':session.id})}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream",
                             headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})
