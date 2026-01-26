export interface AppSettings {
    theme: "dark" | "light";

    // Terminal Appearance
    terminalTheme: string;
    terminalFontSize: number;
    terminalFontFamily: string;
    terminalFontWeight: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
    terminalLineHeight: number;

    // Terminal Cursor
    cursorStyle: "block" | "underline" | "bar";
    cursorBlink: boolean;

    // Terminal Behavior
    scrollback: number;
    bellSound: boolean;
    copyOnSelect: boolean;

    // App Behavior
    confirmOnClose: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
    theme: "dark",

    terminalTheme: "Safar Dark",
    terminalFontSize: 14,
    terminalFontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
    terminalFontWeight: "normal",
    terminalLineHeight: 1.2,

    cursorStyle: "block",
    cursorBlink: true,

    scrollback: 1000,
    bellSound: true,
    copyOnSelect: true,

    confirmOnClose: true
};

export const FONT_OPTIONS = [
    { label: "Default (Cascadia/Fira)", value: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace" },
    { label: "Consolas", value: "'Consolas', 'Lucida Console', monospace" },
    { label: "Courier New", value: "'Courier New', Courier, monospace" },
    { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
    { label: "Hack", value: "'Hack', monospace" },
    { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
    { label: "Meslo LG", value: "'MesloLGS NF', monospace" }
];
