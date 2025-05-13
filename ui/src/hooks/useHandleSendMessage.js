import { useCallback } from 'react';
import api from '../api';
import { ENDPOINTS } from '../constants';

export const useHandleSendMessage = (sessionId, setLoading, setMessages, setStreamingContent, resumeStream, streaming, streamStatus, messagesRef, typingTimerRef,  setTypingMessageIds, pollTimerRef, lastPollTimeRef, setReusingSession, loadingRef, setError, showTechnicalMessages, typingMessageIds, addStatusMessage, setStreamStatus, PLACEHOLDER_IMAGE, setSessionId, stopStream, setBrowserImage) => {

// Session Initialization => {
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
    const SESSION_RETRY_KEY = 'session-creation-retry-count';
    const SESSION_RETRY_TIMESTAMP_KEY = 'session-creation-last-attempt';
    const SESSION_CACHE_KEY = 'last-valid-session-id';
    const SESSION_MAX_RETRIES = 5; // Maximum number of retries in a short period
    const SESSION_REQUEST_DEBOUNCE_KEY = 'session-request-debounce'; // Key for tracking recent requests
    const SESSION_REQUEST_DEBOUNCE_TIME = 3000; // 3 seconds debounce time
    const LOCAL_POLL_INTERVAL = 10000; // Using a local variable to avoid naming conflict

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
        let url = ENDPOINTS.GET_MESSAGE(sessionId);

        // Add timestamp parameter if we have a previous timestamp
        if (lastTimestamp) {
            url += `?since=${lastTimestamp}`;
        }

        response = await api.get(url, { timeout: 5000 });

        if (response.data.success) {
            // Store the new timestamp for next poll
            if (response.data.timestamp) {
                localStorage.setItem(`lastTimestamp-${sessionId}`, response.data.timestamp);
                console.log(`POLL: Updated timestamp to ${response.data.timestamp}`);
            }

            if (response.data.messages && response.data.messages.length > 0) {
                const serverMessages = response.data.messages;
                const currentMessages = messagesRef.current;
                localStorage.setItem(`lastTimestamp-${sessionId}`, response.data.messages[response.data.messages.length - 1].timestamp);
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

                    if (msg.role === 'user') {
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

                // Let server know to pause sending updates (with error handling)
                try {
                    api.post(ENDPOINTS.STREAM_CONTROL, {
                        sessionId: sessionId,
                        action: 'pause',
                        reason: 'response_complete'
                    }).catch(err => console.log('Server may not support stream pausing yet'));
                    console.log('POLL: Pausing stream since response is complete');
                    setStreamStatus('waiting');
                } catch (err) {
                    console.error('Error in stream pause notification:', err);
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

            const response = await api.post(ENDPOINTS.SESSION, {}, {
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
            setError(`Failed to create new session: ${err.message}`);
        } finally {
            // Clear flag after delay
            setTimeout(() => {
                handleSessionExpired.isCreating = false;
            }, 5000); // Increased from 3s to 5s
        }
    }, [addStatusMessage]);
    
    /**
     * Remove all message history when starting a new session
     */
    const clearMessageHistory = useCallback(() => {
        if (sessionId) {
            localStorage.removeItem(`lastTimestamp-${sessionId}`);
            console.log(`Cleared message timestamp for session ${sessionId}`);
        }
    }, [sessionId]);
    
    const handleSendMessage = useCallback(async (message) => {
        if (!message) return;
        console.log('SEND: Starting to send message');
        // Resume stream if in waiting state
        resumeStream();

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
                //Short delay to allow other operations to complete first
            }
        }
        // Set loading state immediately to ensure polling starts
        setLoading(true);

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

        if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = null;
        }
        // Force immediate polling - critical step
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
            await api.post(ENDPOINTS.SEND_MESSAGE(sessionId), {
                userMessage
            });
            console.log('SEND: Message sent successfully');
            // Force polling again after server request completes
            pollForMessages();
            // Set up an animation timer to show typing effect for the response
            //Set up an animation timer to show typing effect for the response
                const typingId = `typing-assistant-${Date.now()}`;
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
                setTypingMessageIds([typingId]);
            // Set a backup timer to ensure polling continues
                console.log('SEND: Backup poll timer triggered');
                pollForMessages();
        } catch (err) {
            console.error('SEND: Error sending message:', err);
            setLoading(false);
            if (err.response && err.response.status === 404) {
                clearMessageHistory();
                await handleSessionExpired();
            }
        }
        return
    }, [sessionId, setLoading, setMessages, setStreamingContent, pollForMessages, handleSessionExpired, addStatusMessage, clearMessageHistory, resumeStream, streaming, streamStatus]);

    return { handleSendMessage, pollForMessages }
}
