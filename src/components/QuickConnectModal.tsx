import { useState } from "react";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, mkdir, BaseDirectory, exists } from '@tauri-apps/plugin-fs';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
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
        backspaceMode?: string;
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
        backspaceMode?: string;
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

    // Tab state
    const [activeTab, setActiveTab] = useState<"basic" | "security" | "advanced">("basic");

    // Security Logic
    const [keyMode, setKeyMode] = useState<"file" | "paste">("file");
    const [pastedKey, setPastedKey] = useState("");

    // Advanced Options
    const [remoteCommand, setRemoteCommand] = useState(initialConfig?.remoteCommand || "");
    const [backspaceMode, setBackspaceMode] = useState(initialConfig?.backspaceMode as "auto" | "ctrl-h" | "ctrl-?" || "auto");
    const [terminalType, setTerminalType] = useState(initialConfig?.termType || "xterm-256color");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let finalKeyPath = privateKeyPath;

        // Handle Pasted Key
        if (keyMode === "paste" && pastedKey.trim()) {
            try {
                // Ensure keys directory exists
                const appData = await appLocalDataDir();
                const keysDir = await join(appData, "keys");
                const dirExists = await exists("keys", { baseDir: BaseDirectory.AppLocalData });

                if (!dirExists) {
                    await mkdir("keys", { baseDir: BaseDirectory.AppLocalData, recursive: true });
                }

                // Create filename
                const safeName = sessionName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unnamed";
                const filename = `key_${safeName}_${Date.now()}.pem`;
                const filePath = await join(keysDir, filename);

                // Write file
                await writeTextFile(`keys/${filename}`, pastedKey, { baseDir: BaseDirectory.AppLocalData });
                finalKeyPath = filePath;

            } catch (err) {
                console.error("Failed to save pasted key:", err);
                alert("Failed to save pasted key: " + String(err));
                return;
            }
        }

        onConnect({
            host,
            port,
            username,
            password,
            privateKeyPath: finalKeyPath,
            sessionName,
            termType: terminalType,
            remoteCommand: remoteCommand || undefined,
            backspaceMode: backspaceMode,
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
                setPastedKey("");
                setKeyMode("file");
                setPassword(""); // Clear password if selecting key
            }
        } catch (e) {
            console.error("Failed to select key", e);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "550px", display: "flex", flexDirection: "column", height: "auto", maxHeight: "85vh" }}>
                <div className="modal-header">
                    <h2 className="modal-title">{mode === "edit" ? "Edit Session" : "New SSH Connection"}</h2>
                    <button className="icon-btn" onClick={onClose}>
                        <Icons.X />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", padding: "0 16px" }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab("basic")}
                        style={{
                            padding: "10px 16px",
                            background: "none",
                            border: "none",
                            borderBottom: activeTab === "basic" ? "2px solid var(--col-blue)" : "2px solid transparent",
                            color: activeTab === "basic" ? "var(--text-primary)" : "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500
                        }}
                    >
                        Basic
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("security")}
                        style={{
                            padding: "10px 16px",
                            background: "none",
                            border: "none",
                            borderBottom: activeTab === "security" ? "2px solid var(--col-blue)" : "2px solid transparent",
                            color: activeTab === "security" ? "var(--text-primary)" : "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500
                        }}
                    >
                        Security
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("advanced")}
                        style={{
                            padding: "10px 16px",
                            background: "none",
                            border: "none",
                            borderBottom: activeTab === "advanced" ? "2px solid var(--col-blue)" : "2px solid transparent",
                            color: activeTab === "advanced" ? "var(--text-primary)" : "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500
                        }}
                    >
                        Advanced
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div className="modal-body" style={{ flex: 1, overflowY: "auto" }}>

                        {activeTab === "basic" && (
                            <>
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


                                {/* Save Session Options - Always visible in Basic tab for ease */}
                                {mode === "connect" && (
                                    <div style={{
                                        marginTop: "var(--space-4)",
                                        padding: "var(--space-4)",
                                        background: "var(--bg-secondary)",
                                        borderRadius: "8px",
                                        border: "1px solid var(--border-subtle)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between"
                                    }}>
                                        {/* Main Toggle */}
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                className="toggle-input"
                                                checked={saveForLater}
                                                onChange={(e) => setSaveForLater(e.target.checked)}
                                            />
                                            <div className="toggle-slider"></div>
                                            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Save Connection</span>
                                        </label>

                                        {/* Favorite Checkbox (Only visible if Save is checked) */}
                                        {saveForLater && (
                                            <div className="animate-fade-in">
                                                <label className="custom-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={addToFavorites}
                                                        onChange={(e) => setAddToFavorites(e.target.checked)}
                                                    />
                                                    <div className="checkbox-box"></div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        <Icons.Star style={{ width: 14, height: 14, color: addToFavorites ? "var(--accent-warning)" : "currentColor" }} />
                                                        <span>Favorite</span>
                                                    </div>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}


                        {activeTab === "security" && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Password</label>
                                    <input
                                        type="password"
                                        className="input"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={!!privateKeyPath || (keyMode === "paste" && pastedKey.length > 0)}
                                    />
                                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Disabled if using Private Key</span>
                                </div>

                                <div style={{ height: "1px", background: "var(--border-color)", margin: "20px 0" }} />

                                <div className="form-group">
                                    <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        Private Key
                                        <div style={{ display: "flex", background: "var(--bg-secondary)", borderRadius: "6px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
                                            <button
                                                type="button"
                                                onClick={() => setKeyMode("file")}
                                                style={{
                                                    padding: "4px 12px",
                                                    fontSize: "11px",
                                                    border: "none",
                                                    background: keyMode === "file" ? "var(--col-blue)" : "transparent",
                                                    color: keyMode === "file" ? "white" : "var(--text-secondary)",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                File
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setKeyMode("paste")}
                                                style={{
                                                    padding: "4px 12px",
                                                    fontSize: "11px",
                                                    border: "none",
                                                    background: keyMode === "paste" ? "var(--col-blue)" : "transparent",
                                                    color: keyMode === "paste" ? "white" : "var(--text-secondary)",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                Paste
                                            </button>
                                        </div>
                                    </label>

                                    {keyMode === "file" && (
                                        <>
                                            <div style={{ display: "flex", gap: "8px" }}>
                                                <input
                                                    type="text"
                                                    className="input"
                                                    placeholder="Browse for Private Key..."
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
                                            {privateKeyPath && (
                                                <button
                                                    type="button"
                                                    onClick={() => setPrivateKeyPath(null)}
                                                    style={{ background: "none", border: "none", color: "var(--accent-error)", cursor: "pointer", fontSize: "11px", marginTop: "4px" }}
                                                >
                                                    Clear Key
                                                </button>
                                            )}
                                        </>
                                    )}

                                    {keyMode === "paste" && (
                                        <div style={{ display: "flex", flexDirection: "column" }}>
                                            <textarea
                                                className="input"
                                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                                                value={pastedKey}
                                                onChange={(e) => setPastedKey(e.target.value)}
                                                style={{ height: "150px", fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
                                            />
                                            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                                                Key will be saved securely to app data.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}


                        {activeTab === "advanced" && (
                            <div style={{ padding: "4px 0" }}>
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
