import { useEffect } from 'react';
import api from '../api';

export const useStreamPauseOnInactivity = (loading, sessionId, streamStatus, setStreamStatus) => {
  useEffect(() => {
    if (!loading && sessionId && streamStatus === 'active') {
      try {
        api.post(`/api/stream-control`, {
          sessionId: sessionId,
          action: 'pause',
          reason: 'response_complete'
        }).catch(err => console.log('Server may not support stream pausing yet'));
        console.log('POLL: Pausing stream since response is complete');
        setStreamStatus('waiting');
      } catch (err) {
        console.error('Error in stream pause notification:', err);
      }
    }
  }, [loading, sessionId, streamStatus, setStreamStatus]);
};
