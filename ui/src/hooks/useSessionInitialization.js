import { useEffect, useCallback } from 'react';
import { ENDPOINTS } from '../constants';
import api from '../api';

export const useSessionInitialization = (isAuthenticated, setSessionId, setStreamStatus, addStatusMessage, sessionIdRef, setBrowserImage) => {

 /**
 * Take a screenshot
 */
  const takeScreenshot = useCallback(async () => {
    if (!sessionIdRef.current) return;

    try {
        const response = await api.get(ENDPOINTS.GET_SCREENSHOTS, {
            params: { sessionId: sessionIdRef.current, _t: Date.now() }
        });

        if (response.data && response.data.image) {
            setBrowserImage(response.data.image);
            addStatusMessage('info', 'Screenshot updated');
        }
    } catch (err) {
        addStatusMessage('warning', `Screenshot failed: ${err.message}`);
    }
  }, [addStatusMessage]);

  useEffect(() => {
    // Only proceed if authenticated
    if (!isAuthenticated) {
      return;
    }

    // Check if we already have a session ID from login
    const loginSessionId = localStorage.getItem('session_id');
    if (loginSessionId) {
      console.log('INIT DEBUG: Using session created during login:', loginSessionId);
      setSessionId(loginSessionId);

      // Initialize tools with a small delay
      setTimeout(async () => {
        try {
          // Set stream status to waiting - this will trigger auto-start
          console.log('INIT DEBUG: Setting stream status to waiting to trigger auto-start');
          setStreamStatus('waiting');

          // Take initial screenshot with a small delay
          setTimeout(() => {
            takeScreenshot();
          }, 500);
        } catch (error) {
          console.error('Error initializing tools:', error);
        }
      }, 1000);
    } else {
      // If somehow we don't have a session ID after login, log an error
      console.error('INIT DEBUG: No session ID found after login');
      addStatusMessage('error', 'Session initialization error');
    }

    // Clean up on unmount
    return () => {
    };
  }, [isAuthenticated, setSessionId, setStreamStatus, takeScreenshot, addStatusMessage]);

  return {
    takeScreenshot
  };
};
