import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TerminalComponent } from '../../components/Terminal';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';

// Mock addHistory utility
vi.mock('../utils/history', () => ({
  addHistory: vi.fn(),
}));

describe('TerminalComponent', () => {
  const defaultProps = {
    sessionId: 'test-session',
    onDisconnect: vi.fn(),
    isVisible: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.navigator.clipboard
    Object.assign(window.navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue('pasted text'),
      },
    });
  });

  it('renders correctly and initializes xterm', async () => {
    render(<TerminalComponent {...defaultProps} />);
    const container = document.querySelector('.terminal-container');
    expect(container).toBeInTheDocument();
  });

  it('sends data to backend when terminal receives input', async () => {
    render(<TerminalComponent {...defaultProps} />);

    await waitFor(() => {
      expect(Terminal).toHaveBeenCalled();
    });

    const terminalInstance = (Terminal as any).mock.results[0].value;
    const onDataMock = terminalInstance.onData;

    expect(onDataMock).toHaveBeenCalled();
    const onDataCallback = onDataMock.mock.calls[0][0];

    onDataCallback('ls -la\r');

    expect(invoke).toHaveBeenCalledWith('ssh_send', { sessionId: 'test-session', data: 'ls -la\r' });
  });

  it('writes data to terminal when terminal-data event is received', async () => {
    let eventHandler: (event: any) => void = () => {};
    (listen as any).mockImplementation((name: string, cb: any) => {
      if (name === 'terminal-data') {
        eventHandler = cb;
      }
      return Promise.resolve(() => {});
    });

    render(<TerminalComponent {...defaultProps} />);

    await waitFor(() => {
      expect(Terminal).toHaveBeenCalled();
    });

    const terminalInstance = (Terminal as any).mock.results[0].value;
    const writeMock = terminalInstance.write;

    eventHandler({ payload: { session_id: 'test-session', data: 'hello world' } });

    expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('hello world'));
  });

  it('clears terminal on Clear button click', async () => {
    render(<TerminalComponent {...defaultProps} />);

    await waitFor(() => {
      expect(Terminal).toHaveBeenCalled();
    });

    const terminalInstance = (Terminal as any).mock.results[0].value;
    const clearMock = terminalInstance.clear;

    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);

    expect(clearMock).toHaveBeenCalled();
  });

  it('dynamically switches to 6530 Block Mode and answers status query over Telnet', async () => {
    let eventHandler: (event: any) => void = () => {};
    (listen as any).mockImplementation((name: string, cb: any) => {
      if (name === 'terminal-data') {
        eventHandler = cb;
      }
      return Promise.resolve(() => {});
    });

    render(<TerminalComponent {...defaultProps} protocol="telnet" isNonStop={true} />);

    await waitFor(() => {
      expect(Terminal).toHaveBeenCalled();
    });

    expect(screen.getByText('6530 Conv.')).toBeInTheDocument();

    // Host sends SOH B ETX LRC ('A') + ESC ^ (Read Primary Status)
    eventHandler({ payload: { session_id: 'test-session', data: '\x01B\x03A\x1b^' } });

    await waitFor(() => {
      expect(screen.getByText('6530 Block')).toBeInTheDocument();
    });

    expect(invoke).toHaveBeenCalledWith(
      'telnet_send',
      expect.objectContaining({
        sessionId: 'test-session',
        data: expect.stringMatching(/^\x01\?@FB7XY\x03/),
      })
    );
  });
});
