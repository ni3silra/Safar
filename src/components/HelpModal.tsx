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

// SVGs for the help modal (simplified versions or same as App)
const Icons = {
    Terminal: () => <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 4L2 8l3.5 4 1-1L3.7 8l2.8-3-1-1zm5 0l-1 1L12.3 8l-2.8 3 1 1L14 8l-3.5-4z" /></svg>,
    Folder: () => <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44L8.061 3.5H13.5A1.5 1.5 0 0115 5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13V3.5z" /></svg>,
    Edit: () => <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5zm-9.761 5.175l-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 015 12.5V12h-.5a.5.5 0 01-.5-.5V11h-.5a.5.5 0 01-.468-.325z" /></svg>,
    Zap: () => <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 1.5a.5.5 0 00-.9-.3l-5 8a.5.5 0 00.4.8h4l-.7 4.5a.5.5 0 00.9.3l5-8a.5.5 0 00-.4-.8H7.8l.7-4.5z" /></svg>,
    Key: () => <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 11.5a3.5 3.5 0 113.163-5H14L15.5 8 14 9.5l-1-1-1 1-1-1-1 1H6.663a3.5 3.5 0 01-3.163 2zM2.5 9a1 1 0 100-2 1 1 0 000 2z" /></svg>,
    Settings: () => <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z" /></svg>
};

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
