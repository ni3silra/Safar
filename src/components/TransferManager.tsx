import { useState, useEffect, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Icons } from "./Icons";

export interface SftpProgressPayload {
    session_id: string;
    path: string;
    transfer_type: "upload" | "download";
    transferred: number;
    total: number;
    status: "progress" | "completed" | "error";
    error_msg?: string;
}

interface TransferState extends SftpProgressPayload {
    startedAt: number;
    speed: number;       // bytes per second
    eta: number;         // seconds remaining
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatSpeed(bps: number): string {
    if (bps < 1024) return `${Math.round(bps)} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatEta(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return "";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function TransferManager() {
    const [transfers, setTransfers] = useState<Record<string, TransferState>>({});
    const [isMinimized, setIsMinimized] = useState(false);
    const startTimesRef = useRef<Record<string, number>>({});

    useEffect(() => {
        let unlisten: UnlistenFn | null = null;

        const setupListener = async () => {
            unlisten = await listen<SftpProgressPayload>("sftp-transfer", (event) => {
                const payload = event.payload;
                const key = `${payload.session_id}_${payload.path}`;

                setTransfers(prev => {
                    const next = { ...prev };

                    // Track start time for speed calculations
                    if (!startTimesRef.current[key]) {
                        startTimesRef.current[key] = Date.now();
                    }

                    const elapsed = (Date.now() - startTimesRef.current[key]) / 1000; // seconds
                    const speed = elapsed > 0 ? payload.transferred / elapsed : 0;
                    const remaining = payload.total > 0 && speed > 0
                        ? (payload.total - payload.transferred) / speed
                        : Infinity;

                    next[key] = {
                        ...payload,
                        startedAt: startTimesRef.current[key],
                        speed,
                        eta: remaining,
                    };

                    if (payload.status === "completed") {
                        setTimeout(() => {
                            setTransfers(c => {
                                const copy = { ...c };
                                delete copy[key];
                                delete startTimesRef.current[key];
                                return copy;
                            });
                        }, 4000);
                    }

                    if (payload.status === "error") {
                        delete startTimesRef.current[key];
                    }

                    return next;
                });
            });
        };

        setupListener();
        return () => { if (unlisten) unlisten(); };
    }, []);

    const dismiss = (key: string) => {
        setTransfers(prev => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
        });
    };

    const activeTransfers = Object.entries(transfers);
    if (activeTransfers.length === 0) return null;

    const inProgress = activeTransfers.filter(([, t]) => t.status === "progress").length;

    return (
        <div style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            width: "360px",
            background: "var(--bg-panel, #1a1d23)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backdropFilter: "blur(8px)",
            fontFamily: "var(--font-primary, system-ui)",
        }}>
            {/* Header */}
            <div
                onClick={() => setIsMinimized(!isMinimized)}
                style={{
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.04)",
                    borderBottom: isMinimized ? "none" : "1px solid rgba(255,255,255,0.07)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {inProgress > 0 ? (
                        <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: "#3b82f6",
                            boxShadow: "0 0 6px #3b82f6",
                            animation: "pulse 1.5s ease-in-out infinite",
                        }} />
                    ) : (
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                    )}
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary, #e2e8f0)" }}>
                        {inProgress > 0
                            ? `Transferring${activeTransfers.length > 1 ? ` (${activeTransfers.length})` : ""}…`
                            : `Transfers (${activeTransfers.length})`}
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); setTransfers({}); }}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}
                        title="Clear all"
                    >Clear all</button>
                    <Icons.ChevronRight style={{
                        width: 14, height: 14,
                        color: "var(--text-muted, #64748b)",
                        transform: isMinimized ? "rotate(-90deg)" : "rotate(90deg)",
                        transition: "transform 0.2s",
                    }} />
                </div>
            </div>

            {/* Transfer List */}
            {!isMinimized && (
                <div style={{ maxHeight: "320px", overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    {activeTransfers.map(([key, tr]) => {
                        const percent = tr.total > 0 ? Math.min(100, Math.round((tr.transferred / tr.total) * 100)) : 0;
                        const filename = tr.path.split(/[/\\]/).pop() || tr.path;
                        const isUpload = tr.transfer_type === "upload";
                        const isDone = tr.status === "completed";
                        const isError = tr.status === "error";

                        const barColor = isError ? "#ef4444" : isDone ? "#22c55e" : isUpload ? "#f59e0b" : "#3b82f6";
                        const iconColor = isUpload ? "#f59e0b" : "#3b82f6";

                        return (
                            <div key={key} style={{
                                background: "rgba(255,255,255,0.03)",
                                border: `1px solid ${isError ? "rgba(239,68,68,0.2)" : isDone ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
                                borderRadius: "8px",
                                padding: "10px 12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                            }}>
                                {/* Top row: icon + filename + dismiss */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: "6px",
                                        background: `${barColor}18`,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        flexShrink: 0,
                                    }}>
                                        {isError ? (
                                            <Icons.AlertCircle style={{ width: 14, height: 14, color: "#ef4444" }} />
                                        ) : isDone ? (
                                            <Icons.Check style={{ width: 14, height: 14, color: "#22c55e" }} />
                                        ) : isUpload ? (
                                            <Icons.Upload style={{ width: 14, height: 14, color: iconColor }} />
                                        ) : (
                                            <Icons.Download style={{ width: 14, height: 14, color: iconColor }} />
                                        )}
                                    </div>
                                    <div style={{ flex: 1, overflow: "hidden" }}>
                                        <div style={{
                                            fontSize: "12px",
                                            fontWeight: 500,
                                            color: isError ? "#ef4444" : "var(--text-primary, #e2e8f0)",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }} title={tr.path}>
                                            {filename}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "1px" }}>
                                            {isUpload ? "Upload" : "Download"}
                                            {tr.total > 0 && ` · ${formatBytes(tr.total)}`}
                                        </div>
                                    </div>
                                    {(isDone || isError) && (
                                        <button
                                            onClick={() => dismiss(key)}
                                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", padding: "2px", display: "flex", flexShrink: 0 }}
                                            title="Dismiss"
                                        >
                                            <Icons.X style={{ width: 13, height: 13 }} />
                                        </button>
                                    )}
                                </div>

                                {/* Progress bar */}
                                {!isError && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                        <div style={{
                                            width: "100%", height: "5px",
                                            background: "rgba(255,255,255,0.08)",
                                            borderRadius: "3px",
                                            overflow: "hidden",
                                        }}>
                                            <div style={{
                                                width: `${isDone ? 100 : percent}%`,
                                                height: "100%",
                                                background: barColor,
                                                borderRadius: "3px",
                                                boxShadow: `0 0 6px ${barColor}66`,
                                                transition: "width 0.25s ease-out",
                                            }} />
                                        </div>

                                        {/* Stats row */}
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                                {isDone ? (
                                                    <span style={{ color: "#22c55e", fontWeight: 500 }}>✓ Complete</span>
                                                ) : (
                                                    `${formatBytes(tr.transferred)}${tr.total > 0 ? ` / ${formatBytes(tr.total)}` : ""}`
                                                )}
                                            </span>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                {!isDone && tr.speed > 0 && (
                                                    <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                                        {formatSpeed(tr.speed)}
                                                    </span>
                                                )}
                                                {!isDone && isFinite(tr.eta) && tr.eta > 0 && (
                                                    <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                                        {formatEta(tr.eta)}
                                                    </span>
                                                )}
                                                <span style={{
                                                    fontSize: "12px",
                                                    fontWeight: 700,
                                                    color: isDone ? "#22c55e" : barColor,
                                                    minWidth: "34px",
                                                    textAlign: "right",
                                                }}>
                                                    {isDone ? "100%" : `${percent}%`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Error message */}
                                {isError && tr.error_msg && (
                                    <div style={{
                                        fontSize: "11px",
                                        color: "#ef4444",
                                        background: "rgba(239,68,68,0.08)",
                                        padding: "5px 8px",
                                        borderRadius: "5px",
                                        wordBreak: "break-word",
                                    }}>
                                        {tr.error_msg}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
}
