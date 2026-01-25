import { useState, useRef, useEffect } from "react";
import { open } from '@tauri-apps/plugin-dialog';
import { Icons } from "./Icons";

interface CredentialsModalProps {
    onClose: () => void;
    onSubmit: (password: string, privateKeyPath: string | null) => void;
    username: string;
    host: string;
    initialKeyPath?: string | null;
}

export function CredentialsModal({ onClose, onSubmit, username, host, initialKeyPath }: CredentialsModalProps) {
    const [password, setPassword] = useState("");
    const [privateKeyPath, setPrivateKeyPath] = useState<string | null>(initialKeyPath || null);
    const [showKeyInput, setShowKeyInput] = useState(false);

    // Focus password input on mount
    const passwordRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        passwordRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(password, privateKeyPath);
    };

    const handleBrowseKey = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Private Key',
                    extensions: ['pem', 'key', 'ppk', 'openssh', 'id_rsa']
                }]
            });
            if (selected) {
                setPrivateKeyPath(selected as string);
            }
        } catch (err) {
            console.error("Failed to browse key:", err);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
                <div className="modal-header">
                    <h2 className="modal-title">Authentication Required</h2>
                    <button className="icon-btn" onClick={onClose}>
                        <Icons.X />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-content">
                    <div style={{
                        marginBottom: "var(--space-4)",
                        color: "var(--text-secondary)",
                        fontSize: "var(--text-sm)",
                        background: "var(--bg-secondary)",
                        padding: "var(--space-3)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <Icons.Shield style={{ color: "var(--accent-warning)" }} />
                            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Credentials Needed</span>
                        </div>
                        Connecting to <strong>{username}@{host}</strong>
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <div className="input-group">
                            <span className="input-icon"><Icons.Lock /></span>
                            <input
                                ref={passwordRef}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input"
                                placeholder="Enter password..."
                            />
                        </div>
                    </div>

                    {!showKeyInput && !privateKeyPath && (
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setShowKeyInput(true)}
                            style={{ fontSize: "var(--text-xs)", padding: "0" }}
                        >
                            + Use Private Key
                        </button>
                    )}

                    {(showKeyInput || privateKeyPath) && (
                        <div className="form-group animate-fade-in" style={{ marginTop: "var(--space-3)" }}>
                            <label>Private Key</label>
                            <div className="file-input-wrapper">
                                <input
                                    type="text"
                                    value={privateKeyPath || ""}
                                    readOnly
                                    placeholder="No key selected"
                                    className="input"
                                />
                                <button type="button" className="btn btn-secondary" onClick={handleBrowseKey}>
                                    Browse
                                </button>
                                {privateKeyPath && (
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        onClick={() => setPrivateKeyPath(null)}
                                        title="Clear key"
                                    >
                                        <Icons.X />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="modal-footer" style={{ marginTop: "var(--space-4)" }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Connect
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
