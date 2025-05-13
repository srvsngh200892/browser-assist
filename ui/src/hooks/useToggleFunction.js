import { useCallback, useState } from 'react';

export const useToggleFunction = () => {
    const [showTechnicalMessages, setShowTechnicalMessages] = useState(false);
    const [previewVisible, setPreviewVisible] = useState(true);

    const toggleTechnicalMessages = useCallback(() => {
        setShowTechnicalMessages(prev => !prev);
    }, []);

    const togglePreview = useCallback(() => {
        // if (streaming && previewVisible) {
        //     stopStream();
        // }
        // // If we're toggling the preview on (from hidden to visible)
        // // make sure we have the correct image displayed
        // const isTogglingOn = !previewVisible;
        // if (isTogglingOn) {
        //     // Only reset to placeholder when not streaming and toggling on
        //     setBrowserImage(PLACEHOLDER_IMAGE);
        // }
        setPreviewVisible(prev => !prev);
    }, [ previewVisible]);

    return {showTechnicalMessages, setShowTechnicalMessages, previewVisible, setPreviewVisible, toggleTechnicalMessages, togglePreview}
}
