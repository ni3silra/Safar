// File Browser Component (SFTP)
import { useFileBrowser } from "../hooks/useFileBrowser";
import { FileEditor } from "./FileEditor";
import { Icons } from "./Icons";
import { FileEntry } from "../types";

interface FileBrowserProps {
    sessionId: string;
}

export function FileBrowser({ sessionId }: FileBrowserProps) {
    const {
        currentPath,
        tempPath,
        setTempPath,
        files,
        loading,
        error,
        editingFile,
        setEditingFile,
        sortField,
        sortDirection,
        sortedFiles,
        handleSort,
        loadFiles,
        handleNavigate,
        handleUp,
        handleDownload,
        handleUpload
    } = useFileBrowser(sessionId);

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

    const handleEdit = (file: FileEntry, e: React.MouseEvent) => {
        e.stopPropagation();
        if (file.is_dir) return;
        const fullPath = currentPath === "." ? file.name : `${currentPath}/${file.name}`;
        setEditingFile(fullPath);
    };

    return (
        <div className="file-browser">
            {/* Toolbar */}
            <div className="file-toolbar">
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
                <div className="file-path-container">
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
                        className="file-path-input"
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
            <div className="file-list-container">
                {loading ? (
                    <div className="file-loading">
                        Loading...
                    </div>
                ) : error ? (
                    <div className="file-error">
                        Error: {error}
                    </div>
                ) : (
                    <table className="file-table">
                        <thead className="file-thead">
                            <tr>
                                <th
                                    className="file-th"
                                    style={{ width: "40%" }}
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="file-th-content">
                                        Name
                                        {sortField === 'name' && (
                                            <span style={{ fontSize: "10px" }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="file-th"
                                    style={{ width: "15%", textAlign: "right" }}
                                    onClick={() => handleSort('size')}
                                >
                                    <div className="file-th-content right">
                                        Size
                                        {sortField === 'size' && (
                                            <span style={{ fontSize: "10px" }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                                <th className="file-th" style={{ width: "15%" }}>Security</th>
                                <th
                                    className="file-th"
                                    style={{ width: "30%" }}
                                    onClick={() => handleSort('modified')}
                                >
                                    <div className="file-th-content">
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
                                        className="file-row"
                                        onDoubleClick={() => handleNavigate(file)}
                                    >
                                        <td className="file-cell">
                                            <div className="file-name-cell">
                                                <span className={`file-icon ${file.is_dir ? "folder" : ""}`}>
                                                    {file.is_dir ? <Icons.Folder /> : <Icons.File />}
                                                </span>
                                                <span className="truncate">{file.name}</span>
                                            </div>
                                        </td>
                                        <td className="file-cell file-size-cell">{file.is_dir ? "-" : formatSize(file.size)}</td>
                                        <td className="file-cell file-perm-cell">{formatPermissions(file.permissions)}</td>
                                        <td className="file-cell file-actions-cell">
                                            {formatDate(file.modified)}
                                            {!file.is_dir && (
                                                <div className="file-actions-group">
                                                    <button
                                                        onClick={(e) => handleEdit(file, e)}
                                                        title={writable ? "Edit file" : "View file (Read Only)"}
                                                        className={`file-action-btn edit ${writable ? "writable" : ""}`}
                                                    >
                                                        {writable ? <Icons.Edit /> : <span style={{ fontSize: "14px" }}>👁</span>}
                                                        {writable ? "Edit" : "View"}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDownload(file);
                                                        }}
                                                        title="Download file"
                                                        className="file-action-btn download"
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
            <div className="file-footer">
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
