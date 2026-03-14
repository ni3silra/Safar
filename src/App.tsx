import { useState, useEffect } from "react";
import { Toaster } from 'sonner';
// import { invoke } from "@tauri-apps/api/core";
import "./styles/globals.css";
// import "./styles/App.css"; // Removing chunky App.css in favor of modules
import "./styles/components.css";
import "./styles/layout.css";
import "./styles/workspace.css";
import "./styles/sidebar.css";
import "./styles/filebrowser.css";
import "./styles/terminal.css";
import "./styles/settings.css";

import { useSessions } from "./hooks/useSessions";
import { useTerminalConnection, ConnectConfig } from "./hooks/useTerminalConnection";
import { useShortcuts } from "./hooks/useShortcuts";
import { Sidebar } from "./components/Sidebar";
import { ImportModal } from "./components/ImportModal";
// import { LockScreen } from "./components/LockScreen";
import { ErrorModal } from "./components/ErrorModal";
import { DeleteConfirmationModal } from "./components/DeleteConfirmationModal";
import { SavedSession, LogEntry } from "./types";

// Layout Components
import { Toolbar } from "./components/Layout/Toolbar";
import { StatusBar } from "./components/Layout/StatusBar";
import { Workspace } from "./components/Layout/Workspace";

// Modals
import { SettingsModal } from "./components/SettingsModal";
import { AppSettings, DEFAULT_SETTINGS } from "./components/SettingsTypes";
import { HelpModal } from "./components/HelpModal";
import { QuickConnectModal } from "./components/QuickConnectModal";
import { CredentialsModal } from "./components/CredentialsModal";

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showQuickConnect, setShowQuickConnect] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialsAuthFailed, setCredentialsAuthFailed] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Error Modal State
  const [errorModal, setErrorModal] = useState<{ title: string, message: string } | null>(null);
  // Delete Modal State
  const [deleteModal, setDeleteModal] = useState<{ id: string, name: string } | null>(null);

  const [sidebarView, setSidebarView] = useState<"sessions" | "snippets" | "controls">("sessions");
  const [editingSession, setEditingSession] = useState<SavedSession | null>(null);
  const [retryConfig, setRetryConfig] = useState<ConnectConfig | null>(null);
  const [retryForSessionId, setRetryForSessionId] = useState<string | null>(null);

  // Security State (Removed)
  // const [isLocked, setIsLocked] = useState(true); 
  // const [checkingLock, setCheckingLock] = useState(true);

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

  // Check Lock Status on Mount (Removed)

  // Hook Integrations
  useShortcuts({
    onNewConnection: () => setShowQuickConnect(true),
    onSettings: () => setShowSettings(true)
  });

  const { sessions, favorites, recent, saveSession, addToRecent, deleteSession, loadSessions } = useSessions();

  // Reload sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const {
    activeSessions,
    activeSessionId,
    setActiveSessionId,
    connectionStatus,
    statusMessage,
    updateSessionView,
    updateSessionTitle,
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
      const existingSession = sessions.find(
        (s) => s.host === config.host && s.username === config.username
      );
      setRetryConfig(config);
      setRetryForSessionId(existingSession?.id || null);
      setCredentialsAuthFailed(false);
      setShowCredentialsModal(true);
      return;
    }

    try {
      await connect(config, saveForLater, addToFav);
    } catch (error: any) {
      // Handle specific auth error
      if (error.message === "AUTH_REQUIRED") {
        const existingSession = sessions.find(
          (s) => s.host === config.host && s.username === config.username
        );
        setRetryConfig(config);
        setRetryForSessionId(existingSession?.id || null);
        setCredentialsAuthFailed(true);
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

  return (
    <div className="app" data-theme={theme}>
      <Toolbar
        onNewConnection={() => setShowQuickConnect(true)}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHelp={() => setShowHelp(true)}
        isDarkTheme={theme === "dark"}
      />

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
          sessions={sessions}
          favorites={favorites}
          recent={recent}
          onConnect={(config) => handleConnect({
            ...config,
            password: config.password || "",
            sessionName: config.sessionName || "",
          }, false)}
          onEditSession={handleEditSession}
          onDeleteSession={handleDeleteSession}
        />

        {/* Content Area */}
        <Workspace
          activeSessions={activeSessions}
          activeSessionId={activeSessionId}
          setActiveSessionId={setActiveSessionId}
          disconnect={disconnect}
          updateSessionView={updateSessionView}
          updateSessionTitle={updateSessionTitle}
          sessionLogs={sessionLogs}
          appSettings={appSettings}
          onNewConnection={() => setShowQuickConnect(true)}
          sessions={sessions}
          onConnectSession={(config) => handleConnect({
            ...config,
            password: config.password || "",
            sessionName: config.sessionName || "",
          }, false)}
        />
      </div>

      <StatusBar
        statusMessage={statusMessage}
        connectionStatus={connectionStatus}
      />

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
            setCredentialsAuthFailed(false);
            setRetryForSessionId(null);
            setRetryConfig(null);
          }}
          onSubmit={(password, keyPath) => {
            const newConfig = {
              ...retryConfig!,
              password: password,
              privateKeyPath: keyPath || retryConfig!.privateKeyPath,
              // Carry the saved session id so the backend updates it instead of creating a new one
              ...(retryForSessionId ? { savedSessionId: retryForSessionId } : {}),
            };
            setShowCredentialsModal(false);
            setCredentialsAuthFailed(false);
            // Save credentials back if this was a known saved session
            handleConnect(newConfig, !!retryForSessionId);
            setRetryForSessionId(null);
          }}
          username={retryConfig.username}
          host={retryConfig.host}
          initialKeyPath={retryConfig.privateKeyPath}
          authFailed={credentialsAuthFailed}
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
