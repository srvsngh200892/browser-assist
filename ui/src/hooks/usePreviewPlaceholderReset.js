import { useEffect } from 'react';

export const usePreviewPlaceholderReset = (previewVisible, streaming, setBrowserImage, PLACEHOLDER_IMAGE) => {
  useEffect(() => {
    // Only run this effect when previewVisible changes to true
    if (previewVisible && !streaming) {
      // Reset to placeholder image when preview is shown and not streaming
      setBrowserImage(PLACEHOLDER_IMAGE);
    }
  }, [previewVisible, streaming, setBrowserImage, PLACEHOLDER_IMAGE]);
};
