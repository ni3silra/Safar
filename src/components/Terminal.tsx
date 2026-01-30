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
}

interface TerminalData {
  session_id: string;
  data: string;
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
  isVisible = true,
  useCustomColors = false,
  customForeground = "#e6edf3",
  customBackground = "#0d1117"
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const backspaceModeRef = useRef(backspaceMode); // Track latest backspace mode for closure

  // UI State
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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

    terminal.onData((data) => sendData(data));

    terminal.onResize(({ cols, rows }) => {
      invoke("ssh_resize", { sessionId, cols, rows }).catch(console.error);
    });

    // Listen for data
    let unlisten: UnlistenFn | null = null;
    let isMounted = true;

    listen<TerminalData>("terminal-data", (event) => {
      if (event.payload.session_id === sessionId) {
        terminal.write(event.payload.data);
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
    <div className="terminal-container" style={{ backgroundColor: useCustomColors ? customBackground : TERMINAL_THEMES[themeName].colors.background }}>
      {/* We keep inline background color because it comes from the JS theme object which is dynamic */}
      <div
        ref={terminalRef}
        className="terminal-viewport"
      />

      {/* Search Bar */}
      {showSearch && (
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
      )}
    </div>
  );
}

export default TerminalComponent;
