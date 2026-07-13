import React, { useEffect, useMemo, useState } from "react";
import { Sparkles, X, Play, Loader, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";
import useStore from "../../store/useStore";
import { api } from "../../services/api";

const DEFAULT_STACK = "fastapi";

function statusPill(status) {
  if (!status) return null;
  const variants = {
    running: { label: "Building…", color: "#d29922" },
    success: { label: "Built", color: "#3fb950" },
    error: { label: "Failed", color: "#f85149" },
  };
  const style = variants[status] || { label: status, color: "#8b949e" };
  return <span style={{ color: style.color, fontSize: 12, fontWeight: 600 }}>{style.label}</span>;
}

export default function ProjectBuilderPanel() {
  const { composerOpen, setComposerOpen, setStatus } = useStore();
  const [open, setOpen] = useState(true);
  const [stacks, setStacks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState("sample-app");
  const [description, setDescription] = useState("A small full-stack app to automate a workflow.");
  const [stack, setStack] = useState(DEFAULT_STACK);
  const [features, setFeatures] = useState("CRUD, auth, dashboard");
  const [loading, setLoading] = useState(false);
  const [status, setBuildStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api.listStacks().then((data) => {
      if (!active) return;
      setStacks(data.stacks || []);
      const first = (data.stacks || [])[0]?.id || DEFAULT_STACK;
      setStack(first);
    }).catch(() => {});
    api.listProjects().then((data) => {
      if (!active) return;
      setProjects(data.projects || []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const selectedStack = useMemo(() => stacks.find((s) => s.id === stack) || stacks[0], [stacks, stack]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    setLoading(true);
    setError(null);
    setBuildStatus("running");
    setStatus("Building project…");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        stack,
        features: features.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean),
        verify: false,
      };
      const res = await api.buildProject(payload);
      setResult(res);
      setBuildStatus(res?.errors?.length ? "error" : "success");
      setStatus(res?.errors?.length ? "Build completed with warnings" : "Build completed");
      const next = await api.listProjects();
      setProjects(next.projects || []);
    } catch (err) {
      setError(err.message || "Build failed");
      setBuildStatus("error");
      setStatus("Build failed");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ padding: 12, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={14} color="#3fb950" />
          <strong>Website Builder</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {statusPill(status)}
          <button className="btn-icon" onClick={() => setOpen(false)}><X size={14} /></button>
        </div>
      </div>

      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#8b949e" }}>Project name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ background: "#0d1117", color: "#f0f6fc", border: "1px solid #30363d", borderRadius: 6, padding: 8 }} />
        <label style={{ fontSize: 12, color: "#8b949e" }}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ background: "#0d1117", color: "#f0f6fc", border: "1px solid #30363d", borderRadius: 6, padding: 8 }} />
        <label style={{ fontSize: 12, color: "#8b949e" }}>Stack</label>
        <select value={stack} onChange={(e) => setStack(e.target.value)} style={{ background: "#0d1117", color: "#f0f6fc", border: "1px solid #30363d", borderRadius: 6, padding: 8 }}>
          {stacks.map((entry) => <option key={entry.id} value={entry.id}>{entry.id}</option>)}
        </select>
        {selectedStack && <div style={{ fontSize: 12, color: "#8b949e" }}>{selectedStack.description}</div>}
        <label style={{ fontSize: 12, color: "#8b949e" }}>Features (comma separated)</label>
        <textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={2} style={{ background: "#0d1117", color: "#f0f6fc", border: "1px solid #30363d", borderRadius: 6, padding: 8 }} />
        <button onClick={submit} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", border: "none", borderRadius: 6, padding: "10px 12px", background: "#238636", color: "#fff" }}>
          {loading ? <Loader size={14} className="spin-slow" /> : <Play size={14} />} {loading ? "Building…" : "Build project"}
        </button>
      </div>

      {error && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f85149", fontSize: 12 }}><AlertCircle size={13} /> {error}</div>}

      {result && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={14} color="#3fb950" />
            <strong>Build result</strong>
          </div>
          <div style={{ fontSize: 12, color: "#8b949e" }}>Project ID: {result.project_id}</div>
          <div style={{ fontSize: 12, color: "#8b949e" }}>Files generated: {result.files?.length || 0}</div>
          {result.setup_commands?.length > 0 && <div style={{ fontSize: 12 }}><strong>Next steps:</strong> {result.setup_commands.join(" | ")}</div>}
          {result.errors?.length > 0 && <div style={{ color: "#f85149", fontSize: 12 }}>{result.errors.join(" • ")}</div>}
        </div>
      )}

      {projects.length > 0 && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 12, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "#8b949e" }}>Recent projects</div>
          {projects.slice(0, 5).map((item) => (
            <div key={item.project_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #30363d", paddingTop: 6 }}>
              <span style={{ fontSize: 12 }}>{item.spec?.name || item.project_id}</span>
              <span style={{ fontSize: 11, color: "#8b949e" }}>{item.spec?.stack || "app"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
