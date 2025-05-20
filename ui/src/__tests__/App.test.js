import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { AuthProvider } from '../contexts/AuthProvider';
import { WELCOME_MESSAGE, PLACEHOLDER_IMAGE } from '../constants';

// Mock axios
jest.mock('axios', () => ({
    create: () => ({
        get: jest.fn(),
        post: jest.fn(),
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() }
        }
    })
}));

// Mock all components
jest.mock('../components/Header', () => {
    return function MockHeader({ togglePreview, previewVisible, pingServer, user, handleLogout }) {
        return (
            <header data-testid="header">
                <button onClick={togglePreview}>Toggle Preview</button>
                <button onClick={pingServer}>Ping Server</button>
                <button onClick={handleLogout}>Logout</button>
                <span>{user?.name}</span>
            </header>
        );
    };
});

jest.mock('../components/SessionInfo', () => {
    return function MockSessionInfo({ sessionId }) {
        return <div data-testid="session-info">{sessionId}</div>;
    };
});

jest.mock('../components/Login', () => {
    return function MockLogin({ onLoginSuccess }) {
        return (
            <button onClick={() => onLoginSuccess({ id: 1, name: 'Test User' }, 'test-session')}>
                Login
            </button>
        );
    };
});

jest.mock('../components/ChatSection', () => {
    return function MockChatSection(props) {
        return <div data-testid="chat-section" />;
    };
});

jest.mock('../components/PreviewSection', () => {
    return function MockPreviewSection({ visible, browserImage }) {
        return (
            <div data-testid="preview-section" data-visible={visible}>
                <img src={browserImage} alt="preview" />
            </div>
        );
    };
});

// Fix all hook mocks
jest.mock('../hooks/useAuth', () => {
    return {
        useAuth: jest.fn().mockReturnValue({
            isAuthenticated: false,
            user: null,
            sessionId: null,
            setSessionId: jest.fn(),
            handleLoginSuccess: jest.fn(),
            handleLogout: jest.fn()
        })
    };
});

jest.mock('../hooks/useInitialMessages', () => ({
    useInitialMessages: jest.fn()
}));

jest.mock('../hooks/useScreenshotAvailability', () => ({
    useScreenshotAvailability: jest.fn()
}));

jest.mock('../hooks/useSessionInitialization', () => ({
    useSessionInitialization: jest.fn()
}));

jest.mock('../hooks/useLoadingStatePolling', () => {
    return {
        useLoadingStatePolling: jest.fn()
    };
});

jest.mock('../hooks/useStreamManagement', () => {
    return {
        useStreamManagement: jest.fn().mockReturnValue({
            streamSourceRef: { current: null },
            streaming: false,
            streamStatus: 'idle',
            setStreamStatus: jest.fn(),
            cleanupStream: jest.fn(),
            stopStream: jest.fn(),
            pingServer: jest.fn(),
            restartStream: jest.fn(),
            startStream: jest.fn(),
            reconnectToStream: jest.fn(),
            resumeStream: jest.fn()
        })
    };
});

jest.mock('../hooks/useHandleSendMessage', () => ({
    useHandleSendMessage: jest.fn()
}));

jest.mock('../hooks/useToggleFunction', () => {
    return {
        useToggleFunction: jest.fn().mockReturnValue({
            showTechnicalMessages: false,
            previewVisible: false,
            toggleTechnicalMessages: jest.fn(),
            togglePreview: jest.fn()
        })
    };
});

describe('App', () => {
    const mockAuthHook = {
        isAuthenticated: false,
        user: null,
        sessionId: null,
        setSessionId: jest.fn(),
        handleLoginSuccess: jest.fn(),
        handleLogout: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        const { useAuth } = require('../hooks/useAuth');
        const { useToggleFunction } = require('../hooks/useToggleFunction');
        const { useStreamManagement } = require('../hooks/useStreamManagement');
        const { useInitialMessages } = require('../hooks/useInitialMessages');
        const { useScreenshotAvailability } = require('../hooks/useScreenshotAvailability');
        const { useHandleSendMessage } = require('../hooks/useHandleSendMessage');
        const { useSessionInitialization } = require('../hooks/useSessionInitialization');

        useAuth.mockReturnValue(mockAuthHook);
        useToggleFunction.mockReturnValue({
            showTechnicalMessages: false,
            previewVisible: false,
            toggleTechnicalMessages: jest.fn(),
            togglePreview: jest.fn()
        });
        useStreamManagement.mockReturnValue({
            streamSourceRef: { current: null },
            streaming: false,
            streamStatus: 'idle',
            setStreamStatus: jest.fn(),
            cleanupStream: jest.fn(),
            stopStream: jest.fn(),
            pingServer: jest.fn(),
            restartStream: jest.fn(),
            startStream: jest.fn(),
            reconnectToStream: jest.fn(),
            resumeStream: jest.fn()
        });
        useInitialMessages.mockReturnValue({
            typingMessageIds: [],
            setTypingMessageIds: jest.fn()
        });
        useScreenshotAvailability.mockReturnValue({
            hasScreenshots: false,
            screenshotCount: 0
        });
        useHandleSendMessage.mockReturnValue({
            handleSendMessage: jest.fn(),
            pollForMessages: jest.fn()
        });
        useSessionInitialization.mockReturnValue({
            takeScreenshot: jest.fn()
        });
    });

    describe('Authentication Flow', () => {
        it('should show login component when not authenticated', () => {
            render(<App />);
            expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
        });

        it('should show main content when authenticated', () => {
            const { useAuth } = require('../hooks/useAuth');
            const { useStreamManagement } = require('../hooks/useStreamManagement');
            const { useInitialMessages } = require('../hooks/useInitialMessages');
            const { useScreenshotAvailability } = require('../hooks/useScreenshotAvailability');
            const { useHandleSendMessage } = require('../hooks/useHandleSendMessage');
            const { useSessionInitialization } = require('../hooks/useSessionInitialization');
            const { useToggleFunction } = require('../hooks/useToggleFunction');

            useAuth.mockReturnValue({
                isAuthenticated: true,
                user: { id: 1, name: 'Test User' },
                sessionId: 'test-session',
                setSessionId: jest.fn(),
                handleLoginSuccess: jest.fn(),
                handleLogout: jest.fn()
            });

            useStreamManagement.mockReturnValue({
                streamSourceRef: { current: null },
                streaming: false,
                streamStatus: 'idle',
                setStreamStatus: jest.fn(),
                cleanupStream: jest.fn(),
                stopStream: jest.fn(),
                pingServer: jest.fn(),
                restartStream: jest.fn(),
                startStream: jest.fn(),
                reconnectToStream: jest.fn(),
                resumeStream: jest.fn()
            });

            useInitialMessages.mockReturnValue({
                typingMessageIds: [],
                setTypingMessageIds: jest.fn()
            });

            useScreenshotAvailability.mockReturnValue({
                hasScreenshots: false,
                screenshotCount: 0
            });

            useHandleSendMessage.mockReturnValue({
                handleSendMessage: jest.fn(),
                pollForMessages: jest.fn()
            });

            useSessionInitialization.mockReturnValue({
                takeScreenshot: jest.fn()
            });

            useToggleFunction.mockReturnValue({
                showTechnicalMessages: false,
                previewVisible: true,
                toggleTechnicalMessages: jest.fn(),
                togglePreview: jest.fn()
            });

            render(<App />);
            expect(screen.getByTestId('chat-section')).toBeInTheDocument();
            expect(screen.getByTestId('preview-section')).toBeInTheDocument();
        });

        it('should handle successful login', async () => {
            const mockLoginSuccess = jest.fn();
            const { useAuth } = require('../hooks/useAuth');
            useAuth.mockReturnValue({
                ...mockAuthHook,
                handleLoginSuccess: mockLoginSuccess
            });

            render(<App />);
            fireEvent.click(screen.getByRole('button', { name: /login/i }));

            await waitFor(() => {
                expect(mockLoginSuccess).toHaveBeenCalledWith(
                    { id: 1, name: 'Test User' },
                    'test-session'
                );
            });
        });
    });

    describe('UI Interactions', () => {
        beforeEach(() => {
            const { useAuth } = require('../hooks/useAuth');
            useAuth.mockReturnValue({
                ...mockAuthHook,
                isAuthenticated: true,
                user: { id: 1, name: 'Test User' },
                sessionId: 'test-session'
            });
        });

        it('should toggle preview visibility', async () => {
            const mockTogglePreview = jest.fn();
            const { useToggleFunction } = require('../hooks/useToggleFunction');
            useToggleFunction.mockReturnValue({
                showTechnicalMessages: false,
                previewVisible: false,
                toggleTechnicalMessages: jest.fn(),
                togglePreview: mockTogglePreview
            });

            render(<App />);
            fireEvent.click(screen.getByRole('button', { name: /toggle preview/i }));

            expect(mockTogglePreview).toHaveBeenCalled();
        });

        it('should handle logout', async () => {
            const mockHandleLogout = jest.fn();
            const { useAuth } = require('../hooks/useAuth');
            useAuth.mockReturnValue({
                ...mockAuthHook,
                isAuthenticated: true,
                user: { id: 1, name: 'Test User' },
                sessionId: 'test-session',
                handleLogout: mockHandleLogout
            });

            render(<App />);
            fireEvent.click(screen.getByRole('button', { name: /logout/i }));

            expect(mockHandleLogout).toHaveBeenCalled();
        });
    });

    describe('Stream Management', () => {
        beforeEach(() => {
            const { useAuth } = require('../hooks/useAuth');
            useAuth.mockReturnValue({
                ...mockAuthHook,
                isAuthenticated: true,
                user: { id: 1, name: 'Test User' },
                sessionId: 'test-session'
            });
        });

        it('should handle stream status changes', async () => {
            const mockSetStreamStatus = jest.fn();
            const { useStreamManagement } = require('../hooks/useStreamManagement');
            useStreamManagement.mockReturnValue({
                streamSourceRef: { current: null },
                streaming: false,
                streamStatus: 'connecting',
                setStreamStatus: mockSetStreamStatus,
                cleanupStream: jest.fn(),
                stopStream: jest.fn(),
                pingServer: jest.fn(),
                restartStream: jest.fn(),
                startStream: jest.fn(),
                reconnectToStream: jest.fn(),
                resumeStream: jest.fn()
            });

            render(<App />);

            await waitFor(() => {
                expect(screen.getByTestId('chat-section')).toBeInTheDocument();
            });
        });
    });
}); 