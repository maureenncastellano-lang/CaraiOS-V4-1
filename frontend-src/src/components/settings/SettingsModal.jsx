import React, { useState, useEffect } from "react";
import { X, CheckCircle, AlertCircle, ExternalLink, Save } from "lucide-react";
import useStore from "../../store/useStore";
import { api } from "../../services/api";

const PROVIDER_LINKS = {
  anthropic:"https://console.anthropic.com/keys", openrouter:"https://openrouter.ai/keys",
  deepseek:"https://platform.deepseek.com/api_keys", gemini:"https://aistudio.google.com/app/apikey",
  huggingface:"https://huggingface.co/settings/tokens", ollama:null,
};

const Toggle = ({ value, onChange, label }) => (
  <label className="toggle-row">
    <span>{label}</span>
    <div className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)}>
      <div className="toggle-thumb" />
    </div>
  </label>
);

const NumInput = ({ label, value, onChange, min, max, step=1 }) => (
  <label className="settings-row">
    <span>{label}</span>
    <input type="number" className="settings-number" value={value} min={min} max={max} step={step}
      onChange={e => onChange(Number(e.target.value))} />
  </label>
);

const SelInput = ({ label, value, onChange, options }) => (
  <label className="settings-row">
    <span>{label}</span>
    <select className="settings-select" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen, providers, selectedProvider, selectedModel,
    setProvider, setModel, workspaceSettings, setWorkspaceSettings } = useStore();
  const [tab, setTab]   = useState("providers");
  const [local, setLocal] = useState(null);
  const [saved, setSaved] = useState(false);
  const [ucipStats, setUcipStats] = useState(null);

  useEffect(() => {
    if (settingsOpen) {
      if (!local) api.getSettings().then(s => { setLocal(s); setWorkspaceSettings(s); }).catch(() => {});
      api.ucipHealth().then(setUcipStats).catch(() => {});
    }
  }, [settingsOpen]);

  const patch = (section, key, val) => setLocal(s => ({ ...s, [section]: { ...s[section], [key]: val } }));

  const saveAll = async () => {
    if (!local) return;
    await api.saveSettings(local);
    setWorkspaceSettings(local);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  if (!settingsOpen) return null;
  const s = local || {};

  const TABS = ["providers","editor","ai","git","ui","ucip"];

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
      <div className="settings-modal wide">
        <div className="settings-header">
          <h2>⚙️ Settings</h2>
          <button onClick={() => setSettingsOpen(false)}><X size={16} /></button>
        </div>
        <div className="settings-layout">
          <div className="settings-nav">
            {TABS.map(t => (
              <button key={t} className={`settings-nav-item ${tab===t?"active":""}`} onClick={() => setTab(t)}>
                {t === "ucip" ? "🔬 UCIP" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="settings-content">

            {tab === "providers" && (
              <div>
                <p className="settings-hint">Keys are set via <code>.env</code> on the server and never sent to the browser.</p>
                <div className="provider-list">
                  {Object.entries(providers).map(([id, p]) => (
                    <div key={id}
                      className={`provider-card ${selectedProvider===id?"selected":""} ${!p.configured?"unconfigured":""}`}
                      onClick={() => p.configured && setProvider(id)}>
                      <div className="provider-card-header">
                        <span className="provider-icon">{p.icon}</span>
                        <span className="provider-name">{p.name}</span>
                        {p.configured ? <CheckCircle size={14} color="#4ade80"/> : <AlertCircle size={14} color="#f59e0b"/>}
                        {PROVIDER_LINKS[id] && <a href={PROVIDER_LINKS[id]} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}><ExternalLink size={12} color="#888"/></a>}
                      </div>
                      {selectedProvider===id && p.configured && (
                        <div className="provider-models">
                          <label>Model</label>
                          <select value={selectedModel} onChange={e=>setModel(e.target.value)} onClick={e=>e.stopPropagation()}>
                            {p.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                      )}
                      {!p.configured && <p className="provider-unconfigured-msg">Set <code>{id.toUpperCase()}_API_KEY</code> in <code>.env</code></p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "editor" && s.editor && (
              <div className="settings-section">
                <NumInput label="Font Size" value={s.editor.fontSize} min={10} max={28} onChange={v=>patch("editor","fontSize",v)}/>
                <NumInput label="Tab Size" value={s.editor.tabSize} min={2} max={8} onChange={v=>patch("editor","tabSize",v)}/>
                <SelInput label="Word Wrap" value={s.editor.wordWrap}
                  options={[{value:"off",label:"Off"},{value:"on",label:"On"}]}
                  onChange={v=>patch("editor","wordWrap",v)}/>
                <SelInput label="Line Numbers" value={s.editor.lineNumbers}
                  options={[{value:"on",label:"On"},{value:"off",label:"Off"},{value:"relative",label:"Relative"}]}
                  onChange={v=>patch("editor","lineNumbers",v)}/>
                <Toggle label="Minimap" value={s.editor.minimap} onChange={v=>patch("editor","minimap",v)}/>
                <Toggle label="Format on Save" value={s.editor.formatOnSave} onChange={v=>patch("editor","formatOnSave",v)}/>
                <Toggle label="Auto Save" value={s.editor.autoSave} onChange={v=>patch("editor","autoSave",v)}/>
              </div>
            )}

            {tab === "ai" && s.ai && (
              <div className="settings-section">
                <Toggle label="Inline Autocomplete" value={s.ai.autocompleteEnabled} onChange={v=>patch("ai","autocompleteEnabled",v)}/>
                <NumInput label="Autocomplete Delay (ms)" value={s.ai.autocompleteDelay} min={100} max={3000} step={100} onChange={v=>patch("ai","autocompleteDelay",v)}/>
                <Toggle label="Codebase Context in Chat" value={s.ai.useCodebaseContext} onChange={v=>patch("ai","useCodebaseContext",v)}/>
              </div>
            )}

            {tab === "git" && s.git && (
              <div className="settings-section">
                <Toggle label="Auto-fetch on open" value={s.git.autofetch} onChange={v=>patch("git","autofetch",v)}/>
                <Toggle label="Confirm before push" value={s.git.confirmBeforePush} onChange={v=>patch("git","confirmBeforePush",v)}/>
              </div>
            )}

            {tab === "ui" && s.ui && (
              <div className="settings-section">
                <SelInput label="Theme" value={s.ui.theme}
                  options={[{value:"vs-dark",label:"Dark"},{value:"light",label:"Light"},{value:"hc-black",label:"High Contrast"}]}
                  onChange={v=>patch("ui","theme",v)}/>
                <NumInput label="Terminal Font Size" value={s.ui.terminalFontSize} min={10} max={24} onChange={v=>patch("ui","terminalFontSize",v)}/>
                <Toggle label="Show Breadcrumbs" value={s.ui.showBreadcrumbs} onChange={v=>patch("ui","showBreadcrumbs",v)}/>
              </div>
            )}

            {tab === "ucip" && (
              <div className="settings-section">
                <p className="settings-hint">UCIP v1.0 — Universal Capability Interface Protocol. All platform actions are governed, logged and verifiable.</p>
                {ucipStats && (
                  <div className="ucip-stats-grid">
                    <div className="ucip-stat-box"><span>Status</span><strong style={{color:"#3fb950"}}>{ucipStats.status}</strong></div>
                    <div className="ucip-stat-box"><span>Total Traces</span><strong>{ucipStats.total_traces}</strong></div>
                    <div className="ucip-stat-box"><span>Error Rate</span><strong>{(parseFloat(ucipStats.recent_error_rate)*100).toFixed(1)}%</strong></div>
                    <div className="ucip-stat-box"><span>Version</span><strong>v1.0</strong></div>
                  </div>
                )}
                <p className="settings-hint" style={{marginTop:12}}>
                  UCIP v2 will add: Supabase-persisted traces · policy enforcement engine · multi-agent approval gates · UCIP-S streaming protocol.
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="settings-footer">
          <span>{saved ? "✓ Saved to .carai/settings.json" : "Persisted to workspace"}</span>
          <div style={{display:"flex",gap:8}}>
            <button className="btn-secondary" onClick={()=>setSettingsOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveAll}><Save size={13}/> Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
