import { renderHook, waitFor, act } from '@testing-library/react';
import { useTerminalConnection } from '../../hooks/useTerminalConnection';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

describe('useTerminalConnection', () => {
  const mockAddLog = vi.fn();
  const mockSaveSession = vi.fn();
  const mockAddToRecent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with disconnected state', () => {
    const { result } = renderHook(() => useTerminalConnection({ 
      addLog: mockAddLog, 
      saveSession: mockSaveSession, 
      addToRecent: mockAddToRecent 
    }));

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.activeSessions).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
  });

  it('connects successfully', async () => {
    const config = {
      host: 'test.com',
      port: 22,
      username: 'user',
      password: 'pwd',
      sessionName: 'Test Session'
    };

    (invoke as any).mockResolvedValue({ 
      success: true, 
      data: { session_id: 'sess-1', host: 'test.com', username: 'user', banner: 'Welcome' },
      error: null 
    });

    const { result } = renderHook(() => useTerminalConnection({ 
      addLog: mockAddLog, 
      saveSession: mockSaveSession, 
      addToRecent: mockAddToRecent 
    }));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.connect(config);
    });

    expect(success).toBe(true);
    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.activeSessions.length).toBe(1);
    });
    expect(result.current.activeSessions[0].id).toBe('sess-1');
    expect(mockAddLog).toHaveBeenCalledWith('sess-1', expect.stringContaining('Connected'), 'success', 'SSH');
  });

  it('handles auth failure (AUTH_REQUIRED signal)', async () => {
    const config = {
      host: 'test.com',
      port: 22,
      username: 'user',
      password: '',
      sessionName: 'Test'
    };

    (invoke as any).mockResolvedValue({ 
      success: false, 
      data: null,
      error: 'Authentication failed: No password provided' 
    });

    const { result } = renderHook(() => useTerminalConnection({ 
      addLog: mockAddLog, 
      saveSession: mockSaveSession, 
      addToRecent: mockAddToRecent 
    }));

    await expect(result.current.connect(config)).rejects.toThrow('AUTH_REQUIRED');
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('disconnects a session', async () => {
    // First setup an active session manually or via connect
    const { result } = renderHook(() => useTerminalConnection({ 
        addLog: mockAddLog, 
        saveSession: mockSaveSession, 
        addToRecent: mockAddToRecent 
    }));

    // Mock successful connection first to get an active session
    (invoke as any).mockResolvedValueOnce({ 
        success: true, 
        data: { session_id: 'sess-1' },
        error: null 
    });

    await act(async () => {
        await result.current.connect({ host: 'h', port: 22, username: 'u', password: 'p', sessionName: 'n' });
    });

    expect(result.current.activeSessions.length).toBe(1);

    // Now disconnect
    (invoke as any).mockResolvedValueOnce({ success: true, data: null, error: null });
    
    await act(async () => {
        await result.current.disconnect('sess-1');
    });

    await waitFor(() => {
        expect(result.current.activeSessions.length).toBe(0);
    });
    expect(invoke).toHaveBeenCalledWith('ssh_disconnect', { sessionId: 'sess-1' });
  });
});
