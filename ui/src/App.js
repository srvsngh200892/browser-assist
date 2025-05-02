import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './App.css';
import SessionInfo from './SessionInfo'; // Import the SessionInfo component
import Login from './Login'; // Import the Login component
import ValidationReport from './ValidationReport'; // Import the ValidationReport component

// Set up axios interceptor to add auth token to all requests
axios.interceptors.request.use(
    config => {
        // Skip token for auth, health, and ping endpoints
        if (config.url.includes('/auth/') || config.url.includes('/health') || config.url.includes('/ping')) {
            return config;
        }

        // Get token from localStorage
        const token = localStorage.getItem('auth_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    error => {
        return Promise.reject(error);
    }
);

// Add response interceptor to handle auth errors
axios.interceptors.response.use(
    response => response,
    error => {
        // Handle 401 Unauthorized errors
        if (error.response && error.response.status === 401) {
            console.log('Authentication error - redirecting to login');
            // Clear auth data
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');

            // Force page reload to redirect to login
            window.location.reload();
        }
        return Promise.reject(error);
    }
);

// Server URL for backend
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

// Placeholder image for browser preview
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIiAvPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQwMCwzMDApIj4KICAgIDx0ZXh0IHg9IjAiIHk9Ii02MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmaWxsPSIjNmI0NmMxIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4KICAgICAgQnJvd3NlciBQcmV2aWV3CiAgICA8L3RleHQ+CiAgICA8dGV4dCB4PSIwIiB5PSItMTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzZjNzU3ZCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+CiAgICAgIE5vIGxpdmUgcHJldmlldyBhdmFpbGFibGUKICAgIDwvdGV4dD4KICAgIDx0ZXh0IHg9IjAiIHk9IjIwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2Yzc1N2QiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgogICAgICBDbGljayAiU3RhcnQgU3RyZWFtIiB0byBlbmFibGUgbGl2ZSBwcmV2aWV3CiAgICA8L3RleHQ+CiAgICA8dGV4dCB4PSIwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNmM3NTdkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4KICAgICAgb3IgIlJlZnJlc2ggU2NyZWVuc2hvdCIgdG8gdGFrZSBhIHNpbmdsZSBzY3JlZW5zaG90CiAgICA8L3RleHQ+CiAgPC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQwMCw1MDApIj4KICAgIDxjaXJjbGUgY3g9IjAiIGN5PSIwIiByPSIzMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNmI0NmMxIiBzdHJva2Utd2lkdGg9IjIiIC8+CiAgICA8dGV4dCB4PSIwIiB5PSI2IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM2YjQ2YzEiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgogICAgICA/CiAgICA8L3RleHQ+CiAgPC9nPgo8L3N2Zz4=';

// Defaults for the app
const POLL_INTERVAL = 10000; // Poll every 10 seconds - increased from 5s to 10s
// Add a debounce mechanism for API calls
const DEBOUNCE_DELAY = 1000; // 1 second debounce delay
// Add session creation retry constants
const SESSION_RETRY_KEY = 'session-creation-retry-count';
const SESSION_RETRY_TIMESTAMP_KEY = 'session-creation-last-attempt';
const SESSION_CACHE_KEY = 'last-valid-session-id';
const SESSION_MAX_RETRIES = 5; // Maximum number of retries in a short period
const SESSION_REQUEST_DEBOUNCE_KEY = 'session-request-debounce'; // Key for tracking recent requests
const SESSION_REQUEST_DEBOUNCE_TIME = 3000; // 3 seconds debounce time

/**
 * OpenAI MCP Client
 */
function App() {
    // Authentication state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);

    // Core state
    const [sessionId, setSessionId] = useState(null);
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: 'Welcome! I\'m here to help you with your questions and tasks. How can I assist you today?',
            id: 'welcome-message',
            is_welcome: true,  // Add a flag to clearly identify the welcome message
            created_at: new Date().toISOString()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [streamingContent, setStreamingContent] = useState(''); // For storing partial responses
    const [typingMessageIds, setTypingMessageIds] = useState([]); // For tracking which messages are in typing state

    // Preview state
    const [previewVisible, setPreviewVisible] = useState(true);
    const [browserImage, setBrowserImage] = useState(PLACEHOLDER_IMAGE); // For storing the browser preview image
    const [streaming, setStreaming] = useState(false);
    const [streamStatus, setStreamStatus] = useState('waiting');

    // Add state to track screenshot availability for validation report
    const [hasScreenshots, setHasScreenshots] = useState(false);
    const [screenshotCount, setScreenshotCount] = useState(0);

    // Status messages
    const [statusMessages, setStatusMessages] = useState([{
        type: 'info',
        text: 'Initializing...',
        time: new Date().toLocaleTimeString()
    }]);
    const [showTechnicalMessages, setShowTechnicalMessages] = useState(false);
    const [rateLimited, setRateLimited] = useState(false); // Add state for rate limiting
    const [reusingSession, setReusingSession] = useState(false); // Add state for session reuse

    // Refs for tracking state and timeouts
    const messagesRef = useRef([]);
    const loadingRef = useRef(false);
    const pollTimerRef = useRef(null);
    const typingTimerRef = useRef(null); // Add ref for typing animation timeout
    const messagesEndRef = useRef(null);
    const streamSourceRef = useRef(null);
    const sessionIdRef = useRef(null);
    const chatContainerRef = useRef(null);
    const inputRef = useRef(null); // Reference to input field for focusing
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [scrollButtonPosition, setScrollButtonPosition] = useState(typeof window !== 'undefined' ? window.innerHeight - 70 : 0); // Position from top

    // Constants
    const LOCAL_POLL_INTERVAL = 10000; // Using a local variable to avoid naming conflict

    // Add reference for health check controller
    const healthCheckControllerRef = useRef(null);

    // Last poll time reference to avoid adding properties to functions
    const lastPollTimeRef = useRef(0);

    // Add a ref to track if user has manually scrolled away from bottom
    const userScrolledAwayRef = useRef(false);

    // Update refs when state changes
    useEffect(() => {
        const prevMessages = messagesRef.current;
        messagesRef.current = messages;

        // Log message changes for debugging
        if (prevMessages.length !== messages.length) {
            console.log(`Messages state updated: ${prevMessages.length} -> ${messages.length} messages`);

            // Log the last message if available
            if (messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                console.log('Last message:', {
                    role: lastMsg.role,
                    content: lastMsg.content?.substring(0, 30) + (lastMsg.content?.length > 30 ? '...' : ''),
                    id: lastMsg.id
                });
            }
        }
    }, [messages]);

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    /**
     * Check if session has screenshots available for validation report
     */
    const checkScreenshotAvailability = useCallback(async () => {
        if (!sessionId) return;

        try {
            const response = await axios.get(`${SERVER_URL}/api/validation/status/${sessionId}`);

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

    // Check for screenshot availability when session ID changes or after some time interval
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
    }, [loading, checkScreenshotAvailability]);

    /**
     * Add a status message
     */
    const addStatusMessage = useCallback((type, text) => {
        const timeString = new Date().toLocaleTimeString();
        setStatusMessages(prev => {
            const newMessages = [...prev, { type, text, time: timeString }];
            return newMessages.length > 10 ? newMessages.slice(-10) : newMessages;
        });

        // Set the rate limited state if we detect a rate limit message
        if (type === 'error' && (
            text.includes('Rate limited') ||
            text.includes('Too many requests') ||
            text.includes('Too many session')
        )) {
            setRateLimited(true);
            // Auto-clear after 60 seconds
            setTimeout(() => {
                setRateLimited(false);
            }, 60000);
        }
    }, []);

    /**
     * Remove all message history when starting a new session
     */
    const clearMessageHistory = useCallback(() => {
        if (sessionId) {
            localStorage.removeItem(`lastTimestamp-${sessionId}`);
            console.log(`Cleared message timestamp for session ${sessionId}`);
        }
    }, [sessionId]);

    /**
     * Take a screenshot
     */
    const takeScreenshot = useCallback(async () => {
        if (!sessionIdRef.current) return;

        try {
            const response = await axios.get(`${SERVER_URL}/api/screenshot`, {
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

    /**
     * Basic stream cleanup (separate from full stopStream)
     */
    const cleanupStream = useCallback(() => {
        if (streamSourceRef.current) {
            try {
                console.log('Closing stream connection');

                // Close the EventSource
                if (streamSourceRef.current.close) {
                    streamSourceRef.current.close();
                }

                // Notify server about disconnection
                const currentSession = sessionIdRef.current;
                if (currentSession) {
                    axios.post(`${SERVER_URL}/api/stream-disconnect`, {
                        sessionId: currentSession,
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
    }, []);

    /**
     * Authentication helper functions
     */
    const handleLoginSuccess = useCallback((userData) => {
        setUser(userData);
        setIsAuthenticated(true);

        // Immediately set session ID from localStorage after login
        const loginSessionId = localStorage.getItem('session_id');
        if (loginSessionId) {
            console.log('LOGIN DEBUG: Setting session ID immediately after login:', loginSessionId);
            setSessionId(loginSessionId);
        } else {
            console.warn('LOGIN DEBUG: No session ID found in localStorage after login');
        }
    }, [setSessionId]);


    const handleLogout = useCallback((deleteData = true) => {
        // Get the current session ID
        const currentSessionId = sessionIdRef.current;
        console.log('LOGOUT DEBUG: Current session ID:', currentSessionId);

        if (currentSessionId) {
            // Call the server logout endpoint with only the necessary data
            try {
                axios.post(`${SERVER_URL}/api/logout`, {
                    sessionId: currentSessionId,
                    deleteData: !!deleteData // Ensure boolean
                }, {
                    // Add headers to ensure proper content type
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }).then(() => {
                    console.log(`Logout successful on server${deleteData ? ' (with data deletion)' : ''}`);
                }).catch(error => {
                    // Log only the error message and status
                    console.error('Error during server logout:', error.message || 'Unknown error');
                }).finally(() => {
                    // Continue with local cleanup regardless of server response
                    performLocalLogout();
                });
            } catch (error) {
                console.error('Error during logout process:', error.message || 'Unknown error');
                performLocalLogout(); // Still clean up locally on error
            }
        } else {
            // No session ID, just do local logout
            performLocalLogout();
        }

        // Function to handle the local logout process
        function performLocalLogout() {
            // Clean up any active streams
            cleanupStream();

            // Clear all localStorage items
            localStorage.clear();

            // Reset app state
            setUser(null);
            setIsAuthenticated(false);
            setSessionId(null);
        }
    }, [cleanupStream, SERVER_URL]);



    // Check for authentication on initial load
    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user');

        if (token && userData) {
            try {
                setUser(JSON.parse(userData));
                setIsAuthenticated(true);
            } catch (e) {
                console.error('Error parsing user data', e);
                handleLogout();
            }
        }
    }, [handleLogout]);

    /**
     * Initialize session
     */
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
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            if (streamSourceRef.current) streamSourceRef.current.close();
        };
    }, [isAuthenticated, setSessionId, setStreamStatus, takeScreenshot]);

    /**
     * Poll for message updates
     * 
     * The server should implement an 'isDone' flag in the response to indicate
     * when the full response has been generated and polling can stop.
     * 
     * Example server response:
     * {
     *   success: true,
     *   messages: [...],
     *   isDone: true|false,
     *   timestamp: 1234567890123 // New timestamp from Firebase for next poll
     * }
     * 
     * If isDone is not provided, the client falls back to using heuristics to determine completion.
     */
    const pollForMessages = useCallback(async () => {

        // Always clear any existing timer first to prevent duplicates
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
            console.log('POLL: Cleared existing poll timer');
        }

        // Exit if no session
        if (!sessionId) {
            console.log('POLL: Stopped - No sessionId available');
            return;
        }

        // Initialize an empty response variable to be accessible throughout the function
        let response = { data: { isDone: false } };

        try {
            console.log('POLL: Fetching messages from server...');

            // Get the last timestamp from localStorage if available
            const lastTimestamp = localStorage.getItem(`lastTimestamp-${sessionId}`);
            let url = `${SERVER_URL}/api/messages/${sessionId}`;

            // Add timestamp parameter if we have a previous timestamp
            if (lastTimestamp) {
                url += `?since=${lastTimestamp}`;
            }

            response = await axios.get(url, { timeout: 5000 });

            if (response.data.success) {
                // Store the new timestamp for next poll
                if (response.data.timestamp) {
                    localStorage.setItem(`lastTimestamp-${sessionId}`, response.data.timestamp);
                    console.log(`POLL: Updated timestamp to ${response.data.timestamp}`);
                }

                if (response.data.messages && response.data.messages.length > 0) {
                    const serverMessages = response.data.messages;
                    const currentMessages = messagesRef.current;

                    console.log('POLL: Received messages', {
                        server: serverMessages.length,
                        client: currentMessages.length,
                        loading: loadingRef.current,
                        isDone: response.data.isDone
                    });

                    // Check if the last message is from the user - if so, we should continue polling
                    const lastUserIndex = currentMessages.findIndex(m => m.role === 'user');
                    const lastAssistantIndex = currentMessages.findIndex(m => m.role === 'assistant');
                    const lastMessageIsUser = lastUserIndex > lastAssistantIndex;

                    if (lastMessageIsUser && !loadingRef.current) {
                        console.log('POLL: Last message is from user but loading is false - forcing loading to true');
                        setLoading(true);
                        loadingRef.current = true;
                    }

                    // Filter out system messages if not showing technical messages
                    const filteredMessages = serverMessages.filter(msg => {
                        if (msg.role === 'system' && !showTechnicalMessages) {
                            return false;
                        }

                        // Skip welcome message handling (keep existing logic)
                        if (msg.role === 'assistant' &&
                            (msg.is_welcome ||
                                msg.id === 'welcome-message' ||
                                msg.content?.includes('Welcome! I\'m here to help you with your questions'))) {
                            console.log('POLL: Skipping welcome message from server');
                            return false;
                        }

                        // Skip any welcome-like messages if we already have other messages
                        if (msg.role === 'assistant' &&
                            msg.content?.includes('Welcome') &&
                            msg.content?.includes('assist you') &&
                            currentMessages.length > 1) {
                            console.log('POLL: Skipping welcome-like message from server since conversation has started');
                            return false;
                        }

                        return true;
                    });

                    if (filteredMessages.length > 0) {
                        // If we're getting only new messages (with 'since' parameter)
                        if (lastTimestamp) {
                            // First, remove any typing indicators
                            const currentMessagesWithoutTyping = currentMessages.filter(m => !m.is_typing);

                            // Append the new messages to existing ones
                            const updatedMessages = [...currentMessagesWithoutTyping, ...filteredMessages];

                            // Sort by timestamp if available
                            updatedMessages.sort((a, b) => {
                                if (a.created_at && b.created_at) {
                                    return new Date(a.created_at) - new Date(b.created_at);
                                }
                                return 0;
                            });

                            // Apply deduplication before updating state
                            const dedupedMessages = deduplicateMessages(updatedMessages);

                            // Check if we need to add a typing indicator at the end
                            if (loadingRef.current && !dedupedMessages.some(m => m.is_typing)) {
                                // Check if the last message is from an assistant and complete
                                const lastMsg = dedupedMessages[dedupedMessages.length - 1];
                                const responseIsComplete = lastMsg &&
                                    lastMsg.role === 'assistant' &&
                                    lastMsg.finish_reason === 'stop';

                                // Only add typing indicator if response is not complete
                                if (!responseIsComplete) {
                                    const typingId = `typing-${Date.now()}`;
                                    const typingMessage = {
                                        id: typingId,
                                        role: 'assistant',
                                        content: '',
                                        is_typing: true,
                                        created_at: new Date().toISOString()
                                    };

                                    // Add typing indicator at the end
                                    dedupedMessages.push(typingMessage);

                                    // Add to typing IDs
                                    setTypingMessageIds(prev =>
                                        [...prev.filter(id => id !== typingId), typingId]
                                    );
                                }
                            }

                            // Update the messages state
                            setMessages(dedupedMessages);
                            messagesRef.current = dedupedMessages;
                            console.log('POLL: Appended new messages, updated count:', dedupedMessages.length);

                            // Check for new assistant messages that should get a typing animation
                            const newAssistantMessages = filteredMessages.filter(msg =>
                                msg.role === 'assistant' &&
                                !msg.is_welcome &&
                                !msg.is_typing &&
                                msg.id !== 'welcome-message' &&
                                !typingMessageIds.includes(msg.id)
                            );

                            // Add typing animation for new messages
                            if (newAssistantMessages.length > 0) {
                                handleNewAssistantMessages(newAssistantMessages);
                            }

                            // Clear typing indicators if we received a real assistant message with content
                            const hasCompleteAssistantMessage = filteredMessages.some(msg =>
                                msg.role === 'assistant' &&
                                !msg.is_typing &&
                                msg.content &&
                                msg.content.trim() !== '' &&
                                msg.finish_reason === 'stop'
                            );

                            if (hasCompleteAssistantMessage) {
                                // Clear typing message IDs
                                setTypingMessageIds([]);
                                if (typingTimerRef.current) {
                                    clearTimeout(typingTimerRef.current);
                                    typingTimerRef.current = null;
                                }
                            }
                        } else {
                            // First load - handle welcome message logic
                            const allMessages = [...filteredMessages];

                            // Handle welcome message
                            const welcomeIndex = allMessages.findIndex(m =>
                                m.is_welcome ||
                                m.id === 'welcome-message' ||
                                (m.role === 'assistant' && m.content?.includes('Welcome! I\'m here to help you with your questions'))
                            );

                            if (welcomeIndex >= 0) {
                                const welcomeMsg = allMessages.splice(welcomeIndex, 1)[0];

                                // Only show welcome if it's the only message
                                if (allMessages.length === 0) {
                                    allMessages.unshift(welcomeMsg);
                                }
                            }

                            // Set messages
                            setMessages(allMessages);
                            messagesRef.current = allMessages;
                            console.log('POLL: Set initial messages, count:', allMessages.length);
                        }

                        // Update streaming content from the last assistant message
                        const lastAssistantMessage = filteredMessages
                            .filter(msg => msg.role === 'assistant')
                            .pop();

                        if (lastAssistantMessage?.content) {
                            setStreamingContent(lastAssistantMessage.content);
                            console.log('POLL: Updated streaming content from assistant');
                        }
                    }
                }

                // Check if server explicitly signals that the response is complete
                if (response.data.isDone === true) {
                    console.log('POLL: Server signaled response is complete (isDone=true), stopping polling');

                    // Store in localStorage that this conversation is complete
                    const responseCompleteKey = `response-complete-${sessionId}`;
                    localStorage.setItem(responseCompleteKey, 'true');

                    // Set loading to false
                    setLoading(false);
                    loadingRef.current = false;
                    setStreamingContent('');
                    addStatusMessage('success', 'Response complete');

                    // Clear all typing indicators
                    setTypingMessageIds([]);
                    setMessages(current => current.filter(m => !m.is_typing));
                    if (typingTimerRef.current) {
                        clearTimeout(typingTimerRef.current);
                        typingTimerRef.current = null;
                    }

                    // Don't stop stream completely, just pause it (switch to "waiting" state)
                    if (streaming) {
                        // Let server know to pause sending updates (with error handling)
                        try {
                            axios.post(`${SERVER_URL}/api/stream-control`, {
                                sessionId: sessionId,
                                action: 'pause',
                                reason: 'response_complete'
                            }).catch(err => console.log('Server may not support stream pausing yet'));
                            console.log('POLL: Pausing stream since response is complete');
                            setStreamStatus('waiting');
                        } catch (err) {
                            console.error('Error in stream pause notification:', err);
                        }
                    }

                    // No need to schedule further polling - explicitly clear any existing timer
                    if (pollTimerRef.current) {
                        clearTimeout(pollTimerRef.current);
                        pollTimerRef.current = null;
                    }

                    console.log('POLL: Polling stopped - isDone flag received from server');
                    return;
                } else if (response.data.isDone === false) {
                    // Explicitly mark as not done if server says so
                    console.log('POLL: Server signaled response is not complete (isDone=false), continuing polling');
                    loadingRef.current = true; // Ensure we keep polling
                }

            } else {
                console.warn('POLL: Server returned invalid data structure');
            }
        } catch (err) {
            console.error('POLL: Error polling for messages:', err);
            addStatusMessage('error', `Polling error: ${err.message}`);
        }

        // IMPORTANT: Always schedule next poll if:
        // 1. We're in loading state OR
        // 2. The last message is from the user
        const currentMessages = messagesRef.current || [];
        const lastMessage = currentMessages.length > 0 ? currentMessages[currentMessages.length - 1] : null;
        const lastIsUser = lastMessage?.role === 'user';

        // Track if we've received a isDone=true response from the server for this conversation
        // Store this in localStorage to persist across page refreshes
        const responseCompleteKey = `response-complete-${sessionId}`;
        const serverMarkedComplete = localStorage.getItem(responseCompleteKey) === 'true';

        // If server explicitly marked the response as complete (isDone=true), update our local tracking
        if (response?.data?.isDone === true) {
            localStorage.setItem(responseCompleteKey, 'true');
            console.log('POLL: Server indicated isDone=true, marking conversation as complete');
        }

        // Check if we have a completed assistant response after the last user message
        const hasCompletedResponse = (() => {
            // If server explicitly said we're done, respect that first
            if (serverMarkedComplete || response?.data?.isDone === true) {
                return true;
            }

            if (!lastIsUser) {
                // If the last message is from the assistant and has a finish_reason of "stop", 
                // we consider the response complete
                return lastMessage?.role === 'assistant' && lastMessage?.finish_reason === 'stop';
            }
        })();

        // Add debouncing for polls
        if (lastPollTimeRef.current && (Date.now() - lastPollTimeRef.current < LOCAL_POLL_INTERVAL / 2)) {
            console.log(`POLL: Throttling poll requests - last poll was ${Date.now() - lastPollTimeRef.current}ms ago`);
            // Schedule at a slightly longer interval to desynchronize
            pollTimerRef.current = setTimeout(pollForMessages, LOCAL_POLL_INTERVAL * 1.5);
            return;
        }

        // Update last poll time
        lastPollTimeRef.current = Date.now();

        // Continue polling if:
        // 1. Server has NOT indicated isDone=true (most important condition)
        // 2. AND either:
        //    a. We're in loading state OR
        //    b. The last message is from the user AND we don't have a completed response
        const shouldContinuePolling =
            // First check if server has explicitly said we're done via the isDone flag or localStorage
            !serverMarkedComplete && response?.data?.isDone !== true &&
            // Then check if we need to continue polling based on the conversation state
            (loadingRef.current || (!hasCompletedResponse));

        if (shouldContinuePolling && sessionId) {
            console.log(`POLL: Scheduling next poll in ${LOCAL_POLL_INTERVAL}ms (loading: ${loadingRef.current}, lastIsUser: ${lastIsUser}, hasCompletedResponse: ${hasCompletedResponse}, serverMarkedComplete: ${serverMarkedComplete}, isDone: ${response?.data?.isDone})`);
            pollTimerRef.current = setTimeout(pollForMessages, LOCAL_POLL_INTERVAL);
        } else {
            console.log('POLL: Not scheduling next poll - response is complete', {
                serverMarkedComplete,
                isDone: response?.data?.isDone,
                loading: loadingRef.current,
                lastIsUser,
                hasCompletedResponse
            });
            // Ensure loading state is false when we stop polling
            if (loadingRef.current) {
                setLoading(false);
                loadingRef.current = false;
            }
        }
    }, [addStatusMessage, sessionId, setLoading, setMessages, setStreamingContent, showTechnicalMessages, LOCAL_POLL_INTERVAL, typingMessageIds]);

    /**
     * Handle new assistant messages and apply typing animation
     */
    const handleNewAssistantMessages = useCallback((newMessages) => {
        console.log('TYPING: Found new assistant messages for typing animation:', newMessages.length);

        // For each new assistant message, add it to typingMessageIds
        const newTypingIds = newMessages
            .filter(msg =>
                !msg.is_welcome &&
                msg.id !== 'welcome-message' &&
                !msg.content?.includes('Welcome! I\'m here to help you with your questions')
            )
            .map(msg => msg.id || `assistant-${Date.now()}`);

        // Set the typing message IDs
        setTypingMessageIds(prev => {
            // Filter out any existing typing IDs to avoid duplicates
            const existingIds = prev.filter(id => !newTypingIds.includes(id));
            return [...existingIds, ...newTypingIds];
        });

        // Clear any existing typing timer first to prevent rapid flickering
        if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = null;
        }

        // After a delay, remove the typing animation from new messages
        typingTimerRef.current = setTimeout(() => {
            console.log('TYPING: Removing typing animation for new messages');
            setTypingMessageIds(prev =>
                prev.filter(id => !newTypingIds.includes(id))
            );
            typingTimerRef.current = null;
        }, 1500);
    }, [setTypingMessageIds]);

    /**
     * Helper function to deduplicate messages - no longer needed with Firebase
     * Keeping as a no-op function to avoid changing all references
     */
    const deduplicateMessages = useCallback((messages) => {
        // Create a simple map to track seen messages
        const seen = new Map();
        const result = [];

        // Process messages in order
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            // For other messages, prefer ID if available
            const key = msg.tool_call_id ?
                `${msg.role}:${msg.tool_call_id}` :
                msg.id ?
                    `${msg.role}:${msg.id}` :
                    `${msg.role}:${msg.created_at || Date.now()}`;

            // If we haven't seen this message yet, add it to the result
            if (!seen.has(key)) {
                seen.set(key, true);
                result.push(msg);
            } else {
                console.log(`DEDUP: Removed duplicate message with role ${msg.role}`);
            }
        }

        // Log deduplication results
        if (messages.length !== result.length) {
            console.log(`DEDUP: Removed ${messages.length - result.length} duplicate messages`);
        }

        return result;
    }, []);


    /**
     * Start polling when loading state changes
     */
    useEffect(() => {
        // When loading becomes true, ensure we start polling
        if (loading && sessionId) {
            console.log('EFFECT: Loading ON - Starting polling');

            // Keep ref in sync with state
            loadingRef.current = true;

            // Clear any existing timer and start a new poll cycle
            if (pollTimerRef.current) {
                clearTimeout(pollTimerRef.current);
                pollTimerRef.current = null;
            }

            // Start polling immediately 
            pollForMessages();

            return () => {
                if (pollTimerRef.current) {
                    clearTimeout(pollTimerRef.current);
                    pollTimerRef.current = null;
                }
            };
        } else if (!loading) {
            // Keep ref in sync with state
            loadingRef.current = false;

            // If last message is from user, we should restart loading
            const lastMessage = messagesRef.current?.length > 0
                ? messagesRef.current[messagesRef.current.length - 1]
                : null;

            if (lastMessage?.role === 'user') {
                console.log('EFFECT: Last message is from user but loading is off - restarting polling');
                setTimeout(() => {
                    setLoading(true);
                    // Start polling directly instead of waiting for next effect cycle
                    pollForMessages();
                }, 100);
            }
        }
    }, [loading, sessionId, pollForMessages, setLoading, messagesRef]);

    /**
     * Handle session expiration
     */
    const handleSessionExpired = useCallback(async () => {
        // Prevent multiple concurrent session creation attempts
        if (handleSessionExpired.isCreating) {
            console.log('SESSION EXPIRED: Session recreation already in progress, skipping duplicate attempt');
            return;
        }

        // Check if a session request was made recently
        try {
            const lastRequestTime = parseInt(localStorage.getItem(SESSION_REQUEST_DEBOUNCE_KEY) || '0', 10);
            const now = Date.now();
            // If a request was made in the last 3 seconds
            if (now - lastRequestTime < SESSION_REQUEST_DEBOUNCE_TIME) {
                console.log(`SESSION EXPIRED: Session request made ${now - lastRequestTime}ms ago, skipping duplicate request`);

                // Try to use cached session if available
                const cachedSession = localStorage.getItem(SESSION_CACHE_KEY);
                if (cachedSession) {
                    console.log('SESSION EXPIRED: Using cached session due to debounce:', cachedSession);
                    setSessionId(cachedSession);
                    addStatusMessage('info', 'Reusing previous session due to rate limiting');
                    setError('Reusing previous session. Please try again.');

                    // Set reusing session state to show a notification
                    setReusingSession(true);
                    // Auto-clear after a delay
                    setTimeout(() => {
                        setReusingSession(false);
                    }, 5000);

                    return;
                }

                addStatusMessage('warning', 'Too many session requests, please wait a moment');
                setError('Too many session requests. Please wait a moment before trying again.');
                return;
            }

            // Mark that we're making a request now
            localStorage.setItem(SESSION_REQUEST_DEBOUNCE_KEY, Date.now().toString());
            console.log('SESSION EXPIRED: Marked session request timestamp');
        } catch (e) {
            console.error('Error with session request debounce in handleSessionExpired:', e);
        }

        handleSessionExpired.isCreating = true;

        setError('Session expired. Creating a new session...');
        setSessionId(null);
        setLoading(false);

        // Reset the browser image to the placeholder when session expires
        setBrowserImage(PLACEHOLDER_IMAGE);

        // If we were streaming, stop it
        if (streaming) {
            stopStream();
        }

        // Check if we've hit the retry limit (reusing the checkRetryLimits logic)
        const retryCount = parseInt(localStorage.getItem(SESSION_RETRY_KEY) || '0', 10);
        const lastRetryTimestamp = parseInt(localStorage.getItem(SESSION_RETRY_TIMESTAMP_KEY) || '0', 10);
        const now = Date.now();
        const tooManyRetries = (now - lastRetryTimestamp < 60000 && retryCount >= SESSION_MAX_RETRIES);

        if (tooManyRetries) {
            console.log('SESSION EXPIRED: Too many session creation attempts in short period');
            setError('Too many session recreation attempts. Please wait a moment before trying again.');
            addStatusMessage('error', 'Rate limited: Please wait 60 seconds before trying again');

            // Still increment the counter
            try {
                const currentCount = parseInt(localStorage.getItem(SESSION_RETRY_KEY) || '0', 10);
                localStorage.setItem(SESSION_RETRY_KEY, (currentCount + 1).toString());
                localStorage.setItem(SESSION_RETRY_TIMESTAMP_KEY, Date.now().toString());
            } catch (e) {
                console.error('Error incrementing retry counter:', e);
            }

            setTimeout(() => {
                handleSessionExpired.isCreating = false;
            }, 5000);
            return;
        }

        // Increment retry counter in localStorage
        try {
            const currentCount = parseInt(localStorage.getItem(SESSION_RETRY_KEY) || '0', 10);
            localStorage.setItem(SESSION_RETRY_KEY, (currentCount + 1).toString());
            localStorage.setItem(SESSION_RETRY_TIMESTAMP_KEY, Date.now().toString());
            console.log(`SESSION EXPIRED: Incremented retry counter to ${currentCount + 1}`);
        } catch (e) {
            console.error('Error incrementing retry counter:', e);
        }

        try {
            // Add a small delay to prevent rapid requests
            await new Promise(resolve => setTimeout(resolve, 1000));

            const response = await axios.post(`${SERVER_URL}/api/session`, {}, {
                timeout: 10000,  // 10 second timeout
            });

            if (response.data.success) {
                // Cache the successful session ID
                try {
                    localStorage.setItem(SESSION_CACHE_KEY, response.data.sessionId);
                    console.log('SESSION EXPIRED: Cached new session ID:', response.data.sessionId);
                } catch (e) {
                    console.error('Error caching session ID:', e);
                }

                setSessionId(response.data.sessionId);
                addStatusMessage('system', `New session created: ${response.data.sessionId}`);
                setError('Session recreated. Please send your message again.');
            } else {
                setError(`Failed to create new session: ${response.data.error}`);
            }
        } catch (err) {
            console.error('SESSION EXPIRED: Error creating new session:', err);

            // Handle rate limiting with special message
            if (err.response && err.response.status === 429) {
                setError('Too many requests. Please wait a moment before trying again.');
                addStatusMessage('error', 'Rate limited when creating session. Please wait a moment.');

                // Set the rate limited state
                setRateLimited(true);
                // Auto-clear after a delay
                setTimeout(() => {
                    setRateLimited(false);
                }, 60000);

                // Try to use a cached session as fallback
                try {
                    const cachedSession = localStorage.getItem(SESSION_CACHE_KEY);
                    if (cachedSession) {
                        console.log('SESSION EXPIRED: Attempting to use cached session after rate limit:', cachedSession);

                        // Verify the cached session
                        const verifyResponse = await axios.get(`${SERVER_URL}/api/health?sessionId=${cachedSession}`)
                            .catch(e => null);

                        if (verifyResponse && verifyResponse.data && verifyResponse.data.success) {
                            console.log('SESSION EXPIRED: Cached session is valid, using it');
                            setSessionId(cachedSession);
                            addStatusMessage('info', 'Using previous session due to rate limiting');
                            setError('Using previous session. Please try again.');
                        }
                    }
                } catch (cacheErr) {
                    console.error('SESSION EXPIRED: Error using cached session:', cacheErr);
                }
            } else {
                setError(`Failed to create new session: ${err.message}`);
            }
        } finally {
            // Clear flag after delay
            setTimeout(() => {
                handleSessionExpired.isCreating = false;
            }, 5000); // Increased from 3s to 5s
        }
    }, [addStatusMessage]);

    /**
     * Start browser stream
     */
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
                        // Try fallback polling
                        tryPollingFallback();
                    } else {
                        console.warn('STREAM DEBUG: EventSource error but connection still open');
                        addStatusMessage('warning', 'Stream connection error - will try to continue');
                    }
                };

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

    /**
     * Resume stream when user sends a new message
     */
    const resumeStream = useCallback(() => {
        if (sessionId && streamStatus === 'waiting') {
            console.log('STREAM DEBUG: Resuming stream from waiting state');

            // First clean up any existing stream connection
            cleanupStream();

            // Notify server to resume sending data
            try {
                axios.post(`${SERVER_URL}/api/stream-control`, {
                    sessionId: sessionId,
                    action: 'resume'
                }).catch(err => console.log('Server may not support stream resuming yet'));

                // Create a new stream connection
                setTimeout(() => {
                    console.log('STREAM DEBUG: Creating new stream connection after resume');
                    startStream({ isResume: true });
                }, 500);

                setStreamStatus('connecting');
                const responseCompleteKey = `response-complete-${sessionId}`;
                localStorage.removeItem(responseCompleteKey);
            } catch (err) {
                console.error('Error in stream resume:', err);
                addStatusMessage('error', 'Failed to resume stream');
                setStreamStatus('error');
            }
        }
    }, [sessionId, streamStatus, setStreamStatus, cleanupStream, startStream, addStatusMessage]);


    /**
     * Handle sending a message
     */
    const handleSendMessage = useCallback(async (message) => {
        if (!message) return;

        console.log('SEND: Starting to send message');

        // Resume stream if in waiting state
        resumeStream();

        // Reset scroll position tracking to ensure auto-scroll works for new messages
        userScrolledAwayRef.current = false;

        // Reset any "response complete" flags when sending a new message
        // This ensures polling will restart properly
        if (sessionId) {
            const responseCompleteKey = `response-complete-${sessionId}`;
            localStorage.removeItem(responseCompleteKey);
            console.log('SEND: Cleared response complete flag to restart polling for new user message');
            console.log('SEND: This will force polling to resume regardless of previous isDone state');

            // Also restart streaming if it was stopped and is not currently active
            if (!streaming && streamStatus !== 'connecting') {
                console.log('SEND: Restarting browser stream for new user message');
                // Short delay to allow other operations to complete first
                setTimeout(() => {
                    startStream();
                }, 500);
            }
        }

        // Set loading state immediately to ensure polling starts
        setLoading(true);
        loadingRef.current = true;

        // Reset streaming content
        setStreamingContent('');

        // Create a unique message ID
        const messageId = `user-${Date.now()}`;
        const userMessage = {
            id: messageId,
            role: 'user',
            content: message
        };

        // Update messages by appending the new message, but handle welcome message special case
        const currentMessages = [...messagesRef.current];

        // Always remove the welcome message when a user sends any message
        const welcomeIndex = currentMessages.findIndex(m =>
            m.is_welcome ||
            m.id === 'welcome-message' ||
            (m.role === 'assistant' && m.content?.includes('Welcome! I\'m here to help you with your questions'))
        );

        if (welcomeIndex >= 0) {
            // Remove the welcome message
            currentMessages.splice(welcomeIndex, 1);
        }

        currentMessages.push(userMessage);

        // Clear any typing indicators
        const updatedMessages = currentMessages.filter(m => !m.is_typing);

        // Update messages state
        setMessages(updatedMessages);
        messagesRef.current = updatedMessages;

        // Clear typing indicators state
        setTypingMessageIds([]);
        if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = null;
        }

        // Force immediate polling - critical step
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }

        // Start polling now with zero delay
        pollTimerRef.current = setTimeout(pollForMessages, 0);

        try {
            // Check session and create if needed
            if (!sessionId) {
                // If creating a new session, clear any stored timestamp
                clearMessageHistory();

                await handleSessionExpired();
                if (!sessionId) {
                    throw new Error('Session creation failed');
                }
            }

            // Send message to server
            console.log('SEND: Sending message to server');
            await axios.post(`${SERVER_URL}/api/chat/${sessionId}`, {
                userMessage
            });
            console.log('SEND: Message sent successfully');

            // Ensure loading state is still true after API call
            if (!loadingRef.current) {
                console.log('SEND: Loading state was lost, restoring');
                setLoading(true);
                loadingRef.current = true;
            }

            // Force polling again after server request completes
            if (pollTimerRef.current) {
                clearTimeout(pollTimerRef.current);
            }
            pollForMessages();

            // Set up an animation timer to show typing effect for the response
            setTimeout(() => {
                if (loadingRef.current) {
                    const typingId = `typing-${Date.now()}`;
                    console.log('SEND: Adding typing animation with ID:', typingId);

                    // Clear any existing typing timer to prevent conflicts
                    if (typingTimerRef.current) {
                        clearTimeout(typingTimerRef.current);
                        typingTimerRef.current = null;
                    }

                    // Add a placeholder message with typing animation
                    const placeholderMessage = {
                        id: typingId,
                        role: 'assistant',
                        content: '',
                        is_typing: true,
                        created_at: new Date().toISOString()
                    };

                    // Make sure we don't have any existing typing messages before adding new ones
                    // And ensure the typing message is always at the end of the list
                    setMessages(currentMessages => {
                        // First remove any existing typing messages
                        const messagesWithoutTyping = currentMessages.filter(m => !m.is_typing);
                        // Then add the new typing message at the end
                        return [...messagesWithoutTyping, placeholderMessage];
                    });

                    // Also add the id to typing message ids
                    setTypingMessageIds(prev => [...prev.filter(id => id !== typingId), typingId]);

                    // Auto-remove the placeholder after a maximum of 5 seconds to prevent it 
                    // from staying on screen permanently (reduced from 8s to 5s)
                    typingTimerRef.current = setTimeout(() => {
                        console.log('SEND: Auto-removing typing animation after 5s');

                        // Remove typing ID from state
                        setTypingMessageIds(prev => prev.filter(id => id !== typingId));

                        // Also explicitly remove the placeholder message
                        setMessages(currentMessages =>
                            currentMessages.filter(m => !m.is_typing)
                        );

                        typingTimerRef.current = null;
                    }, 5000);
                }
            }, 100); // Make this faster so typing shows up more quickly

            // Set a backup timer to ensure polling continues
            setTimeout(() => {
                if (sessionId) {
                    console.log('SEND: Backup poll timer triggered');
                    pollForMessages();
                }
            }, 5000);

        } catch (err) {
            console.error('SEND: Error sending message:', err);
            setLoading(false);
            loadingRef.current = false;

            if (err.response && err.response.status === 404) {
                addStatusMessage('error', 'Session expired, creating a new one...');
                // Clear message history for expired session
                clearMessageHistory();
                await handleSessionExpired();
            } else {
                addStatusMessage('error', `Failed to send message: ${err.message}`);
            }
        }

        // After sending a message, always reset userScrolledAway flag to ensure scroll
        userScrolledAwayRef.current = false;
    }, [sessionId, setLoading, setMessages, setStreamingContent, pollForMessages, handleSessionExpired, addStatusMessage, clearMessageHistory, resumeStream, streaming, streamStatus]);

    /**
     * Fall back to polling
     */
    const tryPollingFallback = useCallback(() => {
        console.log('Using screenshot polling as fallback');
        addStatusMessage('info', 'Using screenshot polling instead of streaming');
        setStreaming(false);
        setStreamStatus('inactive');

        // Reset the browser image to the placeholder initially
        setBrowserImage(PLACEHOLDER_IMAGE);

        // Take an immediate screenshot
        takeScreenshot();

        // Set up polling interval
        const pollInterval = setInterval(() => {
            if (sessionIdRef.current) {
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
    }, [addStatusMessage, takeScreenshot]);

    /**
     * Stop browser stream
     */
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

    /**
     * Ping server to check connection
     */
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
            const response = await axios.get(
                `${SERVER_URL}/api/health?_t=${requestId}`,
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

    /**
     * Restart stream with clean connection
     */
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
     * Manual scroll to bottom function
     */
    const scrollToBottom = useCallback(() => {
        if (chatContainerRef.current) {
            // Smooth scroll to the very bottom
            const container = chatContainerRef.current;
            if (container) {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });

                // Reset the user scrolled flag after manual scroll
                userScrolledAwayRef.current = false;

                // Hide scroll button after scrolling completes
                setTimeout(() => {
                    const { scrollTop, scrollHeight, clientHeight } = container;
                    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
                    setShowScrollButton(!isAtBottom);
                }, 500);
            }
        }
    }, []);

    /**
     * Handle chat container scroll to show/hide scroll button
     */
    const handleChatScroll = useCallback(() => {
        if (!chatContainerRef.current) return;

        const container = chatContainerRef.current;
        const { scrollTop, scrollHeight, clientHeight } = container;

        // Calculate if there's content to scroll
        const hasScrollableContent = scrollHeight > clientHeight + 50;

        // Calculate how far we are from the bottom
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // Track if user has manually scrolled away from bottom
        userScrolledAwayRef.current = distanceFromBottom > 50;

        // Only show button when:
        // 1. There is enough content to scroll AND
        // 2. User is not already at the bottom
        const isNearBottom = distanceFromBottom < 50;
        setShowScrollButton(hasScrollableContent && !isNearBottom);
    }, []);

    // Initialize scroll button state on component mount and when messages change
    useEffect(() => {
        // Short delay to ensure content is rendered
        setTimeout(() => {
            if (chatContainerRef.current) {
                const container = chatContainerRef.current;
                const { scrollTop, scrollHeight, clientHeight } = container;

                // Show button only if there's content to scroll and not at bottom
                const hasScrollableContent = scrollHeight > clientHeight + 50;
                const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
                setShowScrollButton(hasScrollableContent && !isNearBottom);
            }
        }, 100);
    }, [messages]);

    // Add scroll event listener to chat container
    useEffect(() => {
        const chatContainer = chatContainerRef.current;
        if (chatContainer) {
            chatContainer.addEventListener('scroll', handleChatScroll);
        }

        return () => {
            if (chatContainer) {
                chatContainer.removeEventListener('scroll', handleChatScroll);
            }
        };
    }, [handleChatScroll]);

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
                const response = await axios.get(
                    `${SERVER_URL}/api/health?_t=${requestId}`,
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

    /**
     * Toggle technical messages
     */
    const toggleTechnicalMessages = useCallback(() => {
        setShowTechnicalMessages(prev => !prev);
    }, []);

    /**
     * Toggle preview section
     */
    const togglePreview = useCallback(() => {
        if (streaming && previewVisible) {
            stopStream();
        }

        // If we're toggling the preview on (from hidden to visible)
        // make sure we have the correct image displayed
        const isTogglingOn = !previewVisible;
        if (isTogglingOn && !streaming) {
            // Only reset to placeholder when not streaming and toggling on
            setBrowserImage(PLACEHOLDER_IMAGE);
        }

        setPreviewVisible(prev => !prev);
    }, [streaming, previewVisible, stopStream]);

    // Auto-scroll to bottom when new messages arrive, but respect user's scroll position
    useEffect(() => {
        if (!chatContainerRef.current) return;

        const container = chatContainerRef.current;
        const { scrollTop, scrollHeight, clientHeight } = container;

        // Check if we have new messages from the assistant (which should trigger auto-scroll)
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const isNewAssistantMessage = lastMessage?.role === 'assistant';

        // Auto-scroll in these cases:
        // 1. User has not manually scrolled away from bottom OR
        // 2. The new message is from the assistant (important updates) OR
        // 3. User is already near the bottom
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;

        if (!userScrolledAwayRef.current || isNewAssistantMessage || isNearBottom) {
            setTimeout(() => {
                if (messagesEndRef.current) {
                    messagesEndRef.current.scrollIntoView({
                        behavior: 'smooth'
                    });

                    // Reset the user scrolled flag after auto-scrolling
                    userScrolledAwayRef.current = false;
                }
            }, 100);
        }
    }, [messages]);

    // Add function to periodically clean up duplicate messages
    useEffect(() => {
        // Skip if we don't have enough messages to deduplicate
        if (messagesRef.current.length <= 2) return;

        // Check for duplicates
        const currentMessages = messagesRef.current;
        const deduplicated = deduplicateMessages(currentMessages);

        // If we found and removed duplicates, update the messages
        if (deduplicated.length < currentMessages.length) {
            console.log(`Removing ${currentMessages.length - deduplicated.length} duplicate messages`);
            setMessages(deduplicated);
        }
    }, [messages, deduplicateMessages]);

    // Add a reconnection function that gets called when a stream ends or errors
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

    // Add error and close handlers to your stream
    useEffect(() => {
        const streamConnection = streamSourceRef.current;
        if (streamConnection) {
            // Save any existing error handler
            const existingErrorHandler = streamConnection.onerror;

            // Set the error handler
            streamConnection.onerror = (error) => {
                console.error("Stream error:", error);

                // Call the existing handler if it exists
                if (existingErrorHandler) {
                    existingErrorHandler(error);
                }

                reconnectToStream();
            };

            streamConnection.addEventListener('close', () => {
                console.log("Stream closed");
                reconnectToStream();
            });
        }
    }, [reconnectToStream]);

    // Reset the placeholder image when toggling the preview section on
    useEffect(() => {
        // Only run this effect when previewVisible changes to true
        if (previewVisible && !streaming) {
            // Reset to placeholder image when preview is shown and not streaming
            setBrowserImage(PLACEHOLDER_IMAGE);
        }
    }, [previewVisible, streaming]);



    return (
        <div className="app-container">
            {!isAuthenticated ? (
                <Login onLoginSuccess={handleLoginSuccess} />
            ) : (
                <>
                    <header className="app-header">
                        <h1>🤖 Browse Assist</h1>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button
                                className="toggle-preview-button"
                                onClick={togglePreview}
                            >
                                {previewVisible ? 'Hide Preview' : 'Show Preview'}
                            </button>
                            <button
                                className="ping-button"
                                onClick={pingServer}
                            >
                                Ping Server
                            </button>

                            {/* User avatar with logout - keep this as is */}
                            <div className="user-avatar-container">
                                <button
                                    className="logout-button"
                                    onClick={handleLogout}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '5px 12px 5px 5px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                        border: 'none',
                                        borderRadius: '20px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <div className="avatar-circle" style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        backgroundColor: 'white',
                                        color: '#6b46c1',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '16px',
                                        boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.3)',
                                    }}>
                                        {user?.email?.charAt(0)?.toUpperCase() || 'U'}
                                    </div>
                                    <span>Logout</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* Add SessionInfo component */}
                    {sessionId && <SessionInfo sessionId={sessionId} />}


                    <main className="main-content">
                        {/* Chat Section */}
                        <div className="chat-section">
                            <div className="chat-header">
                                <h2>Chat</h2>
                                <div className="chat-controls">
                                    <button
                                        className="toggle-technical-button"
                                        onClick={toggleTechnicalMessages}
                                    >
                                        {showTechnicalMessages ? 'Hide Technical Details' : 'Show Technical Details'}
                                    </button>

                                    {/* Add ValidationReport only when screenshots are available */}
                                    {!loading && hasScreenshots && sessionId && (
                                        <ValidationReport
                                            sessionId={sessionId}
                                            onError={(msg) => addStatusMessage('error', msg)}
                                            hasScreenshots={hasScreenshots}
                                            screenshotCount={screenshotCount}
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="chat-container" ref={chatContainerRef}>
                                {messages
                                    .filter(message => {
                                        // Regular Mode: Show only user-assistant conversation
                                        if (!showTechnicalMessages) {
                                            return message.role === 'user' ||
                                                message.role === 'assistant' ||
                                                message.is_welcome;
                                        }
                                        // Technical Mode: Show everything
                                        return true;
                                    })
                                    .map((message, index) => {
                                        // Check if this message is in typing state
                                        const isTyping = message.role === 'assistant' &&
                                            (message.is_typing === true ||
                                                (typingMessageIds.includes(message.id) && !message.is_welcome));

                                        // Determine the appropriate icon based on message role and content
                                        let roleIcon = '⚙️'; // Default icon

                                        if (message.role === 'assistant') {
                                            roleIcon = '🤖'; // Robot face for assistant
                                        } else if (message.role === 'user') {
                                            roleIcon = '👤'; // User icon
                                        } else if (message.role === 'function' || message.role === 'tool') {
                                            // Tool-specific icons
                                            if (message.tool_call_id && typeof message.content === 'string') {
                                                if (message.content.includes('screenshot') || message.content.includes('image')) {
                                                    roleIcon = '📷'; // Camera for screenshots
                                                } else if (message.content.includes('click') || message.content.includes('button')) {
                                                    roleIcon = '👆'; // Finger for clicks
                                                } else if (message.content.includes('type') || message.content.includes('input')) {
                                                    roleIcon = '⌨️'; // Keyboard for typing
                                                } else if (message.content.includes('search') || message.content.includes('found')) {
                                                    roleIcon = '🔎'; // Magnifying glass for search
                                                } else if (message.content.includes('read') || message.content.includes('text')) {
                                                    roleIcon = '📖'; // Book for reading
                                                } else {
                                                    roleIcon = '🔧'; // Default tool icon
                                                }
                                            } else {
                                                roleIcon = '🔧'; // Default tool icon
                                            }
                                        } else if (message.role === 'system') {
                                            roleIcon = '⚙️'; // Gear for system
                                        }

                                        return (
                                            <div
                                                key={message.id || `${message.role}-${index}`}
                                                className={`message ${message.role} ${isTyping ? 'typing' : ''}`}
                                            >
                                                <div className="message-role">
                                                    <div className="message-icon">
                                                        {roleIcon}
                                                    </div>
                                                    {/* Update this line to ensure consistent capitalization and only show ID for non-user messages */}
                                                    {message.role === 'user' ? 'User' : (
                                                        <>
                                                            {message.role.charAt(0).toUpperCase() + message.role.slice(1)}
                                                            {message.id && <span className="message-id"> (ID: {message.id.substring(0, 6)}...)</span>}
                                                        </>
                                                    )}
                                                </div>

                                                <div className="message-content">
                                                    {isTyping ? (
                                                        <div className="typing-message-container">
                                                            <div className="typing-indicator">
                                                                <div className="typing-dot"></div>
                                                                <div className="typing-dot"></div>
                                                                <div className="typing-dot"></div>
                                                                <div className="typing-cursor"></div>
                                                            </div>
                                                        </div>
                                                    ) : (message.role === 'function' || message.role === 'tool') ? (
                                                        // Special formatting for tool/function responses
                                                        <pre className="tool-content">
                                                            {typeof message.content === 'string'
                                                                ? message.content
                                                                : JSON.stringify(message.content, null, 2)}
                                                        </pre>
                                                    ) : message.content ? (
                                                        <div dangerouslySetInnerHTML={{ __html: message.content }} />
                                                    ) : (
                                                        // Display a placeholder for empty content
                                                        <div className="empty-content">[Empty Message]</div>
                                                    )}

                                                    {/* Display finish_reason if available */}
                                                    {message.role === 'assistant' && message.finish_reason && showTechnicalMessages && (
                                                        <div className="message-finish-reason">
                                                            Finish reason: {message.finish_reason}
                                                        </div>
                                                    )}
                                                    {!isTyping && message.tool_calls && message.tool_calls.length > 0 && !typingMessageIds.includes(message.id) && (
                                                        <div className="tool-calls">
                                                            <div className="tool-call-header">🔧 Tool Calls:</div>
                                                            {message.tool_calls.map((toolCall, idx) => {
                                                                // Determine which icon to use based on the tool name
                                                                let toolIcon = '🔧'; // Default tool icon

                                                                // Set specific icons based on function name
                                                                const toolName = toolCall.function?.name || '';
                                                                if (toolName.includes('screenshot') || toolName.includes('snapshot')) {
                                                                    toolIcon = '📷'; // Camera icon
                                                                } else if (toolName.includes('click')) {
                                                                    toolIcon = '👆'; // Click icon
                                                                } else if (toolName.includes('type')) {
                                                                    toolIcon = '⌨️'; // Keyboard icon
                                                                } else if (toolName.includes('navigate')) {
                                                                    toolIcon = '🔍'; // Navigation icon
                                                                } else if (toolName.includes('read')) {
                                                                    toolIcon = '📖'; // Reading icon
                                                                } else if (toolName.includes('search')) {
                                                                    toolIcon = '🔎'; // Search icon
                                                                } else if (toolName.includes('wait')) {
                                                                    toolIcon = '⏱️'; // Timer icon
                                                                } else {
                                                                    toolIcon = '🌐'; // Browser icon
                                                                }

                                                                return (
                                                                    <div key={toolCall.id || idx} className="tool-call">
                                                                        <div className="tool-name">
                                                                            <span className="tool-icon">{toolIcon}</span>
                                                                            {toolCall.function?.name || 'Unknown Tool'}
                                                                        </div>
                                                                        {toolCall.function?.arguments && (
                                                                            <pre className="tool-args">{JSON.stringify(
                                                                                // Safely parse JSON or return the original string if parsing fails
                                                                                (() => {
                                                                                    try {
                                                                                        return JSON.parse(toolCall.function.arguments);
                                                                                    } catch (e) {
                                                                                        return toolCall.function.arguments;
                                                                                    }
                                                                                })(),
                                                                                null, 2)}</pre>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                {/* Scroll button */}
                                {showScrollButton && (
                                    <div className="scroll-button-wrapper">
                                        <button
                                            className="scroll-button"
                                            onClick={scrollToBottom}
                                        >
                                            ↓
                                        </button>
                                    </div>
                                )}

                                {/* Invisible element to scroll to */}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="input-container">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className="message-input"
                                    placeholder="Type your message..."
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && !loading && handleSendMessage(inputValue) && setInputValue('')}
                                    disabled={loading}
                                />
                                <button
                                    className="send-button"
                                    onClick={() => {
                                        handleSendMessage(inputValue);
                                        setInputValue('');
                                    }}
                                    disabled={loading || !inputValue.trim()}
                                    aria-label="Send message"
                                >
                                </button>
                            </div>
                        </div>

                        {/* Preview Section */}
                        {previewVisible && (
                            <div className="preview-section">
                                <div className="preview-title">
                                    <h2>Live Preview</h2>
                                    <div className="preview-controls">
                                        <button
                                            className="refresh-preview-button"
                                            onClick={takeScreenshot}
                                            disabled={!sessionId || streaming}
                                        >
                                            Refresh Screenshot
                                        </button>
                                        <button
                                            className={`stream-button ${!streaming ? 'start' : streaming ? 'stop' : 'restart'}`}
                                            onClick={!streaming ? startStream : streaming ? stopStream : restartStream}
                                            disabled={!sessionId || streamStatus === 'connecting'}
                                        >
                                            {!streaming ? 'Start Stream' : streaming ? 'Stop Stream' : 'Restart Stream'}
                                        </button>
                                    </div>
                                </div>

                                <div className={`stream-status ${streamStatus} ${(streamStatus === 'active' || streamStatus === 'waiting') ? 'pulsing' : ''}`}>
                                    Stream Status: {streamStatus.charAt(0).toUpperCase() + streamStatus.slice(1)}
                                </div>

                                <div className="browser-preview">
                                    <img src={browserImage} alt="Browser Preview" />
                                </div>

                                {/* Status log */}
                                <div className="status-log">
                                    <h3>Status Log</h3>
                                    <div className="status-messages">
                                        {statusMessages.length === 0 ? (
                                            <div className="status-message info">
                                                <span className="status-time">--:--:--</span>
                                                <span className="status-text">Waiting for activity...</span>
                                            </div>
                                        ) : (
                                            statusMessages.map((status, index) => (
                                                <div key={index} className={`status-message ${status.type}`}>
                                                    <span className="status-time">{status.time}</span>
                                                    <span className="status-text">{status.text}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </>
            )}
        </div>
    );
}

export default App;
