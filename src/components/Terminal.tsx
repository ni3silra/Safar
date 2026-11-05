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
import { Screen6530 } from "../lib/Screen6530";
import { CopilotPanel } from "./Copilot/CopilotPanel";

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
  protocol?: "ssh" | "telnet";
  serviceName?: string;
  isNonStop?: boolean;
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

// HP NonStop 6530 function key sequences (per 6530 Programmer's Guide Table 2-7 & Table 3-11)
// Unshifted F1-F16 → 0x40 ('@') through 0x4F ('O')
// Shifted S-F1-S-F16 → 0x60 ('`') through 0x6F ('o')
const HP_6530_SEQUENCES: Record<string, string> = {
  "Ctrl+C": "\x03",
  "Up": "\x1b[A",
  "Down": "\x1b[B",
  "F1": "\x01@", "F2": "\x01A", "F3": "\x01B", "F4": "\x01C",
  "F5": "\x01D", "F6": "\x01E", "F7": "\x01F", "F8": "\x01G",
  "F9": "\x01H", "F10": "\x01I", "F11": "\x01J", "F12": "\x01K",
  "F13": "\x01L", "F14": "\x01M", "F15": "\x01N", "F16": "\x01O",

  "S-F1": "\x01`", "S-F2": "\x01a", "S-F3": "\x01b", "S-F4": "\x01c",
  "S-F5": "\x01d", "S-F6": "\x01e", "S-F7": "\x01f", "S-F8": "\x01g",
  "S-F9": "\x01h", "S-F10": "\x01i", "S-F11": "\x01j", "S-F12": "\x01k",
  "S-F13": "\x01l", "S-F14": "\x01m", "S-F15": "\x01n", "S-F16": "\x01o",
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

// Map Alt+F1..Alt+F6 for keyboards without physical F11..F16 keys
const ALT_FKEY_MAP: Record<string, { normal: string; shift: string }> = {
  "F1": { normal: "F11", shift: "S-F11" },
  "F2": { normal: "F12", shift: "S-F12" },
  "F3": { normal: "F13", shift: "S-F13" },
  "F4": { normal: "F14", shift: "S-F14" },
  "F5": { normal: "F15", shift: "S-F15" },
  "F6": { normal: "F16", shift: "S-F16" },
};

/**
 * Translates a 6530 on-screen or physical function key command into the key-id byte
 * per Tandem 6530 Specification Section 2 & 4.3:
 * - F1..F12: base 64..75 (Shift: 96..107, Ctrl/Alt: 74..85, Ctrl+Shift: 106..117)
 * - F13..F16: base F3..F6 with Ctrl modifier: 66+10 = 76..79 (Shift+Ctrl: 66+10+32 = 108..111)
 */
export function translateFunctionKeyCommand(command: string): number | null {
  const isShift = command.startsWith("SF") || command.startsWith("S-F");
  const rawNum = isShift
    ? (command.startsWith("SF") ? command.slice(2) : command.slice(3))
    : (command.startsWith("F") ? command.slice(1) : "");
  const num = parseInt(rawNum, 10);
  if (isNaN(num) || num < 1 || num > 16) return null;

  if (num <= 12) {
    return (isShift ? 96 : 64) + (num - 1);
  } else {
    // F13..F16 map to F3..F6 with Ctrl (+10): 66+10=76..79; Shifted: 108..111
    return (isShift ? 108 : 76) + (num - 13);
  }
}

// ─── HP 6530 → ANSI/VT Escape Sequence Translator ───
// Converts 6530-specific sequences to ANSI equivalents that xterm.js can render.
// Supports both Conversational Mode and Block Mode (multi-page memory, TEDIT, Pathway, DBU).

export interface ScreenCommand {
  type:
    | 'enterBlockMode'
    | 'enterConvMode'
    | 'protectSubEnter'
    | 'protectSubExit'
    | 'selectPage'
    | 'displayPage'
    | 'setMaxPages'
    | 'bufferAddress'
    | 'cursor'
    | 'cursorOnly'
    | 'startField'
    | 'defineFieldAttr'
    | 'videoAttr'
    | 'protectStart'
    | 'protectEnd'
    | 'setTabStop'
    | 'clearTabStops'
    | 'unlockKeyboard'
    | 'lockKeyboard'
    | 'eraseEop'
    | 'eraseEol'
    | 'clearMemory'
    | 'insertLine'
    | 'deleteLine'
    | 'insertChar'
    | 'deleteChar'
    | 'resetMdt'
    | 'readBuffer'
    | 'readWithAddress'
    | 'readWithAddressAll'
    | 'readScreenAllAttrs'
    | 'readCursor'
    | 'readStatus'
    | 'readRevision'
    | 'readConfig'
    | 'readColorConfig'
    | 'simulateFKey'
    | 'statusMessage'
    | 'enq'
    | 'char'
    | 'clear';
  row?: number;
  col?: number;
  endRow?: number;
  endCol?: number;
  page?: number;
  videoAttr?: number;
  dataAttr?: number;
  extAttr?: number;
  char?: string;
}

export interface Translate6530Result {
  data: string;
  modeSignal: 'block' | 'conv' | null;
  writeReadActive: boolean;
  readCursorRequested: boolean;          // ESC a / ESC Z
  readStatusRequested: boolean;          // ESC ^ (Read Terminal Status -> SOH ? @ F B)
  readRevisionRequested: boolean;        // ESC _ (Read Full Revision Level -> SOH # C00T0A00)
  readSecondaryStatusRequested: boolean; // ESC ] (Read With Address All / Secondary Status)
  readModelRequested: boolean;           // ESC /
  readIdRequested: boolean;              // ESC ? (Read Terminal Configuration -> SOH ! ...)
  readColorConfigRequested: boolean;     // ESC - ? (Color / Extended Config Query -> SOH e7)
  deviceAttributesRequested: boolean;    // ESC [ c
  enquiryRequested: boolean;             // ENQ (0x05)
  screenCommands: ScreenCommand[];
  pendingRemainder: string;
}

export function translate6530ToAnsi(data: string, initialBlockMode = false): Translate6530Result {
  // Normalize 8-bit C1 control characters (ISO-8859-1 / ECMA-48) to standard 7-bit ESC equivalents
  data = data
    .replace(/\u009b/g, '\x1b[')
    .replace(/\u009d/g, '\x1b]')
    .replace(/\u008e/g, '\x1bN')
    .replace(/\u008f/g, '\x1bO')
    .replace(/\u0090/g, '\x1bP')
    .replace(/\u009c/g, '\x1b\\');

  let result = '';
  let i = 0;
  let inBlockMode = initialBlockMode;
  let inBlockFrame = initialBlockMode;
  let modeSignal: 'block' | 'conv' | null = null;
  let writeReadActive = false;
  let readCursorRequested = false;
  let readStatusRequested = false;
  let readRevisionRequested = false;
  let readSecondaryStatusRequested = false;
  let readModelRequested = false;
  let readIdRequested = false;
  let readColorConfigRequested = false;
  let deviceAttributesRequested = false;
  let enquiryRequested = false;
  let pendingRemainder = '';
  const screenCommands: ScreenCommand[] = [];

  while (i < data.length) {
    // Check for ESC (0x1b)
    if (data[i] === '\x1b') {
      if (i + 1 >= data.length) {
        pendingRemainder = data.substring(i);
        break;
      }

      const next = data[i + 1];

      // ── 6530 Extended Sequences: ESC - ... ──
      if (next === '-') {
        if (i + 2 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const sub = data[i + 2];
        // ESC - u / ESC - v / ESC - ? : Read 6530 Color / Extended Configuration Query
        if (sub === '?' || sub === 'u' || sub === 'v') {
          readColorConfigRequested = true;
          screenCommands.push({ type: 'readColorConfig' });
          i += 3;
          continue;
        }
        // ESC - t (Set Color Configuration) / ESC - q (Set/Reset Color Map Table) / ESC - s (Load Variable Field Table)
        if (sub === 't' || sub === 'q' || sub === 's') {
          let j = i + 3;
          while (j < data.length && data[j] !== '\r' && data[j] !== '\n' && data[j] !== '\x03' && data[j] !== '\x04' && data[j] !== '\x1b' && data[j] !== '\x01') {
            j++;
          }
          if (j < data.length && (data[j] === '\r' || data[j] === '\n')) j++;
          i = j;
          continue;
        }
        // ESC - X / ESC - Y / ESC - W / ESC - r : single-char extended commands
        if (sub === 'X' || sub === 'Y' || sub === 'W' || sub === 'c' || sub === 'd' || sub === 'r') {
          i += 3;
          continue;
        }
        // ESC - [<params>] C (Set Buffer Address Extended)
        // ESC - [<params>] D (Set Cursor Address Extended)
        // ESC - [<params>] I (Clear Memory to Spaces Extended)
        // ESC - [<params>] J (Read With Address Extended — 0 params in TEDIT = full page!)
        // ESC - [<params>] K (Read With Address All Extended — 0 params = full page!)
        let j = i + 2;
        while (j < data.length && ((data.charCodeAt(j) >= 0x30 && data.charCodeAt(j) <= 0x3b) || data[j] === ' ')) {
          j++;
        }
        if (j >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const finalChar = data[j];
        const paramStr = data.substring(i + 2, j).trim();
        const parts = paramStr.length > 0 ? paramStr.split(';').map(s => parseInt(s, 10)) : [];
        if (finalChar === 'C') {
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const r0 = Math.max(0, parts[0] - 1);
            const c0 = Math.max(0, parts[1] - 1);
            screenCommands.push({ type: 'bufferAddress', row: r0, col: c0 });
            result += `\x1b[${r0 + 1};${c0 + 1}H`;
            i = j + 1;
            continue;
          }
          if (
            parts.length === 0 &&
            j + 2 < data.length &&
            data.charCodeAt(j + 1) >= 0x20 && data.charCodeAt(j + 1) <= 0x37 &&
            data.charCodeAt(j + 2) >= 0x20 && data.charCodeAt(j + 2) <= 0x6f
          ) {
            const r0 = data.charCodeAt(j + 1) - 0x20;
            const c0 = data.charCodeAt(j + 2) - 0x20;
            screenCommands.push({ type: 'bufferAddress', row: r0, col: c0 });
            result += `\x1b[${r0 + 1};${c0 + 1}H`;
            i = j + 3;
            continue;
          }
        }
        if (finalChar === 'D') {
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const r0 = Math.max(0, parts[0] - 1);
            const c0 = Math.max(0, parts[1] - 1);
            screenCommands.push({ type: 'cursor', row: r0, col: c0 });
            result += `\x1b[${r0 + 1};${c0 + 1}H`;
            i = j + 1;
            continue;
          }
          if (
            parts.length === 0 &&
            j + 2 < data.length &&
            data.charCodeAt(j + 1) >= 0x20 && data.charCodeAt(j + 1) <= 0x37 &&
            data.charCodeAt(j + 2) >= 0x20 && data.charCodeAt(j + 2) <= 0x6f
          ) {
            const r0 = data.charCodeAt(j + 1) - 0x20;
            const c0 = data.charCodeAt(j + 2) - 0x20;
            screenCommands.push({ type: 'cursorOnly', row: r0, col: c0 });
            result += `\x1b[${r0 + 1};${c0 + 1}H`;
            i = j + 3;
            continue;
          }
        }
        if (finalChar === 'I') {
          if (parts.length >= 4) {
            screenCommands.push({
              type: 'clearMemory',
              row: Math.max(0, (parts[0] || 1) - 1),
              col: Math.max(0, (parts[1] || 1) - 1),
              endRow: Math.max(0, (parts[2] || 24) - 1),
              endCol: Math.max(0, (parts[3] || 80) - 1),
            });
            i = j + 1;
            continue;
          }
          if (
            parts.length === 0 &&
            j + 4 < data.length &&
            data.charCodeAt(j + 1) >= 0x20 && data.charCodeAt(j + 1) <= 0x37 &&
            data.charCodeAt(j + 2) >= 0x20 && data.charCodeAt(j + 2) <= 0x6f &&
            data.charCodeAt(j + 3) >= 0x20 && data.charCodeAt(j + 3) <= 0x37 &&
            data.charCodeAt(j + 4) >= 0x20 && data.charCodeAt(j + 4) <= 0x6f
          ) {
            screenCommands.push({
              type: 'clearMemory',
              row: data.charCodeAt(j + 1) - 0x20,
              col: data.charCodeAt(j + 2) - 0x20,
              endRow: data.charCodeAt(j + 3) - 0x20,
              endCol: data.charCodeAt(j + 4) - 0x20,
            });
            i = j + 5;
            continue;
          }
          screenCommands.push({ type: 'clearMemory', row: 0, col: 0, endRow: 23, endCol: 79 });
          i = j + 1;
          continue;
        }
        if (finalChar === 'J' || finalChar === 'K') {
          const cmdType = finalChar === 'K' ? 'readWithAddressAll' : 'readWithAddress';
          if (parts.length >= 4) {
            screenCommands.push({
              type: cmdType,
              row: Math.max(0, (parts[0] || 1) - 1),
              col: Math.max(0, (parts[1] || 1) - 1),
              endRow: Math.max(0, (parts[2] || 24) - 1),
              endCol: Math.max(0, (parts[3] || 80) - 1),
            });
            i = j + 1;
            continue;
          }
          if (
            parts.length === 0 &&
            j + 4 < data.length &&
            data.charCodeAt(j + 1) >= 0x20 && data.charCodeAt(j + 1) <= 0x37 &&
            data.charCodeAt(j + 2) >= 0x20 && data.charCodeAt(j + 2) <= 0x6f &&
            data.charCodeAt(j + 3) >= 0x20 && data.charCodeAt(j + 3) <= 0x37 &&
            data.charCodeAt(j + 4) >= 0x20 && data.charCodeAt(j + 4) <= 0x6f
          ) {
            screenCommands.push({
              type: cmdType,
              row: data.charCodeAt(j + 1) - 0x20,
              col: data.charCodeAt(j + 2) - 0x20,
              endRow: data.charCodeAt(j + 3) - 0x20,
              endCol: data.charCodeAt(j + 4) - 0x20,
            });
            i = j + 5;
            continue;
          }
          // 0 parameters (e.g. 1B 2D 4A in TEDIT): read entire current page (0,0 .. 23,79)!
          screenCommands.push({
            type: cmdType,
            row: 0,
            col: 0,
            endRow: 23,
            endCol: 79,
          });
          i = j + 1;
          continue;
        }
        i = j + 1;
        continue;
      }

      // ── 6530 Start Field Extended (ESC [ <vAttr> <dAttr> <extAttr>) vs ANSI CSI (ESC [ ...) ──
      if (next === '[') {
        if (inBlockMode && !(i + 2 < data.length && (data[i + 2] === 'c' || (data[i + 2] === '0' && data[i + 3] === 'c')))) {
          if (i + 4 >= data.length) {
            pendingRemainder = data.substring(i);
            break;
          }
          const vAttr = data.charCodeAt(i + 2);
          const dAttr = data.charCodeAt(i + 3);
          const extAttr = data.charCodeAt(i + 4);
          screenCommands.push({ type: 'startField', videoAttr: vAttr, dataAttr: dAttr, extAttr });
          i += 5;
          continue;
        }
        let j = i + 2;
        while (j < data.length && data.charCodeAt(j) >= 0x20 && data.charCodeAt(j) <= 0x3f) j++;
        if (j >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const csiSeq = data.substring(i, j + 1);
        if (csiSeq === '\x1b[c' || csiSeq === '\x1b[0c' || csiSeq === '\x1b[>c' || csiSeq === '\x1b[>0c') {
          deviceAttributesRequested = true;
          screenCommands.push({ type: 'readStatus' });
          i = j + 1;
          continue;
        }
        j++;
        result += data.substring(i, j);
        i = j;
        continue;
      }

      // ── ANSI OSC (ESC ] <digit> ...) vs 6530 Read With Address All / Secondary Status (ESC ]) ──
      if (next === ']') {
        if (i + 2 < data.length && data.charCodeAt(i + 2) >= 0x30 && data.charCodeAt(i + 2) <= 0x39) {
          let j = i + 2;
          while (j < data.length && data[j] !== '\x07' && !(data[j] === '\x1b' && j + 1 < data.length && data[j + 1] === '\\')) {
            j++;
          }
          if (j >= data.length) {
            pendingRemainder = data.substring(i);
            break;
          }
          if (data[j] === '\x07') j++;
          else if (data[j] === '\x1b') j += 2;
          result += data.substring(i, j);
          i = j;
          continue;
        } else {
          readSecondaryStatusRequested = true;
          if (
            i + 5 < data.length &&
            data.charCodeAt(i + 2) >= 0x20 && data.charCodeAt(i + 2) <= 0x37 &&
            data.charCodeAt(i + 3) >= 0x20 && data.charCodeAt(i + 3) <= 0x6f &&
            data.charCodeAt(i + 4) >= 0x20 && data.charCodeAt(i + 4) <= 0x37 &&
            data.charCodeAt(i + 5) >= 0x20 && data.charCodeAt(i + 5) <= 0x6f
          ) {
            screenCommands.push({
              type: 'readWithAddressAll',
              row: data.charCodeAt(i + 2) - 0x20,
              col: data.charCodeAt(i + 3) - 0x20,
              endRow: data.charCodeAt(i + 4) - 0x20,
              endCol: data.charCodeAt(i + 5) - 0x20,
            });
            i += 6;
            continue;
          }
          screenCommands.push({ type: 'readWithAddressAll', row: 0, col: 0, endRow: 23, endCol: 79 });
          i += 2;
          continue;
        }
      }

      // ── 6530 Insert Character in Block Mode (ESC O — 2 bytes!) vs ANSI SS3 pass-through in Conv Mode ──
      if (next === 'O') {
        if (inBlockMode) {
          screenCommands.push({ type: 'insertChar' });
          result += '\x1b[1@';
          i += 2;
          continue;
        }
        if (i + 2 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        result += data.substring(i, i + 3);
        i += 3;
        continue;
      }

      // ── 6530 Select Write/I/O Page: ESC : <page_char> ──
      if (next === ':') {
        if (i + 2 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const pageNum = Math.max(0, data.charCodeAt(i + 2) - 0x20);
        screenCommands.push({ type: 'selectPage', page: pageNum });
        i += 3;
        continue;
      }

      // ── 6530 Select Display Page: ESC ; <page_char> ──
      if (next === ';') {
        if (i + 2 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const pageNum = Math.max(0, data.charCodeAt(i + 2) - 0x20);
        screenCommands.push({ type: 'displayPage', page: pageNum });
        i += 3;
        continue;
      }

      // ── 6530 Read Buffer: ESC < [<start_row> <start_col> <end_row> <end_col>] ──
      if (next === '<') {
        // Check if 4 address bytes follow (each >= 0x20 and <= 0x7f)
        if (
          i + 5 < data.length &&
          data.charCodeAt(i + 2) >= 0x20 && data.charCodeAt(i + 2) <= 0x37 &&
          data.charCodeAt(i + 3) >= 0x20 && data.charCodeAt(i + 3) <= 0x6f &&
          data.charCodeAt(i + 4) >= 0x20 && data.charCodeAt(i + 4) <= 0x37 &&
          data.charCodeAt(i + 5) >= 0x20 && data.charCodeAt(i + 5) <= 0x6f
        ) {
          screenCommands.push({
            type: 'readBuffer',
            row: data.charCodeAt(i + 2) - 0x20,
            col: data.charCodeAt(i + 3) - 0x20,
            endRow: data.charCodeAt(i + 4) - 0x20,
            endCol: data.charCodeAt(i + 5) - 0x20,
          });
          i += 6;
          continue;
        }
        screenCommands.push({ type: 'readBuffer', row: 0, col: 0, endRow: 23, endCol: 79 });
        i += 2;
        continue;
      }

      // ── 6530 Read With Address (ESC = <sRow><sCol><eRow><eCol> in Block Mode) vs Cursor Addressing (ESC = <row><col>) ──
      if (next === '=') {
        if (i + 3 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        if (inBlockMode) {
          if (i + 5 >= data.length) {
            pendingRemainder = data.substring(i);
            break;
          }
          if (
            data.charCodeAt(i + 2) >= 0x20 && data.charCodeAt(i + 2) <= 0x37 &&
            data.charCodeAt(i + 3) >= 0x20 && data.charCodeAt(i + 3) <= 0x6f &&
            data.charCodeAt(i + 4) >= 0x20 && data.charCodeAt(i + 4) <= 0x37 &&
            data.charCodeAt(i + 5) >= 0x20 && data.charCodeAt(i + 5) <= 0x6f
          ) {
            screenCommands.push({
              type: 'readWithAddress',
              row: data.charCodeAt(i + 2) - 0x20,
              col: data.charCodeAt(i + 3) - 0x20,
              endRow: data.charCodeAt(i + 4) - 0x20,
              endCol: data.charCodeAt(i + 5) - 0x20,
            });
            i += 6;
            continue;
          }
        }
        const row0 = data.charCodeAt(i + 2) - 0x20;
        const col0 = data.charCodeAt(i + 3) - 0x20;
        screenCommands.push({ type: 'cursor', row: row0, col: col0 });
        result += `\x1b[${Math.max(1, row0 + 1)};${Math.max(1, col0 + 1)}H`;
        i += 4;
        continue;
      }

      // ── 6530 Reset Modified Data Tags: ESC > ──
      if (next === '>') {
        screenCommands.push({ type: 'resetMdt' });
        i += 2;
        continue;
      }

      // ── 6530 Display Enhancement: ESC 6 attr ──
      if (next === '6') {
        if (i + 2 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const attr = data.charCodeAt(i + 2);
        screenCommands.push({ type: 'videoAttr', videoAttr: attr });
        const flags = attr & 0x1f;
        const parts: string[] = [];
        if (flags & 0x01) parts.push('4');  // underline
        if (flags & 0x02) parts.push('5');  // blink
        if (flags & 0x08) parts.push('2');  // dim / half-bright
        if (flags & 0x10) parts.push('8');  // invisible / hidden

        if (parts.length > 0) {
          result += `\x1b[0;${parts.join(';')}m`;
        } else {
          result += '\x1b[0m';
        }
        i += 3;
        continue;
      }

      // ── 6530 single-character escape sequences ──
      switch (next) {
        // Cursor movement
        case 'A': result += '\x1b[A'; screenCommands.push({ type: 'cursor', row: -1, col: -99 }); i += 2; continue;
        case 'B': result += '\x1b[B'; screenCommands.push({ type: 'cursor', row: -2, col: -99 }); i += 2; continue;
        case 'C': result += '\x1b[C'; screenCommands.push({ type: 'cursor', row: -99, col: -1 }); i += 2; continue;
        case 'D': result += '\x1b[D'; screenCommands.push({ type: 'cursor', row: -99, col: -2 }); i += 2; continue;
        case 'H': result += '\x1b[H'; screenCommands.push({ type: 'cursor', row: 0, col: 0 }); i += 2; continue;
        case 'F': i += 2; continue;

        // Erase & Clear operations (6530 Spec: ESC I = Clear Memory to Spaces, ESC J = Erase to End of Page, ESC K = Erase to End of Line)
        case 'I': {
          if (
            inBlockMode &&
            i + 5 < data.length &&
            data.charCodeAt(i + 2) >= 0x20 && data.charCodeAt(i + 2) <= 0x37 &&
            data.charCodeAt(i + 3) >= 0x20 && data.charCodeAt(i + 3) <= 0x6f &&
            data.charCodeAt(i + 4) >= 0x20 && data.charCodeAt(i + 4) <= 0x37 &&
            data.charCodeAt(i + 5) >= 0x20 && data.charCodeAt(i + 5) <= 0x6f
          ) {
            screenCommands.push({
              type: 'clearMemory',
              row: data.charCodeAt(i + 2) - 0x20,
              col: data.charCodeAt(i + 3) - 0x20,
              endRow: data.charCodeAt(i + 4) - 0x20,
              endCol: data.charCodeAt(i + 5) - 0x20,
            });
            i += 6;
            continue;
          }
          result += '\x1b[2J\x1b[H';
          screenCommands.push({ type: 'clear' });
          i += 2;
          continue;
        }
        case 'J': result += '\x1b[0J'; screenCommands.push({ type: 'eraseEop' }); i += 2; continue;
        case 'K': result += '\x1b[0K'; screenCommands.push({ type: 'eraseEol' }); i += 2; continue;
        case 'L': result += '\x1b[1L'; screenCommands.push({ type: 'insertLine' }); i += 2; continue;
        case 'M': result += '\x1b[1M'; screenCommands.push({ type: 'deleteLine' }); i += 2; continue;

        // Reinitialize terminal (ESC q)
        case 'q': result += '\x1b[0m\x1b[2J\x1b[H'; screenCommands.push({ type: 'clear' }); i += 2; continue;

        // Field protection markers
        case ')': result += '\x1b[2m'; screenCommands.push({ type: 'protectStart' }); i += 2; continue;
        case '(': result += '\x1b[0m'; screenCommands.push({ type: 'protectEnd' }); i += 2; continue;
        case 'N': result += '\x1b[2m'; screenCommands.push({ type: 'protectStart' }); i += 2; continue;

        // Protect submode (ESC W = enter protect submode in Block Mode, ESC X = exit protect submode)
        case 'W':
          result += '\x1b[2J\x1b[H';
          inBlockMode = true;
          modeSignal = 'block';
          screenCommands.push({ type: 'protectSubEnter' });
          i += 2;
          continue;
        case 'X':
          result += '\x1b[0m';
          if (!inBlockMode) modeSignal = 'conv';
          screenCommands.push({ type: 'protectSubExit' });
          i += 2;
          continue;

        // 6530 Set Video Attribute (ESC 7 <attr>) / Restore Cursor (ESC 8)
        case '7': {
          if (inBlockMode) {
            if (i + 2 >= data.length) {
              pendingRemainder = data.substring(i);
              break;
            }
            screenCommands.push({ type: 'videoAttr', videoAttr: data.charCodeAt(i + 2) });
            i += 3;
            continue;
          }
          result += '\x1b7';
          i += 2;
          continue;
        }
        case '8': result += '\x1b8'; i += 2; continue;

        // 6530 Keyboard Lock/Unlock:
        // ESC b = Unlock Keyboard (end of host block write — ready for user input)
        // ESC c = Lock Keyboard (start of host block write — do NOT switch back to conversational mode!)
        case 'b':
          result += '\x1b[?25h';
          if (!inBlockMode) modeSignal = 'block';
          screenCommands.push({ type: 'unlockKeyboard' });
          i += 2;
          continue;
        case 'c':
          if (!inBlockMode) modeSignal = 'conv';
          screenCommands.push({ type: 'lockKeyboard' });
          i += 2;
          continue;

        // Cursor visibility / Simulate Function Key (ESC d <keycode>, 6530 Spec Page 2-52)
        case 'e': result += '\x1b[?25l'; i += 2; continue;
        case 'd': {
          if (inBlockMode && i + 2 < data.length && data.charCodeAt(i + 2) >= 0x40 && data.charCodeAt(i + 2) <= 0x7a) {
            screenCommands.push({ type: 'simulateFKey', char: data[i + 2] });
            i += 3;
            continue;
          }
          result += '\x1b[?25h';
          i += 2;
          continue;
        }
        case 'Y': result += '\x1b[?25h'; i += 2; continue;

        // Tab operations
        case 'i': result += '\t'; i += 2; continue;
        case '1': result += '\x1b[Z'; i += 2; continue;
        case '2':
          screenCommands.push({ type: 'clearTabStops' });
          i += 2;
          continue;
        case '0':
          screenCommands.push({ type: 'setTabStop' });
          i += 2;
          continue;

        // Line / scroll operations
        case 'T': result += '\x1b[1S'; i += 2; continue;
        case 'S': result += '\x1b[1T'; i += 2; continue;

        // Read cursor address (ESC a / ESC Z)
        case 'a':
        case 'Z':
          readCursorRequested = true;
          screenCommands.push({ type: 'readCursor' });
          i += 2;
          continue;

        // Set Maximum Page Number in Block Mode (ESC p <max-page>)
        case 'p': {
          if (i + 2 >= data.length) {
            if (inBlockMode) {
              pendingRemainder = data.substring(i);
              break;
            }
            i += 2;
            continue;
          }
          const pCode = data.charCodeAt(i + 2);
          const maxP = pCode >= 0x30 ? pCode - 0x30 : Math.max(1, pCode - 0x20);
          screenCommands.push({ type: 'setMaxPages', page: maxP });
          i += 3;
          continue;
        }

        // Delete character (ESC P) and Read Screen With All Attributes (ESC Q <sRow><sCol><eRow><eCol>)
        case 'P':
          result += '\x1b[1P';
          screenCommands.push({ type: 'deleteChar' });
          i += 2;
          continue;
        case 'Q': {
          if (
            inBlockMode &&
            i + 5 < data.length &&
            data.charCodeAt(i + 2) >= 0x20 && data.charCodeAt(i + 2) <= 0x37 &&
            data.charCodeAt(i + 3) >= 0x20 && data.charCodeAt(i + 3) <= 0x6f &&
            data.charCodeAt(i + 4) >= 0x20 && data.charCodeAt(i + 4) <= 0x37 &&
            data.charCodeAt(i + 5) >= 0x20 && data.charCodeAt(i + 5) <= 0x6f
          ) {
            screenCommands.push({
              type: 'readScreenAllAttrs',
              row: data.charCodeAt(i + 2) - 0x20,
              col: data.charCodeAt(i + 3) - 0x20,
              endRow: data.charCodeAt(i + 4) - 0x20,
              endCol: data.charCodeAt(i + 5) - 0x20,
            });
            i += 6;
            continue;
          }
          result += '\x1b[1P';
          i += 2;
          continue;
        }

        // Bell
        case 'E': result += '\x07'; i += 2; continue;

        // Set Terminal Configuration (ESC v <code/value pairs> CR)
        case 'v': {
          let j = i + 2;
          // If followed by CR-terminated parameter pairs (e.g., ESC v A0 B72 CR), consume until CR or ETX
          let foundTerminator = false;
          while (j < data.length && j - i < 64) {
            if (data[j] === '\r' || data[j] === '\n' || data[j] === '\x03') {
              foundTerminator = true;
              j++;
              break;
            }
            if (data[j] === '\x1b' || data[j] === '\x01') {
              foundTerminator = true;
              break;
            }
            j++;
          }
          if (!foundTerminator && j >= data.length && data.length - i < 4) {
            pendingRemainder = data.substring(i);
            break;
          }
          i = foundTerminator ? j : Math.min(data.length, i + 3);
          continue;
        }

        // Read Primary Terminal Status (ESC ^ -> SOH ? @ F B CR or SOH ? @ F B <max-page> X Y ETX LRC)
        case '^':
          readStatusRequested = true;
          screenCommands.push({ type: 'readStatus' });
          i += 2;
          continue;

        // Read Full Revision Level (ESC _ -> SOH # C00T0A00 CR or ETX LRC)
        case '_':
          readRevisionRequested = true;
          screenCommands.push({ type: 'readRevision' });
          i += 2;
          continue;

        // Read Model Number (ESC /)
        case '/':
          readModelRequested = true;
          screenCommands.push({ type: 'readRevision' });
          i += 2;
          continue;

        // Read Terminal Configuration (ESC ? -> SOH ! ... CR or ETX LRC)
        case '?':
          readIdRequested = true;
          screenCommands.push({ type: 'readConfig' });
          i += 2;
          continue;

        // Write to Message/Status Line (ESC o <message with optional ESC 6 attr> CR, 6530 Spec Pages 2-49 & 3-93)
        case 'o': {
          if (inBlockMode || (i + 2 < data.length && data[i + 2] !== '\r' && data[i + 2] !== '\n')) {
            let j = i + 2;
            let msgText = '';
            while (j < data.length && data[j] !== '\r' && data[j] !== '\n' && data[j] !== '\x03' && data[j] !== '\x04') {
              if (data[j] === '\x1b') {
                if (j + 1 >= data.length) {
                  pendingRemainder = data.substring(i);
                  break;
                }
                if (data[j + 1] === '6' || data[j + 1] === '7') {
                  if (j + 2 >= data.length) {
                    pendingRemainder = data.substring(i);
                    break;
                  }
                  j += 3;
                  continue;
                }
              }
              if (data.charCodeAt(j) >= 0x20) {
                msgText += data[j];
              }
              j++;
            }
            if (pendingRemainder) break;
            if (j >= data.length) {
              pendingRemainder = data.substring(i);
              break;
            }
            if (data[j] === '\r' || data[j] === '\n') {
              j++;
            }
            screenCommands.push({ type: 'statusMessage', char: msgText });
            i = j;
            continue;
          }
          result += '\x1b[0K';
          screenCommands.push({ type: 'eraseEol' });
          i += 2;
          continue;
        }

        default: {
          if (
            (next >= 'a' && next <= 'z') ||
            (next >= 'A' && next <= 'Z') ||
            (next >= '0' && next <= '9') ||
            next === ')' || next === '(' || next === '#' || next === '&' ||
            next === '%' || next === '@' || next === '<' || next === '>'
          ) {
            i += 2;
            continue;
          }
          result += data[i];
          i++;
          continue;
        }
      }
      if (pendingRemainder) break;
    }

    // Ignore NUL padding, EOT (0x04), ACK (0x06), SO (0x0E), SI (0x0F)
    if (
      data[i] === '\x00' ||
      data[i] === '\x04' ||
      data[i] === '\x06' ||
      data[i] === '\x0e' ||
      data[i] === '\x0f'
    ) {
      i++;
      continue;
    }

    // ENQ (0x05) — Host enquiry
    if (data[i] === '\x05') {
      enquiryRequested = true;
      screenCommands.push({ type: 'enq' });
      i++;
      continue;
    }

    // ── 6530 Control Characters: DC1, DC2, DC3, DC4, FS, GS ──
    // DC1 (0x11) — Set Buffer Address in Block Mode: 0x11 <row> <col> (or WRITEREAD framing when standalone)
    if (data[i] === '\x11') {
      writeReadActive = true;
      if (inBlockMode || inBlockFrame) {
        if (
          i + 2 < data.length &&
          data.charCodeAt(i + 1) >= 0x20 && data.charCodeAt(i + 1) <= 0x37 &&
          data.charCodeAt(i + 2) >= 0x20 && data.charCodeAt(i + 2) <= 0x6f
        ) {
          const row0 = data.charCodeAt(i + 1) - 0x20;
          const col0 = data.charCodeAt(i + 2) - 0x20;
          screenCommands.push({ type: 'bufferAddress', row: row0, col: col0 });
          result += `\x1b[${row0 + 1};${col0 + 1}H`;
          i += 3;
          continue;
        } else if (i + 2 >= data.length && i + 1 < data.length && data.charCodeAt(i + 1) >= 0x20 && data.charCodeAt(i + 1) <= 0x37) {
          pendingRemainder = data.substring(i);
          break;
        }
      }
      i++;
      continue;
    }

    // DC2 (0x12) — Extended Data Compression in Block Mode: 0x12 <count> <char> (6530 Spec Page 3-65)
    if (data[i] === '\x12') {
      if (inBlockMode || inBlockFrame) {
        if (i + 2 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const count = Math.max(0, data.charCodeAt(i + 1) - 0x20);
        const repeatChar = data[i + 2];
        for (let k = 0; k < count; k++) {
          screenCommands.push({ type: 'char', char: repeatChar });
          result += repeatChar;
        }
        i += 3;
        continue;
      }
      i++;
      continue;
    }

    // DC3 (0x13) — Set Cursor Address: 0x13 <row> <col> (6530 Spec Page 2-24 & 3-14)
    if (data[i] === '\x13') {
      if (
        i + 2 < data.length &&
        data.charCodeAt(i + 1) >= 0x20 && data.charCodeAt(i + 1) <= 0x37 &&
        data.charCodeAt(i + 2) >= 0x20 && data.charCodeAt(i + 2) <= 0x6f
      ) {
        const row0 = data.charCodeAt(i + 1) - 0x20;
        const col0 = data.charCodeAt(i + 2) - 0x20;
        screenCommands.push({ type: inBlockMode || inBlockFrame ? 'cursorOnly' : 'cursor', row: row0, col: col0 });
        result += `\x1b[${row0 + 1};${col0 + 1}H`;
        i += 3;
        continue;
      } else if (
        (inBlockMode || inBlockFrame) &&
        i + 2 >= data.length &&
        (i + 1 >= data.length || (data.charCodeAt(i + 1) >= 0x20 && data.charCodeAt(i + 1) <= 0x37))
      ) {
        pendingRemainder = data.substring(i);
        break;
      }
      i++;
      continue;
    }

    // DC4 (0x14) — Limited Data Compression (repeat spaces) in Block Mode: 0x14 <count> (6530 Spec Page 3-65)
    if (data[i] === '\x14') {
      if (inBlockMode || inBlockFrame) {
        if (i + 1 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const count = Math.max(0, data.charCodeAt(i + 1) - 0x20);
        for (let k = 0; k < count; k++) {
          screenCommands.push({ type: 'char', char: ' ' });
          result += ' ';
        }
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // FS (0x1C) — Define Field Attribute in Protect Submode: 0x1C <row> <col> <tableParam> (6530 Spec Page 3-38)
    if (data[i] === '\x1c') {
      if (inBlockMode || inBlockFrame) {
        if (i + 3 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        const row0 = Math.max(0, data.charCodeAt(i + 1) - 0x20);
        const col0 = Math.max(0, data.charCodeAt(i + 2) - 0x20);
        const tableParam = data.charCodeAt(i + 3);
        screenCommands.push({ type: 'defineFieldAttr', row: row0, col: col0, dataAttr: tableParam });
        i += 4;
        continue;
      }
      i++;
      continue;
    }

    // GS (0x1D) — 6530 Start Field in Protect Submode: 0x1D <video_attr> <data_attr>
    if (data[i] === '\x1d') {
      if (i + 2 >= data.length) {
        pendingRemainder = data.substring(i);
        break;
      }
      const vAttr = data.charCodeAt(i + 1);
      const dAttr = data.charCodeAt(i + 2);
      screenCommands.push({ type: 'startField', videoAttr: vAttr, dataAttr: dAttr });
      const flags = vAttr & 0x1f;
      const isProtected = (dAttr & 0x40) !== 0 ? (dAttr & 0x20) !== 0 : (dAttr & 0x01) !== 0;
      const parts: string[] = ['0'];
      if (flags & 0x01) parts.push('4');
      if (flags & 0x02) parts.push('5');
      if ((flags & 0x08) || isProtected) parts.push('2');
      if (flags & 0x10) parts.push('8');
      result += ` \x1b[${parts.join(';')}m`;
      i += 3;
      continue;
    }

    // ── 6530 SOH Mode Switch Commands: SOH 'B' ETX [LRC] / SOH 'C' ETX [LRC] ──
    // Format per 6530 Programmer's Guide: 0x01 <'B'|'C'> 0x03 [<LRC>]
    if (data[i] === '\x01') {
      if (i + 1 >= data.length) {
        pendingRemainder = data.substring(i);
        break;
      }
      const cmd = data[i + 1];
      if (cmd === 'B' || cmd === 'b') {
        if (i + 2 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        inBlockMode = true;
        inBlockFrame = true;
        modeSignal = 'block';
        screenCommands.push({ type: 'enterBlockMode' });
        if (data[i + 2] === '\x03') {
          const hasLrc =
            i + 3 < data.length &&
            data[i + 3] !== '\x1b' &&
            data[i + 3] !== '\x01' &&
            data[i + 3] !== '\x02' &&
            data[i + 3] !== '\x11' &&
            data[i + 3] !== '\x13' &&
            data[i + 3] !== '\x1d';
          i += hasLrc ? 4 : 3;
          continue;
        }
        i += 2;
        continue;
      }
      if (cmd === 'C' || cmd === 'c') {
        if (i + 2 >= data.length) {
          pendingRemainder = data.substring(i);
          break;
        }
        inBlockMode = false;
        inBlockFrame = false;
        modeSignal = 'conv';
        screenCommands.push({ type: 'enterConvMode' });
        if (data[i + 2] === '\x03') {
          const hasLrc =
            i + 3 < data.length &&
            data[i + 3] !== '\x1b' &&
            data[i + 3] !== '\x01' &&
            data[i + 3] !== '\x02' &&
            data[i + 3] !== '\x11' &&
            data[i + 3] !== '\x13' &&
            data[i + 3] !== '\x1d';
          i += hasLrc ? 4 : 3;
          continue;
        }
        i += 2;
        continue;
      }
      // Other SOH framing in Block Mode — consume SOH and mark block frame
      inBlockFrame = true;
      i++;
      continue;
    }

    // STX (0x02) — consume framing and mark block frame so trailing ETX+LRC is consumed
    if (data[i] === '\x02') {
      inBlockFrame = true;
      i++;
      continue;
    }
    // ETX (0x03) — consume ETX and its trailing 1-byte LRC checksum in Block Mode / SOH-STX frames
    if (data[i] === '\x03') {
      if (inBlockMode || inBlockFrame) {
        const hasLrc =
          i + 1 < data.length &&
          data[i + 1] !== '\x1b' &&
          data[i + 1] !== '\x01' &&
          data[i + 1] !== '\x02' &&
          data[i + 1] !== '\x11' &&
          data[i + 1] !== '\x13' &&
          data[i + 1] !== '\x1d';
        inBlockFrame = inBlockMode;
        i += hasLrc ? 2 : 1;
        continue;
      }
      i++;
      continue;
    }

    // Ignore stray non-printable C1 control characters (0x80-0x9F)
    const code = data.charCodeAt(i);
    if (code >= 0x80 && code <= 0x9f) {
      i++;
      continue;
    }

    // Regular character — pass through and feed to screen buffer
    screenCommands.push({ type: 'char', char: data[i] });
    result += data[i];
    i++;
  }

  return {
    data: result,
    modeSignal,
    writeReadActive,
    readCursorRequested,
    readStatusRequested,
    readRevisionRequested,
    readSecondaryStatusRequested,
    readModelRequested,
    readIdRequested,
    readColorConfigRequested,
    deviceAttributesRequested,
    enquiryRequested,
    screenCommands,
    pendingRemainder
  };
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
  sessionTimeout: _sessionTimeout = 120,
  onTitleChange,
  protocol = "ssh",
  serviceName: _serviceName,
  isNonStop = false
}: TerminalProps) {
  // HP NonStop 6530 detection: match "6530", "t6530", "hp6530", "6530-80", "tn6530", "tandem", protocol==="telnet", or isNonStop prop
  const isConfigured6530 = Boolean(
    isNonStop ||
    protocol === "telnet" ||
    (termType && (termType === "6530" || termType.toLowerCase().includes("6530") || termType.toLowerCase().includes("tandem") || termType.toLowerCase().includes("tn6530")))
  );
  const [is6530Session, setIs6530Session] = useState(isConfigured6530);
  const is6530Ref = useRef(isConfigured6530);
  useEffect(() => {
    setIs6530Session(isConfigured6530);
    is6530Ref.current = isConfigured6530;
  }, [isConfigured6530]);

  // Choose the right sequence map based on terminal type
  const CONTROL_SEQUENCES = is6530Session ? HP_6530_SEQUENCES : VT_SEQUENCES;
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const backspaceModeRef = useRef(backspaceMode);
  const blockBufferRef = useRef("");
  const screen6530Ref = useRef<Screen6530>(new Screen6530());
  const pending6530BufferRef = useRef("");

  // UI State
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showToolbar, setShowToolbar] = useState(isConfigured6530);
  const [showShiftButtons, setShowShiftButtons] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isBlockMode, setIsBlockMode] = useState(false);
  const [isKeyboardLocked, setIsKeyboardLocked] = useState(false);
  const [isInsertMode, setIsInsertMode] = useState(false);
  const [statusLineText, setStatusLineText] = useState("");
  const [cursorPos, setCursorPos] = useState({ row: 0, col: 0 });
  const isBlockModeRef = useRef(false);
  const historyBufferRef = useRef("");
  const hpNsUserRef = useRef("");
  const lastReportedTitleRef = useRef("");
  const lastTermTypePromptReplyRef = useRef(0);

  // GitHub Copilot Side Panel State (SSH Only)
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotWidth, setCopilotWidth] = useState(380);
  const [isResizingCopilot, setIsResizingCopilot] = useState(false);

  // Disconnect State
  const [isDisconnected, setIsDisconnected] = useState(false);
  const onDisconnectRef = useRef(_onDisconnect);
  useEffect(() => { onDisconnectRef.current = _onDisconnect; }, [_onDisconnect]);

  // Send data to SSH/Telnet server.
  const sendQueueRef = useRef("");
  const sendInFlightRef = useRef(false);
  const sendData = useCallback(
    (data: string) => {
      sendQueueRef.current += data;
      if (sendInFlightRef.current) return;
      sendInFlightRef.current = true;
      const command = protocol === "telnet" ? "telnet_send" : "ssh_send";
      (async () => {
        try {
          while (sendQueueRef.current) {
            const chunk = sendQueueRef.current;
            sendQueueRef.current = "";
            try {
              await invoke(command, { sessionId, data: chunk });
            } catch (error) {
              if (xtermRef.current) {
                xtermRef.current.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`);
              }
            }
          }
        } finally {
          sendInFlightRef.current = false;
        }
      })();
    },
    [sessionId, protocol]
  );

  // Safe fit function
  const safeFit = useCallback(() => {
    if (!isVisible) return;
    if (!terminalRef.current || !xtermRef.current || !fitAddonRef.current) return;

    if (terminalRef.current.clientWidth === 0 || terminalRef.current.clientHeight === 0) {
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

  // Safe extraction of terminal buffer text for Copilot (clean of ANSI codes)
  const getTerminalOutput = useCallback((maxLines = 60): string => {
    if (!xtermRef.current) return "";
    const buffer = xtermRef.current.buffer.active;
    const lines: string[] = [];
    const startLine = Math.max(0, buffer.length - maxLines);
    for (let i = startLine; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }
    return lines
      .join("\n")
      .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
      .trim();
  }, []);

  // Split-resizer for Copilot side panel
  const startResizeCopilot = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingCopilot(true);
    const startX = e.clientX;
    const startWidth = copilotWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(800, startWidth + delta));
      setCopilotWidth(newWidth);
      safeFit();
    };

    const onMouseUp = () => {
      setIsResizingCopilot(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setTimeout(safeFit, 60);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [copilotWidth, safeFit]);

  // Continuous Keepalive Heartbeat (SSH only)
  useEffect(() => {
    if (protocol === "telnet") return;

    const keepaliveInterval = setInterval(() => {
      invoke("ssh_keepalive", { sessionId }).catch(() => {});
    }, 30000);

    const handleWakeup = () => {
      invoke("ssh_keepalive", { sessionId }).catch(() => {});
      safeFit();
    };

    window.addEventListener("focus", handleWakeup);
    document.addEventListener("visibilitychange", handleWakeup);

    return () => {
      clearInterval(keepaliveInterval);
      window.removeEventListener("focus", handleWakeup);
      document.removeEventListener("visibilitychange", handleWakeup);
    };
  }, [sessionId, safeFit, protocol]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (isVisible) {
      setTimeout(safeFit, 50);
    }
  }, [isVisible, safeFit]);

  useEffect(() => {
    backspaceModeRef.current = backspaceMode;
  }, [backspaceMode]);

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

    const terminal = new Terminal({
      cursorBlink: cursorBlink,
      cursorStyle: cursorStyle,
      fontSize: fontSize,
      fontFamily: fontFamily,
      fontWeight: fontWeight as any,
      lineHeight: lineHeight,
      theme: initialTheme,
      allowProposedApi: true,
      scrollback: scrollback,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      convertEol: true,
      // @ts-ignore
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

    const openTerminal = () => {
      if (!terminalRef.current || !xtermRef.current) return;
      if (xtermRef.current.element) return;

      if (terminalRef.current.clientWidth > 0 && terminalRef.current.clientHeight > 0) {
        try {
          xtermRef.current.open(terminalRef.current);
          xtermRef.current.reset();
          xtermRef.current.write("\x1b[0m\x1b[2J\x1b[H");
          screen6530Ref.current.reset();
          isBlockModeRef.current = false;
          setIsBlockMode(false);
          blockBufferRef.current = "";
          if (protocol === "telnet") {
            xtermRef.current.write("\x1b[33m● Connecting to HP NonStop TELSERV via Telnet (6530)...\x1b[0m\r\n");
          } else {
            xtermRef.current.write("\x1b[36m● Connecting to SSH session...\x1b[0m\r\n");
          }
          safeFit();
        } catch (err) {
          console.error("[Terminal] Open error:", err);
        }
      } else {
        setTimeout(openTerminal, 50);
      }
    };

    requestAnimationFrame(openTerminal);

    terminal.onTitleChange((title) => {
      if (onTitleChange && title && title !== lastReportedTitleRef.current) {
        lastReportedTitleRef.current = title;
        onTitleChange(title);
      }
    });

    // Key handlers
    terminal.attachCustomKeyEventHandler((e) => {
      const currentBackspaceMode = backspaceModeRef.current;
      if (e.key === "Backspace" && e.type === "keydown") {
        if (is6530Ref.current && isBlockModeRef.current) {
          const screen = screen6530Ref.current;
          if (screen.hasFields || screen.blockMode) {
            if (screen.deleteCharAtCursor()) {
              terminal.write("\b \b");
            }
          } else {
            if (blockBufferRef.current.length > 0) {
              blockBufferRef.current = blockBufferRef.current.slice(0, -1);
              terminal.write("\b \b");
            }
          }
          return false;
        }

        if (is6530Ref.current) {
          const bsCode = currentBackspaceMode === "ctrl-?" ? "\x7f" : "\x08";
          historyBufferRef.current = historyBufferRef.current.slice(0, -1);
          sendData(bsCode);
          return false;
        }

        if (currentBackspaceMode === "ctrl-h") {
          historyBufferRef.current = historyBufferRef.current.slice(0, -1);
          sendData("\x08");
          return false;
        } else if (currentBackspaceMode === "ctrl-?") {
          historyBufferRef.current = historyBufferRef.current.slice(0, -1);
          sendData("\x7f");
          return false;
        }
      }

      // HP 6530 navigation & function keys
      if (is6530Ref.current && e.type === "keydown") {
        // F-key interception (supports F1..F16, Alt+F1..Alt+F6 -> F11..F16, Ctrl+F3..Ctrl+F6 -> F13..F16, Shift)
        const isFKey = Boolean(
          (e.altKey && ALT_FKEY_MAP[e.key]) ||
          FKEY_MAP[e.key] ||
          (e.key.startsWith("F") && !isNaN(parseInt(e.key.slice(1), 10)))
        );

        if (isFKey) {
          e.preventDefault();
          const screen = screen6530Ref.current;
          if (isBlockModeRef.current && screen.keyboardLocked) {
            return false;
          }
          let num = 1;
          if (e.altKey && ALT_FKEY_MAP[e.key]) {
            num = parseInt(ALT_FKEY_MAP[e.key].normal.slice(1), 10);
          } else {
            num = parseInt(e.key.slice(1), 10);
          }

          if (!isNaN(num) && num >= 1 && num <= 16) {
            let keyId: number;
            const isShift = e.shiftKey;
            const isCtrlOrAlt = e.ctrlKey || e.altKey;

            if (isCtrlOrAlt && num >= 3 && num <= 6) {
              // F13..F16 mapped as Ctrl+F3..Ctrl+F6 (Section 2)
              keyId = (isShift ? 108 : 76) + (num - 3);
            } else if (num <= 12) {
              // Base F1..F12 with modifiers (plain: 64, shift: +32, ctrl/alt: +10, both: +42)
              const base = 64 + (num - 1);
              const modOffset = (isShift ? 32 : 0) + (isCtrlOrAlt ? 10 : 0);
              keyId = base + modOffset;
            } else {
              // F13..F16 direct
              keyId = (isShift ? 108 : 76) + (num - 13);
            }

            const activeBuf = xtermRef.current?.buffer.active;
            const cursorY = isBlockModeRef.current ? screen.cursorRow : (activeBuf ? activeBuf.cursorY : screen.cursorRow);
            const cursorX = isBlockModeRef.current ? screen.cursorCol : (activeBuf ? activeBuf.cursorX : screen.cursorCol);

            const seq = screen.buildFunctionKeySequence(keyId, cursorY, cursorX);
            sendData(seq);
            setIsKeyboardLocked(screen.keyboardLocked);
            return false;
          }
        }

        // Insert key in Block Mode toggles local insert mode
        if (isBlockModeRef.current && e.key === "Insert" && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          const screen = screen6530Ref.current;
          screen.insertMode = !screen.insertMode;
          setIsInsertMode(screen.insertMode);
          return false;
        }

        // Lock Keyboard enforcement in Block Mode (Part 2 Step 13 & Section 5)
        // User cannot type text into screen while keyboard is locked.
        if (isBlockModeRef.current && screen6530Ref.current.keyboardLocked && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          return false;
        }

        // Local cursor navigation in Block Mode (both Protect Submode forms and TEDIT/EDIT Page Mode)
        if (isBlockModeRef.current) {
          const screen = screen6530Ref.current;
          if (screen.hasFields || screen.blockMode) {
            if (e.key === "Tab") {
              const newPos = e.shiftKey ? screen.tabToPrevField() : screen.tabToNextField();
              if (newPos) {
                terminal.write(`\x1b[${newPos.row + 1};${newPos.col + 1}H`);
              }
              e.preventDefault();
              return false;
            }

            // 6530 Page Up / Page Down / Roll Up / Roll Down / Insert Char / Delete Char Function Keys (Table 3-11)
            if (e.key === "PageDown") {
              e.preventDefault();
              if (screen.keyboardLocked) return false;
              sendData(screen.generateWriteReadResponse(e.shiftKey || e.altKey ? "\x01r" : "\x01R"));
              return false;
            }
            if (e.key === "PageUp") {
              e.preventDefault();
              if (screen.keyboardLocked) return false;
              sendData(screen.generateWriteReadResponse(e.shiftKey || e.altKey ? "\x01s" : "\x01S"));
              return false;
            }
            if (e.altKey && e.key === "ArrowUp") {
              e.preventDefault();
              if (screen.keyboardLocked) return false;
              sendData(screen.generateWriteReadResponse(e.shiftKey ? "\x01p" : "\x01P"));
              return false;
            }
            if (e.altKey && e.key === "ArrowDown") {
              e.preventDefault();
              if (screen.keyboardLocked) return false;
              sendData(screen.generateWriteReadResponse(e.shiftKey ? "\x01q" : "\x01Q"));
              return false;
            }
            if (e.ctrlKey && e.key === "Insert" && screen.protectSubmode) {
              e.preventDefault();
              if (screen.keyboardLocked) return false;
              sendData(screen.generateWriteReadResponse("\x01T"));
              return false;
            }
            if (e.ctrlKey && e.key === "Delete" && screen.protectSubmode) {
              e.preventDefault();
              if (screen.keyboardLocked) return false;
              sendData(screen.generateWriteReadResponse("\x01t"));
              return false;
            }

            if (e.key === "ArrowLeft") {
              const pos = screen.moveCursorLeft();
              if (pos) terminal.write(`\x1b[${pos.row + 1};${pos.col + 1}H`);
              e.preventDefault();
              return false;
            }
            if (e.key === "ArrowRight") {
              const pos = screen.moveCursorRight();
              if (pos) terminal.write(`\x1b[${pos.row + 1};${pos.col + 1}H`);
              e.preventDefault();
              return false;
            }
            if (e.key === "ArrowUp") {
              const pos = screen.moveCursorUp();
              if (pos) terminal.write(`\x1b[${pos.row + 1};${pos.col + 1}H`);
              e.preventDefault();
              return false;
            }
            if (e.key === "ArrowDown") {
              const pos = screen.moveCursorDown();
              if (pos) terminal.write(`\x1b[${pos.row + 1};${pos.col + 1}H`);
              e.preventDefault();
              return false;
            }
            if (e.key === "Home") {
              const pos = screen.homeCursor();
              if (pos) terminal.write(`\x1b[${pos.row + 1};${pos.col + 1}H`);
              e.preventDefault();
              return false;
            }
          }
        }
      }

      // Ctrl+F or Cmd+F for Search
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && e.type === "keydown") {
        setShowSearch((prev) => !prev);
        return false;
      }
      // Ctrl+Shift+I or Cmd+Shift+I for Copilot Side Panel (SSH only)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyI" && e.type === "keydown" && protocol !== "telnet") {
        setShowCopilot((prev) => {
          const next = !prev;
          setTimeout(safeFit, 60);
          return next;
        });
        return false;
      }
      // Ctrl+Shift+C or Cmd+C for Copy
      if (((e.ctrlKey && e.shiftKey) || e.metaKey) && e.code === "KeyC" && e.type === "keydown") {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false;
        }
      }
      // Paste
      if (((e.ctrlKey && e.shiftKey) || e.metaKey || (e.ctrlKey && !e.shiftKey && !e.altKey)) && e.code === "KeyV" && e.type === "keydown") {
        return true;
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
      if (isDisconnected) setIsDisconnected(false);

      const isEscapeSequence = data.startsWith("\x1b");
      const isBlock = isBlockModeRef.current;
      const screen = screen6530Ref.current;

      // --- History Tracking (Both Modes) ---
      if (!isEscapeSequence) {
        if (data === "\r" || data === "\n") {
          const cmdToSave = isBlock ? blockBufferRef.current : historyBufferRef.current;
          const trimmedCmd = cmdToSave.trim();

          if (trimmedCmd) {
            addHistory(trimmedCmd);

            const upperCmd = trimmedCmd.toUpperCase();
            if (upperCmd.startsWith("SE ")) {
              const user = trimmedCmd.substring(3).trim();
              hpNsUserRef.current = user.split(' ')[0];
            } else if (upperCmd.startsWith("SECOM ")) {
              const user = trimmedCmd.substring(6).trim();
              hpNsUserRef.current = user.split(' ')[0];
            } else if (upperCmd.startsWith("OSH ") || upperCmd === "OSH") {
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

      // LINE / CONVERSATIONAL MODE
      if (!isBlock) {
        sendData(data);
        return;
      }

      // -----------------------------------------------------------------
      // BLOCK MODE LOGIC (TEDIT / EDIT / DBU / Pathway Forms)
      // -----------------------------------------------------------------

      if (isEscapeSequence) {
        // Never leak raw VT/ANSI escape sequences to the host in 6530 Block Mode
        if (!is6530Ref.current) {
          sendData(data);
        }
        return;
      }

      // Step 13: Keyboard Lock enforcement in Block Mode
      if (screen.keyboardLocked) {
        return;
      }

      // Check for Submit (Enter / \r)
      if (data === "\r" || data === "\n") {
        if (screen.hasFields || screen.blockMode) {
          const response = screen.generateWriteReadResponse('\r');
          sendData(response);
          setIsKeyboardLocked(screen.keyboardLocked);
          const fieldData = screen.collectFieldData();
          if (fieldData.trim()) addHistory(fieldData.trim());
        } else {
          const bufferedCommand = blockBufferRef.current;
          sendData(bufferedCommand + "\r");
        }
        blockBufferRef.current = "";
        return;
      }

      // Check for Backspace/Delete (\x7f or \b)
      if (data === "\x7f" || data === "\b") {
        if (screen.hasFields || screen.blockMode) {
          if (screen.deleteCharAtCursor()) {
            terminal.write("\b \b");
          }
        } else {
          if (blockBufferRef.current.length > 0) {
            blockBufferRef.current = blockBufferRef.current.slice(0, -1);
            terminal.write("\b \b");
          }
        }
        return;
      }

      // Check for Ctrl+C (\x03) or Ctrl+D (\x04)
      if (data === "\x03" || data === "\x04") {
        blockBufferRef.current = "";
        // Never send raw 0x03 (ETX) or 0x04 (EOT) in 6530 Block Mode — raw ETX corrupts block framing!
        if (!is6530Ref.current) {
          sendData(data);
        }
        return;
      }

      // Accumulate standard printable characters into 6530 page memory
      if (screen.hasFields || screen.blockMode) {
        for (const ch of data) {
          if (screen.writeUserChar(ch)) {
            terminal.write(ch);
          }
        }
      } else {
        blockBufferRef.current += data;
        terminal.write(data);
      }
    });

    terminal.onResize(({ cols, rows }) => {
      if (protocol === "telnet") {
        invoke("telnet_resize", { sessionId, cols, rows }).catch(console.error);
      } else {
        invoke("ssh_resize", { sessionId, cols, rows }).catch(console.error);
      }
    });

    let unlisten: UnlistenFn | null = null;
    let unlistenDisconnect: UnlistenFn | null = null;
    let isMounted = true;

    listen<string>("terminal-disconnected", (event) => {
      if (event.payload === sessionId) {
        setIsDisconnected(true);
      }
    }).then((fn) => {
      if (!isMounted) {
        fn();
      } else {
        unlistenDisconnect = fn;
      }
    });

    listen<TerminalData>("terminal-data", (event) => {
      if (event.payload.session_id === sessionId) {
        const incomingData = event.payload.data;

        // Dynamic 6530 Auto-detection: promote session to 6530 mode whenever host sends
        // 6530 mode-switch, status/config query, or page-register sequences.
        if (
          !is6530Ref.current &&
          (incomingData.includes("\x01B\x03") ||
            incomingData.includes("\x01b\x03") ||
            incomingData.includes("\x1bW") ||
            incomingData.includes("\x1bb") ||
            incomingData.includes("\x1b^") ||
            incomingData.includes("\x1b_") ||
            incomingData.includes("\x1b?") ||
            incomingData.includes("\x1b:") ||
            incomingData.includes("\x1b;"))
        ) {
          setIs6530Session(true);
          is6530Ref.current = true;
        }

        // --- 6530 Block Mode & Page Register Processing ---
        if (is6530Ref.current) {
          const chunk = pending6530BufferRef.current + incomingData;
          const translated = translate6530ToAnsi(chunk, isBlockModeRef.current);
          pending6530BufferRef.current = translated.pendingRemainder;
          const screen = screen6530Ref.current;
          let displayPageChanged = false;

          // Process all 6530 screen/mode/page commands in exact sequential order!
          for (const cmd of translated.screenCommands) {
            switch (cmd.type) {
              case 'enterBlockMode':
                screen.enterBlockMode();
                isBlockModeRef.current = true;
                setIsBlockMode(true);
                setIsKeyboardLocked(true);
                blockBufferRef.current = "";
                if (terminal) {
                  terminal.options.scrollback = 0;
                  terminal.write("\x1b[3J");
                }
                break;
              case 'enterConvMode':
                screen.enterConversationalMode();
                isBlockModeRef.current = false;
                setIsBlockMode(false);
                setIsKeyboardLocked(false);
                blockBufferRef.current = "";
                if (terminal) {
                  terminal.options.scrollback = scrollback;
                  terminal.write("\x1b[0m\x1b[2J\x1b[3J\x1b[H");
                }
                break;
              case 'protectSubEnter':
                screen.enterProtectSubmode();
                screen.blockMode = true;
                isBlockModeRef.current = true;
                setIsBlockMode(true);
                setIsKeyboardLocked(true);
                blockBufferRef.current = "";
                break;
              case 'protectSubExit':
                screen.exitProtectSubmode();
                break;
              case 'setTabStop':
                screen.setTabStop();
                break;
              case 'clearTabStops':
                screen.clearAllTabStops();
                break;
              case 'selectPage':
                screen.selectWritePage(cmd.page!);
                break;
              case 'displayPage':
                if (screen.displayPage !== cmd.page) {
                  displayPageChanged = true;
                }
                screen.selectDisplayPage(cmd.page!);
                break;
              case 'setMaxPages':
                screen.setMaxPages(cmd.page!);
                break;
              case 'bufferAddress':
                screen.setBufferAddress(cmd.row!, cmd.col!);
                break;
              case 'cursor':
                screen.setCursor(cmd.row!, cmd.col!);
                break;
              case 'cursorOnly':
                screen.setCursorOnly(cmd.row!, cmd.col!);
                break;
              case 'startField':
                screen.startField(cmd.videoAttr!, cmd.dataAttr!, cmd.extAttr);
                break;
              case 'defineFieldAttr':
                screen.defineFieldAttribute(cmd.row!, cmd.col!, cmd.dataAttr!);
                break;
              case 'videoAttr':
                screen.setVideoAttribute(cmd.videoAttr!);
                break;
              case 'protectStart':
                screen.startProtected();
                break;
              case 'protectEnd':
                screen.startUnprotected();
                break;
              case 'unlockKeyboard':
                screen.keyboardLocked = false;
                setIsKeyboardLocked(false);
                break;
              case 'lockKeyboard':
                screen.keyboardLocked = true;
                setIsKeyboardLocked(true);
                break;
              case 'eraseEop':
                screen.eraseToEndOfPage();
                break;
              case 'eraseEol':
                screen.eraseToEndOfLine();
                break;
              case 'clearMemory':
                screen.clearMemoryToSpaces(cmd.row, cmd.col, cmd.endRow, cmd.endCol);
                break;
              case 'insertLine':
                screen.insertLine();
                break;
              case 'deleteLine':
                screen.deleteLine();
                break;
              case 'insertChar':
                screen.insertChar();
                break;
              case 'deleteChar':
                screen.deleteChar();
                break;
              case 'resetMdt':
                screen.resetModifiedDataTags();
                break;
              case 'readBuffer':
                sendData(screen.generateReadBufferResponse(false, cmd.row, cmd.col, cmd.endRow, cmd.endCol));
                break;
              case 'readWithAddress':
                sendData(screen.generateReadBufferResponse(true, cmd.row, cmd.col, cmd.endRow, cmd.endCol, false));
                break;
              case 'readWithAddressAll':
                if (isBlockModeRef.current || screen.blockMode) {
                  sendData(screen.generateReadBufferResponse(true, cmd.row ?? 0, cmd.col ?? 0, cmd.endRow ?? 23, cmd.endCol ?? 79, true));
                } else {
                  sendData(screen.generateStatusResponse(false));
                }
                break;
              case 'readScreenAllAttrs':
                sendData(screen.generateReadScreenWithAttributesResponse(cmd.row, cmd.col, cmd.endRow, cmd.endCol));
                break;
              case 'readCursor': {
                const activeBuf = xtermRef.current?.buffer.active;
                const cursorY = isBlockModeRef.current ? screen.cursorRow : (activeBuf ? activeBuf.cursorY : screen.cursorRow);
                const cursorX = isBlockModeRef.current ? screen.cursorCol : (activeBuf ? activeBuf.cursorX : screen.cursorCol);
                sendData(screen.generateCursorAddressResponse(isBlockModeRef.current, cursorY, cursorX));
                break;
              }
              case 'readStatus':
                sendData(screen.generateStatusResponse(isBlockModeRef.current));
                break;
              case 'readRevision':
                sendData(screen.generateRevisionResponse(isBlockModeRef.current));
                break;
              case 'readConfig':
                sendData(screen.generateConfigResponse(isBlockModeRef.current));
                break;
              case 'readColorConfig':
                sendData(screen.generateColorConfigResponse(isBlockModeRef.current));
                break;
              case 'simulateFKey': {
                const keyId = cmd.char ? cmd.char.charCodeAt(0) : 64; // default F1
                const activeBuf = xtermRef.current?.buffer.active;
                const cursorY = isBlockModeRef.current ? screen.cursorRow : (activeBuf ? activeBuf.cursorY : screen.cursorRow);
                const cursorX = isBlockModeRef.current ? screen.cursorCol : (activeBuf ? activeBuf.cursorX : screen.cursorCol);
                sendData(screen.buildFunctionKeySequence(keyId, cursorY, cursorX));
                setIsKeyboardLocked(screen.keyboardLocked);
                break;
              }
              case 'statusMessage':
                screen.statusLine = cmd.char ?? '';
                setStatusLineText(screen.statusLine);
                break;
              case 'enq':
                sendData("\x06"); // ACK
                break;
              case 'char':
                screen.writeServerChar(cmd.char!);
                break;
              case 'clear':
                screen.clearSelectedPage();
                break;
            }
          }

          setCursorPos({ row: screen.cursorRow, col: screen.cursorCol });
          setStatusLineText(screen.statusLine);
          setIsKeyboardLocked(screen.keyboardLocked);
          setIsInsertMode(screen.insertMode);

          // Auto-answer Terminal Type if host prompts in conversational stream (SSH only)
          if (
            protocol !== "telnet" &&
            lastTermTypePromptReplyRef.current === 0 &&
            (translated.data?.length || 0) < 512
          ) {
            const lowerText = (translated.data || "").toLowerCase();
            if (
              lowerText.includes("terminal type?") ||
              lowerText.includes("terminal type:") ||
              lowerText.includes("terminal type [") ||
              lowerText.includes("terminal type (") ||
              lowerText.includes("enter terminal type") ||
              lowerText.includes("term = ") ||
              lowerText.includes("terminal [6530]") ||
              lowerText.includes("terminal [tn6530")
            ) {
              lastTermTypePromptReplyRef.current = Date.now();
              sendData("TN6530-8\r");
            }
          }

          if (isBlockModeRef.current && (displayPageChanged || translated.screenCommands.length > 0)) {
            terminal.write(screen.renderDisplayPageToAnsi());
          } else {
            terminal.write(translated.data);
          }
        } else {
          // Non-6530 sessions: standard handling
          if (incomingData.includes("\x1b[?1049l") || incomingData.includes("\x1b[?47l")) {
            setIsBlockMode(false);
            blockBufferRef.current = "";
          }

          if (hpNsUserRef.current && onTitleChange && hpNsUserRef.current !== lastReportedTitleRef.current) {
            if (incomingData.includes(">") || incomingData.includes("$") || incomingData.includes("#")) {
              lastReportedTitleRef.current = hpNsUserRef.current;
              onTitleChange(hpNsUserRef.current);
            }
          }

          if (
            protocol !== "telnet" &&
            lastTermTypePromptReplyRef.current === 0 &&
            incomingData.length < 512
          ) {
            const lowerNon6530 = incomingData.toLowerCase();
            if (
              lowerNon6530.includes("terminal type?") ||
              lowerNon6530.includes("terminal type:") ||
              lowerNon6530.includes("enter terminal type") ||
              lowerNon6530.includes("terminal type [")
            ) {
              lastTermTypePromptReplyRef.current = Date.now();
              sendData("TN6530-8\r");
            }
          }

          terminal.write(incomingData);
        }
      }
    }).then((fn) => {
      if (!isMounted) {
        fn();
      } else {
        unlisten = fn;
        unlistenRef.current = fn;
        terminal.write("\x1b[32m● Connected! Waiting for shell...\x1b[0m\r\n\r\n");
      }
    });

    let resizeFrameId: number | null = null;
    const throttledFit = () => {
      if (resizeFrameId !== null) return;
      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = null;
        safeFit();
      });
    };

    const handleResize = () => throttledFit();
    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (terminalRef.current && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => throttledFit());
      resizeObserver.observe(terminalRef.current);
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        safeFit();
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current;
          if (cols > 0 && rows > 0) {
            invoke(protocol === "telnet" ? "telnet_resize" : "ssh_resize", { sessionId, cols, rows }).catch(console.error);
          }
          terminal.focus();
        }
      }, 50);
    });

    return () => {
      isMounted = false;
      if (resizeFrameId !== null) cancelAnimationFrame(resizeFrameId);
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (unlisten) unlisten();
      if (unlistenDisconnect) unlistenDisconnect();
      if (unlistenRef.current) unlistenRef.current();
      terminal.dispose();
    };
  }, [sessionId, sendData]);

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

  const handleToolbarKey = (key: string) => {
    const screen = screen6530Ref.current;
    const fKeyId = translateFunctionKeyCommand(key);
    if (is6530Ref.current && fKeyId !== null) {
      if (isBlockModeRef.current && screen.keyboardLocked) {
        terminalRef.current?.focus();
        return;
      }
      const activeBuf = xtermRef.current?.buffer.active;
      const cursorY = isBlockModeRef.current ? screen.cursorRow : (activeBuf ? activeBuf.cursorY : screen.cursorRow);
      const cursorX = isBlockModeRef.current ? screen.cursorCol : (activeBuf ? activeBuf.cursorX : screen.cursorCol);
      const seq = screen.buildFunctionKeySequence(fKeyId, cursorY, cursorX);
      sendData(seq);
      setIsKeyboardLocked(screen.keyboardLocked);
      terminalRef.current?.focus();
      return;
    }

    const seq = CONTROL_SEQUENCES[key];
    if (!seq) return;
    if (is6530Ref.current) {
      if (key === "Ctrl+C") {
        if (!isBlockModeRef.current) {
          sendData(seq);
        }
        terminalRef.current?.focus();
        return;
      }
      if (key === "Up" || key === "Down") {
        if (isBlockModeRef.current && (screen.hasFields || screen.blockMode)) {
          const pos = key === "Up" ? screen.moveCursorUp() : screen.moveCursorDown();
          if (pos) xtermRef.current?.write(`\x1b[${pos.row + 1};${pos.col + 1}H`);
        } else {
          sendData(seq);
        }
        terminalRef.current?.focus();
        return;
      }
      if (isBlockModeRef.current && (screen.hasFields || screen.blockMode)) {
        if (screen.keyboardLocked) {
          terminalRef.current?.focus();
          return;
        }
        sendData(screen.generateWriteReadResponse(seq));
        setIsKeyboardLocked(screen.keyboardLocked);
      } else {
        const activeBuf = xtermRef.current?.buffer.active;
        const cursorY = activeBuf ? activeBuf.cursorY : screen.cursorRow;
        const cursorX = activeBuf ? activeBuf.cursorX : screen.cursorCol;
        const keyId = seq.charCodeAt(seq.length - 1);
        sendData(screen.buildFunctionKeySequence(keyId, cursorY, cursorX));
      }
    } else {
      sendData(seq);
    }
    terminalRef.current?.focus();
  };

  return (
    <div className="terminal-container" style={{ backgroundColor: useCustomColors ? customBackground : TERMINAL_THEMES[themeName].colors.background, display: "flex", flexDirection: "column" }}>

      {/* Toolbar Trigger Area */}
      <div style={{ position: "absolute", top: 4, right: 12, zIndex: 10, display: "flex", alignItems: "center", gap: "8px" }}>

        {/* Terminal Mode Pill Indicator */}
        <div
          title={is6530Session ? (isBlockMode ? "6530 Block Mode (Click to toggle)" : "6530 Conversational Mode (Click to toggle)") : (isBlockMode ? "Block Mode" : "Line Mode")}
          onClick={() => {
            const nextMode = !isBlockModeRef.current;
            isBlockModeRef.current = nextMode;
            setIsBlockMode(nextMode);
            if (nextMode) {
              screen6530Ref.current.enterBlockMode();
            } else {
              screen6530Ref.current.enterConversationalMode();
            }
          }}
          style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
            padding: "2px 8px", borderRadius: "12px", fontSize: "11px",
            color: is6530Session ? "#60a5fa" : "var(--text-muted)",
            display: "flex", alignItems: "center", gap: "6px",
            cursor: "pointer", userSelect: "none"
          }}
        >
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: isBlockMode ? "#60a5fa" : "#34d399",
            boxShadow: isBlockMode ? "0 0 6px rgba(96,165,250,0.5)" : "none"
          }} />
          {is6530Session ? (isBlockMode ? "6530 Block" : "6530 Conv.") : (isBlockMode ? "Block Mode" : "Line Mode")}
        </div>

        {/* Copilot AI Assistant Button (SSH Only) */}
        {protocol !== "telnet" && (
          <button
            className={`btn ${showCopilot ? "btn-primary" : "btn-secondary"}`}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: showCopilot
                ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                : "rgba(99, 102, 241, 0.12)",
              color: showCopilot ? "#ffffff" : "#a5b4fc",
              border: showCopilot
                ? "1px solid rgba(255, 255, 255, 0.2)"
                : "1px solid rgba(139, 92, 246, 0.4)",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              boxShadow: showCopilot ? "0 0 12px rgba(99, 102, 241, 0.4)" : "none",
              transition: "all 0.15s ease",
            }}
            onClick={() => {
              setShowCopilot((prev) => {
                const next = !prev;
                setTimeout(safeFit, 60);
                return next;
              });
            }}
            title="Toggle GitHub Copilot AI Assistant [Ctrl+Shift+I]"
          >
            <Icons.Sparkles style={{ width: 13, height: 13 }} />
            <span>Copilot</span>
          </button>
        )}

        {/* Clear Button */}
        <button
          className="btn btn-secondary"
          style={{ padding: "4px 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", color: "var(--col-red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
          onClick={() => {
            blockBufferRef.current = "";
            screen6530Ref.current.reset();
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

      {/* Terminal View & GitHub Copilot Side Panel Split */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <div
          style={{
            flex: 1,
            minWidth: "260px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative"
          }}
        >
          <div
            ref={terminalRef}
            style={{ flex: 1, overflow: "hidden", padding: "8px", cursor: "text" }}
            className="xterm-wrapper"
            onClick={() => xtermRef.current?.focus()}
          />
        </div>

        {/* GitHub Copilot Side Panel (SSH Connections Only) */}
        {showCopilot && protocol !== "telnet" && (
          <>
            <div
              className={`copilot-resizer ${isResizingCopilot ? "resizing" : ""}`}
              onMouseDown={startResizeCopilot}
              title="Drag to resize Copilot panel"
            />
            <div
              style={{
                width: `${copilotWidth}px`,
                flexShrink: 0,
                height: "100%",
                display: "flex",
                overflow: "hidden"
              }}
            >
              <CopilotPanel
                sessionId={sessionId}
                onClose={() => {
                  setShowCopilot(false);
                  setTimeout(safeFit, 60);
                }}
                getTerminalOutput={getTerminalOutput}
                onRunCommand={(cmd) => {
                  sendData(cmd + "\r");
                  xtermRef.current?.focus();
                }}
                themeName={themeName}
              />
            </div>
          </>
        )}
      </div>

      {/* 6530 25th Row Status Line */}
      {is6530Session && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "3px 12px",
          background: "rgba(0, 0, 0, 0.45)",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          fontFamily: fontFamily || "monospace",
          fontSize: "11px",
          color: "#94a3b8",
          userSelect: "none",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontWeight: 600, color: isBlockMode ? "#60a5fa" : "#34d399" }}>
              {isBlockMode ? (screen6530Ref.current.protectSubmode ? "BLOCK [PROT]" : "BLOCK [UNPROT]") : "CONVERSATIONAL"}
            </span>
            <span>Page {screen6530Ref.current.displayPage}/{screen6530Ref.current.maxPages}</span>
            <span>R:{cursorPos.row + 1} C:{cursorPos.col + 1}</span>
            <span style={{ color: isKeyboardLocked ? "#f87171" : "#4ade80", fontWeight: 600 }}>
              {isKeyboardLocked ? "LOCKED" : "READY"}
            </span>
            <span style={{ color: isInsertMode ? "#fbbf24" : "inherit" }}>
              {isInsertMode ? "INS" : "OVR"}
            </span>
          </div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e2e8f0" }}>
            {statusLineText || screen6530Ref.current.statusLine}
          </div>
        </div>
      )}

      {/* On-Screen Function Keys Toolbar (Below terminal screen, per 6530 Spec Section 1) */}
      {showToolbar && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          background: "rgba(15, 23, 42, 0.8)",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "4px 8px",
          gap: "4px",
          userSelect: "none",
          flexShrink: 0
        }}>
          {/* Row 1: F1..F8 (and SF1..SF8 when showShiftButtons is active) + Connect/Disconnect */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", overflowX: "auto" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              {["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"].map(key => (
                <button
                  key={key}
                  onClick={() => handleToolbarKey(key)}
                  style={{
                    padding: "3px 8px", background: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#e2e8f0", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600, flexShrink: 0, minWidth: "36px"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)"}
                  title={`Send ${key}`}
                >
                  {key}
                </button>
              ))}
            </div>

            {showShiftButtons && (
              <div style={{ display: "flex", gap: "4px", paddingLeft: "6px", borderLeft: "1px solid rgba(255, 255, 255, 0.15)" }}>
                {["SF1", "SF2", "SF3", "SF4", "SF5", "SF6", "SF7", "SF8"].map(key => (
                  <button
                    key={key}
                    onClick={() => handleToolbarKey(key)}
                    style={{
                      padding: "3px 8px", background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.3)",
                      color: "#93c5fd", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600, flexShrink: 0, minWidth: "40px"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.28)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.15)"}
                    title={`Send ${key}`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
              <button
                onClick={() => {
                  if (isDisconnected) {
                    setIsDisconnected(false);
                    terminalRef.current?.focus();
                    if (protocol !== "telnet") {
                      invoke("ssh_keepalive", { sessionId }).catch(() => {});
                    }
                  } else {
                    _onDisconnect?.();
                  }
                }}
                style={{
                  padding: "3px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "4px", cursor: "pointer",
                  color: isDisconnected ? "#22c55e" : "#ef4444",
                  border: isDisconnected ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(239, 68, 68, 0.4)",
                  background: isDisconnected ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)"
                }}
                title={isDisconnected ? "Connect to host" : "Disconnect session"}
              >
                {isDisconnected ? "Connect" : "Disconnect"}
              </button>
            </div>
          </div>

          {/* Row 2: F9..F16 (and SF9..SF16 when showShiftButtons is active) + Toggle Shift + Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", overflowX: "auto" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              {["F9", "F10", "F11", "F12", "F13", "F14", "F15", "F16"].map(key => (
                <button
                  key={key}
                  onClick={() => handleToolbarKey(key)}
                  style={{
                    padding: "3px 8px", background: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#e2e8f0", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600, flexShrink: 0, minWidth: "36px"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)"}
                  title={`Send ${key}`}
                >
                  {key}
                </button>
              ))}
            </div>

            {showShiftButtons && (
              <div style={{ display: "flex", gap: "4px", paddingLeft: "6px", borderLeft: "1px solid rgba(255, 255, 255, 0.15)" }}>
                {["SF9", "SF10", "SF11", "SF12", "SF13", "SF14", "SF15", "SF16"].map(key => (
                  <button
                    key={key}
                    onClick={() => handleToolbarKey(key)}
                    style={{
                      padding: "3px 8px", background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.3)",
                      color: "#93c5fd", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600, flexShrink: 0, minWidth: "40px"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.28)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.15)"}
                    title={`Send ${key}`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
              <button
                onClick={() => setShowShiftButtons(!showShiftButtons)}
                style={{
                  padding: "3px 8px", fontSize: "11px", fontWeight: 600, borderRadius: "4px", cursor: "pointer",
                  background: showShiftButtons ? "rgba(99, 102, 241, 0.25)" : "rgba(255, 255, 255, 0.05)",
                  border: showShiftButtons ? "1px solid rgba(99, 102, 241, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
                  color: showShiftButtons ? "#a5b4fc" : "#94a3b8"
                }}
                title="Toggle Shifted Function Keys (SF1..SF16)"
              >
                SF Keys
              </button>
              {["Ctrl+C", "Up", "Down"].map(key => (
                <button
                  key={key}
                  onClick={() => handleToolbarKey(key)}
                  style={{
                    padding: "3px 8px", background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#94a3b8", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600
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
        </div>
      )}

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

      {isDisconnected && (
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
            {protocol === "telnet"
              ? "The remote NonStop / TELSERV host closed the connection or the network was interrupted."
              : "The remote SSH server closed the connection or the network was interrupted."}
          </p>
          <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
            <button
              onClick={() => {
                setIsDisconnected(false);
                terminalRef.current?.focus();
                if (protocol !== "telnet") {
                  invoke("ssh_keepalive", { sessionId }).catch(() => {});
                }
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
                setIsDisconnected(false);
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
