import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useLoadingStatePolling } from '../../hooks/useLoadingStatePolling';

describe('useLoadingStatePolling', () => {
    const mockPollForMessages = jest.fn();
    const mockSetLoading = jest.fn();
    const mockSessionId = 'test-session-id';
    const mockMessagesRef = { current: [] };

    // Mock console methods
    const originalConsoleLog = console.log;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        // Mock console methods
        console.log = jest.fn();
        // Reset messagesRef
        mockMessagesRef.current = [];
    });

    afterEach(() => {
        // Restore console methods
        console.log = originalConsoleLog;
        jest.useRealTimers();
    });

    it('should start polling when loading becomes true', () => {
        renderHook(() => useLoadingStatePolling(
            true,
            mockSessionId,
            mockPollForMessages,
            mockSetLoading,
            mockMessagesRef
        ));

        expect(console.log).toHaveBeenCalledWith('EFFECT: Loading ON - Starting polling');
        expect(mockPollForMessages).toHaveBeenCalled();
    });

    it('should not start polling without sessionId', () => {
        renderHook(() => useLoadingStatePolling(
            true,
            null,
            mockPollForMessages,
            mockSetLoading,
            mockMessagesRef
        ));

        expect(mockPollForMessages).not.toHaveBeenCalled();
    });

    it('should restart loading when last message is from user', () => {
        mockMessagesRef.current = [
            { role: 'assistant', content: 'Hello' },
            { role: 'user', content: 'Hi there' }
        ];

        renderHook(() => useLoadingStatePolling(
            false,
            mockSessionId,
            mockPollForMessages,
            mockSetLoading,
            mockMessagesRef
        ));

        // Fast-forward timers
        jest.advanceTimersByTime(100);

        expect(mockSetLoading).toHaveBeenCalledWith(true);
        expect(mockPollForMessages).toHaveBeenCalled();
    });

    it('should not restart loading when last message is from assistant', () => {
        mockMessagesRef.current = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' }
        ];

        renderHook(() => useLoadingStatePolling(
            false,
            mockSessionId,
            mockPollForMessages,
            mockSetLoading,
            mockMessagesRef
        ));

        // Fast-forward timers
        jest.advanceTimersByTime(100);

        expect(mockSetLoading).not.toHaveBeenCalled();
        expect(mockPollForMessages).not.toHaveBeenCalled();
    });

    it('should handle empty messages array', () => {
        mockMessagesRef.current = [];

        renderHook(() => useLoadingStatePolling(
            false,
            mockSessionId,
            mockPollForMessages,
            mockSetLoading,
            mockMessagesRef
        ));

        // Fast-forward timers
        jest.advanceTimersByTime(100);

        expect(mockSetLoading).not.toHaveBeenCalled();
        expect(mockPollForMessages).not.toHaveBeenCalled();
    });

    it('should handle null messagesRef', () => {
        mockMessagesRef.current = null;

        renderHook(() => useLoadingStatePolling(
            false,
            mockSessionId,
            mockPollForMessages,
            mockSetLoading,
            mockMessagesRef
        ));

        // Fast-forward timers
        jest.advanceTimersByTime(100);

        expect(mockSetLoading).not.toHaveBeenCalled();
        expect(mockPollForMessages).not.toHaveBeenCalled();
    });

    it('should respond to loading state changes', () => {
        const { rerender } = renderHook(
            ({ loading }) => useLoadingStatePolling(
                loading,
                mockSessionId,
                mockPollForMessages,
                mockSetLoading,
                mockMessagesRef
            ),
            {
                initialProps: { loading: false }
            }
        );

        expect(mockPollForMessages).not.toHaveBeenCalled();

        rerender({ loading: true });
        expect(mockPollForMessages).toHaveBeenCalled();
    });

    it('should handle multiple loading state changes', () => {
        const { rerender } = renderHook(
            ({ loading }) => useLoadingStatePolling(
                loading,
                mockSessionId,
                mockPollForMessages,
                mockSetLoading,
                mockMessagesRef
            ),
            {
                initialProps: { loading: false }
            }
        );

        mockMessagesRef.current = [{ role: 'user', content: 'Hello' }];

        // First change: loading becomes true
        rerender({ loading: true });
        expect(mockPollForMessages).toHaveBeenCalledTimes(1);

        // Second change: loading becomes false
        rerender({ loading: false });
        jest.advanceTimersByTime(100);
        expect(mockSetLoading).toHaveBeenCalledWith(true);
        expect(mockPollForMessages).toHaveBeenCalledTimes(2);
    });
}); 