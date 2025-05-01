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

router.get("/session/:sessionId", authMiddleware, async (req: any, res: Response) => {
    try {
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
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

        // Verify ownership
        if (sessionData.userId !== user.userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this session'
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

export default router; 