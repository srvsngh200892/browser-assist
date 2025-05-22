import express, { Request, Response } from 'express';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { createUser, getUserByEmail, validateUser, getUserById } from '../services/firebase-users';
import { createToken, verifyToken } from '../utils/jwt-utils';
import {
    createSession,
    getSessionMetadata,
    updateSessionActivity,
    clearStreamState,
    deleteSession,
    createMessageHandler,
    deleteMcpSession
} from '../services/firebase-sessions';
import { authMiddleware } from '../middleware/auth-middleware';
import sessionStore from '../services/session-store';
import { MCP_SERVER_BASE_URL } from '../config/env';
import { removeMcpClient } from '../utils/playwright-mcp-client';

const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-key-change-in-production";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "your-jwt-refresh-secret-key-change-in-production";


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
        }, JWT_SECRET);

        // Generate JWT refresh token using the utility function
        const refreshToken = await createToken({
            userId: user.userId,
            email: user.email,
            username: user.username
        }, JWT_REFRESH_SECRET);

        // Create a new session
        const sessionId = uuid();
        const sessionMetadata = {
            userAgent: req.headers['user-agent'] || "unknown",
            ip: req.ip || "unknown"
        };

        await createSession(sessionId, user.userId, sessionMetadata);
        await createMessageHandler(sessionId)

        res.cookie('token', token, {
            httpOnly: true, // Prevents access via JavaScript
            secure: true, // Use HTTPS in production
            sameSite: 'strict', // Prevents cross-site request forgery
            maxAge: 7200 * 1000 // 1 hour
        });


        res.cookie('refresh_token', refreshToken, {
            httpOnly: true, // Prevents access via JavaScript
            secure: true, // Use HTTPS in production
            sameSite: 'strict', // Prevents cross-site request forgery
            maxAge: 86400000,// 1 hour,
            path: '/api/refresh',
        });


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
        }, JWT_SECRET);

        // Generate JWT refresh token using the utility function
        const refreshToken = await createToken({
            userId,
            email,
            username
        }, JWT_REFRESH_SECRET);

        const sessionId = uuid();
        const sessionMetadata = {
            userAgent: req.headers['user-agent'] || "unknown",
            ip: req.ip || "unknown"
        };

        await createSession(sessionId, userId, sessionMetadata);
        await createMessageHandler(sessionId)

        res.cookie('token', token, {
            httpOnly: true, // Prevents access via JavaScript
            secure: true, // Use HTTPS in production
            sameSite: 'strict', // Prevents cross-site request forgery
            maxAge: 7200 * 1000// 1 hour
        });

        res.cookie('refresh_token', refreshToken, {
            httpOnly: true, // Prevents access via JavaScript
            secure: true, // Use HTTPS in production
            sameSite: 'strict', // Prevents cross-site request forgery
            maxAge: 86400000,// 1 hour,
            path: '/api/refresh',
        });

        return res.status(201).json({
            success: true,
            token,
            sessionId,
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

        await removeMcpClient(sessionId)

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: "Session ID is required for logout"
            });
        }

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
        } catch (streamError) {
            console.error(`Error clearing stream state for session ${sessionId}:`, streamError);
            // Continue with other cleanup even if stream state clear fails
        }

        // 2. Remove message handler from memory
        if (sessionStore.sessionExists(sessionId)) {
            sessionStore.removeSession(sessionId);
        }

        // 3. Handle the session in Firebase based on deletion preference
        if (deleteData) {
            // Delete session data completely if requested
            await deleteSession(sessionId);
        } else {
            // Otherwise just mark it as inactive
            await updateSessionActivity(sessionId, false);
        }

        res.clearCookie('token', {
            httpOnly: true,
            secure: true, // Ensure secure cookies in production
            sameSite: 'strict', // Ensure cookie security
            path: '/' // Clear for all paths
        });

        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: true, // Ensure secure cookies in production
            sameSite: 'strict', // Ensure cookie security
            path: '/api/refresh' // Clear for all paths
        });


        try {
            await axios.delete(`${MCP_SERVER_BASE_URL}/delete-session-folder/${sessionId}`);
        } catch (error) {
            console.error(`error deleting persistent data for ${sessionId} ${MCP_SERVER_BASE_URL}/delete-session-folder/${sessionId}`, error)
        }
        await deleteMcpSession(sessionId)
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


router.get("/auth-check", authMiddleware, async (req: any, res: Response) => {
    const user = req.user
    return res.json({ success: true, isAuthenticated: true, user });
});

router.post('/refresh', async (req: any, res: Response) => {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
        return res.status(401).json({ success: false, error: 'No refresh token' });
    }

    try {
        const decoded = await verifyToken(refreshToken, JWT_REFRESH_SECRET);;
        const user = await getUserById(decoded.userId);

        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }
        // Generate JWT token using the utility function
        const token = await createToken({
            userId: user.userId,
            email: user.email,
            username: user.username
        }, JWT_SECRET);

        // Generate JWT token using the utility function
        const newRefreshToken = await createToken({
            userId: user.userId,
            email: user.email,
            username: user.username
        }, JWT_REFRESH_SECRET);

        res.cookie('token', token, {
            httpOnly: true, // Prevents access via JavaScript
            secure: true, // Use HTTPS in production
            sameSite: 'strict', // Prevents cross-site request forgery
            maxAge: 7200 * 1000
        });

        res.cookie('refresh_token', newRefreshToken, {
            httpOnly: true, // Prevents access via JavaScript
            secure: true, // Use HTTPS in production
            sameSite: 'strict', // Prevents cross-site request forgery
            maxAge: 86400000,// 1 hour,
            path: '/api/refresh',
        });

        return res.json({ success: true });
    } catch (err) {
        return res.status(403).json({ success: false, error: 'Invalid refresh token' });
    }
});

export default router;