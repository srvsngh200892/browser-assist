import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { usePreviewPlaceholderReset } from '../../hooks/usePreviewPlaceholderReset';

describe('usePreviewPlaceholderReset', () => {
    const mockSetBrowserImage = jest.fn();
    const MOCK_PLACEHOLDER_IMAGE = 'placeholder-image-url';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should set placeholder image when preview becomes visible and not streaming', () => {
        // Initial render with preview hidden
        const { rerender } = renderHook(
            ({ previewVisible, streaming }) => usePreviewPlaceholderReset(
                previewVisible,
                streaming,
                mockSetBrowserImage,
                MOCK_PLACEHOLDER_IMAGE
            ),
            {
                initialProps: { previewVisible: false, streaming: false }
            }
        );

        // Verify it doesn't set image initially
        expect(mockSetBrowserImage).not.toHaveBeenCalled();

        // Make preview visible
        rerender({ previewVisible: true, streaming: false });

        // Should set placeholder image
        expect(mockSetBrowserImage).toHaveBeenCalledWith(MOCK_PLACEHOLDER_IMAGE);
    });

    it('should not set placeholder image when streaming is active', () => {
        const { rerender } = renderHook(
            ({ previewVisible, streaming }) => usePreviewPlaceholderReset(
                previewVisible,
                streaming,
                mockSetBrowserImage,
                MOCK_PLACEHOLDER_IMAGE
            ),
            {
                initialProps: { previewVisible: false, streaming: true }
            }
        );

        // Make preview visible while streaming
        rerender({ previewVisible: true, streaming: true });

        // Should not set placeholder image when streaming
        expect(mockSetBrowserImage).not.toHaveBeenCalled();
    });

    it('should not set placeholder image when preview becomes hidden', () => {
        const { rerender } = renderHook(
            ({ previewVisible, streaming }) => usePreviewPlaceholderReset(
                previewVisible,
                streaming,
                mockSetBrowserImage,
                MOCK_PLACEHOLDER_IMAGE
            ),
            {
                initialProps: { previewVisible: true, streaming: false }
            }
        );

        // Initial render should set the image
        expect(mockSetBrowserImage).toHaveBeenCalledWith(MOCK_PLACEHOLDER_IMAGE);
        mockSetBrowserImage.mockClear();

        // Hide preview
        rerender({ previewVisible: false, streaming: false });

        // Should not set image when hiding preview
        expect(mockSetBrowserImage).not.toHaveBeenCalled();
    });

    it('should handle streaming state changes correctly', () => {
        const { rerender } = renderHook(
            ({ previewVisible, streaming }) => usePreviewPlaceholderReset(
                previewVisible,
                streaming,
                mockSetBrowserImage,
                MOCK_PLACEHOLDER_IMAGE
            ),
            {
                initialProps: { previewVisible: true, streaming: true }
            }
        );

        // Initially shouldn't set image because streaming
        expect(mockSetBrowserImage).not.toHaveBeenCalled();

        // Stop streaming while preview is visible
        rerender({ previewVisible: true, streaming: false });

        // Should set placeholder image when streaming stops
        expect(mockSetBrowserImage).toHaveBeenCalledWith(MOCK_PLACEHOLDER_IMAGE);
    });
}); 