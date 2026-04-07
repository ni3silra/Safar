import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { FileEntry, CommandResponse, SortField, SortDirection } from "../types";

export function useFileBrowser(sessionId: string) {
    const [currentPath, setCurrentPath] = useState(".");
    const [tempPath, setTempPath] = useState(".");
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingFile, setEditingFile] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Navigation and Autocomplete state
    const [history, setHistory] = useState<string[]>(["."]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [visitedPaths, setVisitedPaths] = useState<string[]>(() => {
        const saved = localStorage.getItem("safar_visited_paths");
        return saved ? JSON.parse(saved) : [];
    });
    const [homePath] = useState(".");

    // Sorting state
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // ... (sorting logic unchanged)
    const sortedFiles = [...files].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        let comparison = 0;
        if (sortField === 'name') comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        else if (sortField === 'modified') comparison = a.modified - b.modified;
        else if (sortField === 'size') comparison = a.size - b.size;
        return sortDirection === 'asc' ? comparison : -comparison;
    });

    const displayedFiles = sortedFiles.filter(file => {
        if (!searchQuery.trim()) return true;
        try {
            const regex = new RegExp(searchQuery, 'i');
            return regex.test(file.name);
        } catch (e) {
            return file.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDirection('asc'); }
    };

    const loadFiles = useCallback(async (path: string, addToHistory = true) => {
        setLoading(true);
        setError(null);
        try {
            const response = await invoke<CommandResponse<FileEntry[]>>("ssh_sftp_ls", {
                sessionId,
                path,
            });

            if (response.success && response.data) {
                setFiles(response.data);
                setCurrentPath(path);
                
                // Track visited paths for autocomplete
                if (!visitedPaths.includes(path)) {
                    setVisitedPaths(prev => [...new Set([...prev, path])].slice(-50)); // Keep last 50
                }

                // Handle History
                if (addToHistory) {
                    const newHistory = history.slice(0, historyIndex + 1);
                    if (newHistory[newHistory.length - 1] !== path) {
                        newHistory.push(path);
                        setHistory(newHistory);
                        setHistoryIndex(newHistory.length - 1);
                    }
                }
            } else {
                setError(response.error || "Failed to list files");
            }
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }, [sessionId, history, historyIndex, visitedPaths]);

    // Initial load - try to get home path if possible, else default to .
    useEffect(() => {
        loadFiles(".");
    }, [sessionId]); // Only on session change

    // Sync input with currentPath
    useEffect(() => {
        setTempPath(currentPath);
    }, [currentPath]);

    // Persist visited paths to localStorage
    useEffect(() => {
        localStorage.setItem("safar_visited_paths", JSON.stringify(visitedPaths));
    }, [visitedPaths]);

    const handleNavigate = (entry: FileEntry) => {
        if (entry.is_dir) {
            const newPath = currentPath === "." || currentPath === "/" 
                ? (currentPath === "/" ? `/${entry.name}` : entry.name)
                : `${currentPath}/${entry.name}`;
            loadFiles(newPath);
        } else {
            const fullPath = currentPath === "." || currentPath === "/"
                ? (currentPath === "/" ? `/${entry.name}` : entry.name)
                : `${currentPath}/${entry.name}`;
            setEditingFile(fullPath);
        }
    };

    const handleUp = () => {
        if (currentPath === "." || currentPath === "/") return;
        const parts = currentPath.split("/");
        parts.pop();
        const newPath = parts.length === 0 ? "/" : parts.join("/");
        loadFiles(newPath === "" ? "/" : newPath);
    };

    const goBack = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            loadFiles(history[newIndex], false);
        }
    };

    const goForward = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            loadFiles(history[newIndex], false);
        }
    };

    const goHome = () => {
        loadFiles(homePath);
    };

    const removeVisitedPath = (path: string) => {
        setVisitedPaths(prev => prev.filter(p => p !== path));
    };

    const handleDownload = async (file: FileEntry) => {
        if (file.is_dir) return;
        try {
            const localPath = await save({ defaultPath: file.name });
            if (!localPath) return;
            const remotePath = currentPath === "." ? file.name : `${currentPath}/${file.name}`;
            await invoke("ssh_sftp_read", { sessionId, remotePath, localPath });
        } catch (err) {
            setError(`Download failed: ${err}`);
        }
    };

    const handleUpload = async () => {
        try {
            const result = await openDialog({ multiple: false, directory: false });
            if (!result) return;
            const localPath = result as string;
            const fileName = localPath.split(/[\\/]/).pop() || "upload";
            const remotePath = currentPath === "." ? fileName : `${currentPath}/${fileName}`;
            await invoke("ssh_sftp_write", { sessionId, localPath, remotePath });
            loadFiles(currentPath);
        } catch (err) {
            setError(`Upload failed: ${err}`);
        }
    };

    return {
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
        visitedPaths,
        canGoBack: historyIndex > 0,
        canGoForward: historyIndex < history.length - 1,
        goBack,
        goForward,
        goHome,
        handleSort,
        loadFiles,
        handleNavigate,
        handleUp,
        handleDownload,
        handleUpload,
        removeVisitedPath
    };
}
