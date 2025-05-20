import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { AuthProvider, AuthContext } from '../../contexts/AuthProvider';
import api from '../../api';
import { ENDPOINTS } from '../../constants';

// Mock the api module
jest.mock('../../api', () => ({
    get: jest.fn(),
    post: jest.fn()
}));

// Mock localStorage
const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage
});

// Mock location
const mockLocation = {
    href: 'http://localhost',
    origin: 'http://localhost'
};
Object.defineProperty(window, 'location', {
    value: mockLocation,
    writable: true
});

// Mock console to avoid noise
const mockConsole = {
    log: jest.fn(),
    error: jest.fn()
};
Object.defineProperty(window, 'console', {
    value: mockConsole,
    writable: true
});

describe('AuthProvider', () => {
    let originalLocation;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        originalLocation = window.location;
        mockLocalStorage.getItem.mockReturnValue(null);
    });

    afterEach(() => {
        window.location = originalLocation;
        jest.useRealTimers();
    });

    const renderWithContext = () => {
        let contextValue;
        let rerender;
        act(() => {
            const result = render(
                <AuthProvider>
                    <AuthContext.Consumer>
                        {value => {
                            contextValue = value;
                            return null;
                        }}
                    </AuthContext.Consumer>
                </AuthProvider>
            );
            rerender = result.rerender;
        });
        return { contextValue, rerender };
    };

    describe('Initial State', () => {
        it('should initialize with unauthenticated state', async () => {
            api.get.mockRejectedValueOnce(new Error('Not authenticated'));

            const { contextValue } = renderWithContext();

            await waitFor(() => {
                expect(contextValue.isAuthenticated).toBe(false);
                expect(contextValue.user).toBeNull();
                expect(contextValue.sessionId).toBeNull();
            });
        });

        it('should load session from localStorage', async () => {
            const mockSessionId = 'test-session-id';
            mockLocalStorage.getItem.mockReturnValue(mockSessionId);
            api.get.mockRejectedValueOnce(new Error('Not authenticated'));

            const { contextValue } = renderWithContext();

            await waitFor(() => {
                expect(contextValue.sessionId).toBe(mockSessionId);
            });
        });
    });

    describe('Authentication Check', () => {
        it('should set authenticated state if auth check succeeds', async () => {
            const mockUser = { id: 1, name: 'Test User' };
            api.get.mockResolvedValueOnce({
                data: {
                    isAuthenticated: true,
                    user: mockUser
                }
            });

            let contextValue;
            await act(async () => {
                const result = render(
                    <AuthProvider>
                        <AuthContext.Consumer>
                            {value => {
                                contextValue = value;
                                return null;
                            }}
                        </AuthContext.Consumer>
                    </AuthProvider>
                );
            });

            // Wait for the auth check to complete and state to update
            await act(async () => {
                await Promise.resolve();
            });

            expect(api.get).toHaveBeenCalledWith(ENDPOINTS.AUTH_CHECK);
            expect(contextValue.isAuthenticated).toBe(true);
            expect(contextValue.user).toEqual(mockUser);
        });

        it('should set unauthenticated state if auth check fails', async () => {
            api.get.mockRejectedValueOnce(new Error('Auth check failed'));

            const { contextValue } = renderWithContext();

            await act(async () => {
                await Promise.resolve();
            });

            expect(contextValue.isAuthenticated).toBe(false);
            expect(contextValue.user).toBeNull();
        });
    });

    describe('Login Success Handler', () => {
        it('should update state and localStorage on login success', async () => {
            api.get.mockRejectedValueOnce(new Error('Not authenticated'));
            const mockUser = { id: 1, name: 'Test User' };
            const mockSessionId = 'new-session-id';

            let contextValue;
            await act(async () => {
                const result = render(
                    <AuthProvider>
                        <AuthContext.Consumer>
                            {value => {
                                contextValue = value;
                                return null;
                            }}
                        </AuthContext.Consumer>
                    </AuthProvider>
                );
            });

            // Wait for initial auth check to complete
            await act(async () => {
                await Promise.resolve();
            });

            // Perform login
            await act(async () => {
                contextValue.handleLoginSuccess(mockUser, mockSessionId);
            });

            expect(contextValue.isAuthenticated).toBe(true);
            expect(contextValue.user).toEqual(mockUser);
            expect(contextValue.sessionId).toBe(mockSessionId);
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith('session_id', mockSessionId);
        });
    });

    describe('Logout Handler', () => {
        beforeEach(() => {
            // Reset mocks and clear any error states
            jest.clearAllMocks();
            mockLocalStorage.getItem.mockReturnValue(null);
        });

        it('should handle logout failure', async () => {
            const mockSessionId = 'test-session-id';
            mockLocalStorage.getItem.mockReturnValue(mockSessionId);
            const errorMessage = 'Logout failed';
            api.post.mockRejectedValueOnce(new Error(errorMessage));

            let contextValue;
            await act(async () => {
                render(
                    <AuthProvider>
                        <AuthContext.Consumer>
                            {value => {
                                contextValue = value;
                                return null;
                            }}
                        </AuthContext.Consumer>
                    </AuthProvider>
                );
                await Promise.resolve();
            });

            // Attempt logout and expect error
            try {
                await contextValue.handleLogout(true);
                fail('Expected logout to throw an error');
            } catch (error) {
                expect(error.message).toBe(errorMessage);
                expect(mockConsole.error).toHaveBeenCalledWith('Logout error:', error);
            }
        });

        it('should not call logout API if no session ID exists', async () => {
            mockLocalStorage.getItem.mockReturnValue(null);

            let contextValue;
            await act(async () => {
                render(
                    <AuthProvider>
                        <AuthContext.Consumer>
                            {value => {
                                contextValue = value;
                                return null;
                            }}
                        </AuthContext.Consumer>
                    </AuthProvider>
                );
                await Promise.resolve();
            });

            // Attempt logout
            await contextValue.handleLogout(true);
            expect(api.post).not.toHaveBeenCalled();
        });

        it('should clear state and localStorage on successful logout', async () => {
            const mockSessionId = 'test-session-id';
            mockLocalStorage.getItem.mockReturnValue(mockSessionId);
            api.post.mockResolvedValueOnce({});

            let contextValue;
            await act(async () => {
                render(
                    <AuthProvider>
                        <AuthContext.Consumer>
                            {value => {
                                contextValue = value;
                                return null;
                            }}
                        </AuthContext.Consumer>
                    </AuthProvider>
                );
                await Promise.resolve();
            });

            // Trigger logout
            await act(async () => {
                contextValue.handleLogout(true);
                await Promise.resolve();
                jest.advanceTimersByTime(50);
            });

            expect(api.post).toHaveBeenCalledWith(ENDPOINTS.LOGOUT, {
                sessionId: mockSessionId,
                deleteData: true
            });

            expect(contextValue.isAuthenticated).toBe(false);
            expect(contextValue.user).toBeNull();
            expect(contextValue.sessionId).toBeNull();
            expect(mockLocalStorage.clear).toHaveBeenCalled();
            expect(window.location.href).toBe(window.location.origin);
        });
    });
}); 