import { useEffect } from 'react';

export const useLoadingStatePolling = (loading, sessionId, pollForMessages, setLoading, messagesRef) => {
  useEffect(() => {
    // When loading becomes true, ensure we start polling
    if (loading && sessionId) {
      console.log('EFFECT: Loading ON - Starting polling');

      // Start polling immediately
      pollForMessages();

      return () => {
        //no need to cleanup here
      };
    } else if (!loading) {
      // If last message is from user, we should restart loading
      const lastMessage = messagesRef.current?.length > 0
        ? messagesRef.current[messagesRef.current.length - 1]
        : null;

      if (lastMessage?.role === 'user') {
        setTimeout(() => {
          setLoading(true);

          // Start polling directly instead of waiting for next effect cycle
          pollForMessages();
        }, 100);
      }
    }
  }, [loading, sessionId, pollForMessages, setLoading]);
};
