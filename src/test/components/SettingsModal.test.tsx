import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../../components/SettingsModal';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS } from '../../components/SettingsTypes';

describe('SettingsModal', () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();
    const defaultProps = {
        onClose: mockOnClose,
        currentSettings: DEFAULT_SETTINGS,
        onSave: mockOnSave
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders with default settings', () => {
        render(<SettingsModal {...defaultProps} />);
        
        expect(screen.getByText('Settings')).toBeInTheDocument();
        expect(screen.getByText('General')).toBeInTheDocument();
        
        // Find radio button by traversing from label text
        const darkThemeLabel = screen.getByText(/Dark Mode/);
        const radio = darkThemeLabel.closest('.settings-radio-label')?.querySelector('input[type="radio"]')!;
        expect(radio).toBeChecked();
    });

    it('switches tabs', () => {
        render(<SettingsModal {...defaultProps} />);
        
        expect(screen.getByText(/General Settings/)).toBeInTheDocument();
        
        fireEvent.click(screen.getByText(/Appearance/));
        expect(screen.getByText(/Editor & Font/)).toBeInTheDocument();
        
        fireEvent.click(screen.getByText(/Terminal/));
        expect(screen.getByText(/Cursor Style/)).toBeInTheDocument();
    });

    it('updates a setting and calls onSave when Done is clicked', () => {
        render(<SettingsModal {...defaultProps} />);
        
        // Find by text since label might be complex structure
        const confirmLabel = screen.getByText(/Confirm on Close/);
        const confirmToggle = confirmLabel.closest('.settings-row')?.querySelector('input[type="checkbox"]')!;
        fireEvent.click(confirmToggle); // Toggle it

        fireEvent.click(screen.getByText('Done'));
        
        expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
            confirmOnClose: !DEFAULT_SETTINGS.confirmOnClose
        }));
        expect(mockOnClose).toHaveBeenCalled();
    });

    it('toggles custom colors in Appearance tab', () => {
        render(<SettingsModal {...defaultProps} />);
        
        fireEvent.click(screen.getByText(/Appearance/));
        const colorLabel = screen.getByText(/Use Custom Colors/);
        const toggle = colorLabel.closest('.settings-row')?.querySelector('input[type="checkbox"]')!;
        fireEvent.click(toggle);
        
        expect(screen.getByText(/Background Color/)).toBeInTheDocument();
    });
});
