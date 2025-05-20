import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useScrollButtonState } from '../../hooks/useScrollButtonState';

describe('useScrollButtonState', () => {
    // Mock refs and functions
    const mockSetShowScrollButton = jest.fn();
    const mockChatContainerRef = { current: null };
    const mockMessagesEndRef = { current: null };
    const mockUserScrolledAwayRef = { current: false };

    // Mock messages
    const mockMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Setup mock DOM elements and measurements
        mockChatContainerRef.current = {
            scrollTop: 0,
            scrollHeight: 1000,
            clientHeight: 500,
            scrollIntoView: jest.fn()
        };
        mockMessagesEndRef.current = {
            scrollIntoView: jest.fn()
        };
        mockUserScrolledAwayRef.current = false;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should show scroll button when content is scrollable and not at bottom', () => {
        mockChatContainerRef.current.scrollTop = 0; // At top

        renderHook(() => useScrollButtonState(
            mockChatContainerRef,
            mockMessages,
            mockMessagesEndRef,
            mockUserScrolledAwayRef,
            mockSetShowScrollButton
        ));

        // Fast forward the timeout
        act(() => {
            jest.advanceTimersByTime(100);
        });

        expect(mockSetShowScrollButton).toHaveBeenCalledWith(true);
    });

    it('should hide scroll button when near bottom', () => {
        mockChatContainerRef.current.scrollTop = 480; // Near bottom (1000 - 480 - 500 = 20 < 50)

        renderHook(() => useScrollButtonState(
            mockChatContainerRef,
            mockMessages,
            mockMessagesEndRef,
            mockUserScrolledAwayRef,
            mockSetShowScrollButton
        ));

        act(() => {
            jest.advanceTimersByTime(100);
        });

        expect(mockSetShowScrollButton).toHaveBeenCalledWith(false);
    });

    it('should hide scroll button when content is not scrollable', () => {
        mockChatContainerRef.current.scrollHeight = 500; // Same as clientHeight

        renderHook(() => useScrollButtonState(
            mockChatContainerRef,
            mockMessages,
            mockMessagesEndRef,
            mockUserScrolledAwayRef,
            mockSetShowScrollButton
        ));

        act(() => {
            jest.advanceTimersByTime(100);
        });

        expect(mockSetShowScrollButton).toHaveBeenCalledWith(false);
    });

    it('should auto-scroll on new assistant message', () => {
        const newMessages = [
            ...mockMessages,
            { role: 'assistant', content: 'New message' }
        ];

        renderHook(() => useScrollButtonState(
            mockChatContainerRef,
            newMessages,
            mockMessagesEndRef,
            mockUserScrolledAwayRef,
            mockSetShowScrollButton
        ));

        act(() => {
            jest.advanceTimersByTime(100);
        });

        expect(mockMessagesEndRef.current.scrollIntoView).toHaveBeenCalledWith({
            behavior: 'smooth'
        });
        expect(mockUserScrolledAwayRef.current).toBe(false);
    });

    it('should respect user scroll position for non-assistant messages', () => {
        mockUserScrolledAwayRef.current = true;
        const newMessages = [
            ...mockMessages,
            { role: 'user', content: 'New message' }
        ];

        renderHook(() => useScrollButtonState(
            mockChatContainerRef,
            newMessages,
            mockMessagesEndRef,
            mockUserScrolledAwayRef,
            mockSetShowScrollButton
        ));

        act(() => {
            jest.advanceTimersByTime(100);
        });

        expect(mockMessagesEndRef.current.scrollIntoView).not.toHaveBeenCalled();
        expect(mockUserScrolledAwayRef.current).toBe(true);
    });

    it('should auto-scroll when user is near bottom regardless of message type', () => {
        mockUserScrolledAwayRef.current = true;
        mockChatContainerRef.current.scrollTop = 780; // Near bottom (1000 - 780 - 500 = 180 < 200)

        const newMessages = [
            ...mockMessages,
            { role: 'user', content: 'New message' }
        ];

        renderHook(() => useScrollButtonState(
            mockChatContainerRef,
            newMessages,
            mockMessagesEndRef,
            mockUserScrolledAwayRef,
            mockSetShowScrollButton
        ));

        act(() => {
            jest.advanceTimersByTime(100);
        });

        expect(mockMessagesEndRef.current.scrollIntoView).toHaveBeenCalledWith({
            behavior: 'smooth'
        });
        expect(mockUserScrolledAwayRef.current).toBe(false);
    });
}); 