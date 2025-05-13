import { useEffect } from 'react';

export const useStreamErrorHandling = (streamSourceRef, reconnectToStream) => {
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
  }, [reconnectToStream, streamSourceRef]);
};
