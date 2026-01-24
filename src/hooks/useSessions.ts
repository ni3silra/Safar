// Session hooks for managing saved sessions
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// Types matching Rust storage.rs
export interface SavedSession {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_type: "password" | "privatekey" | "agent";
    private_key_path?: string;
    is_favorite: boolean;
    group?: string;
    last_connected?: string;
    notes?: string;
}

interface CommandResponse<T> {
    success: boolean;
    data: T | null;
    error: string | null;
}

export function useSessions() {
    const [sessions, setSessions] = useState<SavedSession[]>([]);
    const [favorites, setFavorites] = useState<SavedSession[]>([]);
    const [recent, setRecent] = useState<SavedSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load all session data
    const loadSessions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [allRes, favRes, recentRes] = await Promise.all([
                invoke<CommandResponse<SavedSession[]>>("sessions_get_all"),
                invoke<CommandResponse<SavedSession[]>>("sessions_get_favorites"),
                invoke<CommandResponse<SavedSession[]>>("sessions_get_recent"),
            ]);

            if (allRes.success && allRes.data) {
                setSessions(allRes.data);
            }
            if (favRes.success && favRes.data) {
                setFavorites(favRes.data);
            }
            if (recentRes.success && recentRes.data) {
                setRecent(recentRes.data);
            }
        } catch (err) {
            console.error("[Sessions] Load failed:", err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    // Save a session
    const saveSession = useCallback(
        async (session: Partial<SavedSession> & { name: string; host: string; port: number; username: string }) => {
            try {
                const toSave: SavedSession = {
                    id: session.id || "",
                    name: session.name,
                    host: session.host,
                    port: session.port,
                    username: session.username,
                    auth_type: session.auth_type || "password",
                    private_key_path: session.private_key_path,
                    is_favorite: session.is_favorite || false,
                    group: session.group,
                    notes: session.notes,
                };

                const res = await invoke<CommandResponse<SavedSession>>("sessions_save", {
                    session: toSave,
                });

                if (res.success && res.data) {
                    await loadSessions();
                    return res.data;
                } else {
                    throw new Error(res.error || "Failed to save session");
                }
            } catch (err) {
                console.error("[Sessions] Save failed:", err);
                throw err;
            }
        },
        [loadSessions]
    );

    // Delete a session
    const deleteSession = useCallback(
        async (sessionId: string) => {
            try {
                const res = await invoke<CommandResponse<void>>("sessions_delete", {
                    sessionId,
                });

                if (res.success) {
                    await loadSessions();
                } else {
                    throw new Error(res.error || "Failed to delete session");
                }
            } catch (err) {
                console.error("[Sessions] Delete failed:", err);
                throw err;
            }
        },
        [loadSessions]
    );

    // Toggle favorite
    const toggleFavorite = useCallback(
        async (sessionId: string) => {
            try {
                const res = await invoke<CommandResponse<boolean>>("sessions_toggle_favorite", {
                    sessionId,
                });

                if (res.success) {
                    await loadSessions();
                    return res.data;
                } else {
                    throw new Error(res.error || "Failed to toggle favorite");
                }
            } catch (err) {
                console.error("[Sessions] Toggle favorite failed:", err);
                throw err;
            }
        },
        [loadSessions]
    );

    // Add to recent (call when connecting)
    const addToRecent = useCallback(
        async (sessionId: string) => {
            try {
                await invoke<CommandResponse<void>>("sessions_add_recent", {
                    sessionId,
                });
                await loadSessions();
            } catch (err) {
                console.error("[Sessions] Add recent failed:", err);
            }
        },
        [loadSessions]
    );

    // Load on mount
    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    return {
        sessions,
        favorites,
        recent,
        loading,
        error,
        loadSessions,
        saveSession,
        deleteSession,
        toggleFavorite,
        addToRecent,
    };
}

export default useSessions;
