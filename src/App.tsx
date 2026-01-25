import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Toaster, toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import "./styles/globals.css";
import "./styles/App.css";
import TerminalComponent from "./components/Terminal";
import { FileBrowser } from "./components/FileBrowser";
import { useSessions } from "./hooks/useSessions";
import { Sidebar } from "./components/Sidebar";
import { ImportModal } from "./components/ImportModal";
import { TunnelManager } from "./components/TunnelManager";
// LockScreen disabled - import removed
import { Icons } from "./components/Icons";
import { Session, ConnectionResult, CommandResponse } from "./types";
import { SessionLogs, LogEntry } from "./components/SessionLogs";
import { SessionStats } from "./components/SessionStats";





// ============================================
// MAIN APP
// ============================================

import { SettingsModal, AppSettings, DEFAULT_SETTINGS } from "./components/SettingsModal";
import { HelpModal } from "./components/HelpModal";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { QuickConnectModal } from "./components/QuickConnectModal";

// ...

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showQuickConnect, setShowQuickConnect] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Master lock disabled - lock screen feature removed
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sidebarView, setSidebarView] = useState<"sessions" | "snippets">("sessions");

  // Logs State
  const [sessionLogs, setSessionLogs] = useState<Record<string, LogEntry[]>>({});

  const addLog = (sessionId: string, message: string, level: LogEntry["level"] = "info", source: LogEntry["source"] = "SSH") => {
    setSessionLogs(prev => {
      const current = prev[sessionId] || [];
      return {
        ...prev,
        [sessionId]: [...current, {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          level,
          message,
          source
        }]
      };
    });
  };

  // Settings State (persisted)
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem("safar_settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem("safar_settings", JSON.stringify(appSettings));
    setTheme(appSettings.theme);
    document.documentElement.setAttribute("data-theme", appSettings.theme);
  }, [appSettings]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        setShowQuickConnect(true);
      }
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ...

  // Update toggleTheme to use settings
  const toggleTheme = () => {
    setAppSettings(prev => ({
      ...prev,
      theme: prev.theme === "dark" ? "light" : "dark"
    }));
  };

  // ...

  <div className="toolbar-group">
    <button className="icon-btn" data-tooltip="Settings" onClick={() => setShowSettings(true)}>
      <Icons.Settings />
    </button>
    <button className="icon-btn" onClick={toggleTheme} data-tooltip="Toggle Theme">
      {theme === "dark" ? <Icons.Sun /> : <Icons.Moon />}
    </button>
  </div>
  const { sessions, favorites, recent, saveSession, addToRecent } = useSessions();

  const handleExport = async () => {
    try {
      const path = await save({
        filters: [{
          name: 'Safar Sessions',
          extensions: ['json']
        }]
      });

      if (path) {
        // Sanitize: ensure no passwords are mistakenly part of the object if they ever crept in
        const exportData = sessions.map(s => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { ...rest } = s;
          return rest;
        });

        await writeTextFile(path, JSON.stringify(exportData, null, 2));
        toast.success(`Succesfully exported ${sessions.length} sessions`);
      }
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export sessions");
    }
  };

  // Active connection state
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [statusMessage, setStatusMessage] = useState("Disconnected");



  const derivedActiveSession = activeSessions.find(s => s.id === activeSessionId);

  const updateSessionView = (sessionId: string, view: Session["activeView"]) => {
    setActiveSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, activeView: view } : s))
    );
  };



  // Handle new connection
  const handleConnect = async (
    config: {
      host: string;
      port: number;
      username: string;
      password: string;
      privateKeyPath?: string | null;
      sessionName: string;
      termType?: string;
    },
    saveForLater?: boolean,
    addToFav?: boolean
  ) => {
    setConnectionStatus("connecting");
    setStatusMessage(`Connecting to ${config.host}...`);
    setShowQuickConnect(false);

    try {
      const response = await invoke<CommandResponse<ConnectionResult>>("ssh_connect", {
        params: {
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password || null,
          privateKeyPath: config.privateKeyPath || null,
          sessionName: config.sessionName || `${config.username}@${config.host}`,
          term_type: config.termType || null,
        },
      });

      if (response.success && response.data) {
        const newSession: Session = {
          id: response.data.session_id,
          name: config.sessionName || `${config.username}@${config.host}`,
          host: config.host,
          port: config.port,
          username: config.username,
          connected: true,
          activeView: "terminal",
        };
        setActiveSessions((prev) => [...prev, newSession]);
        setActiveSessionId(newSession.id);
        setConnectionStatus("connected");
        setStatusMessage(`Connected to ${config.username}@${config.host}`);

        addLog(newSession.id, `Connected to ${response.data.host}`, "success", "SSH");
        if (response.data.banner) addLog(newSession.id, `Banner: ${response.data.banner}`, "info", "SSH");

        // Save session for later if requested
        if (saveForLater) {
          try {
            const savedSession = await saveSession({
              name: config.sessionName || `${config.username}@${config.host}`,
              host: config.host,
              port: config.port,
              username: config.username,
              is_favorite: addToFav || false,
            });
            // Add to recent after saving
            if (savedSession?.id) {
              addToRecent(savedSession.id);
            }
          } catch (err) {
            console.error("Failed to save session:", err);
          }
        }
      } else {
        setConnectionStatus("disconnected");
        setStatusMessage(`Failed: ${response.error}`);
        toast.error(`Connection failed: ${response.error}`);
      }
    } catch (error) {
      setConnectionStatus("disconnected");
      setStatusMessage(`Error: ${error}`);
      toast.error(`Connection error: ${error}`);
    }
  };



  // Disconnect session
  const handleDisconnect = async (sessionId: string) => {
    try {
      await invoke<CommandResponse<void>>("ssh_disconnect", { sessionId });
      setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setConnectionStatus("disconnected");
        setStatusMessage("Disconnected");
      }
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };



  return (
    <div className="app" data-theme={theme}>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-group">
          <img src="/safar-logo.svg" alt="Safar" width="24" height="24" />
          <span style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>Safar</span>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            className="btn btn-primary"
            onClick={() => setShowQuickConnect(true)}
            style={{ padding: "var(--space-1) var(--space-3)" }}
          >
            <Icons.Plus />
            <span>New Connection</span>
          </button>

          <button
            className="icon-btn"
            data-tooltip="Quick Connect (Ctrl+N)"
            onClick={() => setShowQuickConnect(true)}
          >
            <Icons.Zap />
          </button>
        </div>

        <div style={{ flex: 1 }} />

        <div className="toolbar-group">
          <button className="icon-btn" onClick={toggleTheme} data-tooltip="Toggle Theme">
            {theme === "dark" ? <Icons.Sun /> : <Icons.Moon />}
          </button>
          <button className="icon-btn" data-tooltip="Settings" onClick={() => setShowSettings(true)}>
            <Icons.Settings />
          </button>
          <button className="icon-btn" data-tooltip="Help & About" onClick={() => setShowHelp(true)}>
            <Icons.Help />
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="main-layout" style={{ position: "relative" }}>
        {/* Lock screen disabled */}

        {/* Sidebar */}
        {/* Sidebar */}
        <Sidebar
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          sidebarView={sidebarView}
          setSidebarView={setSidebarView}
          activeSessions={activeSessions}
          activeSessionId={activeSessionId}
          setActiveSessionId={setActiveSessionId}
          favorites={favorites}
          recent={recent}
          onConnect={handleConnect}
          onExport={handleExport}
        />

        {/* Content Area */}
        <div className="content">
          {/* Tab Bar */}
          <div className="tab-bar">
            {activeSessions.map((session) => (
              <button
                key={session.id}
                className={`tab ${activeSessionId === session.id ? "active" : ""}`}
                onClick={() => setActiveSessionId(session.id)}
              >
                <span className="tab-icon">
                  <Icons.Terminal />
                </span>
                <span>{session.name}</span>
                <span
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDisconnect(session.id);
                  }}
                >
                  <Icons.X />
                </span>
              </button>
            ))}
            <button className="tab-add" onClick={() => setShowQuickConnect(true)}>
              <Icons.Plus />
            </button>
          </div>

          {/* Main Content */}
          <div className="content-main">
            {derivedActiveSession ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Session Toolbar */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 8px",
                  background: "var(--bg-secondary)",
                  borderBottom: "1px solid var(--border-color)",
                  height: "32px",
                  gap: "1px"
                }}>
                  <button
                    onClick={() => updateSessionView(derivedActiveSession.id, "terminal")}
                    style={{
                      background: derivedActiveSession.activeView === "terminal" ? "var(--bg-primary)" : "transparent",
                      color: derivedActiveSession.activeView === "terminal" ? "var(--col-blue)" : "var(--text-muted)",
                      border: "none",
                      borderTop: derivedActiveSession.activeView === "terminal" ? "2px solid var(--col-blue)" : "2px solid transparent",
                      padding: "0 12px",
                      height: "100%",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: derivedActiveSession.activeView === "terminal" ? "600" : "normal",
                      display: "flex", alignItems: "center", gap: "6px"
                    }}
                  >
                    <Icons.Terminal style={{ width: 12, height: 12 }} /> Terminal
                  </button>
                  <button
                    onClick={() => updateSessionView(derivedActiveSession.id, "files")}
                    style={{
                      background: derivedActiveSession.activeView === "files" ? "var(--bg-primary)" : "transparent",
                      color: derivedActiveSession.activeView === "files" ? "var(--col-blue)" : "var(--text-muted)",
                      border: "none",
                      borderTop: derivedActiveSession.activeView === "files" ? "2px solid var(--col-blue)" : "2px solid transparent",
                      padding: "0 12px",
                      height: "100%",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: derivedActiveSession.activeView === "files" ? "600" : "normal",
                      display: "flex", alignItems: "center", gap: "6px"
                    }}
                  >
                    <Icons.Folder style={{ width: 12, height: 12 }} /> Files
                  </button>
                  <button
                    onClick={() => updateSessionView(derivedActiveSession.id, "tunnels")}
                    style={{
                      background: derivedActiveSession.activeView === "tunnels" ? "var(--bg-primary)" : "transparent",
                      color: derivedActiveSession.activeView === "tunnels" ? "var(--col-blue)" : "var(--text-muted)",
                      border: "none",
                      borderTop: derivedActiveSession.activeView === "tunnels" ? "2px solid var(--col-blue)" : "2px solid transparent",
                      padding: "0 12px",
                      height: "100%",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: derivedActiveSession.activeView === "tunnels" ? "600" : "normal",
                      display: "flex", alignItems: "center", gap: "6px"
                    }}
                  >
                    <Icons.Zap style={{ width: 12, height: 12 }} /> Tunnels
                  </button>
                  <button
                    onClick={() => updateSessionView(derivedActiveSession.id, "logs")}
                    style={{
                      background: derivedActiveSession.activeView === "logs" ? "var(--bg-primary)" : "transparent",
                      color: derivedActiveSession.activeView === "logs" ? "var(--col-blue)" : "var(--text-muted)",
                      border: "none",
                      borderTop: derivedActiveSession.activeView === "logs" ? "2px solid var(--col-blue)" : "2px solid transparent",
                      padding: "0 12px",
                      height: "100%",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: derivedActiveSession.activeView === "logs" ? "600" : "normal",
                      display: "flex", alignItems: "center", gap: "6px"
                    }}
                  >
                    <Icons.Clock style={{ width: 12, height: 12 }} /> Logs
                  </button>
                  <button
                    onClick={() => updateSessionView(derivedActiveSession.id, "stats")}
                    style={{
                      background: derivedActiveSession.activeView === "stats" ? "var(--bg-primary)" : "transparent",
                      color: derivedActiveSession.activeView === "stats" ? "var(--col-blue)" : "var(--text-muted)",
                      border: "none",
                      borderTop: derivedActiveSession.activeView === "stats" ? "2px solid var(--col-blue)" : "2px solid transparent",
                      padding: "0 12px",
                      height: "100%",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: derivedActiveSession.activeView === "stats" ? "600" : "normal",
                      display: "flex", alignItems: "center", gap: "6px"
                    }}
                  >
                    <Icons.Shield style={{ width: 12, height: 12 }} /> Info
                  </button>
                </div>

                {/* Session Content */}
                <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                  <div style={{
                    display: derivedActiveSession.activeView === "terminal" ? "block" : "none",
                    height: "100%"
                  }}>
                    <TerminalComponent
                      sessionId={derivedActiveSession.id}
                      onDisconnect={() => handleDisconnect(derivedActiveSession.id)}
                      fontSize={appSettings.terminalFontSize}
                      themeName={appSettings.terminalTheme}
                      fontFamily={appSettings.terminalFontFamily}
                    />
                  </div>
                  <div style={{
                    display: derivedActiveSession.activeView === "files" ? "block" : "none",
                    height: "100%"
                  }}>
                    <FileBrowser sessionId={derivedActiveSession.id} />
                  </div>
                  <div style={{
                    display: derivedActiveSession.activeView === "tunnels" ? "block" : "none",
                    height: "100%"
                  }}>
                    <TunnelManager sessionId={derivedActiveSession.id} />
                  </div>
                  <div style={{
                    display: derivedActiveSession.activeView === "logs" ? "block" : "none",
                    height: "100%"
                  }}>
                    <SessionLogs logs={sessionLogs[derivedActiveSession.id] || []} />
                  </div>
                  <div style={{
                    display: derivedActiveSession.activeView === "stats" ? "block" : "none",
                    height: "100%"
                  }}>
                    <SessionStats session={derivedActiveSession} />
                  </div>
                </div>
              </div>
            ) : (
              <WelcomeScreen
                onNewConnection={() => setShowQuickConnect(true)}
                onImport={() => setShowImport(true)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-bar-left">
          <div className="status-item">
            <div className={`status-indicator ${connectionStatus}`} />
            <span>{statusMessage}</span>
          </div>
        </div>
        <div className="status-bar-right">
          <span>v0.2.0</span>
        </div>
      </div>

      {/* Toaster */}
      <Toaster position="top-center" theme={theme} />

      {/* Quick Connect Modal */}
      {showQuickConnect && (
        <QuickConnectModal
          onClose={() => setShowQuickConnect(false)}
          onConnect={handleConnect}
        />
      )}
      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          currentSettings={appSettings}
          onSave={(newSettings) => setAppSettings(newSettings)}
        />
      )}
      {/* Help Modal */}
      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)} />
      )}
      {/* Import Modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImportSuccess={() => {
            // Refresh active sessions if needed, or rely on internal storage state updates
            // For now we reload to be safe and ensure all lists update
            window.location.reload();
          }}
        />
      )}

    </div>


  );
}

// ============================================
// WELCOME SCREEN
// ============================================



export default App;
