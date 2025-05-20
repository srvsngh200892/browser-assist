import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useToggleFunction } from '../../hooks/useToggleFunction';

describe('useToggleFunction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should initialize with default values', () => {
        const { result } = renderHook(() => useToggleFunction());

        expect(result.current.showTechnicalMessages).toBe(false);
        expect(result.current.previewVisible).toBe(true);
    });

    it('should toggle technical messages', () => {
        const { result } = renderHook(() => useToggleFunction());

        act(() => {
            result.current.toggleTechnicalMessages();
        });
        expect(result.current.showTechnicalMessages).toBe(true);

        act(() => {
            result.current.toggleTechnicalMessages();
        });
        expect(result.current.showTechnicalMessages).toBe(false);
    });

    it('should toggle preview visibility', () => {
        const { result } = renderHook(() => useToggleFunction());

        // Preview starts as true by default
        expect(result.current.previewVisible).toBe(true);

        act(() => {
            result.current.togglePreview();
        });
        expect(result.current.previewVisible).toBe(false);

        act(() => {
            result.current.togglePreview();
        });
        expect(result.current.previewVisible).toBe(true);
    });

    it('should allow direct state updates via setters', () => {
        const { result } = renderHook(() => useToggleFunction());

        act(() => {
            result.current.setShowTechnicalMessages(true);
        });
        expect(result.current.showTechnicalMessages).toBe(true);

        act(() => {
            result.current.setPreviewVisible(false);
        });
        expect(result.current.previewVisible).toBe(false);
    });

    it('should return stable function references', () => {
        const { result, rerender } = renderHook(() => useToggleFunction());

        const firstToggleTechnical = result.current.toggleTechnicalMessages;
        const firstTogglePreview = result.current.togglePreview;

        rerender();

        expect(result.current.toggleTechnicalMessages).toBe(firstToggleTechnical);
        expect(result.current.togglePreview).toBe(firstTogglePreview);
    });
}); 