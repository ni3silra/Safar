import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileEditor } from '../../components/FileEditor';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

describe('FileEditor', () => {
    const sessionId = 'sess-123';
    const filePath = '/home/user/test.txt';
    const mockOnClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads and displays file content', async () => {
        (invoke as any).mockResolvedValue({ success: true, data: 'file content hello', error: null });

        render(<FileEditor sessionId={sessionId} filePath={filePath} onClose={mockOnClose} />);

        expect(screen.getByText(/Loading content/)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.queryByText(/Loading content/)).not.toBeInTheDocument();
        });

        expect(screen.getByText(filePath)).toBeInTheDocument();
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    it('calls save when save button is clicked', async () => {
        (invoke as any).mockResolvedValue({ success: true, data: 'initial', error: null });

        render(<FileEditor sessionId={sessionId} filePath={filePath} onClose={mockOnClose} />);
        
        // Wait for loading to finish AND editor to mount
        await waitFor(() => {
            expect(screen.queryByText(/Loading content/)).not.toBeInTheDocument();
            expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
        });

        // Add a small delay to ensure useEffect for onMount in setup.tsx has run
        // This is safe because vitest/testing-library will handle the wait
        await new Promise(r => setTimeout(r, 50));

        // Clear the load call history
        (invoke as any).mockClear();
        (invoke as any).mockResolvedValue({ success: true, data: null, error: null });

        // Use data-testid for reliable finding
        const saveBtn = screen.getByTestId('save-button');
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('ssh_sftp_write_text', expect.objectContaining({
                sessionId,
                remotePath: filePath,
                content: 'mocked editor value'
            }));
        }, { timeout: 2000 });
    });

    it('shows error if load fails', async () => {
        (invoke as any).mockResolvedValue({ success: false, data: null, error: 'Permission denied' });

        render(<FileEditor sessionId={sessionId} filePath={filePath} onClose={mockOnClose} />);

        await waitFor(() => {
            expect(screen.getByText(/Permission denied/)).toBeInTheDocument();
        });
    });

    it('respects readOnly prop', async () => {
        (invoke as any).mockResolvedValue({ success: true, data: 'content', error: null });

        render(<FileEditor sessionId={sessionId} filePath={filePath} onClose={mockOnClose} readOnly={true} />);
        await waitFor(() => !screen.queryByText(/Loading content/));

        expect(screen.getByText('Read Only')).toBeInTheDocument();
        expect(screen.queryByTestId('save-button')).not.toBeInTheDocument();
    });
});
