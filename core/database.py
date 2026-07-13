"""CaraiOS Database Models"""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Text, Boolean, Integer, DateTime, JSON, ForeignKey
from core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

def gen_id(): return str(uuid.uuid4())

class Base(DeclarativeBase): pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    sessions: Mapped[list["ChatSession"]] = relationship(back_populates="user")
    scripts: Mapped[list["Script"]] = relationship(back_populates="owner")
    secrets: Mapped[list["Secret"]] = relationship(back_populates="owner")

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(256), default="New Chat")
    provider: Mapped[str] = mapped_column(String(32), default="ollama")
    model: Mapped[str] = mapped_column(String(128), default="")
    mode: Mapped[str] = mapped_column(String(16), default="chat")  # chat | loop
    system_prompt: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user: Mapped["User"] = relationship(back_populates="sessions")
    messages: Mapped[list["Message"]] = relationship(back_populates="session", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id"))
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    session: Mapped["ChatSession"] = relationship(back_populates="messages")

class Script(Base):
    __tablename__ = "scripts"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(256))
    description: Mapped[Optional[str]] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(32), default="python")
    schedule_type: Mapped[str] = mapped_column(String(16), default="manual")
    schedule_value: Mapped[Optional[str]] = mapped_column(String(128))
    notify_on_success: Mapped[str] = mapped_column(String(32), default="none")
    notify_on_failure: Mapped[str] = mapped_column(String(32), default="none")
    webhook_token: Mapped[str] = mapped_column(String, default=gen_id)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    owner: Mapped["User"] = relationship(back_populates="scripts")
    runs: Mapped[list["ScriptRun"]] = relationship(back_populates="script", cascade="all, delete-orphan")

class ScriptRun(Base):
    __tablename__ = "script_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    script_id: Mapped[str] = mapped_column(ForeignKey("scripts.id"))
    trigger: Mapped[str] = mapped_column(String(32), default="manual")
    status: Mapped[str] = mapped_column(String(16), default="running")
    stdout: Mapped[Optional[str]] = mapped_column(Text)
    stderr: Mapped[Optional[str]] = mapped_column(Text)
    exit_code: Mapped[Optional[int]] = mapped_column(Integer)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    loop_id: Mapped[Optional[str]] = mapped_column(String)  # Links run back to Brain loop
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    script: Mapped["Script"] = relationship(back_populates="runs")

class Note(Base):
    __tablename__ = "notes"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(256), default="Untitled")
    content: Mapped[str] = mapped_column(Text, default="")
    doc_type: Mapped[str] = mapped_column(String(32), default="markdown")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Secret(Base):
    """Encrypted credential storage for Flow scripts — the real gap found
    in record.md Session 22: the frontend's FlowPanel expected a /secrets
    API that never existed, and ExecutionLayer.run() already accepted a
    `secrets` dict parameter that nothing ever populated. Values are
    encrypted at rest (see governance/secrets_vault.py) — this table never
    stores plaintext."""
    __tablename__ = "secrets"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(128))          # e.g. "STRIPE_API_KEY" -- referenced by scripts as SECRET_<name>
    description: Mapped[Optional[str]] = mapped_column(Text)
    encrypted_value: Mapped[str] = mapped_column(Text)        # Fernet ciphertext, never plaintext
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    owner: Mapped["User"] = relationship(back_populates="secrets")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
