import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeScreen } from '../components/WelcomeScreen';
import { describe, it, expect, vi } from 'vitest';

describe('WelcomeScreen', () => {
  it('renders correctly with title and tagline', () => {
    render(<WelcomeScreen onNewConnection={() => {}} />);
    
    expect(screen.getByText('Safar')).toBeInTheDocument();
    expect(screen.getByText('Every Connection is a Journey')).toBeInTheDocument();
    expect(screen.getByText('New Connection')).toBeInTheDocument();
  });

  it('calls onNewConnection when button is clicked', () => {
    const onNewConnection = vi.fn();
    render(<WelcomeScreen onNewConnection={onNewConnection} />);
    
    fireEvent.click(screen.getByRole('button', { name: /New Connection/i }));
    expect(onNewConnection).toHaveBeenCalledTimes(1);
  });

  it('displays feature cards', () => {
    render(<WelcomeScreen onNewConnection={() => {}} />);
    
    expect(screen.getByText('SSH Terminal')).toBeInTheDocument();
    expect(screen.getByText('File Transfer')).toBeInTheDocument();
    expect(screen.getByText('Secure')).toBeInTheDocument();
  });
});
