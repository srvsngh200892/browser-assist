import './config/firebase'; // This will initialize firebase
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import OpenAI from 'openai';
import { openaiClient } from './utils/openai-client';
import {
    PORT,
    HOST
} from './config/env';

import sessionRoutes from './routes/session-routes';
import messageRoutes from './routes/message-routes';
import streamRoutes from './routes/stream-routes';
import authRoutes from './routes/auth-routes';
import validationRoutes from './routes/validation-routes';
import testCycleRoutes from './routes/testCycle';

const app = express();

// Set your frontend domain explicitly for CORS
const allowedOrigin = process.env.CLIENT_URL // ✅ change this in prod

app.use(cors({
    origin: allowedOrigin,
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    credentials: true
}));

// Special headers for SSE requests only
app.use((req, res, next) => {
    if (req.path.includes('/browser-stream')) {
        res.header("Cache-Control", "no-cache, no-transform");
        res.header("Connection", "keep-alive");
        res.header("X-Accel-Buffering", "no");
    }

    // Handle preflight requests manually if needed (usually cors handles it)
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

// Body parsers and cookie parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Basic rate limiting (placeholder)
app.use(async (req, res, next) => {
    if (req.path === "/health") return next();
    next();
});

// Mount routes
app.use('/api', sessionRoutes);
app.use('/api', messageRoutes);
app.use('/api', streamRoutes);
app.use('/api', authRoutes);
app.use('/api', validationRoutes);
app.use('/api', testCycleRoutes);

// Health and ping
app.get("/api/health", (_req, res) => {
    res.json({ success: true, status: "healthy", timestamp: Date.now() });
});
app.get("/api/ping", (_req, res) => {
    res.json({ success: true, message: "Server is running" });
});

// OpenAI tools export
let openAiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
export { app, openaiClient, openAiTools };

// Run the server
if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`Server running at http://${HOST}:${PORT}`);
    });
}
