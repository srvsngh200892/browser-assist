import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useInitialMessages } from '../../hooks/useInitialMessages';
import api from '../../api';
import { ENDPOINTS } from '../../constants';

// Mock the api module
jest.mock('../../api', () => ({
    get: jest.fn()
}));

describe('useInitialMessages', () => {
    const mockSessionId = 'test-session-id';
    const mockSetMessages = jest.fn();
    const mockSetLoading = jest.fn();
    const mockLoadingRef = { current: false };
    const mockMessagesRef = { current: [] };

    // Mock localStorage
    const mockLocalStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        clear: jest.fn()
    };

    // Mock console methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup localStorage mock
        Object.defineProperty(window, 'localStorage', {
            value: mockLocalStorage,
            writable: true
        });
        // Mock console methods
        console.log = jest.fn();
        console.error = jest.fn();
    });

    afterEach(() => {
        // Restore console methods
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    });

    it('should fetch and set initial messages', async () => {
        const mockMessages = [
            { id: 1, content: 'Hello', timestamp: '2024-01-01' },
            { id: 2, content: 'Hi there', timestamp: '2024-01-02' }
        ];

        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                messages: mockMessages,
                hasMore: false,
                isDone: true
            }
        });

        renderHook(() => useInitialMessages(
            mockSessionId,
            mockLoadingRef,
            mockMessagesRef,
            mockSetMessages,
            mockSetLoading,
            false,
            []
        ));

        // Wait for the promise to resolve
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(api.get).toHaveBeenCalledWith(ENDPOINTS.GET_MESSAGE(mockSessionId));
        expect(mockSetMessages).toHaveBeenCalledWith(mockMessages);
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
            `lastTimestamp-${mockSessionId}`,
            mockMessages[1].timestamp
        );
    });

    it('should handle messages with more content to pull', async () => {
        const mockMessages = [
            { id: 1, content: 'Hello', timestamp: '2024-01-01' },
            { id: 2, content: 'Hi there', timestamp: '2024-01-02' }
        ];

        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                messages: mockMessages,
                hasMore: true,
                isDone: false
            }
        });

        const { result } = renderHook(() => useInitialMessages(
            mockSessionId,
            mockLoadingRef,
            mockMessagesRef,
            mockSetMessages,
            mockSetLoading,
            false,
            []
        ));

        // Wait for the promise to resolve
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        // Verify typing message was added
        expect(mockSetMessages).toHaveBeenCalledTimes(2); // Once for initial messages, once for typing
        expect(mockSetLoading).toHaveBeenCalledWith(true);
        expect(result.current.typingMessageIds.length).toBe(1);
    });

    it('should not fetch messages without sessionId', async () => {
        renderHook(() => useInitialMessages(
            null,
            mockLoadingRef,
            mockMessagesRef,
            mockSetMessages,
            mockSetLoading,
            false,
            []
        ));

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(api.get).not.toHaveBeenCalled();
        expect(mockSetMessages).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
        const mockError = new Error('API Error');
        api.get.mockRejectedValueOnce(mockError);

        renderHook(() => useInitialMessages(
            mockSessionId,
            mockLoadingRef,
            mockMessagesRef,
            mockSetMessages,
            mockSetLoading,
            false,
            []
        ));

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(console.error).toHaveBeenCalledWith('Error fetching initial messages:', mockError);
        expect(mockSetMessages).not.toHaveBeenCalled();
    });

    it('should update loadingRef when loading changes', () => {
        const { rerender } = renderHook(
            ({ loading }) => useInitialMessages(
                mockSessionId,
                mockLoadingRef,
                mockMessagesRef,
                mockSetMessages,
                mockSetLoading,
                loading,
                []
            ),
            {
                initialProps: { loading: false }
            }
        );

        expect(mockLoadingRef.current).toBe(false);

        rerender({ loading: true });
        expect(mockLoadingRef.current).toBe(true);
    });

    it('should update messagesRef and log changes when messages update', () => {
        const initialMessages = [];
        const newMessages = [
            { id: 1, role: 'user', content: 'Hello' },
            { id: 2, role: 'assistant', content: 'Hi there' }
        ];

        const { rerender } = renderHook(
            ({ messages }) => useInitialMessages(
                mockSessionId,
                mockLoadingRef,
                mockMessagesRef,
                mockSetMessages,
                mockSetLoading,
                false,
                messages
            ),
            {
                initialProps: { messages: initialMessages }
            }
        );

        rerender({ messages: newMessages });

        expect(mockMessagesRef.current).toBe(newMessages);
        expect(console.log).toHaveBeenCalledWith('Messages state updated: 0 -> 2 messages');
        expect(console.log).toHaveBeenCalledWith('Last message:', expect.any(Object));
    });
}); 