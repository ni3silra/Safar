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
  backspaceMode?: string;
  isVisible?: boolean;
}

// Minimal Icons for Terminal UI
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
  backspaceMode,
  isVisible = true
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // UI State
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Send data to SSH server
  const sendData = useCallback(
    async (data: string) => {
      try {
        await invoke("ssh_send", { sessionId, data });
      } catch (error) {
        console.error("[Terminal] Failed to send data:", error);
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

    if (fitAddonRef.current && xtermRef.current) {
      try {
        fitAddonRef.current.fit();
      } catch (err) {
        console.warn("[Terminal] Fit error (retrying):", err);
        setTimeout(() => {
          try {
            fitAddonRef.current?.fit();
          } catch (e) {
            console.warn("[Terminal] Fit retry failed:", e);
          }
        }, 100);
      }
    }
  }, [isVisible]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure layout is updated
      setTimeout(safeFit, 50);
    }
  }, [isVisible, safeFit]);

  // Initialize Terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    console.log("[Terminal] Initializing for session:", sessionId);

    const initialTheme = TERMINAL_THEMES[themeName].colors;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: fontSize,
      fontFamily: fontFamily,
      theme: initialTheme,
      allowProposedApi: true,
      scrollback: 10000,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
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

    terminal.open(terminalRef.current);
    terminal.write("\x1b[36m● Connecting to SSH session...\x1b[0m\r\n");

    // Key handlers
    terminal.attachCustomKeyEventHandler((e) => {
      // Handle Custom Backspace
      if (e.key === "Backspace" && e.type === "keydown") {
        if (backspaceMode === "ctrl-h") {
          sendData("\x08"); // ^H
          return false;
        } else if (backspaceMode === "ctrl-?") {
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
  }, [sessionId, sendData, safeFit]);

  // Update Settings Effect
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      xtermRef.current.options.fontFamily = fontFamily;
      xtermRef.current.options.theme = TERMINAL_THEMES[themeName].colors;
      safeFit();
    }
  }, [fontSize, themeName, fontFamily, safeFit]);

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
    <div style={{ position: "relative", width: "100%", height: "100%", backgroundColor: TERMINAL_THEMES[themeName].colors.background }}>
      <div
        ref={terminalRef}
        style={{
          width: "100%",
          height: "100%",
          padding: "8px",
        }}
      />

      {/* Search Bar */}
      {showSearch && (
        <div style={{
          position: "absolute",
          top: "10px",
          right: "60px",
          zIndex: 20,
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          padding: "4px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
          gap: "4px"
        }}>
          <input
            autoFocus
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.shiftKey ? findPrev() : findNext();
              }
              if (e.key === "Escape") setShowSearch(false);
            }}
            placeholder="Find..."
            style={{
              background: "var(--input-bg)",
              border: "none",
              color: "var(--text-primary)",
              outline: "none",
              fontSize: "12px",
              padding: "2px 4px",
              width: "120px",
              borderRadius: "2px"
            }}
          />
          <button onClick={findPrev} className="icon-btn-small" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}><Icons.CaretUp /></button>
          <button onClick={findNext} className="icon-btn-small" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}><Icons.CaretDown /></button>
          <div style={{ width: "1px", height: "12px", background: "var(--border-color)", margin: "0 2px" }} />
          <button onClick={() => setShowSearch(false)} className="icon-btn-small" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}><Icons.X /></button>
        </div>
      )}
    </div>
  );
}

export default TerminalComponent;
