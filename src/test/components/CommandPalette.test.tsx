import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette } from '../../components/CommandPalette';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

describe('CommandPalette', () => {
    const sessionId = 'session-123';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads and displays snippets', async () => {
        const mockSnippets = [
            { id: '1', name: 'List Files', command: 'ls -la', newline_type: 'lf' }
        ];
        (invoke as any).mockResolvedValue({ success: true, data: mockSnippets, error: null });

        render(<CommandPalette sessionId={sessionId} />);

        await waitFor(() => {
            expect(screen.getByText('List Files')).toBeInTheDocument();
            expect(screen.getByText('ls -la')).toBeInTheDocument();
        });
    });

    it('sends command to terminal when snippet is clicked', async () => {
        const mockSnippets = [
            { id: '1', name: 'Run Script', command: './script.sh', newline_type: 'lf' }
        ];
        (invoke as any).mockResolvedValue({ success: true, data: mockSnippets, error: null });

        render(<CommandPalette sessionId={sessionId} />);
        await waitFor(() => screen.getByText('Run Script'));

        const snippetItem = screen.getByText('Run Script');
        fireEvent.click(snippetItem);

        expect(invoke).toHaveBeenCalledWith('ssh_send', { 
            sessionId, 
            data: './script.sh\n' 
        });
    });

    it('shows add form when + button is clicked', () => {
        render(<CommandPalette sessionId={sessionId} />);
        
        const addBtn = screen.getByText('+');
        fireEvent.click(addBtn);
        
        expect(screen.getByPlaceholderText(/Name/)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Command/)).toBeInTheDocument();
    });

    it('saves a new snippet', async () => {
        (invoke as any).mockResolvedValue({ success: true, data: [], error: null });

        render(<CommandPalette sessionId={sessionId} />);
        
        fireEvent.click(screen.getByText('+'));
        
        fireEvent.change(screen.getByPlaceholderText(/Name/), { target: { value: 'New Snippet' } });
        fireEvent.change(screen.getByPlaceholderText(/Command/), { target: { value: 'whoami' } });
        
        (invoke as any).mockResolvedValueOnce({ success: true, data: { id: '2', name: 'New Snippet', command: 'whoami' } });
        
        fireEvent.click(screen.getByText('Save Snippet'));
        
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('snippets_save', expect.objectContaining({
                snippet: expect.objectContaining({ name: 'New Snippet', command: 'whoami' })
            }));
        });
    });
});
