import { useState } from "react";
import { TERMINAL_THEMES } from "../config/themes";

interface SettingsModalProps {
    onClose: () => void;
    currentSettings: AppSettings;
    onSave: (settings: AppSettings) => void;
}

export interface AppSettings {
    theme: "dark" | "light"; // App theme
    terminalTheme: string;   // Terminal color scheme
    terminalFontSize: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
    theme: "dark",
    terminalTheme: "Safar Dark",
    terminalFontSize: 14,
};

export function SettingsModal({ onClose, currentSettings, onSave }: SettingsModalProps) {
    const [settings, setSettings] = useState<AppSettings>(currentSettings);

    const handleSave = () => {
        onSave(settings);
        onClose();
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "400px" }}>
                <div className="modal-header">
                    <h2 className="modal-title">Settings</h2>
                    <button
                        className="icon-btn"
                        onClick={onClose}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                    >
                        ✕
                    </button>
                </div>

                <div className="modal-body">
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
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
                </div>
            </div>
        </div>
    );
}
