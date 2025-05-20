import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import Login from '../../components/Login';

// Mock axios
jest.mock('axios', () => ({
    create: () => ({
        post: jest.fn(),
        interceptors: {
            response: {
                use: jest.fn()
            }
        }
    })
}));

// Mock the ENDPOINTS constant
jest.mock('../../constants', () => ({
    ENDPOINTS: {
        LOGIN: '/api/auth/login',
        REGISTER: '/api/auth/register'
    }
}));

// Import api after mocking axios
import api from '../../api';

describe('Login Component', () => {
    const mockOnLoginSuccess = jest.fn();

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        localStorage.clear();
    });

    it('renders login form by default', () => {
        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
    });

    it('switches between login and register forms', () => {
        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        // Initially in login mode
        expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();

        // Switch to register mode
        fireEvent.click(screen.getByRole('button', { name: /register/i }));

        // Should now show register fields
        expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();

        // Switch back to login
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        // Should hide register fields
        expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
    });

    it('validates email format', async () => {
        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        const emailInput = screen.getByLabelText(/email/i);

        // Test invalid email
        await userEvent.type(emailInput, 'invalid-email');
        fireEvent.blur(emailInput);

        expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();

        // Test valid email
        await userEvent.clear(emailInput);
        await userEvent.type(emailInput, 'test@example.com');
        fireEvent.blur(emailInput);

        expect(screen.queryByText(/enter a valid email/i)).not.toBeInTheDocument();
    });

    it('validates password length', async () => {
        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        const passwordInput = screen.getByLabelText(/^password/i);

        // Test short password
        await userEvent.type(passwordInput, 'short');
        fireEvent.blur(passwordInput);

        expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument();

        // Test valid password
        await userEvent.clear(passwordInput);
        await userEvent.type(passwordInput, 'validpassword');
        fireEvent.blur(passwordInput);

        expect(screen.queryByText(/at least 6 characters/i)).not.toBeInTheDocument();
    });

    it('validates matching passwords in register mode', async () => {
        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        // Switch to register mode
        fireEvent.click(screen.getByText(/register/i));

        const passwordInput = screen.getByLabelText(/^password/i);
        const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

        // Enter different passwords
        await userEvent.type(passwordInput, 'password123');
        await userEvent.type(confirmPasswordInput, 'password456');
        fireEvent.blur(confirmPasswordInput);

        expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();

        // Enter matching passwords
        await userEvent.clear(confirmPasswordInput);
        await userEvent.type(confirmPasswordInput, 'password123');
        fireEvent.blur(confirmPasswordInput);

        expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
    });

    it('toggles password visibility', async () => {
        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        const passwordInput = screen.getByLabelText(/^password/i);
        const toggleButton = screen.getByRole('button', { name: '👁️' });

        // Password should be hidden by default
        expect(passwordInput).toHaveAttribute('type', 'password');

        // Show password
        fireEvent.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'text');

        // Hide password again
        fireEvent.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('handles successful login', async () => {
        const mockUser = { email: 'test@example.com', id: '123' };
        const mockSessionId = 'session-123';

        api.post.mockResolvedValueOnce({
            data: {
                success: true,
                user: mockUser,
                sessionId: mockSessionId
            }
        });

        // Mock timers
        jest.useFakeTimers();

        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        // Fill in login form
        await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
        await userEvent.type(screen.getByLabelText(/^password/i), 'password123');

        // Submit form
        const submitButton = screen.getByRole('button', { name: /^sign in$/i });
        fireEvent.click(submitButton);

        // Check loading state
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
        });

        // Wait for success message
        await waitFor(() => {
            expect(screen.getByText(/login successful/i)).toBeInTheDocument();
        });

        // Check if user data is stored
        expect(JSON.parse(localStorage.getItem('user'))).toEqual(mockUser);
        expect(localStorage.getItem('session_id')).toBe(mockSessionId);

        // Fast-forward timers
        jest.advanceTimersByTime(1000);

        // Check if callback is called
        await waitFor(() => {
            expect(mockOnLoginSuccess).toHaveBeenCalledWith(mockUser, mockSessionId);
        });

        // Restore timers
        jest.useRealTimers();
    });

    it('handles login error', async () => {
        const errorMessage = 'Invalid credentials';
        api.post.mockRejectedValueOnce({
            response: { data: { error: errorMessage } }
        });

        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        // Fill in login form
        await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
        await userEvent.type(screen.getByLabelText(/^password/i), 'password123');

        // Submit form
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        // Wait for error message
        await waitFor(() => {
            expect(screen.getByText(errorMessage)).toBeInTheDocument();
        });

        // Check that localStorage wasn't updated
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('session_id')).toBeNull();

        // Check that callback wasn't called
        expect(mockOnLoginSuccess).not.toHaveBeenCalled();
    });

    it('handles successful registration', async () => {
        const mockUser = { email: 'test@example.com', username: 'testuser', id: '123' };

        api.post.mockResolvedValueOnce({
            data: {
                success: true,
                user: mockUser,
                sessionId: undefined // Registration doesn't return a sessionId
            }
        });

        // Mock timers
        jest.useFakeTimers();

        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        // Switch to register mode
        fireEvent.click(screen.getByRole('button', { name: /register/i }));

        // Fill in registration form
        await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
        await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
        await userEvent.type(screen.getByLabelText(/^password/i), 'password123');
        await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123');

        // Submit form
        const submitButton = screen.getByRole('button', { name: /create account/i });
        fireEvent.click(submitButton);

        // Check loading state
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
        });

        // Wait for success message
        await waitFor(() => {
            expect(screen.getByText(/account created successfully/i)).toBeInTheDocument();
        });

        // Check if user data is stored
        expect(JSON.parse(localStorage.getItem('user'))).toEqual(mockUser);

        // Fast-forward timers
        jest.advanceTimersByTime(1000);

        // Check if callback is called
        await waitFor(() => {
            expect(mockOnLoginSuccess).toHaveBeenCalledWith(mockUser, undefined);
        });

        // Restore timers
        jest.useRealTimers();
    });
}); 