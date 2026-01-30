import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from 'sonner';

interface LockScreenProps {
    onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
    const [mode, setMode] = useState<"loading" | "setup" | "unlock">("loading");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        try {
            const hasPassword = await invoke<boolean>("storage_has_password");

            if (!hasPassword) {
                // No password set, auto-unlock without forcing setup
                onUnlock();
            } else {
                const isLocked = await invoke<boolean>("storage_is_locked");

                if (isLocked) {
                    setMode("unlock");
                } else {
                    onUnlock();
                }
            }
        } catch (err) {
            toast.error("Failed to check security status");
            setError("Failed to check security status");
        }
    };

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        try {
            const success = await invoke<boolean>("storage_unlock", { password });
            if (success) {
                onUnlock();
            } else {
                setError("Incorrect password");
                setPassword("");
            }
        } catch (err) {
            setError("Unlock failed: " + String(err));
        }
    };

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }

        try {
            await invoke("storage_set_password", { password });
            toast.success("Vault secured!");
            onUnlock();
        } catch (err) {
            setError("Setup failed: " + String(err));
        }
    };

    if (mode === "loading") {
        return (
            <div className="lock-screen">
                <div className="lock-container">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="lock-screen" style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "var(--bg-primary)", zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center"
        }}>
            <div style={{
                background: "var(--bg-secondary)", padding: "40px", borderRadius: "12px",
                width: "100%", maxWidth: "400px", border: "1px solid var(--border-color)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
            }}>
                <div style={{ textAlign: "center", marginBottom: "30px" }}>
                    <div style={{ fontSize: "48px", marginBottom: "20px" }}>🔐</div>
                    <h2 style={{ margin: 0 }}>{mode === "setup" ? "Secure Your Journey" : "Welcome Back"}</h2>
                    <p style={{ color: "var(--text-muted)", marginTop: "10px" }}>
                        {mode === "setup"
                            ? "Set a master password to encrypt your sessions."
                            : "Enter your master password to unlock."}
                    </p>
                </div>

                <form onSubmit={mode === "setup" ? handleSetup : handleUnlock}>
                    <div style={{ marginBottom: "20px" }}>
                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px" }}>Password</label>
                        <input
                            type="password"
                            className="input"
                            autoFocus
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={mode === "setup" ? "Minimum 8 characters" : "Master Password"}
                            style={{ width: "100%", padding: "12px" }}
                        />
                    </div>

                    {mode === "setup" && (
                        <div style={{ marginBottom: "20px" }}>
                            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px" }}>Confirm Password</label>
                            <input
                                type="password"
                                className="input"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                placeholder="Repeat password"
                                style={{ width: "100%", padding: "12px" }}
                            />
                        </div>
                    )}

                    {error && (
                        <div style={{
                            color: "var(--col-red)", marginBottom: "20px",
                            fontSize: "14px", background: "rgba(220, 38, 38, 0.1)",
                            padding: "10px", borderRadius: "6px"
                        }}>
                            {error}
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "12px", fontSize: "16px" }}>
                        {mode === "setup" ? "Create Vault" : "Unlock"}
                    </button>
                </form>
            </div>
        </div>
    );
}
