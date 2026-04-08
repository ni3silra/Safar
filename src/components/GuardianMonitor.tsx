import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icons } from "./Icons";
import { Session, CommandResponse } from "../types";

interface GuardianMonitorProps {
    session: Session;
}

interface ProcessSample {
    timestamp: number;
    pid: string;
    ppid: string;
    user: string;
    cpu: number;
    mem: number;
    vsz: number;
    rss: number;
    etime: string;
    stat: string;
    command: string;
}

interface ChildProcess {
    pid: string;
    ppid: string;
    user: string;
    cpu: string;
    mem: string;
    vsz: string;
    rss: string;
    etime: string;
    stat: string;
    command: string;
}

const CHART_COLORS = {
    cpu: "#58a6ff",
    cpuFill: "rgba(88, 166, 255, 0.12)",
    mem: "#3fb950",
    memFill: "rgba(63, 185, 80, 0.12)",
    grid: "rgba(110, 118, 129, 0.15)",
    gridLabel: "#6e7681",
    axis: "rgba(110, 118, 129, 0.3)",
};

const MAX_SAMPLES = 120;

export function GuardianMonitor({ session }: GuardianMonitorProps) {
    const [pidOrName, setPidOrName] = useState("");
    const [monitoring, setMonitoring] = useState(false);
    const [interval, setIntervalVal] = useState(3);
    const [samples, setSamples] = useState<ProcessSample[]>([]);
    const [children, setChildren] = useState<ChildProcess[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [osType, setOsType] = useState("");
    const [activeSubTab, setActiveSubTab] = useState<"chart" | "table" | "tree">("chart");
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Parse ps -ef output line: UID PID PPID C STIME TTY TIME CMD
    // This is the simplest POSIX format that works on ALL Unix including HP NonStop OSS L25.2
    const parsePsEfLine = (line: string): Omit<ProcessSample, "timestamp"> | null => {
        const parts = line.trim().split(/\s+/);
        // ps -ef columns: UID(0) PID(1) PPID(2) C(3) STIME(4) TTY(5) TIME(6) CMD(7+)
        if (parts.length < 8) return null;
        // Skip header line if present
        if (parts[0] === "UID" || parts[1] === "PID") return null;
        return {
            pid: parts[1],
            ppid: parts[2],
            user: parts[0],
            cpu: parseInt(parts[3]) || 0,  // C column (rough CPU priority, not %)
            mem: 0, // ps -ef doesn't provide memory %
            vsz: 0,
            rss: 0,
            etime: parts[6], // TIME column (cumulative CPU time)
            stat: "-",       // ps -ef doesn't have STAT
            command: parts.slice(7).join(" "),
        };
    };

    const fetchProcessInfo = useCallback(async () => {
        if (!session.connected || !pidOrName.trim()) return;
        setLoading(true);

        try {
            const response = await invoke<CommandResponse<string>>("ssh_get_process_info", {
                sessionId: session.id,
                pidOrName: pidOrName.trim(),
            });

            if (!response.success || !response.data) {
                setError(response.error || "Failed to query process.");
                return;
            }

            const data = JSON.parse(response.data);
            setOsType(data.os);

            if (!data.raw_output || data.raw_output.trim().length === 0) {
                setError(`Process "${pidOrName}" not found on server.`);
                return;
            }

            setError(null);

            // Parse main process output (ps -ef format)
            const lines = data.raw_output.split("\n").filter((l: string) => l.trim().length > 0);
            const parsed: ProcessSample[] = [];

            for (const line of lines) {
                const proc = parsePsEfLine(line);
                if (proc) {
                    parsed.push({ ...proc, timestamp: Date.now() });
                }
            }

            if (parsed.length > 0) {
                // Aggregate if multiple processes match (e.g. by name)
                const totalCpu = parsed.reduce((sum, p) => sum + p.cpu, 0);
                const totalMem = parsed.reduce((sum, p) => sum + p.mem, 0);
                const totalRss = parsed.reduce((sum, p) => sum + p.rss, 0);
                const totalVsz = parsed.reduce((sum, p) => sum + p.vsz, 0);

                const sample: ProcessSample = {
                    ...parsed[0],
                    cpu: totalCpu,
                    mem: totalMem,
                    rss: totalRss,
                    vsz: totalVsz,
                    timestamp: Date.now(),
                };

                setSamples((prev) => {
                    const next = [...prev, sample];
                    return next.length > MAX_SAMPLES ? next.slice(-MAX_SAMPLES) : next;
                });
            }

            // Parse children (same ps -ef format)
            if (data.children_output) {
                const childLines = data.children_output.split("\n").filter((l: string) => l.trim().length > 0);
                const parsedChildren: ChildProcess[] = [];
                for (const line of childLines) {
                    const parts = line.trim().split(/\s+/);
                    // ps -ef: UID(0) PID(1) PPID(2) C(3) STIME(4) TTY(5) TIME(6) CMD(7+)
                    if (parts.length >= 8 && parts[0] !== "UID") {
                        parsedChildren.push({
                            pid: parts[1],
                            ppid: parts[2],
                            user: parts[0],
                            cpu: parts[3],
                            mem: "-",
                            vsz: "-",
                            rss: "-",
                            etime: parts[6],
                            stat: "-",
                            command: parts.slice(7).join(" "),
                        });
                    }
                }
                setChildren(parsedChildren);
            }
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }, [session.id, session.connected, pidOrName]);

    // Start / Stop monitoring
    const startMonitoring = () => {
        if (!pidOrName.trim()) return;
        setMonitoring(true);
        setError(null);
        setSamples([]);
        setChildren([]);
        fetchProcessInfo();
        timerRef.current = setInterval(fetchProcessInfo, interval * 1000);
    };

    const stopMonitoring = () => {
        setMonitoring(false);
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // Draw chart whenever samples change
    useEffect(() => {
        if (activeSubTab !== "chart") return;
        drawChart();
    }, [samples, activeSubTab]);

    const drawChart = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;
        const padding = { top: 30, right: 20, bottom: 40, left: 55 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = "rgba(13, 17, 23, 0.6)";
        ctx.fillRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = CHART_COLORS.grid;
        ctx.lineWidth = 0.5;
        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const y = padding.top + (chartH / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            // Y-axis labels
            const val = (100 - (100 / gridLines) * i).toFixed(0);
            ctx.fillStyle = CHART_COLORS.gridLabel;
            ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(`${val}%`, padding.left - 8, y + 4);
        }

        if (samples.length < 2) {
            // Show placeholder message
            ctx.fillStyle = CHART_COLORS.gridLabel;
            ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
                samples.length === 0 ? "Waiting for data..." : "Collecting samples...",
                w / 2,
                h / 2
            );
            return;
        }

        // X-axis time labels
        const timeSpan = samples[samples.length - 1].timestamp - samples[0].timestamp;
        const xLabels = 6;
        ctx.fillStyle = CHART_COLORS.gridLabel;
        ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        for (let i = 0; i <= xLabels; i++) {
            const ts = samples[0].timestamp + (timeSpan / xLabels) * i;
            const x = padding.left + (chartW / xLabels) * i;
            const date = new Date(ts);
            ctx.fillText(
                `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date
                    .getSeconds()
                    .toString()
                    .padStart(2, "0")}`,
                x,
                h - padding.bottom + 20
            );
        }

        // Helper to draw a filled line chart
        const drawLine = (
            values: number[],
            strokeColor: string,
            fillColor: string,
            maxVal: number
        ) => {
            if (values.length < 2) return;

            ctx.beginPath();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.lineJoin = "round";

            for (let i = 0; i < values.length; i++) {
                const x = padding.left + (chartW / (values.length - 1)) * i;
                const y = padding.top + chartH - (values[i] / maxVal) * chartH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Fill area under curve
            ctx.lineTo(padding.left + chartW, padding.top + chartH);
            ctx.lineTo(padding.left, padding.top + chartH);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();
        };

        const cpuValues = samples.map((s) => s.cpu);
        const memValues = samples.map((s) => s.mem);
        const maxVal = Math.max(100, Math.max(...cpuValues, ...memValues) * 1.1);

        drawLine(cpuValues, CHART_COLORS.cpu, CHART_COLORS.cpuFill, maxVal);
        drawLine(memValues, CHART_COLORS.mem, CHART_COLORS.memFill, maxVal);

        // Legend
        const legendY = 14;
        ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";

        // CPU legend
        ctx.fillStyle = CHART_COLORS.cpu;
        ctx.fillRect(padding.left, legendY - 8, 12, 3);
        ctx.fillStyle = "#e6edf3";
        ctx.textAlign = "left";
        ctx.fillText(
            `C (CPU): ${cpuValues[cpuValues.length - 1]?.toFixed(0) || 0}`,
            padding.left + 16,
            legendY
        );

        // Axis lines
        ctx.strokeStyle = CHART_COLORS.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, padding.top + chartH);
        ctx.lineTo(w - padding.right, padding.top + chartH);
        ctx.stroke();
    };

    const latestSample = samples.length > 0 ? samples[samples.length - 1] : null;

    return (
        <div className="guardian-monitor" style={{ padding: "20px", height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Input Bar */}
            <div className="guardian-input-bar" style={{
                display: "flex", alignItems: "center", gap: "12px",
                background: "var(--bg-secondary)", padding: "16px 20px",
                borderRadius: "12px", border: "1px solid var(--border-color)",
            }}>
                <Icons.Crosshair style={{ width: 20, height: 20, color: "var(--safar-teal)", flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                        ref={inputRef}
                        type="text"
                        className="input"
                        placeholder="Enter PID (e.g. 1234) or Process Name (e.g. nginx)"
                        value={pidOrName}
                        onChange={(e) => setPidOrName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !monitoring) startMonitoring();
                        }}
                        disabled={monitoring}
                        style={{ flex: 1, background: "var(--bg-primary)", fontFamily: "var(--font-mono)" }}
                        id="guardian-pid-input"
                    />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Interval:</label>
                    <select
                        value={interval}
                        onChange={(e) => setIntervalVal(Number(e.target.value))}
                        disabled={monitoring}
                        style={{
                            background: "var(--bg-primary)", color: "var(--text-primary)",
                            border: "1px solid var(--border-default)", borderRadius: "6px",
                            padding: "6px 8px", fontSize: "12px", cursor: "pointer", outline: "none",
                        }}
                        id="guardian-interval-select"
                    >
                        <option value={1}>1s</option>
                        <option value={2}>2s</option>
                        <option value={3}>3s</option>
                        <option value={5}>5s</option>
                        <option value={10}>10s</option>
                        <option value={15}>15s</option>
                        <option value={30}>30s</option>
                    </select>
                </div>

                {!monitoring ? (
                    <button
                        className="btn btn-primary"
                        onClick={startMonitoring}
                        disabled={!pidOrName.trim() || !session.connected}
                        style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "110px", justifyContent: "center" }}
                        id="guardian-start-btn"
                    >
                        <Icons.Activity style={{ width: 14, height: 14 }} />
                        Start
                    </button>
                ) : (
                    <button
                        className="btn"
                        onClick={stopMonitoring}
                        style={{
                            display: "flex", alignItems: "center", gap: "6px", minWidth: "110px", justifyContent: "center",
                            background: "rgba(248, 81, 73, 0.15)", color: "var(--accent-error)",
                            border: "1px solid rgba(248, 81, 73, 0.3)",
                        }}
                        id="guardian-stop-btn"
                    >
                        <Icons.X style={{ width: 14, height: 14 }} />
                        Stop
                    </button>
                )}
            </div>

            {/* Error State */}
            {error && (
                <div style={{
                    background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--accent-error)",
                    padding: "12px 16px", borderRadius: "8px", color: "var(--accent-error)",
                    display: "flex", alignItems: "center", gap: "10px", fontSize: "13px",
                }}>
                    <Icons.AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <span>{error}</span>
                </div>
            )}

            {/* Status + Summary Cards */}
            {latestSample && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                    {[
                        { label: "PID", value: latestSample.pid, color: "var(--safar-blue)" },
                        { label: "PPID", value: latestSample.ppid, color: "var(--accent-purple)" },
                        { label: "User", value: latestSample.user, color: "var(--text-primary)" },
                        { label: "C (CPU)", value: String(latestSample.cpu), color: latestSample.cpu > 80 ? "var(--accent-error)" : latestSample.cpu > 50 ? "var(--accent-warning)" : "var(--accent-primary)" },
                        { label: "CPU Time", value: latestSample.etime, color: "var(--accent-teal)" },
                        { label: "Command", value: latestSample.command.split("/").pop() || latestSample.command, color: "var(--text-primary)" },
                    ].map((card, i) => (
                        <div
                            key={i}
                            style={{
                                background: "var(--bg-secondary)", borderRadius: "10px",
                                border: "1px solid var(--border-color)", padding: "12px 16px",
                                display: "flex", flexDirection: "column", gap: "4px",
                                transition: "all 150ms ease",
                            }}
                            className="guardian-card"
                        >
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
                                {card.label}
                            </span>
                            <span style={{ fontSize: "20px", fontWeight: 700, color: card.color, fontFamily: "var(--font-mono)" }}>
                                {card.value}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Monitoring indicator */}
            {monitoring && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                    <span className="guardian-pulse" style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "var(--accent-secondary)",
                        display: "inline-block",
                    }} />
                    Monitoring <span style={{ fontFamily: "var(--font-mono)", color: "var(--safar-teal)" }}>{pidOrName}</span>
                    {osType && <span style={{ marginLeft: "auto" }}>OS: {osType}</span>}
                    <span style={{ marginLeft: "auto" }}>Samples: {samples.length}</span>
                    {loading && <Icons.Loader style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />}
                </div>
            )}

            {/* Sub-tabs: Chart / Table / Process Tree */}
            {(samples.length > 0 || monitoring) && (
                <div style={{ display: "flex", gap: "1px", background: "var(--bg-secondary)", borderRadius: "8px", padding: "2px", border: "1px solid var(--border-color)", alignSelf: "flex-start" }}>
                    {(["chart", "table", "tree"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveSubTab(tab)}
                            style={{
                                padding: "6px 16px", border: "none", cursor: "pointer",
                                borderRadius: "6px", fontSize: "12px", fontWeight: 500,
                                background: activeSubTab === tab ? "var(--safar-blue)" : "transparent",
                                color: activeSubTab === tab ? "#fff" : "var(--text-muted)",
                                transition: "all 150ms ease",
                            }}
                        >
                            {tab === "chart" ? "📈 Graph" : tab === "table" ? "📊 Samples" : "🌳 Process Tree"}
                        </button>
                    ))}
                </div>
            )}

            {/* Chart View */}
            {activeSubTab === "chart" && (
                <div style={{
                    flex: 1, minHeight: "280px", background: "var(--bg-secondary)",
                    borderRadius: "12px", border: "1px solid var(--border-color)",
                    overflow: "hidden", position: "relative",
                }}>
                    <canvas
                        ref={canvasRef}
                        style={{ width: "100%", height: "100%", display: "block" }}
                    />
                    {samples.length === 0 && !monitoring && (
                        <div style={{
                            position: "absolute", inset: 0,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            gap: "12px",
                        }}>
                            <Icons.Crosshair style={{ width: 48, height: 48, color: "var(--text-muted)", opacity: 0.4 }} />
                            <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "16px" }}>Guardian Process Monitor</h3>
                            <p style={{ margin: 0, color: "var(--text-muted)", textAlign: "center", maxWidth: "420px", fontSize: "13px" }}>
                                Enter a PID or process name above and click <strong>Start</strong> to begin monitoring.
                                CPU and Memory usage will be plotted in real-time, JMeter-style.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Samples Table View */}
            {activeSubTab === "table" && (
                <div style={{
                    flex: 1, background: "var(--bg-secondary)", borderRadius: "12px",
                    border: "1px solid var(--border-color)", overflow: "hidden",
                    display: "flex", flexDirection: "column",
                }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <h3 style={{ margin: 0, fontSize: "14px", color: "var(--text-primary)" }}>
                            Historical Samples ({samples.length})
                        </h3>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Max {MAX_SAMPLES} samples retained
                        </span>
                    </div>
                    <div style={{ overflowY: "auto", flex: 1 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "12px" }}>
                            <thead style={{ position: "sticky", top: 0, background: "var(--bg-tertiary)", zIndex: 1 }}>
                                <tr>
                                    <th style={thStyle}>#</th>
                                    <th style={thStyle}>Timestamp</th>
                                    <th style={thStyle}>PID</th>
                                    <th style={thStyle}>PPID</th>
                                    <th style={thStyle}>C (CPU)</th>
                                    <th style={thStyle}>CPU Time</th>
                                    <th style={thStyle}>User</th>
                                    <th style={{ ...thStyle, width: "100%" }}>Command</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...samples].reverse().map((s, i) => (
                                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                        <td style={tdStyle}>{samples.length - i}</td>
                                        <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
                                            {new Date(s.timestamp).toLocaleTimeString()}
                                        </td>
                                        <td style={{ ...tdStyle, color: "var(--safar-blue)", fontFamily: "var(--font-mono)" }}>{s.pid}</td>
                                        <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }}>{s.ppid}</td>
                                        <td style={{ ...tdStyle, color: s.cpu > 80 ? "var(--accent-error)" : s.cpu > 50 ? "var(--accent-warning)" : "var(--text-primary)" }}>
                                            {s.cpu}
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }}>{s.etime}</td>
                                        <td style={tdStyle}>{s.user}</td>
                                        <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "0" }}>
                                            {s.command}
                                        </td>
                                    </tr>
                                ))}
                                {samples.length === 0 && (
                                    <tr>
                                        <td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                                            No samples collected yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Process Tree View */}
            {activeSubTab === "tree" && (
                <div style={{
                    flex: 1, background: "var(--bg-secondary)", borderRadius: "12px",
                    border: "1px solid var(--border-color)", overflow: "hidden",
                    display: "flex", flexDirection: "column",
                }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <h3 style={{ margin: 0, fontSize: "14px", color: "var(--text-primary)" }}>
                            Process Tree — {latestSample?.command?.split("/").pop() || pidOrName}
                        </h3>
                        <span className="badge badge-success" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            {children.length} child process{children.length !== 1 ? "es" : ""}
                        </span>
                    </div>

                    {/* Parent process */}
                    {latestSample && (
                        <div style={{
                            padding: "12px 16px", borderBottom: "1px solid var(--border-color)",
                            background: "rgba(88, 166, 255, 0.06)",
                            display: "flex", alignItems: "center", gap: "12px", fontSize: "13px",
                        }}>
                            <Icons.Crosshair style={{ width: 14, height: 14, color: "var(--safar-teal)" }} />
                            <span style={{ fontFamily: "var(--font-mono)", color: "var(--safar-blue)", fontWeight: 600 }}>
                                PID {latestSample.pid}
                            </span>
                            <span style={{ color: "var(--text-muted)" }}>PPID {latestSample.ppid}</span>
                            <span style={{ color: "var(--text-muted)" }}>User: {latestSample.user}</span>
                            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                                {latestSample.command}
                            </span>
                            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", color: "var(--accent-primary)" }}>
                                CPU: {latestSample.cpu.toFixed(1)}%
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-secondary)" }}>
                                MEM: {latestSample.mem.toFixed(1)}%
                            </span>
                        </div>
                    )}

                    {/* Children */}
                    <div style={{ overflowY: "auto", flex: 1 }}>
                        {children.length > 0 ? (
                            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "12px" }}>
                                <thead style={{ position: "sticky", top: 0, background: "var(--bg-tertiary)", zIndex: 1 }}>
                                    <tr>
                                        <th style={thStyle}></th>
                                        <th style={thStyle}>PID</th>
                                        <th style={thStyle}>User</th>
                                        <th style={thStyle}>CPU %</th>
                                        <th style={thStyle}>MEM %</th>
                                        <th style={thStyle}>RSS</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={{ ...thStyle, width: "100%" }}>Command</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {children.map((child, i) => (
                                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                            <td style={{ ...tdStyle, color: "var(--text-muted)" }}>└─</td>
                                            <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", color: "var(--safar-blue)" }}>{child.pid}</td>
                                            <td style={tdStyle}>{child.user}</td>
                                            <td style={tdStyle}>{child.cpu}</td>
                                            <td style={tdStyle}>{child.mem}</td>
                                            <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }}>{child.rss}</td>
                                            <td style={tdStyle}>{child.stat}</td>
                                            <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "0" }}>
                                                {child.command}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{
                                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                                padding: "40px", color: "var(--text-muted)", fontSize: "13px",
                            }}>
                                {monitoring ? "No child processes detected." : "Start monitoring to see the process tree."}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Command Display */}
            {latestSample && (
                <div style={{
                    background: "var(--bg-secondary)", borderRadius: "8px",
                    border: "1px solid var(--border-color)", padding: "10px 16px",
                    display: "flex", alignItems: "center", gap: "8px", fontSize: "12px",
                }}>
                    <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>CMD:</span>
                    <code style={{
                        fontFamily: "var(--font-mono)", color: "var(--text-primary)",
                        background: "var(--bg-primary)", padding: "2px 8px", borderRadius: "4px",
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {latestSample.command}
                    </code>
                </div>
            )}
        </div>
    );
}

// Shared table styles
const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-color)",
    whiteSpace: "nowrap",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.3px",
};

const tdStyle: React.CSSProperties = {
    padding: "8px 14px",
    whiteSpace: "nowrap",
};
