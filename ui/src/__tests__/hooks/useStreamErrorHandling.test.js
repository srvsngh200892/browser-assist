import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useStreamErrorHandling } from '../../hooks/useStreamErrorHandling';

describe('useStreamErrorHandling', () => {
    // Mock functions and refs
    const mockReconnectToStream = jest.fn();
    const mockStreamConnection = {
        onerror: null,
        addEventListener: jest.fn(),
    };
    const mockStreamSourceRef = { current: mockStreamConnection };

    // Mock console methods
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock console methods
        console.error = jest.fn();
        console.log = jest.fn();
        // Reset stream connection
        mockStreamConnection.onerror = null;
        mockStreamConnection.addEventListener = jest.fn();
    });

    afterEach(() => {
        // Restore console methods
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
    });

    it('should set error handler on stream connection', () => {
        renderHook(() => useStreamErrorHandling(mockStreamSourceRef, mockReconnectToStream));

        expect(mockStreamConnection.onerror).toBeDefined();
        expect(typeof mockStreamConnection.onerror).toBe('function');
    });

    it('should handle stream errors and attempt reconnection', () => {
        renderHook(() => useStreamErrorHandling(mockStreamSourceRef, mockReconnectToStream));

        const mockError = new Error('Stream error');
        mockStreamConnection.onerror(mockError);

        expect(console.error).toHaveBeenCalledWith('Stream error:', mockError);
        expect(mockReconnectToStream).toHaveBeenCalled();
    });

    it('should preserve and call existing error handler', () => {
        const existingErrorHandler = jest.fn();
        mockStreamConnection.onerror = existingErrorHandler;

        renderHook(() => useStreamErrorHandling(mockStreamSourceRef, mockReconnectToStream));

        const mockError = new Error('Stream error');
        mockStreamConnection.onerror(mockError);

        expect(existingErrorHandler).toHaveBeenCalledWith(mockError);
        expect(mockReconnectToStream).toHaveBeenCalled();
    });

    it('should handle stream close events', () => {
        renderHook(() => useStreamErrorHandling(mockStreamSourceRef, mockReconnectToStream));

        // Get the close event handler that was registered
        const closeHandler = mockStreamConnection.addEventListener.mock.calls.find(
            call => call[0] === 'close'
        )[1];

        // Simulate close event
        closeHandler();

        expect(console.log).toHaveBeenCalledWith('Stream closed');
        expect(mockReconnectToStream).toHaveBeenCalled();
    });

    it('should not set handlers if stream connection is null', () => {
        const nullStreamSourceRef = { current: null };

        renderHook(() => useStreamErrorHandling(nullStreamSourceRef, mockReconnectToStream));

        expect(mockStreamConnection.addEventListener).not.toHaveBeenCalled();
        expect(mockReconnectToStream).not.toHaveBeenCalled();
    });

    it('should add close event listener to stream connection', () => {
        renderHook(() => useStreamErrorHandling(mockStreamSourceRef, mockReconnectToStream));

        expect(mockStreamConnection.addEventListener).toHaveBeenCalledWith(
            'close',
            expect.any(Function)
        );
    });

    it('should handle multiple error events', () => {
        renderHook(() => useStreamErrorHandling(mockStreamSourceRef, mockReconnectToStream));

        const mockError1 = new Error('First error');
        const mockError2 = new Error('Second error');

        mockStreamConnection.onerror(mockError1);
        mockStreamConnection.onerror(mockError2);

        expect(console.error).toHaveBeenCalledTimes(2);
        expect(mockReconnectToStream).toHaveBeenCalledTimes(2);
    });
}); 