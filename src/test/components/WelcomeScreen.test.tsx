import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeScreen } from '../../components/WelcomeScreen';
import { describe, it, expect, vi } from 'vitest';

describe('WelcomeScreen', () => {
    const onNewConnection = vi.fn();

    it('renders correctly', () => {
        render(<WelcomeScreen onNewConnection={onNewConnection} />);
        
        expect(screen.getByText('Safar')).toBeInTheDocument();
        expect(screen.getByText('New Connection')).toBeInTheDocument();
    });

    it('calls onNewConnection when button is clicked', () => {
        render(<WelcomeScreen onNewConnection={onNewConnection} />);
        
        const connectBtn = screen.getByText('New Connection');
        fireEvent.click(connectBtn);
        
        expect(onNewConnection).toHaveBeenCalled();
    });

    it('displays feature cards', () => {
        render(<WelcomeScreen onNewConnection={onNewConnection} />);
        
        expect(screen.getByText('SSH Terminal')).toBeInTheDocument();
        expect(screen.getByText('File Transfer')).toBeInTheDocument();
        expect(screen.getByText('Secure')).toBeInTheDocument();
    });
});
