import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { useEffect } from 'react';

// Mock Tauri common APIs
const mockInvoke = vi.fn(async (command) => {
  if (command === 'sessions_get_all') return { success: true, data: [], error: null };
  if (command === 'sessions_get_favorites') return { success: true, data: [], error: null };
  if (command === 'sessions_get_recent') return { success: true, data: [], error: null };
  if (command === 'storage_is_locked') return { success: true, data: false, error: null };
  if (command === 'storage_has_password') return { success: true, data: false, error: null };
  if (command === 'ssh_is_connected') return { success: true, data: false, error: null };
  if (command === 'snippets_get_all') return { success: true, data: [], error: null };
  if (command === 'custom_themes_get_all') return { success: true, data: [], error: null };
  return { success: true, data: null, error: null };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => { })),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    listen: vi.fn(() => () => { }),
    emit: vi.fn(),
    label: 'main',
  })),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(async () => '/mock/app/data'),
  appLocalDataDir: vi.fn(async () => '/mock/app/local/data'),
  join: vi.fn(async (...parts) => parts.join('/')),
}));

// Mock Tauri Plugins
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async () => ''),
  writeTextFile: vi.fn(async () => { }),
  exists: vi.fn(async () => false),
  mkdir: vi.fn(async () => { }),
  BaseDirectory: { AppLocalData: 'AppLocalData' },
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
  message: vi.fn(async () => { }),
  ask: vi.fn(async () => true),
  confirm: vi.fn(async () => true),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => { }),
  revealPath: vi.fn(async () => { }),
}));

// Mock Browser APIs
global.ResizeObserver = class ResizeObserver {
  observe() { }
  unobserve() { }
  disconnect() { }
};

// Mock ScrollTo
Element.prototype.scrollTo = vi.fn();

// Mock localStorage
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    clear: () => { store = {}; },
    removeItem: (key: string) => { delete store[key]; }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });

// Mock xterm.js Terminal as a Spy
export const mockTerminal = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  onData: vi.fn(() => ({ dispose: () => { } })),
  onKey: vi.fn(() => ({ dispose: () => { } })),
  onResize: vi.fn(() => ({ dispose: () => { } })),
  onTitleChange: vi.fn(() => ({ dispose: () => { } })),
  onSelectionChange: vi.fn(() => ({ dispose: () => { } })),
  attachCustomKeyEventHandler: vi.fn(),
  dispose: vi.fn(),
  clear: vi.fn(),
  focus: vi.fn(),
  blur: vi.fn(),
  getSelection: vi.fn(() => ''),
  options: {},
  cols: 80,
  rows: 24,
};

const TerminalSpy = vi.fn(() => mockTerminal);

vi.mock('@xterm/xterm', () => ({
  Terminal: TerminalSpy,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => ({
    fit: vi.fn(),
    activate: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn(() => ({
    activate: vi.fn(),
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearDecorations: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(() => ({
    activate: vi.fn(),
  })),
}));

// Mock Monaco Editor
const mockMonaco = {
  KeyMod: {
    CtrlCmd: 2048,
    Alt: 512,
    Shift: 1024,
    WinCtrl: 256,
  },
  KeyCode: {
    KeyS: 49,
    Enter: 3,
    Escape: 9,
  }
};

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ defaultValue, onMount }: any) => {
    useEffect(() => {
      if (onMount) {
        onMount({
          getValue: () => 'mocked editor value',
          setValue: vi.fn(),
          addCommand: vi.fn(),
          focus: vi.fn(),
          onKeyDown: vi.fn(() => ({ dispose: vi.fn() })),
        }, mockMonaco);
      }
    }, [onMount]);

    return (
      <textarea
        data-testid="monaco-editor"
        defaultValue={defaultValue}
      />
    );
  }
}));
