"""CaraiOS Core Config"""
import secrets
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "CaraiOS"
    SECRET_KEY: str = secrets.token_hex(32)
    DEBUG: bool = False
    ALLOWED_ORIGINS: List[str] = ["http://localhost:8000"]

    DATABASE_URL: str = "sqlite+aiosqlite:///./data/caraios.db"

    AUTH_ENABLED: bool = True
    JWT_SECRET: str = secrets.token_hex(32)
    JWT_EXPIRE_HOURS: int = 168
    ADMIN_USER: str = "admin"
    ADMIN_EMAIL: str = "admin@localhost"
    ADMIN_PASSWORD: str = ""

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

    # LLMs
    OLLAMA_HOST: str = "https://ollama.carai.agency"
    OLLAMA_DEFAULT_MODEL: str = "llama3"
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_DEFAULT_MODEL: str = "mistralai/mistral-7b-instruct:free"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_DEFAULT_MODEL: str = "deepseek-chat"
    GEMINI_API_KEY: str = ""
    GEMINI_DEFAULT_MODEL: str = "gemini-1.5-flash"
    OPENAI_API_KEY: str = ""
    # HuggingFace's OpenAI-compatible router — a real HF token is required
    # even for "free" models (rate-limited monthly free credits, not
    # anonymous access), confirmed against HF's current docs as of this
    # audit. Model IDs need a provider suffix (e.g. "meta-llama/Llama-3.3-70B-Instruct:auto")
    # or they default to HF's automatic "fastest" routing.
    HUGGINGFACE_API_KEY: str = ""
    HUGGINGFACE_BASE_URL: str = "https://router.huggingface.co/v1"
    HUGGINGFACE_DEFAULT_MODEL: str = "meta-llama/Llama-3.3-70B-Instruct:auto"
    DEFAULT_PROVIDER: str = "ollama"

    # Search
    TAVILY_API_KEY: str = ""
    SEARXNG_URL: str = "http://localhost:8080"

    # Memory
    CHROMADB_HOST: str = "localhost"
    CHROMADB_PORT: int = 8100
    ENCRYPTION_KEY: str = ""

    # Script runner
    SCRIPT_TIMEOUT: int = 60
    WEBHOOK_SECRET: str = secrets.token_hex(16)

    # Notifications
    NTFY_URL: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    # Integrations
    IMAP_HOST: str = ""
    IMAP_PORT: int = 993
    IMAP_USER: str = ""
    IMAP_PASSWORD: str = ""
    CALDAV_URL: str = ""
    CALDAV_USER: str = ""
    CALDAV_PASSWORD: str = ""

    @property
    def has_supabase(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_KEY)

    @property
    def has_tavily(self) -> bool:
        return bool(self.TAVILY_API_KEY)

    @property
    def available_providers(self) -> List[str]:
        p = ["ollama"]
        if self.OPENROUTER_API_KEY:   p.append("openrouter")
        if self.DEEPSEEK_API_KEY:     p.append("deepseek")
        if self.GEMINI_API_KEY:       p.append("gemini")
        if self.OPENAI_API_KEY:       p.append("openai")
        if self.HUGGINGFACE_API_KEY:  p.append("huggingface")
        return p

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
