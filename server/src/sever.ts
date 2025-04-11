import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

// Import environment configuration
import {
    PORT,
    HOST,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    OPENAI_TIMEOUT
} from './config/env';

// Import message handler
import { MessageHandler } from './services/messages';

// Import session store
import sessionStore from './services/session-store';

// Import Firebase services
import {
    sessionHasMessages
} from './services/firebase-messages';

import {
    createSession as createFirebaseSession,
    sessionExists,
    updateSessionActivity
} from './services/firebase-sessions';

// Initialize express app
const app = express();

// Apply middleware
app.use(cors({
    origin: "*", // Allow requests from any origin
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-ID", "Cache-Control"],
    exposedHeaders: ["Connection", "Content-Type", "Cache-Control"]
}));

// Add custom CORS headers for all responses, especially for SSE
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control");
    res.header("Access-Control-Expose-Headers", "Content-Type, Cache-Control");

    // Special handling for SSE requests
    if (req.path.includes('/browser-stream')) {
        // These headers are crucial for SSE connections
        res.header("Cache-Control", "no-cache, no-transform");
        res.header("Connection", "keep-alive");
        res.header("X-Accel-Buffering", "no"); // Prevents proxy buffering
    }

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

app.use(express.json());

// Rate limiting middleware (basic implementation)
app.use(async (req, res, next) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const path = req.path;

    // Skip rate limiting for health checks
    if (path === "/health") {
        return next();
    }

    // Proceed to next middleware
    next();
});

// Initialize OpenAI with a fallback key for testing if needed
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY || "sk-dummy-key-for-testing-purposes-only",
    baseURL: `https://llm-dev.medable.tech`
});

// This will be initialized in the init endpoint
let openAiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

// Get or create a message handler for a session
async function getOrCreateMessageHandler(sessionId: string): Promise<MessageHandler> {
    let messageHandler = sessionStore.getMessageHandler(sessionId);

    if (!messageHandler) {
        // Check if the session exists in Firebase
        const exists = await sessionExists(sessionId);

        if (exists) {
            // Session exists in Firebase but not in memory - restore it
            console.log(`Restoring existing session from Firebase: ${sessionId}`);
            messageHandler = new MessageHandler(sessionId);
            sessionStore.setMessageHandler(sessionId, messageHandler);

            // Update session activity
            await updateSessionActivity(sessionId);

            // Load messages
            const hasExistingMessages = await sessionHasMessages(sessionId);
            if (hasExistingMessages) {
                console.log(`Found existing messages for session: ${sessionId}, loading them`);
                await messageHandler.loadMessages(false);
            }
        } else {
            // No session found in Firebase or memory
            console.log(`Session ${sessionId} not found in Firebase, creating new message handler`);
            messageHandler = new MessageHandler(sessionId);
            sessionStore.setMessageHandler(sessionId, messageHandler);
        }
    } else {
        // Session exists in memory, update activity in Firebase
        await updateSessionActivity(sessionId);
    }

    return messageHandler;
}

// Import all routes
import sessionRoutes from './routes/session-routes';
import messageRoutes from './routes/message-routes';
// @ts-ignore - Force TypeScript to ignore missing module declaration
import streamRoutes from './routes/stream-routes';
import authRoutes from './routes/auth-routes';

// Apply routes
app.use('/api', sessionRoutes);
app.use('/api', messageRoutes);
app.use('/api', streamRoutes);
app.use('/api', authRoutes);


// Add a health check endpoint
app.get("/api/health", (_req, res) => {
    res.json({
        success: true,
        status: "healthy",
        timestamp: Date.now()
    });
});

// Add a ping endpoint that doesn't require auth
app.get("/api/ping", (_req, res) => {
    res.json({
        success: true,
        message: "Server is running"
    });
});

// Export for external use (e.g., in tests)
export { app, openai, openAiTools, getOrCreateMessageHandler };

// Start the server if this file is run directly
if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`You can access it via: http://localhost:${PORT} or http://127.0.0.1:${PORT}`);
    });
} 
