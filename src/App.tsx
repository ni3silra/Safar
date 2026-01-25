import { useState, CSSProperties, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Toaster, toast } from 'sonner';
import "./styles/globals.css";
import "./styles/App.css";
import TerminalComponent from "./components/Terminal";
import { FileBrowser } from "./components/FileBrowser";
import { useSessions } from "./hooks/useSessions";
import { CommandPalette } from "./components/CommandPalette";
import { ImportModal } from "./components/ImportModal";
import { TunnelManager } from "./components/TunnelManager";
// LockScreen disabled - import removed

// ============================================
// TYPES
// ============================================

interface IconProps {
  style?: CSSProperties;
  className?: string;
}

interface Session {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  connected: boolean;
  activeView: "terminal" | "files" | "tunnels";
}

interface ConnectionResult {
  session_id: string;
  host: string;
  username: string;
  banner: string | null;
}

interface CommandResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// ============================================
// ICONS (with props support)
// ============================================

const Icons = {
  Terminal: ({ style, className }: IconProps = {}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M5.5 4L2 8l3.5 4 1-1L3.7 8l2.8-3-1-1zm5 0l-1 1L12.3 8l-2.8 3 1 1L14 8l-3.5-4z" />
    </svg>
  ),
  Server: ({ style, className }: IconProps = {}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M3.5 3A1.5 1.5 0 002 4.5v1A1.5 1.5 0 003.5 7h9A1.5 1.5 0 0014 5.5v-1A1.5 1.5 0 0012.5 3h-9zM3 4.5a.5.5 0 01.5-.5h9a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-1zM3.5 9A1.5 1.5 0 002 10.5v1A1.5 1.5 0 003.5 13h9a1.5 1.5 0 001.5-1.5v-1A1.5 1.5 0 0012.5 9h-9zM3 10.5a.5.5 0 01.5-.5h9a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-1z" />
      <circle cx="5" cy="5" r="1" />
      <circle cx="5" cy="11" r="1" />
    </svg>
  ),
  Plus: ({ style, className }: IconProps = {}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z" />
    </svg>
  ),
  X: ({ style, className }: IconProps = {}) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={style} className={className}>
      <path d="M3.5 3.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  ChevronDown: ({ style, className }: IconProps = {}) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={style} className={className}>
      <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  Star: ({ style, className }: IconProps = {}) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4-3.5-2.5-3.5 2.5 1.2-4L2.5 5.5h4z" />
    </svg>
  ),
  Clock: ({ style, className }: IconProps = {}) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1 8a7 7 0 1114 0A7 7 0 011 8zm7-4a.5.5 0 01.5.5v3.5H11a.5.5 0 010 1H8a.5.5 0 01-.5-.5V4.5A.5.5 0 018 4z" />
    </svg>
  ),
  Folder: ({ style, className }: IconProps = {}) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44L8.061 3.5H13.5A1.5 1.5 0 0115 5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13V3.5z" />
    </svg>
  ),
  Settings: ({ style, className }: IconProps = {}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z" />
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319z" />
    </svg>
  ),
  Zap: ({ style, className }: IconProps = {}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M8.5 1.5a.5.5 0 00-.9-.3l-5 8a.5.5 0 00.4.8h4l-.7 4.5a.5.5 0 00.9.3l5-8a.5.5 0 00-.4-.8H7.8l.7-4.5z" />
    </svg>
  ),
  Shield: ({ style, className }: IconProps = {}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M8 0c-.69 0-1.843.265-2.928.56-1.11.3-2.23.672-2.917 1.027A.5.5 0 002 2.08a23.9 23.9 0 00.102 3.01c.076.712.208 1.45.402 2.141.193.694.455 1.356.784 1.907.328.55.72 1.008 1.174 1.332.453.324.97.518 1.538.59.17.022.34.034.5.036V2.51a23.08 23.08 0 012.046-.285c.58-.05 1.12-.06 1.559-.026l.073.005.012.001A.5.5 0 0114 2.08a23.9 23.9 0 01-.102 3.01c-.076.712-.208 1.45-.402 2.141-.193.694-.455 1.356-.784 1.907-.328.55-.72 1.008-1.174 1.332-.453.324-.97.518-1.538.59a3.503 3.503 0 01-.5.036V15.5a.5.5 0 01-1 0v-4.484a4.535 4.535 0 01-1.5-.42A4.482 4.482 0 015.49 9.178a7.252 7.252 0 01-.982-2.404A22.91 22.91 0 014.11 3.06L4.1 2.83a.5.5 0 01.4-.49c.634-.127 1.31-.226 2-.285.69-.06 1.394-.08 2.086-.055l.014.001.012.001z" />
    </svg>
  ),
  Moon: ({ style, className }: IconProps = {}) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M6 .278a.768.768 0 01.08.858 7.208 7.208 0 00-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 01.81.316.733.733 0 01-.031.893A8.349 8.349 0 018.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 016 .278z" />
    </svg>
  ),
  Sun: ({ style, className }: IconProps = {}) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M8 11a3 3 0 110-6 3 3 0 010 6zm0 1a4 4 0 100-8 4 4 0 000 8zM8 0a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 0zm0 13a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 13zm8-5a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2a.5.5 0 01.5.5zM3 8a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2A.5.5 0 013 8zm10.657-5.657a.5.5 0 010 .707l-1.414 1.415a.5.5 0 11-.707-.708l1.414-1.414a.5.5 0 01.707 0zm-9.193 9.193a.5.5 0 010 .707L3.05 13.657a.5.5 0 01-.707-.707l1.414-1.414a.5.5 0 01.707 0zm9.193 2.121a.5.5 0 01-.707 0l-1.414-1.414a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 010 .707zM4.464 4.465a.5.5 0 01-.707 0L2.343 3.05a.5.5 0 11.707-.707l1.414 1.414a.5.5 0 010 .708z" />
    </svg>
  ),
  Loader: ({ style, className }: IconProps = {}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={`animate-spin ${className || ''}`}>
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3z" opacity="0.25" />
      <path d="M8 1a7 7 0 017 7h-2a5 5 0 00-5-5V1z" />
    </svg>
  ),
  Help: ({ style, className }: IconProps = {}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.01 11.5a1 1 0 110-2 1 1 0 010 2zm1.6-4.66s-.6 2.36-.73 2.66H6.66c.26-.64 1.18-2.61 1.18-2.61.32-.73 1.09-.8 1.09-1.49 0-.69-.53-1.2-1.2-1.2-.69 0-1.2.49-1.2 1.18H4.66a3 3 0 012.83-3.17c1.76-.11 3.3 1.18 3.3 2.83 0 1.05-.6 1.6-1.18 1.8z" />
    </svg>
  ),
};

// ============================================
// DEMO TEST SERVER
// ============================================
const TEST_SERVER = {
  host: "test.rebex.net",
  port: 22,
  username: "demo",
  password: "password",
};

// ============================================
// MAIN APP
// ============================================

import { SettingsModal, AppSettings, DEFAULT_SETTINGS } from "./components/SettingsModal";
import { HelpModal } from "./components/HelpModal";

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
  const { favorites, recent, saveSession, addToRecent } = useSessions();

  // Active connection state
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [statusMessage, setStatusMessage] = useState("Disconnected");



  const derivedActiveSession = activeSessions.find(s => s.id === activeSessionId);

  const updateSessionView = (sessionId: string, view: "terminal" | "files" | "tunnels") => {
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
        <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="sidebar-header" style={{ padding: "0" }}>
            {!sidebarCollapsed ? (
              <div style={{ display: "flex", width: "100%" }}>
                <button
                  style={{
                    flex: 1,
                    background: sidebarView === "sessions" ? "transparent" : "var(--bg-secondary)",
                    border: "none",
                    borderBottom: sidebarView === "sessions" ? "2px solid var(--col-blue)" : "2px solid transparent",
                    padding: "12px",
                    cursor: "pointer",
                    fontWeight: sidebarView === "sessions" ? 600 : "normal",
                    color: sidebarView === "sessions" ? "var(--text-primary)" : "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                  }}
                  onClick={() => setSidebarView("sessions")}
                  data-tooltip="Sessions"
                >
                  <Icons.Server /> Sessions
                </button>
                <button
                  style={{
                    flex: 1,
                    background: sidebarView === "snippets" ? "transparent" : "var(--bg-secondary)",
                    border: "none",
                    borderBottom: sidebarView === "snippets" ? "2px solid var(--col-blue)" : "2px solid transparent",
                    padding: "12px",
                    cursor: "pointer",
                    fontWeight: sidebarView === "snippets" ? 600 : "normal",
                    color: sidebarView === "snippets" ? "var(--text-primary)" : "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                  }}
                  onClick={() => setSidebarView("snippets")}
                  data-tooltip="Snippets"
                >
                  <span style={{ fontSize: "14px" }}>📋</span> Snippets
                </button>
              </div>
            ) : (
              <button
                className="icon-btn"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                style={{ margin: "12px auto" }}
              >
                <Icons.ChevronDown
                  style={{ transform: "rotate(-90deg)" }}
                />
              </button>
            )}

            {!sidebarCollapsed && (
              <button
                className="icon-btn"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                style={{ position: "absolute", right: "4px", top: "10px" }}
              >
                <Icons.ChevronDown style={{ transform: "rotate(90deg)" }} />
              </button>
            )}
          </div>

          {!sidebarCollapsed && sidebarView === "sessions" && (
            <div className="sidebar-content">
              {/* Search */}
              <div style={{ padding: "var(--space-2) var(--space-3)" }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search sessions..."
                  style={{ fontSize: "var(--text-xs)" }}
                />
              </div>

              {/* Active Sessions */}
              {activeSessions.length > 0 && (
                <div className="sidebar-section">
                  <div className="sidebar-section-title">
                    <span>
                      <Icons.Terminal /> Active ({activeSessions.length})
                    </span>
                  </div>

                  {activeSessions.map((session) => (
                    <div
                      key={session.id}
                      className={`session-item ${activeSessionId === session.id ? "active" : ""}`}
                      onClick={() => setActiveSessionId(session.id)}
                    >
                      <div className={`session-icon ${session.connected ? "connected" : ""}`}>
                        <Icons.Terminal />
                      </div>
                      <div className="session-info">
                        <div className="session-name">{session.name}</div>
                        <div className="session-host">{session.host}</div>
                      </div>
                      <div className={`session-status ${session.connected ? "connected" : ""}`} />
                    </div>
                  ))}
                </div>
              )}

              {/* Favorites */}
              {favorites.length > 0 && (
                <div className="sidebar-section">
                  <div className="sidebar-section-title">
                    <span>
                      <Icons.Star /> Favorites
                    </span>
                  </div>
                  {favorites.map((saved) => (
                    <div
                      key={saved.id}
                      className="session-item"
                      onClick={() =>
                        handleConnect({
                          host: saved.host,
                          port: saved.port,
                          username: saved.username,
                          password: "", // Will need password prompt
                          sessionName: saved.name,
                        })
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <div className="session-icon">
                        <Icons.Star />
                      </div>
                      <div className="session-info">
                        <div className="session-name">{saved.name}</div>
                        <div className="session-host">{saved.username}@{saved.host}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent */}
              {recent.length > 0 && (
                <div className="sidebar-section">
                  <div className="sidebar-section-title">
                    <span>
                      <Icons.Clock /> Recent
                    </span>
                  </div>
                  {recent.slice(0, 5).map((saved) => (
                    <div
                      key={saved.id}
                      className="session-item"
                      onClick={() =>
                        handleConnect({
                          host: saved.host,
                          port: saved.port,
                          username: saved.username,
                          password: "", // Will need password prompt
                          sessionName: saved.name,
                        })
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <div className="session-icon">
                        <Icons.Clock />
                      </div>
                      <div className="session-info">
                        <div className="session-name">{saved.name}</div>
                        <div className="session-host">{saved.username}@{saved.host}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Demo Server (always show for testing) */}
              <div className="sidebar-section">
                <div className="sidebar-section-title">
                  <span>
                    <Icons.Zap /> Quick Start
                  </span>
                </div>
                <div
                  className="session-item"
                  onClick={() =>
                    handleConnect({
                      ...TEST_SERVER,
                      sessionName: "Rebex Test Server",
                    })
                  }
                  style={{ cursor: "pointer" }}
                >
                  <div className="session-icon">
                    <Icons.Zap />
                  </div>
                  <div className="session-info">
                    <div className="session-name">Demo Server</div>
                    <div className="session-host">{TEST_SERVER.host}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {!sidebarCollapsed && sidebarView === "snippets" && (
            <CommandPalette sessionId={activeSessionId} />
          )}
        </div>

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

function WelcomeScreen({ onNewConnection, onImport }: { onNewConnection: () => void; onImport: () => void }) {
  return (
    <div className="welcome-screen">
      <img src="/safar-logo.svg" alt="Safar" className="welcome-logo" />
      <h1 className="welcome-title">Safar</h1>
      <p className="welcome-tagline">Every Connection is a Journey</p>

      <div className="welcome-actions">
        <button className="btn btn-primary" onClick={onNewConnection}>
          <Icons.Plus />
          New Connection
        </button>
        <button className="btn btn-secondary" onClick={onImport}>
          <Icons.Folder />
          Import Sessions
        </button>
      </div>

      <div className="welcome-features">
        <div className="feature-card">
          <div className="feature-icon">
            <Icons.Terminal />
          </div>
          <div className="feature-title">SSH Terminal</div>
          <div className="feature-desc">Full xterm-256color support</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">
            <Icons.Folder />
          </div>
          <div className="feature-title">File Transfer</div>
          <div className="feature-desc">SFTP & SCP built-in</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">
            <Icons.Shield />
          </div>
          <div className="feature-title">Secure</div>
          <div className="feature-desc">OS keychain storage</div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// QUICK CONNECT MODAL
// ============================================

interface QuickConnectModalProps {
  onClose: () => void;
  onConnect: (config: {
    host: string;
    port: number;
    username: string;
    password: string;
    privateKeyPath?: string | null;
    sessionName: string;
  }, saveSession?: boolean, saveFavorite?: boolean) => void;
}

function QuickConnectModal({ onClose, onConnect }: QuickConnectModalProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [privateKeyPath, setPrivateKeyPath] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [saveForLater, setSaveForLater] = useState(false);
  const [addToFavorites, setAddToFavorites] = useState(false);

  // PuTTY-style Advanced Options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [remoteCommand, setRemoteCommand] = useState("");
  const [backspaceMode, setBackspaceMode] = useState<"auto" | "ctrl-h" | "ctrl-?">("auto");
  const [terminalType, setTerminalType] = useState("xterm-256color");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect({
      host,
      port,
      username,
      password,
      privateKeyPath,
      sessionName,
      // Pass advanced options for future backend support
      // remoteCommand, backspaceMode, terminalType 
    }, saveForLater, addToFavorites);
  };

  const handleSelectKey = async () => {
    try {
      const file = await openDialog({
        multiple: false,
        filters: [{ name: 'Key Files', extensions: ['pem', 'ppk', 'key', 'txt', 'pub'] }]
      });
      if (file) {
        setPrivateKeyPath(file as string);
        setPassword(""); // Clear password if selecting key
      }
    } catch (e) {
      console.error("Failed to select key", e);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
        <div className="modal-header">
          <h2 className="modal-title">New SSH Connection</h2>
          <button className="icon-btn" onClick={onClose}>
            <Icons.X />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <div className="form-group">
              <label className="form-label">Session Name</label>
              <input
                type="text"
                className="input"
                placeholder="My Server"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Hostname / IP</label>
                <input
                  type="text"
                  className="input"
                  placeholder="192.168.1.1"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ maxWidth: "100px" }}>
                <label className="form-label">Port</label>
                <input
                  type="number"
                  className="input"
                  placeholder="22"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="input"
                placeholder="root"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Leave empty if using key auth</span>
            </div>

            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="form-label">Private Key Path</label>
                {privateKeyPath && (
                  <button
                    type="button"
                    onClick={() => setPrivateKeyPath(null)}
                    style={{ background: "none", border: "none", color: "var(--accent-error)", cursor: "pointer", fontSize: "11px" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="input"
                  placeholder="C:\Users\...\.ssh\id_rsa or paste path"
                  value={privateKeyPath || ""}
                  onChange={(e) => setPrivateKeyPath(e.target.value || null)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSelectKey}
                  style={{ padding: "0 12px" }}
                  title="Browse for key file"
                >
                  <Icons.Folder />
                </button>
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Supports PEM, PPK, OpenSSH formats</span>
            </div>

            {/* Advanced Options Toggle */}
            <div style={{
              marginTop: "var(--space-4)",
              borderTop: "1px solid var(--border-color)",
              paddingTop: "var(--space-3)"
            }}>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "0"
                }}
              >
                <Icons.Settings /> Advanced Options
                <span style={{ transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </button>
            </div>

            {showAdvanced && (
              <div style={{
                marginTop: "var(--space-3)",
                padding: "var(--space-3)",
                background: "var(--bg-secondary)",
                borderRadius: "8px",
                border: "1px solid var(--border-color)"
              }}>
                {/* Remote Command */}
                <div className="form-group">
                  <label className="form-label">Remote Command (optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. sudo su - or /bin/bash"
                    value={remoteCommand}
                    onChange={(e) => setRemoteCommand(e.target.value)}
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>Run command instead of shell after login</span>
                </div>

                {/* Terminal Type */}
                <div className="form-group" style={{ marginTop: "var(--space-3)" }}>
                  <label className="form-label">Terminal Type</label>
                  <select
                    className="input"
                    value={terminalType}
                    onChange={(e) => setTerminalType(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="xterm-256color">xterm-256color (Default)</option>
                    <option value="xterm">xterm</option>
                    <option value="vt100">vt100</option>
                    <option value="vt220">vt220</option>
                    <option value="linux">linux</option>
                    <option value="dumb">dumb</option>
                  </select>
                </div>

                {/* Backspace Mode */}
                <div className="form-group" style={{ marginTop: "var(--space-3)" }}>
                  <label className="form-label">Backspace Sends</label>
                  <select
                    className="input"
                    value={backspaceMode}
                    onChange={(e) => setBackspaceMode(e.target.value as "auto" | "ctrl-h" | "ctrl-?")}
                    style={{ width: "100%" }}
                  >
                    <option value="auto">Auto (Server decides)</option>
                    <option value="ctrl-h">Control-H (^H, ASCII 8)</option>
                    <option value="ctrl-?">Control-? (^?, ASCII 127)</option>
                  </select>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>Fix backspace issues with some servers</span>
                </div>
              </div>
            )}

            {/* Save Session Options */}
            <div style={{
              marginTop: "var(--space-4)",
              padding: "var(--space-3)",
              background: "var(--bg-secondary)",
              borderRadius: "8px",
              border: "1px solid var(--border-color)"
            }}>
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer"
              }}>
                <input
                  type="checkbox"
                  checked={saveForLater}
                  onChange={(e) => setSaveForLater(e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    accentColor: "var(--col-blue)"
                  }}
                />
                <span style={{ fontSize: "14px", fontWeight: 500 }}>Save this connection for later</span>
              </label>

              {saveForLater && (
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  marginTop: "12px",
                  marginLeft: "30px"
                }}>
                  <input
                    type="checkbox"
                    checked={addToFavorites}
                    onChange={(e) => setAddToFavorites(e.target.checked)}
                    style={{
                      width: "18px",
                      height: "18px",
                      accentColor: "var(--col-yellow)"
                    }}
                  />
                  <Icons.Star style={{ width: 16, height: 16, color: addToFavorites ? "var(--col-yellow)" : "var(--text-muted)" }} />
                  <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Add to favorites</span>
                </label>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
