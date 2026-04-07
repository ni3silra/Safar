import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../../components/Sidebar';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Sidebar', () => {
  const mockProps = {
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    sidebarView: 'sessions' as const,
    setSidebarView: vi.fn(),
    activeSessions: [
        { id: '1', name: 'Active Sess', host: 'h1', port: 22, username: 'u1', connected: true, activeView: 'terminal' as const }
    ],
    activeSessionId: '1',
    setActiveSessionId: vi.fn(),
    sessions: [
        { id: '2', name: 'Saved Sess', host: 'h2', port: 22, username: 'u2', is_favorite: false, auth_type: 'password' as const }
    ],
    favorites: [
        { id: '3', name: 'Fav Sess', host: 'h3', port: 22, username: 'u3', is_favorite: true, auth_type: 'password' as const }
    ],
    recent: [],
    onConnect: vi.fn(),
    onEditSession: vi.fn(),
    onDeleteSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all session sections correctly', () => {
    render(<Sidebar {...mockProps} />);
    
    expect(screen.getByText(/Active \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Active Sess')).toBeInTheDocument();
    expect(screen.getByText('Fav Sess')).toBeInTheDocument();
    expect(screen.getByText('Saved Sess')).toBeInTheDocument();
  });

  it('calls setActiveSessionId when an active session is clicked', () => {
    render(<Sidebar {...mockProps} />);
    
    const activeItem = screen.getByText('Active Sess');
    fireEvent.click(activeItem);
    
    expect(mockProps.setActiveSessionId).toHaveBeenCalledWith('1');
  });

  it('calls onConnect when a saved session is clicked', () => {
    render(<Sidebar {...mockProps} />);
    
    const savedItem = screen.getByText('Saved Sess');
    fireEvent.click(savedItem);
    
    expect(mockProps.onConnect).toHaveBeenCalledWith(expect.objectContaining({
        host: 'h2',
        username: 'u2'
    }));
  });

  it('switches views when header buttons are clicked', () => {
    render(<Sidebar {...mockProps} />);
    
    const snippetsBtn = screen.getByTitle('Command Snippets');
    fireEvent.click(snippetsBtn);
    
    expect(mockProps.setSidebarView).toHaveBeenCalledWith('snippets');
  });

  it('calls setSidebarCollapsed when collapse button is clicked', () => {
    render(<Sidebar {...mockProps} />);
    
    // Find collapse button (it has Icons.ChevronDown rotated)
    const collapseBtn = screen.getAllByRole('button').find(b => b.classList.contains('icon-btn'));
    if (collapseBtn) fireEvent.click(collapseBtn);
    
    expect(mockProps.setSidebarCollapsed).toHaveBeenCalled();
  });
});
