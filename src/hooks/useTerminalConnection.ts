import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from 'sonner';
import { Session, ConnectionResult, CommandResponse, SavedSession, LogEntry } from "../types";

// Define the arguments for the connect function
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
    savedSessionId?: string | null; // If set, updates this existing session instead of creating a new one
}

export interface UseTerminalConnectionProps {
    addLog: (sessionId: string, message: string, level: LogEntry["level"], source: LogEntry["source"]) => void;
    saveSession: (session: SavedSession) => Promise<SavedSession | undefined>;
    addToRecent: (id: string) => Promise<void>;
}

export function useTerminalConnection({ addLog, saveSession, addToRecent }: UseTerminalConnectionProps) {
    const [activeSessions, setActiveSessions] = useState<Session[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
    const [statusMessage, setStatusMessage] = useState("Disconnected");

    const derivedActiveSession = activeSessions.find(s => s.id === activeSessionId);

    const updateSessionView = (sessionId: string, view: Session["activeView"]) => {
        setActiveSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, activeView: view } : s))
        );
    };

    const updateSessionTitle = (sessionId: string, title: string) => {
        setActiveSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, dynamicTitle: title } : s))
        );
    };

    /**
     * Connects to an SSH server.
     * Returns true if connected successfully, false otherwise.
     * Throws an error object if authentication fails explicitly so the UI can prompt.
     */
    const connect = async (
        config: ConnectConfig,
        saveForLater?: boolean,
        addToFav?: boolean
    ): Promise<boolean> => {
        setConnectionStatus("connecting");
        setStatusMessage(`Connecting to ${config.host}...`);

        // Save session BEFORE attempting connection (so it saves even on auth failure)
        let savedSessionId: string | undefined;
        if (saveForLater) {
            try {
                const savedSession = await saveSession({
                    id: config.savedSessionId || "", // Use existing id to UPDATE rather than CREATE
                    name: config.sessionName || `${config.username}@${config.host}`,
                    host: config.host,
                    port: config.port,
                    username: config.username,
                    auth_type: config.privateKeyPath ? "privatekey" : "password",
                    private_key_path: config.privateKeyPath || undefined,
                    is_favorite: addToFav || false,
                    backspace_mode: config.backspaceMode,
                    term_type: config.termType,
                    remote_command: config.remoteCommand,
                    password: config.password, // Save password if provided
                } as SavedSession);

                savedSessionId = savedSession?.id;
            } catch (err) {
                toast.error("Failed to save session");
            }
        }

        try {
            const response = await invoke<CommandResponse<ConnectionResult>>("ssh_connect", {
                params: {
                    host: config.host,
                    port: config.port,
                    username: config.username,
                    password: config.password || null,
                    private_key_path: config.privateKeyPath || null,
                    session_name: config.sessionName || `${config.username}@${config.host}`,
                    term_type: config.termType || null,
                    remote_command: config.remoteCommand || null,
                    backspace_mode: config.backspaceMode || null,
                },
            });



            if (response.success && response.data) {
                const newSession: Session = {
                    id: response.data.session_id,
                    name: config.sessionName || `${config.username}@${config.host}`,
                    host: config.host,
                    port: config.port,
                    username: config.username,
                    connected: true,
                    activeView: "terminal",
                    backspaceMode: config.backspaceMode,
                };
                setActiveSessions((prev) => [...prev, newSession]);
                setActiveSessionId(newSession.id);
                setConnectionStatus("connected");
                setStatusMessage(`Connected to ${config.username}@${config.host}`);

                addLog(newSession.id, `Connected to ${response.data.host}`, "success", "SSH");
                if (response.data.banner) addLog(newSession.id, `Banner: ${response.data.banner}`, "info", "SSH");

                if (savedSessionId) {
                    addToRecent(savedSessionId);
                }

                return true;
            } else {
                setConnectionStatus("disconnected");
                const errStr = response.error || "Unknown connection error";
                setStatusMessage(`Failed: ${errStr}`);

                // Always re-prompt for credentials on any auth failure
                // (wrong password, bad key, or no credentials provided)
                const errLower = errStr.toLowerCase();
                const isAuthError =
                    errLower.includes("authentication failed") ||
                    errLower.includes("no authentication method") ||
                    errLower.includes("permission denied") ||
                    errLower.includes("userauth") ||
                    errLower.includes("auth");

                if (isAuthError) {
                    throw new Error("AUTH_REQUIRED");
                }

                throw new Error(errStr);
            }
        } catch (error) {
            const errStr = String(error);
            // Re-throw known auth signal so App.tsx shows the credentials modal
            if (errStr === "Error: AUTH_REQUIRED" || (error instanceof Error && error.message === "AUTH_REQUIRED")) {
                throw error;
            }

            setConnectionStatus("disconnected");
            if (error instanceof Error) {
                setStatusMessage(`Error: ${error.message}`);
            } else {
                setStatusMessage(`Error: ${errStr}`);
            }

            // Catch auth errors surfaced as JS exceptions too
            const errLower = errStr.toLowerCase();
            const isAuthErr =
                errLower.includes("authentication failed") ||
                errLower.includes("no authentication method") ||
                errLower.includes("permission denied") ||
                errLower.includes("userauth");

            if (isAuthErr) {
                throw new Error("AUTH_REQUIRED");
            }

            // Re-throw so App.tsx can show error modal
            throw error;
        }
    };

    const disconnect = async (sessionId: string) => {
        try {
            await invoke<CommandResponse<void>>("ssh_disconnect", { sessionId });
            setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
            if (activeSessionId === sessionId) {
                setActiveSessionId(null);
                setConnectionStatus("disconnected");
                setStatusMessage("Disconnected");
            }
        } catch (error) {
            toast.error(`Disconnect failed: ${error}`);
        }
    };

    return {
        activeSessions,
        activeSessionId,
        setActiveSessionId,
        connectionStatus,
        statusMessage,
        derivedActiveSession,
        updateSessionView,
        updateSessionTitle,
        connect,
        disconnect
    };
}
