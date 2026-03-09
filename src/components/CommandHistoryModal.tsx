import { useState, useEffect, useRef } from "react";
import { toast } from 'sonner';
import { HistoryEntry, getHistory, clearHistory } from "../utils/history";
import { Icons } from "./Icons";

interface CommandHistoryModalProps {
    onClose: () => void;
    onSelect: (command: string) => void;
}

export function CommandHistoryModal({ onClose, onSelect }: CommandHistoryModalProps) {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setHistory(getHistory());

        const handleUpdate = () => {
            setHistory(getHistory());
        };

        window.addEventListener('safar_history_updated', handleUpdate);
        return () => window.removeEventListener('safar_history_updated', handleUpdate);
    }, []);

    useEffect(() => {
        // Auto-focus search input
        if (searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, []);

    const filteredHistory = history.filter(entry =>
        entry.command.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
        });
    };

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '320px',
            background: 'var(--bg-primary)',
            borderLeft: '1px solid var(--border-color)',
            boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.2)',
            display: "flex",
            flexDirection: "column",
            zIndex: 100,
            animation: 'slideInRight 0.2s ease-out'
        }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-subtle)', padding: '12px 16px' }}>
                <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icons.Clock style={{ width: 18, height: 18 }} />
                    Command History
                </h2>
                <button className="icon-btn" onClick={onClose}>
                    <Icons.X />
                </button>
            </div>

            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", display: "flex", gap: "12px" }}>
                <div style={{ position: "relative", flex: 1 }}>
                    <div style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", display: "flex" }}>
                        <Icons.Search style={{ width: 14, height: 14 }} />
                    </div>
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="input"
                        placeholder="Search history..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: "100%", paddingLeft: "32px", fontSize: "13px" }}
                    />
                </div>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        clearHistory();
                        toast.success("Command history cleared");
                    }}
                    style={{ color: "var(--accent-error)", borderColor: "rgba(248, 81, 73, 0.3)" }}
                    title="Clear History"
                >
                    Clear All
                </button>
            </div>

            <div className="modal-body" style={{ flex: 1, overflowY: "auto", padding: 0 }}>
                {filteredHistory.length === 0 ? (
                    <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                        {history.length === 0 ? "No command history found." : "No matching commands found."}
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {filteredHistory.map((entry, index) => (
                            <button
                                key={index}
                                onClick={() => onSelect(entry.command)}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    gap: "4px",
                                    padding: "12px 16px",
                                    background: "transparent",
                                    border: "none",
                                    borderBottom: "1px solid var(--border-color)",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    transition: "background 0.15s ease",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-secondary)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                title="Click to execute"
                            >
                                <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{
                                        color: "var(--text-primary)",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "13px",
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-all",
                                        display: "-webkit-box",
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden"
                                    }}>
                                        {entry.command}
                                    </span>
                                    <div style={{ opacity: 0.5 }}>
                                        <Icons.ChevronRight style={{ width: 14, height: 14 }} />
                                    </div>
                                </div>
                                <span style={{ fontSize: "10px", color: "var(--text-muted)", opacity: 0.8 }}>
                                    {formatTime(entry.timestamp)}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
