import { CSSProperties } from "react";

// ============================================
// UI TYPES
// ============================================

export interface IconProps {
    style?: CSSProperties;
    className?: string;
}

export interface Session {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    connected: boolean;
    activeView: "terminal" | "files" | "tunnels" | "logs" | "stats";
    backspaceMode?: string;
}

export interface SavedSession {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    auth_type: "password" | "privatekey" | "agent";
    private_key_path?: string;
    is_favorite: boolean;
    group?: string;
    last_connected?: string;
    notes?: string;
    term_type?: string;
    remote_command?: string;
    backspace_mode?: string;
}

export interface LogEntry {
    id: string;
    timestamp: number;
    level: "info" | "error" | "warning" | "success";
    message: string;
    source: "SSH" | "SFTP" | "SYSTEM";
}

// ============================================
// API API TYPES
// ============================================

export interface ConnectConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    privateKeyPath?: string | null;
    sessionName: string;
    termType?: string;
    remoteCommand?: string;
    backspaceMode?: string;
}

export interface ConnectionResult {
    session_id: string;
    host: string;
    username: string;
    banner: string | null;
    // session_id: string; // duplicate in original? Removed.
}

export interface CommandResponse<T> {
    success: boolean;
    data: T | null;
    error: string | null;
}

// ============================================
// FILE BROWSER TYPES
// ============================================

export interface FileEntry {
    name: string;
    size: number;
    is_dir: boolean;
    modified: number;
    permissions: string;
}

export type SortField = 'name' | 'modified' | 'size';
export type SortDirection = 'asc' | 'desc';
