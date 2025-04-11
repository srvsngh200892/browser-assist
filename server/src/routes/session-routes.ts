import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { MessageHandler } from '../services/messages';
import sessionStore from '../services/session-store';
import {
    createSession as createFirebaseSession,
    updateSessionActivity,
    getSessionMetadata
} from '../services/firebase-sessions';
import { authMiddleware } from '../middleware/auth-middleware';

const router = express.Router();

/**
 * Create a new session
 */
router.post('/session', authMiddleware, async (req: any, res: Response) => {
    try {
        // Get user information from the auth middleware
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const sessionId = uuidv4();
        const messageHandler = new MessageHandler(sessionId);

        // Use the session store instead of a global variable
        sessionStore.setMessageHandler(sessionId, messageHandler);

        // Save session metadata
        const metadata = {
            userAgent: req.headers['user-agent'] || 'unknown',
            ip: req.ip || 'unknown',
            startedAt: new Date().toISOString()
        };

        await createFirebaseSession(sessionId, user.userId, metadata);
        console.log(`Created new session: ${sessionId} for user: ${user.userId}`);

        return res.status(201).json({
            success: true,
            sessionId,
            message: 'Session created successfully'
        });
    } catch (error) {
        console.error('Error creating session:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create session'
        });
    }
});

/**
 * Get active session count
 */
router.get('/sessions/count', authMiddleware, (req: Request, res: Response) => {
    const count = sessionStore.getActiveSessionCount();
    return res.json({
        success: true,
        count
    });
});

router.get("/session/:sessionId", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: "Missing session ID"
            });
        }

        // Get session metadata from Firebase
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: "Session not found"
            });
        }

        // Update session activity when info is requested
        await updateSessionActivity(sessionId);

        return res.json({
            success: true,
            session: {
                ...sessionData
            }
        });
    } catch (error) {
        console.error(`Error getting session info: ${error instanceof Error ? error.message : "Unknown error"}`);
        return res.status(500).json({
            success: false,
            error: "Failed to get session info"
        });
    }
});

/**
 * Get all session IDs for the authenticated user
 */
router.get('/sessions', authMiddleware, (req: any, res: Response) => {
    const sessionIds = sessionStore.getAllSessionIds();
    return res.json({
        success: true,
        sessions: sessionIds
    });
});

export default router; 