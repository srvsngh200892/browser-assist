import { useState, useEffect, useCallback } from 'react';
import api from '../api';

export const useScreenshotAvailability = (sessionId) => {
  const [hasScreenshots, setHasScreenshots] = useState(false);
  const [screenshotCount, setScreenshotCount] = useState(0);

  const checkScreenshotAvailability = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await api.get(`api/validation/status/${sessionId}`);
      if (response.data.success) {
        const hasScreens = response.data.hasScreenshots || false;
        const count = response.data.screenshotCount || 0;
        setHasScreenshots(hasScreens);
        setScreenshotCount(count);
        if (hasScreens) {
          console.log(`Session has ${count} screenshots available for validation report`);
        }
      }
    } catch (err) {
      console.error('Error checking screenshot availability:', err);
      // Don't show error to user, just keep hasScreenshots false
      setHasScreenshots(false);
      setScreenshotCount(0);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      // Check initially when session ID is set
      checkScreenshotAvailability();

      // Set up interval to periodically check for screenshots
      const screenshotCheckInterval = setInterval(() => {
        checkScreenshotAvailability();
      }, 30000); // Check every 30 seconds

      return () => clearInterval(screenshotCheckInterval);
    }
  }, [sessionId, checkScreenshotAvailability]);

  return { hasScreenshots, screenshotCount };
};
