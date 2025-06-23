import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { getSessionMetadata, updateSessionActivity, getMessageHandler, updatelastMessageRetrieval, deleteSession } from '../services/firebase-sessions';
import { deleteAllMessagesForSession, getNewMessages, getSessionMessagesForUI } from '../services/firebase-messages';
import { runNavigationAgent, runNavigationTestCaseAgent } from '../services/navigationAgent.js';
import { getMcpClient } from '../utils/playwright-mcp-client';
import { toMillis } from '../utils/firebase-date-to-milli';
import { getTestCase, updateTestCase } from "../services/firebase-test-cycles";
import { getOrCreateSessionForTestCase } from "../services/firebase-test-case-sessions";
import { MessageType } from '../services/messages.js';
import { deleteFolder } from '../services/firebase-storage.js';
import { deleteValidationIfExists } from '../services/firebase-validation.js';
import sessionStore from '../services/session-store';
import { Timestamp } from 'firebase-admin/firestore';

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
        const mcpClient = await getMcpClient(sessionId);
        await updateSessionActivity(sessionId);

        // Get or create message handler for this session
        const messageHandler = await getMessageHandler(sessionId, true);

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
        runNavigationAgent(sessionId, messageHandler, user.userId, mcpClient).catch(error => {
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

router.post("/chat/test-case/:testCaseId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user || !user.userId) {
        return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { testCaseId } = req.params;
    if (!testCaseId) {
        return res.status(400).json({ success: false, error: "Missing test case ID" });
    }

    try {
        const testCase = await getTestCase(testCaseId, user.userId);
        if (!testCase) {
            return res.status(404).json({ success: false, error: "Test case not found" });
        }

        // TODO: Check if user has access to the test case if necessary


        //update test case executedAt
        await updateTestCase(testCase.cycleId, user.userId, testCaseId, { executedAt: Timestamp.now() });

        const steps = testCase.steps || [];
        const mcpClient = await getMcpClient(testCaseId);
        await deleteSession(testCaseId);
        await deleteFolder(`validations/${testCaseId}/screenshots`);
        await getOrCreateSessionForTestCase(testCaseId, user.userId);

        const stepsSessions: any = {};
        const stepsMessageHandlers: any = {};
        for (const step of steps) {
            await deleteSession(step.id);
            await deleteValidationIfExists(step.id);
            await deleteFolder(`validations/${step.id}/screenshots`);
            await sessionStore.removeSession(step.id);
            const session = await getOrCreateSessionForTestCase(step.id, user.userId);
            stepsSessions[step.id] = session?.sessionId;
            if (!session) {
                return res.status(500).json({ success: false, error: "Could not create or retrieve a session for the test case" });
            }
            const messageHandler = await getMessageHandler(session.sessionId, true);
            stepsMessageHandlers[step.id] = messageHandler;
        }

        res.json({
            success: true,
            status: "processing",
            sessionId: testCaseId,
            message: "Message received, processing has started. Updates will be available via polling."
        });

        runNavigationTestCaseAgent(stepsSessions, stepsMessageHandlers, user.userId, testCaseId, mcpClient, "test-case").catch(error => {
            console.error(`Error processing response: ${error instanceof Error ? error.message : "Unknown error"}`);
        });

    } catch (error) {
        console.error(`Error processing chat message for test case: ${error instanceof Error ? error.message : "Unknown error"}`);
        return res.status(500).json({ success: false, error: "Failed to process message for test case" });
    }
});

// For browser extension to update screenshot
router.post("/screenshot/:sessionId", async (req: Request, res: Response) => {
    // ... existing code ...
});

export default router;