import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionInfo from '../../components/SessionInfo';

// Mock axios
jest.mock('axios', () => ({
    create: () => ({
        get: jest.fn(),
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
        GET_SESSION: (sessionId) => `/api/sessions/${sessionId}`
    }
}));

// Import api after mocking axios
import api from '../../api';

describe('SessionInfo Component', () => {
    const mockOnError = jest.fn();
    const mockSessionId = 'test-session-123';
    const FIXED_NOW = new Date('2024-01-01T12:00:00Z').getTime();
    const mockSessionData = {
        sessionId: mockSessionId,
        status: 'active',
        user: {
            email: 'test@example.com'
        },
        createdAt: {
            _seconds: Math.floor(FIXED_NOW / 1000) - 3600 // 1 hour ago
        },
        lastActivity: {
            _seconds: Math.floor(FIXED_NOW / 1000) - 300 // 5 minutes ago
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        // Set fixed current time
        jest.setSystemTime(FIXED_NOW);

        // Set up default mock implementation
        api.get.mockImplementation(() => Promise.resolve({
            data: {
                success: true,
                session: mockSessionData
            }
        }));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('renders loading state initially', async () => {
        render(<SessionInfo sessionId={mockSessionId} onError={mockOnError} />);
        expect(screen.getByText(/loading session data/i)).toBeInTheDocument();
    });

    it('renders empty state when no sessionId is provided', async () => {
        render(<SessionInfo sessionId={null} onError={mockOnError} />);
        expect(screen.getByText(/no active session/i)).toBeInTheDocument();
    });

    it('fetches and displays session information', async () => {
        render(<SessionInfo sessionId={mockSessionId} onError={mockOnError} />);

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/loading session data/i)).not.toBeInTheDocument();
        });

        // Initially collapsed
        expect(screen.getByRole('heading', { name: /session information/i })).toBeInTheDocument();
        expect(screen.queryByText(mockSessionData.user.email)).not.toBeInTheDocument();

        // Expand the component
        fireEvent.click(screen.getByText(/session information/i).closest('div'));

        // Wait for data to be displayed
        await waitFor(() => {
            expect(screen.getByText(mockSessionData.user.email)).toBeInTheDocument();
            expect(screen.getByText(new RegExp(mockSessionId.substring(0, 8)))).toBeInTheDocument();
            const statusIndicator = screen.getByTestId('status-indicator');
            expect(statusIndicator).toHaveClass('active');
            expect(screen.getByText('Active')).toBeInTheDocument();
        });
    });

    it('handles API errors', async () => {
        const errorMessage = 'Failed to fetch session data';
        api.get.mockRejectedValueOnce(new Error(errorMessage));

        render(<SessionInfo sessionId={mockSessionId} onError={mockOnError} />);

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/loading session data/i)).not.toBeInTheDocument();
        });

        // Expand the error view
        fireEvent.click(screen.getByText(/session information/i).closest('div'));

        await waitFor(() => {
            expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
            expect(mockOnError).toHaveBeenCalledWith(errorMessage);
        });
    });

    it('updates session info periodically', async () => {
        render(<SessionInfo sessionId={mockSessionId} onError={mockOnError} />);

        // Wait for initial data
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1);
        });

        // Mock the second API call with updated data
        const updatedSessionData = {
            ...mockSessionData,
            status: 'inactive'
        };

        api.get.mockImplementationOnce(() => Promise.resolve({
            data: {
                success: true,
                session: updatedSessionData
            }
        }));

        // Fast-forward 30 seconds
        jest.advanceTimersByTime(30000);

        // Wait for the second API call
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2);
        });

        // Expand the component to see the changes
        fireEvent.click(screen.getByText(/session information/i).closest('div'));

        await waitFor(() => {
            const statusIndicator = screen.getByTestId('status-indicator');
            expect(statusIndicator).toHaveClass('inactive');
        });
    });

    it('cleans up interval on unmount', async () => {
        const { unmount } = render(
            <SessionInfo sessionId={mockSessionId} onError={mockOnError} />
        );

        // Wait for initial setup
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1);
        });

        unmount();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('toggles expanded state correctly', async () => {
        render(<SessionInfo sessionId={mockSessionId} onError={mockOnError} />);

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/loading session data/i)).not.toBeInTheDocument();
        });

        // Initially collapsed
        expect(screen.queryByText(mockSessionData.user.email)).not.toBeInTheDocument();

        // Expand
        fireEvent.click(screen.getByText(/session information/i).closest('div'));

        await waitFor(() => {
            expect(screen.getByText(mockSessionData.user.email)).toBeInTheDocument();
        });

        // Collapse
        fireEvent.click(screen.getByText(/session information/i).closest('div'));

        expect(screen.queryByText(mockSessionData.user.email)).not.toBeInTheDocument();
    });

    it('displays correct status indicator', async () => {
        render(<SessionInfo sessionId={mockSessionId} onError={mockOnError} />);

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/loading session data/i)).not.toBeInTheDocument();
        });

        // Expand the component
        fireEvent.click(screen.getByText(/session information/i).closest('div'));

        await waitFor(() => {
            const statusIndicator = screen.getByTestId('status-indicator');
            expect(statusIndicator).toHaveClass('active');
        });

        // Update to inactive status
        api.get.mockImplementationOnce(() => Promise.resolve({
            data: {
                success: true,
                session: { ...mockSessionData, status: 'inactive' }
            }
        }));

        // Trigger update
        jest.advanceTimersByTime(30000);

        await waitFor(() => {
            const statusIndicator = screen.getByTestId('status-indicator');
            expect(statusIndicator).toHaveClass('inactive');
        });
    });
});