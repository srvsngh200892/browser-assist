import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { createUser, getUserByEmail, validateUser } from '../services/firebase-users';
import { createToken } from '../utils/jwt-utils';
import {
    createSession,
    getSessionMetadata,
    updateSessionActivity,
    clearStreamState,
    deleteSession
} from '../services/firebase-sessions';
import { authMiddleware } from '../middleware/auth-middleware';
import sessionStore from '../services/session-store';

// Initialize router
const router = express.Router();

// User login endpoint
router.post("/auth/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Email and password are required"
            });
        }

        // Validate credentials
        const user = await validateUser(email, password);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Invalid credentials"
            });
        }

        // Generate JWT token using the utility function
        const token = await createToken({
            userId: user.userId,
            email: user.email,
            username: user.username
        });

        // Create a new session
        const sessionId = uuid();
        const sessionMetadata = {
            userAgent: req.headers['user-agent'] || "unknown",
            ip: req.ip || "unknown"
        };

        await createSession(sessionId, user.userId, sessionMetadata);

        return res.status(200).json({
            success: true,
            token,
            sessionId, // Include session ID in the response
            user: {
                userId: user.userId,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            error: "Server error"
        });
    }
});

// User registration endpoint
router.post("/auth/register", async (req: Request, res: Response) => {
    try {
        const { username, email, password } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields"
            });
        }

        // Check if user exists
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: "User already exists"
            });
        }

        // Hash password with salt
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log("Password hashed securely with salt");

        // Create user
        const userId = await createUser({
            username,
            email,
            password: hashedPassword
        });

        if (!userId) {
            return res.status(500).json({
                success: false,
                error: "Failed to create user"
            });
        }

        // Generate JWT token using the utility function
        const token = await createToken({
            userId,
            email,
            username
        });

        return res.status(201).json({
            success: true,
            token,
            user: { userId, username, email }
        });
    } catch (error) {
        console.error("Registration error:", error);
        return res.status(500).json({
            success: false,
            error: "Server error"
        });
    }
});

// Logout endpoint
router.post("/logout", authMiddleware, async (req: any, res: Response) => {
    try {
        const { sessionId, deleteData = false } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: "Session ID is required for logout"
            });
        }

        console.log(`Processing logout request for session: ${sessionId}${deleteData ? ' (with data deletion)' : ''}`);

        // Get user information from the auth middleware
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: "Authentication required"
            });
        }

        // Verify session exists and belongs to this user
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: "Session not found"
            });
        }

        // Verify this user owns the session
        if (sessionData.userId !== user.userId) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to logout of this session"
            });
        }

        // 1. Clear any stream state
        try {
            await clearStreamState(sessionId);
            console.log(`Cleared stream state for session ${sessionId}`);
        } catch (streamError) {
            console.error(`Error clearing stream state for session ${sessionId}:`, streamError);
            // Continue with other cleanup even if stream state clear fails
        }

        // 2. Remove message handler from memory
        if (sessionStore.sessionExists(sessionId)) {
            sessionStore.removeSession(sessionId);
            console.log(`Removed message handler for session ${sessionId}`);
        }

        // 3. Handle the session in Firebase based on deletion preference
        if (deleteData) {
            // Delete session data completely if requested
            const deleteResult = await deleteSession(sessionId);
            if (deleteResult) {
                console.log(`Session ${sessionId} and all associated data deleted`);
            } else {
                console.error(`Failed to delete session ${sessionId} data`);
            }
        } else {
            // Otherwise just mark it as inactive
            await updateSessionActivity(sessionId, false);
            console.log(`Marked session ${sessionId} as inactive`);
        }

        return res.json({
            success: true,
            message: deleteData
                ? "Logout successful, session and data have been deleted"
                : "Logout successful, session marked as inactive"
        });
    } catch (error) {
        console.error(`Logout error: ${error instanceof Error ? error.message : "Unknown error"}`);
        return res.status(500).json({
            success: false,
            error: "Server error during logout"
        });
    }
});

export default router; 