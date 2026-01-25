import { useState } from "react";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Icons } from "./Icons";

interface QuickConnectModalProps {
    onClose: () => void;
    onConnect: (config: {
        host: string;
        port: number;
        username: string;
        password: string;
        privateKeyPath?: string | null;
        sessionName: string;
        termType?: string;
        remoteCommand?: string;
    }, saveSession?: boolean, saveFavorite?: boolean) => void;
    initialConfig?: {
        host: string;
        port: number;
        username: string;
        sessionName: string;
        password?: string;
        privateKeyPath?: string | null;
        remoteCommand?: string;
        termType?: string;
    };
    mode?: "connect" | "edit";
}

export function QuickConnectModal({ onClose, onConnect, initialConfig, mode = "connect" }: QuickConnectModalProps) {
    const [host, setHost] = useState(initialConfig?.host || "");
    const [port, setPort] = useState(initialConfig?.port || 22);
    const [username, setUsername] = useState(initialConfig?.username || "");
    const [password, setPassword] = useState(initialConfig?.password || "");
    const [privateKeyPath, setPrivateKeyPath] = useState<string | null>(initialConfig?.privateKeyPath || null);
    const [sessionName, setSessionName] = useState(initialConfig?.sessionName || "");
    const [saveForLater, setSaveForLater] = useState(mode === "edit");
    const [addToFavorites, setAddToFavorites] = useState(false); // Can be passed if needed

    // PuTTY-style Advanced Options
    const [showAdvanced, setShowAdvanced] = useState(!!(initialConfig?.remoteCommand || initialConfig?.termType));
    const [remoteCommand, setRemoteCommand] = useState(initialConfig?.remoteCommand || "");
    const [backspaceMode, setBackspaceMode] = useState<"auto" | "ctrl-h" | "ctrl-?">("auto");
    const [terminalType, setTerminalType] = useState(initialConfig?.termType || "xterm-256color");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConnect({
            host,
            port,
            username,
            password,
            privateKeyPath,
            sessionName,
            termType: terminalType,
            remoteCommand: remoteCommand || undefined,
        }, saveForLater, addToFavorites);
    };

    const handleSelectKey = async () => {
        try {
            const file = await openDialog({
                multiple: false,
                filters: [{ name: 'Key Files', extensions: ['pem', 'ppk', 'key', 'txt', 'pub', '*'] }]
            });
            if (file) {
                setPrivateKeyPath(file as string);
                setPassword(""); // Clear password if selecting key
            }
        } catch (e) {
            console.error("Failed to select key", e);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
                <div className="modal-header">
                    <h2 className="modal-title">{mode === "edit" ? "Edit Session" : "New SSH Connection"}</h2>
                    <button className="icon-btn" onClick={onClose}>
                        <Icons.X />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                        <div className="form-group">
                            <label className="form-label">Session Name</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="My Server"
                                value={sessionName}
                                onChange={(e) => setSessionName(e.target.value)}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Hostname / IP</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="192.168.1.1"
                                    value={host}
                                    onChange={(e) => setHost(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group" style={{ maxWidth: "100px" }}>
                                <label className="form-label">Port</label>
                                <input
                                    type="number"
                                    className="input"
                                    placeholder="22"
                                    value={port}
                                    onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Username</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="root"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                                type="password"
                                className="input"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Leave empty if using key auth</span>
                        </div>

                        <div className="form-group">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <label className="form-label">Private Key Path</label>
                                {privateKeyPath && (
                                    <button
                                        type="button"
                                        onClick={() => setPrivateKeyPath(null)}
                                        style={{ background: "none", border: "none", color: "var(--accent-error)", cursor: "pointer", fontSize: "11px" }}
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="C:\Users\...\.ssh\id_rsa or paste path"
                                    value={privateKeyPath || ""}
                                    onChange={(e) => setPrivateKeyPath(e.target.value || null)}
                                    style={{ flex: 1 }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleSelectKey}
                                    style={{ padding: "0 12px" }}
                                    title="Browse for key file"
                                >
                                    <Icons.Folder />
                                </button>
                            </div>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Supports PEM, PPK, OpenSSH formats</span>
                        </div>

                        {/* Advanced Options Toggle */}
                        <div style={{
                            marginTop: "var(--space-4)",
                            borderTop: "1px solid var(--border-color)",
                            paddingTop: "var(--space-3)"
                        }}>
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "0"
                                }}
                            >
                                <Icons.Settings /> Advanced Options
                                <span style={{ transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
                            </button>
                        </div>

                        {showAdvanced && (
                            <div style={{
                                marginTop: "var(--space-3)",
                                padding: "var(--space-3)",
                                background: "var(--bg-secondary)",
                                borderRadius: "8px",
                                border: "1px solid var(--border-color)"
                            }}>
                                {/* Remote Command */}
                                <div className="form-group">
                                    <label className="form-label">Remote Command (optional)</label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="e.g. sudo su - or /bin/bash"
                                        value={remoteCommand}
                                        onChange={(e) => setRemoteCommand(e.target.value)}
                                    />
                                    <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>Run command instead of shell after login</span>
                                </div>

                                {/* Terminal Type */}
                                <div className="form-group" style={{ marginTop: "var(--space-3)" }}>
                                    <label className="form-label">Terminal Type</label>
                                    <select
                                        className="input"
                                        value={terminalType}
                                        onChange={(e) => setTerminalType(e.target.value)}
                                        style={{ width: "100%" }}
                                    >
                                        <option value="xterm-256color">xterm-256color (Default)</option>
                                        <option value="xterm">xterm</option>
                                        <option value="vt100">vt100</option>
                                        <option value="TN6530">TN6530 (HP NonStop)</option>
                                        <option value="vt220">vt220</option>
                                        <option value="linux">linux</option>
                                        <option value="dumb">dumb</option>
                                    </select>
                                </div>

                                {/* Backspace Mode */}
                                <div className="form-group" style={{ marginTop: "var(--space-3)" }}>
                                    <label className="form-label">Backspace Sends</label>
                                    <select
                                        className="input"
                                        value={backspaceMode}
                                        onChange={(e) => setBackspaceMode(e.target.value as "auto" | "ctrl-h" | "ctrl-?")}
                                        style={{ width: "100%" }}
                                    >
                                        <option value="auto">Auto (Server decides)</option>
                                        <option value="ctrl-h">Control-H (^H, ASCII 8)</option>
                                        <option value="ctrl-?">Control-? (^?, ASCII 127)</option>
                                    </select>
                                    <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>Fix backspace issues with some servers</span>
                                </div>
                            </div>
                        )}

                        {/* Save Session Options - Hide in edit mode or show differently */}
                        {mode === "connect" && (
                            <div style={{
                                marginTop: "var(--space-4)",
                                padding: "var(--space-3)",
                                background: "var(--bg-secondary)",
                                borderRadius: "8px",
                                border: "1px solid var(--border-color)"
                            }}>
                                <label style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    cursor: "pointer"
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={saveForLater}
                                        onChange={(e) => setSaveForLater(e.target.checked)}
                                        style={{
                                            width: "18px",
                                            height: "18px",
                                            accentColor: "var(--col-blue)"
                                        }}
                                    />
                                    <span style={{ fontSize: "14px", fontWeight: 500 }}>Save this connection for later</span>
                                </label>

                                {saveForLater && (
                                    <label style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "12px",
                                        cursor: "pointer",
                                        marginTop: "12px",
                                        marginLeft: "30px"
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={addToFavorites}
                                            onChange={(e) => setAddToFavorites(e.target.checked)}
                                            style={{
                                                width: "18px",
                                                height: "18px",
                                                accentColor: "var(--col-yellow)"
                                            }}
                                        />
                                        <Icons.Star style={{ width: 16, height: 16, color: addToFavorites ? "var(--col-yellow)" : "var(--text-muted)" }} />
                                        <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Add to favorites</span>
                                    </label>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {mode === "edit" ? "Save Changes" : "Connect"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
