import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icons } from "./Icons";
import { Session } from "../types";
import { useSessions } from "../hooks/useSessions";

interface SessionStatsProps {
    session: Session;
}

export function SessionStats({ session }: SessionStatsProps) {
    const { sessions } = useSessions();
    const [latency, setLatency] = useState<number | null>(null);
    const [lastPing, setLastPing] = useState<number>(Date.now());
    const [uptime, setUptime] = useState<string>("0s");

    // Attempt to find the saved session details to show extra info like notes/group
    const savedDetails = sessions.find(s => s.id === session.id);

    // Fake uptime for now (calculated from component mount)
    const [startTime] = useState<number>(Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            const diff = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(diff / 3600);
            const mins = Math.floor((diff % 3600) / 60);
            const secs = diff % 60;
            setUptime(`${hours}h ${mins}m ${secs}s`);
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const checkLatency = async () => {
        const start = performance.now();
        try {
            // We use is_connected as a pong check
            await invoke("is_connected", { sessionId: session.id });
            const end = performance.now();
            setLatency(Math.round(end - start));
            setLastPing(Date.now());
        } catch {
            setLatency(null);
        }
    };

    useEffect(() => {
        checkLatency();
        const interval = setInterval(checkLatency, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, [session.id]);

    return (
        <div className="session-stats" style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>

            {/* CARD 1: Connection Info */}
            <div className="stat-card" style={cardStyle}>
                <h3 style={headerStyle}><Icons.Server style={{ marginRight: 8 }} /> Connection</h3>
                <div style={rowStyle}>
                    <span style={labelStyle}>Host</span>
                    <span style={valueStyle}>{session.host}</span>
                </div>
                <div style={rowStyle}>
                    <span style={labelStyle}>Port</span>
                    <span style={valueStyle}>{session.port}</span>
                </div>
                <div style={rowStyle}>
                    <span style={labelStyle}>User</span>
                    <span style={valueStyle}>{session.username}</span>
                </div>
                {savedDetails && (
                    <div style={rowStyle}>
                        <span style={labelStyle}>Auth Type</span>
                        <span style={{ ...valueStyle, textTransform: "capitalize" }}>{savedDetails.auth_type}</span>
                    </div>
                )}
            </div>

            {/* CARD 2: Network */}
            <div className="stat-card" style={cardStyle}>
                <h3 style={headerStyle}><Icons.Zap style={{ marginRight: 8 }} /> Network</h3>
                <div style={rowStyle}>
                    <span style={labelStyle}>Status</span>
                    <span style={{ ...valueStyle, color: session.connected ? "var(--col-green)" : "var(--accent-error)" }}>
                        {session.connected ? "Connected" : "Disconnected"}
                    </span>
                </div>
                <div style={rowStyle}>
                    <span style={labelStyle}>Latency</span>
                    <span style={valueStyle}>{latency !== null ? `${latency}ms` : "N/A"}</span>
                </div>
                <div style={rowStyle}>
                    <span style={labelStyle}>Keep-Alive</span>
                    <span style={valueStyle}>Enabled (60s)</span>
                </div>
            </div>

            {/* CARD 3: Session */}
            <div className="stat-card" style={cardStyle}>
                <h3 style={headerStyle}><Icons.Clock style={{ marginRight: 8 }} /> Session</h3>
                <div style={rowStyle}>
                    <span style={labelStyle}>Uptime</span>
                    <span style={valueStyle}>{uptime}</span>
                </div>
                <div style={rowStyle}>
                    <span style={labelStyle}>Started</span>
                    <span style={valueStyle}>{new Date(startTime).toLocaleTimeString()}</span>
                </div>
                <div style={rowStyle}>
                    <span style={labelStyle}>Last Ping</span>
                    <span style={valueStyle}>{new Date(lastPing).toLocaleTimeString()}</span>
                </div>
            </div>

            {/* CARD 4: Configuration / Metadata */}
            <div className="stat-card" style={cardStyle}>
                <h3 style={headerStyle}><Icons.Shield style={{ marginRight: 8 }} /> Configuration</h3>
                {savedDetails?.group && (
                    <div style={rowStyle}>
                        <span style={labelStyle}>Group</span>
                        <span style={valueStyle}>{savedDetails.group}</span>
                    </div>
                )}
                {savedDetails?.term_type && (
                    <div style={rowStyle}>
                        <span style={labelStyle}>Term Type</span>
                        <span style={valueStyle}>{savedDetails.term_type}</span>
                    </div>
                )}
                <div style={rowStyle}>
                    <span style={labelStyle}>Backspace</span>
                    <span style={valueStyle}>{session.backspaceMode || "Default"}</span>
                </div>
                {savedDetails?.remote_command && (
                    <div style={{ ...rowStyle, flexDirection: "column", gap: "4px" }}>
                        <span style={labelStyle}>Remote Command</span>
                        <span style={{ ...valueStyle, fontFamily: "monospace", fontSize: "12px", background: "rgba(0,0,0,0.2)", padding: "2px 4px", borderRadius: "4px" }}>
                            {savedDetails.remote_command}
                        </span>
                    </div>
                )}
            </div>

            {/* CARD 5: Notes (Full Width if notes exist) */}
            {savedDetails?.notes && (
                <div className="stat-card" style={{ ...cardStyle, gridColumn: "1 / -1" }}>
                    <h3 style={headerStyle}><Icons.Edit style={{ marginRight: 8 }} /> Notes</h3>
                    <div style={{ color: "var(--text-primary)", fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                        {savedDetails.notes}
                    </div>
                </div>
            )}

            {/* CARD 6: Technical */}
            <div className="stat-card" style={cardStyle}>
                <h3 style={headerStyle}><Icons.Cpu style={{ marginRight: 8 }} /> Technical</h3>
                <div style={rowStyle}>
                    <span style={labelStyle}>Protocol</span>
                    <span style={valueStyle}>SSH-2.0</span>
                </div>
                <div style={rowStyle}>
                    <span style={labelStyle}>Client</span>
                    <span style={valueStyle}>Safar/0.2.0</span>
                </div>
                <div style={rowStyle}>
                    <span style={labelStyle}>Library</span>
                    <span style={valueStyle}>ssh2-rs</span>
                </div>
            </div>

        </div>
    );
}

const cardStyle = {
    background: "var(--bg-secondary)",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid var(--border-color)"
};

const headerStyle = {
    marginTop: 0,
    marginBottom: "16px",
    fontSize: "14px",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    color: "var(--col-blue)"
};

const rowStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
    fontSize: "13px"
};

const labelStyle = {
    color: "var(--text-muted)"
};

const valueStyle = {
    color: "var(--text-primary)",
    fontWeight: 500
};
