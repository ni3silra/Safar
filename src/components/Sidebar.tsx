import { Icons } from "./Icons";
import { CommandPalette } from "./CommandPalette";
import { Session, ConnectConfig, SavedSession } from "../types";

const TEST_SERVER = {
    host: "test.rebex.net",
    port: 22,
    username: "demo",
    password: "password",
};

interface SidebarProps {
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
    sidebarView: "sessions" | "snippets";
    setSidebarView: (view: "sessions" | "snippets") => void;
    activeSessions: Session[];
    activeSessionId: string | null;
    setActiveSessionId: (id: string) => void;
    favorites: SavedSession[];
    recent: SavedSession[];
    onConnect: (config: ConnectConfig) => void;
    onExport: () => void;
    onEditSession: (session: SavedSession) => void;
    onDeleteSession: (sessionId: string) => void;
}

export function Sidebar({
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarView,
    setSidebarView,
    activeSessions,
    activeSessionId,
    setActiveSessionId,
    favorites,
    recent,
    onConnect,
    onExport,
    onEditSession,
    onDeleteSession,
}: SidebarProps) {
    return (
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
                    <div style={{ padding: "var(--space-2) var(--space-3)", display: "flex", gap: "8px" }}>
                        <input
                            type="text"
                            className="input"
                            placeholder="Search sessions..."
                            style={{ fontSize: "var(--text-xs)", flex: 1 }}
                        />
                        {/* <button
                            className="icon-btn"
                            onClick={onExport}
                            data-tooltip="Export Sessions"
                            style={{ padding: "4px" }}
                        >
                            <Icons.Download />
                        </button> */}
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
                                        onConnect({
                                            host: saved.host,
                                            port: saved.port,
                                            username: saved.username,
                                            password: saved.password || "",
                                            privateKeyPath: saved.private_key_path,
                                            sessionName: saved.name,
                                            termType: saved.term_type,
                                            remoteCommand: saved.remote_command,
                                            backspaceMode: saved.backspace_mode,
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
                                    <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="icon-btn xs" onClick={() => onEditSession(saved)} title="Edit">
                                            <Icons.Edit style={{ width: 12, height: 12 }} />
                                        </button>
                                        <button className="icon-btn xs danger" onClick={() => onDeleteSession(saved.id)} title="Delete">
                                            <Icons.Trash style={{ width: 12, height: 12 }} />
                                        </button>
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
                                        onConnect({
                                            host: saved.host,
                                            port: saved.port,
                                            username: saved.username,
                                            password: saved.password || "",
                                            privateKeyPath: saved.private_key_path,
                                            sessionName: saved.name,
                                            termType: saved.term_type,
                                            remoteCommand: saved.remote_command,
                                            backspaceMode: saved.backspace_mode,
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
                                    <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="icon-btn xs" onClick={() => onEditSession(saved)} title="Edit">
                                            <Icons.Edit style={{ width: 12, height: 12 }} />
                                        </button>
                                        <button className="icon-btn xs danger" onClick={() => onDeleteSession(saved.id)} title="Delete">
                                            <Icons.Trash style={{ width: 12, height: 12 }} />
                                        </button>
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
                                onConnect({
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
    );
}
