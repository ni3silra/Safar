import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { TERMINAL_THEMES } from "../config/themes";
import { Icons } from "./Icons";
import { AppSettings, DEFAULT_SETTINGS, FONT_OPTIONS, CustomTheme } from "./SettingsTypes";

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
    const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
    const [themeNameInput, setThemeNameInput] = useState("");
    const [showSaveTheme, setShowSaveTheme] = useState(false);

    useEffect(() => {
        loadCustomThemes();
    }, []);

    const loadCustomThemes = async () => {
        try {
            const res = await invoke<{ success: boolean, data: CustomTheme[] }>("custom_themes_get_all");
            if (res.success) {
                setCustomThemes(res.data);
            }
        } catch (err) {
            console.error("Failed to load custom themes:", err);
        }
    };

    const handleSaveTheme = async () => {
        if (!themeNameInput.trim()) {
            toast.error("Please enter a theme name");
            return;
        }

        const newTheme = {
            id: "",
            name: themeNameInput.trim(),
            foreground: settings.customForeground,
            background: settings.customBackground
        };

        try {
            const res = await invoke<{ success: boolean, data: CustomTheme }>("custom_themes_save", { theme: newTheme });
            if (res.success) {
                toast.success("Theme saved");
                setThemeNameInput("");
                setShowSaveTheme(false);
                loadCustomThemes();
            } else {
                toast.error("Failed to save theme");
            }
        } catch (err) {
            toast.error("Error saving theme");
        }
    };

    const handleDeleteTheme = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await invoke<{ success: boolean }>("custom_themes_delete", { themeId: id });
            if (res.success) {
                toast.success("Theme deleted");
                loadCustomThemes();
            } else {
                toast.error("Failed to delete theme");
            }
        } catch (err) {
            toast.error("Error deleting theme");
        }
    };

    const applyCustomTheme = (theme: CustomTheme) => {
        setSettings({
            ...settings,
            useCustomColors: true,
            customForeground: theme.foreground,
            customBackground: theme.background
        });
        toast.info(`Applied theme: ${theme.name}`);
    };

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
                                                className="settings-slider"
                                                min="10"
                                                max="32"
                                                value={settings.terminalFontSize}
                                                onChange={(e) => setSettings({ ...settings, terminalFontSize: parseInt(e.target.value) })}
                                                style={{ width: "120px" }}
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
                                    <div className="settings-row">
                                        <div>
                                            <div className="settings-label">Use Custom Colors</div>
                                            <span className="settings-desc">Override theme with custom foreground/background colors</span>
                                        </div>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                className="toggle-input"
                                                checked={settings.useCustomColors}
                                                onChange={(e) => setSettings({ ...settings, useCustomColors: e.target.checked })}
                                            />
                                            <div className="toggle-slider"></div>
                                        </label>
                                    </div>
                                    {settings.useCustomColors && (
                                        <>
                                            <div className="settings-row">
                                                <div className="settings-label">Foreground Color</div>
                                                <div className="color-input-group">
                                                    <input
                                                        type="color"
                                                        value={settings.customForeground}
                                                        onChange={(e) => setSettings({ ...settings, customForeground: e.target.value })}
                                                        className="color-swatch"
                                                    />
                                                    <input
                                                        type="text"
                                                        className="settings-input color-hex-input"
                                                        value={settings.customForeground}
                                                        onChange={(e) => setSettings({ ...settings, customForeground: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="settings-row">
                                                <div className="settings-label">Background Color</div>
                                                <div className="color-input-group">
                                                    <input
                                                        type="color"
                                                        value={settings.customBackground}
                                                        onChange={(e) => setSettings({ ...settings, customBackground: e.target.value })}
                                                        className="color-swatch"
                                                    />
                                                    <input
                                                        type="text"
                                                        className="settings-input color-hex-input"
                                                        value={settings.customBackground}
                                                        onChange={(e) => setSettings({ ...settings, customBackground: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="settings-row" style={{ marginTop: "8px" }}>
                                                <div className="settings-label">Preview</div>
                                                <div
                                                    className="settings-preview"
                                                    style={{
                                                        fontFamily: settings.terminalFontFamily,
                                                        background: settings.customBackground,
                                                        color: settings.customForeground,
                                                        flex: 1
                                                    }}
                                                >
                                                    user@server:~$ ls -la
                                                </div>
                                            </div>

                                            {/* Save Theme Section */}
                                            <div className="theme-section-divider">
                                                <div className="settings-label">Saved Custom Themes</div>
                                                <span className="settings-desc" style={{ marginBottom: "16px" }}>Save your color combination as a reusable theme</span>

                                                {!showSaveTheme ? (
                                                    <button
                                                        className="btn btn-secondary"
                                                        onClick={() => setShowSaveTheme(true)}
                                                    >
                                                        <Icons.Plus style={{ width: 14, height: 14 }} /> Save Current as Theme
                                                    </button>
                                                ) : (
                                                    <div className="theme-save-row">
                                                        <input
                                                            className="input"
                                                            placeholder="Theme Name (e.g., My Dark Mode)"
                                                            value={themeNameInput}
                                                            onChange={e => setThemeNameInput(e.target.value)}
                                                            autoFocus
                                                        />
                                                        <button className="btn btn-primary" onClick={handleSaveTheme}>Save</button>
                                                        <button className="btn btn-ghost" onClick={() => setShowSaveTheme(false)}>Cancel</button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Saved Themes List */}
                                            {customThemes.length > 0 && (
                                                <div className="theme-grid">
                                                    {customThemes.map(theme => (
                                                        <div
                                                            key={theme.id}
                                                            className="theme-card"
                                                            onClick={() => applyCustomTheme(theme)}
                                                            title="Click to apply"
                                                        >
                                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                                <div
                                                                    style={{
                                                                        width: 24,
                                                                        height: 24,
                                                                        borderRadius: "50%",
                                                                        background: theme.background,
                                                                        border: "2px solid var(--border-color)",
                                                                        position: "relative"
                                                                    }}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            position: "absolute",
                                                                            top: "50%",
                                                                            left: "50%",
                                                                            transform: "translate(-50%, -50%)",
                                                                            width: 10,
                                                                            height: 10,
                                                                            borderRadius: "50%",
                                                                            background: theme.foreground
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span className="theme-card-name" style={{ color: "var(--text-primary)" }}>{theme.name}</span>
                                                            </div>
                                                            <button
                                                                className="icon-btn"
                                                                onClick={(e) => handleDeleteTheme(theme.id, e)}
                                                                title="Delete theme"
                                                            >
                                                                <Icons.Trash style={{ width: 14, height: 14 }} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
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
