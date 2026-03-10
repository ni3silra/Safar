import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../Icons";
import { Session, LogEntry, SavedSession, ConnectConfig } from "../../types";
import { AppSettings } from "../SettingsTypes";
import TerminalComponent from "../Terminal";
import { FileBrowser } from "../FileBrowser";
import { TunnelManager } from "../TunnelManager";
import { SessionLogs } from "../SessionLogs";
import { SessionStats } from "../SessionStats";
import { WelcomeScreen } from "../WelcomeScreen";
import { TransferManager } from "../TransferManager";

interface WorkspaceProps {
    activeSessions: Session[];
    activeSessionId: string | null;
    setActiveSessionId: (id: string) => void;
    disconnect: (id: string) => void;
    updateSessionView: (sessionId: string, view: Session["activeView"]) => void;
    sessionLogs: Record<string, LogEntry[]>;
    appSettings: AppSettings;
    onNewConnection: () => void;
    sessions: SavedSession[];
    onConnectSession: (config: ConnectConfig) => void;
}

export function Workspace({
    activeSessions,
    activeSessionId,
    setActiveSessionId,
    disconnect,
    updateSessionView,
    sessionLogs,
    appSettings,
    onNewConnection,
    sessions,
    onConnectSession,
}: WorkspaceProps) {
    const derivedActiveSession = activeSessions.find(s => s.id === activeSessionId);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const addMenuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
                setShowAddMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useLayoutEffect(() => {
        if (showAddMenu && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
                top: rect.bottom + 4,
                left: rect.left,
            });
        }
    }, [showAddMenu, activeSessions]);

    return (
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
                <div style={{ position: "relative" }} ref={addMenuRef}>
                    <button
                        ref={buttonRef}
                        className="tab-add"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowAddMenu(!showAddMenu);
                        }}
                        title="New Tab / Recent Connections"
                    >
                        <Icons.Plus />
                    </button>
                    {showAddMenu && createPortal(
                        <div
                            ref={addMenuRef}
                            style={{
                                position: "absolute",
                                top: menuPosition.top,
                                left: menuPosition.left,
                                backgroundColor: "var(--bg-secondary)",
                                border: "1px solid var(--border-color)",
                                borderRadius: "6px",
                                padding: "4px",
                                minWidth: "200px",
                                zIndex: 99999,
                                pointerEvents: "auto",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "2px"
                            }}
                        >
                            <button
                                style={{
                                    display: "flex", alignItems: "center", gap: "8px",
                                    padding: "8px 12px", border: "none", background: "transparent",
                                    color: "var(--text-primary)", cursor: "pointer",
                                    textAlign: "left", borderRadius: "4px", fontSize: "14px"
                                }}
                                onClick={() => {
                                    setShowAddMenu(false);
                                    onNewConnection();
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                            >
                                <Icons.Plus style={{ width: 14, height: 14 }} /> New Connection
                            </button>

                            {sessions && sessions.length > 0 && (
                                <>
                                    <div style={{
                                        height: "1px", backgroundColor: "var(--border-color)",
                                        margin: "4px 0"
                                    }} />
                                    <div style={{
                                        padding: "4px 12px", fontSize: "12px",
                                        color: "var(--text-muted)", fontWeight: 600,
                                        textTransform: "uppercase", letterSpacing: "0.5px"
                                    }}>
                                        Available Sessions
                                    </div>
                                    <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
                                        {sessions.map(session => (
                                            <button
                                                key={session.id}
                                                style={{
                                                    display: "flex", alignItems: "center", gap: "8px",
                                                    padding: "8px 12px", border: "none", background: "transparent",
                                                    color: "var(--text-primary)", cursor: "pointer",
                                                    textAlign: "left", borderRadius: "4px", fontSize: "14px",
                                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                                                }}
                                                onClick={() => {
                                                    setShowAddMenu(false);
                                                    onConnectSession({
                                                        host: session.host,
                                                        port: session.port,
                                                        username: session.username,
                                                        password: session.password || "",
                                                        privateKeyPath: session.private_key_path,
                                                        sessionName: session.name,
                                                        termType: session.term_type,
                                                        remoteCommand: session.remote_command,
                                                        backspaceMode: session.backspace_mode,
                                                    });
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                            >
                                                <Icons.Server style={{ width: 14, height: 14, flexShrink: 0 }} />
                                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {session.name}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>,
                        document.body
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="content-main">
                {/* Session Toolbar - Only show if we have an active session selected */}
                {derivedActiveSession && (
                    <div className="session-toolbar">
                        <WorkspaceTabButton
                            active={derivedActiveSession.activeView === "terminal"}
                            onClick={() => updateSessionView(derivedActiveSession.id, "terminal")}
                            icon={<Icons.Terminal style={{ width: 12, height: 12 }} />}
                            label="Terminal"
                        />
                        <WorkspaceTabButton
                            active={derivedActiveSession.activeView === "files"}
                            onClick={() => updateSessionView(derivedActiveSession.id, "files")}
                            icon={<Icons.Folder style={{ width: 12, height: 12 }} />}
                            label="Files"
                        />
                        <WorkspaceTabButton
                            active={derivedActiveSession.activeView === "tunnels"}
                            onClick={() => updateSessionView(derivedActiveSession.id, "tunnels")}
                            icon={<Icons.Zap style={{ width: 12, height: 12 }} />}
                            label="Tunnels"
                        />
                        <WorkspaceTabButton
                            active={derivedActiveSession.activeView === "logs"}
                            onClick={() => updateSessionView(derivedActiveSession.id, "logs")}
                            icon={<Icons.Clock style={{ width: 12, height: 12 }} />}
                            label="Logs"
                        />
                        <WorkspaceTabButton
                            active={derivedActiveSession.activeView === "stats"}
                            onClick={() => updateSessionView(derivedActiveSession.id, "stats")}
                            icon={<Icons.Shield style={{ width: 12, height: 12 }} />}
                            label="Info"
                        />
                    </div>
                )}

                {/* Global SFTP Transfer Manager overlay */}
                <TransferManager />

                {/* Session Content Area */}
                <div className="session-content-area">
                    {/* Show Welcome Screen if no active session selected */}
                    {!derivedActiveSession && (
                        <WelcomeScreen
                            onNewConnection={onNewConnection}
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
                                    fontWeight={appSettings.terminalFontWeight}
                                    lineHeight={appSettings.terminalLineHeight}
                                    cursorStyle={appSettings.cursorStyle}
                                    cursorBlink={appSettings.cursorBlink}
                                    scrollback={appSettings.scrollback}
                                    bellSound={appSettings.bellSound}
                                    copyOnSelect={appSettings.copyOnSelect}
                                    backspaceMode={session.backspaceMode}
                                    isVisible={activeSessionId === session.id && session.activeView === "terminal"}
                                    useCustomColors={appSettings.useCustomColors}
                                    customForeground={appSettings.customForeground}
                                    customBackground={appSettings.customBackground}
                                    sessionTimeout={appSettings.sessionTimeout}
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
    );
}

function WorkspaceTabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={`session-view-tab ${active ? "active" : ""}`}
        >
            {icon} {label}
        </button>
    );
}
