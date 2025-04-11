import { MessageHandler } from './messages';

/**
 * Session store singleton that can be imported anywhere in the application
 * without worrying about circular dependencies
 */
class SessionStore {
    private _sessions: Map<string, MessageHandler> = new Map();

    /**
     * Get all session IDs
     */
    getAllSessionIds(): string[] {
        return Array.from(this._sessions.keys());
    }

    /**
     * Get total active session count
     */
    getActiveSessionCount(): number {
        return this._sessions.size;
    }

    /**
     * Check if a session exists
     */
    sessionExists(sessionId: string): boolean {
        return this._sessions.has(sessionId);
    }

    /**
     * Get a message handler by session ID
     */
    getMessageHandler(sessionId: string): MessageHandler | undefined {
        return this._sessions.get(sessionId);
    }

    /**
     * Set a message handler for a session
     */
    setMessageHandler(sessionId: string, handler: MessageHandler): void {
        this._sessions.set(sessionId, handler);
    }

    /**
     * Remove a session
     */
    removeSession(sessionId: string): boolean {
        return this._sessions.delete(sessionId);
    }

    /**
     * Clear all sessions
     */
    clearAllSessions(): void {
        this._sessions.clear();
    }
}

// Create a singleton instance
const sessionStore = new SessionStore();

// Export the singleton
export default sessionStore; 