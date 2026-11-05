import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotPanel } from '../../components/Copilot/CopilotPanel';
import { buildProxyUrl } from '../../components/Copilot/types';
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

  describe('Corporate HTTP Proxy support', () => {
    it('buildProxyUrl formats proxy with or without authentication and handles encoding', () => {
      expect(buildProxyUrl(undefined)).toBeUndefined();
      expect(buildProxyUrl({ useProxy: false, proxyHost: 'sp-surf-proxy.intranet.db.com' })).toBeUndefined();

      // No auth
      expect(
        buildProxyUrl({
          useProxy: true,
          proxyHost: 'sp-surf-proxy.intranet.db.com',
          proxyPort: '8080',
        })
      ).toBe('http://sp-surf-proxy.intranet.db.com:8080');

      // Strip http:// if present in host
      expect(
        buildProxyUrl({
          useProxy: true,
          proxyHost: 'http://sp-surf-proxy.intranet.db.com/',
          proxyPort: '8080',
        })
      ).toBe('http://sp-surf-proxy.intranet.db.com:8080');

      // With authentication (user@domain encoded)
      expect(
        buildProxyUrl({
          useProxy: true,
          proxyHost: 'sp-surf-proxy.intranet.db.com',
          proxyPort: '8080',
          proxyAuthEnabled: true,
          proxyLogin: 'nitin-b.silra@db.com',
          proxyPassword: 'secretPassword#1',
        })
      ).toBe('http://nitin-b.silra%40db.com:secretPassword%231@sp-surf-proxy.intranet.db.com:8080');
    });

    it('displays active proxy badge on login screen when proxy is configured', () => {
      localStorage.setItem(
        'safar_copilot_auth',
        JSON.stringify({
          isAuthenticated: false,
          useProxy: true,
          proxyHost: 'sp-surf-proxy.intranet.db.com',
          proxyPort: '8080',
        })
      );

      render(<CopilotPanel {...defaultProps} />);

      expect(screen.getByText(/Proxy: sp-surf-proxy.intranet.db.com:8080/i)).toBeInTheDocument();
    });

    it('passes corporate proxy and ignoreSsl flag to invoke("copilot_chat")', async () => {
      localStorage.setItem(
        'safar_copilot_auth',
        JSON.stringify({
          isAuthenticated: true,
          provider: 'github',
          isCopilotSubscriber: true,
          copilotToken: 'tid=123',
          user: { login: 'octocat' },
          useProxy: true,
          proxyHost: 'sp-surf-proxy.intranet.db.com',
          proxyPort: '8080',
          proxyAuthEnabled: true,
          proxyLogin: 'nitin-b.silra@db.com',
          proxyPassword: 'mypassword',
          ignoreSslErrors: true,
        })
      );

      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'copilot_chat') {
          return Promise.resolve({ success: true, data: 'Response via corporate proxy' });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      render(<CopilotPanel {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/Ask Copilot about your terminal/i);
      fireEvent.change(textarea, { target: { value: 'Analyze server logs' } });

      const sendBtn = screen.getByTitle('Send query to Copilot');
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          'copilot_chat',
          expect.objectContaining({
            proxy: 'http://nitin-b.silra%40db.com:mypassword@sp-surf-proxy.intranet.db.com:8080',
            proxyUser: 'nitin-b.silra@db.com',
            proxyPass: 'mypassword',
            ignoreSsl: true,
          })
        );
      });
    });

    it('allows configuring and saving HTTP proxy in Settings modal', async () => {
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

      render(<CopilotPanel {...defaultProps} />);

      // Open settings
      const settingsBtn = screen.getByTitle('AI Settings & API Keys');
      fireEvent.click(settingsBtn);

      // Check "Customize HTTP proxy"
      const customizeCheckbox = screen.getByLabelText(/Customize HTTP proxy/i);
      fireEvent.click(customizeCheckbox);

      // Fill in host and port
      const hostInput = screen.getByPlaceholderText('sp-surf-proxy.intranet.db.com');
      fireEvent.change(hostInput, { target: { value: 'sp-surf-proxy.intranet.db.com' } });

      const portInput = screen.getByPlaceholderText('8080');
      fireEvent.change(portInput, { target: { value: '8080' } });

      // Check "Proxy authentication"
      const authCheckbox = screen.getByLabelText(/Proxy authentication/i);
      fireEvent.click(authCheckbox);

      const loginInput = screen.getByPlaceholderText('nitin-b.silra@db.com');
      fireEvent.change(loginInput, { target: { value: 'nitin-b.silra@db.com' } });

      const passwordInput = screen.getByPlaceholderText('••••••••••••••••');
      fireEvent.change(passwordInput, { target: { value: 'secretpass' } });

      // Check "Accept corporate / self-signed TLS certificates"
      const sslCheckbox = screen.getByLabelText(/Accept corporate \/ self-signed TLS certificates/i);
      fireEvent.click(sslCheckbox);

      // Save Settings
      const saveBtn = screen.getByText('Save Settings');
      fireEvent.click(saveBtn);

      // Verify localStorage was updated with corporate proxy configuration
      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('safar_copilot_auth') || '{}');
        expect(saved.useProxy).toBe(true);
        expect(saved.proxyHost).toBe('sp-surf-proxy.intranet.db.com');
        expect(saved.proxyPort).toBe('8080');
        expect(saved.proxyAuthEnabled).toBe(true);
        expect(saved.proxyLogin).toBe('nitin-b.silra@db.com');
        expect(saved.ignoreSslErrors).toBe(true);
        expect(saved.proxyUrl).toBe('http://nitin-b.silra%40db.com:secretpass@sp-surf-proxy.intranet.db.com:8080');
      });
    });
  });
});

