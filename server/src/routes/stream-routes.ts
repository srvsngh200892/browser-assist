import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware';
import { getSessionMetadata } from '../services/firebase-sessions';
import { MessageHandler } from '../services/messages';
import { mcpClient } from '../utils/client.js';
import sessionStore from '../services/session-store';
import {
    StreamState,
    getStreamState,
    setStreamState,
    clearStreamState
} from '../services/firebase-sessions';
import { ReadableStream } from 'stream/web';
import { Router } from 'express';

// Extend the Express Request type to include user
interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        email?: string;
        displayName?: string;
        lastLogin?: string;
    };
}

// Express Response with optional flush method
interface ExpressResponseWithFlush extends Response {
    flush?: () => void;
}

// Create router
const router: Router = express.Router();


// Stream disconnect endpoint
router.post("/stream-disconnect", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { sessionId } = req.body;

        if (sessionId) {
            console.log(`Stream disconnect request for session: ${sessionId}`);

            // Remove the session's stream state from Firebase
            await clearStreamState(sessionId);
            console.log(`Cleared stream state for session ${sessionId} in Firebase`);
        }

        res.json({
            success: true,
            message: "Stream disconnect acknowledged"
        });
    } catch (error) {
        console.error(`Error handling stream disconnect: ${error instanceof Error ? error.message : "Unknown error"}`);
        res.status(500).json({
            success: false,
            error: "Failed to process stream disconnect"
        });
    }
});


// Add endpoint for taking a screenshot
router.get("/screenshot", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Get the sessionId from the query parameter
        const sessionId = req.query.sessionId?.toString() || "global";

        let screenshot;
        let mimeType = 'image/png';
        let statusMessage = "Success";

        try {
            // Try to get screenshot from MCP browser_take_screenshot tool
            const result = await mcpClient.callTool({
                name: "browser_take_screenshot",
                arguments: {}
            });

            // Extract screenshot data from MCP result
            if (!result || !result.content || !Array.isArray(result.content) || result.content.length === 0) {
                throw new Error("Invalid screenshot response format from MCP");
            }

            const imageContent = result.content.find(item => item.type === 'image');
            if (!imageContent || !imageContent.data) {
                throw new Error("No image data found in MCP response");
            }

            screenshot = imageContent.data;
            mimeType = imageContent.mimeType || 'image/png';

            // Add debugging to check screenshot content
            console.log(`MCP Screenshot captured for session ${sessionId}: ${screenshot ? 'Success' : 'Empty'}`);
            console.log(`MCP Screenshot size: ${screenshot ? screenshot.length : 0} bytes`);
            console.log(`MCP Screenshot type: ${mimeType}`);
        } catch (error: unknown) {
            console.error(`Screenshot error for session ${sessionId}:`, error);
            statusMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;

            // Generate a fallback SVG
            mimeType = 'image/svg+xml';
            const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
                <rect width="100%" height="100%" fill="#ffffff" />
                
                <!-- Main Content Area - Full width/height -->
                <rect x="0" y="0" width="800" height="600" fill="#ffffff" />
                
                <!-- Assistant Logo/Icon -->
                <text x="400" y="175" font-family="Arial" font-size="60" text-anchor="middle">🤖</text>
                <path d="M400,135 v50 M375,160 h50" stroke="#ffffff" stroke-width="4" />
                
                <!-- Welcome Text -->
                <text x="400" y="230" font-family="Arial" font-size="24" font-weight="bold" fill="#202124" text-anchor="middle">Welcome to Browse Assist</text>
                <text x="400" y="260" font-family="Arial" font-size="16" fill="#5f6368" text-anchor="middle">Your intelligent browser automation companion</text>
                
                <!-- Search bar -->
                <rect x="200" y="290" width="400" height="50" rx="25" ry="25" fill="#ffffff" stroke="#dfe1e5" stroke-width="1" />
                
                <path d="M220,315 a7,7 0 1,0 0.1,0 z M225,320 l5,5" stroke="#6b46c1" stroke-width="2" fill="none" />
                <text x="400" y="322" font-family="Arial" font-size="16" fill="#9aa0a6" text-anchor="middle">Ask me anything...</text>
            </svg>`;

            // Convert SVG to base64
            const encoder = new TextEncoder();
            const data = encoder.encode(svgContent);
            screenshot = btoa(String.fromCharCode(...data));
        }

        res.json({
            success: true,
            image: `data:${mimeType};base64,${screenshot}`,
            timestamp: Date.now(),
            status: statusMessage,
            sessionId: sessionId
        });
    } catch (error: unknown) {
        console.error("Screenshot endpoint error:", error);
        res.status(500).json({
            success: false,
            error: `Failed to capture screenshot: ${error instanceof Error ? error.message : "Unknown error"}`
        });
    }
});

// Add endpoint for browser stream
router.get("/browser-stream/:sessionId", async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    if (!sessionId) {
        return res.status(400).send("Session ID is required");
    }

    // Validate token if provided
    let userId = null;

    // First check if the session exists in memory
    if (!sessionStore.sessionExists(sessionId)) {
        console.log(`Session ${sessionId} not found in memory, checking Firebase...`);

        // If not in memory, check if it exists in Firebase
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).send("Session not found");
        }

        // If userId is provided from token, verify session belongs to that user
        if (userId && sessionData.userId && sessionData.userId !== userId) {
            console.error(`User ${userId} attempted to access session belonging to ${sessionData.userId}`);
            return res.status(403).send("Unauthorized access to session");
        }

        // Session exists in Firebase but not in memory, create it
        console.log(`Session ${sessionId} found in Firebase, creating memory handler`);
        const messageHandler = new MessageHandler(sessionId);
        sessionStore.setMessageHandler(sessionId, messageHandler);
    }

    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    // Immediately send an initial event to test connection
    res.write('event: status\ndata: {"type":"connected","sessionId":"' + sessionId + '"}\n\n');

    // Flush the response to ensure headers are sent immediately
    const expressRes = res as ExpressResponseWithFlush;
    if (expressRes.flush) {
        expressRes.flush();
    }

    console.log(`Browser stream started for session ${sessionId}`);

    // Flag to track if the connection is active
    let isStreamConnected = true;

    // Function to safely send data
    const safeSend = (data: string, operation = "unknown") => {
        if (!isStreamConnected) {
            console.log(`Skipping send for ${operation}: stream disconnected`);
            return false;
        }

        try {
            res.write(data);
            const expressRes = res as ExpressResponseWithFlush;
            if (expressRes.flush) {
                expressRes.flush();
            }
            return true;
        } catch (error) {
            console.error(`Failed to send data for ${operation}: ${error instanceof Error ? error.message : "Unknown error"}`);
            isStreamConnected = false;
            return false;
        }
    };

    // Store stream state in Firebase
    setStreamState(sessionId, {
        active: true,
        lastScreenshotAt: Date.now()
    }).catch(error => {
        console.error(`Failed to initialize stream state: ${error instanceof Error ? error.message : "Unknown error"}`);
    });

    // Function to take and send screenshots
    let errorCount = 0;
    let screenshotInterval: NodeJS.Timeout | null = null;

    const sendScreenshot = async () => {
        if (!isStreamConnected) return;

        try {
            // Check if the stream is paused
            const streamState = await getStreamState(sessionId) || {
                active: true,
                sessionId,
                pauseReason: '',
                pausedAt: 0,
                resumedAt: 0,
                lastScreenshotAt: 0
            };

            // If the stream is paused, send a status message
            if (!streamState.active) {
                const pauseMessage = `event: status\ndata: {"type":"paused","message":"Stream paused","reason":"${streamState.pauseReason || 'client_request'}"}\n\n`;
                safeSend(pauseMessage, "pause notification");
                return;
            }

            // Call MCP for screenshot
            const result = await mcpClient.callTool({
                name: "browser_take_screenshot",
                arguments: {}
            });

            // Find image data
            if (!result || !result.content || !Array.isArray(result.content)) {
                throw new Error("Invalid screenshot response");
            }

            const imageContent = result.content.find(
                item => item.type === 'image'
            );

            if (imageContent && imageContent.data) {
                // Send the screenshot
                const message = `data: data:${imageContent.mimeType || 'image/png'};base64,${imageContent.data}\n\n`;
                safeSend(message, "screenshot");

                // Update the last screenshot timestamp in Firebase
                setStreamState(sessionId, {
                    lastScreenshotAt: Date.now()
                }).catch(error => {
                    console.error(`Failed to update screenshot timestamp: ${error instanceof Error ? error.message : "Unknown error"}`);
                });

                errorCount = 0;
            } else {
                throw new Error("No image data found in response");
            }
        } catch (error) {
            errorCount++;
            console.error(`Screenshot error (${errorCount}): ${error instanceof Error ? error.message : "Unknown error"}`);

            // Try to send error message
            try {
                const errorMsg = `event: status\ndata: {"type":"error","message":"${error instanceof Error ? error.message.replace(/"/g, '\\"') : "Unknown error"}"}\n\n`;
                safeSend(errorMsg, "error notification");
            } catch (e) {
                console.error(`Failed to send error event: ${e instanceof Error ? e.message : "Unknown error"}`);
            }
        }
    };

    // Start the screenshot interval
    screenshotInterval = setInterval(() => {
        sendScreenshot().catch(err => {
            console.error(`Error in screenshot interval: ${err instanceof Error ? err.message : "Unknown error"}`);
        });
    }, 1000);

    // First screenshot immediately
    sendScreenshot().catch(err => {
        console.error(`Error in initial screenshot: ${err instanceof Error ? err.message : "Unknown error"}`);
    });

    // Handle client disconnection
    req.on("close", async () => {
        isStreamConnected = false;

        if (screenshotInterval) {
            clearInterval(screenshotInterval);
        }

        console.log(`Browser stream closed for session ${sessionId}`);

        // Clear the stream state in Firebase
        try {
            await clearStreamState(sessionId);
            console.log(`Cleared stream state for session ${sessionId}`);
        } catch (e) {
            console.error(`Failed to clear stream state: ${e instanceof Error ? e.message : "Unknown error"}`);
        }
    });

    // Set a maximum duration for the stream
    setTimeout(() => {
        if (isStreamConnected) {
            console.log(`Maximum stream duration reached for session ${sessionId}`);
            isStreamConnected = false;

            if (screenshotInterval) {
                clearInterval(screenshotInterval);
            }

            const closeMsg = `event: status\ndata: {"type":"timeout","message":"Maximum stream duration reached"}\n\n`;
            safeSend(closeMsg, "stream timeout");

            res.end();

            // Clear the stream state in Firebase
            clearStreamState(sessionId).catch(error => {
                console.error(`Failed to clear stream state: ${error instanceof Error ? error.message : "Unknown error"}`);
            });
        }
    }, 30 * 60 * 1000); // 30 minute maximum
});

// Stream control endpoint (pause/resume)
router.post("/stream-control", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { sessionId, action, reason } = req.body;

        if (!sessionId || !action) {
            return res.status(400).json({
                success: false,
                error: "Missing required parameters: sessionId and action"
            });
        }

        console.log(`Stream control request: ${action} for session ${sessionId} (reason: ${reason || 'not specified'})`);

        // Update the stream state in Firebase based on the action
        let success = false;
        if (action === 'pause') {
            success = await setStreamState(sessionId, {
                active: false,
                pauseReason: reason || 'client_request',
                pausedAt: Date.now()
            });
            console.log(`Stream paused for session ${sessionId} in Firebase`);
        } else if (action === 'resume') {
            success = await setStreamState(sessionId, {
                active: true,
                pauseReason: '',
                resumedAt: Date.now()
            });
            console.log(`Stream resumed for session ${sessionId} in Firebase`);
        } else {
            return res.status(400).json({
                success: false,
                error: `Invalid action: ${action}. Supported actions: pause, resume`
            });
        }

        if (!success) {
            return res.status(404).json({
                success: false,
                error: `Session ${sessionId} not found or could not update stream state`
            });
        }

        // Get the updated stream state to include in response
        const streamState = await getStreamState(sessionId);
        const isActive = streamState ? streamState.active : true;

        res.json({
            success: true,
            message: `Stream ${action} request acknowledged`,
            sessionId,
            action,
            state: isActive ? 'active' : 'paused'
        });
    } catch (error) {
        console.error(`Error handling stream control: ${error instanceof Error ? error.message : "Unknown error"}`);
        res.status(500).json({
            success: false,
            error: "Failed to process stream control request"
        });
    }
});

// Export router
export default router; 