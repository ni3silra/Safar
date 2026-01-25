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
}

// Minimal Icons for Terminal UI
interface TerminalData {
  session_id: string;
  data: string;
}

const Icons = {
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z" />
    </svg>
  ),
  Settings: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z" />
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 01-1.255-.52l-.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319z" />
    </svg>
  ),
  Close: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M3.5 3.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  Up: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 5l-4 4h8l-4-4z" />
    </svg>
  ),
  Down: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 11l4-4H4l4 4z" />
    </svg>
  ),
  Copy: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H4zm0 2h8v8H4V4zm-3 2a1 1 0 011-1h.5a.5.5 0 010 1H2v9a1 1 0 001 1h9a.5.5 0 010 1H3a2 2 0 01-2-2V6z" />
    </svg>
  )
};

export function TerminalComponent({ sessionId, onDisconnect: _onDisconnect, fontSize = 14, themeName = "Safar Dark" }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // UI State
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Local settings UI toggle removed (controlled by App)

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
  }, []);

  // Initialize Terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    console.log("[Terminal] Initializing for session:", sessionId);

    const initialTheme = TERMINAL_THEMES[themeName].colors;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: fontSize,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      theme: initialTheme,
      allowProposedApi: true,
      scrollback: 10000,
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
    listen<TerminalData>("terminal-data", (event) => {
      if (event.payload.session_id === sessionId) {
        terminal.write(event.payload.data);
      }
    }).then((fn) => {
      unlisten = fn;
      unlistenRef.current = fn;
      terminal.write("\x1b[32m● Connected! Waiting for shell...\x1b[0m\r\n\r\n");
    });

    const handleResize = () => safeFit();
    window.addEventListener("resize", handleResize);

    requestAnimationFrame(() => {
      setTimeout(() => {
        safeFit();
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current;
          invoke("ssh_resize", { sessionId, cols, rows }).catch(console.error);
        }
        terminal.focus();
      }, 50);
    });

    return () => {
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
      xtermRef.current.options.theme = TERMINAL_THEMES[themeName].colors;
      safeFit();
    }
  }, [fontSize, themeName, safeFit]);

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
          <button onClick={findPrev} className="icon-btn-small" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}><Icons.Up /></button>
          <button onClick={findNext} className="icon-btn-small" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}><Icons.Down /></button>
          <div style={{ width: "1px", height: "12px", background: "var(--border-color)", margin: "0 2px" }} />
          <button onClick={() => setShowSearch(false)} className="icon-btn-small" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}><Icons.Close /></button>
        </div>
      )}


    </div>
  );
}

export default TerminalComponent;
