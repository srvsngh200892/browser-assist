import {useState, useCallback, useEffect, useRef} from 'react';

export const useChatScrollHandler = (chatContainerRef) => {
    const [showScrollButton, setShowScrollButton] = useState(false);
    const userScrolledAwayRef = useRef(false);

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

      // Add scroll event listener to chat container hook
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
    
    return {showScrollButton, setShowScrollButton, handleChatScroll, userScrolledAwayRef, scrollToBottom}
}
