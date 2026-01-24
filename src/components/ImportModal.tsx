import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

// Reusing IconProps from App (or defining locally since we don't have a shared UI lib yet)
interface IconProps {
    className?: string;
    style?: React.CSSProperties;
}

const Icons = {
    X: ({ style, className }: IconProps = {}) => (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={style} className={className}>
            <path d="M3.5 3.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    ),
    Upload: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M8 12a.5.5 0 01-.5-.5V4.707L5.354 6.854a.5.5 0 11-.708-.708l3-3a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8 4.707V11.5a.5.5 0 01-.5.5z" />
            <path d="M2.5 12a.5.5 0 01.5-.5h2a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm8 0a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5z" />
        </svg>
    ),
    FileCode: ({ style, className }: IconProps = {}) => (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={style} className={className}>
            <path d="M4 1.5A1.5 1.5 0 002.5 3v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V3A1.5 1.5 0 0012 1.5H4zM12 2.5a.5.5 0 01.5.5v10a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5h8z" />
            <path d="M5.5 5.5A.5.5 0 016 5h4a.5.5 0 010 1H6a.5.5 0 01-.5-.5zm0 3A.5.5 0 016 8h4a.5.5 0 010 1H6a.5.5 0 01-.5-.5zm0 3A.5.5 0 016 11h2a.5.5 0 010 1H6a.5.5 0 01-.5-.5z" />
        </svg>
    )
};

interface ImportModalProps {
    onClose: () => void;
    onImportSuccess: () => void;
}

export function ImportModal({ onClose, onImportSuccess }: ImportModalProps) {
    const [filePath, setFilePath] = useState<string | null>(null);
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState(false);

    const handleSelectFile = async () => {
        try {
            const selected = await openDialog({
                multiple: false,
                filters: [{ name: 'JSON Files', extensions: ['json'] }]
            });

            if (selected) {
                const path = selected as string;
                setFilePath(path);
                setError(null);

                // Read file content using our backend command
                try {
                    const content = await invoke<string>("fs_read_text", { path });
                    // Validate JSON
                    const data = JSON.parse(content);
                    if (Array.isArray(data)) {
                        setPreviewCount(data.length);
                        setFileContent(content);
                    } else {
                        setError("Invalid JSON format: Expected an array of sessions.");
                        setPreviewCount(null);
                        setFileContent(null);
                    }
                } catch (readErr) {
                    console.error("Failed to read file:", readErr);
                    setError(`Failed to read file: ${readErr}`);
                }
            }
        } catch (err) {
            console.error("Dialog error:", err);
        }
    };

    const handleImport = async () => {
        if (!fileContent) return;

        setIsImporting(true);
        try {
            // Replace with your actual import command
            const importedCount = await invoke<number>("sessions_import", { jsonContent: fileContent });
            toast.success(`Successfully imported ${importedCount} sessions.`);
            onImportSuccess();
            onClose();
        } catch (err) {
            console.error("Import failed:", err);
            toast.error(`Import failed: ${err}`);
            setError(`Import error: ${err}`);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
                <div className="modal-header">
                    <h2 className="modal-title">Import Sessions</h2>
                    <button className="icon-btn" onClick={onClose}>
                        <Icons.X />
                    </button>
                </div>

                <div className="modal-body">
                    <p style={{ color: "var(--text-muted)", marginBottom: "var(--space-4)" }}>
                        Select a <code>sessions.json</code> file to import saved connections. duplicate entries (same name/host) will be skipped.
                    </p>

                    <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <input
                                type="text"
                                className="input"
                                value={filePath || ""}
                                placeholder="No file selected..."
                                readOnly
                                onClick={handleSelectFile}
                                style={{ cursor: "pointer" }}
                            />
                            <button className="btn btn-secondary" onClick={handleSelectFile}>
                                Browse
                            </button>
                        </div>

                        {error && (
                            <div style={{
                                color: "var(--col-red)",
                                fontSize: "var(--text-sm)",
                                padding: "var(--space-2)",
                                background: "rgba(239, 68, 68, 0.1)",
                                borderRadius: "4px"
                            }}>
                                {error}
                            </div>
                        )}

                        {previewCount !== null && (
                            <div style={{
                                padding: "var(--space-3)",
                                background: "var(--bg-secondary)",
                                borderRadius: "var(--radius-md)",
                                display: "flex",
                                alignItems: "center",
                                gap: "var(--space-3)"
                            }}>
                                <div style={{ padding: "8px", background: "var(--bg-primary)", borderRadius: "50%" }}>
                                    <Icons.FileCode />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600 }}>Ready to Import</div>
                                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                                        Found {previewCount} sessions in file.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={isImporting}>
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleImport}
                        disabled={!fileContent || isImporting}
                    >
                        {isImporting ? "Importing..." : "Import Sessions"}
                    </button>
                </div>
            </div>
        </div>
    );
}
