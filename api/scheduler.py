"""APScheduler — Brain can schedule scripts to run automatically"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger("caraios.scheduler")
_scheduler = None

async def start_scheduler():
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.start()
    await _reload_jobs()
    logger.info("✅ Scheduler running")

async def _reload_jobs():
    from core.database import AsyncSessionLocal, Script
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(Script).where(Script.is_active==True, Script.schedule_type.in_(["cron","interval"])))
        for s in r.scalars().all():
            _schedule_script(s)

def _schedule_script(script):
    if not _scheduler: return
    jid = f"script_{script.id}"
    if _scheduler.get_job(jid): _scheduler.remove_job(jid)
    try:
        if script.schedule_type == "cron":
            trigger = CronTrigger.from_crontab(script.schedule_value or "0 * * * *")
        else:
            trigger = IntervalTrigger(seconds=int(script.schedule_value or 3600))
        _scheduler.add_job(_run_script, trigger, id=jid, args=[script.id], name=script.name, replace_existing=True)
    except Exception as e:
        logger.warning(f"Schedule failed for {script.name}: {e}")

def schedule_script(script):
    """Public entry point — called by api/routes/scripts.py's create/update
    handlers so a schedule change takes effect immediately, not only on the
    next server restart (the real gap found in record.md Session 22:
    _reload_jobs() only ever ran once, at startup)."""
    _schedule_script(script)

def unschedule_script(script_id: str):
    """Public entry point for delete/deactivate — removes a live job if one
    exists. Safe to call even if the script was never scheduled."""
    if not _scheduler:
        return
    jid = f"script_{script_id}"
    if _scheduler.get_job(jid):
        _scheduler.remove_job(jid)

async def _run_script(script_id: str):
    from core.database import AsyncSessionLocal, Script, ScriptRun
    from execution.runner import ExecutionLayer
    from governance.secrets_vault import get_user_secrets_dict
    from datetime import datetime
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(Script).where(Script.id==script_id))
        s = r.scalar_one_or_none()
        if not s: return
        # Secrets injection fixed here too (Session 22) -- this path had
        # the exact same gap as the manual-run path before that fix.
        user_secrets = await get_user_secrets_dict(db, s.owner_id)
        result = await ExecutionLayer().run(code=s.code, language=s.language, script_id=s.id,
                                            secrets=user_secrets)
        db.add(ScriptRun(script_id=s.id, trigger="scheduled", status=result["status"],
                          stdout=result["stdout"], stderr=result["stderr"],
                          exit_code=result["exit_code"], duration_ms=result["duration_ms"],
                          finished_at=datetime.utcnow()))
        await db.commit()
