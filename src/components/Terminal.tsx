// Terminal Component - xterm.js wrapper
import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { TERMINAL_THEMES } from "../config/themes";
import { CommandHistoryModal } from "./CommandHistoryModal";
import { addHistory } from "../utils/history";

interface TerminalProps {
  sessionId: string;
  onDisconnect?: () => void;
  fontSize?: number;
  themeName?: string;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  scrollback?: number;
  bellSound?: boolean;
  copyOnSelect?: boolean;
  backspaceMode?: string;
  termType?: string;
  isVisible?: boolean;
  useCustomColors?: boolean;
  customForeground?: string;
  customBackground?: string;
  sessionTimeout?: number;
  onTitleChange?: (title: string) => void;
}

interface TerminalData {
  session_id: string;
  data: string;
}

// VT/xterm control sequences (default)
const VT_SEQUENCES: Record<string, string> = {
  "Ctrl+C": "\x03",
  "Up": "\x1b[A",
  "Down": "\x1b[B",
  "F1": "\x1bOP", "F2": "\x1bOQ", "F3": "\x1bOR", "F4": "\x1bOS",
  "F5": "\x1b[15~", "F6": "\x1b[17~", "F7": "\x1b[18~", "F8": "\x1b[19~",
  "F9": "\x1b[20~", "F10": "\x1b[21~", "F11": "\x1b[23~", "F12": "\x1b[24~",
  "F13": "\x1b[25~", "F14": "\x1b[26~", "F15": "\x1b[28~", "F16": "\x1b[29~",

  "S-F1": "\x1b[1;2P", "S-F2": "\x1b[1;2Q", "S-F3": "\x1b[1;2R", "S-F4": "\x1b[1;2S",
  "S-F5": "\x1b[15;2~", "S-F6": "\x1b[17;2~", "S-F7": "\x1b[18;2~", "S-F8": "\x1b[19;2~",
  "S-F9": "\x1b[20;2~", "S-F10": "\x1b[21;2~", "S-F11": "\x1b[23;2~", "S-F12": "\x1b[24;2~",
  "S-F13": "\x1b[25;2~", "S-F14": "\x1b[26;2~", "S-F15": "\x1b[28;2~", "S-F16": "\x1b[29;2~",
};

// HP NonStop 6530 function key sequences
// F1-F8 → ESC p through ESC w  |  F9-F16 → ESC a through ESC h
// Shift+F1-F8 → ESC P through ESC W  |  Shift+F9-F16 → ESC A through ESC H
const HP_6530_SEQUENCES: Record<string, string> = {
  "Ctrl+C": "\x03",
  "Up": "\x1b[A",
  "Down": "\x1b[B",
  "F1": "\x1bp", "F2": "\x1bq", "F3": "\x1br", "F4": "\x1bs",
  "F5": "\x1bt", "F6": "\x1bu", "F7": "\x1bv", "F8": "\x1bw",
  "F9": "\x1ba", "F10": "\x1bb", "F11": "\x1bc", "F12": "\x1bd",
  "F13": "\x1be", "F14": "\x1bf", "F15": "\x1bg", "F16": "\x1bh",

  "S-F1": "\x1bP", "S-F2": "\x1bQ", "S-F3": "\x1bR", "S-F4": "\x1bS",
  "S-F5": "\x1bT", "S-F6": "\x1bU", "S-F7": "\x1bV", "S-F8": "\x1bW",
  "S-F9": "\x1bA", "S-F10": "\x1bB", "S-F11": "\x1bC", "S-F12": "\x1bD",
  "S-F13": "\x1bE", "S-F14": "\x1bF", "S-F15": "\x1bG", "S-F16": "\x1bH",
};

// Map keyboard F-key names (from KeyboardEvent.key) to our sequence key names
const FKEY_MAP: Record<string, { normal: string; shift: string }> = {
  "F1": { normal: "F1", shift: "S-F1" }, "F2": { normal: "F2", shift: "S-F2" },
  "F3": { normal: "F3", shift: "S-F3" }, "F4": { normal: "F4", shift: "S-F4" },
  "F5": { normal: "F5", shift: "S-F5" }, "F6": { normal: "F6", shift: "S-F6" },
  "F7": { normal: "F7", shift: "S-F7" }, "F8": { normal: "F8", shift: "S-F8" },
  "F9": { normal: "F9", shift: "S-F9" }, "F10": { normal: "F10", shift: "S-F10" },
  "F11": { normal: "F11", shift: "S-F11" }, "F12": { normal: "F12", shift: "S-F12" },
  "F13": { normal: "F13", shift: "S-F13" }, "F14": { normal: "F14", shift: "S-F14" },
  "F15": { normal: "F15", shift: "S-F15" }, "F16": { normal: "F16", shift: "S-F16" },
};

// ─── HP 6530 → ANSI/VT Escape Sequence Translator ───
// Converts 6530-specific sequences to ANSI equivalents that xterm.js can render.
// This enables block-mode form applications (DBU, Pathway, TEDIT) to display correctly.
function translate6530ToAnsi(data: string): string {
  let result = '';
  let i = 0;

  while (i < data.length) {
    // Check for ESC (0x1b)
    if (data[i] === '\x1b' && i + 1 < data.length) {
      const next = data[i + 1];

      // ── ANSI CSI pass-through: ESC [ ... ──
      // These are already valid ANSI sequences — pass through completely
      if (next === '[') {
        let j = i + 2;
        // Skip parameter bytes (0x20-0x3f: digits, semicolons, ?, etc.)
        while (j < data.length && data.charCodeAt(j) >= 0x20 && data.charCodeAt(j) <= 0x3f) j++;
        // Include the final byte (0x40-0x7e: letter)
        if (j < data.length) j++;
        result += data.substring(i, j);
        i = j;
        continue;
      }

      // ── ANSI SS3 pass-through: ESC O ... ──
      if (next === 'O' && i + 2 < data.length) {
        result += data.substring(i, i + 3);
        i += 3;
        continue;
      }

      // ── 6530 Cursor Addressing: ESC = row col ──
      // Row and col are single bytes, space-offset (actual = byte - 0x20)
      // ANSI uses 1-based indexing, so: row = byte - 0x20 + 1
      if (next === '=' && i + 3 < data.length) {
        const row = data.charCodeAt(i + 2) - 0x20 + 1;
        const col = data.charCodeAt(i + 3) - 0x20 + 1;
        result += `\x1b[${Math.max(1, row)};${Math.max(1, col)}H`;
        i += 4;
        continue;
      }

      // ── 6530 Display Enhancement: ESC 6 attr ──
      // Sets field attribute (underline, blink, reverse, dim)
      if (next === '6') {
        if (i + 2 < data.length) {
          const attr = data.charCodeAt(i + 2);
          let ansiAttr = '0'; // default reset
          if (attr & 0x01) ansiAttr = '4';       // underline
          else if (attr & 0x02) ansiAttr = '5';  // blink
          else if (attr & 0x04) ansiAttr = '7';  // reverse
          else if (attr & 0x08) ansiAttr = '2';  // dim/half-bright
          result += `\x1b[${ansiAttr}m`;
          i += 3;
        } else {
          result += '\x1b[4m'; // default to underline
          i += 2;
        }
        continue;
      }

      // ── 6530 single-character escape sequences ──
      switch (next) {
        // Cursor movement
        case 'A': result += '\x1b[A'; i += 2; continue; // cursor up
        case 'B': result += '\x1b[B'; i += 2; continue; // cursor down
        case 'C': result += '\x1b[C'; i += 2; continue; // cursor right
        case 'D': result += '\x1b[D'; i += 2; continue; // cursor left
        case 'H': result += '\x1b[H'; i += 2; continue; // cursor home

        // Erase operations
        case 'I': result += '\x1b[0J'; i += 2; continue;       // erase to end of display
        case 'J': result += '\x1b[0K'; i += 2; continue;       // erase to end of line
        case 'K': result += '\x1b[2J\x1b[H'; i += 2; continue; // clear entire screen + home
        case 'L': result += '\x1b[1L'; i += 2; continue;       // insert line
        case 'M': result += '\x1b[1M'; i += 2; continue;       // delete line

        // Field protection markers
        case ')': result += '\x1b[2m'; i += 2; continue; // start protected field (dim)
        case '(': result += '\x1b[0m'; i += 2; continue; // end protected / start unprotected

        // Display enhancement end
        case '7': result += '\x1b[0m'; i += 2; continue; // reset all attributes

        // Block/conversational mode signals — silently consume
        case 'b': i += 2; continue; // set block mode
        case 'c': i += 2; continue; // set conversational mode

        // Tab operations
        case 'i': result += '\t'; i += 2; continue;     // forward tab
        case '1': result += '\x1b[Z'; i += 2; continue; // back tab

        // Line operations
        case 'T': result += '\x1b[1S'; i += 2; continue; // scroll up
        case 'S': result += '\x1b[1T'; i += 2; continue; // scroll down

        default: {
          // Unknown single-char 6530 sequence — silently drop it
          // This prevents garbage from unrecognized 6530 control codes
          if ((next >= 'a' && next <= 'z') || (next >= 'A' && next <= 'Z') ||
              next === ')' || next === '(' || next === '#' || next === '&') {
            i += 2;
            continue;
          }
          // Non-letter ESC sequence — pass through as-is
          result += data[i];
          i++;
          continue;
        }
      }
    }

    // ── 6530 Control Characters ──
    // DC1 (0x11) / DC3 (0x13) — start/end of message in WRITEREAD — silently consume
    if (data[i] === '\x11' || data[i] === '\x13') {
      i++;
      continue;
    }

    // Regular character — pass through
    result += data[i];
    i++;
  }

  return result;
}

import { Icons } from "./Icons";

export function TerminalComponent({
  sessionId,
  onDisconnect: _onDisconnect,
  fontSize = 14,
  themeName = "Safar Dark",
  fontFamily = "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
  fontWeight = "normal",
  lineHeight = 1.2,
  cursorStyle = "block",
  cursorBlink = true,
  scrollback = 1000,
  bellSound = true,
  copyOnSelect = true,
  backspaceMode,
  termType,
  isVisible = true,
  useCustomColors = false,
  customForeground = "#e6edf3",
  customBackground = "#0d1117",
  sessionTimeout = 120,
  onTitleChange
}: TerminalProps) {
  // HP NonStop 6530 detection — match all valid 6530 terminal type strings
  const is6530 = !!termType && ["TN6530", "TN6530-8", "6530", "653X", "TANDEM"].includes(termType);
  const is6530Ref = useRef(is6530);
  useEffect(() => { is6530Ref.current = is6530; }, [is6530]);
  // Choose the right sequence map based on terminal type
  const CONTROL_SEQUENCES = is6530 ? HP_6530_SEQUENCES : VT_SEQUENCES;
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const backspaceModeRef = useRef(backspaceMode); // Track latest backspace mode for closure
  const blockBufferRef = useRef(""); // Buffer for Inbuilt Block Mode

  // UI State
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showToolbar, setShowToolbar] = useState(false); // Collapsible toolbar state
  const [showHistoryModal, setShowHistoryModal] = useState(false); // History Modal State
  const [isBlockMode, setIsBlockMode] = useState(is6530); // Enabled for 6530 sessions
  const isBlockModeRef = useRef(is6530); // Ref for closure sync
  const historyBufferRef = useRef(""); // Generic command buffer for history
  const hpNsUserRef = useRef(""); // Tracks potential HP NS dynamic username

  // Inactivity State
  const [isInactive, setIsInactive] = useState(false);
  const lastActivityRef = useRef(Date.now());          // Tracks last USER keystroke (not server data)
  const lastTickRef = useRef(Date.now());               // Tracks last timer tick to detect machine sleep
  const onDisconnectRef = useRef(_onDisconnect);        // Stable ref so sleep handler doesn't stale-close
  useEffect(() => { onDisconnectRef.current = _onDisconnect; }, [_onDisconnect]);

  // Inactivity Timer Effect
  // Tracks USER-ONLY keystrokes (not server data) — so background noise doesn't reset the idle clock.
  // Also detects machine sleep by measuring the gap between consecutive 30s ticks.
  useEffect(() => {
    if (sessionTimeout <= 0) return;

    const SLEEP_THRESHOLD_MS = 60_000; // >60s between ticks = machine likely slept

    const interval = setInterval(() => {
      const now = Date.now();
      const tickGap = now - lastTickRef.current;
      lastTickRef.current = now;

      // --- Sleep Detection ---
      // If tick gap > threshold, machine slept and SSH TCP is dead.
      // Show the disconnect overlay. User chooses to close or try resume.
      if (tickGap > SLEEP_THRESHOLD_MS) {
        setIsInactive(true);
        return;
      }

      // --- Inactivity Detection ---
      if (!isInactive) {
        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
        const timeoutMs = sessionTimeout * 60 * 1000;
        if (timeSinceLastActivity > timeoutMs) {
          setIsInactive(true);
          // Don't call onDisconnect here — let user decide via the overlay buttons
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [sessionTimeout, isInactive]);

  // Send data to SSH server
  const sendData = useCallback(
    async (data: string) => {
      try {
        await invoke("ssh_send", { sessionId, data });
      } catch (error) {
        // Error shown in terminal output
        if (xtermRef.current) {
          xtermRef.current.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`);
        }
      }
    },
    [sessionId]
  );

  // Safe fit function
  const safeFit = useCallback(() => {
    // Only fit if visible and refs exist
    if (!isVisible) return;
    if (!terminalRef.current || !xtermRef.current || !fitAddonRef.current) return;

    // Check strict dimensions to avoid XTerm RenderService crash
    if (terminalRef.current.clientWidth === 0 || terminalRef.current.clientHeight === 0) {
      // console.log("[Terminal] Skipping fit - 0 dimensions");
      return;
    }

    try {
      fitAddonRef.current.fit();
    } catch (err) {
      console.warn("[Terminal] Fit error (retrying):", err);
      setTimeout(() => {
        try {
          if (terminalRef.current?.clientWidth && terminalRef.current?.clientHeight) {
            fitAddonRef.current?.fit();
          }
        } catch (e) {
          console.warn("[Terminal] Fit retry failed:", e);
        }
      }, 100);
    }
  }, [isVisible]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure layout is updated
      setTimeout(safeFit, 50);
    }
  }, [isVisible, safeFit]);

  // Keep backspace mode ref in sync with prop
  useEffect(() => {
    backspaceModeRef.current = backspaceMode;
  }, [backspaceMode]);

  // Keep block mode ref in sync with state for xterm closure
  useEffect(() => {
    isBlockModeRef.current = isBlockMode;
  }, [isBlockMode]);

  // Initialize Terminal
  useEffect(() => {
    if (!terminalRef.current) return;



    const baseTheme = TERMINAL_THEMES[themeName].colors;
    const initialTheme = useCustomColors
      ? { ...baseTheme, foreground: customForeground, background: customBackground }
      : baseTheme;

    // Don't init if container is invalid
    if (terminalRef.current.clientWidth === 0) {
      // This might happen if tab is hidden initially.
      // We will init, but NOT fit yet.
      // Or wait? Xterm needs to open on an element. 
      // If element is display:none, xterm can open but renderer might choke on dimensions.
      // We'll proceed but rely on safeFit guarding the fit call.
    }

    const terminal = new Terminal({
      cursorBlink: cursorBlink,
      cursorStyle: cursorStyle,
      fontSize: fontSize,
      fontFamily: fontFamily,
      fontWeight: fontWeight as any, // Cast to avoid strict type mismatch if needed
      lineHeight: lineHeight,
      theme: initialTheme,
      allowProposedApi: true,
      scrollback: scrollback,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      // @ts-ignore - bellStyle exists in xterm.js but types might be outdated
      bellStyle: bellSound ? "sound" : "none",
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Helper to safely open terminal only when dimensions are valid
    const openTerminal = () => {
      if (!terminalRef.current || !xtermRef.current) return;

      // If already opened (element is set), skip
      if (xtermRef.current.element) return;

      if (terminalRef.current.clientWidth > 0 && terminalRef.current.clientHeight > 0) {
        try {
          xtermRef.current.open(terminalRef.current);
          xtermRef.current.write("\x1b[36m● Connecting to SSH session...\x1b[0m\r\n");
          safeFit();
        } catch (err) {
          console.error("[Terminal] Open error:", err);
        }
      } else {
        // console.log("[Terminal] Waiting for dimensions...");
        setTimeout(openTerminal, 50);
      }
    };

    // Attempt to open
    requestAnimationFrame(openTerminal);

    // Native OS Window Title Tracking
    terminal.onTitleChange((title) => {
      if (onTitleChange && title) {
        onTitleChange(title);
      }
    });

    // Key handlers
    terminal.attachCustomKeyEventHandler((e) => {
      // Handle Custom Backspace (use ref for current value)
      const currentBackspaceMode = backspaceModeRef.current;
      if (e.key === "Backspace" && e.type === "keydown") {
        // In 6530 block mode, handle backspace locally (modify buffer, erase from display)
        if (is6530Ref.current && isBlockModeRef.current) {
          if (blockBufferRef.current.length > 0) {
            blockBufferRef.current = blockBufferRef.current.slice(0, -1);
            terminal.write("\b \b");
          }
          return false; // Prevent xterm from processing it further
        }
        if (currentBackspaceMode === "ctrl-h") {
          sendData("\x08"); // ^H
          return false;
        } else if (currentBackspaceMode === "ctrl-?") {
          sendData("\x7f"); // ^?
          return false;
        }
      }

      // HP 6530 function key interception — send 6530-specific sequences
      if (is6530Ref.current && e.type === "keydown") {
        const fkeyEntry = FKEY_MAP[e.key];
        if (fkeyEntry) {
          const seqKey = e.shiftKey ? fkeyEntry.shift : fkeyEntry.normal;
          const seq = HP_6530_SEQUENCES[seqKey];
          if (seq) {
            e.preventDefault();
            sendData(seq);
            return false;
          }
        }
      }

      // Ctrl+F for Search
      if (e.ctrlKey && e.key === "f" && e.type === "keydown") {
        setShowSearch((prev) => !prev);
        return false; // Prevent default
      }
      // Ctrl+Shift+C for Copy
      if (e.ctrlKey && e.shiftKey && e.code === "KeyC" && e.type === "keydown") {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false;
        }
      }
      // Ctrl+Shift+V for Paste
      if (e.ctrlKey && e.shiftKey && e.code === "KeyV" && e.type === "keydown") {
        navigator.clipboard.readText().then((text) => {
          sendData(text);
        });
        return false;
      }
      return true;
    });

    // Auto Copy Selection
    terminal.onSelectionChange(() => {
      if (copyOnSelect) {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(console.error);
        }
      }
    });

    // User Input Handler (Block vs Line Mode Logic)
    terminal.onData((data) => {
      lastActivityRef.current = Date.now(); // Only user keystrokes reset idle clock — NOT server data
      if (isInactive) setIsInactive(false);  // Dismiss overlay if user types while it showed

      // Data from xterm can be multiple characters (e.g. paste) or ANSI escape sequences (arrows).
      const isEscapeSequence = data.startsWith("\x1b");

      // Block mode: enabled for HP 6530 sessions (line-at-a-time buffering)
      const isBlock = isBlockModeRef.current;

      // --- History Tracking (Both Modes) ---
      if (!isEscapeSequence) {
        if (data === "\r" || data === "\n") {
          const cmdToSave = isBlock ? blockBufferRef.current : historyBufferRef.current;
          const trimmedCmd = cmdToSave.trim();

          if (trimmedCmd) {
            addHistory(trimmedCmd);

            // --- HP NS Heuristic Tracking ---
            // Track when user executes SECOM, SECOM / SE, or OSH to switch accounts
            const upperCmd = trimmedCmd.toUpperCase();
            if (upperCmd.startsWith("SE ")) {
              const user = trimmedCmd.substring(3).trim();
              hpNsUserRef.current = user.split(' ')[0]; // Take first token as user
            } else if (upperCmd.startsWith("SECOM ")) {
              const user = trimmedCmd.substring(6).trim();
              hpNsUserRef.current = user.split(' ')[0];
            } else if (upperCmd.startsWith("OSH ") || upperCmd === "OSH") {
              // For OSH without a user, we might not know who they are, 
              // but if they pass OSH -u user, we could parse it.
              // Simple fallback: just mark as OSH user
              hpNsUserRef.current = "OSH";
            }
          }
          historyBufferRef.current = "";
        } else if (data === "\x7f" || data === "\b") {
          historyBufferRef.current = historyBufferRef.current.slice(0, -1);
        } else if (data === "\x03" || data === "\x04") {
          historyBufferRef.current = "";
        } else {
          historyBufferRef.current += data;
        }
      }

      // LINE MODE (Guardian)
      if (!isBlock) {
        sendData(data); // Immediate transmission
        return;
      }

      // -----------------------------------------------------------------
      // BLOCK MODE LOGIC (DBU/Pathway Forms)
      // -----------------------------------------------------------------

      // Control sequences bypass buffer
      if (isEscapeSequence) {
        sendData(data);
        return;
      }

      // Check for Submit (Enter / \r)
      if (data === "\r" || data === "\n") {
        const bufferedCommand = blockBufferRef.current;
        // Erase locally-echoed text so it doesn't show after submit
        let erasure = "";
        for (let i = 0; i < bufferedCommand.length; i++) {
          erasure += "\b \b";
        }
        terminal.write(erasure);
        // Send the buffered input to the server
        sendData(bufferedCommand + "\r");

        blockBufferRef.current = "";
        return;
      }

      // Check for Backspace/Delete (\x7f or \b)
      if (data === "\x7f" || data === "\b") {
        if (blockBufferRef.current.length > 0) {
          blockBufferRef.current = blockBufferRef.current.slice(0, -1);
          terminal.write("\b \b");
        }
        return;
      }

      // Check for Ctrl+C (\x03) or Ctrl+D (\x04)
      if (data === "\x03" || data === "\x04") {
        blockBufferRef.current = "";
        sendData(data);
        return;
      }

      // Accumulate standard printable characters
      blockBufferRef.current += data;
      terminal.write(data);
    });

    terminal.onResize(({ cols, rows }) => {
      invoke("ssh_resize", { sessionId, cols, rows }).catch(console.error);
    });

    // Listen for data
    let unlisten: UnlistenFn | null = null;
    let isMounted = true;

    listen<TerminalData>("terminal-data", (event) => {
      if (event.payload.session_id === sessionId) {
        // NOTE: Do NOT update lastActivityRef here.
        // Server keepalives and background noise would constantly reset the idle clock,
        // preventing the inactivity timeout from ever firing correctly.

        const incomingData = event.payload.data;

        // --- 6530 Block Mode Detection & Sequence Filtering ---
        if (is6530Ref.current) {
          // Detect block-mode form entry (screen clear, alt buffer)
          if (incomingData.includes("\x1b[?1049h") || incomingData.includes("\x1b[?47h") || incomingData.includes("\x1b[2J")) {
            setIsBlockMode(true);
            isBlockModeRef.current = true;
          }
          // Detect block-mode form exit
          else if (incomingData.includes("\x1b[?1049l") || incomingData.includes("\x1b[?47l")) {
            setIsBlockMode(true); // Stay in block mode for 6530 (conversational is still buffered)
            isBlockModeRef.current = true;
            blockBufferRef.current = "";
          }

          // Translate 6530-specific escape sequences to ANSI equivalents for xterm.js
          const translatedData = translate6530ToAnsi(incomingData);

          terminal.write(translatedData);
        } else {
          // Non-6530 sessions: standard handling

          // --- Packet Sniffing for Block Mode Heuristic ---
          if (incomingData.includes("\x1b[?1049h") || incomingData.includes("\x1b[?47h") || incomingData.includes("\x1b[2J")) {
            // setIsBlockMode(true); // Disabled for non-6530
          }
          else if (incomingData.includes("\x1b[?1049l") || incomingData.includes("\x1b[?47l")) {
            setIsBlockMode(false);
            blockBufferRef.current = "";
          }

          // --- Execute HP NS Heuristic Sync on Prompts ---
          if (hpNsUserRef.current && onTitleChange) {
            if (incomingData.includes(">") || incomingData.includes("$") || incomingData.includes("#")) {
              onTitleChange(hpNsUserRef.current);
            }
          }

          terminal.write(incomingData);
        }
      }
    }).then((fn) => {
      if (!isMounted) {
        fn(); // Unlisten immediately if already unmounted
      } else {
        unlisten = fn;
        unlistenRef.current = fn;
        terminal.write("\x1b[32m● Connected! Waiting for shell...\x1b[0m\r\n\r\n");
      }
    });

    const handleResize = () => safeFit();
    window.addEventListener("resize", handleResize);

    requestAnimationFrame(() => {
      setTimeout(() => {
        safeFit();
        // Initial sync of size - but only if valid
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current;
          // Only resize if cols/rows are valid (>0)
          if (cols > 0 && rows > 0) {
            invoke("ssh_resize", { sessionId, cols, rows }).catch(console.error);
          }
          terminal.focus();
        }
      }, 50);
    });

    return () => {
      isMounted = false;
      window.removeEventListener("resize", handleResize);
      if (unlisten) unlisten();
      if (unlistenRef.current) unlistenRef.current();
      terminal.dispose();
    };
  }, [sessionId, sendData]); // Removed safeFit to prevent re-init on visibility change // Important: Adding dependencies here might cause re-init. Ideally we want to update options dynamically instead of re-init.

  // Update Settings Effect (Dynamic Updates)
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      xtermRef.current.options.fontFamily = fontFamily;
      xtermRef.current.options.fontWeight = fontWeight as any;
      xtermRef.current.options.lineHeight = lineHeight;
      xtermRef.current.options.cursorStyle = cursorStyle;
      xtermRef.current.options.cursorBlink = cursorBlink;
      xtermRef.current.options.scrollback = scrollback;
      const baseTheme = TERMINAL_THEMES[themeName].colors;
      xtermRef.current.options.theme = useCustomColors
        ? { ...baseTheme, foreground: customForeground, background: customBackground }
        : baseTheme;
      safeFit();
    }
  }, [fontSize, themeName, fontFamily, fontWeight, lineHeight, cursorStyle, cursorBlink, scrollback, useCustomColors, customForeground, customBackground, safeFit]);

  // Search Effect
  useEffect(() => {
    if (searchAddonRef.current) {
      if (searchTerm) {
        searchAddonRef.current.findNext(searchTerm, { incremental: true });
      } else {
        searchAddonRef.current.clearDecorations();
      }
    }
  }, [searchTerm]);

  const findNext = () => searchAddonRef.current?.findNext(searchTerm);
  const findPrev = () => searchAddonRef.current?.findPrevious(searchTerm);

  return (
    <div className="terminal-container" style={{ backgroundColor: useCustomColors ? customBackground : TERMINAL_THEMES[themeName].colors.background, display: "flex", flexDirection: "column" }}>

      {/* Toolbar Trigger Area */}
      <div style={{ position: "absolute", top: 4, right: 12, zIndex: 10, display: "flex", alignItems: "center", gap: "8px" }}>

        {/* Terminal Mode Pill Indicator */}
        <div style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
          padding: "2px 8px", borderRadius: "12px", fontSize: "11px",
          color: is6530 ? "#60a5fa" : "var(--text-muted)",
          display: "flex", alignItems: "center", gap: "6px"
        }}>
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: isBlockMode ? "#60a5fa" : "var(--text-muted)",
            boxShadow: isBlockMode ? "0 0 6px rgba(96,165,250,0.5)" : "none"
          }} />
          {is6530 ? (isBlockMode ? "6530 Block" : "6530 Conv.") : (isBlockMode ? "Block Mode" : "Line Mode")}
        </div>

        {/* Clear Button */}
        <button
          className="btn btn-secondary"
          style={{ padding: "4px 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", color: "var(--col-red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
          onClick={() => {
            blockBufferRef.current = "";
            xtermRef.current?.clear();
            terminalRef.current?.focus();
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          title="Clear Terminal Display"
        >
          Clear
        </button>

        {/* History Button */}
        <button
          className="btn btn-secondary"
          style={{ padding: "4px 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}
          onClick={() => setShowHistoryModal(true)}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          title="Command History"
        >
          <Icons.Clock style={{ width: 12, height: 12 }} />
          History
        </button>


        <button
          className="btn btn-secondary"
          style={{ padding: "4px 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}
          onClick={() => {
            setShowToolbar(!showToolbar);
            terminalRef.current?.focus();
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          title="Toggle Control Sequences"
        >
          {showToolbar ? <Icons.CaretUp style={{ width: 12, height: 12 }} /> : <Icons.CaretDown style={{ width: 12, height: 12 }} />}
          {showToolbar ? "Hide Controls" : "Show Controls"}
        </button>
      </div>

      {/* Control Sequence Toolbar Header */}
      {
        showToolbar && (
          <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
            {/* Row 1 */}
            <div style={{
              display: "flex", gap: "6px", padding: "4px 6px 2px 6px",
              background: "rgba(0, 0, 0, 0.2)",
              overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0
            }}>
              {["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13", "F14", "F15", "F16"].map(key => (
                <button
                  key={key}
                  onClick={() => {
                    sendData(CONTROL_SEQUENCES[key]);
                    terminalRef.current?.focus();
                  }}
                  style={{
                    padding: "4px 8px", background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#e6edf3", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600, flexShrink: 0
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
                  title={`Send ${key}`}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Row 2 */}
            <div style={{
              display: "flex", gap: "6px", padding: "2px 6px 6px 6px",
              background: "rgba(0, 0, 0, 0.2)",
              overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0
            }}>
              {["S-F1", "S-F2", "S-F3", "S-F4", "S-F5", "S-F6", "S-F7", "S-F8", "S-F9", "S-F10", "S-F11", "S-F12", "S-F13", "S-F14", "S-F15", "S-F16", "Ctrl+C", "Up", "Down"].map(key => (
                <button
                  key={key}
                  onClick={() => {
                    sendData(CONTROL_SEQUENCES[key]);
                    terminalRef.current?.focus();
                  }}
                  style={{
                    padding: "4px 8px", background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#e6edf3", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600, flexShrink: 0
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
                  title={`Send ${key}`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        )
      }

      {/* Terminal View */}
      <div
        ref={terminalRef}
        style={{ flex: 1, overflow: "hidden", padding: "8px" }}
        className="xterm-wrapper"
      />

      {/* Search Bar */}
      {
        showSearch && (
          <div className="terminal-search-bar">
            <input
              autoFocus
              type="text"
              className="terminal-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.shiftKey ? findPrev() : findNext();
                }
                if (e.key === "Escape") setShowSearch(false);
              }}
              placeholder="Find..."
            />
            <button onClick={findPrev} className="icon-btn" style={{ width: 24, height: 24 }}><Icons.CaretUp /></button>
            <button onClick={findNext} className="icon-btn" style={{ width: 24, height: 24 }}><Icons.CaretDown /></button>
            <div className="terminal-search-divider" />
            <button onClick={() => setShowSearch(false)} className="icon-btn" style={{ width: 24, height: 24 }}><Icons.X /></button>
          </div>
        )
      }

      {/* History Modal Viewer */}
      {
        showHistoryModal && (
          <CommandHistoryModal
            onClose={() => setShowHistoryModal(false)}
            onSelect={(cmd) => {
              if (isBlockModeRef.current) {
                blockBufferRef.current += cmd;
                xtermRef.current?.write(cmd);
                xtermRef.current?.focus();
              } else {
                sendData(cmd + "\r");
                xtermRef.current?.focus();
              }
              setShowHistoryModal(false);
            }}
            theme={
              useCustomColors
                ? { ...TERMINAL_THEMES[themeName].colors, foreground: customForeground, background: customBackground }
                : TERMINAL_THEMES[themeName].colors
            }
          />
        )
      }

      {isInactive && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.82)",
          backdropFilter: "blur(6px)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          gap: "0",
        }}>
          <Icons.Terminal style={{ width: 48, height: 48, marginBottom: "16px", opacity: 0.5 }} />
          <h2 style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: 600 }}>Session Disconnected</h2>
          <p style={{ margin: "0 0 28px 0", color: "var(--text-muted, #94a3b8)", fontSize: "14px", textAlign: "center", maxWidth: "280px", lineHeight: 1.5 }}>
            The session was closed due to inactivity or the system went to sleep.
          </p>
          <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
            <button
              onClick={() => {
                setIsInactive(false);
                lastActivityRef.current = Date.now();
                lastTickRef.current = Date.now();
                terminalRef.current?.focus();
              }}
              style={{
                padding: "10px 22px",
                fontSize: "13px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "7px",
                borderRadius: "8px",
                border: "1px solid rgba(34, 197, 94, 0.5)",
                background: "rgba(34, 197, 94, 0.12)",
                color: "#22c55e",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(34, 197, 94, 0.22)"; e.currentTarget.style.borderColor = "#22c55e"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(34, 197, 94, 0.12)"; e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.5)"; }}
            >
              <Icons.Zap style={{ width: 14, height: 14 }} />
              Try Reconnect
            </button>
            <button
              onClick={() => {
                setIsInactive(false);
                _onDisconnect?.();
              }}
              style={{
                padding: "10px 22px",
                fontSize: "13px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "7px",
                borderRadius: "8px",
                border: "1px solid rgba(239, 68, 68, 0.5)",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#ef4444",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.22)"; e.currentTarget.style.borderColor = "#ef4444"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)"; e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.5)"; }}
            >
              <Icons.X style={{ width: 14, height: 14 }} />
              Close Session
            </button>
          </div>
        </div>
      )}
    </div >
  );
}

export default TerminalComponent;
