// File Browser Component (SFTP)
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { FileEditor } from "./FileEditor";

interface FileEntry {
    name: string;
    size: number;
    is_dir: boolean;
    modified: number;
    permissions: string;
}

interface CommandResponse<T> {
    success: boolean;
    data: T | null;
    error: string | null;
}

interface FileBrowserProps {
    sessionId: string;
}

import { Icons } from "./Icons";

type SortField = 'name' | 'modified' | 'size';
type SortDirection = 'asc' | 'desc';

export function FileBrowser({ sessionId }: FileBrowserProps) {
    const [currentPath, setCurrentPath] = useState(".");
    const [tempPath, setTempPath] = useState(".");
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingFile, setEditingFile] = useState<string | null>(null);

    // Sorting state
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Sorted files (folders first, then apply sort)
    const sortedFiles = [...files].sort((a, b) => {
        // Folders always come first
        if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
        }

        let comparison = 0;
        if (sortField === 'name') {
            comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        } else if (sortField === 'modified') {
            comparison = a.modified - b.modified;
        } else if (sortField === 'size') {
            comparison = a.size - b.size;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleString();
    };

    const formatPermissions = (perm: string) => {
        if (!perm) return "";
        // Take last 3 chars (e.g., 100644 -> 644)
        const p = perm.length > 3 ? perm.slice(-3) : perm;

        const map: Record<string, string> = {
            '0': '---', '1': '--x', '2': '-w-', '3': '-wx',
            '4': 'r--', '5': 'r-x', '6': 'rw-', '7': 'rwx'
        };

        return p.split('').map(c => map[c] || '---').join('');
    };

    const isWritable = (perm: string) => {
        if (!perm) return false;
        // Take last 3 chars (e.g., 100644 -> 644)
        const p = perm.length > 3 ? perm.slice(-3) : perm;

        // Check User Write bit (2nd bit of first digit)
        // 2 (010), 3 (011), 6 (110), 7 (111) have write bit set
        const userPerm = parseInt(p.charAt(0));
        return [2, 3, 6, 7].includes(userPerm);
    };

    const loadFiles = useCallback(async (path: string) => {
        setLoading(true);
        setError(null);
        try {
            // Use . as default if path is empty, but usually we track absolute path
            // Note: "." usually resolves to home dir in sftp if not absolute
            const response = await invoke<CommandResponse<FileEntry[]>>("ssh_sftp_ls", {
                sessionId,
                path,
            });

            if (response.success && response.data) {
                setFiles(response.data);
                setCurrentPath(path);
            } else {
                setError(response.error || "Failed to list files");
            }
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    // Initial load
    useEffect(() => {
        loadFiles(".");
    }, [loadFiles]);

    // Sync input with current path
    useEffect(() => {
        setTempPath(currentPath);
    }, [currentPath]);

    const handleNavigate = (entry: FileEntry) => {
        if (entry.is_dir) {
            // Simple path joining logic - works for unix
            const newPath = currentPath === "." ? entry.name : `${currentPath}/${entry.name}`;
            loadFiles(newPath);
        } else {
            // Open file for editing on double-click
            const fullPath = currentPath === "." ? entry.name : `${currentPath}/${entry.name}`;
            setEditingFile(fullPath);
        }
    };

    const handleUp = () => {
        if (currentPath === "." || currentPath === "/") return;
        const parts = currentPath.split("/");
        parts.pop();
        const newPath = parts.length === 0 ? "." : parts.join("/");
        loadFiles(newPath);
    };

    const handleDownload = async (file: FileEntry, e: React.MouseEvent) => {
        e.stopPropagation();
        if (file.is_dir) return;

        try {
            const localPath = await save({
                defaultPath: file.name,
            });

            if (!localPath) return;

            setLoading(true);
            const remotePath = currentPath === "." ? file.name : `${currentPath}/${file.name}`;

            await invoke("ssh_sftp_read", {
                sessionId,
                remotePath,
                localPath
            });
        } catch (err) {
            setError(`Download failed: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async () => {
        try {
            const result = await openDialog({
                multiple: false,
                directory: false,
            });

            if (!result) return;
            const localPath = result as string; // multiple:false ensures string

            setLoading(true);
            // simple basename extraction for windows/unix paths
            const fileName = localPath.split(/[\\/]/).pop() || "upload";
            const remotePath = currentPath === "." ? fileName : `${currentPath}/${fileName}`;

            await invoke("ssh_sftp_write", {
                sessionId,
                localPath,
                remotePath
            });

            loadFiles(currentPath);
        } catch (err) {
            setError(`Upload failed: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (file: FileEntry, e: React.MouseEvent) => {
        e.stopPropagation();
        if (file.is_dir) return;
        const fullPath = currentPath === "." ? file.name : `${currentPath}/${file.name}`;
        setEditingFile(fullPath);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", color: "var(--text-primary)", background: "var(--bg-primary)" }}>
            {/* Toolbar */}
            <div style={{
                padding: "8px",
                borderBottom: "1px solid var(--border-default)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--bg-secondary)"
            }}>
                <button
                    className="icon-btn"
                    onClick={handleUp}
                    disabled={currentPath === "." || currentPath === "/"}
                    title="Go Up"
                >
                    <Icons.ArrowUp />
                </button>
                <button className="icon-btn" onClick={() => loadFiles(currentPath)} title="Refresh">
                    <Icons.Refresh />
                </button>
                <div style={{ width: "1px", height: "16px", background: "var(--border-default)", margin: "0 4px" }} />
                <button className="icon-btn" onClick={handleUpload} title="Upload File">
                    <Icons.Upload />
                </button>
                <div style={{ flex: 1, display: "flex", gap: "4px" }}>
                    <input
                        type="text"
                        value={tempPath}
                        onChange={(e) => setTempPath(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                loadFiles(tempPath.trim());
                            }
                        }}
                        style={{
                            flex: 1,
                            background: "var(--bg-primary)",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "13px",
                            fontFamily: "monospace",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                            outline: "none"
                        }}
                    />
                    <button
                        className="icon-btn"
                        onClick={() => loadFiles(tempPath.trim())}
                        title="Go to path"
                        style={{ padding: "4px" }}
                    >
                        <Icons.ChevronRight />
                    </button>
                </div>
            </div>

            {/* File List */}
            <div style={{ flex: 1, overflow: "auto" }}>
                {loading ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                        Loading...
                    </div>
                ) : error ? (
                    <div style={{ padding: "20px", color: "var(--col-red)" }}>
                        Error: {error}
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
                        <thead style={{ background: "var(--bg-secondary)", textAlign: "left", position: "sticky", top: 0 }}>
                            <tr>
                                <th
                                    style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-default)", width: "40%", cursor: "pointer", userSelect: "none" }}
                                    onClick={() => handleSort('name')}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        Name
                                        {sortField === 'name' && (
                                            <span style={{ fontSize: "10px" }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-default)", width: "15%", textAlign: "right", cursor: "pointer", userSelect: "none" }}
                                    onClick={() => handleSort('size')}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                                        Size
                                        {sortField === 'size' && (
                                            <span style={{ fontSize: "10px" }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-default)", width: "15%", color: "var(--text-muted)" }}>Security</th>
                                <th
                                    style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-default)", width: "30%", cursor: "pointer", userSelect: "none" }}
                                    onClick={() => handleSort('modified')}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        Modified
                                        {sortField === 'modified' && (
                                            <span style={{ fontSize: "10px" }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedFiles.map((file) => {
                                const writable = !file.is_dir && isWritable(file.permissions);
                                return (
                                    <tr
                                        key={file.name}
                                        style={{
                                            cursor: "pointer",
                                            borderBottom: "1px solid var(--border-color-subtle)"
                                        }}
                                        className="file-row"
                                        onDoubleClick={() => handleNavigate(file)}
                                    >
                                        <td style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            <span style={{ color: file.is_dir ? "var(--col-blue)" : "var(--text-muted)", flexShrink: 0 }}>
                                                {file.is_dir ? <Icons.Folder /> : <Icons.File />}
                                            </span>
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                                        </td>
                                        <td style={{ padding: "8px 12px", color: "var(--text-muted)", textAlign: "right" }}>{file.is_dir ? "-" : formatSize(file.size)}</td>
                                        <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "12px" }}>{formatPermissions(file.permissions)}</td>
                                        <td style={{ padding: "8px 12px", color: "var(--text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            {formatDate(file.modified)}
                                            {!file.is_dir && (
                                                <div style={{ display: "flex", gap: "6px", marginLeft: "12px" }}>
                                                    <button
                                                        onClick={(e) => handleEdit(file, e)}
                                                        title={writable ? "Edit file" : "View file (Read Only)"}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                            padding: "4px 10px",
                                                            borderRadius: "4px",
                                                            border: "1px solid var(--border-color)",
                                                            background: "var(--bg-tertiary)",
                                                            cursor: "pointer",
                                                            color: writable ? "var(--col-blue)" : "var(--text-muted)",
                                                            fontSize: "11px",
                                                            fontWeight: 500,
                                                            transition: "all 0.15s ease"
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = writable ? "var(--col-blue)" : "var(--bg-secondary)";
                                                            e.currentTarget.style.color = writable ? "white" : "var(--text-primary)";
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = "var(--bg-tertiary)";
                                                            e.currentTarget.style.color = writable ? "var(--col-blue)" : "var(--text-muted)";
                                                        }}
                                                    >
                                                        {writable ? <Icons.Edit /> : <span style={{ fontSize: "14px" }}>👁</span>}
                                                        {writable ? "Edit" : "View"}
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDownload(file, e)}
                                                        title="Download file"
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                            padding: "4px 10px",
                                                            borderRadius: "4px",
                                                            border: "1px solid var(--border-color)",
                                                            background: "var(--bg-tertiary)",
                                                            cursor: "pointer",
                                                            color: "var(--col-green)",
                                                            fontSize: "11px",
                                                            fontWeight: 500,
                                                            transition: "all 0.15s ease"
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = "var(--col-green)";
                                                            e.currentTarget.style.color = "white";
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = "var(--bg-tertiary)";
                                                            e.currentTarget.style.color = "var(--col-green)";
                                                        }}
                                                    >
                                                        <Icons.Download /> Save
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                            {files.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                                        Empty directory
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer */}
            <div style={{
                padding: "4px 8px",
                borderTop: "1px solid var(--border-color)",
                fontSize: "11px",
                color: "var(--text-muted)",
                display: "flex",
                justifyContent: "space-between"
            }}>
                <span>{files.length} items</span>
                <span>SFTP Connected</span>
            </div>
            {/* File Editor Overlay */}
            {editingFile && (
                <FileEditor
                    sessionId={sessionId}
                    filePath={editingFile}
                    onClose={() => setEditingFile(null)}
                    readOnly={(() => {
                        // Find the file permissions again to determine readOnly status
                        const name = editingFile.split('/').pop();
                        const file = files.find(f => f.name === name);
                        return file && !file.is_dir ? !isWritable(file.permissions) : true;
                    })()}
                />
            )}
        </div>
    );
}
