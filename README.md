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

## Brain worker selection

The Brain selects a worker persona with a scoring-based routing heuristic in [brain/agents/__init__.py](brain/agents/__init__.py). The selection logic is exposed through `get_best_agent_for_goal()` and `describe_worker_selection()` so the decision can be inspected and documented without changing the core routing implementation.

## Plugin tool registry

New capabilities can be registered dynamically through `register_tool_contract()` in [governance/tool_contracts.py](governance/tool_contracts.py). This lets plugin authors add new tools by declaring a contract rather than patching the core registry in place.

## Execution permissions

Execution requests pass through the UCIP permission guard in [governance/ucip.py](governance/ucip.py). The guard blocks disallowed capabilities, prompt-injection payloads, and human-approval-required actions before execution proceeds.
