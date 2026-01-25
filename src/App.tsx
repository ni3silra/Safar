import { useState, useEffect } from "react";
// invoke removed as it's now in the hook
import { Toaster, toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from "@tauri-apps/api/core";
import "./styles/globals.css";
import "./styles/App.css";
import "./styles/components.css";
import TerminalComponent from "./components/Terminal";
import { FileBrowser } from "./components/FileBrowser";
import { useSessions } from "./hooks/useSessions";
import { useTerminalConnection, ConnectConfig } from "./hooks/useTerminalConnection";
import { useShortcuts } from "./hooks/useShortcuts";
import { Sidebar } from "./components/Sidebar";
import { ImportModal } from "./components/ImportModal";
import { TunnelManager } from "./components/TunnelManager";
import { LockScreen } from "./components/LockScreen";
import { ErrorModal } from "./components/ErrorModal";
import { DeleteConfirmationModal } from "./components/DeleteConfirmationModal";
import { Icons } from "./components/Icons";
import { SavedSession, LogEntry } from "./types";
import { SessionLogs } from "./components/SessionLogs";
import { SessionStats } from "./components/SessionStats";

// ============================================
// MAIN APP
// ============================================

import { SettingsModal } from "./components/SettingsModal";
import { AppSettings, DEFAULT_SETTINGS } from "./components/SettingsTypes";
import { HelpModal } from "./components/HelpModal";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { QuickConnectModal } from "./components/QuickConnectModal";
import { CredentialsModal } from "./components/CredentialsModal";

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showQuickConnect, setShowQuickConnect] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Error Modal State
  const [errorModal, setErrorModal] = useState<{ title: string, message: string } | null>(null);
  // Delete Modal State
  const [deleteModal, setDeleteModal] = useState<{ id: string, name: string } | null>(null);

  const [sidebarView, setSidebarView] = useState<"sessions" | "snippets">("sessions");
  const [editingSession, setEditingSession] = useState<SavedSession | null>(null);
  const [retryConfig, setRetryConfig] = useState<ConnectConfig | null>(null);

  // Security State
  const [isLocked, setIsLocked] = useState(true); // Default to locked until checked
  const [checkingLock, setCheckingLock] = useState(true);

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

  // Check Lock Status on Mount
  useEffect(() => {
    const checkLock = async () => {
      try {
        const locked = await invoke<boolean>("storage_is_locked");
        setIsLocked(locked);
      } catch (err) {
        console.error("Failed to check lock status:", err);
      } finally {
        setCheckingLock(false);
      }
    };
    checkLock();
  }, []);

  // Hook Integrations
  useShortcuts({
    onNewConnection: () => !isLocked && setShowQuickConnect(true),
    onSettings: () => !isLocked && setShowSettings(true)
  });

  const { sessions, favorites, recent, saveSession, addToRecent, deleteSession, loadSessions } = useSessions();

  // Reload sessions when unlocked
  useEffect(() => {
    if (!isLocked && !checkingLock) {
      loadSessions();
    }
  }, [isLocked, checkingLock, loadSessions]);

  const {
    activeSessions,
    activeSessionId,
    setActiveSessionId,
    connectionStatus,
    statusMessage,
    derivedActiveSession,
    updateSessionView,
    connect,
    disconnect
  } = useTerminalConnection({ addLog, saveSession, addToRecent });

  // Update toggleTheme to use settings
  const toggleTheme = () => {
    setAppSettings(prev => ({
      ...prev,
      theme: prev.theme === "dark" ? "light" : "dark"
    }));
  };

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

        const jsonContent = JSON.stringify(exportData, null, 2);

        // Use backend command to write file (bypasses potential frontend scope issues if path is absolute)
        const res = await invoke<{ success: boolean; error?: string }>("fs_write_text", {
          path,
          content: jsonContent
        });

        // Check response structure - checking for standard CommandResponse structure
        if (res && (res as any).success === false) {
          throw new Error((res as any).error || "Unknown error");
        }

        toast.success(`Succesfully exported ${sessions.length} sessions`);
      }
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export sessions");
    }
  };

  const handleEditSession = (session: SavedSession) => {
    setEditingSession(session);
    setShowQuickConnect(true);
  };

  const handleDeleteSession = async (sessionId: string) => {
    // Find name for display
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setDeleteModal({ id: sessionId, name: session.name });
    }
  };

  // Handle new connection (Wrapper around hook)
  const handleConnect = async (
    config: ConnectConfig,
    saveForLater?: boolean,
    addToFav?: boolean
  ) => {
    setShowQuickConnect(false);

    // If editing a session, save and return (don't connect)
    if (editingSession) {
      await saveSession({
        ...editingSession,
        name: config.sessionName,
        host: config.host,
        port: config.port,
        username: config.username,
        auth_type: config.privateKeyPath ? "privatekey" : "password",
        private_key_path: config.privateKeyPath || undefined,
        group: editingSession.group,
        notes: editingSession.notes,
        password: config.password, // Save password if provided
        term_type: config.termType,
        remote_command: config.remoteCommand,
        backspace_mode: config.backspaceMode,
      } as SavedSession);

      setEditingSession(null);
      return;
    }

    // Preemptive credential check: If no password/key provided, prompt immediately
    if (!editingSession && !config.password && !config.privateKeyPath) {
      setRetryConfig(config);
      setShowCredentialsModal(true);
      return;
    }

    try {
      await connect(config, saveForLater, addToFav);
    } catch (error: any) {
      // Handle specific auth error
      if (error.message === "AUTH_REQUIRED") {
        setRetryConfig(config);
        setShowCredentialsModal(true);
      } else {
        // Show Error Modal
        setErrorModal({
          title: "Connection Failed",
          message: error.message || String(error)
        });
      }
    }
  };


  if (checkingLock) {
    return <div className="app-loading">Loading...</div>;
  }

  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} />;
  }

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
          onConnect={(config) => handleConnect({
            ...config,
            password: config.password || "",
            sessionName: config.sessionName || "",
          }, false)}
          onExport={handleExport}
          onEditSession={handleEditSession}
          onDeleteSession={handleDeleteSession}
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
                    disconnect(session.id);
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
            {/* Session Toolbar - Only show if we have an active session selected */}
            {derivedActiveSession && (
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
            )}

            {/* Session Content Area */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              {/* Show Welcome Screen if no active session selected */}
              {!derivedActiveSession && (
                <WelcomeScreen
                  onNewConnection={() => setShowQuickConnect(true)}
                  onImport={() => setShowImport(true)}
                />
              )}

              {/* Render ALL active sessions, but hide incorrect ones to preserve state */}
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  style={{
                    display: activeSessionId === session.id ? "block" : "none",
                    height: "100%"
                  }}
                >
                  <div style={{
                    display: session.activeView === "terminal" ? "block" : "none",
                    height: "100%"
                  }}>
                    <TerminalComponent
                      sessionId={session.id}
                      onDisconnect={() => disconnect(session.id)}
                      fontSize={appSettings.terminalFontSize}
                      themeName={appSettings.terminalTheme}
                      fontFamily={appSettings.terminalFontFamily}
                      backspaceMode={session.backspaceMode}
                      isVisible={activeSessionId === session.id && session.activeView === "terminal"}
                    />
                  </div>
                  <div style={{
                    display: session.activeView === "files" ? "block" : "none",
                    height: "100%"
                  }}>
                    <FileBrowser sessionId={session.id} />
                  </div>
                  <div style={{
                    display: session.activeView === "tunnels" ? "block" : "none",
                    height: "100%"
                  }}>
                    <TunnelManager sessionId={session.id} />
                  </div>
                  <div style={{
                    display: session.activeView === "logs" ? "block" : "none",
                    height: "100%"
                  }}>
                    <SessionLogs logs={sessionLogs[session.id] || []} />
                  </div>
                  <div style={{
                    display: session.activeView === "stats" ? "block" : "none",
                    height: "100%"
                  }}>
                    <SessionStats session={session} />
                  </div>
                </div>
              ))}
            </div>
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
          <span>v0.3.0</span>
        </div>
      </div>

      {/* Toaster */}
      <Toaster position="top-center" theme={theme} />

      {/* Quick Connect Modal */}
      {showQuickConnect && (
        <QuickConnectModal
          onClose={() => {
            setShowQuickConnect(false);
            setEditingSession(null);
          }}
          onConnect={handleConnect}
          mode={editingSession ? "edit" : "connect"}
          initialConfig={editingSession ? {
            host: editingSession.host,
            port: editingSession.port,
            username: editingSession.username,
            sessionName: editingSession.name,
            privateKeyPath: editingSession.private_key_path,
            password: editingSession.password,
            termType: editingSession.term_type,
            backspaceMode: editingSession.backspace_mode,
            remoteCommand: editingSession.remote_command
          } : (retryConfig ? { ...retryConfig, sessionName: retryConfig.sessionName || "" } : undefined)}
        />
      )}

      {/* Credentials Modal (Prompt) */}
      {showCredentialsModal && retryConfig && (
        <CredentialsModal
          onClose={() => {
            setShowCredentialsModal(false);
            setRetryConfig(null);
          }}
          onSubmit={(password, keyPath) => {
            // Retry with new credentials
            const newConfig = {
              ...retryConfig,
              password: password,
              privateKeyPath: keyPath || retryConfig.privateKeyPath
            };
            // Close modal first
            setShowCredentialsModal(false);
            // Retry connection
            handleConnect(newConfig, false);
          }}
          username={retryConfig.username}
          host={retryConfig.host}
          initialKeyPath={retryConfig.privateKeyPath}
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
            window.location.reload();
          }}
        />
      )}

      {/* Error Modal */}
      {errorModal && (
        <ErrorModal
          title={errorModal.title}
          message={errorModal.message}
          onClose={() => setErrorModal(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <DeleteConfirmationModal
          sessionName={deleteModal.name}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => deleteSession(deleteModal.id)}
        />
      )}

    </div>
  );
}

export default App;
