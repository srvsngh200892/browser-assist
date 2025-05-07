import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { getSessionMetadata, updateSessionActivity, getMessageHandler, updatelastMessageRetrieval } from '../services/firebase-sessions';
import { getNewMessages, getSessionMessagesForUI } from '../services/firebase-messages';
import { processResponse } from '../services/response-processor';
import { toMillis } from '../utils/firebase-date-to-milli';

// Define a custom interface for working with tool calls
interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments: string;
    };
}

// Define a type for OpenAI message with additional properties
type MessageWithExtras = {
    role: string;
    content: string;
    tool_calls?: ToolCall[];
    finish_reason?: string;
};

// Extend Request to include user property
interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        email?: string;
        displayName?: string;
        lastLogin?: string;
    };
}

// Initialize router
const router = express.Router();

// Add endpoint to get messages for a session
router.get("/messages/:sessionId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Get user information from the authentication middleware
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: "Authentication required"
            });
        }

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: "Missing session ID"
            });
        }

        // First check if session exists in Firebase
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: "Session not found"
            });
        }

        // Verify that the session belongs to the authenticated user
        if (sessionData.userId !== user.userId) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to access this session"
            });
        }

        // Set parameters for query
        const since = req.query.since as string | undefined;

        // Get messages, either all or just new ones based on the query parameter
        let messages;
        if (since) {
            // Only get new messages since the last retrieval
            messages = await getNewMessages(sessionId, parseInt(since, 10));
        } else {
            // Get all messages for the session
            messages = await getSessionMessagesForUI(sessionId);
        }

        const hasMore = sessionData.messageProcessing
        // Determine if processing is complete
        let isDone = false;

        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            isDone = lastMessage.role === 'assistant' &&
                (lastMessage as MessageWithExtras).finish_reason === 'stop';

        }

        // Update the last retrieval time
         await updatelastMessageRetrieval(sessionId);
        const sessionInfo = await getSessionMetadata(sessionId);

        return res.json({
            success: true,
            sessionId,
            messages,
            isDone,
            hasMore,
            timestamp: toMillis(sessionInfo?.lastMessageRetrieval) || Date.now()
        });
    } catch (error) {
        console.error(`Error fetching messages: ${error instanceof Error ? error.message : "Unknown error"}`);
        return res.status(500).json({
            success: false,
            error: "Failed to fetch messages"
        });
    }
});

// Handle chat messages
router.post("/chat/:sessionId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    // Get user information from the authentication middleware
    const user = req.user;
    if (!user || !user.userId) {
        return res.status(401).json({
            success: false,
            error: "Authentication required"
        });
    }
    const { sessionId } = req.params;
    if (!sessionId) {
        return res.status(400).json({
            success: false,
            error: "Missing session ID"
        });
    }

    try {
        // First check if session exists in Firebase
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: "Session not found"
            });
        }
        if (sessionData.userId !== user.userId) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to access this session"
            });
        }

        // Update session activity
        await updateSessionActivity(sessionId);

        // Get or create message handler for this session
        const messageHandler = await getMessageHandler(sessionId);

        const { userMessage } = req.body;

        if (!userMessage || typeof userMessage !== "object") {
            return res.status(400).json({
                success: false,
                error: "Invalid message format"
            });
        }
        // Validate and add user message
        await messageHandler.addMessage(userMessage);

        // We'll continue processing asynchronously
        res.json({
            success: true,
            status: "processing",
            message: "Message received, processing has started. Updates will be available via polling."
        });

        // Start async response processing
        processResponse(sessionId, messageHandler).catch(error => {
            console.error(`Error processing response: ${error instanceof Error ? error.message : "Unknown error"}`);
        });

    } catch (error) {
        console.error(`Error processing chat message: ${error instanceof Error ? error.message : "Unknown error"}`);
        return res.status(500).json({
            success: false,
            error: "Failed to process message"
        });
    }
});

export default router; 