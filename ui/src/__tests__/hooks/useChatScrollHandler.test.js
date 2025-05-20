import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useChatScrollHandler } from '../../hooks/useChatScrollHandler';

describe('useChatScrollHandler', () => {
    // Mock chat container with scroll properties
    const createMockContainer = (props = {}) => ({
        scrollTo: jest.fn(),
        scrollHeight: 1000,
        clientHeight: 500,
        scrollTop: 0,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        ...props
    });

    let mockContainer;
    let containerRef;

    beforeEach(() => {
        // Reset mocks and refs for each test
        mockContainer = createMockContainer();
        containerRef = { current: mockContainer };
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('should initialize with scroll button hidden', () => {
        const { result } = renderHook(() => useChatScrollHandler(containerRef));
        expect(result.current.showScrollButton).toBe(false);
    });

    it('should show scroll button when scrolled away from bottom', () => {
        const { result } = renderHook(() => useChatScrollHandler(containerRef));

        // Simulate scroll event
        act(() => {
            mockContainer.scrollTop = 0; // Scrolled to top
            result.current.handleChatScroll();
        });

        expect(result.current.showScrollButton).toBe(true);
    });

    it('should hide scroll button when near bottom', () => {
        const { result } = renderHook(() => useChatScrollHandler(containerRef));

        // Simulate scroll event near bottom
        act(() => {
            mockContainer.scrollTop = mockContainer.scrollHeight - mockContainer.clientHeight - 20;
            result.current.handleChatScroll();
        });

        expect(result.current.showScrollButton).toBe(false);
    });

    it('should scroll to bottom when scrollToBottom is called', () => {
        const { result } = renderHook(() => useChatScrollHandler(containerRef));

        act(() => {
            result.current.scrollToBottom();
        });

        expect(mockContainer.scrollTo).toHaveBeenCalledWith({
            top: mockContainer.scrollHeight,
            behavior: 'smooth'
        });
    });

    it('should hide scroll button after scrolling to bottom', () => {
        const { result } = renderHook(() => useChatScrollHandler(containerRef));

        // Show scroll button first
        act(() => {
            mockContainer.scrollTop = 0;
            result.current.handleChatScroll();
        });

        expect(result.current.showScrollButton).toBe(true);

        // Scroll to bottom
        act(() => {
            result.current.scrollToBottom();
            // Simulate scroll completion
            mockContainer.scrollTop = mockContainer.scrollHeight - mockContainer.clientHeight;
            jest.advanceTimersByTime(500);
        });

        expect(result.current.showScrollButton).toBe(false);
    });

    it('should track when user has scrolled away', () => {
        const { result } = renderHook(() => useChatScrollHandler(containerRef));

        // Simulate user scrolling away
        act(() => {
            mockContainer.scrollTop = 0;
            result.current.handleChatScroll();
        });

        expect(result.current.userScrolledAwayRef.current).toBe(true);

        // Simulate scrolling back to bottom
        act(() => {
            mockContainer.scrollTop = mockContainer.scrollHeight - mockContainer.clientHeight;
            result.current.handleChatScroll();
        });

        expect(result.current.userScrolledAwayRef.current).toBe(false);
    });

    it('should not show scroll button when content is not scrollable', () => {
        // Create container with content that fits without scrolling
        mockContainer = createMockContainer({
            scrollHeight: 400,
            clientHeight: 500
        });
        containerRef.current = mockContainer;

        const { result } = renderHook(() => useChatScrollHandler(containerRef));

        act(() => {
            result.current.handleChatScroll();
        });

        expect(result.current.showScrollButton).toBe(false);
    });

    it('should add and remove scroll event listener', () => {
        const { unmount } = renderHook(() => useChatScrollHandler(containerRef));

        expect(mockContainer.addEventListener).toHaveBeenCalledWith(
            'scroll',
            expect.any(Function)
        );

        unmount();

        expect(mockContainer.removeEventListener).toHaveBeenCalledWith(
            'scroll',
            expect.any(Function)
        );
    });

    it('should handle null container ref', () => {
        const nullRef = { current: null };
        const { result } = renderHook(() => useChatScrollHandler(nullRef));

        // Should not throw when calling methods with null ref
        act(() => {
            result.current.handleChatScroll();
            result.current.scrollToBottom();
        });

        expect(result.current.showScrollButton).toBe(false);
    });
}); 