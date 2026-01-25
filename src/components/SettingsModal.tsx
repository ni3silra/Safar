import { useState } from "react";
import { TERMINAL_THEMES } from "../config/themes";
import { SecuritySettings } from "./SecuritySettings";
import { Icons } from "./Icons";
import { AppSettings, DEFAULT_SETTINGS, FONT_OPTIONS } from "./SettingsTypes";

interface SettingsModalProps {
    onClose: () => void;
    currentSettings: AppSettings;
    onSave: (settings: AppSettings) => void;
}

export function SettingsModal({ onClose, currentSettings, onSave }: SettingsModalProps) {
    // Ensure default if loading old settings
    const [settings, setSettings] = useState<AppSettings>({
        ...DEFAULT_SETTINGS,
        ...currentSettings
    });

    const [activeTab, setActiveTab] = useState<"general" | "security">("general");

    const handleSave = () => {
        onSave(settings);
        onClose();
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "450px" }}>
                <div className="modal-header">
                    <h2 className="modal-title">Settings</h2>
                    <button
                        className="icon-btn"
                        onClick={onClose}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                    >
                        <Icons.X />
                    </button>
                </div>

                <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", padding: "0 16px" }}>
                    <button
                        onClick={() => setActiveTab("general")}
                        style={{
                            padding: "8px 16px",
                            background: "none",
                            border: "none",
                            borderBottom: activeTab === "general" ? "2px solid var(--col-blue)" : "2px solid transparent",
                            color: activeTab === "general" ? "var(--text-primary)" : "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500
                        }}
                    >
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab("security")}
                        style={{
                            padding: "8px 16px",
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
                </div>

                <div className="modal-body" style={{ minHeight: "300px" }}>
                    {activeTab === "general" && (
                        <>
                            {/* App Appearance */}
                            <div className="form-group">
                                <label className="form-label" style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px", display: "block" }}>Application Theme</label>
                                <div style={{ display: "flex", gap: "12px" }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                        <input
                                            type="radio"
                                            name="appTheme"
                                            checked={settings.theme === "dark"}
                                            onChange={() => setSettings({ ...settings, theme: "dark" })}
                                        />
                                        <span style={{ fontSize: "13px" }}>Dark Mode</span>
                                    </label>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                        <input
                                            type="radio"
                                            name="appTheme"
                                            checked={settings.theme === "light"}
                                            onChange={() => setSettings({ ...settings, theme: "light" })}
                                        />
                                        <span style={{ fontSize: "13px" }}>Light Mode</span>
                                    </label>
                                </div>
                            </div>

                            <div style={{ height: "1px", background: "var(--border-color)", margin: "16px 0" }} />

                            {/* Terminal Settings */}
                            <div className="form-group">
                                <label className="form-label" style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px", display: "block" }}>Terminal Appearance</label>

                                <div style={{ marginBottom: "12px" }}>
                                    <label className="form-label" style={{ fontSize: "12px" }}>Color Scheme</label>
                                    <select
                                        className="input"
                                        value={settings.terminalTheme}
                                        onChange={(e) => setSettings({ ...settings, terminalTheme: e.target.value })}
                                    >
                                        {Object.keys(TERMINAL_THEMES).map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ marginBottom: "12px" }}>
                                    <label className="form-label" style={{ fontSize: "12px" }}>Font Family</label>
                                    <select
                                        className="input"
                                        value={settings.terminalFontFamily}
                                        onChange={(e) => setSettings({ ...settings, terminalFontFamily: e.target.value })}
                                    >
                                        {FONT_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" style={{ fontSize: "12px", display: "flex", justifyContent: "space-between" }}>
                                        <span>Font Size</span>
                                        <span>{settings.terminalFontSize}px</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="10"
                                        max="24"
                                        value={settings.terminalFontSize}
                                        onChange={(e) => setSettings({ ...settings, terminalFontSize: parseInt(e.target.value) })}
                                        style={{ width: "100%" }}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === "security" && (
                        <SecuritySettings />
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    {activeTab === "general" && (
                        <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
                    )}
                    {activeTab === "security" && (
                        <button className="btn btn-primary" onClick={onClose}>Done</button>
                    )}

                </div>
            </div>
        </div>
    );
}
