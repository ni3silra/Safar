import { useRef, useEffect } from "react";
import { LogEntry } from "../types";

interface SessionLogsProps {
    logs: LogEntry[];
}

export function SessionLogs({ logs }: SessionLogsProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    };

    return (
        <div className="session-logs" style={{ height: "100%", overflowY: "auto", padding: "8px", fontFamily: "monospace", fontSize: "12px" }}>
            {logs.length === 0 ? (
                <div style={{ color: "var(--text-muted)", textAlign: "center", marginTop: "20px" }}>No logs recorded for this session.</div>
            ) : (
                logs.map((log) => (
                    <div key={log.id} style={{ marginBottom: "4px", display: "flex", gap: "8px" }}>
                        <span style={{ color: "var(--text-muted)", minWidth: "100px", flexShrink: 0 }}>
                            {formatTime(log.timestamp)}
                        </span>
                        <span style={{
                            fontWeight: "bold",
                            minWidth: "60px",
                            flexShrink: 0,
                            color:
                                log.level === "error" ? "var(--accent-error)" :
                                    log.level === "warning" ? "var(--col-yellow)" :
                                        log.level === "success" ? "var(--col-green)" :
                                            "var(--col-blue)"
                        }}>
                            [{log.source}]
                        </span>
                        <span style={{ color: log.level === "error" ? "var(--accent-error)" : "var(--text-primary)" }}>
                            {log.message}
                        </span>
                    </div>
                ))
            )}
            <div ref={bottomRef} />
        </div>
    );
}
