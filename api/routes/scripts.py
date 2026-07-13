"""Scripts route — Brain-managed scripts with full run history"""
from datetime import datetime
from fastapi import APIRouter, Depends, Request, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, desc
from core.database import get_db, Script, ScriptRun
from api.routes.auth import get_current_user

router = APIRouter()

class ScriptCreate(BaseModel):
    name: str; code: str; language: str = "python"
    description: Optional[str] = None
    schedule_type: str = "manual"; schedule_value: Optional[str] = None
    notify_on_success: str = "none"; notify_on_failure: str = "none"
    tags: list[str] = []

    def model_post_init(self, __context):
        if self.tags is None:
            self.tags = []

class ScriptUpdate(BaseModel):
    name: Optional[str]=None; code: Optional[str]=None; language: Optional[str]=None
    schedule_type: Optional[str]=None; schedule_value: Optional[str]=None
    is_active: Optional[bool]=None; tags: Optional[list[str]]=None

@router.get("")
async def list_scripts(request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(Script).where(Script.owner_id==user.id).order_by(desc(Script.created_at)))
    return [{"id":s.id,"name":s.name,"language":s.language,"schedule_type":s.schedule_type,"is_active":s.is_active,"tags":s.tags} for s in r.scalars().all()]

@router.post("")
async def create_script(req: ScriptCreate, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    s = Script(owner_id=user.id, **req.model_dump())
    db.add(s); await db.commit()
    if s.schedule_type in ("cron", "interval") and s.is_active:
        from api.scheduler import schedule_script
        schedule_script(s)
    return {"id": s.id}

@router.get("/{sid}")
async def get_script(sid: str, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(Script).where(Script.id==sid, Script.owner_id==user.id))
    s = r.scalar_one_or_none()
    if not s: raise HTTPException(404)
    return {"id":s.id,"name":s.name,"code":s.code,"language":s.language,"description":s.description,
            "schedule_type":s.schedule_type,"schedule_value":s.schedule_value,"webhook_token":s.webhook_token,"is_active":s.is_active,"tags":s.tags}

@router.patch("/{sid}")
async def update_script(sid: str, req: ScriptUpdate, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(Script).where(Script.id==sid, Script.owner_id==user.id))
    s = r.scalar_one_or_none()
    if not s: raise HTTPException(404)
    for k,v in req.model_dump(exclude_none=True).items(): setattr(s, k, v)
    s.updated_at = datetime.utcnow(); await db.commit()
    from api.scheduler import schedule_script, unschedule_script
    if s.schedule_type in ("cron", "interval") and s.is_active:
        schedule_script(s)   # live-reschedule with whatever changed (schedule_value, code, etc.)
    else:
        unschedule_script(s.id)   # switched to manual, or deactivated -- stop any live job
    return {"status":"updated"}

@router.delete("/{sid}")
async def delete_script(sid: str, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(Script).where(Script.id==sid, Script.owner_id==user.id))
    s = r.scalar_one_or_none()
    if not s: raise HTTPException(404)
    from api.scheduler import unschedule_script
    unschedule_script(s.id)
    await db.delete(s); await db.commit()
    return {"status":"deleted"}

@router.post("/{sid}/run")
async def run_script(sid: str, request: Request, background_tasks: BackgroundTasks, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(Script).where(Script.id==sid, Script.owner_id==user.id))
    s = r.scalar_one_or_none()
    if not s: raise HTTPException(404)
    async def _run():
        from execution.runner import ExecutionLayer
        from governance.secrets_vault import get_user_secrets_dict
        from core.database import AsyncSessionLocal, ScriptRun
        async with AsyncSessionLocal() as secrets_db:
            user_secrets = await get_user_secrets_dict(secrets_db, user.id)
        result = await ExecutionLayer().run(code=s.code, language=s.language, script_id=s.id,
                                            secrets=user_secrets)
        async with AsyncSessionLocal() as db2:
            db2.add(ScriptRun(script_id=s.id, trigger="manual", status=result["status"],
                               stdout=result["stdout"], stderr=result["stderr"],
                               exit_code=result["exit_code"], duration_ms=result["duration_ms"],
                               finished_at=datetime.utcnow()))
            await db2.commit()
    background_tasks.add_task(_run)
    return {"status":"queued"}

@router.get("/{sid}/runs")
async def get_runs(sid: str, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    r = await db.execute(select(ScriptRun).where(ScriptRun.script_id==sid).order_by(desc(ScriptRun.started_at)).limit(20))
    return [{"id":r.id,"status":r.status,"exit_code":r.exit_code,"duration_ms":r.duration_ms,"trigger":r.trigger,"started_at":r.started_at,"stdout":r.stdout,"stderr":r.stderr} for r in r.scalars().all()]

@router.post("/{sid}/ai-debug")
async def ai_debug(sid: str, request: Request, db=Depends(get_db)):
    user = await get_current_user(request, db)
    sr = await db.execute(select(Script).where(Script.id==sid, Script.owner_id==user.id))
    s = sr.scalar_one_or_none()
    if not s: raise HTTPException(404)
    rr = await db.execute(select(ScriptRun).where(ScriptRun.script_id==sid, ScriptRun.status=="failed").order_by(desc(ScriptRun.started_at)).limit(1))
    run = rr.scalar_one_or_none()
    if not run: raise HTTPException(400, "No failed runs")
    from brain.llm import BrainLLM
    brain = BrainLLM()
    fixed = await brain.stream_chat([
        {"role":"system","content":f"You are an expert {s.language} debugger. Return ONLY the fixed code, no explanation."},
        {"role":"user","content":f"CODE:\n```{s.language}\n{s.code}\n```\n\nERROR:\n{run.stderr or run.stdout}\n\nFixed code:"}
    ])
    for fence in [f"```{s.language}","```python","```bash","```"]:
        fixed = fixed.replace(fence,"")
    return {"fixed_code": fixed.strip(), "original_error": run.stderr}
