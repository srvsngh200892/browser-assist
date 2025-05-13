import { useState, useRef, useEffect } from 'react';

export const useSession = (sessionId) => {
    const sessionIdRef = useRef(null);
    const [error, setError] = useState(null);
    const [reusingSession, setReusingSession] = useState(false); // Add state for session reuse

    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    return {
        sessionIdRef,
        setError,
        setReusingSession
    };
};
