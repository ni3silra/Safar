import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icons } from "./Icons";
import { Session, CommandResponse } from "../types";

interface ServerPerformanceProps {
    session: Session;
}

interface ProcessInfo {
    pid: string;
    user: string;
    cpu: string;
    mem: string;
    command: string;
}

export function ServerPerformance({ session }: ServerPerformanceProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    const [osType, setOsType] = useState<string>("");

    // Helper: Parse Linux `top` output
    const parseLinuxTop = (raw: string) => {
        const lines = raw.split("\n").filter(l => l.trim().length > 0);
        const parsedProcs: ProcessInfo[] = [];

        // Find header row to start parsing processes
        let procStartIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("PID") && lines[i].includes("USER")) {
                procStartIdx = i + 1;
                break;
            }
        }

        if (procStartIdx !== -1) {
            for (let i = procStartIdx; i < lines.length; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length >= 11) {
                    parsedProcs.push({
                        pid: parts[0],
                        user: parts[1],
                        cpu: parts[8], // %CPU
                        mem: parts[9], // %MEM
                        command: parts.slice(11).join(" ") // COMMAND
                    });
                }
            }
        }
        return parsedProcs;
    };

    // Helper: Parse HP NS `status *, prog` or similar output
    const parseHPNSStatus = (raw: string) => {
        const lines = raw.split("\n").filter(l => l.trim().length > 0);
        const parsedProcs: ProcessInfo[] = [];

        // Simple heuristic parser for Tandem STATUS output
        for (const line of lines) {
            // Looking for process format like: $ZTC0   0,209  0,103 ...
            if (line.trim().startsWith("$")) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                    parsedProcs.push({
                        pid: parts[1] || "-", // CPU,PIN
                        user: parts[2] || "-", // User
                        cpu: "-", // Hard to guarantee CPU% in basic STATUS without MEASURE
                        mem: "-", // Memory
                        command: parts[0] // Process Name ($name)
                    });
                }
            }
        }
        return parsedProcs;
    };

    // Helper: Parse Unix ps -eo pid,user,pcpu,pmem,args
    const parseUnixPS = (raw: string) => {
        const lines = raw.split("\n").filter(l => l.trim().length > 0);
        const parsedProcs: ProcessInfo[] = [];

        let startIdx = lines[0].includes("PID") ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/);
            // PID(0) USER(1) CPU(2) MEM(3) COMMAND(4+)
            if (parts.length >= 5) {
                parsedProcs.push({
                    pid: parts[0],
                    user: parts[1],
                    cpu: parts[2],
                    mem: parts[3],
                    command: parts.slice(4).join(" ")
                });
            }
        }
        return parsedProcs;
    };

    // Helper: Parse Unix ps aux
    const parseUnixPSAux = (raw: string) => {
        const lines = raw.split("\n").filter(l => l.trim().length > 0);
        const parsedProcs: ProcessInfo[] = [];

        let startIdx = lines[0].includes("PID") ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/);
            // USER(0) PID(1) CPU(2) MEM(3) COMMAND(10+)
            if (parts.length >= 11) {
                parsedProcs.push({
                    pid: parts[1],
                    user: parts[0],
                    cpu: parts[2],
                    mem: parts[3],
                    command: parts.slice(10).join(" ")
                });
            } else if (parts.length >= 5) {
                parsedProcs.push({
                    pid: parts[1],
                    user: parts[0],
                    cpu: parts[2],
                    mem: parts[3],
                    command: parts.slice(4).join(" ")
                });
            }
        }
        return parsedProcs;
    };

    // Helper: Parse Unix ps -ef
    const parseUnixPSEf = (raw: string) => {
        const lines = raw.split("\n").filter(l => l.trim().length > 0);
        const parsedProcs: ProcessInfo[] = [];

        let startIdx = lines[0].includes("PID") ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/);
            // UID(0) PID(1) PPID(2) C(3) STIME(4) TTY(5) TIME(6) CMD(7+)
            if (parts.length >= 8) {
                parsedProcs.push({
                    pid: parts[1],
                    user: parts[0],
                    cpu: parts[3],
                    mem: "-",
                    command: parts.slice(7).join(" ")
                });
            } else if (parts.length >= 4) {
                parsedProcs.push({
                    pid: parts[1],
                    user: parts[0],
                    cpu: "-",
                    mem: "-",
                    command: parts.slice(3).join(" ")
                });
            }
        }
        return parsedProcs;
    };

    const handleRefresh = async () => {
        if (!session.connected) return;
        setLoading(true);
        setError(null);

        try {
            const response = await invoke<CommandResponse<string>>("ssh_get_performance", { sessionId: session.id });

            if (!response.success || !response.data) {
                setError(response.error || "Unknown error occurred.");
                setProcesses([]);
                return;
            }

            const data = JSON.parse(response.data);

            if (data.error_detail) {
                setError(data.error_detail);
                setProcesses([]);
            } else if (data.raw_output && data.raw_output.includes("METRICS_UNAVAILABLE")) {
                setError("Metrics returned as UNAVAILABLE.");
                setProcesses([]);
            } else {
                setOsType(data.os);

                let parsed: ProcessInfo[] = [];
                if (data.os === "LINUX") {
                    parsed = parseLinuxTop(data.raw_output);
                } else if (data.os === "NONSTOP_KERNEL") {
                    parsed = parseHPNSStatus(data.raw_output);
                } else if (data.os === "UNIX_PS") {
                    parsed = parseUnixPS(data.raw_output);
                } else if (data.os === "UNIX_PS_AUX") {
                    parsed = parseUnixPSAux(data.raw_output);
                } else if (data.os === "UNIX_PS_EF") {
                    parsed = parseUnixPSEf(data.raw_output);
                }

                setProcesses(parsed);
                setLastUpdate(new Date());
            }
        } catch (err) {
            console.error("Performance metric fetch failed:", err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="performance-dashboard" style={{ padding: "24px", height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Action Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-secondary)", padding: "16px 24px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: "18px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <Icons.Activity /> Live Performance
                    </h2>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
                        {osType ? `Detected OS: ${osType}` : "Fetch telemetry to determine Server OS"}
                    </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    {lastUpdate && (
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            Last updated: {lastUpdate.toLocaleTimeString()}
                        </span>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleRefresh}
                        disabled={loading || !session.connected}
                        style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "140px", justifyContent: "center" }}
                    >
                        {loading ? (
                            <>
                                <Icons.Terminal className="spinner" style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                                Querying Server...
                            </>
                        ) : (
                            <>
                                <Icons.RefreshCw style={{ width: 14, height: 14 }} />
                                Refresh Metrics
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--accent-error)", padding: "16px", borderRadius: "8px", color: "var(--accent-error)", display: "flex", alignItems: "center", gap: "12px" }}>
                    <Icons.AlertTriangle />
                    <div>
                        <strong style={{ display: "block", marginBottom: "4px" }}>Failed to retrieve metrics</strong>
                        <span style={{ fontSize: "13px" }}>{error} (The server may be missing the required tools or you lack sufficient privileges)</span>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!error && processes.length === 0 && !loading && !lastUpdate && (
                <div style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    background: "var(--bg-secondary)", borderRadius: "12px", border: "1px dashed var(--border-color)", padding: "40px"
                }}>
                    <Icons.BarChart style={{ width: 48, height: 48, color: "var(--text-muted)", marginBottom: "16px", opacity: 0.5 }} />
                    <h3 style={{ margin: "0 0 8px 0", color: "var(--text-primary)" }}>No Telemetry Data</h3>
                    <p style={{ margin: 0, color: "var(--text-muted)", textAlign: "center", maxWidth: "400px" }}>
                        Click "Refresh Metrics" to query the remote server for the top 50 CPU and Memory consuming processes.
                    </p>
                </div>
            )}

            {/* Process Table */}
            {processes.length > 0 && (
                <div style={{ background: "var(--bg-secondary)", borderRadius: "12px", border: "1px solid var(--border-color)", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ padding: "16px", borderBottom: "1px solid var(--border-color)" }}>
                        <h3 style={{ margin: 0, fontSize: "15px", color: "var(--text-primary)" }}>Top 50 Active Processes</h3>
                    </div>

                    <div style={{ overflowY: "auto", flex: 1 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                            <thead style={{ position: "sticky", top: 0, background: "var(--bg-tertiary)", zIndex: 1 }}>
                                <tr>
                                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>PID/PIN</th>
                                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>User</th>
                                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>% CPU</th>
                                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>% MEM</th>
                                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)", width: "100%" }}>Command</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processes.map((proc, i) => (
                                    <tr key={`${proc.pid}-${i}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                        <td style={{ padding: "10px 16px", fontFamily: "monospace", color: "var(--col-blue)" }}>{proc.pid}</td>
                                        <td style={{ padding: "10px 16px" }}>{proc.user}</td>
                                        <td style={{ padding: "10px 16px", color: proc.cpu !== "-" && parseFloat(proc.cpu) > 50 ? "var(--accent-warning)" : "var(--text-primary)" }}>
                                            {proc.cpu}
                                        </td>
                                        <td style={{ padding: "10px 16px", color: proc.mem !== "-" && parseFloat(proc.mem) > 50 ? "var(--accent-warning)" : "var(--text-primary)" }}>
                                            {proc.mem}
                                        </td>
                                        <td style={{ padding: "10px 16px", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "0" }}>
                                            {proc.command}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
}
