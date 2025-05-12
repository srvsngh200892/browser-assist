import { useRef, useCallback, useState, useEffect } from 'react';
import api from '../api';
import axios from 'axios';

export const useStreamManagement = (sessionId, setBrowserImage, addStatusMessage, PLACEHOLDER_IMAGE) => {
    const streamSourceRef = useRef(null);
    const healthCheckControllerRef = useRef(null);
    const refreshAttemptedRef = useRef(false);
    const [streaming, setStreaming] = useState(false);
    const [streamStatus, setStreamStatus] = useState('waiting');
    const SERVER_URL = process.env.REACT_APP_SERVER_URL

    const cleanupStream = useCallback(() => {
        if (streamSourceRef.current) {
            try {
                console.log('Closing stream connection');
                // Close the EventSource
                if (streamSourceRef.current.close) {
                    streamSourceRef.current.close();
                }
                // Notify server about disconnection
                if (sessionId) {
                    api.post(`/api/stream-disconnect`, {
                        sessionId: sessionId,
                        timestamp: Date.now()
                    }).catch(err => {
                        console.error('Failed to notify about stream disconnect:', err);
                    });
                }
                streamSourceRef.current = null;
            } catch (err) {
                console.error('Error cleaning up stream:', err);
            }
        }
    }, [sessionId]);

    const tryPollingFallback = useCallback(() => {
        console.log('Using screenshot polling as fallback');
        addStatusMessage('info', 'Using screenshot polling instead of streaming');
        setStreaming(false);
        setStreamStatus('inactive');
        // Reset the browser image to the placeholder initially
        setBrowserImage(PLACEHOLDER_IMAGE);

        const takeScreenshot = async () => {
            if (!sessionId) return;
            try {
                const response = await api.get(`/api/screenshot`, {
                    params: { sessionId: sessionId, _t: Date.now() }
                });
                if (response.data && response.data.image) {
                    setBrowserImage(response.data.image);
                    addStatusMessage('info', 'Screenshot updated');
                }
            } catch (err) {
                addStatusMessage('warning', `Screenshot failed: ${err.message}`);
            }
        };
        // Take an immediate screenshot
        takeScreenshot();
        // Set up polling interval
        const pollInterval = setInterval(() => {
            if (sessionId) {
                console.log('Polling for screenshot update');
                takeScreenshot();
            } else {
                clearInterval(pollInterval);
            }
        }, 5000); // Poll every 5 seconds
        // Store interval for cleanup
        streamSourceRef.current = {
            close: () => {
                clearInterval(pollInterval);
                streamSourceRef.current = null;
            }
        };
    }, [addStatusMessage, setBrowserImage, sessionId]);

    const stopStream = useCallback(() => {
        console.log('STREAM DEBUG: Stopping stream');
        try {
            // Clean up the stream connection
            cleanupStream();
            // Update state
            setStreaming(false);
            setStreamStatus('inactive');
            // Don't reset the browser image - keep the last screenshot
            addStatusMessage('info', 'Stream connection closed');
        } catch (err) {
            console.error('STREAM DEBUG: Error stopping stream:', err);
            // Still update state even if cleanup fails
            setStreaming(false);
            setStreamStatus('inactive');
            addStatusMessage('warning', `Stream connection closed with errors: ${err.message}`);
        }
    }, [addStatusMessage, cleanupStream]);

    const pingServer = useCallback(async () => {
        // Use static variable to track if ping is already in progress
        if (pingServer.inProgress) {
            console.log('Ping already in progress, skipping');
            return false;
        }
        // Mark ping as in progress
        pingServer.inProgress = true;
        // Create a unique request ID
        const requestId = Date.now();
        // Create an AbortController for this request
        const controller = new AbortController();
        try {
            addStatusMessage('info', 'Checking server connection...');
            const startTime = Date.now();
            console.log(`Starting ping #${requestId}`);
            const response = await api.get(`/api/health?_t=${requestId}`,
                {
                    timeout: 5000,
                    signal: controller.signal
                }
            );
            const latency = Date.now() - startTime;
            if (response.data && response.data.success) {
                addStatusMessage('success', `Server is healthy (${latency}ms)`);
                console.log(`Ping #${requestId} successful:`, response.data);
                return true;
            } else {
                addStatusMessage('warning', 'Server returned invalid response');
                console.warn(`Ping #${requestId} returned unexpected data:`, response.data);
                return false;
            }
        } catch (err) {
            if (err.name === 'AbortError' || err.name === 'CanceledError' || (axios.isCancel && axios.isCancel(err))) {
                console.log(`Ping #${requestId} was cancelled`);
            } else {
                console.error(`Ping #${requestId} failed:`, err);
                addStatusMessage('error', `Server connection error: ${err.message}`);
            }
            return false;
        } finally {
            // Always clear in-progress flag
            pingServer.inProgress = false;
            // Clean up controller
            controller.abort();
        }
    }, [addStatusMessage]);


    const startStream = useCallback((options = {}) => {
        if (!sessionId || (streaming && !options.isResume)) {
            console.log('STREAM DEBUG: Cannot start stream - conditions not met', {
                hasSession: !!sessionId,
                isStreaming: streaming,
                isResume: options.isResume
            });
            return;
        }
        // Clean up any existing stream first
        cleanupStream();
        // Only reset retry flag if this is a manual/new stream start
        if (!options.isRetry) {
            refreshAttemptedRef.current = false;
        }
        // Set streaming to true immediately for better visual feedback
        setStreaming(true);
        setStreamStatus('connecting');
        addStatusMessage('info', options.isResume ? 'Resuming browser stream...' : 'Starting browser stream...');
        console.log('STREAM DEBUG: Starting stream with session ID:', sessionId);
        // Connection timeout ID for cleanup
        let connectionTimeoutId = null;
        try {
            // Close any existing stream
            cleanupStream();
            // Create EventSource directly without redundant health check
            const streamUrl = `${SERVER_URL}/api/browser-stream/${sessionId}?_t=${Date.now()}`;
            console.log('STREAM DEBUG: EventSource URL:', streamUrl);
            try {
                const source = new EventSource(streamUrl);
                console.log('STREAM DEBUG: EventSource created, readyState:', source.readyState,
                    '(0=connecting, 1=open, 2=closed)');
                console.log('STREAM DEBUG: Setting up EventSource handlers...');
                // Set connection timeout
                connectionTimeoutId = setTimeout(() => {
                    console.error('STREAM DEBUG: Timeout triggered - connection timed out after 10 seconds');
                    console.error('STREAM DEBUG: EventSource readyState at timeout:', source.readyState);
                    addStatusMessage('error', 'Stream connection timed out - will retry');
                    if (source && source.readyState !== 2) { // Not closed
                        console.log('STREAM DEBUG: Closing EventSource due to timeout');
                        source.close();
                    }
                    // Auto-retry after short delay with increasing backoff
                    if (!window.streamRetryCount) {
                        window.streamRetryCount = 0;
                    }
                    window.streamRetryCount++;
                    const backoffDelay = Math.min(window.streamRetryCount * 1000, 5000);
                    setTimeout(() => {
                        if (sessionId && !streaming) {
                            console.log(`STREAM DEBUG: Auto-retrying stream connection (attempt ${window.streamRetryCount})...`);
                            startStream();
                        }
                    }, backoffDelay);
                }, 10000);
                // Handle connection open
                source.onopen = () => {
                    console.log('STREAM DEBUG: EventSource.onopen fired! Connection succeeded.');
                    console.log('STREAM DEBUG: EventSource readyState in onopen:', source.readyState);
                    clearTimeout(connectionTimeoutId);
                    connectionTimeoutId = null;
                    // Reset retry count on successful connection
                    window.streamRetryCount = 0;
                    setStreamStatus('active');
                    setStreaming(true);
                    addStatusMessage('success', 'Stream connected successfully');
                };
                // Handle messages
                source.onmessage = (event) => {
                    console.log('STREAM DEBUG: Received message event:', event.type, 'Data length:', event.data?.length || 0);
                    // Process image data
                    if (event.data && event.data.startsWith('data:image')) {
                        console.log('STREAM DEBUG: Image received, length:', event.data.length);
                        setBrowserImage(event.data);
                    } else {
                        console.log('STREAM DEBUG: Received non-image data:', event.data);
                    }
                };
                // Handle specific events
                source.addEventListener('status', (event) => {
                    console.log('STREAM DEBUG: Received status event:', event.type, 'Data:', event.data);
                    try {
                        const data = JSON.parse(event.data);
                        console.log('STREAM DEBUG: Status update from stream:', data);
                        addStatusMessage(data.type || 'info', data.message || 'Stream update');
                    } catch (e) {
                        console.error('STREAM DEBUG: Error parsing status event:', e);
                    }
                });
                // Handle errors
                source.onerror = (error) => {
                    console.error('STREAM DEBUG: EventSource error:', error);
                    console.error('STREAM DEBUG: EventSource readyState in onerror:', source.readyState);
                    if (source.readyState === 2) { // CLOSED
                        console.error('STREAM DEBUG: EventSource connection CLOSED');
                        addStatusMessage('error', 'Stream connection closed by server');
                        if (connectionTimeoutId) {
                            clearTimeout(connectionTimeoutId);
                            connectionTimeoutId = null;
                        }
                        setStreaming(false);
                        setStreamStatus('error');
                        source.close();
                        // Try fallback polling
                        tryPollingFallback();
                    } else {
                        console.warn('STREAM DEBUG: EventSource error but connection still open');
                        addStatusMessage('warning', 'Stream connection error - will try to continue');
                    }
                };
                source.addEventListener('auth_error', async (event) => {
                    const data = JSON.parse(event.data || '{}');
                    if (data.code === 401 && !refreshAttemptedRef.current) {
                        refreshAttemptedRef.current = true;
                        let refreshed = false;
                        try {
                            await api.post('/api/refresh');
                            refreshed = true;
                        } catch (err) {
                            console.log('error getting token from refresh token', err)
                            refreshed = false;
                        }
                        if (refreshed) {
                            setTimeout(() => {
                                startStream({ isRetry: true });
                            }, 1000);
                        } else {
                            console.error('Token refresh failed. Logging out or stopping stream.');
                            setStreaming(false);
                            setStreamStatus('unauthorized');
                            source.close();
                        }
                    }
                });
                // Store reference for cleanup
                streamSourceRef.current = source;
                console.log('STREAM DEBUG: EventSource setup complete');
            } catch (err) {
                console.error('STREAM DEBUG: Error creating EventSource:', err);
                addStatusMessage('error', `Stream connection error: ${err.message}`);
                setStreamStatus('error');
                // Clear timeout
                if (connectionTimeoutId) {
                    clearTimeout(connectionTimeoutId);
                    connectionTimeoutId = null;
                }
                // Fall back to polling
                tryPollingFallback();
            }
        } catch (err) {
            console.error('STREAM DEBUG: Fatal error creating stream connection:', err);
            addStatusMessage('error', `Stream connection error: ${err.message}`);
            setStreamStatus('error');
            // Clear timeout
            if (connectionTimeoutId) {
                clearTimeout(connectionTimeoutId);
                connectionTimeoutId = null;
            }
            // Fall back to polling
            tryPollingFallback();
        }
    }, [sessionId, streaming, addStatusMessage, cleanupStream]);

      const reconnectToStream = useCallback(() => {
        console.log("Attempting to reconnect to stream...");

        // Close any existing connection if needed
        if (streamSourceRef.current) {
          streamSourceRef.current.close();
        }

        // Reinitialize the connection with a small delay
        setTimeout(() => {
          startStream();
        }, 1000);
      }, [startStream]);

    const resumeStream = useCallback(() => {
        if (sessionId && streamStatus === 'waiting') {
            console.log('STREAM DEBUG: Resuming stream from waiting state');
            // First clean up any existing stream connection
            cleanupStream();
            // Notify server to resume sending data
            try {
                api.post(`/api/stream-control`, {
                    sessionId: sessionId,
                    action: 'resume'
                }).catch(err => console.log('Server may not support stream resuming yet'));
                // Create a new stream connection
                setTimeout(() => {
                    console.log('STREAM DEBUG: Creating new stream connection after resume');
                    startStream({ isResume: true });
                }, 500);
                setStreamStatus('connecting');
            } catch (err) {
                console.error('Error in stream resume:', err);
                addStatusMessage('error', 'Failed to resume stream');
                setStreamStatus('error');
            }
        }
    }, [sessionId, streamStatus, cleanupStream, startStream, addStatusMessage]);

    const restartStream = useCallback(() => {
        addStatusMessage('info', 'Restarting stream connection...');
        stopStream();
        // Wait a short delay before restarting
        setTimeout(() => {
            // Check server health before restarting
            pingServer().then(isHealthy => {
                if (isHealthy) {
                    startStream();
                } else {
                    addStatusMessage('error', 'Cannot restart stream - server connection issues');
                }
            });
        }, 1000);
    }, [stopStream, startStream, pingServer, addStatusMessage]);

    /**
     * Auto-start stream when session is ready
     */
     useEffect(() => {
        // Prevent auto-start if in connecting status or no session
        if (!sessionId || streaming || streamStatus !== 'waiting') {
            console.log('STREAM DEBUG: Not auto-starting stream:', {
                hasSession: !!sessionId,
                isStreaming: streaming,
                streamStatus
            });
            return;
        }

        console.log('STREAM DEBUG: Auto-starting stream due to valid session:', sessionId);

        // Prevent duplicate start attempts - add a static flag
        if (window.streamStarting) {
            console.log('STREAM DEBUG: Stream start already in progress');
            return;
        }

        window.streamStarting = true;

        // Use a flag to ensure we only attempt to start the stream once
        let streamStartAttempted = false;
        let startTimerId = null;
        let fallbackTimerId = null;

        // Start with a shorter delay (2 seconds) to improve responsiveness
        startTimerId = setTimeout(() => {
            if (!streamStartAttempted && sessionId && !streaming && streamStatus === 'waiting') {
                console.log('STREAM DEBUG: Starting stream after delay');
                streamStartAttempted = true;

                // Call startStream directly
                startStream();

                // Immediately change the status to connecting to prevent flickering
                setStreamStatus('connecting');

                // Add a fallback in case start doesn't work
                fallbackTimerId = setTimeout(() => {
                    if (streamStatus !== 'active' && sessionId) {
                        console.log('STREAM DEBUG: Stream failed to start, falling back to screenshot polling');
                        tryPollingFallback();
                    }
                }, 15000); // Wait 15 seconds before assuming stream failed to start

                // Reset the static flag after a delay
                setTimeout(() => {
                    window.streamStarting = false;
                }, 5000);
            } else {
                window.streamStarting = false;
            }
        }, 2000); // Reduced from 3.5s to 2s

        return () => {
            if (startTimerId) clearTimeout(startTimerId);
            if (fallbackTimerId) clearTimeout(fallbackTimerId);
        };
    }, [sessionId, streaming, streamStatus, startStream, tryPollingFallback]);

    /**
     * Monitor server health when streaming
     */
    useEffect(() => {
        // Only run health monitoring when streaming is active
        if (!streaming || !sessionId) return;

        console.log('STREAM DEBUG: Starting server health monitoring');

        // Use a ref to track if a health check is already in progress
        const healthCheckInProgressRef = { current: false };
        // Track the last successful health check time
        const lastSuccessfulCheckRef = { current: Date.now() };
        // Track consecutive failures
        const consecutiveFailuresRef = { current: 0 };
        // Create a separate object to track last request time
        const lastRequestTimeRef = { current: 0 };
        // Track retry count in a ref object, not on the interval ID
        const retryCountRef = { current: 0 };

        // Check server health less frequently - every 30 seconds instead of 15
        const healthCheckInterval = setInterval(async () => {
            // Skip if another health check is already running
            if (healthCheckInProgressRef.current) {
                console.log('STREAM DEBUG: Health check already in progress, skipping');
                return;
            }

            // Mark health check as in progress
            healthCheckInProgressRef.current = true;

            // Add debouncing
            if (lastRequestTimeRef.current &&
                (Date.now() - lastRequestTimeRef.current < 15000)) {
                console.log('STREAM DEBUG: Health check too soon after previous check, skipping');
                healthCheckInProgressRef.current = false;
                return;
            }

            // Track this request time
            lastRequestTimeRef.current = Date.now();

            // Create a unique request ID to track this specific request
            const requestId = Date.now();
            console.log(`STREAM DEBUG: Starting health check #${requestId}`);

            // Create a new AbortController for this health check
            if (healthCheckControllerRef.current) {
                // Cancel previous request if it exists
                try {
                    healthCheckControllerRef.current.abort();
                    console.log('STREAM DEBUG: Cancelled previous health check request');
                } catch (e) {
                    console.error('Error cancelling previous health check:', e);
                }
            }

            // Create new controller
            healthCheckControllerRef.current = new AbortController();

            try {
                const response = await api.get(`/api/health?_t=${requestId}`,
                    {
                        timeout: 8000, // Increased timeout
                        signal: healthCheckControllerRef.current.signal,
                        headers: {
                            'X-Request-ID': `health-${requestId}`  // Add unique request ID
                        }
                    }
                );

                if (response.data && response.data.success) {
                    console.log(`STREAM DEBUG: Health check #${requestId} passed`);
                    lastSuccessfulCheckRef.current = Date.now();
                    consecutiveFailuresRef.current = 0; // Reset failure counter
                    // Reset retry count on success
                    retryCountRef.current = 0;
                } else {
                    console.warn(`STREAM DEBUG: Health check #${requestId} returned unexpected response`, response.data);
                    consecutiveFailuresRef.current++;
                }
            } catch (err) {
                // Check if this is a cancellation error (which we can safely ignore)
                if (err.name === 'AbortError' || err.name === 'CanceledError' || (axios.isCancel && axios.isCancel(err))) {
                    console.log(`STREAM DEBUG: Health check #${requestId} was cancelled, ignoring`);
                } else {
                    console.error(`STREAM DEBUG: Health check #${requestId} failed:`, err);

                    // Handle rate limiting with exponential backoff
                    if (err.response && err.response.status === 429) {
                        console.log('STREAM DEBUG: Health check rate limited (429)');

                        // Track retry count in the ref object
                        retryCountRef.current++;

                        // Calculate backoff delay (2s, 4s, 8s, 16s...)
                        const backoffDelay = Math.min(Math.pow(2, retryCountRef.current) * 1000, 30000);

                        console.log(`STREAM DEBUG: Will retry health check after ${backoffDelay}ms (attempt ${retryCountRef.current})`);

                        // Don't increment failure counter for rate limits
                    } else {
                        addStatusMessage('error', `Server connection error: ${err.message}`);
                        consecutiveFailuresRef.current++;

                        // Only restart stream if we have consecutive failures and more than 20 seconds since last success
                        const timeSinceLastSuccess = Date.now() - lastSuccessfulCheckRef.current;
                        if (streaming && consecutiveFailuresRef.current >= 3 && timeSinceLastSuccess > 20000) {
                            console.error('STREAM DEBUG: Multiple health check failures, triggering stream restart');
                            restartStream();
                            consecutiveFailuresRef.current = 0; // Reset after restart attempt
                        }
                    }
                }
            } finally {
                // Always mark health check as complete, even if it failed
                healthCheckInProgressRef.current = false;
            }
        }, 30000); // Increase interval from 15s to 30s

        // Clean up on unmount or when streaming stops
        return () => {
            clearInterval(healthCheckInterval);
            console.log('STREAM DEBUG: Stopping server health monitoring');

            // Abort any in-progress health check
            if (healthCheckControllerRef.current) {
                try {
                    healthCheckControllerRef.current.abort();
                    healthCheckControllerRef.current = null;
                } catch (e) {
                    console.error('Error aborting health check on cleanup:', e);
                }
            }
        };
    }, [sessionId, streaming, addStatusMessage, restartStream]);

    return {
        streamSourceRef,
        streaming,
        streamStatus,
        setStreamStatus,
        cleanupStream,
        stopStream,
        pingServer,
        restartStream,
        startStream,
        reconnectToStream,
        resumeStream
    };
};
    