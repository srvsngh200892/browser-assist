import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useScreenshotAvailability } from '../../hooks/useScreenshotAvailability';
import api from '../../api';
import { ENDPOINTS } from '../../constants';

// Increase Jest timeout for all tests in this file
jest.setTimeout(10000);

// Mock the api module
jest.mock('../../api', () => ({
    get: jest.fn()
}));

describe('useScreenshotAvailability', () => {
    const mockSessionId = 'test-session-id';

    // Mock console methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        // Mock console methods
        console.log = jest.fn();
        console.error = jest.fn();
        // Mock successful API response by default
        api.get.mockResolvedValue({
            data: {
                success: true,
                hasScreenshots: false,
                screenshotCount: 0
            }
        });
    });

    afterEach(() => {
        // Restore console methods
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('should initialize with default values', () => {
        const { result } = renderHook(() => useScreenshotAvailability(mockSessionId));
        expect(result.current.hasScreenshots).toBe(false);
        expect(result.current.screenshotCount).toBe(0);
    });

    it('should check screenshot availability on mount', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                hasScreenshots: true,
                screenshotCount: 3
            }
        });

        const { result } = renderHook(() => useScreenshotAvailability(mockSessionId));

        // Wait for initial API call
        await act(async () => {
            await Promise.resolve();
        });

        expect(api.get).toHaveBeenCalledWith(ENDPOINTS.VALIDATION_STATUS(mockSessionId));
        expect(result.current.hasScreenshots).toBe(true);
        expect(result.current.screenshotCount).toBe(3);
        expect(console.log).toHaveBeenCalledWith('Session has 3 screenshots available for validation report');
    });

    it('should not check availability without sessionId', async () => {
        const { result } = renderHook(() => useScreenshotAvailability(null));

        // Wait for any potential API calls
        await act(async () => {
            await Promise.resolve();
        });

        expect(api.get).not.toHaveBeenCalled();
        expect(result.current.hasScreenshots).toBe(false);
    });

    it('should handle API errors gracefully', async () => {
        const mockError = new Error('API Error');
        api.get.mockRejectedValueOnce(mockError);

        const { result } = renderHook(() => useScreenshotAvailability(mockSessionId));

        await act(async () => {
            await Promise.resolve();
        });

        expect(console.error).toHaveBeenCalledWith('Error checking screenshot availability:', mockError);
        expect(result.current.hasScreenshots).toBe(false);
        expect(result.current.screenshotCount).toBe(0);
    });

    it('should poll for screenshot availability', async () => {
        const { result } = renderHook(() => useScreenshotAvailability(mockSessionId));

        // Wait for initial call
        await act(async () => {
            await Promise.resolve();
        });

        expect(api.get).toHaveBeenCalledTimes(1);

        // Mock the next response
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                hasScreenshots: true,
                screenshotCount: 2
            }
        });

        // Advance time and trigger interval
        await act(async () => {
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
        });

        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.screenshotCount).toBe(2);
    });

    it('should clear interval on unmount', async () => {
        const { unmount } = renderHook(() => useScreenshotAvailability(mockSessionId));

        // Wait for initial call
        await act(async () => {
            await Promise.resolve();
        });

        expect(api.get).toHaveBeenCalledTimes(1);

        unmount();

        // Advance time to verify interval is cleared
        await act(async () => {
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
        });

        expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('should update state when screenshot availability changes', async () => {
        // First response: no screenshots
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                hasScreenshots: false,
                screenshotCount: 0
            }
        });

        const { result } = renderHook(() => useScreenshotAvailability(mockSessionId));

        // Wait for initial call
        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.hasScreenshots).toBe(false);
        expect(result.current.screenshotCount).toBe(0);

        // Second response: screenshots available
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                hasScreenshots: true,
                screenshotCount: 2
            }
        });

        // Advance time and trigger interval
        await act(async () => {
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
        });

        expect(result.current.hasScreenshots).toBe(true);
        expect(result.current.screenshotCount).toBe(2);
    });

    it('should handle unsuccessful API responses', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: false
            }
        });

        const { result } = renderHook(() => useScreenshotAvailability(mockSessionId));

        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.hasScreenshots).toBe(false);
        expect(result.current.screenshotCount).toBe(0);
    });
}); 