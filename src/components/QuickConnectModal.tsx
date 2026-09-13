import { useState } from "react";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, mkdir, BaseDirectory, exists } from '@tauri-apps/plugin-fs';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { toast } from 'sonner';
import { Icons } from "./Icons";
import { ConnectConfig } from "../types";

interface QuickConnectModalProps {
    onClose: () => void;
    onConnect: (config: ConnectConfig, saveSession?: boolean, saveFavorite?: boolean) => void;
    initialConfig?: Partial<ConnectConfig> & {
        host: string;
        port: number;
        username: string;
        sessionName: string;
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
    const isInitialNonStop = Boolean(
        initialConfig?.isNonStop ||
        initialConfig?.protocol === "telnet" ||
        initialConfig?.termType === "6530" ||
        initialConfig?.termType === "t6530" ||
        initialConfig?.termType === "TN6530-8" ||
        (initialConfig?.termType ? initialConfig.termType.toLowerCase().includes("6530") : false)
    );

    const [connectionMode, setConnectionMode] = useState<"standard" | "nonstop">(
        isInitialNonStop ? "nonstop" : "standard"
    );
    const [protocol, setProtocol] = useState<"telnet" | "ssh">(
        initialConfig?.protocol || (isInitialNonStop ? "telnet" : "ssh")
    );
    const [serviceName, setServiceName] = useState(
        initialConfig?.serviceName || "TACL"
    );
    const [host, setHost] = useState(initialConfig?.host || "");
    const [port, setPort] = useState(
        initialConfig?.port || (isInitialNonStop ? (initialConfig?.protocol === "ssh" ? 22 : 23) : 22)
    );
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
    const [backspaceMode, setBackspaceMode] = useState<"auto" | "ctrl-h" | "ctrl-?">(
        (initialConfig?.backspaceMode as any) || (isInitialNonStop ? "ctrl-h" : "auto")
    );
    const [terminalType, setTerminalType] = useState(
        initialConfig?.termType || (isInitialNonStop ? "TN6530-8" : "xterm-256color")
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleModeSwitch = (newMode: "standard" | "nonstop") => {
        setConnectionMode(newMode);
        if (newMode === "nonstop") {
            setProtocol("telnet");
            if (port === 22) setPort(23);
            setTerminalType("TN6530-8");
            setBackspaceMode("ctrl-h");
            if (!serviceName) setServiceName("TACL");
        } else {
            setProtocol("ssh");
            if (port === 23) setPort(22);
            setTerminalType("xterm-256color");
            setBackspaceMode("auto");
        }
    };

    const handleProtocolSwitch = (newProtocol: "telnet" | "ssh") => {
        setProtocol(newProtocol);
        if (newProtocol === "telnet" && port === 22) {
            setPort(23);
        } else if (newProtocol === "ssh" && port === 23) {
            setPort(22);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        let finalKeyPath = privateKeyPath;

        const isNonStop = connectionMode === "nonstop";

        if (!isNonStop && keyMode === "paste" && pastedKey.trim()) {
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
            const chosenProtocol = isNonStop ? protocol : "ssh";
            const effectiveServiceName = isNonStop ? (serviceName.trim() || "TACL") : undefined;
            const effectiveSessionName = sessionName.trim() || (
                isNonStop
                    ? `NonStop (${effectiveServiceName}) - ${host.trim()}`
                    : `${username.trim()}@${host.trim()}`
            );

            onConnect({
                host: host.trim(),
                port: Number(port) || (chosenProtocol === "telnet" ? 23 : 22),
                username: username.trim(),
                password: keyMode === "password" ? password : "",
                privateKeyPath: (!isNonStop || chosenProtocol === "ssh") && keyMode !== "password" ? finalKeyPath : null,
                sessionName: effectiveSessionName,
                termType: isNonStop ? "TN6530-8" : terminalType,
                remoteCommand: remoteCommand || undefined,
                backspaceMode: isNonStop ? (backspaceMode || "ctrl-h") : backspaceMode,
                protocol: chosenProtocol,
                serviceName: effectiveServiceName,
                isNonStop,
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
    const isNonStop = connectionMode === "nonstop";

    // For Telnet, host is required; username is optional (entered at login: prompt); password/keys not required
    const canSubmit = isNonStop && protocol === "telnet"
        ? host.trim().length > 0
        : host.trim().length > 0 && username.trim().length > 0 &&
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
                    width: "530px",
                    maxHeight: "90vh",
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
                    padding: "20px 24px 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: "11px",
                            background: isNonStop ? "rgba(234, 179, 8, 0.12)" : "rgba(59,130,246,0.12)",
                            border: `1px solid ${isNonStop ? "rgba(234, 179, 8, 0.3)" : "rgba(59,130,246,0.25)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            {isEdit
                                ? <Icons.Edit style={{ width: 18, height: 18, color: isNonStop ? "#eab308" : "#3b82f6" }} />
                                : isNonStop
                                    ? <Icons.Server style={{ width: 18, height: 18, color: "#eab308" }} />
                                    : <Icons.Terminal style={{ width: 18, height: 18, color: "#3b82f6" }} />
                            }
                        </div>
                        <div>
                            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary, #e2e8f0)" }}>
                                {isEdit ? "Edit Connection" : isNonStop ? "HP NonStop (CAIL Mode)" : "New SSH Connection"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
                                {isEdit
                                    ? "Update your saved session settings"
                                    : isNonStop
                                        ? "Connect to Tandem TELSERV / TACL via Telnet or SSH"
                                        : "Connect to a remote SSH server"}
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

                {/* Connection Mode Switcher (Standard SSH vs HP NonStop CAIL) */}
                <div style={{
                    margin: "14px 24px 0",
                    padding: "3px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "10px",
                    display: "flex",
                    gap: "4px",
                    flexShrink: 0,
                }}>
                    <button
                        type="button"
                        onClick={() => handleModeSwitch("standard")}
                        style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "7px",
                            border: "none",
                            background: connectionMode === "standard" ? "rgba(59,130,246,0.2)" : "transparent",
                            color: connectionMode === "standard" ? "#60a5fa" : "var(--text-muted, #94a3b8)",
                            fontSize: "12px",
                            fontWeight: connectionMode === "standard" ? 600 : 500,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "7px",
                        }}
                    >
                        <Icons.Terminal style={{ width: 14, height: 14 }} />
                        Standard SSH
                    </button>
                    <button
                        type="button"
                        onClick={() => handleModeSwitch("nonstop")}
                        style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "7px",
                            border: "none",
                            background: connectionMode === "nonstop" ? "linear-gradient(135deg, rgba(234,179,8,0.2), rgba(59,130,246,0.2))" : "transparent",
                            color: connectionMode === "nonstop" ? "#facc15" : "var(--text-muted, #94a3b8)",
                            fontSize: "12px",
                            fontWeight: connectionMode === "nonstop" ? 600 : 500,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "7px",
                        }}
                    >
                        <Icons.Server style={{ width: 14, height: 14 }} />
                        HP NonStop (CAIL Mode)
                    </button>
                </div>

                {/* Tab Bar */}
                <div style={{
                    display: "flex", gap: "4px",
                    padding: "12px 24px 0",
                    flexShrink: 0,
                }}>
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1,
                                padding: "8px",
                                borderRadius: "8px",
                                border: activeTab === tab.id
                                    ? `1px solid ${isNonStop ? "rgba(234,179,8,0.4)" : "rgba(59,130,246,0.4)"}`
                                    : "1px solid rgba(255,255,255,0.06)",
                                background: activeTab === tab.id
                                    ? (isNonStop ? "rgba(234,179,8,0.12)" : "rgba(59,130,246,0.12)")
                                    : "rgba(255,255,255,0.025)",
                                color: activeTab === tab.id
                                    ? (isNonStop ? "#facc15" : "#60a5fa")
                                    : "var(--text-muted, #64748b)",
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
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "12px 0 0 0", flexShrink: 0 }} />

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px", display: "flex", flexDirection: "column", gap: "15px", minHeight: "340px" }}>

                        {/* ─── CONNECTION TAB ─── */}
                        {activeTab === "basic" && (
                            <>
                                {/* NonStop CAIL Mode Pill */}
                                {isNonStop && (
                                    <div style={{
                                        padding: "10px 14px",
                                        background: "linear-gradient(135deg, rgba(234,179,8,0.08), rgba(59,130,246,0.08))",
                                        border: "1px solid rgba(234,179,8,0.2)",
                                        borderRadius: "10px",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "8px",
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <span style={{ fontSize: "12px", fontWeight: 600, color: "#facc15", display: "flex", alignItems: "center", gap: "6px" }}>
                                                <Icons.Server style={{ width: 13, height: 13 }} />
                                                CAIL / TELSERV Protocol
                                            </span>
                                            <div style={{ display: "flex", gap: "4px" }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleProtocolSwitch("telnet")}
                                                    style={{
                                                        padding: "4px 9px",
                                                        borderRadius: "6px",
                                                        border: protocol === "telnet" ? "1px solid #facc15" : "1px solid rgba(255,255,255,0.1)",
                                                        background: protocol === "telnet" ? "rgba(234,179,8,0.2)" : "rgba(0,0,0,0.2)",
                                                        color: protocol === "telnet" ? "#facc15" : "var(--text-muted, #94a3b8)",
                                                        fontSize: "11px", fontWeight: 600, cursor: "pointer"
                                                    }}
                                                >
                                                    Telnet (Port 23)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleProtocolSwitch("ssh")}
                                                    style={{
                                                        padding: "4px 9px",
                                                        borderRadius: "6px",
                                                        border: protocol === "ssh" ? "1px solid #60a5fa" : "1px solid rgba(255,255,255,0.1)",
                                                        background: protocol === "ssh" ? "rgba(59,130,246,0.2)" : "rgba(0,0,0,0.2)",
                                                        color: protocol === "ssh" ? "#60a5fa" : "var(--text-muted, #94a3b8)",
                                                        fontSize: "11px", fontWeight: 600, cursor: "pointer"
                                                    }}
                                                >
                                                    SSH (Port 22)
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)", lineHeight: 1.4 }}>
                                            {protocol === "telnet"
                                                ? "Direct Telnet connection to TELSERV with 6530 negotiation. Automatically enters Service Name upon receiving 'Enter Choice>'."
                                                : "SSH connection to NonStop host with HP 6530 block mode, DBU support, and F1–F16 softkeys."
                                            }
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <FieldLabel>Session Name</FieldLabel>
                                    <StyledInput
                                        type="text"
                                        placeholder={isNonStop ? `NonStop (${serviceName || "TACL"}) - ${host || "server"}` : `${username || "user"}@${host || "server"}`}
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
                                    <div style={{ width: "96px" }}>
                                        <FieldLabel>Port</FieldLabel>
                                        <StyledInput
                                            type="number"
                                            placeholder={isNonStop && protocol === "telnet" ? "23" : "22"}
                                            value={port}
                                            onChange={(e) => setPort(parseInt(e.target.value) || (isNonStop && protocol === "telnet" ? 23 : 22))}
                                            min={1} max={65535}
                                        />
                                    </div>
                                </div>

                                {/* Service Name (for NonStop mode) */}
                                {isNonStop && (
                                    <div>
                                        <FieldLabel>Service Name (TELSERV)</FieldLabel>
                                        <StyledInput
                                            type="text"
                                            placeholder="TACL"
                                            value={serviceName}
                                            onChange={(e) => setServiceName(e.target.value)}
                                        />
                                        <p style={{ margin: "5px 0 0", fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                            Service sent at <code style={{ color: "#facc15" }}>Enter Choice&gt;</code> prompt (default: TACL).
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <FieldLabel>
                                        {isNonStop && protocol === "telnet" ? "Username (Optional for Telnet)" : "Username"}
                                    </FieldLabel>
                                    <StyledInput
                                        type="text"
                                        placeholder={isNonStop && protocol === "telnet" ? "Optional (interactive login prompt)" : "root"}
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required={!isNonStop || protocol !== "telnet"}
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
                                                    background: saveForLater ? (isNonStop ? "#eab308" : "#3b82f6") : "rgba(255,255,255,0.1)",
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
                                {isNonStop && protocol === "telnet" ? (
                                    <div style={{
                                        padding: "16px",
                                        background: "rgba(234,179,8,0.06)",
                                        border: "1px solid rgba(234,179,8,0.2)",
                                        borderRadius: "10px",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "10px"
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#facc15", fontWeight: 600, fontSize: "13px" }}>
                                            <Icons.Shield style={{ width: 16, height: 16 }} />
                                            Interactive Telnet Authentication
                                        </div>
                                        <p style={{ margin: 0, fontSize: "12px", color: "var(--text-primary, #e2e8f0)", lineHeight: 1.5 }}>
                                            TELSERV authenticates interactively directly within the terminal display at the <code style={{ color: "#facc15" }}>login:</code> and <code style={{ color: "#facc15" }}>Password:</code> prompts.
                                        </p>
                                        <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted, #94a3b8)", lineHeight: 1.4 }}>
                                            Pre-saved passwords or private keys are not required. Once connected, your keystrokes will be sent securely to the NonStop host.
                                        </p>
                                    </div>
                                ) : (
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
                                    <StyledSelect
                                        value={isNonStop ? "TN6530-8" : (terminalType === "t6530" || terminalType === "6530" ? "TN6530-8" : terminalType)}
                                        onChange={(e) => setTerminalType(e.target.value)}
                                        disabled={isNonStop}
                                    >
                                        <option value="TN6530-8">TN6530-8 (HP NonStop)</option>
                                        <option value="xterm-256color">xterm-256color (Default)</option>
                                        <option value="vt100">vt100</option>
                                    </StyledSelect>
                                    {(isNonStop || terminalType === "TN6530-8" || terminalType === "6530" || terminalType === "t6530") && (
                                        <p style={{ margin: "6px 0 0", fontSize: "11px", color: isNonStop ? "#facc15" : "#60a5fa" }}>
                                            HP NonStop 6530 emulation: conversational TACL, block mode forms (DBU / Pathway), and F1–F16 function keys.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <FieldLabel>Backspace Sends</FieldLabel>
                                    <StyledSelect value={backspaceMode} onChange={(e) => setBackspaceMode(e.target.value as any)}>
                                        <option value="auto">Auto (Server decides)</option>
                                        <option value="ctrl-h">Control-H (^H, ASCII 8 - Recommended for NonStop)</option>
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
                                border: `1px solid ${isNonStop ? "rgba(234,179,8,0.5)" : "rgba(59,130,246,0.4)"}`,
                                background: isNonStop ? "rgba(234,179,8,0.18)" : "rgba(59,130,246,0.18)",
                                color: isNonStop ? "#facc15" : "#60a5fa",
                                fontSize: "13px", fontWeight: 600, cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                                opacity: (isSubmitting || !canSubmit) ? 0.5 : 1,
                            }}
                            onMouseEnter={(e) => {
                                if (!e.currentTarget.disabled) {
                                    e.currentTarget.style.background = isNonStop ? "rgba(234,179,8,0.28)" : "rgba(59,130,246,0.28)";
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = isNonStop ? "rgba(234,179,8,0.18)" : "rgba(59,130,246,0.18)";
                            }}
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
