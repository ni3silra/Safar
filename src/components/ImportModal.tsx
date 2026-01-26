import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

import { Icons } from "./Icons";

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
