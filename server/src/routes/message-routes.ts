import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { getSessionMetadata, updateSessionActivity } from '../services/firebase-sessions';
import { getNewMessages } from '../services/firebase-messages';
import { getOrCreateMessageHandler } from '../server.js';
import { processResponse } from '../services/response-processor';
import { initialMessageSystemPrompt } from '../utils/prompts';

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

        // Update session activity
        await updateSessionActivity(sessionId);

        // Get or create the message handler for this session
        const messageHandler = await getOrCreateMessageHandler(sessionId);

        // Get the last retrieval time
        const lastRetrievalTime = messageHandler.getLastRetrievalTime();

        // Set parameters for query
        const since = req.query.since as string | undefined;
        const limit = parseInt(req.query.limit as string || "50", 10); // Default to 50 messages
        const page = parseInt(req.query.page as string || "1", 10); // Pagination support
        const lastQueryTime = since ? parseInt(since, 10) : lastRetrievalTime;

        // Get messages, either all or just new ones based on the query parameter
        let messages;
        if (lastQueryTime > 0 && since) {
            // Only get new messages since the last retrieval
            messages = await getNewMessages(sessionId, lastQueryTime);
        } else {
            // Get all messages for the session
            messages = await messageHandler.getMessages(true); // Force reload from Firebase
        }

        // Apply pagination to limit payload size
        const totalCount = messages.length;
        const startIndex = (page - 1) * limit;
        const endIndex = Math.min(startIndex + limit, messages.length);

        // Get only the paginated subset of messages
        const paginatedMessages = messages.slice(startIndex, endIndex);

        // Determine if processing is complete
        let isDone = false;

        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            isDone = lastMessage.role === 'assistant' &&
                (lastMessage as MessageWithExtras).finish_reason === 'stop';

        }

        // Update the last retrieval time
        const newRetrievalTime = messageHandler.updateLastRetrievalTime();

        return res.json({
            success: true,
            sessionId,
            messages: paginatedMessages,
            totalCount,
            page,
            limit,
            hasMore: endIndex < totalCount,
            isDone,
            timestamp: newRetrievalTime
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

        // Update session activity
        await updateSessionActivity(sessionId);

        // Get or create message handler for this session
        const messageHandler = await getOrCreateMessageHandler(sessionId);

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