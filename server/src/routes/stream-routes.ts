import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware';
import { getSessionMetadata } from '../services/firebase-sessions';
import { MessageHandler } from '../services/messages';
import { mcpClient } from '../utils/client.js';
import sessionStore from '../services/session-store';
import {
    getStreamState,
    setStreamState,
    clearStreamState
} from '../services/firebase-sessions';
import { Router } from 'express';
import { storeScreenshot } from '../services/firebase-storage';

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

    // Flag to prevent overlapping screenshot calls
    let isProcessingScreenshot = false;

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

        const startTime = Date.now();
        console.log(`Starting screenshot capture for session ${sessionId}`);

        try {
            // Check if the stream is paused
            const streamState = await getStreamState(sessionId) || {
                active: true,
                sessionId,
                pauseReason: '',
                pausedAt: 0,
                resumedAt: 0,
                lastScreenshotAt: 0,
                lastPerceptualHash: '',
                similarityThreshold: 70, // Default 70% similarity threshold
                minScreenshotInterval: 2000, // Default 2 seconds between screenshots
                blankImageThreshold: 0.90 // Default threshold for blank image detection
            };

            const stateCheckTime = Date.now();
            console.log(`Stream state fetch took ${stateCheckTime - startTime}ms for session ${sessionId}`);
            console.log(`Stream is paused for session ${streamState.active}, sending pause notification`);

            // If the stream is paused, send a status message and return
            if (!streamState.active) {
                console.log(`Stream is paused for session ${sessionId}, sending pause notification`);
                const pauseMessage = `event: status\ndata: {"type":"paused","message":"Stream paused","reason":"${streamState.pauseReason || 'client_request'}"}\n\n`;
                safeSend(pauseMessage, "pause notification");
                return;
            }

            // Call MCP for screenshot
            console.log(`Calling MCP for screenshot at ${Date.now() - startTime}ms`);
            const result = await mcpClient.callTool({
                name: "browser_take_screenshot",
                arguments: {}
            });

            const screenshotTime = Date.now();
            console.log(`MCP screenshot capture took ${screenshotTime - stateCheckTime}ms for session ${sessionId}`);

            // Find image data
            if (!result || !result.content || !Array.isArray(result.content)) {
                throw new Error("Invalid screenshot response");
            }

            const imageContent = result.content.find(
                item => item.type === 'image'
            );

            if (imageContent && imageContent.data) {
                console.log(`Starting duplicate check at ${Date.now() - startTime}ms`);
                // First, check if this is a new screenshot worth storing
                const screenshotResult = await storeScreenshot(
                    sessionId,
                    `data:${imageContent.mimeType || 'image/png'};base64,${imageContent.data}`,
                    streamState.lastPerceptualHash,
                    streamState.similarityThreshold, // Pass the similarity threshold
                    streamState.blankImageThreshold // Pass the blank image threshold
                );

                const processTime = Date.now();
                console.log(`Screenshot processing took ${processTime - screenshotTime}ms for session ${sessionId}`);

                // Only send to the client if it's a new screenshot (not a duplicate)
                console.log(`Screenshot result: ${JSON.stringify(screenshotResult)}`);
                if (screenshotResult) {
                    const similarityInfo = screenshotResult.similarity
                        ? `, similarity: ${screenshotResult.similarity.toFixed(2)}%`
                        : '';
                    console.log(`New screenshot detected for session ${sessionId}, hash: ${screenshotResult.hash.substring(0, 8)}...${similarityInfo}`);

                    // Send the screenshot data to the client only after confirming it's not a duplicate
                    const message = `data: data:${imageContent.mimeType || 'image/png'};base64,${imageContent.data}\n\n`;
                    safeSend(message, "screenshot");
                    console.log(`Screenshot sent to client at ${Date.now() - startTime}ms for session ${sessionId}`);

                    // Update the last screenshot timestamp AND hash in Firebase
                    setStreamState(sessionId, {
                        lastScreenshotAt: Date.now(),
                        lastPerceptualHash: screenshotResult.hash
                    }).catch(error => {
                        console.error(`Failed to update screenshot timestamp: ${error instanceof Error ? error.message : "Unknown error"}`);
                    });

                    // Only reset error count if we successfully processed a new screenshot
                    errorCount = 0;
                } else {
                    console.log(`Duplicate screenshot detected for session ${sessionId}, skipping send after ${Date.now() - startTime}ms total processing time`);

                    // Send a status update to inform the client we're still active but no new image
                    const statusMsg = `event: status\ndata: {"type":"no_update","message":"No significant changes detected"}\n\n`;
                    safeSend(statusMsg, "no update notification");
                }
            } else {
                throw new Error("No image data found in response");
            }

            const endTime = Date.now();
            console.log(`Total screenshot process took ${endTime - startTime}ms for session ${sessionId}`);
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

    // Set up a heartbeat to periodically check and sync stream state
    const heartbeatInterval = setInterval(async () => {
        if (!isStreamConnected) {
            clearInterval(heartbeatInterval);
            return;
        }

        try {
            // Get current state from Firebase
            const currentState = await getStreamState(sessionId);
            if (!currentState) return;

            // Send heartbeat with current state
            const heartbeatMsg = `event: heartbeat\ndata: {"timestamp":${Date.now()},"state":"${currentState.active ? 'active' : 'paused'}"}\n\n`;
            safeSend(heartbeatMsg, "heartbeat");

            // Send appropriate status based on state
            if (!currentState.active) {
                // If paused, make sure client knows
                const pauseMessage = `event: status\ndata: {"type":"paused","message":"Stream paused","reason":"${currentState.pauseReason || 'client_request'}"}\n\n`;
                safeSend(pauseMessage, "pause reminder");
            } else {
                // If active, send a keepalive to ensure client doesn't time out waiting for images
                const keepAliveMsg = `event: status\ndata: {"type":"keepalive","message":"Stream active, waiting for significant changes"}\n\n`;
                safeSend(keepAliveMsg, "keepalive");
            }
        } catch (error) {
            console.error(`Heartbeat error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, 10000); // Check every 10 seconds

    // Handle client disconnection
    req.on("close", async () => {
        isStreamConnected = false;

        if (screenshotInterval) {
            clearInterval(screenshotInterval);
        }

        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }

        console.log(`Browser stream closed for session ${sessionId}`);

        // Set stream as inactive but don't clear the state
        // This way screenshots are preserved for later viewing
        try {
            await setStreamState(sessionId, {
                active: false,
                pauseReason: 'stream_disconnected',
                pausedAt: Date.now()
            });
            console.log(`Set stream state to inactive for session ${sessionId}`);
        } catch (e) {
            console.error(`Failed to update stream state: ${e instanceof Error ? e.message : "Unknown error"}`);
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

export default router; 