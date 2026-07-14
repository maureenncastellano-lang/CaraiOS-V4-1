import React, { useEffect, useCallback, Suspense, lazy, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import useStore from "./store/useStore";
import { api, verifySession } from "./services/api";
import LoginScreen from "./components/auth/LoginScreen";

import CodeEditor   from "./components/editor/CodeEditor";
import FileTree     from "./components/editor/FileTree";
import StatusBar    from "./components/editor/StatusBar";
import ChatSidebar  from "./components/sidebar/ChatSidebar";

const ProjectBuilderPanel = lazy(() => import("./components/builder/ProjectBuilderPanel"));
const BackgroundAgents = lazy(() => import("./components/sidebar/BackgroundAgents"));
const GitPanel         = lazy(() => import("./components/sidebar/GitPanel"));
const SearchPanel      = lazy(() => import("./components/sidebar/SearchPanel"));
const FlowPanel        = lazy(() => import("./components/flow/FlowPanel"));
const WorkersPanel     = lazy(() => import("./components/workers/WorkersPanel"));
const TerminalPanel    = lazy(() => import("./components/terminal/TerminalPanel"));
const ProblemsPanel    = lazy(() => import("./components/editor/ProblemsPanel"));
const SettingsModal    = lazy(() => import("./components/settings/SettingsModal"));
const CmdKModal        = lazy(() => import("./components/editor/CmdKModal"));
const CommandPalette   = lazy(() => import("./components/editor/CommandPalette"));
const ComposerPanel    = lazy(() => import("./components/composer/ComposerPanel"));
const ScratchPad       = lazy(() => import("./components/editor/ScratchPad"));

import "./App.css";
import "./devos.css";
import "./devos-extra.css";

const WS_BASE = process.env.REACT_APP_CARAIOS_URL
  ? process.env.REACT_APP_CARAIOS_URL.replace("http://", "ws://").replace("https://", "wss://")
  : "";

const Spin = () => (
  <div className="app-loading" role="status" aria-live="polite">
    <div className="loading-orb" />
    <div className="loading-copy">
      <div className="loading-title">Preparing your workspace</div>
      <div className="loading-subtitle">Syncing the systems that turn intent into momentum.</div>
    </div>
  </div>
);

// ── Hook: detect mobile ────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

// ── Mobile layout — one full-screen panel at a time ────────
function MobileLayout({ rightPanel, terminalOpen, problemsOpen }) {
  const { mobileTab, setMobileTab } = useStore();

  // Active panel content
  const panels = {
    editor: <CodeEditor />,
    files:  <FileTree />,
    chat:   <ChatSidebar />,
    builder: <Suspense fallback={<Spin />}><ProjectBuilderPanel /></Suspense>,
    git:    <Suspense fallback={<Spin />}><GitPanel /></Suspense>,
    flow:   <Suspense fallback={<Spin />}><FlowPanel /></Suspense>,
    workers: <Suspense fallback={<Spin />}><WorkersPanel /></Suspense>,
    composer: <Suspense fallback={<Spin />}><ComposerPanel /></Suspense>,
    search: <Suspense fallback={<Spin />}><SearchPanel /></Suspense>,
    terminal: <Suspense fallback={<Spin />}><TerminalPanel /></Suspense>,
  };

  const active = panels[mobileTab] || panels.editor;

  const TABS = [
    { id: "editor",   icon: "⌨️",  label: "Editor" },
    { id: "files",    icon: "📁",  label: "Files" },
    { id: "chat",     icon: "💬",  label: "Chat" },
    { id: "flow",     icon: "🔥",  label: "Flow" },
    { id: "git",      icon: "🌿",  label: "Git" },
    { id: "more",     icon: "⋯",   label: "More" },
  ];

  const [showMore, setShowMore] = useState(false);
  const MORE = [
    { id: "builder",  icon: "🛠️", label: "Builder" },
    { id: "workers",  icon: "🧑‍💼", label: "Workers" },
    { id: "composer", icon: "⚡", label: "Composer" },
    { id: "search",   icon: "🔍", label: "Search" },
    { id: "terminal", icon: "💻", label: "Terminal" },
  ];

  const selectTab = (id) => {
    if (id === "more") { setShowMore(s => !s); return; }
    setShowMore(false);
    setMobileTab(id);
  };

  return (
    <div className="mobile-layout">
      {/* Full-screen content */}
      <div className="mobile-content">
        {active}
      </div>

      {/* More drawer */}
      {showMore && (
        <div className="mobile-more-drawer">
          {MORE.map(t => (
            <button key={t.id} className={`mobile-drawer-item ${mobileTab===t.id?"active":""}`}
              onClick={() => selectTab(t.id)}>
              <span className="mobile-drawer-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="mobile-tabbar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`mobile-tab ${(t.id !== "more" && mobileTab === t.id) || (t.id === "more" && showMore) ? "active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            <span className="mobile-tab-icon">{t.icon}</span>
            <span className="mobile-tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Desktop layout — resizable panels ─────────────────────
function DesktopLayout({ rightPanel, terminalOpen, problemsOpen }) {
  return (
    <div className="main-layout">
      <PanelGroup direction="horizontal" className="panel-group">
        <Panel defaultSize={16} minSize={10} maxSize={30} className="panel-file-tree">
          <FileTree />
        </Panel>
        <PanelResizeHandle className="resize-handle" />

        <Panel minSize={28} className="panel-editor">
          <PanelGroup direction="vertical">
            <Panel minSize={25}>
              <CodeEditor />
            </Panel>
            {problemsOpen && (
              <>
                <PanelResizeHandle className="resize-handle horizontal" />
                <Panel defaultSize={20} minSize={10} maxSize={50}>
                  <Suspense fallback={<Spin />}><ProblemsPanel /></Suspense>
                </Panel>
              </>
            )}
            {terminalOpen && (
              <>
                <PanelResizeHandle className="resize-handle horizontal" />
                <Panel defaultSize={28} minSize={12} maxSize={60}>
                  <Suspense fallback={<Spin />}><TerminalPanel /></Suspense>
                </Panel>
              </>
            )}
          </PanelGroup>
        </Panel>

        {rightPanel && (
          <>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={28} minSize={18} maxSize={50} className="panel-chat">
              <Suspense fallback={<Spin />}>
                {rightPanel === "composer" && <ComposerPanel />}
                {rightPanel === "builder"  && <ProjectBuilderPanel />}
                {rightPanel === "git"      && <GitPanel />}
                {rightPanel === "search"   && <SearchPanel />}
                {rightPanel === "flow"     && <FlowPanel />}
                {rightPanel === "workers"  && <WorkersPanel />}
                {rightPanel === "chat"     && <ChatSidebar />}
              </Suspense>
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();

  const {
    setFileTree, setProviders, setProvider, setWorkspaceSettings,
    setIndexStats, setGitStatus,
    chatOpen, terminalOpen, agentOpen, gitOpen, searchOpen,
    problemsOpen, flowOpen, composerOpen, workersOpen,
    setChatOpen, setGitOpen, setSearchOpen, setSettingsOpen,
    setAgentOpen, setFlowOpen, setTerminalOpen, setProblemsOpen,
    setPaletteOpen, setScratchOpen, setComposerOpen, setWorkersOpen,
    workspaceSettings, isAuthenticated, authChecked, setUser,
  } = useStore();

  // ── Auth gate ───────────────────────────────────────────
  // Runs before anything else — a stored token (see record.md Session 6's
  // known follow-up about JWT_SECRET resetting on server restart) might be
  // stale, so it's verified against GET /api/auth/me rather than trusted
  // just because localStorage has something in it.
  useEffect(() => {
    verifySession().then((user) => setUser(user));
  }, []);

  // ── Boot ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return; // don't hit any other endpoint pre-auth
    api.getProviders().then(p => {
      setProviders(p);
      if (!localStorage.getItem("devos_provider")) {
        const first = Object.entries(p).find(([, v]) => v.configured);
        if (first) setProvider(first[0]);
      }
    }).catch(() => useStore.getState().setStatus("⚠️  Backend offline — start the server"));

    api.getTree().then(({ tree }) => setFileTree(tree || [])).catch(() => {});
    api.getIndexStatus().then(setIndexStats).catch(() => {});
    api.getSettings().then(s => setWorkspaceSettings(s)).catch(() => {});
    api.gitStatus().then(setGitStatus).catch(() => {});
  }, [isAuthenticated]);

  // ── Auto-save ───────────────────────────────────────────
  useEffect(() => {
    if (!workspaceSettings?.editor?.autoSave) return;
    const delay = workspaceSettings.editor.autoSaveDelay || 1000;
    const interval = setInterval(() => {
      const { openTabs, activeTab } = useStore.getState();
      const tab = openTabs.find(t => t.path === activeTab && t.modified);
      if (tab) api.writeFile(tab.path, tab.content)
        .then(() => useStore.getState().markTabSaved(tab.path))
        .catch(() => {});
    }, delay);
    return () => clearInterval(interval);
  }, [workspaceSettings?.editor?.autoSave, workspaceSettings?.editor?.autoSaveDelay]);

  // ── File watcher ────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}?type=filewatcher`);
    ws.onmessage = () => api.getTree().then(({ tree }) => setFileTree(tree || [])).catch(() => {});
    ws.onerror = () => {};
    return () => ws.close();
  }, []);

  // ── Global keyboard shortcuts ───────────────────────────
  const handleKey = useCallback((e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "p" && !e.shiftKey)  { e.preventDefault(); setPaletteOpen(true); }
    if (mod && e.key === "`")                  { e.preventDefault(); setTerminalOpen(!useStore.getState().terminalOpen); }
    if (mod && e.shiftKey && e.key === "L")    { e.preventDefault(); setChatOpen(!useStore.getState().chatOpen); }
    if (mod && e.shiftKey && e.key === "F")    { e.preventDefault(); setSearchOpen(true); }
    if (mod && e.shiftKey && e.key === "G")    { e.preventDefault(); setGitOpen(!useStore.getState().gitOpen); }
    if (mod && e.key === ",")                  { e.preventDefault(); setSettingsOpen(true); }
    if (mod && e.shiftKey && e.key === "M")    { e.preventDefault(); setProblemsOpen(!useStore.getState().problemsOpen); }
    if (mod && e.shiftKey && e.key === "R")    { e.preventDefault(); setFlowOpen(!useStore.getState().flowOpen); }
    if (mod && e.shiftKey && e.key === "W")    { e.preventDefault(); setWorkersOpen(!useStore.getState().workersOpen); }
    if (mod && e.shiftKey && e.key === "C")    { e.preventDefault(); setComposerOpen(!useStore.getState().composerOpen); }
    if (mod && e.shiftKey && e.key === "N")    { e.preventDefault(); setScratchOpen(true); }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const rightPanel = composerOpen ? "composer"
    : agentOpen   ? "builder"
    : gitOpen     ? "git"
    : searchOpen  ? "search"
    : flowOpen    ? "flow"
    : workersOpen ? "workers"
    : chatOpen    ? "chat"
    : null;

  return (
    <>
      {!authChecked ? (
        <div style={{ height: "100vh", width: "100vw", background: "#0d1117" }}>
          <Spin />
        </div>
      ) : !isAuthenticated ? (
        <LoginScreen />
      ) : (
    <div className="app">
      {/* Title bar — desktop only */}
      {!isMobile && (
        <div className="title-bar">
          <div className="title-brand">
            <span className="title-logo">◉ DevOS</span>
            <span className="title-tag">Agentic product studio</span>
          </div>
          <button className="title-palette-btn" onClick={() => setPaletteOpen(true)}>
            <span className="title-search-icon">⌕</span>
            <span>Search workspace</span>
            <kbd>Ctrl+P</kbd>
          </button>
          <span className="title-hint">AI edit · Composer · Flow · Terminal</span>
        </div>
      )}

      {/* Conditional layout */}
      {isMobile
        ? <MobileLayout rightPanel={rightPanel} terminalOpen={terminalOpen} problemsOpen={problemsOpen} />
        : <DesktopLayout rightPanel={rightPanel} terminalOpen={terminalOpen} problemsOpen={problemsOpen} />
      }

      {/* Status bar — desktop only */}
      {!isMobile && <StatusBar />}

      {/* Global modals — both layouts */}
      <Suspense fallback={null}>
        <SettingsModal />
        <CmdKModal />
        <CommandPalette />
        <ScratchPad />
      </Suspense>
    </div>
      )}
    </>
  );
}
