import { useState, useEffect } from "react";
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

export function TransferManager() {
    const [transfers, setTransfers] = useState<Record<string, SftpProgressPayload>>({});
    const [isMinimized, setIsMinimized] = useState(false);

    useEffect(() => {
        let unlisten: UnlistenFn | null = null;

        const setupListener = async () => {
            unlisten = await listen<SftpProgressPayload>("sftp-transfer", (event) => {
                const payload = event.payload;
                // Use path as the unique transfer ID keyed by session
                const key = `${payload.session_id}_${payload.path}`;

                setTransfers(prev => {
                    const next = { ...prev };

                    if (payload.status === "completed" || payload.status === "error") {
                        next[key] = payload;

                        // Auto clear completed items after 3 seconds
                        if (payload.status === "completed") {
                            setTimeout(() => {
                                setTransfers(current => {
                                    const copy = { ...current };
                                    delete copy[key];
                                    return copy;
                                });
                            }, 3000);
                        }
                    } else {
                        next[key] = payload;
                    }
                    return next;
                });
            });
        };

        setupListener();

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, []);

    const activeTransfers = Object.values(transfers);
    if (activeTransfers.length === 0) return null;

    return (
        <div style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            width: "300px",
            backgroundColor: "var(--bg-panel)",
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
        }}>
            <div style={{
                padding: "8px 12px",
                backgroundColor: "var(--bg-sidebar)",
                borderBottom: "1px solid var(--border-default)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none"
            }} onClick={() => setIsMinimized(!isMinimized)}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icons.Download style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
                    <span style={{ fontSize: "12px", fontWeight: 600 }}>Active Transfers ({activeTransfers.length})</span>
                </div>
                <Icons.ChevronRight style={{
                    width: 14, height: 14,
                    transform: isMinimized ? "rotate(-90deg)" : "rotate(90deg)",
                    transition: "transform 0.2s"
                }} />
            </div>

            {!isMinimized && (
                <div style={{ padding: "8px", maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                    {activeTransfers.map(tr => {
                        const percent = tr.total > 0 ? Math.round((tr.transferred / tr.total) * 100) : 0;
                        const filename = tr.path.split(/[\\/]/).pop() || tr.path;

                        return (
                            <div key={`${tr.session_id}_${tr.path}`} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", alignItems: "center" }}>
                                    <span className="truncate" style={{ maxWidth: "200px", color: tr.status === "error" ? "var(--col-red)" : "inherit" }} title={tr.path}>
                                        <span style={{ color: "var(--col-blue)", marginRight: "4px", fontSize: "10px" }}>
                                            {tr.transfer_type === "upload" ? "▲" : "▼"}
                                        </span>
                                        {filename}
                                    </span>
                                    <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                                        {tr.status === "error" ? "Failed" :
                                            tr.status === "completed" ? "Done" : `${percent}%`}
                                    </span>
                                </div>
                                <div style={{ width: "100%", height: "4px", backgroundColor: "var(--bg-hover)", borderRadius: "2px", overflow: "hidden" }}>
                                    <div style={{
                                        width: `${percent}%`,
                                        height: "100%",
                                        backgroundColor: tr.status === "error" ? "var(--col-red)" :
                                            tr.status === "completed" ? "var(--col-green)" : "var(--col-blue)",
                                        transition: "width 0.2s ease-out"
                                    }} />
                                </div>
                                {tr.status === "error" && tr.error_msg && (
                                    <div style={{ fontSize: "10px", color: "var(--col-red)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={tr.error_msg}>
                                        {tr.error_msg}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
