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

// Map for common control sequences
const CONTROL_SEQUENCES: Record<string, string> = {
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
  isVisible = true,
  useCustomColors = false,
  customForeground = "#e6edf3",
  customBackground = "#0d1117",
  sessionTimeout = 120,
  onTitleChange
}: TerminalProps) {
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
  const [isBlockMode, setIsBlockMode] = useState(false); // Auto-detected HP NS state
  const isBlockModeRef = useRef(false); // Ref for closure sync
  const historyBufferRef = useRef(""); // Generic command buffer for history
  const hpNsUserRef = useRef(""); // Tracks potential HP NS dynamic username

  // Inactivity State
  const [isInactive, setIsInactive] = useState(false);
  const lastActivityRef = useRef(Date.now());

  // Inactivity Timer Effect
  useEffect(() => {
    if (sessionTimeout <= 0) return;

    const interval = setInterval(() => {
      if (!isInactive) {
        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
        const timeoutMs = sessionTimeout * 60 * 1000;
        if (timeSinceLastActivity > timeoutMs) {
          setIsInactive(true);
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
        if (currentBackspaceMode === "ctrl-h") {
          sendData("\x08"); // ^H
          return false;
        } else if (currentBackspaceMode === "ctrl-?") {
          sendData("\x7f"); // ^?
          return false;
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
      lastActivityRef.current = Date.now(); // Update activity on keystrokes

      // Data from xterm can be multiple characters (e.g. paste) or ANSI escape sequences (arrows).
      const isEscapeSequence = data.startsWith("\x1b");

      // Check current auto-detected mode (Temporarily Disabled - Forced to Line Mode)
      const isBlock = false; // isBlockModeRef.current;

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
            if (upperCmd.startsWith("SECOM / SE ")) {
              const user = trimmedCmd.substring(11).trim();
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
        let erasure = "";
        for (let i = 0; i < bufferedCommand.length; i++) {
          erasure += "\b \b";
        }
        terminal.write(erasure);
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
        lastActivityRef.current = Date.now(); // Update activity on server data

        const incomingData = event.payload.data;

        // --- Packet Sniffing for Block Mode Heuristic ---
        // (TEMPORARILY DISABLED: Causing adverse effects on HP NS Guardian)
        // If the server clears the screen or enters alt buffer, toggle Block Mode ON
        if (incomingData.includes("\x1b[?1049h") || incomingData.includes("\x1b[?47h") || incomingData.includes("\x1b[2J")) {
          // setIsBlockMode(true);
        }
        // If the server disables alt buffer, toggle Block Mode OFF
        else if (incomingData.includes("\x1b[?1049l") || incomingData.includes("\x1b[?47l")) {
          setIsBlockMode(false);
          blockBufferRef.current = ""; // Clear active buffer just in case
        }

        // --- Execute HP NS Heuristic Sync on Prompts ---
        // Basic detection for standard HP NS prompts (like `1> ` or `$ `)
        // If we have a pending user switch from history and hit a clean prompt, update it
        if (hpNsUserRef.current && onTitleChange) {
          // Very simple check: if line contains > or # or $, assume prompt returned
          if (incomingData.includes(">") || incomingData.includes("$") || incomingData.includes("#")) {
            onTitleChange(hpNsUserRef.current);
            // We keep it set so it persists, until they switch again.
          }
        }

        terminal.write(incomingData);
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

        {/* Auto-Detection Pill Indicator */}
        <div style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
          padding: "2px 8px", borderRadius: "12px", fontSize: "11px",
          color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px"
        }}>
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: isBlockMode ? "var(--accent-secondary)" : "var(--text-muted)",
            boxShadow: isBlockMode ? "0 0 6px var(--accent-secondary)" : "none"
          }} />
          {isBlockMode ? "Block Mode" : "Line Mode"}
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
          />
        )
      }

      {/* Inactivity Overlay */}
      {isInactive && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(4px)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white"
        }}>
          <Icons.Terminal style={{ width: 48, height: 48, marginBottom: "16px", opacity: 0.8 }} />
          <h2 style={{ margin: "0 0 8px 0", fontSize: "20px" }}>Session Inactive</h2>
          <p style={{ margin: "0 0 24px 0", color: "var(--text-muted)", fontSize: "14px" }}>
            Terminal locked after {sessionTimeout} minutes of inactivity.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setIsInactive(false);
              lastActivityRef.current = Date.now();
              terminalRef.current?.focus();
            }}
            style={{ padding: "8px 24px", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Icons.Zap style={{ width: 14, height: 14 }} />
            Reconnect
          </button>
        </div>
      )}
    </div >
  );
}

export default TerminalComponent;
