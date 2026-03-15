import { useState, useRef, useEffect } from "react";
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { Icons } from "./Icons";

interface CredentialsModalProps {
    onClose: () => void;
    onSubmit: (password: string, privateKeyPath: string | null) => void;
    username: string;
    host: string;
    initialKeyPath?: string | null;
    authFailed?: boolean;
}

export function CredentialsModal({ onClose, onSubmit, username, host, initialKeyPath, authFailed }: CredentialsModalProps) {
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [privateKeyPath, setPrivateKeyPath] = useState<string | null>(initialKeyPath || null);
    const [authMode, setAuthMode] = useState<"password" | "key">(initialKeyPath ? "key" : "password");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const passwordRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (authMode === "password") passwordRef.current?.focus();
    }, [authMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSubmit(password, authMode === "key" ? privateKeyPath : null);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBrowseKey = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Private Key', extensions: ['pem', 'key', 'ppk', 'openssh', 'id_rsa'] }]
            });
            if (selected) setPrivateKeyPath(selected as string);
        } catch {
            toast.error("Failed to browse key file");
        }
    };

    const keyFilename = privateKeyPath ? privateKeyPath.split(/[/\\]/).pop() : null;

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-primary, system-ui)",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "420px",
                    background: "var(--bg-panel, #1a1d23)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "14px",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3)",
                    overflow: "hidden",
                    animation: "slideUp 0.2s ease-out",
                }}
            >
                {/* Header */}
                <div style={{
                    padding: "20px 24px 0",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{
                            width: 40, height: 40,
                            borderRadius: "10px",
                            background: authFailed ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.12)",
                            border: `1px solid ${authFailed ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <Icons.Lock style={{
                                width: 18, height: 18,
                                color: authFailed ? "#ef4444" : "#3b82f6",
                            }} />
                        </div>
                        <div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary, #e2e8f0)", lineHeight: 1.2 }}>
                                {authFailed ? "Authentication Failed" : "Authentication Required"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "3px" }}>
                                {username}@{host}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "transparent", border: "none", cursor: "pointer",
                            color: "var(--text-muted, #64748b)", padding: "4px",
                            borderRadius: "6px", display: "flex",
                        }}
                    >
                        <Icons.X style={{ width: 16, height: 16 }} />
                    </button>
                </div>

                {/* Auth failed banner */}
                {authFailed && (
                    <div style={{
                        margin: "16px 24px 0",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        display: "flex",
                        gap: "10px",
                        alignItems: "flex-start",
                    }}>
                        <Icons.AlertCircle style={{ width: 15, height: 15, color: "#ef4444", flexShrink: 0, marginTop: "1px" }} />
                        <span style={{ fontSize: "13px", color: "#f87171", lineHeight: 1.4 }}>
                            Incorrect credentials. Please check your password or key and try again.
                        </span>
                    </div>
                )}

                {/* Auth Mode Toggle */}
                <div style={{ padding: "20px 24px 0", display: "flex", gap: "8px" }}>
                    {(["password", "key"] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setAuthMode(mode)}
                            style={{
                                flex: 1,
                                padding: "8px",
                                borderRadius: "8px",
                                border: authMode === mode
                                    ? "1px solid rgba(59,130,246,0.5)"
                                    : "1px solid rgba(255,255,255,0.07)",
                                background: authMode === mode
                                    ? "rgba(59,130,246,0.12)"
                                    : "rgba(255,255,255,0.03)",
                                color: authMode === mode
                                    ? "#60a5fa"
                                    : "var(--text-muted, #64748b)",
                                fontSize: "13px",
                                fontWeight: authMode === mode ? 600 : 400,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px",
                            }}
                        >
                            {mode === "password" ? (
                                <><Icons.Lock style={{ width: 13, height: 13 }} /> Password</>
                            ) : (
                                <><Icons.Key style={{ width: 13, height: 13 }} /> Private Key</>
                            )}
                        </button>
                    ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    {authMode === "password" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted, #64748b)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                                Password
                            </label>
                            <div style={{ position: "relative" }}>
                                <input
                                    ref={passwordRef}
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password…"
                                    autoComplete="current-password"
                                    style={{
                                        width: "100%",
                                        padding: "10px 44px 10px 14px",
                                        background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                        color: "var(--text-primary, #e2e8f0)",
                                        fontSize: "14px",
                                        outline: "none",
                                        boxSizing: "border-box",
                                        transition: "border-color 0.15s",
                                    }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                                    onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: "absolute", right: "12px", top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "transparent", border: "none", cursor: "pointer",
                                        color: "var(--text-muted, #64748b)", padding: "2px",
                                        display: "flex",
                                    }}
                                    title={showPassword ? "Hide password" : "Show password"}
                                >
                                    <Icons.Eye style={{ width: 15, height: 15 }} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted, #64748b)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                                Private Key File
                            </label>
                            <div
                                onClick={handleBrowseKey}
                                style={{
                                    padding: "12px 16px",
                                    background: "rgba(255,255,255,0.03)",
                                    border: `1px dashed ${privateKeyPath ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.12)"}`,
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    transition: "all 0.15s",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = privateKeyPath ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.12)"}
                            >
                                <div style={{
                                    width: 32, height: 32, borderRadius: "6px",
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
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}>
                                        {keyFilename || "Click to select a key file…"}
                                    </div>
                                    {privateKeyPath && (
                                        <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
                                            {privateKeyPath}
                                        </div>
                                    )}
                                </div>
                                {privateKeyPath && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setPrivateKeyPath(null); }}
                                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", padding: "2px", display: "flex" }}
                                        title="Remove key"
                                    >
                                        <Icons.X style={{ width: 14, height: 14 }} />
                                    </button>
                                )}
                            </div>
                            <p style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", margin: "2px 0 0 0" }}>
                                Supported: .pem, .key, .ppk, .openssh, id_rsa
                            </p>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.08)",
                                background: "rgba(255,255,255,0.04)",
                                color: "var(--text-muted, #94a3b8)",
                                fontSize: "13px",
                                fontWeight: 500,
                                cursor: "pointer",
                                transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || (authMode === "password" ? !password : !privateKeyPath)}
                            style={{
                                flex: 2,
                                padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(59,130,246,0.4)",
                                background: "rgba(59,130,246,0.18)",
                                color: "#60a5fa",
                                fontSize: "13px",
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "7px",
                                opacity: (isSubmitting || (authMode === "password" ? !password : !privateKeyPath)) ? 0.5 : 1,
                            }}
                            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(59,130,246,0.28)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.18)"; }}
                        >
                            {isSubmitting ? (
                                <Icons.Loader style={{ width: 14, height: 14 }} />
                            ) : (
                                <Icons.Zap style={{ width: 14, height: 14 }} />
                            )}
                            {isSubmitting ? "Connecting…" : "Connect"}
                        </button>
                    </div>
                </form>
            </div>

            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(16px) scale(0.98); }
                    to   { opacity: 1; transform: translateY(0)  scale(1); }
                }
            `}</style>
        </div>
    );
}
