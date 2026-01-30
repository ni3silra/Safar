export interface AppSettings {
    theme: "dark" | "light";

    // Terminal Appearance
    terminalTheme: string;
    terminalFontSize: number;
    terminalFontFamily: string;
    terminalFontWeight: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
    terminalLineHeight: number;

    // Custom Terminal Colors (override theme colors)
    useCustomColors: boolean;
    customForeground: string;
    customBackground: string;

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

    useCustomColors: false,
    customForeground: "#e6edf3",
    customBackground: "#0d1117",

    cursorStyle: "block",
    cursorBlink: true,

    scrollback: 1000,
    bellSound: true,
    copyOnSelect: true,

    confirmOnClose: true
};

export interface CustomTheme {
    id: string;
    name: string;
    foreground: string;
    background: string;
}

export const FONT_OPTIONS = [
    { label: "Default (Cascadia/Fira)", value: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace" },
    { label: "Consolas", value: "'Consolas', 'Lucida Console', monospace" },
    { label: "Courier New", value: "'Courier New', Courier, monospace" },
    { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
    { label: "Hack", value: "'Hack', monospace" },
    { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
    { label: "Meslo LG", value: "'MesloLGS NF', monospace" }
];
