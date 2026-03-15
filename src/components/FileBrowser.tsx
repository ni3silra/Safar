// File Browser Component (SFTP)
import { useState, useRef, useEffect } from "react";
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
        searchQuery,
        setSearchQuery,
        sortField,
        sortDirection,
        displayedFiles,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
        goHome,
        handleSort,
        loadFiles,
        handleNavigate,
        handleUp,
        handleDownload,
        handleUpload,
        visitedPaths,
        removeVisitedPath
    } = useFileBrowser(sessionId);

    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(-1);
    const addressContainerRef = useRef<HTMLDivElement>(null);

    const suggestions = visitedPaths.filter(p => 
        p.toLowerCase().includes(tempPath.toLowerCase()) && p !== tempPath
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (addressContainerRef.current && !addressContainerRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions || suggestions.length === 0) {
            if (e.key === "Enter") {
                e.preventDefault();
                loadFiles(tempPath.trim());
                setShowSuggestions(false);
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSuggestionIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSuggestionIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (suggestionIndex >= 0) {
                const selected = suggestions[suggestionIndex];
                setTempPath(selected);
                loadFiles(selected);
                setShowSuggestions(false);
            } else {
                loadFiles(tempPath.trim());
                setShowSuggestions(false);
            }
        } else if (e.key === "Escape") {
            setShowSuggestions(false);
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
                <div className="file-nav-group">
                    <button
                        className="icon-btn nav-btn"
                        onClick={goBack}
                        disabled={!canGoBack}
                        title="Back"
                    >
                        <Icons.ChevronLeft />
                    </button>
                    <button
                        className="icon-btn nav-btn"
                        onClick={goForward}
                        disabled={!canGoForward}
                        title="Forward"
                    >
                        <Icons.ChevronRight />
                    </button>
                    <button
                        className="icon-btn nav-btn"
                        onClick={goHome}
                        title="Home"
                    >
                        <Icons.Home />
                    </button>
                    <button
                        className="icon-btn nav-btn"
                        onClick={handleUp}
                        disabled={currentPath === "." || currentPath === "/"}
                        title="Up one level"
                    >
                        <Icons.ArrowUp />
                    </button>
                    <button 
                        className="icon-btn nav-btn" 
                        onClick={() => loadFiles(currentPath)} 
                        title="Refresh"
                        style={{ marginLeft: "4px" }}
                    >
                        <Icons.Refresh />
                    </button>
                </div>

                <div className="file-address-group">
                    <div className="file-path-container" ref={addressContainerRef}>
                        <input
                            type="text"
                            value={tempPath}
                            onChange={(e) => {
                                setTempPath(e.target.value);
                                setShowSuggestions(true);
                                setSuggestionIndex(-1);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            onKeyDown={handleKeyDown}
                            className="file-path-input"
                            placeholder="Enter remote path..."
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="address-suggestions">
                                {suggestions.map((p, i) => (
                                    <div
                                        key={p}
                                        className={`suggestion-item ${i === suggestionIndex ? 'active' : ''}`}
                                        onClick={() => {
                                            setTempPath(p);
                                            loadFiles(p);
                                            setShowSuggestions(false);
                                        }}
                                        onMouseEnter={() => setSuggestionIndex(i)}
                                    >
                                        <Icons.Clock style={{ width: 12, height: 12, marginRight: 8, opacity: 0.6 }} />
                                        <span style={{ flex: 1 }}>{p}</span>
                                        <button
                                            className="suggestion-delete-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeVisitedPath(p);
                                            }}
                                            title="Remove from history"
                                        >
                                            <Icons.X style={{ width: 10, height: 10 }} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button
                            className="icon-btn go-btn"
                            onClick={() => {
                                loadFiles(tempPath.trim());
                                setShowSuggestions(false);
                            }}
                            title="Go to path"
                        >
                            <Icons.ChevronRight />
                        </button>
                    </div>

                    <div className="file-filter-container">
                        <Icons.Search className="filter-icon" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter (Regex or Text)"
                            className="file-filter-input"
                            title="Supports standard text search or regular expressions (e.g. \.log$)"
                        />
                        {searchQuery && (
                            <button
                                className="icon-btn clear-btn"
                                onClick={() => setSearchQuery("")}
                                title="Clear filter"
                            >
                                <Icons.X />
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ flex: 1 }} />
                
                <div className="file-actions-toolbar">
                    <button className="icon-btn" onClick={handleUpload} title="Upload File">
                        <Icons.Upload />
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
                            {displayedFiles.map((file) => {
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
                            {displayedFiles.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                                        {files.length === 0 ? "Empty directory" : "No files match your search filter"}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer */}
            <div className="file-footer">
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span>{files.length} items</span>
                    {searchQuery && <span style={{ color: "var(--col-blue)" }}>({displayedFiles.length} visible)</span>}
                </div>
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
