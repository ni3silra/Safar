import { render, screen, fireEvent } from '@testing-library/react';
import { CredentialsModal } from '../../components/CredentialsModal';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('CredentialsModal', () => {
    const mockOnClose = vi.fn();
    const mockOnSubmit = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders correctly', () => {
        render(<CredentialsModal onClose={mockOnClose} onSubmit={mockOnSubmit} username="user" host="1.1.1.1" />);

        expect(screen.getByText('user@1.1.1.1')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter your password…')).toBeInTheDocument();
        expect(screen.getByText('Connect')).toBeInTheDocument();
    });

    it('submits password correctly', async () => {
        render(<CredentialsModal onClose={mockOnClose} onSubmit={mockOnSubmit} username="user" host="1.1.1.1" />);

        const passwordInput = screen.getByPlaceholderText('Enter your password…');
        fireEvent.change(passwordInput, { target: { value: 'mypassword' } });

        const connectBtn = screen.getByText('Connect');
        fireEvent.click(connectBtn);

        expect(mockOnSubmit).toHaveBeenCalledWith('mypassword', null);
    });

    it('shows auth failed banner if authFailed is true', () => {
        render(<CredentialsModal onClose={mockOnClose} onSubmit={mockOnSubmit} username="user" host="1.1.1.1" authFailed={true} />);

        expect(screen.getByText(/Incorrect credentials/i)).toBeInTheDocument();
    });

    it('switches to key mode', () => {
        render(<CredentialsModal onClose={mockOnClose} onSubmit={mockOnSubmit} username="user" host="1.1.1.1" />);

        const keyTab = screen.getByText('Private Key');
        fireEvent.click(keyTab);

        expect(screen.getByText(/Click to select a key file/i)).toBeInTheDocument();
    });
});
