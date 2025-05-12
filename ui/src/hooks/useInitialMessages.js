import { useState, useEffect } from 'react';
import api from '../api';

export const useInitialMessages = (sessionId, loadingRef, messagesRef, setMessages, setTypingMessageIds, setLoading, loading, messages) => {
  useEffect(() => {
    const fetchInitialMessages = async () => {
      if (!sessionId) return;
      try {
        const response = await api.get(`/api/messages/${sessionId}`);
        if (response.data.success && response.data.messages.length > 1) {
          setMessages(response.data.messages);
          localStorage.setItem(`lastTimestamp-${sessionId}`, response.data.messages[response.data.messages.length - 1].timestamp);
          if (response.data.hasMore && !response.data.isDone) {
            console.log("having more message to pull", JSON.stringify(response.data, null, 2))
            const typingId = `typing-refresh-${Date.now()}`;
            const typingMessage = {
              id: typingId,
              role: 'assistant',
              content: '',
              is_typing: true,
              created_at: new Date().toISOString()
            };
            setMessages(currentMessages => {
              // First remove any existing typing messages
              const messagesWithoutTyping = currentMessages.filter(m => !m.is_typing);
              // Then add the new typing message at the end
              return [...messagesWithoutTyping, typingMessage];
            });
            // Add to typing IDs
            setTypingMessageIds(prev =>
              [...prev.filter(id => id !== typingId), typingId]
            );
            setLoading(true);
          }
        }
      } catch (error) {
        console.error('Error fetching initial messages:', error);
      }
    };

    fetchInitialMessages();
  }, [sessionId]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

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
}
