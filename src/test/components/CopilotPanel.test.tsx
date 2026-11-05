import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotPanel } from '../../components/Copilot/CopilotPanel';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('CopilotPanel', () => {
  const defaultProps = {
    sessionId: 'session-123',
    onClose: vi.fn(),
    getTerminalOutput: vi.fn(() => 'Linux server 5.15.0 uptime: 10 days'),
    onRunCommand: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders login screen when unauthenticated', () => {
    render(<CopilotPanel {...defaultProps} />);
    expect(screen.getByText('Sign in to GitHub Copilot')).toBeInTheDocument();
    expect(screen.getByText(/Sign In with GitHub/i)).toBeInTheDocument();
  });

  it('renders JetBrains welcome state and Auto model when authenticated with Copilot', async () => {
    localStorage.setItem(
      'safar_copilot_auth',
      JSON.stringify({
        isAuthenticated: true,
        provider: 'github',
        isCopilotSubscriber: true,
        copilotToken: 'tid=123',
        user: { login: 'octocat' },
      })
    );

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'copilot_get_models') {
        return Promise.resolve({
          success: true,
          data: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
          ],
        });
      }
      return Promise.resolve({ success: true, data: 'OK' });
    });

    render(<CopilotPanel {...defaultProps} />);

    expect(screen.getByText('@octocat')).toBeInTheDocument();
    expect(screen.getByText('How can Copilot help you?')).toBeInTheDocument();

    // Verify "Auto" model is present as default/fallback
    const select = screen.getByTitle('Select AI Model') as HTMLSelectElement;
    expect(select.value).toBe('auto');

    // Wait for dynamic models from Copilot
    await waitFor(() => {
      expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
    });
  });

  it('displays warning on the icon instead of a full banner when subscription is not found', () => {
    localStorage.setItem(
      'safar_copilot_auth',
      JSON.stringify({
        isAuthenticated: true,
        provider: 'github',
        isCopilotSubscriber: false,
        accessToken: 'ghu_test',
        user: { login: 'freeuser' },
      })
    );

    render(<CopilotPanel {...defaultProps} />);

    // No full banner in chat
    expect(screen.queryByText(/Copilot Subscription Not Found/i)).not.toBeInTheDocument();

    // Warning is moved to the icon button with tooltip
    const warningBtn = document.querySelector('.copilot-header-warning-btn');
    expect(warningBtn).toBeInTheDocument();
    expect(warningBtn?.getAttribute('title')).toContain('Copilot subscription not found');

    // Warning styling on user pill
    const userPill = document.querySelector('.copilot-user-pill.has-warning');
    expect(userPill).toBeInTheDocument();
  });

  it('renders HP NonStop & OSS/Unix pills and captures last 50 lines on click', async () => {
    localStorage.setItem(
      'safar_copilot_auth',
      JSON.stringify({
        isAuthenticated: true,
        provider: 'github',
        isCopilotSubscriber: true,
        copilotToken: 'tid=123',
        user: { login: 'tandem-user' },
      })
    );

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'copilot_chat') {
        return Promise.resolve({ success: true, data: 'Analysis complete.' });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    render(<CopilotPanel {...defaultProps} />);

    expect(screen.getByText('HP NS Expert Terminal Analysis')).toBeInTheDocument();
    expect(screen.getByText('OSS / Unix Terminal Analysis')).toBeInTheDocument();

    // Click HP NS analysis pill
    fireEvent.click(screen.getByText('HP NS Expert Terminal Analysis'));

    await waitFor(() => {
      expect(defaultProps.getTerminalOutput).toHaveBeenCalledWith(50);
      expect(invoke).toHaveBeenCalledWith(
        'copilot_chat',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('HP NonStop (Tandem) System Administrator'),
            }),
          ]),
        })
      );
    });
  });

  it('uses custom system prompt override when specified', async () => {
    localStorage.setItem(
      'safar_copilot_auth',
      JSON.stringify({
        isAuthenticated: true,
        provider: 'github',
        isCopilotSubscriber: true,
        copilotToken: 'tid=123',
        customSystemPrompt: 'You are an HP NonStop Guardian expert.',
        user: { login: 'tandem-dev' },
      })
    );

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'copilot_chat') {
        return Promise.resolve({ success: true, data: 'TACL command: STATUS' });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    render(<CopilotPanel {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/Ask Copilot about your terminal/i);
    fireEvent.change(textarea, { target: { value: 'How do I check process status?' } });

    const sendBtn = screen.getByTitle('Send query to Copilot');
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'copilot_chat',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('You are an HP NonStop Guardian expert.'),
            }),
          ]),
        })
      );
    });
  });
});

