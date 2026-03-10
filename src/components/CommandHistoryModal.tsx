import { useState, useEffect, useRef } from "react";
import { toast } from 'sonner';
import { HistoryEntry, getHistory, clearHistory } from "../utils/history";
import { Icons } from "./Icons";

interface CommandHistoryModalProps {
    onClose: () => void;
    onSelect: (command: string) => void;
    theme?: any; // xterm.js theme object
}

export function CommandHistoryModal({ onClose, onSelect, theme }: CommandHistoryModalProps) {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [onClose]);

    const filteredHistory = history.filter(entry =>
        entry.command.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
        });
    };

    // Extract basic theme colors with standard fallbacks
    const bg = theme?.background || '#0d0d0d';
    const fg = theme?.foreground || '#e2e8f0';
    const cursor = theme?.cursor || '#4ade80';
    const subtleBorder = 'rgba(255, 255, 255, 0.1)';
    const selection = theme?.selectionBackground || 'rgba(255, 255, 255, 0.1)';

    return (
        <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            animation: 'fadeIn 0.15s ease-out'
        }}>
            <div
                ref={modalRef}
                style={{
                    width: '500px',
                    maxHeight: '80%',
                    background: bg,
                    border: `1px solid ${subtleBorder}`,
                    borderRadius: '8px',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
                    display: "flex",
                    flexDirection: "column",
                    fontFamily: 'var(--font-primary, system-ui)',
                    color: fg,
                    overflow: 'hidden',
                    animation: 'slideUp 0.15s ease-out'
                }}>
                <div className="modal-header" style={{ borderBottom: `1px solid ${subtleBorder}`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "15px", fontWeight: 600, color: fg }}>
                        <Icons.Terminal style={{ width: 16, height: 16, color: cursor }} />
                        Terminal History
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: fg, opacity: 0.6, cursor: 'pointer', padding: '4px', display: 'flex' }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                    >
                        <Icons.X style={{ width: 16, height: 16 }} />
                    </button>
                </div>

                <div style={{ padding: "12px 20px", borderBottom: `1px solid ${subtleBorder}`, display: "flex", gap: "12px", background: `rgba(0, 0, 0, 0.1)` }}>
                    <div style={{ position: "relative", flex: 1 }}>
                        <div style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: fg, opacity: 0.5, display: "flex" }}>
                            <Icons.Search style={{ width: 14, height: 14 }} />
                        </div>
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search commands..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px 12px 8px 36px",
                                fontSize: "13px",
                                fontFamily: "var(--font-primary, system-ui)",
                                background: "rgba(0,0,0,0.2)",
                                border: `1px solid ${subtleBorder}`,
                                color: fg,
                                borderRadius: "6px",
                                outline: "none",
                                transition: "border-color 0.15s"
                            }}
                            onFocus={(e) => e.target.style.borderColor = cursor}
                            onBlur={(e) => e.target.style.borderColor = subtleBorder}
                        />
                    </div>
                    <button
                        onClick={() => {
                            clearHistory();
                            toast.success("Terminal history cleared");
                        }}
                        style={{
                            background: 'transparent',
                            border: `1px solid ${subtleBorder}`,
                            color: theme?.red || '#ef4444',
                            padding: '0 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontFamily: 'var(--font-primary, system-ui)',
                            fontWeight: 500,
                            transition: "all 0.15s"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.borderColor = theme?.red || '#ef4444'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = subtleBorder; }}
                        title="Clear History"
                    >
                        Clear All
                    </button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: "auto", padding: 0 }}>
                    {filteredHistory.length === 0 ? (
                        <div style={{ padding: "60px 40px", textAlign: "center", color: fg, opacity: 0.5, fontSize: "14px" }}>
                            {history.length === 0 ? "No command history." : "No matches found."}
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
                                        gap: "8px",
                                        padding: "14px 20px",
                                        background: "transparent",
                                        border: "none",
                                        borderBottom: `1px solid ${subtleBorder}`,
                                        textAlign: "left",
                                        cursor: "pointer",
                                        transition: "background 0.1s ease",
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = selection}
                                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                    title="Click to paste into terminal"
                                >
                                    <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                                        <span style={{
                                            color: cursor, // Terminal cursor
                                            fontFamily: "var(--font-mono, monospace)",
                                            fontSize: "13px",
                                            lineHeight: "1.5",
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-all",
                                            display: "-webkit-box",
                                            WebkitLineClamp: 4,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden"
                                        }}>
                                            <span style={{ color: fg, opacity: 0.4, marginRight: "10px", userSelect: "none" }}>$</span>
                                            {entry.command}
                                        </span>
                                        <div style={{ opacity: 0.3, color: fg, marginTop: "2px" }}>
                                            <Icons.ChevronRight style={{ width: 14, height: 14 }} />
                                        </div>
                                    </div>
                                    <span style={{ fontSize: "11px", color: fg, opacity: 0.4, display: "flex", gap: "6px", alignItems: "center", fontFamily: "var(--font-primary, system-ui)" }}>
                                        <Icons.Clock style={{ width: 10, height: 10 }} />
                                        {formatTime(entry.timestamp)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
