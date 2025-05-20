import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSessionInitialization } from '../../hooks/useSessionInitialization';
import api from '../../api';
import { ENDPOINTS } from '../../constants';

// Mock the api module
jest.mock('../../api', () => ({
    get: jest.fn(),
}));

describe('useSessionInitialization', () => {
    // Mock functions and refs
    const mockSetSessionId = jest.fn();
    const mockSetStreamStatus = jest.fn();
    const mockAddStatusMessage = jest.fn();
    const mockSetBrowserImage = jest.fn();
    const mockSessionIdRef = { current: 'test-session-id' };

    // Mock localStorage
    const mockLocalStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        clear: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup localStorage mock
        Object.defineProperty(window, 'localStorage', {
            value: mockLocalStorage,
            writable: true
        });
        // Reset timers
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should initialize with takeScreenshot function', () => {
        const { result } = renderHook(() => useSessionInitialization(
            false,
            mockSetSessionId,
            mockSetStreamStatus,
            mockAddStatusMessage,
            mockSessionIdRef,
            mockSetBrowserImage
        ));

        expect(result.current.takeScreenshot).toBeDefined();
        expect(typeof result.current.takeScreenshot).toBe('function');
    });

    it('should not initialize session when not authenticated', () => {
        renderHook(() => useSessionInitialization(
            false,
            mockSetSessionId,
            mockSetStreamStatus,
            mockAddStatusMessage,
            mockSessionIdRef,
            mockSetBrowserImage
        ));

        expect(mockSetSessionId).not.toHaveBeenCalled();
        expect(mockSetStreamStatus).not.toHaveBeenCalled();
    });

    it('should initialize session when authenticated with existing session ID', async () => {
        const existingSessionId = 'existing-session-id';
        mockLocalStorage.getItem.mockReturnValue(existingSessionId);

        renderHook(() => useSessionInitialization(
            true,
            mockSetSessionId,
            mockSetStreamStatus,
            mockAddStatusMessage,
            mockSessionIdRef,
            mockSetBrowserImage
        ));

        expect(mockSetSessionId).toHaveBeenCalledWith(existingSessionId);

        // Fast-forward timers to trigger initialization
        act(() => {
            jest.advanceTimersByTime(1000);
        });

        expect(mockSetStreamStatus).toHaveBeenCalledWith('waiting');

        // Fast-forward to screenshot timer
        act(() => {
            jest.advanceTimersByTime(500);
        });

        // Verify screenshot was attempted
        expect(api.get).toHaveBeenCalledWith(
            ENDPOINTS.GET_SCREENSHOTS,
            expect.any(Object)
        );
    });

    it('should handle missing session ID after login', () => {
        mockLocalStorage.getItem.mockReturnValue(null);

        renderHook(() => useSessionInitialization(
            true,
            mockSetSessionId,
            mockSetStreamStatus,
            mockAddStatusMessage,
            mockSessionIdRef,
            mockSetBrowserImage
        ));

        expect(mockAddStatusMessage).toHaveBeenCalledWith('error', 'Session initialization error');
    });

    it('should successfully take screenshot', async () => {
        const mockImage = 'base64-image-data';
        api.get.mockResolvedValueOnce({ data: { image: mockImage } });

        const { result } = renderHook(() => useSessionInitialization(
            true,
            mockSetSessionId,
            mockSetStreamStatus,
            mockAddStatusMessage,
            mockSessionIdRef,
            mockSetBrowserImage
        ));

        await act(async () => {
            await result.current.takeScreenshot();
        });

        expect(api.get).toHaveBeenCalledWith(
            ENDPOINTS.GET_SCREENSHOTS,
            expect.any(Object)
        );
        expect(mockSetBrowserImage).toHaveBeenCalledWith(mockImage);
        expect(mockAddStatusMessage).toHaveBeenCalledWith('info', 'Screenshot updated');
    });

    it('should handle screenshot failure', async () => {
        const errorMessage = 'Network error';
        api.get.mockRejectedValueOnce(new Error(errorMessage));

        const { result } = renderHook(() => useSessionInitialization(
            true,
            mockSetSessionId,
            mockSetStreamStatus,
            mockAddStatusMessage,
            mockSessionIdRef,
            mockSetBrowserImage
        ));

        await act(async () => {
            await result.current.takeScreenshot();
        });

        expect(mockAddStatusMessage).toHaveBeenCalledWith('warning', `Screenshot failed: ${errorMessage}`);
    });
}); 