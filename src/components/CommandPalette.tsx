import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

interface CommandSnippet {
    id: string;
    name: string;
    command: string;
    category?: string;
    hide_command?: boolean;
    newline_type?: string;  // "none", "lf", "crlf"
}

interface CommandResponse<T> {
    success: boolean;
    data: T | null;
    error: string | null;
}

interface CommandPaletteProps {
    sessionId: string | null;
    onExecute?: () => void;
}

export function CommandPalette({ sessionId, onExecute }: CommandPaletteProps) {
    const [snippets, setSnippets] = useState<CommandSnippet[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [editingSnippet, setEditingSnippet] = useState<CommandSnippet | null>(null);
    const [newSnippet, setNewSnippet] = useState({ name: "", command: "", hide_command: false, newline_type: "lf" });

    const startEdit = (snippet: CommandSnippet) => {
        setEditingSnippet(snippet);
        setNewSnippet({
            name: snippet.name,
            command: snippet.command,
            hide_command: snippet.hide_command || false,
            newline_type: snippet.newline_type || "lf"
        });
        setShowAdd(true);
    };

    const resetForm = () => {
        setEditingSnippet(null);
        setNewSnippet({ name: "", command: "", hide_command: false, newline_type: "lf" });
        setShowAdd(false);
    };

    useEffect(() => {
        loadSnippets();
    }, []);

    const loadSnippets = async () => {
        try {
            const res = await invoke<CommandResponse<CommandSnippet[]>>("snippets_get_all");
            if (res.success && res.data) {
                setSnippets(res.data);
            }
        } catch (err) {
            toast.error("Failed to load snippets");
        }
    };

    const handleSave = async () => {
        if (!newSnippet.name || !newSnippet.command) return;

        try {
            const snippet = {
                id: editingSnippet?.id || "",
                name: newSnippet.name,
                command: newSnippet.command,
                category: editingSnippet?.category || "General",
                hide_command: newSnippet.hide_command,
                newline_type: newSnippet.newline_type
            };

            const res = await invoke<CommandResponse<CommandSnippet>>("snippets_save", { snippet });

            if (res.success) {
                toast.success(editingSnippet ? "Snippet updated" : "Snippet saved");
                resetForm();
                loadSnippets();
            } else {
                toast.error(res.error || "Failed to save");
            }
        } catch (err) {
            toast.error("Error saving snippet");
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await invoke("snippets_delete", { snippetId: id });
            toast.success("Snippet deleted");
            loadSnippets();
        } catch (err) {
            toast.error("Error deleting snippet");
        }
    };

    const handleRun = async (snippet: CommandSnippet) => {
        if (!sessionId) {
            toast.error("No active SSH session. Select a connected session first.");
            return;
        }

        try {
            // Determine the newline suffix based on newline_type
            let suffix = "";
            const nlType = snippet.newline_type || "lf";
            if (nlType === "lf") {
                suffix = "\n";
            } else if (nlType === "crlf") {
                suffix = "\r\n";
            }
            // "none" = no suffix

            const dataToSend = snippet.command + suffix;
            await invoke("ssh_send", { sessionId, data: dataToSend });
            toast.success(`Command "${snippet.name}" sent to terminal`);
            if (onExecute) onExecute();
        } catch (err) {
            toast.error(`Failed to send command: ${err}`);
        }
    };

    return (
        <div className="command-palette" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{
                padding: "var(--space-2) var(--space-3)",
                borderBottom: "1px solid var(--border-color)",
                display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
                <span style={{ fontWeight: 600 }}>Snippets & Macros</span>
                <button
                    className="icon-btn"
                    onClick={() => setShowAdd(!showAdd)}
                    style={{ fontSize: "18px" }}
                >
                    +
                </button>
            </div>

            {/* Add Form */}
            {showAdd && (
                <div style={{ padding: "var(--space-2)", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)" }}>
                    <input
                        className="input"
                        placeholder="Name (e.g., Deploy Script)"
                        value={newSnippet.name}
                        onChange={e => setNewSnippet({ ...newSnippet, name: e.target.value })}
                        style={{ marginBottom: "var(--space-2)" }}
                    />
                    <textarea
                        className="input"
                        placeholder="Command or Script (multi-line supported)"
                        value={newSnippet.command}
                        onChange={e => setNewSnippet({ ...newSnippet, command: e.target.value })}
                        style={{ marginBottom: "var(--space-2)", fontFamily: "monospace", minHeight: "60px" }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-2)", fontSize: "12px", color: "var(--text-muted)", cursor: "pointer" }}>
                        <input
                            type="checkbox"
                            checked={newSnippet.hide_command}
                            onChange={e => setNewSnippet({ ...newSnippet, hide_command: e.target.checked })}
                        />
                        Hide command (only show snippet name)
                    </label>
                    <div style={{ marginBottom: "var(--space-2)" }}>
                        <label style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Line ending:</label>
                        <div style={{ display: "flex", gap: "4px" }}>
                            {[
                                { value: "lf", label: "LF (↵)" },
                                { value: "crlf", label: "CRLF" },
                                { value: "none", label: "None" }
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setNewSnippet({ ...newSnippet, newline_type: opt.value })}
                                    style={{
                                        flex: 1,
                                        padding: "6px 10px",
                                        fontSize: "11px",
                                        border: "1px solid var(--border-color)",
                                        borderRadius: "var(--radius-sm)",
                                        background: newSnippet.newline_type === opt.value
                                            ? "var(--accent-primary)"
                                            : "var(--bg-primary)",
                                        color: newSnippet.newline_type === opt.value
                                            ? "#fff"
                                            : "var(--text-muted)",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease"
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave}>
                            {editingSnippet ? "Update Snippet" : "Save Snippet"}
                        </button>
                        {editingSnippet && (
                            <button className="btn" style={{ flex: 0 }} onClick={resetForm}>
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-2)" }}>
                {snippets.length === 0 ? (
                    <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                        No snippets saved. Click + to add one.
                        <br /><span style={{ fontSize: "10px" }}>Multi-line scripts supported.</span>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                        {snippets.map(s => (
                            <div key={s.id} className="snippet-item" style={{
                                background: "var(--bg-secondary)",
                                padding: "var(--space-2)",
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border-color)",
                                cursor: "pointer",
                                transition: "border-color 0.2s"
                            }}
                                onClick={() => handleRun(s)}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                                    <div style={{ display: "flex", gap: "4px" }}>
                                        <button
                                            className="icon-btn"
                                            onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                                            style={{ opacity: 0.5, fontSize: "12px" }}
                                            title="Edit snippet"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="icon-btn"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                            style={{ opacity: 0.5, fontSize: "12px" }}
                                            title="Delete snippet"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                                <div style={{
                                    fontFamily: "monospace",
                                    fontSize: "var(--text-xs)",
                                    color: "var(--text-muted)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }}>
                                    {s.hide_command ? (
                                        <span style={{ color: "var(--col-purple)", fontStyle: "italic" }}>🔒 Hidden command</span>
                                    ) : s.command.includes('\n') ? (
                                        <span style={{ color: "var(--col-blue)" }}>
                                            Run Macro ({s.command.split('\n').length} lines)
                                        </span>
                                    ) : (
                                        s.command
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
