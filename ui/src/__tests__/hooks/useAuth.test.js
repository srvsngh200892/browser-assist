import React from 'react';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useAuth } from '../../hooks/useAuth';

// Mock the AuthContext module
jest.mock('../../contexts/AuthProvider', () => ({
    AuthContext: {
        Consumer: ({ children }) => children({}),
        Provider: ({ children }) => children
    }
}));

describe('useAuth', () => {
    const mockContextValue = {
        isAuthenticated: true,
        user: { id: 1, name: 'Test User' },
        sessionId: 'test-session-id',
        setSessionId: jest.fn(),
        handleLoginSuccess: jest.fn(),
        handleLogout: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return auth context values', () => {
        const { AuthContext } = require('../../contexts/AuthProvider');
        jest.spyOn(React, 'useContext').mockImplementation(() => mockContextValue);

        const { result } = renderHook(() => useAuth());
        expect(result.current).toEqual(mockContextValue);
    });

    it('should return undefined when used outside AuthProvider', () => {
        jest.spyOn(React, 'useContext').mockImplementation(() => undefined);

        const { result } = renderHook(() => useAuth());
        expect(result.current).toBeUndefined();
    });
}); 