import { useState } from "react";
import { TERMINAL_THEMES } from "../config/themes";
import { Icons } from "./Icons";
import { AppSettings, DEFAULT_SETTINGS, FONT_OPTIONS } from "./SettingsTypes";

interface SettingsModalProps {
    onClose: () => void;
    currentSettings: AppSettings;
    onSave: (settings: AppSettings) => void;
}

type SettingsTab = "general" | "appearance" | "terminal" | "behavior" | "security" | "about";

export function SettingsModal({ onClose, currentSettings, onSave }: SettingsModalProps) {
    const [settings, setSettings] = useState<AppSettings>({
        ...DEFAULT_SETTINGS,
        ...currentSettings
    });

    const [activeTab, setActiveTab] = useState<SettingsTab>("general");

    const handleSave = () => {
        onSave(settings);
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Settings</h2>
                    <button
                        className="icon-btn"
                        onClick={onClose}
                        title="Close"
                    >
                        <Icons.X />
                    </button>
                </div>

                <div className="settings-container">
                    {/* Sidebar */}
                    <div className="settings-sidebar">
                        <button
                            className={`settings-nav-item ${activeTab === "general" ? "active" : ""}`}
                            onClick={() => setActiveTab("general")}
                        >
                            <Icons.Settings style={{ width: 14, height: 14 }} /> General
                        </button>
                        <button
                            className={`settings-nav-item ${activeTab === "appearance" ? "active" : ""}`}
                            onClick={() => setActiveTab("appearance")}
                        >
                            <Icons.Eye style={{ width: 14, height: 14 }} /> Appearance
                        </button>
                        <button
                            className={`settings-nav-item ${activeTab === "terminal" ? "active" : ""}`}
                            onClick={() => setActiveTab("terminal")}
                        >
                            <Icons.Terminal style={{ width: 14, height: 14 }} /> Terminal
                        </button>
                        <button
                            className={`settings-nav-item ${activeTab === "behavior" ? "active" : ""}`}
                            onClick={() => setActiveTab("behavior")}
                        >
                            <Icons.Cpu style={{ width: 14, height: 14 }} /> Behavior
                        </button>
                    </div>

                    {/* Content */}
                    <div className="settings-content">
                        {activeTab === "general" && (
                            <>
                                <h3 className="settings-section-title">General Settings</h3>

                                <div className="settings-group">
                                    <span className="settings-group-title">Application Theme</span>
                                    <div className="settings-radio-group">
                                        <label className="settings-radio-label">
                                            <input
                                                type="radio"
                                                name="appTheme"
                                                checked={settings.theme === "dark"}
                                                onChange={() => setSettings({ ...settings, theme: "dark" })}
                                            />
                                            Dark Mode
                                        </label>
                                        <label className="settings-radio-label">
                                            <input
                                                type="radio"
                                                name="appTheme"
                                                checked={settings.theme === "light"}
                                                onChange={() => setSettings({ ...settings, theme: "light" })}
                                            />
                                            Light Mode
                                        </label>
                                    </div>
                                </div>
                                <div className="settings-group">
                                    <span className="settings-group-title">Application Behavior</span>
                                    <div className="settings-row">
                                        <div>
                                            <div className="settings-label">Confirm on Close</div>
                                            <span className="settings-desc">Ask for confirmation before closing the application</span>
                                        </div>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                className="toggle-input"
                                                checked={settings.confirmOnClose}
                                                onChange={(e) => setSettings({ ...settings, confirmOnClose: e.target.checked })}
                                            />
                                            <div className="toggle-slider"></div>
                                        </label>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === "appearance" && (
                            <>
                                <h3 className="settings-section-title">Editor & Font</h3>

                                <div className="settings-group">
                                    <span className="settings-group-title">Typography</span>
                                    <div className="settings-row">
                                        <div className="settings-label">Font Family</div>
                                        <select
                                            className="settings-select"
                                            value={settings.terminalFontFamily}
                                            onChange={(e) => setSettings({ ...settings, terminalFontFamily: e.target.value })}
                                        >
                                            {FONT_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="settings-row">
                                        <div className="settings-label">Font Size ({settings.terminalFontSize}px)</div>
                                        <div className="settings-controls">
                                            <input
                                                type="range"
                                                min="10"
                                                max="32"
                                                value={settings.terminalFontSize}
                                                onChange={(e) => setSettings({ ...settings, terminalFontSize: parseInt(e.target.value) })}
                                            />
                                            <input
                                                type="number"
                                                className="settings-input"
                                                value={settings.terminalFontSize}
                                                onChange={(e) => setSettings({ ...settings, terminalFontSize: parseInt(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                    <div className="settings-row">
                                        <div className="settings-label">Font Weight</div>
                                        <select
                                            className="settings-select"
                                            value={settings.terminalFontWeight}
                                            onChange={(e) => setSettings({ ...settings, terminalFontWeight: e.target.value as any })}
                                        >
                                            <option value="normal">Normal</option>
                                            <option value="bold">Bold</option>
                                            <option value="300">Light (300)</option>
                                            <option value="500">Medium (500)</option>
                                        </select>
                                    </div>
                                    <div className="settings-row">
                                        <div className="settings-label">Line Height</div>
                                        <input
                                            type="number"
                                            step="0.1"
                                            className="settings-input"
                                            value={settings.terminalLineHeight}
                                            onChange={(e) => setSettings({ ...settings, terminalLineHeight: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="settings-group">
                                    <span className="settings-group-title">Color Scheme</span>
                                    <div className="settings-row">
                                        <div className="settings-label">Theme</div>
                                        <select
                                            className="settings-select"
                                            value={settings.terminalTheme}
                                            onChange={(e) => setSettings({ ...settings, terminalTheme: e.target.value })}
                                        >
                                            {Object.keys(TERMINAL_THEMES).map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === "terminal" && (
                            <>
                                <h3 className="settings-section-title">Terminal Settings</h3>

                                <div className="settings-group">
                                    <span className="settings-group-title">Cursor</span>
                                    <div className="settings-row">
                                        <div className="settings-label">Cursor Style</div>
                                        <select
                                            className="settings-select"
                                            value={settings.cursorStyle}
                                            onChange={(e) => setSettings({ ...settings, cursorStyle: e.target.value as any })}
                                        >
                                            <option value="block">Block █</option>
                                            <option value="underline">Underline _</option>
                                            <option value="bar">Bar |</option>
                                        </select>
                                    </div>
                                    <div className="settings-row">
                                        <div className="settings-label">Blinking Cursor</div>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                className="toggle-input"
                                                checked={settings.cursorBlink}
                                                onChange={(e) => setSettings({ ...settings, cursorBlink: e.target.checked })}
                                            />
                                            <div className="toggle-slider"></div>
                                        </label>
                                    </div>
                                </div>

                                <div className="settings-group">
                                    <span className="settings-group-title">History</span>
                                    <div className="settings-row">
                                        <div>
                                            <div className="settings-label">Scrollback Buffer</div>
                                            <span className="settings-desc">Lines of history to keep</span>
                                        </div>
                                        <input
                                            type="number"
                                            className="settings-input"
                                            value={settings.scrollback}
                                            onChange={(e) => setSettings({ ...settings, scrollback: parseInt(e.target.value) })}
                                            min="100"
                                            max="100000"
                                            step="100"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === "behavior" && (
                            <>
                                <h3 className="settings-section-title">Behavior</h3>

                                <div className="settings-group">
                                    <span className="settings-group-title">Interaction</span>
                                    <div className="settings-row">
                                        <div>
                                            <div className="settings-label">Copy on Select</div>
                                            <span className="settings-desc">Automatically copy selected text to clipboard</span>
                                        </div>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                className="toggle-input"
                                                checked={settings.copyOnSelect}
                                                onChange={(e) => setSettings({ ...settings, copyOnSelect: e.target.checked })}
                                            />
                                            <div className="toggle-slider"></div>
                                        </label>
                                    </div>
                                    <div className="settings-row">
                                        <div>
                                            <div className="settings-label">Audible Bell</div>
                                            <span className="settings-desc">Play sound when bell character is received</span>
                                        </div>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                className="toggle-input"
                                                checked={settings.bellSound}
                                                onChange={(e) => setSettings({ ...settings, bellSound: e.target.checked })}
                                            />
                                            <div className="toggle-slider"></div>
                                        </label>
                                    </div>
                                </div>
                            </>
                        )}


                    </div>
                </div>

                <div className="modal-footer" style={{ borderTop: "1px solid var(--border-color)", padding: "12px 16px", justifyContent: "flex-end" }}>
                    <button className="btn btn-primary" onClick={() => {
                        handleSave();
                        onClose();
                    }}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
