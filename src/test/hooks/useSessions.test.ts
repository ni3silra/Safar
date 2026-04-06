import { renderHook, waitFor } from '@testing-library/react';
import { useSessions } from '../../hooks/useSessions';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Mock Sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('useSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads sessions on mount', async () => {
    const mockSessions = [{ id: '1', name: 'Test', host: 'localhost', port: 22, username: 'user' }];
    (invoke as any).mockImplementation(async (cmd: string) => {
      if (cmd === 'sessions_get_all') return { success: true, data: mockSessions, error: null };
      if (cmd === 'sessions_get_favorites') return { success: true, data: [], error: null };
      if (cmd === 'sessions_get_recent') return { success: true, data: [], error: null };
      return null;
    });

    const { result } = renderHook(() => useSessions());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sessions).toEqual(mockSessions);
  });

  it('handles saveSession correctly', async () => {
    const newSession = { name: 'New', host: '1.1.1.1', port: 22, username: 'admin' };
    const savedSession = { ...newSession, id: 'uuid-123', is_favorite: false, auth_type: 'password' };

    (invoke as any).mockImplementation(async (cmd: string, _args: any) => {
      if (cmd === 'sessions_save') return { success: true, data: savedSession, error: null };
      if (cmd === 'sessions_get_all') return { success: true, data: [savedSession], error: null };
      if (cmd === 'sessions_get_favorites') return { success: true, data: [], error: null };
      if (cmd === 'sessions_get_recent') return { success: true, data: [], error: null };
      return null;
    });

    const { result } = renderHook(() => useSessions());

    let saved;
    await waitFor(async () => {
      saved = await result.current.saveSession(newSession as any);
    });

    expect(saved).toEqual(savedSession);
    expect(invoke).toHaveBeenCalledWith('sessions_save', { session: expect.any(Object) });
  });

  it('handles deleteSession correctly', async () => {
    (invoke as any).mockImplementation(async (cmd: string) => {
      if (cmd === 'sessions_delete') return { success: true, data: null, error: null };
      if (cmd === 'sessions_get_all') return { success: true, data: [], error: null };
      if (cmd === 'sessions_get_favorites') return { success: true, data: [], error: null };
      if (cmd === 'sessions_get_recent') return { success: true, data: [], error: null };
      return null;
    });

    const { result } = renderHook(() => useSessions());

    await waitFor(async () => {
      await result.current.deleteSession('123');
    });

    expect(invoke).toHaveBeenCalledWith('sessions_delete', { sessionId: '123' });
  });

  it('handles errors gracefully', async () => {
    (invoke as any).mockRejectedValue(new Error('Backend error'));

    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Error: Backend error');
    });
  });
});
