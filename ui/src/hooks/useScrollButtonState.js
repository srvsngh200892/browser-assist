import { useState, useEffect } from 'react';

export const useScrollButtonState = (chatContainerRef, messages, messagesEndRef, userScrolledAwayRef, setShowScrollButton) => {

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
  }, [messages, chatContainerRef]);

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
};
