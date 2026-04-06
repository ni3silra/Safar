import { render, screen, fireEvent } from '@testing-library/react';
import { QuickConnectModal } from '../../components/QuickConnectModal';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('QuickConnectModal', () => {
    const mockOnClose = vi.fn();
    const mockOnConnect = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders with basic fields', () => {
        render(<QuickConnectModal onClose={mockOnClose} onConnect={mockOnConnect} />);

        expect(screen.getByPlaceholderText(/192\.168\.1\.100/)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('root')).toBeInTheDocument();
        expect(screen.getByText('Connect')).toBeInTheDocument();
    });

    it('calls onConnect when form is submitted with valid data', async () => {
        render(<QuickConnectModal onClose={mockOnClose} onConnect={mockOnConnect} />);

        const hostInput = screen.getByPlaceholderText(/192\.168\.1\.100/);
        const userInput = screen.getByPlaceholderText('root');

        fireEvent.change(hostInput, { target: { value: 'test.host' } });
        fireEvent.change(userInput, { target: { value: 'testuser' } });

        const connectBtn = screen.getByText('Connect');
        fireEvent.click(connectBtn);

        expect(mockOnConnect).toHaveBeenCalledWith(expect.objectContaining({
            host: 'test.host',
            username: 'testuser',
            port: 22
        }), expect.any(Boolean), expect.any(Boolean));
    });

    it('switches tabs and shows advanced options', () => {
        render(<QuickConnectModal onClose={mockOnClose} onConnect={mockOnConnect} />);

        const advancedTab = screen.getByText('Advanced');
        fireEvent.click(advancedTab);

        expect(screen.getByText('Terminal Type')).toBeInTheDocument();
        expect(screen.getByText('Remote Command (optional)')).toBeInTheDocument();
    });

    it('switches to security tab and enables key file mode', () => {
        render(<QuickConnectModal onClose={mockOnClose} onConnect={mockOnConnect} />);

        const securityTab = screen.getByText('Security');
        fireEvent.click(securityTab);

        const keyFileBtn = screen.getByText('Key File');
        fireEvent.click(keyFileBtn);

        expect(screen.getByText(/Click to select a key file/)).toBeInTheDocument();
    });
});
