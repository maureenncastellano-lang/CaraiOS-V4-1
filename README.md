# CaraiOS v2 — One System

```
User Intent
    │
    ▼
Brain Layer  ──────────────────────────────────────────┐
(Plans, writes code, decides next step)                │
    │                                                  │
    │  "run this"                        "loop again"  │
    ▼                                                  │
Execution Layer                                        │
(Runs code, returns structured results)                │
    │                                                  │
    │  results flow back up ───────────────────────────┘
    ▼
Memory Layer
(Stores what happened, recalled next time)
```

## Quick Start

```bash
cp .env.example .env
# Install runtime dependencies
pip install -r requirements.txt
# Install developer/test dependencies
pip install -r requirements-dev.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 — credentials printed on first boot.
