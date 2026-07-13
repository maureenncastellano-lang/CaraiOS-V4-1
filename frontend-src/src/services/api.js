// DevOS frontend -> CaraiOS v3 backend.
//
// Rewired per the Agency OS consolidation decision (Master Plan §"Immediate
// Next Actions" / record.md Session 1): DevOS's own Node backend is retired.
// This file now talks to CaraiOS v3's FastAPI routes instead.
//
// Two real architecture differences from the original api.js, both handled
// explicitly below rather than papered over:
//   1. Auth: CaraiOS uses its own JWT (username/password -> bcrypt -> JWT),
//      not Supabase. Token is kept in localStorage. supabase.js is no
//      longer used by this file.
//   2. Projects: CaraiOS is project-scoped (every file/git/terminal route
//      is under /api/{files,vcs,terminal}/{project_id}/...) but DevOS's
//      original calls had no project concept at all (one flat workspace).
//      This file introduces a lightweight "current project" resolver
//      (getCurrentProject/setCurrentProject) defaulting to a fixed id, so
//      every existing call site in the components keeps working with zero
//      changes, while the underlying backend is correctly multi-project.
//
// Honesty note: not every original method has a real CaraiOS backend yet.
// Methods under "NOT YET IMPLEMENTED" throw a clear, typed error instead of
// silently succeeding or returning fake data — see record.md Session 6 for
// the full list and why each one isn't done.

// Empty string = same-origin relative requests. This is the correct
// default now that app.py serves this build directly (see record.md
// Session 19) — frontend and backend are literally the same process on
// the same origin, so there's no separate host/port to hardcode. Only set
// REACT_APP_CARAIOS_URL if you're running the frontend dev server
// separately from the backend (e.g. `npm start` against a backend running
// elsewhere during development).
const BASE = process.env.REACT_APP_CARAIOS_URL || "";
const TOKEN_KEY = "caraios_token";
const PROJECT_KEY = "caraios_current_project";
const DEFAULT_PROJECT = "default";

// ── Auth ──────────────────────────────────────────────────────
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `Login failed: HTTP ${r.status}`);
  }
  const data = await r.json();
  setToken(data.token);
  return data.user;
}

export function logout() {
  setToken(null);
}

export async function verifySession() {
  // Validates a stored token against the backend rather than trusting its
  // mere presence in localStorage — a token can be stale (server restarted
  // with a fresh JWT_SECRET, per record.md Session 6's known follow-up) or
  // expired. Returns the user object if valid, null otherwise (and clears
  // the dead token so the app doesn't keep retrying it).
  if (!getToken()) return null;
  try {
    return await req(`/api/auth/me`);
  } catch (e) {
    setToken(null);
    return null;
  }
}

// ── Current project ───────────────────────────────────────────
export function getCurrentProject() {
  return localStorage.getItem(PROJECT_KEY) || DEFAULT_PROJECT;
}

export function setCurrentProject(projectId) {
  localStorage.setItem(PROJECT_KEY, projectId);
}

// ── Low-level request helpers ────────────────────────────────
async function req(path, opts = {}) {
  const token = getToken();
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    const message = err.detail
      ? (typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail))
      : (err.error || err.message || `HTTP ${r.status}`);
    throw new Error(message);
  }
  // 204/empty-body responses (e.g. some DELETE calls) won't have JSON
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function notImplemented(name, reason) {
  return () => {
    throw new Error(
      `api.${name}() is not implemented against CaraiOS v3 yet. ${reason} ` +
      `See record.md Session 6 "Known follow-ups" for the full list.`
    );
  };
}

// ── Files ─────────────────────────────────────────────────────
// CaraiOS's delete route blocks on a HITL approval (see governance/hitl.py) —
// it will not resolve until someone calls api.approveHitl(id) or it times
// out at 120s server-side. There's no approval-modal UI wired up to this
// yet (flagged in record.md); for now, a caller of deleteFile/discard needs
// to also be watching subscribeToEvents() for a "hitl.pending" event and
// call approveHitl/denyHitl itself, or the call will simply hang until the
// timeout. This is documented rather than hidden behind a fake instant
// success, since a UI that assumes instant deletion would be actively
// misleading here.
const filesApi = {
  getTree:    () => req(`/api/files/${getCurrentProject()}/tree`),
  readFile:   (path) => req(`/api/files/${getCurrentProject()}/read?path=${encodeURIComponent(path)}`),
  writeFile:  (path, content) => req(`/api/files/${getCurrentProject()}/write`, { method: "POST", body: JSON.stringify({ path, content }) }),
  createFile: (path, type = "file") => req(`/api/files/${getCurrentProject()}/create`, { method: "POST", body: JSON.stringify({ path, is_dir: type === "dir" }) }),
  renameFile: (oldPath, newPath) => req(`/api/files/${getCurrentProject()}/rename`, { method: "POST", body: JSON.stringify({ path: oldPath, new_path: newPath }) }),
  deleteFile: (path) => req(`/api/files/${getCurrentProject()}/delete?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  downloadUrl: (path) => {
    return `${BASE}/api/files/${getCurrentProject()}/download?path=${encodeURIComponent(path)}`;
  },
};

const searchApi = {
  searchFiles: (query, max_results = 20) =>
    req(`/api/search/files`, {
      method: "POST",
      body: JSON.stringify({ query, project_id: getCurrentProject(), max_results }),
    }),
  getIndexStatus: () =>
    req(`/api/search/index/status?project_id=${encodeURIComponent(getCurrentProject())}`),
  reindex: () =>
    req(`/api/search/index/reindex?project_id=${encodeURIComponent(getCurrentProject())}`, { method: "POST" }),
};

const builderApi = {
  listStacks: () => req(`/api/extras/stacks`),
  buildProject: (spec) => req(`/api/extras/build`, { method: "POST", body: JSON.stringify(spec) }),
  listProjects: () => req(`/api/extras/projects`),
  getProjectFiles: (projectId) => req(`/api/extras/projects/${encodeURIComponent(projectId)}/files`),
};

// ── Git ───────────────────────────────────────────────────────
const gitApi = {
  gitStatus:   () => req(`/api/vcs/${getCurrentProject()}/status`),
  gitInit:     () => req(`/api/vcs/${getCurrentProject()}/init`, { method: "POST" }),
  gitStage:    (files) => req(`/api/vcs/${getCurrentProject()}/stage`, { method: "POST", body: JSON.stringify({ paths: files }) }),
  gitUnstage:  (files) => req(`/api/vcs/${getCurrentProject()}/unstage`, { method: "POST", body: JSON.stringify({ paths: files }) }),
  gitCommit:   (message) => req(`/api/vcs/${getCurrentProject()}/commit`, { method: "POST", body: JSON.stringify({ message }) }),
  gitPush:     (remote, branch) => req(`/api/vcs/${getCurrentProject()}/push`, { method: "POST", body: JSON.stringify({ remote: remote || "origin", branch }) }),
  gitPull:     (remote, branch) => req(`/api/vcs/${getCurrentProject()}/pull`, { method: "POST", body: JSON.stringify({ remote: remote || "origin", branch }) }),
  gitCheckout: (branch, create) => req(`/api/vcs/${getCurrentProject()}/checkout`, { method: "POST", body: JSON.stringify({ branch, create: !!create }) }),
  gitDiscard:  (path) => req(`/api/vcs/${getCurrentProject()}/discard`, { method: "POST", body: JSON.stringify({ path }) }),
  gitDiff:     (path, staged = false) => req(`/api/vcs/${getCurrentProject()}/diff${path ? `?path=${encodeURIComponent(path)}&staged=${staged}` : `?staged=${staged}`}`),
  // gitAddRemote: called by a component but was never in the original
  // api.js either (a pre-existing gap in DevOS itself, not introduced by
  // this rewiring) — and CaraiOS's GitService has no add-remote wrapper
  // yet. Real gap on both sides; flagged rather than silently stubbed.
  gitAddRemote: notImplemented("gitAddRemote",
    "Neither the original DevOS backend nor CaraiOS's GitService implement this yet."),
};

// ── Terminal (new — DevOS never had this in api.js since its own
//    node-pty-backed terminal was a separate, non-api.js code path) ──
const terminalApi = {
  runCommand: (command, timeout = 60) =>
    req(`/api/terminal/${getCurrentProject()}/run`, { method: "POST", body: JSON.stringify({ command, timeout }) }),
  // Streaming terminal is a WebSocket, not a fetch — exposed as a factory
  // that returns a ready-to-use WebSocket rather than an async function,
  // since the calling component needs the raw socket to attach handlers.
  // WebSocket needs an explicit ws:// or wss:// scheme -- unlike fetch,
  // it can't resolve a bare relative path against the page's origin with
  // the right scheme automatically. When BASE is empty (same-origin,
  // the normal case now), derive the ws/wss + host from window.location
  // instead of naively string-replacing an empty BASE (which would
  // produce an invalid, scheme-less URL and throw.
  openStreamingTerminal: () => {
    const wsBase = BASE
      ? BASE.replace(/^http/, "ws")
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
    return new WebSocket(`${wsBase}/api/terminal/${getCurrentProject()}/ws`);
  },
};

const chatApi = {
  async *streamChat({ providerId, model, message, session_id, system_prompt }) {
    const token = getToken();
    const body = {
      message,
      session_id,
      provider: providerId,
      model,
      system_prompt,
    };
    const r = await fetch(`${BASE}/api/chat/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!r.ok || !r.body) throw new Error(`Chat stream failed: HTTP ${r.status}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = JSON.parse(line.slice("data: ".length));
        if (payload.error) yield { error: payload.error, session_id: payload.session_id };
        else if (payload.delta) yield { text: payload.delta, session_id: payload.session_id };
        else yield payload;
      }
    }
  },
};

// ── Governance / UCIP ─────────────────────────────────────────
const governanceApi = {
  ucipHealth: () => req(`/api/governance/metrics`),
  // ^ CaraiOS has no single "/ucip/health" endpoint the way DevOS's own
  // UCIP implementation did — /governance/metrics is the closest real
  // equivalent (HITL stats + audit summary). Not a 1:1 match; flagged.
  ucipTraces: (params = {}) => req(`/api/governance/traces?${new URLSearchParams(params)}`),
  ucipCapabilities: (trustLevel = "OPERATOR") => req(`/api/governance/ucip/capabilities/${trustLevel}`),
  ucipIdentity: (sessionId) => req(`/api/governance/ucip/identity?session_id=${encodeURIComponent(sessionId)}`),
  getPendingHitl: () => req(`/api/governance/hitl/pending`),
  approveHitl: (requestId) => req(`/api/governance/hitl/${requestId}/approve`, { method: "POST" }),
  denyHitl: (requestId) => req(`/api/governance/hitl/${requestId}/deny`, { method: "POST" }),
};

// ── Communications (new — live event stream, see communications/bus.py) ──
// The backend sends *named* SSE events (event: hitl.pending, event:
// hitl.resolved, ...), not generic unnamed "message" frames — that's the
// correct, standard way to do typed SSE. A naive `es.onmessage = ...`
// listener (which is what the first version of this function used) never
// fires for named events at all, so it silently received nothing. Fixed by
// registering listeners for every currently-known event type, while also
// returning the raw EventSource so a caller can addEventListener() for a
// new type this file doesn't know about yet without needing another edit
// here.
const KNOWN_EVENT_TYPES = ["hitl.pending", "hitl.resolved"];

function subscribeToEvents(onEvent, onError) {
  const token = getToken();
  const es = new EventSource(`${BASE}/api/comms/stream?token=${encodeURIComponent(token || "")}`);
  const handler = (type) => (e) => onEvent({ type, data: JSON.parse(e.data) });
  for (const type of KNOWN_EVENT_TYPES) {
    es.addEventListener(type, handler(type));
  }
  es.onerror = (e) => { if (onError) onError(e); };
  const unsubscribe = () => es.close();
  unsubscribe.eventSource = es; // escape hatch for unlisted event types
  return unsubscribe;
}

// ── Flow (PyRunner-style scheduled scripts) ────────────────────
const flowApi = {
  flowScripts: () => req(`/api/scripts`),
  flowScript: (id) => req(`/api/scripts/${id}`),
  createFlowScript: (script) => req(`/api/scripts`, { method: "POST", body: JSON.stringify(script) }),
  updateFlowScript: (id, patch) => req(`/api/scripts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteFlowScript: (id) => req(`/api/scripts/${id}`, { method: "DELETE" }),
  runFlowScript: (id) => req(`/api/scripts/${id}/run`, { method: "POST" }),
  flowScriptRuns: (id, limit = 10) => req(`/api/scripts/${id}/runs?limit=${limit}`),
  flowScriptAiDebug: (id) => req(`/api/scripts/${id}/ai-debug`, { method: "POST" }),
  // CaraiOS has no single "/flow/stats" aggregate endpoint — computed
  // client-side here from the scripts list instead. Fixed a real bug
  // (Session 22): this used to filter by `s.enabled`, a field the real
  // backend doesn't have -- the actual field is `is_active`.
  flowStats: async () => {
    const list = await req(`/api/scripts`);
    return { total: list.length, enabled: list.filter((s) => s.is_active).length };
  },
  // Secrets (Session 22) -- the real gap FlowPanel's old, broken separate
  // client expected but the backend never had until now.
  listSecrets: () => req(`/api/secrets`),
  createSecret: (name, value, description) =>
    req(`/api/secrets`, { method: "POST", body: JSON.stringify({ name, value, description }) }),
  deleteSecret: (id) => req(`/api/secrets/${id}`, { method: "DELETE" }),
};

// ── Workers (new — Stage 3, Sessions 8-10: AGENT_LIBRARY personas are now
//    real, invocable, properly-delegated Workers, not just data) ──────────
const workersApi = {
  listWorkers: () => req(`/api/workers`),
  getWorker: (slug) => req(`/api/workers/${encodeURIComponent(slug)}`),
  runWorkerSync: (slug, goal, opts = {}) =>
    req(`/api/workers/${encodeURIComponent(slug)}/run/sync`, {
      method: "POST",
      body: JSON.stringify({ goal, ...opts }),
    }),
  // Streaming variant returns an EventSource-like consumable via fetch's
  // ReadableStream, since this is a POST (EventSource only supports GET).
  // Caller drives iteration; this just wraps the parsing.
  async *streamWorker(slug, goal, opts = {}) {
    const token = getToken();
    const r = await fetch(`${BASE}/api/workers/${encodeURIComponent(slug)}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ goal, ...opts }),
    });
    if (!r.ok || !r.body) throw new Error(`Worker stream failed: HTTP ${r.status}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data: "));
        if (line) yield JSON.parse(line.slice("data: ".length));
      }
    }
  },
  // Multi-worker coordination (Session 9): decomposes the goal and
  // dispatches each subtask to whichever Worker persona fits best,
  // running independent subtasks concurrently.
  runCoordinatedPlan: (goal, opts = {}) =>
    req(`/api/workers/plan/run`, { method: "POST", body: JSON.stringify({ goal, ...opts }) }),
  async *streamAgent({ providerId, model, task, session_id, trust_level = "OPERATOR" }) {
    const slug = "fullstack-engineer";
    for await (const evt of workersApi.streamWorker(slug, task, {
      provider: providerId,
      model,
      session_id,
      trust_level,
    })) {
      if (evt.type === "step") {
        yield { type: "thinking", text: `${evt.step_type}: ${evt.content}`, meta: evt.meta };
      } else if (evt.type === "done") {
        const text = evt.final_answer || evt.output || evt.content || "Done";
        yield { type: "answer", text, ...evt };
        yield { type: "done", ...evt };
      } else if (evt.type === "error") {
        yield { type: "error", message: evt.content || "Worker error" };
      } else {
        yield evt;
      }
    }
  },
};

// ── AI / Agent / Composer / Extensions — NOT YET IMPLEMENTED ───
// These map to Stage 2/3 (Cognitive System, Workers) of the Master Plan,
// which haven't been built yet. Listed explicitly, each throwing a clear
// error naming what's missing, rather than silently returning empty
// results that would look like "no data" instead of "not built."
const notBuiltYet = {
  getProviders: () => req(`/api/models`), // this part IS real — provider list works
  complete: notImplemented("complete", "Inline code completion has no CaraiOS backend yet (Cognitive System, Stage 2)."),
  streamEdit: notImplemented("streamEdit", "AI-driven inline edit has no CaraiOS backend yet (Stage 2)."),
  streamExplain: notImplemented("streamExplain", "Code explanation has no CaraiOS backend yet (Stage 2)."),
  composerPlan: notImplemented("composerPlan", "Multi-file Composer has no CaraiOS backend yet (Stage 3, Workers)."),
  streamComposerExecute: notImplemented("streamComposerExecute", "Composer has no CaraiOS backend yet."),
  composerApply: notImplemented("composerApply", "Composer has no CaraiOS backend yet."),
  searchExtensions: notImplemented("searchExtensions", "Extension marketplace proxy has no CaraiOS backend yet (Stage 8, packaging)."),
  featuredExtensions: notImplemented("featuredExtensions", "Extension marketplace proxy has no CaraiOS backend yet."),
  extensionDetails: notImplemented("extensionDetails", "Extension marketplace proxy has no CaraiOS backend yet."),
  saveSettings: notImplemented("saveSettings", "CaraiOS's /api/models/settings is read-only; no PUT/PATCH route exists yet."),
  patchSettings: notImplemented("patchSettings", "Same as saveSettings — read-only on the CaraiOS side today."),
};

export const api = {
  health: () => req("/api/health"),
  getSettings: () => req("/api/models/settings"),
  ...filesApi,
  ...gitApi,
  ...terminalApi,
  ...governanceApi,
  ...flowApi,
  ...workersApi,
  ...searchApi,
  ...builderApi,
  ...chatApi,
  ...notBuiltYet,
};

export { subscribeToEvents };

export function getLanguageFromPath(filePath) {
  const ext = filePath?.split(".").pop()?.toLowerCase();
  const map = {
    js:"javascript", jsx:"javascript", ts:"typescript", tsx:"typescript",
    py:"python", rb:"ruby", go:"go", rs:"rust", java:"java",
    cpp:"cpp", c:"c", cs:"csharp", php:"php", swift:"swift", kt:"kotlin",
    html:"html", css:"css", scss:"scss", less:"less",
    json:"json", yaml:"yaml", yml:"yaml", toml:"toml", md:"markdown",
    xml:"xml", sql:"sql", sh:"shell", bash:"shell", dockerfile:"dockerfile",
    tf:"terraform", env:"plaintext", txt:"plaintext",
  };
  return map[ext] || "plaintext";
}
