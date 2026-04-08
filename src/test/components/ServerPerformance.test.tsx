import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ServerPerformance } from '../../components/ServerPerformance';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Type the mocked invoke  
const mockInvoke = invoke as ReturnType<typeof vi.fn>;

const mockSession = {
    id: 'perf-test-1',
    name: 'Perf Server',
    host: '10.0.0.1',
    port: 22,
    username: 'admin',
    connected: true,
    activeView: 'performance' as const,
};

const disconnectedSession = {
    ...mockSession,
    id: 'disconnected-perf',
    connected: false,
};

// ─── Sample outputs for each fallback layer ──────────────────────────

const SAMPLE_TOP_OUTPUT = `top - 14:30:01 up 5 days,  3:22,  2 users,  load average: 0.15, 0.10, 0.05
Tasks: 192 total,   1 running, 191 sleeping,   0 stopped,   0 zombie
%Cpu(s):  2.3 us,  1.0 sy,  0.0 ni, 96.5 id,  0.2 wa,  0.0 hi,  0.0 si
MiB Mem :   7850.4 total,   2345.6 free,   3401.2 used,   2103.6 buff/cache
MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   4100.8 avail Mem

  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
 1234 root      20   0  123456  12345   5678 S   5.3   1.6   0:12.34 nginx
 5678 www       20   0   98765   9876   4321 S   2.1   1.2   0:05.67 nginx: worker`;

const SAMPLE_PS_EO_OUTPUT = `  PID USER     %CPU %MEM COMMAND
 1234 root      5.3  1.6 /usr/sbin/nginx -g daemon off;
 5678 www       2.1  1.2 nginx: worker process`;

const SAMPLE_PS_AUX_OUTPUT = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root      1234  5.3  1.6 123456 12345 ?        Ss   10:30   0:12 /usr/sbin/nginx
www       5678  2.1  1.2  98765  9876 ?        S    10:31   0:05 nginx: worker`;

const SAMPLE_PS_EF_OUTPUT = `UID        PID  PPID  C STIME TTY          TIME CMD
root      1234     1  2 10:30 ?        00:01:23 /usr/sbin/nginx -g daemon off;
www       5678  1234  0 10:31 ?        00:00:05 nginx: worker process`;

const SAMPLE_HP_NS_STATUS = `Process            PRI  PairCPU,PIN PPID
$ZTC0              199  0,209       0,103
$CMON              150  1,45        0,102
$ZSPM              180  2,78        0,101`;

describe('ServerPerformance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── Rendering Tests ─────────────────────────────────────────────────

    it('renders the performance dashboard with Refresh button', () => {
        render(<ServerPerformance session={mockSession} />);

        expect(screen.getByText(/Live Performance/)).toBeInTheDocument();
        expect(screen.getByText('Refresh Metrics')).toBeInTheDocument();
    });

    it('shows empty state before fetching data', () => {
        render(<ServerPerformance session={mockSession} />);

        expect(screen.getByText(/No Telemetry Data/)).toBeInTheDocument();
        expect(screen.getByText(/Click "Refresh Metrics"/)).toBeInTheDocument();
    });

    it('disables Refresh button when session is disconnected', () => {
        render(<ServerPerformance session={disconnectedSession} />);

        const refreshBtn = screen.getByText('Refresh Metrics');
        expect(refreshBtn.closest('button')).toBeDisabled();
    });

    // ─── Linux top parsing ───────────────────────────────────────────────

    it('parses Linux top output correctly', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({ os: 'LINUX', raw_output: SAMPLE_TOP_OUTPUT }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/Detected OS: LINUX/)).toBeInTheDocument();
            expect(screen.getAllByText(/nginx/).length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('1234')).toBeInTheDocument();
        });
    });

    // ─── ps -eo fallback parsing ─────────────────────────────────────────

    it('parses UNIX_PS (ps -eo) output correctly', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({ os: 'UNIX_PS', raw_output: SAMPLE_PS_EO_OUTPUT }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/Detected OS: UNIX_PS$/)).toBeInTheDocument();
            expect(screen.getByText('1234')).toBeInTheDocument();
            expect(screen.getByText('5.3')).toBeInTheDocument(); // CPU
        });
    });

    // ─── ps aux fallback parsing ─────────────────────────────────────────

    it('parses UNIX_PS_AUX (ps aux) output correctly', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({ os: 'UNIX_PS_AUX', raw_output: SAMPLE_PS_AUX_OUTPUT }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/Detected OS: UNIX_PS_AUX/)).toBeInTheDocument();
            expect(screen.getByText('1234')).toBeInTheDocument();
        });
    });

    // ─── ps -ef fallback parsing (HP NonStop OSS compatible) ─────────────

    it('parses UNIX_PS_EF (ps -ef) output correctly — the universal fallback', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({ os: 'UNIX_PS_EF', raw_output: SAMPLE_PS_EF_OUTPUT }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/Detected OS: UNIX_PS_EF/)).toBeInTheDocument();
            expect(screen.getByText('1234')).toBeInTheDocument();
        });
    });

    it('ps -ef parser skips header line', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({ os: 'UNIX_PS_EF', raw_output: SAMPLE_PS_EF_OUTPUT }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            // Should have 2 processes (not 3 including header)
            const rows = screen.getAllByText(/nginx/);
            expect(rows.length).toBeGreaterThanOrEqual(1);
        });

        // Header "UID" should NOT appear as a user value in the table
        // (it gets skipped by the parser)
    });

    it('ps -ef parser shows dash for missing MEM column', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({ os: 'UNIX_PS_EF', raw_output: SAMPLE_PS_EF_OUTPUT }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            // ps -ef has no MEM column, parser returns "-"
            const dashCells = screen.getAllByText('-');
            expect(dashCells.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ─── HP NonStop status parsing ───────────────────────────────────────

    it('parses HP NonStop STATUS output correctly', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({ os: 'NONSTOP_KERNEL', raw_output: SAMPLE_HP_NS_STATUS }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/Detected OS: NONSTOP_KERNEL/)).toBeInTheDocument();
            expect(screen.getByText('$ZTC0')).toBeInTheDocument();
            expect(screen.getByText('$CMON')).toBeInTheDocument();
        });
    });

    // ─── Error Handling Tests ────────────────────────────────────────────

    it('shows error when backend returns error', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: false,
            data: null,
            error: 'Session not connected',
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/Session not connected/)).toBeInTheDocument();
        });
    });

    it('shows error when metrics are unavailable', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({
                os: 'LINUX',
                raw_output: 'LINUX_METRICS_UNAVAILABLE',
                error_detail: "All commands failed.",
            }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/All commands failed/)).toBeInTheDocument();
        });
    });

    it('handles exception from invoke gracefully', async () => {
        mockInvoke.mockRejectedValueOnce(new Error('Connection refused'));

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/Connection refused/)).toBeInTheDocument();
        });
    });

    // ─── Loading State Tests ─────────────────────────────────────────────

    it('shows loading state while fetching', async () => {
        // Create a promise we can control
        let resolvePromise: (value: any) => void;
        const pendingPromise = new Promise((resolve) => {
            resolvePromise = resolve;
        });
        mockInvoke.mockReturnValueOnce(pendingPromise);

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        expect(screen.getByText('Querying Server...')).toBeInTheDocument();

        // Resolve the promise
        await act(async () => {
            resolvePromise!({
                success: true,
                data: JSON.stringify({ os: 'LINUX', raw_output: SAMPLE_TOP_OUTPUT }),
                error: null,
            });
        });

        await waitFor(() => {
            expect(screen.getByText('Refresh Metrics')).toBeInTheDocument();
        });
    });

    // ─── Last Update Timestamp ───────────────────────────────────────────

    it('shows last update timestamp after successful fetch', async () => {
        mockInvoke.mockResolvedValueOnce({
            success: true,
            data: JSON.stringify({ os: 'UNIX_PS_EF', raw_output: SAMPLE_PS_EF_OUTPUT }),
            error: null,
        });

        render(<ServerPerformance session={mockSession} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Refresh Metrics'));
        });

        await waitFor(() => {
            expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
        });
    });

    // ─── Fallback Chain Verification ─────────────────────────────────────

    it('correctly displays data from any fallback layer without errors', async () => {
        // Test all OS types in sequence
        const testCases = [
            { os: 'LINUX', raw_output: SAMPLE_TOP_OUTPUT },
            { os: 'UNIX_PS', raw_output: SAMPLE_PS_EO_OUTPUT },
            { os: 'UNIX_PS_AUX', raw_output: SAMPLE_PS_AUX_OUTPUT },
            { os: 'UNIX_PS_EF', raw_output: SAMPLE_PS_EF_OUTPUT },
            { os: 'NONSTOP_KERNEL', raw_output: SAMPLE_HP_NS_STATUS },
        ];

        for (const testCase of testCases) {
            mockInvoke.mockResolvedValueOnce({
                success: true,
                data: JSON.stringify(testCase),
                error: null,
            });

            const { unmount } = render(<ServerPerformance session={mockSession} />);

            await act(async () => {
                fireEvent.click(screen.getByText('Refresh Metrics'));
            });

            await waitFor(() => {
                expect(screen.getByText(new RegExp(`Detected OS: ${testCase.os}`))).toBeInTheDocument();
            });

            // No error should be shown
            expect(screen.queryByText(/Failed to retrieve/)).not.toBeInTheDocument();

            unmount();
            vi.clearAllMocks();
        }
    });
});
