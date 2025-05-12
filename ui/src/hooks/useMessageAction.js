import { useCallback } from 'react';

export const useMessageAction = (setTypingMessageIds) => {
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
        // Clear any existing typing timer first to prevent rapid flickering
        // Set the typing message IDs
        setTypingMessageIds(prev => {
            // Filter out any existing typing IDs to avoid duplicates
            const existingIds = prev.filter(id => !newTypingIds.includes(id));
            return [...existingIds, ...newTypingIds];
        });

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

    return { handleNewAssistantMessages, deduplicateMessages };
};
