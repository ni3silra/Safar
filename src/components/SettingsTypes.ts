export interface AppSettings {
    theme: "dark" | "light"; // App theme
    terminalTheme: string;   // Terminal color scheme
    terminalFontSize: number;
    terminalFontFamily: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
    theme: "dark",
    terminalTheme: "Safar Dark",
    terminalFontSize: 14,
    terminalFontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
};

export const FONT_OPTIONS = [
    { label: "Default (Cascadia/Fira)", value: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace" },
    { label: "Consolas", value: "'Consolas', 'Lucida Console', monospace" },
    { label: "Courier New", value: "'Courier New', Courier, monospace" },
    { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
    { label: "Hack", value: "'Hack', monospace" },
    { label: "Source Code Pro", value: "'Source Code Pro', monospace" }
];
