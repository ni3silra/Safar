import { ReactNode } from "react";

interface HelpModalProps {
    onClose: () => void;
}

// Internal icon wrapper to reuse App icons or define simple ones here
const IconWrapper = ({ children }: { children: ReactNode }) => (
    <div style={{
        width: "32px",
        height: "32px",
        background: "var(--bg-tertiary)",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--col-blue)",
        flexShrink: 0
    }}>
        {children}
    </div>
);

import { Icons } from "./Icons";

export function HelpModal({ onClose }: HelpModalProps) {
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "500px", maxWidth: "90vw" }}>
                <div className="modal-header">
                    <h2 className="modal-title">About Safar</h2>
                    <button
                        className="icon-btn"
                        onClick={onClose}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                    >
                        ✕
                    </button>
                </div>

                <div className="modal-body" style={{ padding: "24px" }}>
                    {/* Header Section */}
                    <div style={{ textAlign: "center", marginBottom: "32px" }}>
                        <img src="/safar-logo.svg" alt="Safar" style={{ width: "64px", height: "64px", marginBottom: "16px" }} />
                        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>Safar</h1>
                        <p style={{ color: "var(--text-secondary)", fontSize: "14px", fontStyle: "italic" }}>
                            "Every Connection is a Journey" 🛤️
                        </p>
                        <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                            Version 0.2.0 • Build 2026.1
                        </div>
                    </div>

                    <div style={{ height: "1px", background: "var(--border-color)", marginBottom: "24px" }} />

                    {/* Capabilities Grid */}
                    <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Key Capabilities
                    </h3>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            <IconWrapper><Icons.Terminal /></IconWrapper>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: "14px" }}>SSH Terminal</div>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Full xterm-256 support</div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            <IconWrapper><Icons.Folder /></IconWrapper>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: "14px" }}>File Browser</div>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>SFTP Upload & Download</div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            <IconWrapper><Icons.Edit /></IconWrapper>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: "14px" }}>Code Editor</div>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Edit remote files securely</div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            <IconWrapper><Icons.Key /></IconWrapper>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: "14px" }}>Key Auth</div>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>PEM, PPK, OpenSSH</div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            <IconWrapper><Icons.Settings /></IconWrapper>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: "14px" }}>Customizable</div>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Themes & Fonts</div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            <IconWrapper><Icons.Zap /></IconWrapper>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: "14px" }}>Fast & Native</div>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Powered by Rust + Tauri</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: "32px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
                        Built with ❤️ for Developers
                    </div>
                </div>
            </div>
        </div>
    );
}
