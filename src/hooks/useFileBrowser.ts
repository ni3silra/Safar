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

    // Displayed files (after applying search filter)
    const displayedFiles = sortedFiles.filter(file => {
        if (!searchQuery.trim()) return true;

        try {
            // Attempt to search as a case-insensitive regex
            const regex = new RegExp(searchQuery, 'i');
            return regex.test(file.name);
        } catch (e) {
            // If regex is invalid (e.g. user typing "["), fallback to standard string search
            return file.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const loadFiles = useCallback(async (path: string) => {
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

    // Sync input with currentPath
    useEffect(() => {
        setTempPath(currentPath);
    }, [currentPath]);

    const handleNavigate = (entry: FileEntry) => {
        if (entry.is_dir) {
            const newPath = currentPath === "." ? entry.name : `${currentPath}/${entry.name}`;
            loadFiles(newPath);
        } else {
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

    const handleDownload = async (file: FileEntry) => {
        if (file.is_dir) return;

        try {
            const localPath = await save({
                defaultPath: file.name,
            });

            if (!localPath) return;

            const remotePath = currentPath === "." ? file.name : `${currentPath}/${file.name}`;

            await invoke("ssh_sftp_read", {
                sessionId,
                remotePath,
                localPath
            });
        } catch (err) {
            setError(`Download failed: ${err}`);
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

            const fileName = localPath.split(/[\\/]/).pop() || "upload";
            const remotePath = currentPath === "." ? fileName : `${currentPath}/${fileName}`;

            await invoke("ssh_sftp_write", {
                sessionId,
                localPath,
                remotePath
            });

            // Note: because the command returns instantly now as it's async, 
            // the file might not be fully uploaded yet when loadFiles is called.
            // A perfect solution would refresh when the "completed" event arrives,
            // but this is fine to trigger the initial visual.
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
        sortedFiles,
        displayedFiles,
        handleSort,
        loadFiles,
        handleNavigate,
        handleUp,
        handleDownload,
        handleUpload
    };
}
