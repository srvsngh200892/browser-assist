import React from 'react';

function Message({ key, message, isTyping, typingMessageIds, showTechnicalMessages }) {
    let roleIcon = '⚙️';
    if (message.role === 'assistant') {
        roleIcon = '🤖';
    } else if (message.role === 'user') {
        roleIcon = '👤';
    } else if (message.role === 'function' || message.role === 'tool') {
        if (message.tool_call_id && typeof message.content === 'string') {
            if (message.content.includes('screenshot') || message.content.includes('image')) {
                roleIcon = '📷';
            } else if (message.content.includes('click') || message.content.includes('button')) {
                roleIcon = '👆';
            } else if (message.content.includes('type') || message.content.includes('input')) {
                roleIcon = '⌨️';
            } else if (message.content.includes('search') || message.content.includes('found')) {
                roleIcon = '🔎';
            } else if (message.content.includes('read') || message.content.includes('text')) {
                roleIcon = '📖';
            } else {
                roleIcon = '🔧';
            }
        } else {
            roleIcon = '🔧';
        }
    } else if (message.role === 'system') {
        roleIcon = '⚙️';
    }

    return (
        <div
            key={key}
            className={`message chat-bubble ${message.role} ${isTyping ? 'typing' : ''}`}
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
}
export default Message;
