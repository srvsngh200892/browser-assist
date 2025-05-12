import React, {useState, useRef, useEffect, useCallback} from 'react';
import Message from './Message';
import ValidationReport from './ValidationReport';
import ScrollToBottomButton from "./ScrollToBottomButton";

function ChatSection({
                         messages,
                         loading,
                         showTechnicalMessages,
                         sessionId,
                         hasScreenshots,
                         screenshotCount,
                         addStatusMessage,
                         handleSendMessage,
                         toggleTechnicalMessages,
                         typingMessageIds,
                         messagesEndRef,
                         chatContainerRef,
                         inputRef,
                         showScrollButton,
                         scrollToBottom,
                         handleChatScroll,
                     }) {

    const [inputValue, setInputValue] = useState('');
    const handleInputChange = (value) => {
        setInputValue(value);
    };
    return (
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
            <div className="chat-container" ref={chatContainerRef} onScroll={handleChatScroll}>
                {messages
                    .filter(message => {
                        if (!showTechnicalMessages) {
                            return message.role === 'user' ||
                                message.role === 'assistant' ||
                                message.is_welcome;
                        }
                        return true;
                    })
                    .map((message, index) => (
                        <Message
                            key={message.id || `${message.role}-${index}`}
                            message={message}
                            isTyping={message.role === 'assistant' &&
                                (message.is_typing === true ||
                                    (typingMessageIds.includes(message.id) && !message.is_welcome))}
                            typingMessageIds={typingMessageIds}
                            showTechnicalMessages={showTechnicalMessages}
                        />
                    ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="input-container">
                <textarea
                    ref={inputRef}
                    className="message-input"
                    placeholder="Type your message..."
                    value={inputValue}
                    onChange={(e) => {
                        handleInputChange(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !loading) {
                            e.preventDefault();
                            handleSendMessage(inputValue);
                            handleInputChange('');
                            e.target.style.height = 'auto';
                        }
                    }}
                    disabled={loading}
                    rows={1}
                />
                <button
                    className={`send-button ${loading ? 'pulsing-button' : ''}`}
                    onClick={() => {
                        handleSendMessage(inputValue);
                        handleInputChange('');
                        requestAnimationFrame(() => {
                            if (inputRef.current) {
                                inputRef.current.style.height = 'auto';
                            }
                        });
                    }}
                    disabled={loading || !inputValue.trim()}
                    aria-label="Send message"
                >
                </button>
                <ScrollToBottomButton showScrollButton={showScrollButton} scrollToBottom={scrollToBottom}/>
            </div>
        </div>
    );
}

export default ChatSection;
