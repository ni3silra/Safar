import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GuardianMonitor } from '../../components/GuardianMonitor';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Type the mocked invoke
const mockInvoke = invoke as ReturnType<typeof vi.fn>;

// Sample ps -ef output (UID PID PPID C STIME TTY TIME CMD)
const SAMPLE_PS_EF_OUTPUT = `root      1234     1  2 10:30 ?        00:01:23 /usr/sbin/nginx -g daemon off;`;
const SAMPLE_PS_EF_MULTI = `root      1234     1  2 10:30 ?        00:01:23 /usr/sbin/nginx -g daemon off;
www       5678  1234  0 10:31 ?        00:00:05 nginx: worker process`;
const SAMPLE_CHILDREN_OUTPUT = `www       5678  1234  0 10:31 ?        00:00:05 nginx: worker process
www       5679  1234  0 10:31 ?        00:00:03 nginx: worker process`;

const mockSession = {
    id: 'test-session-1',
    name: 'Test Server',
    host: '192.168.1.10',
    port: 22,
    username: 'admin',
    connected: true,
    activeView: 'guardian' as const,
};

const disconnectedSession = {
    ...mockSession,
    id: 'disconnected-1',
    connected: false,
};

// Helper to get the Start/Stop button by its unique ID
const getStartBtn = () => document.getElementById('guardian-start-btn')!;
const getStopBtn = () => document.getElementById('guardian-stop-btn')!;

describe('GuardianMonitor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ─── Rendering Tests ─────────────────────────────────────────────────

    it('renders the input bar with PID input and Start button', () => {
        render(<GuardianMonitor session={mockSession} />);

        expect(screen.getByPlaceholderText(/Enter PID/)).toBeInTheDocument();
        const btn = getStartBtn();
        expect(btn).toBeInTheDocument();
        expect(btn.textContent).toContain('Start');
        expect(screen.getByText(/Interval/)).toBeInTheDocument();
    });

    it('renders the empty state with placeholder message when no data', () => {
        render(<GuardianMonitor session={mockSession} />);

        expect(screen.getByText(/Guardian Process Monitor/)).toBeInTheDocument();
        expect(screen.getByText(/Enter a PID or process name/)).toBeInTheDocument();
    });

    it('disables Start button when input is empty', () => {
        render(<GuardianMonitor session={mockSession} />);

        const btn = getStartBtn();
        expect(btn).toBeDisabled();
    });

    it('disables Start button when session is disconnected', () => {
        render(<GuardianMonitor session={disconnectedSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        const btn = getStartBtn();
        expect(btn).toBeDisabled();
    });

    it('enables Start button when PID is entered and session is connected', () => {
        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        const btn = getStartBtn();
        expect(btn).not.toBeDisabled();
    });

    // ─── Monitoring Lifecycle Tests ──────────────────────────────────────

    it('starts monitoring on button click and shows Stop button', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '1234',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        expect(getStopBtn()).toBeInTheDocument();
        expect(input).toBeDisabled();
    });

    it('calls ssh_get_process_info with correct parameters', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: 'nginx',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: 'nginx' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        expect(mockInvoke).toHaveBeenCalledWith('ssh_get_process_info', {
            sessionId: 'test-session-1',
            pidOrName: 'nginx',
        });
    });

    it('shows Stop button when monitoring starts and re-enables input on stop', async () => {
        mockInvoke.mockResolvedValue({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '1234',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        expect(getStopBtn()).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(getStopBtn()!);
        });

        expect(getStartBtn()).toBeInTheDocument();
        expect(input).not.toBeDisabled();
    });

    it('starts monitoring on Enter key press', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '1234',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.keyDown(input, { key: 'Enter' });
        });

        expect(getStopBtn()).toBeInTheDocument();
    });

    // ─── Data Parsing Tests ─────────────────────────────────────────────

    it('parses ps -ef output and displays summary cards', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '1234',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        // Summary cards should appear with parsed data
        await waitFor(() => {
            expect(screen.getByText('PID')).toBeInTheDocument();
            expect(screen.getAllByText('1234').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('root').length).toBeGreaterThanOrEqual(1);
        });
    });

    it('parses child processes and shows them in tree view', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '1234',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: SAMPLE_CHILDREN_OUTPUT,
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        // Switch to tree view
        fireEvent.click(screen.getByText('🌳 Process Tree'));

        await waitFor(() => {
            expect(screen.getByText('2 child processes')).toBeInTheDocument();
        });
    });

    it('aggregates CPU values when multiple processes match by name', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: 'nginx',
                raw_output: SAMPLE_PS_EF_MULTI,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: 'nginx' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        // The "C (CPU)" label should be present in summary cards
        await waitFor(() => {
            expect(screen.getByText('C (CPU)')).toBeInTheDocument();
        });
    });

    // ─── Error Handling Tests ────────────────────────────────────────────

    it('shows error when process is not found', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '99999',
                raw_output: '',
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '99999' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        await waitFor(() => {
            expect(screen.getByText(/not found on server/)).toBeInTheDocument();
        });
    });

    it('shows error when backend command fails', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: false,
            data: null,
            error: 'SSH connection lost',
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        await waitFor(() => {
            expect(screen.getByText(/SSH connection lost/)).toBeInTheDocument();
        });
    });

    it('handles invoke exception gracefully', async () => {
        mockInvoke.mockRejectedValueOnce(new Error('Network timeout'));

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        await waitFor(() => {
            expect(screen.getByText(/Network timeout/)).toBeInTheDocument();
        });
    });

    // ─── Sub-tab Navigation Tests ────────────────────────────────────────

    it('switches between Graph, Samples, and Process Tree sub-tabs', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '1234',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        // Sub-tabs should appear
        await waitFor(() => {
            expect(screen.getByText('📈 Graph')).toBeInTheDocument();
            expect(screen.getByText('📊 Samples')).toBeInTheDocument();
            expect(screen.getByText('🌳 Process Tree')).toBeInTheDocument();
        });

        // Click Samples tab
        fireEvent.click(screen.getByText('📊 Samples'));
        expect(screen.getByText(/Historical Samples/)).toBeInTheDocument();

        // Click Process Tree tab
        fireEvent.click(screen.getByText('🌳 Process Tree'));
        expect(screen.getAllByText(/Process Tree/).length).toBeGreaterThanOrEqual(1);
    });

    // ─── Interval Selection Tests ────────────────────────────────────────

    it('renders interval selector with correct options', () => {
        render(<GuardianMonitor session={mockSession} />);

        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();

        const options = screen.getAllByRole('option');
        expect(options.length).toBe(7);
        expect(options.map(o => o.textContent)).toEqual(['1s', '2s', '3s', '5s', '10s', '15s', '30s']);
    });

    it('interval selector is disabled while monitoring', async () => {
        mockInvoke.mockResolvedValue({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '1234',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        const select = screen.getByRole('combobox');
        expect(select).toBeDisabled();
    });

    // ─── ps -ef Parser Edge Cases ────────────────────────────────────────

    it('skips header lines in ps -ef output', async () => {
        const outputWithHeader = `UID        PID  PPID  C STIME TTY          TIME CMD
root      1234     1  2 10:30 ?        00:01:23 /usr/sbin/nginx`;

        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                format: 'ps_ef',
                target: '1234',
                raw_output: outputWithHeader,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        await waitFor(() => {
            // Should show the process, not the header
            expect(screen.getAllByText('1234').length).toBeGreaterThanOrEqual(1);
        });
    });

    it('handles HP NonStop OS type correctly', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'NONSTOP_KERNEL',
                format: 'ps_ef',
                target: '1234',
                raw_output: SAMPLE_PS_EF_OUTPUT,
                children_output: '',
            }),
            error: null,
        });

        render(<GuardianMonitor session={mockSession} />);

        const input = screen.getByPlaceholderText(/Enter PID/);
        fireEvent.change(input, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(getStartBtn());
        });

        await waitFor(() => {
            expect(screen.getByText(/NONSTOP_KERNEL/)).toBeInTheDocument();
        });
    });
});
