// Terminal Color Themes

export interface ITheme {
    name: string;
    colors: {
        background: string;
        foreground: string;
        cursor: string;
        cursorAccent: string;
        selectionBackground: string;
        selectionForeground: string;
        black: string;
        red: string;
        green: string;
        yellow: string;
        blue: string;
        magenta: string;
        cyan: string;
        white: string;
        brightBlack: string;
        brightRed: string;
        brightGreen: string;
        brightYellow: string;
        brightBlue: string;
        brightMagenta: string;
        brightCyan: string;
        brightWhite: string;
    };
}

export const TERMINAL_THEMES: Record<string, ITheme> = {
    "Safar Dark": {
        name: "Safar Dark",
        colors: {
            background: "#0d1117",
            foreground: "#e6edf3",
            cursor: "#58a6ff",
            cursorAccent: "#0d1117",
            selectionBackground: "#264f78",
            selectionForeground: "#ffffff",
            black: "#0d1117",
            red: "#f85149",
            green: "#3fb950",
            yellow: "#d29922",
            blue: "#58a6ff",
            magenta: "#a371f7",
            cyan: "#39d1b4",
            white: "#e6edf3",
            brightBlack: "#6e7681",
            brightRed: "#ff7b72",
            brightGreen: "#56d364",
            brightYellow: "#e3b341",
            brightBlue: "#79c0ff",
            brightMagenta: "#d2a8ff",
            brightCyan: "#56d4dd",
            brightWhite: "#ffffff",
        },
    },
    "Safar Light": {
        name: "Safar Light",
        colors: {
            background: "#ffffff",
            foreground: "#24292f",
            cursor: "#0969da",
            cursorAccent: "#ffffff",
            selectionBackground: "#add6ff",
            selectionForeground: "#000000",
            black: "#24292f",
            red: "#cf222e",
            green: "#1a7f37",
            yellow: "#9a6700",
            blue: "#0969da",
            magenta: "#8250df",
            cyan: "#1f883d",
            white: "#ffffff",
            brightBlack: "#6e7781",
            brightRed: "#a40e26",
            brightGreen: "#116329",
            brightYellow: "#4d2d00",
            brightBlue: "#116329",
            brightMagenta: "#5f37bc",
            brightCyan: "#116329",
            brightWhite: "#6e7781",
        },
    },
    Monokai: {
        name: "Monokai",
        colors: {
            background: "#272822",
            foreground: "#F8F8F2",
            cursor: "#F8F8F0",
            cursorAccent: "#272822",
            selectionBackground: "#49483E",
            selectionForeground: "#F8F8F2",
            black: "#272822",
            red: "#F92672",
            green: "#A6E22E",
            yellow: "#E6DB74",
            blue: "#66D9EF",
            magenta: "#AE81FF",
            cyan: "#A1EFE4",
            white: "#F8F8F2",
            brightBlack: "#75715E",
            brightRed: "#F92672",
            brightGreen: "#A6E22E",
            brightYellow: "#E6DB74",
            brightBlue: "#66D9EF",
            brightMagenta: "#AE81FF",
            brightCyan: "#A1EFE4",
            brightWhite: "#F9F8F5",
        },
    },
    Dracula: {
        name: "Dracula",
        colors: {
            background: "#282a36",
            foreground: "#f8f8f2",
            cursor: "#f8f8f2",
            cursorAccent: "#282a36",
            selectionBackground: "#44475a",
            selectionForeground: "#f8f8f2",
            black: "#21222c",
            red: "#ff5555",
            green: "#50fa7b",
            yellow: "#f1fa8c",
            blue: "#8be9fd",
            magenta: "#ff79c6",
            cyan: "#8be9fd",
            white: "#f8f8f2",
            brightBlack: "#6272a4",
            brightRed: "#ff6e6e",
            brightGreen: "#69ff94",
            brightYellow: "#ffffa5",
            brightBlue: "#d6acff",
            brightMagenta: "#ff92df",
            brightCyan: "#a4ffff",
            brightWhite: "#ffffff",
        },
    },
    "Solarized Dark": {
        name: "Solarized Dark",
        colors: {
            background: "#002b36",
            foreground: "#839496",
            cursor: "#93a1a1",
            cursorAccent: "#002b36",
            selectionBackground: "#073642",
            selectionForeground: "#93a1a1",
            black: "#073642",
            red: "#dc322f",
            green: "#859900",
            yellow: "#b58900",
            blue: "#268bd2",
            magenta: "#d33682",
            cyan: "#2aa198",
            white: "#eee8d5",
            brightBlack: "#002b36",
            brightRed: "#cb4b16",
            brightGreen: "#586e75",
            brightYellow: "#657b83",
            brightBlue: "#839496",
            brightMagenta: "#6c71c4",
            brightCyan: "#93a1a1",
            brightWhite: "#fdf6e3",
        },
    },
};
