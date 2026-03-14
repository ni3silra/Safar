import { useState } from "react";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, mkdir, BaseDirectory, exists } from '@tauri-apps/plugin-fs';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { toast } from 'sonner';
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

// Reusable styled label
function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: "var(--text-muted, #64748b)",
            marginBottom: "6px",
        }}>{children}</div>
    );
}

// Reusable styled input
function StyledInput({ style, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "var(--text-primary, #e2e8f0)",
                fontSize: "13px",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
                ...style,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"; props.onFocus?.(e); }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; props.onBlur?.(e); }}
        />
    );
}

// Reusable styled select
function StyledSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "var(--text-primary, #e2e8f0)",
                fontSize: "13px",
                outline: "none",
                cursor: "pointer",
                transition: "border-color 0.15s",
                appearance: "none",
            }}
        >
            {children}
        </select>
    );
}

const TABS = [
    { id: "basic", label: "Connection", icon: <Icons.Server style={{ width: 13, height: 13 }} /> },
    { id: "security", label: "Security", icon: <Icons.Shield style={{ width: 13, height: 13 }} /> },
    { id: "advanced", label: "Advanced", icon: <Icons.Settings style={{ width: 13, height: 13 }} /> },
] as const;

export function QuickConnectModal({ onClose, onConnect, initialConfig, mode = "connect" }: QuickConnectModalProps) {
    const [host, setHost] = useState(initialConfig?.host || "");
    const [port, setPort] = useState(initialConfig?.port || 22);
    const [username, setUsername] = useState(initialConfig?.username || "");
    const [password, setPassword] = useState(initialConfig?.password || "");
    const [showPassword, setShowPassword] = useState(false);
    const [privateKeyPath, setPrivateKeyPath] = useState<string | null>(initialConfig?.privateKeyPath || null);
    const [sessionName, setSessionName] = useState(initialConfig?.sessionName || "");
    const [saveForLater, setSaveForLater] = useState(mode === "edit");
    const [addToFavorites, setAddToFavorites] = useState(false);
    const [activeTab, setActiveTab] = useState<"basic" | "security" | "advanced">("basic");
    const [keyMode, setKeyMode] = useState<"password" | "file" | "paste">(
        initialConfig?.privateKeyPath ? "file" : "password"
    );
    const [pastedKey, setPastedKey] = useState("");
    const [remoteCommand, setRemoteCommand] = useState(initialConfig?.remoteCommand || "");
    const [backspaceMode, setBackspaceMode] = useState(initialConfig?.backspaceMode as "auto" | "ctrl-h" | "ctrl-?" || "auto");
    const [terminalType, setTerminalType] = useState(initialConfig?.termType || "xterm-256color");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        let finalKeyPath = privateKeyPath;

        if (keyMode === "paste" && pastedKey.trim()) {
            try {
                const appData = await appLocalDataDir();
                const keysDir = await join(appData, "keys");
                const dirExists = await exists("keys", { baseDir: BaseDirectory.AppLocalData });
                if (!dirExists) await mkdir("keys", { baseDir: BaseDirectory.AppLocalData, recursive: true });

                const safeName = sessionName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unnamed";
                const filename = `key_${safeName}_${Date.now()}.pem`;
                const filePath = await join(keysDir, filename);
                await writeTextFile(`keys/${filename}`, pastedKey, { baseDir: BaseDirectory.AppLocalData });
                finalKeyPath = filePath;
            } catch (err) {
                toast.error("Failed to save pasted key: " + String(err));
                setIsSubmitting(false);
                return;
            }
        }

        try {
            onConnect({
                host,
                port,
                username,
                password: keyMode === "password" ? password : "",
                privateKeyPath: keyMode !== "password" ? finalKeyPath : null,
                sessionName: sessionName || `${username}@${host}`,
                termType: terminalType,
                remoteCommand: remoteCommand || undefined,
                backspaceMode,
            }, saveForLater, addToFavorites);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSelectKey = async () => {
        try {
            const file = await openDialog({
                multiple: false,
                filters: [{ name: 'Key Files', extensions: ['pem', 'ppk', 'key', 'txt', 'openssh', 'id_rsa'] }]
            });
            if (file) {
                setPrivateKeyPath(file as string);
                setKeyMode("file");
                setPassword("");
            }
        } catch {
            toast.error("Failed to select key file");
        }
    };

    const keyFilename = privateKeyPath ? privateKeyPath.split(/[/\\]/).pop() : null;
    const isEdit = mode === "edit";
    const canSubmit = host.trim() && username.trim() &&
        (keyMode === "password" ? true : keyMode === "paste" ? pastedKey.trim().length > 0 : !!privateKeyPath);

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-primary, system-ui)",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "520px",
                    maxHeight: "88vh",
                    background: "var(--bg-panel, #1a1d23)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "16px",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    animation: "slideUp 0.2s ease-out",
                }}
            >
                {/* Header */}
                <div style={{
                    padding: "22px 24px 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: "11px",
                            background: "rgba(59,130,246,0.12)",
                            border: "1px solid rgba(59,130,246,0.25)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            {isEdit
                                ? <Icons.Edit style={{ width: 18, height: 18, color: "#3b82f6" }} />
                                : <Icons.Terminal style={{ width: 18, height: 18, color: "#3b82f6" }} />
                            }
                        </div>
                        <div>
                            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary, #e2e8f0)" }}>
                                {isEdit ? "Edit Connection" : "New SSH Connection"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
                                {isEdit ? "Update your saved session settings" : "Connect to a remote SSH server"}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "transparent", border: "none", cursor: "pointer",
                            color: "var(--text-muted, #64748b)", padding: "6px",
                            borderRadius: "8px", display: "flex",
                            transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                        <Icons.X style={{ width: 16, height: 16 }} />
                    </button>
                </div>

                {/* Tab Bar */}
                <div style={{
                    display: "flex", gap: "4px",
                    padding: "16px 24px 0",
                    flexShrink: 0,
                }}>
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1,
                                padding: "9px 8px",
                                borderRadius: "8px",
                                border: activeTab === tab.id
                                    ? "1px solid rgba(59,130,246,0.4)"
                                    : "1px solid rgba(255,255,255,0.06)",
                                background: activeTab === tab.id
                                    ? "rgba(59,130,246,0.12)"
                                    : "rgba(255,255,255,0.025)",
                                color: activeTab === tab.id ? "#60a5fa" : "var(--text-muted, #64748b)",
                                fontSize: "12px",
                                fontWeight: activeTab === tab.id ? 600 : 400,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex", alignItems: "center",
                                justifyContent: "center", gap: "6px",
                            }}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Thin divider */}
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "14px 0 0 0", flexShrink: 0 }} />

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

                        {/* ─── CONNECTION TAB ─── */}
                        {activeTab === "basic" && (
                            <>
                                <div>
                                    <FieldLabel>Session Name</FieldLabel>
                                    <StyledInput
                                        type="text"
                                        placeholder={`${username || "user"}@${host || "server"}`}
                                        value={sessionName}
                                        onChange={(e) => setSessionName(e.target.value)}
                                    />
                                </div>

                                <div style={{ display: "flex", gap: "12px" }}>
                                    <div style={{ flex: 1 }}>
                                        <FieldLabel>Hostname / IP Address</FieldLabel>
                                        <StyledInput
                                            type="text"
                                            placeholder="192.168.1.100 or server.example.com"
                                            value={host}
                                            onChange={(e) => setHost(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <div style={{ width: "90px" }}>
                                        <FieldLabel>Port</FieldLabel>
                                        <StyledInput
                                            type="number"
                                            placeholder="22"
                                            value={port}
                                            onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                                            min={1} max={65535}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <FieldLabel>Username</FieldLabel>
                                    <StyledInput
                                        type="text"
                                        placeholder="root"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                    />
                                </div>

                                {/* Save / Favorite row */}
                                {!isEdit && (
                                    <div style={{
                                        padding: "12px 16px",
                                        background: "rgba(255,255,255,0.025)",
                                        border: "1px solid rgba(255,255,255,0.07)",
                                        borderRadius: "10px",
                                        display: "flex", alignItems: "center",
                                        justifyContent: "space-between",
                                    }}>
                                        <label style={{
                                            display: "flex", alignItems: "center", gap: "10px",
                                            cursor: "pointer", userSelect: "none",
                                        }}>
                                            <div
                                                onClick={() => setSaveForLater(!saveForLater)}
                                                style={{
                                                    width: 36, height: 20, borderRadius: "10px",
                                                    background: saveForLater ? "#3b82f6" : "rgba(255,255,255,0.1)",
                                                    border: "1px solid rgba(255,255,255,0.12)",
                                                    position: "relative", cursor: "pointer",
                                                    transition: "background 0.2s",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <div style={{
                                                    position: "absolute", top: 2,
                                                    left: saveForLater ? "calc(100% - 18px)" : "2px",
                                                    width: 14, height: 14, borderRadius: "50%",
                                                    background: "white",
                                                    transition: "left 0.2s",
                                                }} />
                                            </div>
                                            <span style={{ fontSize: "13px", color: "var(--text-primary, #e2e8f0)" }}>
                                                Save connection
                                            </span>
                                        </label>

                                        {saveForLater && (
                                            <label style={{
                                                display: "flex", alignItems: "center", gap: "7px",
                                                cursor: "pointer", userSelect: "none",
                                                fontSize: "13px", color: addToFavorites ? "#fbbf24" : "var(--text-muted, #64748b)",
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={addToFavorites}
                                                    onChange={(e) => setAddToFavorites(e.target.checked)}
                                                    style={{ display: "none" }}
                                                />
                                                <Icons.Star style={{ width: 14, height: 14, color: addToFavorites ? "#fbbf24" : "currentColor" }} />
                                                Add to Favorites
                                            </label>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* ─── SECURITY TAB ─── */}
                        {activeTab === "security" && (
                            <>
                                {/* Auth mode picker */}
                                <div style={{ display: "flex", gap: "8px" }}>
                                    {(["password", "file", "paste"] as const).map((m) => {
                                        const labels: Record<string, string> = { password: "Password", file: "Key File", paste: "Paste Key" };
                                        const icons: Record<string, React.ReactNode> = {
                                            password: <Icons.Lock style={{ width: 13, height: 13 }} />,
                                            file: <Icons.Key style={{ width: 13, height: 13 }} />,
                                            paste: <Icons.Copy style={{ width: 13, height: 13 }} />,
                                        };
                                        return (
                                            <button key={m} type="button" onClick={() => setKeyMode(m)}
                                                style={{
                                                    flex: 1, padding: "9px 6px",
                                                    borderRadius: "8px",
                                                    border: keyMode === m ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.07)",
                                                    background: keyMode === m ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.025)",
                                                    color: keyMode === m ? "#60a5fa" : "var(--text-muted, #64748b)",
                                                    fontSize: "12px", fontWeight: keyMode === m ? 600 : 400,
                                                    cursor: "pointer", transition: "all 0.15s",
                                                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                                                }}
                                            >
                                                {icons[m]}{labels[m]}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Password */}
                                {keyMode === "password" && (
                                    <div>
                                        <FieldLabel>Password</FieldLabel>
                                        <div style={{ position: "relative" }}>
                                            <StyledInput
                                                type={showPassword ? "text" : "password"}
                                                placeholder="Leave blank to be prompted on connect"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                style={{ paddingRight: "42px" }}
                                                autoFocus
                                            />
                                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                                style={{
                                                    position: "absolute", right: "12px", top: "50%",
                                                    transform: "translateY(-50%)",
                                                    background: "transparent", border: "none", cursor: "pointer",
                                                    color: "var(--text-muted, #64748b)", display: "flex",
                                                }}
                                                title={showPassword ? "Hide" : "Show"}
                                            >
                                                <Icons.Eye style={{ width: 15, height: 15 }} />
                                            </button>
                                        </div>
                                        <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                            Leave blank to be prompted when connecting.
                                        </p>
                                    </div>
                                )}

                                {/* Key File picker */}
                                {keyMode === "file" && (
                                    <div>
                                        <FieldLabel>Private Key File</FieldLabel>
                                        <div
                                            onClick={handleSelectKey}
                                            style={{
                                                padding: "14px 16px",
                                                background: "rgba(255,255,255,0.03)",
                                                border: `1px dashed ${privateKeyPath ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.13)"}`,
                                                borderRadius: "10px", cursor: "pointer",
                                                display: "flex", alignItems: "center", gap: "12px",
                                                transition: "all 0.15s",
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                                            onMouseLeave={(e) => e.currentTarget.style.borderColor = privateKeyPath ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.13)"}
                                        >
                                            <div style={{
                                                width: 34, height: 34, borderRadius: "8px",
                                                background: privateKeyPath ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
                                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                            }}>
                                                {privateKeyPath
                                                    ? <Icons.Check style={{ width: 15, height: 15, color: "#22c55e" }} />
                                                    : <Icons.Key style={{ width: 15, height: 15, color: "var(--text-muted, #64748b)" }} />
                                                }
                                            </div>
                                            <div style={{ flex: 1, overflow: "hidden" }}>
                                                <div style={{
                                                    fontSize: "13px",
                                                    color: privateKeyPath ? "#22c55e" : "var(--text-muted, #64748b)",
                                                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                                }}>
                                                    {keyFilename || "Click to select a key file…"}
                                                </div>
                                                {privateKeyPath && (
                                                    <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {privateKeyPath}
                                                    </div>
                                                )}
                                            </div>
                                            {privateKeyPath && (
                                                <button type="button" onClick={(e) => { e.stopPropagation(); setPrivateKeyPath(null); }}
                                                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", padding: "2px", display: "flex" }}
                                                    title="Remove"
                                                >
                                                    <Icons.X style={{ width: 13, height: 13 }} />
                                                </button>
                                            )}
                                        </div>
                                        <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                            Supported: .pem, .key, .ppk, .openssh, id_rsa
                                        </p>
                                    </div>
                                )}

                                {/* Paste key */}
                                {keyMode === "paste" && (
                                    <div>
                                        <FieldLabel>Paste Private Key</FieldLabel>
                                        <textarea
                                            placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                                            value={pastedKey}
                                            onChange={(e) => setPastedKey(e.target.value)}
                                            autoFocus
                                            style={{
                                                width: "100%",
                                                height: "160px",
                                                padding: "12px 14px",
                                                background: "rgba(255,255,255,0.04)",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                borderRadius: "8px",
                                                color: "var(--text-primary, #e2e8f0)",
                                                fontFamily: "var(--font-mono, monospace)",
                                                fontSize: "12px",
                                                resize: "vertical",
                                                outline: "none",
                                                boxSizing: "border-box",
                                            }}
                                            onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                                            onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                                        />
                                        <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                            Key will be saved securely to app data on connect.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ─── ADVANCED TAB ─── */}
                        {activeTab === "advanced" && (
                            <>
                                <div>
                                    <FieldLabel>Remote Command (optional)</FieldLabel>
                                    <StyledInput
                                        type="text"
                                        placeholder="e.g. sudo su -  or  /bin/bash"
                                        value={remoteCommand}
                                        onChange={(e) => setRemoteCommand(e.target.value)}
                                    />
                                    <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                        Executes instead of the default shell after login.
                                    </p>
                                </div>

                                <div>
                                    <FieldLabel>Terminal Type</FieldLabel>
                                    <StyledSelect value={terminalType} onChange={(e) => setTerminalType(e.target.value)}>
                                        <option value="xterm-256color">xterm-256color (Default)</option>
                                        <option value="xterm">xterm</option>
                                        <option value="vt100">vt100</option>
                                        <option value="vt220">vt220</option>
                                        <option value="TN6530">TN6530 (HP NonStop)</option>
                                        <option value="653X">653X (HP NonStop DBU)</option>
                                        <option value="TANDEM">TANDEM</option>
                                        <option value="linux">linux</option>
                                        <option value="dumb">dumb</option>
                                    </StyledSelect>
                                </div>

                                <div>
                                    <FieldLabel>Backspace Sends</FieldLabel>
                                    <StyledSelect value={backspaceMode} onChange={(e) => setBackspaceMode(e.target.value as any)}>
                                        <option value="auto">Auto (Server decides)</option>
                                        <option value="ctrl-h">Control-H (^H, ASCII 8)</option>
                                        <option value="ctrl-?">Control-? (^?, ASCII 127)</option>
                                    </StyledSelect>
                                    <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                        Fixes backspace issues with certain servers.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: "16px 24px",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        display: "flex",
                        gap: "10px",
                        flexShrink: 0,
                        background: "rgba(0,0,0,0.15)",
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                flex: 1, padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.08)",
                                background: "rgba(255,255,255,0.04)",
                                color: "var(--text-muted, #94a3b8)",
                                fontSize: "13px", fontWeight: 500, cursor: "pointer",
                                transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !canSubmit}
                            style={{
                                flex: 2, padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(59,130,246,0.4)",
                                background: "rgba(59,130,246,0.18)",
                                color: "#60a5fa",
                                fontSize: "13px", fontWeight: 600, cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                                opacity: (isSubmitting || !canSubmit) ? 0.5 : 1,
                            }}
                            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(59,130,246,0.28)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.18)"; }}
                        >
                            {isSubmitting
                                ? <><Icons.Loader style={{ width: 14, height: 14 }} /> Connecting…</>
                                : isEdit
                                    ? <><Icons.Check style={{ width: 14, height: 14 }} /> Save Changes</>
                                    : <><Icons.Zap style={{ width: 14, height: 14 }} /> Connect</>
                            }
                        </button>
                    </div>
                </form>
            </div>

            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(18px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}
