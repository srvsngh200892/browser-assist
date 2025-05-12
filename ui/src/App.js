import React, { useState, useRef, useCallback } from 'react';
import './App.css';
import Header from './components/Header'; // Import the SessionInfo component
import SessionInfo from './components/SessionInfo'; // Import the SessionInfo component
import Login from './components/Login'; // Import the Login component
import ChatSection from './components/ChatSection';
import PreviewSection from './components/PreviewSection';
import { useAuth } from './hooks/useAuth';
import { useInitialMessages } from './hooks/useInitialMessages';
import { useScreenshotAvailability } from './hooks/useScreenshotAvailability';
import { useSessionInitialization } from './hooks/useSessionInitialization';
import { useLoadingStatePolling } from './hooks/useLoadingStatePolling';
import { useChatScrollHandler } from './hooks/useChatScrollHandler';
import { useScrollButtonState } from './hooks/useScrollButtonState'
import { useStreamPauseOnInactivity } from './hooks/useStreamPauseOnInactivity';
import { useStreamErrorHandling } from './hooks/useStreamErrorHandling'
import { usePreviewPlaceholderReset } from './hooks/usePreviewPlaceholderReset'
import { useSession } from './hooks/useSession'
import { useStreamManagement } from './hooks/useStreamManagement'
import { useMessageAction } from './hooks/useMessageAction'
import { useHandleSendMessage } from './hooks/useHandleSendMessage'
import { useToggleFunction } from './hooks/useToggleFunction'

// Add session creation retry constants
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIiAvPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQwMCwzMDApIj4KICAgIDx0ZXh0IHg9IjAiIHk9Ii02MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmaWxsPSIjNmI0NmMxIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4KICAgICAgQnJvd3NlciBQcmV2aWV3CiAgICA8L3RleHQ+CiAgICA8dGV4dCB4PSIwIiB5PSItMTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzZjNzU3ZCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+CiAgICAgIE5vIGxpdmUgcHJldmlldyBhdmFpbGFibGUKICAgIDwvdGV4dD4KICAgIDx0ZXh0IHg9IjAiIHk9IjIwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2Yzc1N2QiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgogICAgICBDbGljayAiU3RhcnQgU3RyZWFtIiB0byBlbmFibGUgbGl2ZSBwcmV2aWV3CiAgICA8L3RleHQ+CiAgICA8dGV4dCB4PSIwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNmM3NTdkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4KICAgICAgb3IgIlJlZnJlc2ggU2NyZWVuc2hvdCIgdG8gdGFrZSBhIHNpbmdsZSBzY3JlZW5zaG90CiAgICA8L3RleHQ+CiAgPC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQwMCw1MDApIj4KICAgIDxjaXJjbGUgY3g9IjAiIGN5PSIwIiByPSIzMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNmI0NmMxIiBzdHJva2Utd2lkdGg9IjIiIC8+CiAgICA8dGV4dCB4PSIwIiB5PSI2IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM2YjQ2YzEiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgogICAgICA8L3RleHQ+CiAgPC9nPgo8L3N2Zz4=';
const WELCOME_MESSAGE = [
    {
        role: 'assistant',
        content: 'Welcome! I\'m here to help you with your questions and tasks. How can I assist you today?',
        id: 'welcome-message',
        is_welcome: true,  // Add a flag to clearly identify the welcome message
        created_at: new Date().toISOString()
    }
]

/**
 * OpenAI MCP Client
 */
function App() {
    const {
        isAuthenticated,
        user,
        sessionId,
        setSessionId,
        handleLoginSuccess,
        handleLogout,
      } = useAuth();
        

    const [browserImage, setBrowserImage] = useState(PLACEHOLDER_IMAGE); // For storing the browser preview image
    // Status messages
    const [statusMessages, setStatusMessages] = useState([{
        type: 'info',
        text: 'Initializing...',
        time: new Date().toLocaleTimeString()
    }]);
    const messagesRef = useRef([]);
    const loadingRef = useRef(false);
    const pollTimerRef = useRef(null);
    const typingTimerRef = useRef(null); // Add ref for typing animation timeout
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const inputRef = useRef(null); // Reference to input field for focusing
    const lastPollTimeRef = useRef(0);
    const [messages, setMessages] = useState(WELCOME_MESSAGE);
    const [loading, setLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState(''); // For storing partial responses
    const [typingMessageIds, setTypingMessageIds] = useState([]); // For tracking which messages are in typing state


    /**
        * Add a status message
    */
    const addStatusMessage = useCallback((type, text) => {
        const timeString = new Date().toLocaleTimeString();
        setStatusMessages(prev => {
            const newMessages = [...prev, { type, text, time: timeString }];
            return newMessages.length > 10 ? newMessages.slice(-10) : newMessages;
        });
    }, []);

    const { sessionIdRef, setError, setReusingSession } = useSession(sessionId)
    const { streamSourceRef, streaming, streamStatus, setStreamStatus, cleanupStream, stopStream, pingServer, restartStream, startStream, reconnectToStream, resumeStream } = useStreamManagement(sessionId, setBrowserImage, addStatusMessage, PLACEHOLDER_IMAGE);
    const { handleNewAssistantMessages, deduplicateMessages } = useMessageAction(setTypingMessageIds)
        //Toggle Function
    const {showTechnicalMessages, previewVisible, toggleTechnicalMessages, togglePreview} = useToggleFunction()
    // Initial Messages
    useInitialMessages(sessionId, loadingRef, messagesRef, setMessages, setTypingMessageIds, setLoading, loading, messages);


    const { hasScreenshots, screenshotCount } = useScreenshotAvailability(sessionId);


    //Handle Send Message
    const { handleSendMessage, pollForMessages } = useHandleSendMessage(sessionId, setLoading, setMessages, setStreamingContent, resumeStream, streaming, streamStatus, messagesRef, typingTimerRef, setTypingMessageIds, pollTimerRef, lastPollTimeRef, handleNewAssistantMessages, deduplicateMessages, setReusingSession, loadingRef, setError, showTechnicalMessages, typingMessageIds, addStatusMessage, setStreamStatus, PLACEHOLDER_IMAGE, setSessionId, stopStream, setBrowserImage)

    // Session Initialization
    const { takeScreenshot } = useSessionInitialization(isAuthenticated, setSessionId, setStreamStatus, addStatusMessage, sessionIdRef, setBrowserImage);

    // Loading State Polling
    useLoadingStatePolling(loading, sessionId, pollForMessages, setLoading, messagesRef);

    //Chat Scroll Handler
    const {showScrollButton, setShowScrollButton, handleChatScroll, userScrolledAwayRef, scrollToBottom} = useChatScrollHandler(chatContainerRef);

    //Stream Pause on Inactivity
    useStreamPauseOnInactivity(loading, sessionId, streamStatus, setStreamStatus)

    //Stream Error Handling
    useStreamErrorHandling(streamSourceRef, reconnectToStream)

    //Preview Placeholder Reset
    usePreviewPlaceholderReset(previewVisible, streaming, setBrowserImage, PLACEHOLDER_IMAGE)

    //Scroll Button State
    useScrollButtonState(chatContainerRef, messages, messagesEndRef, userScrolledAwayRef, setShowScrollButton);

 
    return (
        <div className="app-container">
            {!isAuthenticated ? (
                <Login onLoginSuccess={handleLoginSuccess} />
            ) : (
                <>
                    <Header
                        togglePreview={togglePreview}
                        previewVisible={previewVisible}
                        pingServer={pingServer}
                        user={user} // Pass user as prop
                        handleLogout={handleLogout} // Pass logout as prop
                    />
                    {sessionId && <SessionInfo sessionId={sessionId} />}
                    <main className="main-content">
                        <ChatSection
                            messages={messages}
                            loading={loading}
                            showTechnicalMessages={showTechnicalMessages}
                            sessionId={sessionId}
                            hasScreenshots={hasScreenshots}
                            screenshotCount={screenshotCount}
                            addStatusMessage={addStatusMessage}
                            handleSendMessage={handleSendMessage}
                            toggleTechnicalMessages={toggleTechnicalMessages}
                            typingMessageIds={typingMessageIds}
                            messagesEndRef={messagesEndRef}
                            chatContainerRef={chatContainerRef}
                            inputRef={inputRef}
                            showScrollButton={showScrollButton}
                            scrollToBottom={scrollToBottom}
                            handleChatScroll={handleChatScroll}
                        />
                        {previewVisible && (
                            <PreviewSection
                                previewVisible={previewVisible}
                                browserImage={browserImage}
                                streaming={streaming}
                                streamStatus={streamStatus}
                                sessionId={sessionId}
                                takeScreenshot={takeScreenshot}
                                startStream={startStream}
                                stopStream={stopStream}
                                restartStream={restartStream}
                                statusMessages={statusMessages}
                            />
                        )}
                    </main>
                </>
            )}
        </div>
    );
}

export default App;
