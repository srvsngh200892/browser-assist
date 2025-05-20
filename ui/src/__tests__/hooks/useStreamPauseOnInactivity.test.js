import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useStreamPauseOnInactivity } from '../../hooks/useStreamPauseOnInactivity';
import api from '../../api';
import { ENDPOINTS } from '../../constants';

// Mock the api module
jest.mock('../../api', () => ({
    post: jest.fn()
}));

describe('useStreamPauseOnInactivity', () => {
    const mockSetStreamStatus = jest.fn();
    const mockSessionId = 'test-session-id';

    // Mock console methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock console methods
        console.log = jest.fn();
        console.error = jest.fn();
        // Mock successful API response by default
        api.post.mockResolvedValue({});
    });

    afterEach(() => {
        // Restore console methods
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    });

    it('should pause stream when loading completes and stream is active', () => {
        renderHook(() => useStreamPauseOnInactivity(
            false, // loading
            mockSessionId,
            'active',
            mockSetStreamStatus
        ));

        expect(api.post).toHaveBeenCalledWith(
            ENDPOINTS.STREAM_CONTROL,
            {
                sessionId: mockSessionId,
                action: 'pause',
                reason: 'response_complete'
            }
        );
        expect(mockSetStreamStatus).toHaveBeenCalledWith('waiting');
        expect(console.log).toHaveBeenCalledWith('POLL: Pausing stream since response is complete');
    });

    it('should not pause stream when loading is true', () => {
        renderHook(() => useStreamPauseOnInactivity(
            true, // loading
            mockSessionId,
            'active',
            mockSetStreamStatus
        ));

        expect(api.post).not.toHaveBeenCalled();
        expect(mockSetStreamStatus).not.toHaveBeenCalled();
    });

    it('should not pause stream when sessionId is missing', () => {
        renderHook(() => useStreamPauseOnInactivity(
            false,
            null, // no sessionId
            'active',
            mockSetStreamStatus
        ));

        expect(api.post).not.toHaveBeenCalled();
        expect(mockSetStreamStatus).not.toHaveBeenCalled();
    });

    it('should not pause stream when stream status is not active', () => {
        renderHook(() => useStreamPauseOnInactivity(
            false,
            mockSessionId,
            'waiting', // not active
            mockSetStreamStatus
        ));

        expect(api.post).not.toHaveBeenCalled();
        expect(mockSetStreamStatus).not.toHaveBeenCalled();
    });

    it('should handle API error gracefully', async () => {
        const mockError = new Error('API Error');
        api.post.mockRejectedValueOnce(mockError);

        renderHook(() => useStreamPauseOnInactivity(
            false,
            mockSessionId,
            'active',
            mockSetStreamStatus
        ));

        // Wait for the promise to resolve
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(console.log).toHaveBeenCalledWith('Server may not support stream pausing yet');
        expect(mockSetStreamStatus).toHaveBeenCalledWith('waiting');
    });

    it('should handle all conditions changing simultaneously', () => {
        const { rerender } = renderHook(
            ({ loading, sessionId, status }) => useStreamPauseOnInactivity(
                loading,
                sessionId,
                status,
                mockSetStreamStatus
            ),
            {
                initialProps: {
                    loading: true,
                    sessionId: null,
                    status: 'waiting'
                }
            }
        );

        expect(api.post).not.toHaveBeenCalled();

        // Change all conditions to trigger pause
        rerender({
            loading: false,
            sessionId: mockSessionId,
            status: 'active'
        });

        expect(api.post).toHaveBeenCalledWith(
            ENDPOINTS.STREAM_CONTROL,
            {
                sessionId: mockSessionId,
                action: 'pause',
                reason: 'response_complete'
            }
        );
        expect(mockSetStreamStatus).toHaveBeenCalledWith('waiting');
    });
}); 