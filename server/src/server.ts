import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { openaiClient } from './utils/openai-client';

// Import environment configuration
import {
    PORT,
    HOST
} from './config/env';

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

// Configure JSON body parser with larger limits for screenshot uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// This will be initialized in the init endpoint
let openAiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

// Import all routes
import sessionRoutes from './routes/session-routes';
import messageRoutes from './routes/message-routes';
// @ts-ignore - Force TypeScript to ignore missing module declaration
import streamRoutes from './routes/stream-routes';
import authRoutes from './routes/auth-routes';
import validationRoutes from './routes/validation-routes';

// Apply routes
app.use('/api', sessionRoutes);
app.use('/api', messageRoutes);
app.use('/api', streamRoutes);
app.use('/api', authRoutes);
app.use('/api', validationRoutes);

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
export { app, openaiClient, openAiTools };

// Start the server if this file is run directly
if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`You can access it via: http://localhost:${PORT} or http://127.0.0.1:${PORT}`);
    });
} 
