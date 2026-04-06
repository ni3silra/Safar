import { render, screen, fireEvent } from '@testing-library/react';
import { FileBrowser } from '../../components/FileBrowser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as useFileBrowserHook from '../../hooks/useFileBrowser';

vi.mock('../../hooks/useFileBrowser');

describe('FileBrowser', () => {
    const sessionId = 'test-session';
    const mockHookReturn = {
        currentPath: '/home/user',
        tempPath: '/home/user',
        setTempPath: vi.fn(),
        files: [
            { name: 'folder1', is_dir: true, size: 0, modified: 100, permissions: '755' },
            { name: 'file1.txt', is_dir: false, size: 1024, modified: 200, permissions: '644' },
        ],
        loading: false,
        error: null,
        editingFile: null,
        setEditingFile: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
        sortField: 'name',
        sortDirection: 'asc',
        displayedFiles: [
            { name: 'folder1', is_dir: true, size: 0, modified: 100, permissions: '755' },
            { name: 'file1.txt', is_dir: false, size: 1024, modified: 200, permissions: '644' },
        ],
        canGoBack: true,
        canGoForward: false,
        goBack: vi.fn(),
        goForward: vi.fn(),
        goHome: vi.fn(),
        handleSort: vi.fn(),
        loadFiles: vi.fn(),
        handleNavigate: vi.fn(),
        handleUp: vi.fn(),
        handleDownload: vi.fn(),
        handleUpload: vi.fn(),
        visitedPaths: [],
        removeVisitedPath: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useFileBrowserHook.useFileBrowser as any).mockReturnValue(mockHookReturn);
    });

    it('renders files and path correctly', () => {
        render(<FileBrowser sessionId={sessionId} />);

        expect(screen.getByDisplayValue('/home/user')).toBeInTheDocument();
        expect(screen.getByText('folder1')).toBeInTheDocument();
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });

    it('calls handleNavigate on row double click', () => {
        render(<FileBrowser sessionId={sessionId} />);

        const folderRow = screen.getByText('folder1').closest('tr')!;
        fireEvent.doubleClick(folderRow);

        expect(mockHookReturn.handleNavigate).toHaveBeenCalledWith(mockHookReturn.files[0]);
    });

    it('calls setSearchQuery when filter input changes', () => {
        render(<FileBrowser sessionId={sessionId} />);

        const filterInput = screen.getByPlaceholderText(/Filter/);
        fireEvent.change(filterInput, { target: { value: 'test' } });

        expect(mockHookReturn.setSearchQuery).toHaveBeenCalledWith('test');
    });

    it('shows loading state', () => {
        (useFileBrowserHook.useFileBrowser as any).mockReturnValue({
            ...mockHookReturn,
            loading: true
        });

        render(<FileBrowser sessionId={sessionId} />);
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('shows error state', () => {
        (useFileBrowserHook.useFileBrowser as any).mockReturnValue({
            ...mockHookReturn,
            error: 'Failed to connect'
        });

        render(<FileBrowser sessionId={sessionId} />);
        expect(screen.getByText('Error: Failed to connect')).toBeInTheDocument();
    });
});
