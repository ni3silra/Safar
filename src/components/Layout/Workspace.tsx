import { Icons } from "../Icons";
import { Session, LogEntry } from "../../types";
import { AppSettings } from "../SettingsTypes";
import TerminalComponent from "../Terminal";
import { FileBrowser } from "../FileBrowser";
import { TunnelManager } from "../TunnelManager";
import { SessionLogs } from "../SessionLogs";
import { SessionStats } from "../SessionStats";
import { WelcomeScreen } from "../WelcomeScreen";

interface WorkspaceProps {
    activeSessions: Session[];
    activeSessionId: string | null;
    setActiveSessionId: (id: string) => void;
    disconnect: (id: string) => void;
    updateSessionView: (sessionId: string, view: Session["activeView"]) => void;
    sessionLogs: Record<string, LogEntry[]>;
    appSettings: AppSettings;
    onNewConnection: () => void;
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
}: WorkspaceProps) {
    const derivedActiveSession = activeSessions.find(s => s.id === activeSessionId);

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
                <button className="tab-add" onClick={onNewConnection}>
                    <Icons.Plus />
                </button>
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
