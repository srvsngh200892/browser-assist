import React from 'react';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from '../../hooks/useSession';

describe('useSession', () => {
    const mockSessionId = 'test-session-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should initialize with the provided sessionId', () => {
        const { result } = renderHook(() => useSession(mockSessionId));

        expect(result.current.sessionIdRef.current).toBe(mockSessionId);
        expect(result.current.setError).toBeDefined();
        expect(result.current.setReusingSession).toBeDefined();
    });

    it('should update sessionIdRef when sessionId changes', () => {
        const { result, rerender } = renderHook(
            ({ id }) => useSession(id),
            { initialProps: { id: mockSessionId } }
        );

        const newSessionId = 'new-session-456';
        rerender({ id: newSessionId });

        expect(result.current.sessionIdRef.current).toBe(newSessionId);
    });

    it('should return the correct interface', () => {
        const { result } = renderHook(() => useSession(mockSessionId));

        expect(result.current).toEqual({
            sessionIdRef: expect.any(Object),
            setError: expect.any(Function),
            setReusingSession: expect.any(Function)
        });
    });
}); 