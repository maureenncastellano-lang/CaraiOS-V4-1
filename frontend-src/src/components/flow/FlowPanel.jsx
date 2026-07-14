import React, { useState, useEffect, useCallback } from "react";
import {
  Play, Trash2, Clock, Key, RefreshCw,
  ChevronRight, ChevronDown, X, Save, Plus,
  CheckCircle, XCircle, Loader, Code,
} from "lucide-react";
import { api } from "../../services/api";

// Rewritten against the real CaraiOS backend (record.md Session 22).
// This file now uses the shared api.js client and the real Python/FastAPI
// routes instead of the legacy client that assumed a separate localhost
// server with a /api/flow prefix. It also uses the actual field names
// returned by the backend (schedule_type/schedule_value, is_active) and
// polls real run state instead of pretending to stream results.

// -- Script Editor ------------------------------------------------
function ScriptEditor({ script, onSave, onClose }) {
  const [name, setName]           = useState(script?.name || "");
  const [code, setCode]           = useState(script?.code || "# Write your Python script here\nprint('Hello from Flow!')");
  const [description, setDesc]    = useState(script?.description || "");
  const [scheduleType, setSchedT] = useState(script?.schedule_type || "manual");
  const [scheduleValue, setSchedV] = useState(script?.schedule_value || "");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(), description, code, language: "python",
        schedule_type: scheduleType,
        schedule_value: scheduleType === "manual" ? null : scheduleValue,
      };
      if (script?.id) await api.updateFlowScript(script.id, body);
      else await api.createFlowScript(body);
      onSave();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="flow-editor">
      <div className="flow-editor-header">
        <input className="flow-editor-name" value={name} onChange={e => setName(e.target.value)} placeholder="Script name" />
        <div className="flow-editor-actions">
          <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader size={13} className="spin-slow" /> : <Save size={13} />} Save
          </button>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      {error && <div className="flow-error" role="alert">{error}</div>}

      <div className="flow-editor-body">
        <textarea className="flow-code-area" value={code} onChange={e => setCode(e.target.value)} spellCheck={false} />

        <div className="flow-editor-meta">
          <label className="flow-meta-row">
            <span>Description</span>
            <input value={description} onChange={e => setDesc(e.target.value)} placeholder="Optional description" />
          </label>
          <label className="flow-meta-row">
            <span><Clock size={12} /> Schedule</span>
            <select value={scheduleType} onChange={e => setSchedT(e.target.value)}>
              <option value="manual">Manual only</option>
              <option value="interval">Interval (seconds)</option>
              <option value="cron">Cron</option>
            </select>
          </label>
          {scheduleType === "interval" && (
            <label className="flow-meta-row">
              <span>Every N seconds</span>
              <input value={scheduleValue} onChange={e => setSchedV(e.target.value)} placeholder="300" />
            </label>
          )}
          {scheduleType === "cron" && (
            <label className="flow-meta-row">
              <span>Cron expr</span>
              <input value={scheduleValue} onChange={e => setSchedV(e.target.value)} placeholder="0 9 * * 1-5" />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Run result viewer (real polling, not fake SSE) ----------------
function RunOutput({ scriptId, onClose }) {
  const [runs, setRuns] = useState([]);
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let sawNewRun = false;

    async function trigger() {
      try {
        await api.runFlowScript(scriptId);
      } catch (e) {
        if (!cancelled) { setError(e.message); setPolling(false); }
        return;
      }
      const start = Date.now();
      while (!cancelled && Date.now() - start < 30000) {
        const result = await api.flowScriptRuns(scriptId, 5);
        const list = Array.isArray(result) ? result : (result.runs || []);
        if (list.length) {
          setRuns(list);
          if (list[0].status !== "running" && list[0].status !== "queued") {
            sawNewRun = true;
            break;
          }
        }
        await new Promise(r => setTimeout(r, 800));
      }
      if (!cancelled) {
        setPolling(false);
        if (!sawNewRun) setError("Timed out waiting for the run to finish (30s) -- check history, it may still complete.");
      }
    }
    trigger();
    return () => { cancelled = true; };
  }, [scriptId]);

  const latest = runs[0];

  return (
    <div className="run-output">
      <div className="run-output-header">
        <span>
          {polling ? <><Loader size={12} className="spin-slow" /> Running…</>
            : latest?.status === "success" ? <><CheckCircle size={12} color="#3fb950" /> Success</>
            : <><XCircle size={12} color="#f85149" /> {latest?.status || "Failed"}</>}
        </span>
        <button className="btn-icon" onClick={onClose}><X size={13} /></button>
      </div>
      <div className="run-output-body">
        {error && <div className="flow-error" role="alert">{error}</div>}
        {latest && (
          <>
            {latest.stdout && <div className="run-line stdout"><pre>{latest.stdout}</pre></div>}
            {latest.stderr && <div className="run-line stderr"><pre>{latest.stderr}</pre></div>}
            {!latest.stdout && !latest.stderr && <p className="flow-no-runs">(no output)</p>}
          </>
        )}
      </div>
    </div>
  );
}

// -- Secret Manager (now backed by the real /api/secrets routes) --
function SecretsPanel({ onClose }) {
  const [secretsList, setSecretsList] = useState([]);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const load = () => api.listSecrets().then(d => setSecretsList(d.secrets || []));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim() || !value.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.createSecret(name.trim(), value, desc);
      setName(""); setValue(""); setDesc("");
      load();
    } catch (e) { setError(e.message); }
    finally { setAdding(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this secret?")) return;
    await api.deleteSecret(id);
    load();
  };

  return (
    <div className="secrets-panel">
      <div className="secrets-header">
        <Key size={14} /> <span>Secrets</span>
        <button className="btn-icon" onClick={onClose}><X size={13} /></button>
      </div>
      <p className="secrets-hint">Encrypted at rest, injected as SECRET_&lt;NAME&gt; environment variables in scripts.</p>
      {error && <div className="flow-error" role="alert">{error}</div>}
      <div className="secrets-add">
        <input placeholder="NAME" value={name} onChange={e => setName(e.target.value)} className="secrets-input" />
        <input placeholder="value" type="password" value={value} onChange={e => setValue(e.target.value)} className="secrets-input" />
        <input placeholder="description (opt)" value={desc} onChange={e => setDesc(e.target.value)} className="secrets-input" />
        <button className="btn-primary" onClick={add} disabled={adding || !name || !value}>
          {adding ? <Loader size={12} /> : <Plus size={12} />} Add
        </button>
      </div>
      <div className="secrets-list">
        {secretsList.map(s => (
          <div key={s.id} className="secret-row">
            <span className="secret-name">{s.name}</span>
            <span className="secret-desc">{s.description}</span>
            <button className="btn-danger-icon" onClick={() => del(s.id)}><Trash2 size={11} /></button>
          </div>
        ))}
        {secretsList.length === 0 && <p className="secrets-empty">No secrets yet.</p>}
      </div>
    </div>
  );
}

// -- Main Flow Panel ------------------------------------------------
export default function FlowPanel() {
  const [scripts, setScripts]   = useState([]);
  const [stats, setStats]       = useState(null);
  const [editing, setEditing]   = useState(null);
  const [running, setRunning]   = useState(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [runs, setRuns]         = useState({});
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api.flowScripts(), api.flowStats()]);
      setScripts(Array.isArray(s) ? s : []);
      setStats(st);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm("Delete this script?")) return;
    await api.deleteFlowScript(id);
    load();
  };

  const loadRuns = async (id) => {
    const result = await api.flowScriptRuns(id, 10);
    const list = Array.isArray(result) ? result : (result.runs || []);
    setRuns(r => ({ ...r, [id]: list }));
  };

  const toggleExpand = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadRuns(id);
  };

  if (editing) return (
    <ScriptEditor
      script={editing === "new" ? null : editing}
      onSave={() => { setEditing(null); load(); }}
      onClose={() => setEditing(null)}
    />
  );

  if (running) return (
    <RunOutput scriptId={running} onClose={() => { setRunning(null); load(); }} />
  );

  if (showSecrets) return <SecretsPanel onClose={() => setShowSecrets(false)} />;

  return (
    <div className="flow-panel">
      <div className="flow-header">
        <div className="flow-header-left">
          <span className="flow-logo">Flow</span>
          {stats && <span className="flow-stats">{stats.total} scripts &middot; {stats.enabled} scheduled</span>}
        </div>
        <div className="flow-header-right">
          <button className="btn-icon" title="Secrets" onClick={() => setShowSecrets(true)}><Key size={14} /></button>
          <button className="btn-icon" title="Refresh" onClick={load}><RefreshCw size={14} /></button>
          <button className="btn-primary" onClick={() => setEditing("new")}><Plus size={13} /> New Script</button>
        </div>
      </div>

      {error && <div className="flow-error" role="alert">{error}</div>}

      <div className="flow-scripts">
        {scripts.length === 0 && !error && (
          <div className="flow-empty">
            <Code size={32} color="#8b949e" />
            <p>No scripts yet</p>
            <p className="flow-empty-hint">Create a script to automate tasks, schedule jobs, and manage secrets.</p>
            <button className="btn-primary" onClick={() => setEditing("new")}><Plus size={13} /> Create your first script</button>
          </div>
        )}

        {scripts.map(s => (
          <div key={s.id} className="flow-script-card">
            <div className="flow-script-main">
              <div className="flow-script-info">
                <span className="flow-script-name">{s.name}</span>
                <span className={`flow-script-status ${s.is_active ? "active" : "inactive"}`}>
                  {s.is_active ? "active" : "inactive"}
                </span>
                {s.schedule_type !== "manual" && (
                  <span className="flow-script-schedule"><Clock size={10} /> {s.schedule_type}</span>
                )}
              </div>
              <div className="flow-script-actions">
                <button className="btn-run" onClick={() => setRunning(s.id)}>
                  <Play size={12} /> Run
                </button>
                <button className="btn-secondary-sm" onClick={() => setEditing(s)}>Edit</button>
                <button className="btn-secondary-sm" onClick={() => toggleExpand(s.id)}>
                  {expanded === s.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />} History
                </button>
                <button className="btn-danger-sm" onClick={() => del(s.id)}><Trash2 size={11} /></button>
              </div>
            </div>

            {expanded === s.id && (
              <div className="flow-runs">
                {!runs[s.id] && <Loader size={12} className="spin-slow" />}
                {runs[s.id]?.length === 0 && <p className="flow-no-runs">No runs yet</p>}
                {runs[s.id]?.map(run => (
                  <div key={run.id} className={`flow-run-row ${run.status}`}>
                    <span className="flow-run-status">
                      {run.status === "success" ? <CheckCircle size={11} color="#3fb950" /> : run.status === "running" ? <Loader size={11} className="spin-slow" /> : <XCircle size={11} color="#f85149" />}
                    </span>
                    <span className="flow-run-trigger">{run.trigger}</span>
                    <span className="flow-run-time">{run.started_at ? new Date(run.started_at).toLocaleString() : ""}</span>
                    {run.duration_ms != null && <span className="flow-run-dur">{run.duration_ms}ms</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
