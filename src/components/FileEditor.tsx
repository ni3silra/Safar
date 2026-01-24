// File Editor Component (Monaco)
import { useEffect, useState, useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";

interface FileEditorProps {
    sessionId: string;
    filePath: string; // Remote absolute path
    onClose: () => void;
}

interface CommandResponse<T> {
    success: boolean;
    data: T | null;
    error: string | null;
}

export function FileEditor({ sessionId, filePath, onClose }: FileEditorProps) {
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const editorRef = useRef<any>(null);

    // Determine language from extension
    const getLanguage = (path: string) => {
        const ext = path.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js': return 'javascript';
            case 'ts': return 'typescript';
            case 'jsx': return 'javascript';
            case 'tsx': return 'typescript';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'json': return 'json';
            case 'md': return 'markdown';
            case 'rs': return 'rust';
            case 'py': return 'python';
            case 'sh': return 'shell';
            case 'xml': return 'xml';
            case 'yml': case 'yaml': return 'yaml';
            default: return 'plaintext';
        }
    };

    const language = getLanguage(filePath);
    const fileName = filePath.split('/').pop() || filePath;

    useEffect(() => {
        loadContent();
    }, [sessionId, filePath]);

    const loadContent = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await invoke<CommandResponse<string>>("ssh_sftp_read_text", {
                sessionId,
                remotePath: filePath,
            });

            if (response.success && response.data !== null) {
                setContent(response.data);
            } else {
                setError(response.error || "Failed to load file content");
            }
        } catch (err) {
            setError(`Load Error: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!editorRef.current) return;
        setSaving(true);
        try {
            const currentContent = editorRef.current.getValue();
            const response = await invoke<CommandResponse<void>>("ssh_sftp_write_text", {
                sessionId,
                remotePath: filePath,
                content: currentContent,
            });

            if (!response.success) {
                setError(response.error || "Failed to save file");
            } else {
                // Success feedback? usually subtle
                // Maybe a toast or temporary status
            }
        } catch (err) {
            setError(`Save Error: ${err}`);
        } finally {
            setSaving(false);
        }
    };

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;

        // Add save command (Ctrl+S / Cmd+S)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            handleSave();
        });
    };

    return (
        <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "var(--bg-primary)",
            zIndex: 100, // Cover the file browser
            display: "flex",
            flexDirection: "column"
        }}>
            {/* Toolbar */}
            <div style={{
                height: "36px",
                background: "var(--bg-secondary)",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                justifyContent: "space-between"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>{fileName}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{filePath}</span>
                    {saving && <span style={{ fontSize: "11px", color: "var(--col-blue)" }}>Saving...</span>}
                    {error && <span style={{ fontSize: "11px", color: "var(--col-red)" }}>{error}</span>}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button
                        className="btn-sm"
                        onClick={handleSave}
                        disabled={saving || loading}
                        style={{
                            background: "var(--col-blue)",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            padding: "4px 12px",
                            cursor: "pointer",
                            fontSize: "12px"
                        }}
                    >
                        Save
                    </button>
                    <button
                        className="btn-sm"
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "4px",
                            padding: "4px 12px",
                            cursor: "pointer",
                            fontSize: "12px"
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div style={{ flex: 1, position: "relative" }}>
                {loading ? (
                    <div style={{
                        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--text-muted)"
                    }}>
                        Loading content...
                    </div>
                ) : (
                    <Editor
                        height="100%"
                        defaultLanguage={language}
                        defaultValue={content}
                        theme="vs-dark" // matches our dark theme roughly
                        onMount={handleEditorDidMount}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                        }}
                    />
                )}
            </div>
        </div>
    );
}
