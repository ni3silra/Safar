import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Icons } from "./Icons";

interface Props {
    onStatusChange?: () => void;
}

export function SecuritySettings({ onStatusChange }: Props) {
    const [hasPassword, setHasPassword] = useState(false);
    const [loading, setLoading] = useState(true);

    // Form states
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showForms, setShowForms] = useState<"none" | "set" | "remove">("none");

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        try {
            const res = await invoke<any>("storage_has_password");
            if (res.success) {
                setHasPassword(res.data);
            }
        } catch (e) {
            console.error("Failed to check security status:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        if (newPassword.length < 4) {
            toast.error("Password must be at least 4 characters");
            return;
        }

        try {
            const res = await invoke<any>("storage_set_password", { password: newPassword });
            if (res.success) {
                toast.success("Master password set successfully");
                setHasPassword(true);
                setShowForms("none");
                setNewPassword("");
                setConfirmPassword("");
                if (onStatusChange) onStatusChange();
            } else {
                toast.error("Failed to set password: " + res.error);
            }
        } catch (e) {
            toast.error("Error setting password");
        }
    };

    const handleRemovePassword = async () => {
        if (!confirm("Are you sure? Your data will be decrypted and stored in plain text.")) return;

        try {
            const res = await invoke<any>("storage_remove_password");
            if (res.success) {
                toast.success("Master password removed");
                setHasPassword(false);
                setShowForms("none");
                if (onStatusChange) onStatusChange();
            } else {
                toast.error("Failed to remove password: " + res.error);
            }
        } catch (e) {
            toast.error("Error removing password");
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            <div style={{ marginBottom: "16px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Encryption</h3>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                    Protect your saved sessions, passwords, and private key paths with a master password.
                </p>

                <div style={{
                    padding: "12px",
                    borderRadius: "6px",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {hasPassword ? (
                            <Icons.Shield style={{ color: "var(--col-green)" }} />
                        ) : (
                            <Icons.Shield style={{ color: "var(--text-muted)" }} />
                        )}
                        <div>
                            <div style={{ fontWeight: 500, fontSize: "13px" }}>
                                {hasPassword ? "Storage Encrypted" : "Storage Unencrypted"}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                {hasPassword ? "Your data is secure" : "Data stored in plain text"}
                            </div>
                        </div>
                    </div>

                    {hasPassword ? (
                        <button
                            className="btn btn-secondary"
                            style={{ fontSize: "12px", color: "var(--accent-error)", borderColor: "var(--accent-error)" }}
                            onClick={() => handleRemovePassword()}
                        >
                            Remove Password
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary"
                            style={{ fontSize: "12px" }}
                            onClick={() => setShowForms("set")}
                            disabled={showForms === "set"}
                        >
                            Set Password
                        </button>
                    )}
                </div>
            </div>

            {showForms === "set" && !hasPassword && (
                <form onSubmit={handleSetPassword} style={{
                    marginTop: "16px",
                    padding: "12px",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px"
                }}>
                    <h4 style={{ fontSize: "13px", marginBottom: "12px" }}>Set Master Password</h4>
                    <div className="form-group">
                        <label className="form-label">New Password</label>
                        <input
                            type="password"
                            className="input"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Confirm Password</label>
                        <input
                            type="password"
                            className="input"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                        />
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Enable Encryption</button>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowForms("none")}>Cancel</button>
                    </div>
                </form>
            )}
        </div>
    );
}
