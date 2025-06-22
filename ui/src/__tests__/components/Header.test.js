import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Header from '../../components/Header';

describe('Header', () => {
    const mockProps = {
        showPreviewButton: true,
        togglePreview: jest.fn(),
        previewVisible: false,
        pingServer: jest.fn(),
        user: { email: 'test@example.com' },
        handleLogout: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should render the header title', () => {
        render(<Header {...mockProps} />, { wrapper: MemoryRouter });
        expect(screen.getByText('🤖 Browser Assist')).toBeInTheDocument();
    });

    test('should toggle preview button text based on previewVisible prop', () => {
        // Test when preview is hidden
        const { rerender } = render(<Header {...mockProps} previewVisible={false} />, { wrapper: MemoryRouter });
        expect(screen.getByText('Show Preview')).toBeInTheDocument();

        // Test when preview is visible
        rerender(<Header {...mockProps} previewVisible={true} />);
        expect(screen.getByText('Hide Preview')).toBeInTheDocument();
    });

    test('should call togglePreview when preview button is clicked', () => {
        render(<Header {...mockProps} />, { wrapper: MemoryRouter });
        const toggleButton = screen.getByText('Show Preview');
        fireEvent.click(toggleButton);
        expect(mockProps.togglePreview).toHaveBeenCalledTimes(1);
    });

    test('should display user avatar with first letter of email', () => {
        render(<Header {...mockProps} />, { wrapper: MemoryRouter });
        const avatar = screen.getByText('T');
        expect(avatar).toBeInTheDocument();
    });

    test('should display "U" in avatar when no user email is provided', () => {
        render(<Header {...mockProps} user={{}} />, { wrapper: MemoryRouter });
        const avatar = screen.getByText('U');
        expect(avatar).toBeInTheDocument();
    });

    test('should call handleLogout when logout button is clicked', () => {
        render(<Header {...mockProps} />, { wrapper: MemoryRouter });
        const logoutButton = screen.getByText('Logout');
        fireEvent.click(logoutButton);
        expect(mockProps.handleLogout).toHaveBeenCalledTimes(1);
    });
}); 