import { Application, Router } from "oak";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import OpenAI from "npm:openai@4.76.1";
import { mcpClient } from "./client.ts";
import {
    applyToolCallsIfPresent,
    isDone,
    mapToolListToOpenAiTools,
} from "./openai-utils.ts";
import { OPENAI_API_KEY, OPENAI_MODEL } from "./env.ts";
import { MessageHandler, type MessageType } from "./messages.ts";
import { performNextStepSystemPrompt } from "./prompts.ts";
import { randomUUID } from "node:crypto";
import { initFirebase, sessionHasMessages, getNewMessages } from "./firebase-messages.ts";
import {
    createSession as createFirebaseSession,
    sessionExists,
    getSessionMetadata,
    updateSessionActivity,
    listActiveSessions,
    createSession,
    setStreamState,
    getStreamState,
    clearStreamState,
    StreamState
} from "./firebase-sessions.ts";

import { createUser, getUserByEmail, validateUser } from "./firebase-users.ts";
import { authMiddleware } from "./auth-middleware.ts";
import { createToken } from "./jwt-utils.ts";
import { estimateTokenCount, summarizeConversation, createSummarizedMessages, MAX_TOKEN_LIMIT, TOKEN_THRESHOLD } from "./token-utils.ts";

// Define HTTP server constants
const PORT = 3001;
const HOST = "0.0.0.0";

const app = new Application();
const router = new Router();

// Apply CORS middleware
app.use(oakCors({
    origin: "*", // Allow requests from any origin
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    headers: ["Content-Type", "Authorization"]
}));

app.use(async (ctx, next) => {
    const ip = ctx.request.ip || "unknown";
    const now = Date.now();
    const path = ctx.request.url.pathname;

    // Skip rate limiting for health checks
    if (path === "/health") {
        await next();
        return;
    }
    // Proceed to next middleware
    await next();
});

// Initialize OpenAI with a fallback key for testing if needed
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY || "sk-dummy-key-for-testing-purposes-only",
    baseURL: `https://llm-dev.medable.tech`
});

// This will be initialized in the init endpoint
let openAiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

// Initialize message handlers for each session
const sessions = new Map<string, MessageHandler>();

// Add at the top of file with other global variables
// REMOVED: const activeStreamSessions = new Map(); // Map to track active stream sessions with their state
// This global map is not scalable across multiple servers and will be replaced with Firebase

// Initialize tools at server startup
async function initializeTools() {
    try {
        console.log("Initializing MCP tools...");

        // Check if MCP client is connected
        if (!mcpClient) {
            console.error("MCP client is not initialized!");
            return false;
        }

        console.log("Checking MCP tools availability...");
        const mcpToolsList = await mcpClient.listTools();

        if (!mcpToolsList || mcpToolsList.length === 0) {
            console.error("No MCP tools found! Please check your MCP server configuration.");
            return false;
        }

        // Check if browser_take_screenshot tool is available
        const screenshotTool = Array.isArray(mcpToolsList) && mcpToolsList.find(tool =>
            tool?.name === "browser_take_screenshot" ||
            tool?.schema?.name === "browser_take_screenshot"
        );

        if (!screenshotTool) {
            console.warn("browser_take_screenshot tool not found in available MCP tools!");
            if (Array.isArray(mcpToolsList)) {
                const toolNames = mcpToolsList.map(t => t?.name || t?.schema?.name).filter(Boolean);
                console.warn("Available tools:", toolNames.join(", ") || "none");
            }
        } else {
            console.log("browser_take_screenshot tool is available!");
        }

        openAiTools = mapToolListToOpenAiTools(mcpToolsList);
        console.log(`Successfully initialized ${openAiTools.length} tools`);

        // Test MCP screenshot tool
        try {
            console.log("Testing MCP browser_take_screenshot tool...");
            const testResult = await mcpClient.callTool({
                name: "browser_take_screenshot",
                arguments: {}
            });

            if (!testResult || !testResult.content || !Array.isArray(testResult.content)) {
                console.warn("MCP Screenshot test returned unexpected format:", testResult);
                console.log("Screenshots may not work correctly - please check MCP server configuration");
            } else {
                const imageContent = testResult.content.find(item => item.type === 'image');
                if (!imageContent || !imageContent.data) {
                    console.warn("MCP Screenshot test: No image data found in response");
                    console.log("Screenshots may be blank - please check MCP server configuration");
                } else {
                    console.log("MCP Screenshot test successful! Image size:", imageContent.data.length, "bytes");
                    console.log("MCP Screenshot type:", imageContent.mimeType || 'image/png');
                }
            }
        } catch (testError) {
            console.error("MCP Screenshot test failed:", testError);
            console.error("This will cause blank screenshots. Make sure the MCP browser is running with:");
            console.error("npx @playwright/mcp@latest");
        }

        return true;
    } catch (error) {
        console.error("Failed to initialize MCP tools:", error);
        return false;
    }
}

// Get or create a message handler for a session
async function getOrCreateMessageHandler(sessionId: string): Promise<MessageHandler> {
    let messageHandler = sessions.get(sessionId);

    if (!messageHandler) {
        // Check if the session exists in Firebase
        const exists = await sessionExists(sessionId);

        if (exists) {
            // Session exists in Firebase but not in memory - restore it
            console.log(`Restoring existing session from Firebase: ${sessionId}`);
            messageHandler = new MessageHandler(sessionId);
            sessions.set(sessionId, messageHandler);

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
            sessions.set(sessionId, messageHandler);
        }
    } else {
        // Session exists in memory, update activity in Firebase
        await updateSessionActivity(sessionId);
    }

    return messageHandler;
}

// Function to handle session creation and response
router.post("/session", authMiddleware, async (ctx) => {
    try {
        // Get user information from the authentication middleware
        const user = ctx.state.user;
        if (!user || !user.userId) {
            ctx.response.status = 401;
            ctx.response.body = {
                success: false,
                error: "Authentication required"
            };
            return;
        }

        // Prevent duplicate session creations from the same IP in rapid succession
        const requestIP = ctx.request.ip || "unknown";

        const sessionId = crypto.randomUUID();
        const messageHandler = new MessageHandler(sessionId);
        sessions.set(sessionId, messageHandler);

        // Create the session in Firebase with metadata
        const userAgent = ctx.request.headers.get("user-agent") || "unknown";
        const metadata = {
            createdFrom: requestIP,
            userAgent,
            startedAt: new Date().toISOString()
        };

        // Pass the user ID to associate the session with the user
        await createFirebaseSession(sessionId, user.userId, metadata);
        console.log(`Created new session: ${sessionId} for user: ${user.userId} (stored in Firebase)`);

        ctx.response.body = {
            success: true,
            sessionId,
            message: "Session created"
        };
    } catch (error) {

        console.error(`Error creating session: ${error instanceof Error ? error.message : "Unknown error"}`);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: "Failed to create session"
        };
    }
});

// Add endpoint to get messages for a session
router.get("/messages/:sessionId", authMiddleware, async (ctx) => {
    try {
        // Get user information from the authentication middleware
        const user = ctx.state.user;
        if (!user || !user.userId) {
            ctx.response.status = 401;
            ctx.response.body = {
                success: false,
                error: "Authentication required"
            };
            return;
        }

        const { sessionId } = ctx.params;
        if (!sessionId) {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Missing session ID"
            };
            return;
        }

        // First check if session exists in Firebase
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            ctx.response.status = 404;
            ctx.response.body = {
                success: false,
                error: "Session not found"
            };
            return;
        }

        // Verify that the session belongs to the authenticated user
        if (sessionData.userId !== user.userId) {
            ctx.response.status = 403;
            ctx.response.body = {
                success: false,
                error: "You do not have permission to access this session"
            };
            return;
        }

        // Update session activity
        await updateSessionActivity(sessionId);

        // Get or create the message handler for this session
        const messageHandler = await getOrCreateMessageHandler(sessionId);

        // Get the last retrieval time
        const lastRetrievalTime = messageHandler.getLastRetrievalTime();

        // Set parameters for query
        const since = ctx.request.url.searchParams.get("since");
        const limit = parseInt(ctx.request.url.searchParams.get("limit") || "50", 10); // Default to 50 messages
        const page = parseInt(ctx.request.url.searchParams.get("page") || "1", 10); // Pagination support
        const lastQueryTime = since ? parseInt(since, 10) : lastRetrievalTime;

        // Get messages, either all or just new ones based on the query parameter
        let messages;
        if (lastQueryTime > 0 && since) {
            // Only get new messages since the last retrieval
            messages = await getNewMessages(sessionId, lastQueryTime);
            console.log(`Fetched ${messages.length} new messages for session ${sessionId} since ${new Date(lastQueryTime).toISOString()}`);
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

        console.log(`Session ${sessionId}: Returning ${paginatedMessages.length} messages (page ${page}, limit ${limit}, total ${totalCount})`);

        // Add debug logging to check if tool_calls are present in the messages
        const hasTool = paginatedMessages.some(m => m.tool_calls && m.tool_calls.length > 0);
        if (hasTool) {
            console.log(`Session ${sessionId}: Found messages with tool_calls`);

            // Log the first message with tool_calls for debugging
            const toolMessage = paginatedMessages.find(m => m.tool_calls && m.tool_calls.length > 0);
            if (toolMessage) {
                console.log(`Tool message example: ${JSON.stringify({
                    role: toolMessage.role,
                    tool_calls_count: toolMessage.tool_calls?.length,
                    first_tool: toolMessage.tool_calls?.[0]?.function?.name
                })}`);
            }
        }

        // Determine if processing is complete
        let isDone = false;

        if (messages.length > 0) {
            const lastAssistantMessage = messages.filter(message => message.role === 'assistant' && message.finish_reason === 'stop')[0];
            console.log(`Session ${sessionId}: Last assistant message: ${JSON.stringify(lastAssistantMessage)}`);

            // Now we can directly check the finish_reason on the message
            if (lastAssistantMessage) {
                // If the last message is an assistant message with finish_reason 'stop', we're done
                isDone = true;
            }

            console.log(`Session ${sessionId}: Response isDone = ${isDone} (lastAssistantMessages role: ${lastAssistantMessage?.role}, finish_reason: ${lastAssistantMessage?.finish_reason || 'none'})`);
        }

        // Update the last retrieval time
        const newRetrievalTime = messageHandler.updateLastRetrievalTime();

        ctx.response.body = {
            success: true,
            sessionId,
            messages: paginatedMessages,
            totalCount,
            page,
            limit,
            hasMore: endIndex < totalCount,
            isDone,
            timestamp: newRetrievalTime
        };
    } catch (error) {
        console.error(`Error fetching messages: ${error instanceof Error ? error.message : "Unknown error"}`);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: "Failed to fetch messages"
        };
    }
});

// New endpoint to handle stream disconnect
router.post("/stream-disconnect", authMiddleware, async (ctx) => {
    try {
        const body = await ctx.request.body().value;

        if (body && body.sessionId) {
            const { sessionId } = body;
            console.log(`Stream disconnect request for session: ${sessionId}`);

            // Remove the session's stream state from Firebase
            await clearStreamState(sessionId);
            console.log(`Cleared stream state for session ${sessionId} in Firebase`);
        }

        ctx.response.body = {
            success: true,
            message: "Stream disconnect acknowledged"
        };
    } catch (error) {
        console.error(`Error handling stream disconnect: ${error instanceof Error ? error.message : "Unknown error"}`);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: "Failed to process stream disconnect"
        };
    }
});

// New endpoint to handle stream control (pause/resume)
router.post("/stream-control", authMiddleware, async (ctx) => {
    try {
        const body = await ctx.request.body().value;

        if (!body || !body.sessionId || !body.action) {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Missing required parameters: sessionId and action"
            };
            return;
        }

        const { sessionId, action, reason } = body;
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
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: `Invalid action: ${action}. Supported actions: pause, resume`
            };
            return;
        }

        if (!success) {
            ctx.response.status = 404;
            ctx.response.body = {
                success: false,
                error: `Session ${sessionId} not found or could not update stream state`
            };
            return;
        }

        // Get the updated stream state to include in response
        const streamState = await getStreamState(sessionId);
        const isActive = streamState ? streamState.active : true;

        ctx.response.body = {
            success: true,
            message: `Stream ${action} request acknowledged`,
            sessionId,
            action,
            state: isActive ? 'active' : 'paused'
        };
    } catch (error) {
        console.error(`Error handling stream control: ${error instanceof Error ? error.message : "Unknown error"}`);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: "Failed to process stream control request"
        };
    }
});

// Add a health check endpoint
router.get("/health", (ctx) => {
    ctx.response.body = {
        success: true,
        status: "healthy",
        timestamp: Date.now()
    };
});

// Add a ping endpoint that doesn't require auth
router.get("/ping", (ctx) => {
    ctx.response.body = {
        success: true,
        message: "Server is running"
    };
});

// Get session info
router.get("/session/:sessionId", authMiddleware, async (ctx) => {
    try {
        const { sessionId } = ctx.params;
        if (!sessionId) {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Missing session ID"
            };
            return;
        }

        // Get session metadata from Firebase
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            ctx.response.status = 404;
            ctx.response.body = {
                success: false,
                error: "Session not found"
            };
            return;
        }

        // Update session activity when info is requested
        await updateSessionActivity(sessionId);

        ctx.response.body = {
            success: true,
            session: {
                ...sessionData
            }
        };
    } catch (error) {
        console.error(`Error getting session info: ${error instanceof Error ? error.message : "Unknown error"}`);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: "Failed to get session info"
        };
    }
});

// List active sessions
router.get("/sessions", authMiddleware, async (ctx) => {
    try {
        // Get active sessions from Firebase
        const activeSessions = await listActiveSessions();

        ctx.response.body = {
            success: true,
            count: activeSessions.length,
            sessions: activeSessions
        };
    } catch (error) {
        console.error(`Error listing sessions: ${error instanceof Error ? error.message : "Unknown error"}`);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: "Failed to list sessions"
        };
    }
});

// Handle chat messages
router.post("/chat/:sessionId", authMiddleware, async (ctx) => {
    const { sessionId } = ctx.params;
    if (!sessionId) {
        ctx.response.status = 400;
        ctx.response.body = {
            success: false,
            error: "Missing session ID"
        };
        return;
    }

    try {
        // First check if session exists in Firebase
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            ctx.response.status = 404;
            ctx.response.body = {
                success: false,
                error: "Session not found"
            };
            return;
        }

        // Update session activity
        await updateSessionActivity(sessionId);

        // Get or create message handler for this session
        const messageHandler = await getOrCreateMessageHandler(sessionId);

        const body = await ctx.request.body().value;
        const { message } = body;

        if (!message || typeof message !== "string") {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Invalid message format"
            };
            return;
        }

        // Validate and add user message
        await messageHandler.addMessage({ role: "user", content: message });

        // We'll continue processing asynchronously
        ctx.response.body = {
            success: true,
            status: "processing",
            message: "Message received, processing has started. Updates will be available via polling."
        };

        // Start async response processing
        processResponse(sessionId, messageHandler);
    } catch (error) {
        console.error(`Error processing chat message: ${error instanceof Error ? error.message : "Unknown error"}`);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: "Failed to process message"
        };
    }
});

// Function to process responses asynchronously
async function processResponse(sessionId: string, messageHandler: MessageHandler) {
    try {
        // Process with agent loop
        // Continue processing until the agent indicates completion
        const maxIterations = Number.MAX_SAFE_INTEGER;
        let summarizationApplied = false;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            try {
                console.log(`Starting agent loop iteration ${iteration + 1}/${maxIterations}`);
                const messages = await messageHandler.getMessages();

                // Check token count before making API call
                const estimatedTokens = estimateTokenCount(messages);
                console.log(`Estimated token count: ${estimatedTokens} / ${MAX_TOKEN_LIMIT} (${(estimatedTokens / MAX_TOKEN_LIMIT * 100).toFixed(2)}%)`);

                // If approaching token limit, summarize conversation
                if (estimatedTokens > MAX_TOKEN_LIMIT * TOKEN_THRESHOLD) {
                    console.log(`Token limit threshold reached (${estimatedTokens} tokens). Summarizing conversation...`);

                    // Generate a summary of the conversation so far
                    const summary = await summarizeConversation(messages, openai, OPENAI_MODEL);

                    // Create summarized messages with our utility function
                    const summarizedMessages = createSummarizedMessages(messages, summary);

                    // Update the message handler with the summarized messages
                    messageHandler.setMessages(summarizedMessages);
                    summarizationApplied = true;

                    // Log the summarization
                    console.log("Applied summarization to reduce token count.");
                    console.log(`New estimated token count: ${estimateTokenCount(summarizedMessages)}`);

                    // Retrieve the updated messages
                    const updatedMessages = await messageHandler.getMessages();
                    console.log(`Messages after summarization: ${JSON.stringify(updatedMessages)}`);
                }

                // Log if summarization was applied
                if (summarizationApplied) {
                    await messageHandler.addMessage({
                        role: "system",
                        content: "Due to the length of this conversation, earlier messages have been summarized to stay within token limits. The assistant will continue based on this summary."
                    });
                    summarizationApplied = false; // Reset flag
                }

                console.log(`Messages: ${JSON.stringify(messages)}`);

                try {
                    // Make the API call with current messages
                    const response = await openai.chat.completions.create({
                        model: OPENAI_MODEL,
                        temperature: 0.2,
                        messages: messages,
                        tools: openAiTools
                    });
                    console.log(`Using ${openAiTools.length} tools for agent processing`);

                    // Propagate finish_reason from response to the assistant message
                    // Create a new message object with the finish_reason added
                    const assistantMessage = {
                        ...response.choices[0].message,
                        id: randomUUID(),
                        finish_reason: response.choices[0].finish_reason
                    };

                    // Add the enhanced message with finish_reason to the message handler
                    await messageHandler.addMessage(assistantMessage);

                    if (isDone(response)) {
                        console.log("Agent loop is Done");
                        const summary = await summarizeConversation(messages, openai, OPENAI_MODEL);
                        const summarizedMessages = createSummarizedMessages(messages, summary);
                        messageHandler.setMessages(summarizedMessages);
                        break;
                    }

                    const toolCallResponse = await applyToolCallsIfPresent(response);

                    if (toolCallResponse.length) {
                        await messageHandler.addMessages(toolCallResponse);
                    }

                    await messageHandler.addMessage(performNextStepSystemPrompt);
                } catch (apiError) {
                    // Check if the error is related to token limits
                    if (apiError.message && apiError.message.includes("maximum context length")) {
                        console.error("Token limit exceeded error from OpenAI API:", apiError.message);

                        // Force summarization on token limit errors
                        const messages = await messageHandler.getMessages();
                        const summary = await summarizeConversation(messages, openai, OPENAI_MODEL);

                        // Create summarized messages with our utility function
                        const summarizedMessages = createSummarizedMessages(messages, summary);

                        // Update the message handler with the summarized messages
                        messageHandler.setMessages(summarizedMessages);

                        // Add a message to notify about the token limit
                        await messageHandler.addMessage({
                            role: "system",
                            content: "The conversation reached the maximum token limit. Earlier messages have been summarized to continue. Some context may have been lost in this process."
                        });

                        // Try again with summarized messages on the next iteration
                        continue;
                    } else {
                        // Re-throw other API errors
                        throw apiError;
                    }
                }

            } catch (iterationError) {
                console.error(`Error in agent loop iteration ${iteration + 1}:`, iterationError);

                // Add a system message about the error
                await messageHandler.addMessage({
                    role: "system",
                    content: `Error during processing iteration ${iteration + 1}: ${iterationError.message || "Unknown error"}`
                } as MessageType);

                // If we've had multiple errors, possibly related to token limits
                if (iteration > 2 && iterationError.message && iterationError.message.includes("token")) {
                    // Force a reset with summary to try to recover
                    await messageHandler.resetToInitialWithLastAssistantMessage();
                    console.log("Reset to initial state with last assistant message due to persistent errors");

                    // Add an explanation message
                    await messageHandler.addMessage({
                        role: "system",
                        content: "The conversation has been reset to its initial state with the last assistant message due to persistent errors, possibly related to token limits."
                    });

                    // Break the loop if we can't recover
                    if (iteration > 5) {
                        console.error("Too many iterations with errors, breaking out of processing loop");
                        break;
                    }
                }
            }
        }
        console.log("Processing complete");
    } catch (error) {
        console.error(`Error in async processing: ${error instanceof Error ? error.message : "Unknown error"}`);

        // Add error to message handler
        await messageHandler.addMessage({
            role: "system",
            content: `Error processing message: ${error instanceof Error ? error.message : "Unknown error"}`
        });
    }
}

// Initialize the server and fetch tools
router.get("/init", authMiddleware, async (ctx) => {
    try {
        // Initialize Firebase first
        const firebaseInitSuccess = await initFirebase();
        if (!firebaseInitSuccess) {
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to initialize Firebase"
            };
            return;
        }

        const mcpToolsSuccess = await initializeTools();

        if (!mcpToolsSuccess) {
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to initialize MCP tools"
            };
            return;
        }

        ctx.response.body = {
            success: true,
            toolsCount: openAiTools.length,
            message: "Server initialized successfully"
        };
    } catch (error) {
        console.error(`Error initializing server: ${error instanceof Error ? error.message : "Unknown error"}`);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: "Failed to initialize server"
        };
    }
});

// Add endpoint for taking a screenshot
router.get("/screenshot", authMiddleware, async (ctx) => {
    try {
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
            console.log(`MCP Screenshot captured: ${screenshot ? 'Success' : 'Empty'}`);
            console.log(`MCP Screenshot size: ${screenshot ? screenshot.length : 0} bytes`);
            console.log(`MCP Screenshot type: ${mimeType}`);
        } catch (error) {
            console.error("Screenshot error:", error);
            statusMessage = `Error: ${error.message || "Unknown error"}`;

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

        ctx.response.body = {
            success: true,
            image: `data:${mimeType};base64,${screenshot}`,
            timestamp: Date.now(),
            status: statusMessage
        };
    } catch (error) {
        console.error("Screenshot endpoint error:", error);
        ctx.response.status = 500;
        ctx.response.body = {
            success: false,
            error: `Failed to capture screenshot: ${error.message || "Unknown error"}`
        };
    }
});

// Add endpoint for browser stream
router.get("/browser-stream/:sessionId", async (ctx) => {
    const { sessionId } = ctx.params;

    if (!sessionId) {
        ctx.response.status = 400;
        ctx.response.body = "Session ID is required";
        return;
    }

    // Validate token if provided
    let userId = null;

    // First check if the session exists in memory
    if (!sessions.has(sessionId)) {
        console.log(`Session ${sessionId} not found in memory, checking Firebase...`);

        // If not in memory, check if it exists in Firebase
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            ctx.response.status = 404;
            ctx.response.body = "Session not found";
            return;
        }

        // If userId is provided from token, verify session belongs to that user
        if (userId && sessionData.userId && sessionData.userId !== userId) {
            console.error(`User ${userId} attempted to access session belonging to ${sessionData.userId}`);
            ctx.response.status = 403;
            ctx.response.body = "Unauthorized access to session";
            return;
        }

        // Session exists in Firebase but not in memory, create it
        console.log(`Session ${sessionId} found in Firebase, creating memory handler`);
        const messageHandler = new MessageHandler(sessionId);
        sessions.set(sessionId, messageHandler);
    }

    try {
        // Setup Server-Sent Events
        console.log(`Browser stream request received for session ${sessionId}`);

        // Set appropriate headers for SSE
        ctx.response.headers.set("Content-Type", "text/event-stream");
        ctx.response.headers.set("Cache-Control", "no-cache");
        ctx.response.headers.set("Connection", "keep-alive");

        console.log(`Headers set for SSE stream for session ${sessionId}`);

        // Create the stream
        const bodyStream = new ReadableStream({
            start(controller) {
                console.log(`Stream started for session ${sessionId}`);

                // Flag to track if the local stream connection is active
                let isStreamConnected = true;

                // Helper function to safely enqueue data to the stream
                function safeEnqueue(data, operation = "unknown") {
                    if (!isStreamConnected) {
                        console.log(`Skipping enqueue for ${operation}: stream disconnected`);
                        return false;
                    }

                    try {
                        controller.enqueue(data);
                        return true;
                    } catch (error) {
                        console.error(`Failed to enqueue data for ${operation}: ${error.message}`);
                        isStreamConnected = false; // Stream is broken, don't try to use it again
                        return false;
                    }
                }

                // Initialize stream state in Firebase if not already set
                setStreamState(sessionId, {
                    active: true,
                    lastScreenshotAt: Date.now()
                }).catch(error => {
                    console.error(`Failed to initialize stream state in Firebase: ${error.message}`);
                });

                // Send initial connection message
                const encoder = new TextEncoder();
                const initialMessage = encoder.encode(
                    `event: status\ndata: {"type":"connected","sessionId":"${sessionId}"}\n\n`
                );

                // Use the safe enqueue helper
                if (!safeEnqueue(initialMessage, "initial connection")) {
                    console.error(`Failed to send initial connection message for session ${sessionId}`);
                    return; // Exit early if we can't even send the initial message
                }

                // Function to take and send screenshots
                let errorCount = 0;

                async function sendScreenshot() {
                    if (!isStreamConnected) return;

                    // Check if the stream is paused by retrieving state from Firebase
                    let streamState = {
                        active: true,
                        sessionId,
                        pauseReason: '',
                        pausedAt: 0,
                        resumedAt: 0,
                        lastScreenshotAt: 0
                    } as StreamState; // Type assertion to match the StreamState interface

                    try {
                        const state = await getStreamState(sessionId);
                        // If we got a valid state from Firebase, use it
                        if (state) {
                            streamState = state;
                        }
                    } catch (error) {
                        console.error(`Error getting stream state from Firebase: ${error.message}`);
                        // Continue with default active state
                    }

                    // If the stream is paused, send a status message
                    if (!streamState.active) {
                        try {
                            // Safely extract pause reason, handling any potential null/undefined values
                            const pauseReason = (streamState.pauseReason || 'client_request').toString().replace(/[^\w\s-]/g, '');

                            // Log the attempt to send pause message
                            console.log(`Attempting to send pause status for session ${sessionId}, reason: ${pauseReason}`);

                            try {
                                // Create a safe message with no special characters that could cause issues
                                const pauseMessage = encoder.encode(
                                    `event: status\ndata: {"type":"paused","message":"Stream paused","reason":"${pauseReason}"}\n\n`
                                );

                                // Check stream state first
                                if (!isStreamConnected) {
                                    throw new Error("Stream disconnected before pause message could be sent");
                                }

                                // Directly try-catch the controller.enqueue call that's causing the error
                                try {
                                    controller.enqueue(pauseMessage);
                                    console.log(`Stream ${sessionId} is paused, waiting for resume signal`);
                                } catch (enqueueError) {
                                    // This is the specific error we're seeing in the logs
                                    console.error(`Controller enqueue failed: ${enqueueError.message}`);
                                    isStreamConnected = false; // Mark as disconnected

                                    // Don't attempt further operations with this controller
                                    return;
                                }
                            } catch (innerError) {
                                console.error(`Inner error in pause message preparation: ${innerError.message}`);
                                // Don't re-throw, just log and continue
                            }

                            // Check again after a delay, only if still connected
                            if (isStreamConnected) {
                                setTimeout(() => sendScreenshot(), 2000);
                            }
                            return;
                        } catch (e) {
                            // More detailed error reporting
                            console.error(`Failed to send pause status for session ${sessionId}: ${e.message}`);
                            console.error(`Pause error details:`, e);

                            // Continue only if still connected
                            if (isStreamConnected) {
                                setTimeout(() => sendScreenshot(), 3000);
                            }
                            return;
                        }
                    }

                    try {
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
                            const message = encoder.encode(
                                `data: data:${imageContent.mimeType || 'image/png'};base64,${imageContent.data}\n\n`
                            );
                            if (!safeEnqueue(message, "screenshot")) {
                                console.error(`Failed to send screenshot for session ${sessionId}`);
                                return;
                            }

                            // Update the last screenshot timestamp in Firebase
                            setStreamState(sessionId, {
                                lastScreenshotAt: Date.now()
                            }).catch(error => {
                                console.error(`Failed to update screenshot timestamp: ${error.message}`);
                            });

                            // console.log(`Screenshot sent (${imageContent.data.length} bytes) for session ${sessionId}`);
                            errorCount = 0;
                        } else {
                            console.error("No image data found in response, falling to default.");
                            const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
                                <rect width="100%" height="100%" fill="#ffffff" />
                                
                                <!-- Main Content Area - Full width/height -->
                                <rect x="0" y="0" width="800" height="600" fill="#ffffff" />
                                
                                <!-- Assistant Logo/Icon -->
                                <text x="400" y="175" font-family="Arial" font-size="60" text-anchor="middle">🤖</text>
                             
                                
                                <!-- Welcome Text -->
                                <text x="400" y="230" font-family="Arial" font-size="24" font-weight="bold" fill="#202124" text-anchor="middle">Welcome to Browse Assist</text>
                                <text x="400" y="260" font-family="Arial" font-size="16" fill="#5f6368" text-anchor="middle">Your intelligent browser automation companion</text>
                                
                                <!-- Search bar -->
                                <rect x="200" y="290" width="400" height="50" rx="25" ry="25" fill="#ffffff" stroke="#dfe1e5" stroke-width="1" />
                                
                                <path d="M220,315 a7,7 0 1,0 0.1,0 z M225,320 l5,5" stroke="#6b46c1" stroke-width="2" fill="none" />
                                <text x="400" y="322" font-family="Arial" font-size="16" fill="#9aa0a6" text-anchor="middle">Ask me anything...</text>
                            </svg>`;

                            // Convert SVG to base64
                            const mimeType = 'image/svg+xml';
                            const encoder = new TextEncoder();
                            const data = encoder.encode(svgContent);
                            const screenshot = btoa(String.fromCharCode(...data));
                            const message = encoder.encode(
                                `data: data:${mimeType};base64,${screenshot}\n\n`
                            );
                            if (!safeEnqueue(message, "fallback svg")) {
                                console.error(`Failed to send fallback SVG for session ${sessionId}`);
                                return;
                            }
                            errorCount = 0;
                        }
                    } catch (error) {
                        errorCount++;
                        // console.error(`Screenshot error (${errorCount}) for session ${sessionId}: ${error.message}`);

                        // Try to send error message
                        try {
                            const errorMsg = encoder.encode(
                                `event: status\ndata: {"type":"error","message":"${error.message}"}\n\n`
                            );
                            if (!safeEnqueue(errorMsg, "error notification")) {
                                console.error(`Failed to send error notification for session ${sessionId}`);
                                return;
                            }
                        } catch (e) {
                            // console.error(`Failed to send error event: ${e.message}`);
                        }
                    }

                    // Schedule next screenshot with backoff on errors and respect pause state
                    if (isStreamConnected) {
                        try {
                            // Check stream state again to make sure we use the right interval
                            const currentState = await getStreamState(sessionId);
                            const isActive = currentState ? currentState.active : true;

                            const delay = !isActive
                                ? 3000 // When paused, check every 3 seconds
                                : errorCount > 0
                                    ? Math.min(10000, Math.pow(1.5, errorCount) * 1000) // Error backoff
                                    : 1000; // Normal interval

                            setTimeout(() => sendScreenshot(), delay);
                        } catch (error) {
                            console.error(`Error scheduling next screenshot: ${error.message}`);
                            // Default to a reasonable delay on error
                            setTimeout(() => sendScreenshot(), 2000);
                        }
                    }
                }

                // Start sending screenshots
                sendScreenshot();

                // Set a maximum duration for the stream
                setTimeout(() => {
                    if (isStreamConnected) {
                        console.log(`Maximum stream duration reached for session ${sessionId}, closing stream`);
                        isStreamConnected = false;

                        try {
                            const closeMsg = encoder.encode(
                                `event: status\ndata: {"type":"timeout","message":"Maximum stream duration reached"}\n\n`
                            );
                            if (!safeEnqueue(closeMsg, "stream close")) {
                                console.error(`Failed to send stream close message for session ${sessionId}`);
                                // Still try to close the controller anyway
                            }
                            controller.close();

                            // Clear the stream state in Firebase 
                            clearStreamState(sessionId).catch(error => {
                                console.error(`Failed to clear stream state: ${error.message}`);
                            });
                        } catch (e) {
                            console.error(`Error closing stream: ${e.message}`);
                        }
                    }
                }, 30 * 60 * 1000); // 30 minute maximum
            }
        });

        // Set response body to stream
        ctx.response.body = bodyStream;
        console.log(`Response body set to stream for session ${sessionId}`);

    } catch (error) {
        console.error(`Error setting up stream: ${error.message}`);
        ctx.response.status = 500;
        ctx.response.body = `Error: ${error.message}`;
    }
});

// User login endpoint
router.post("/auth/login", async (ctx) => {
    try {
        // Fix: Using ctx.request.body().value instead of ctx.request.body.json()
        const body = await ctx.request.body().value;
        const { email, password } = body;

        // Validate input
        if (!email || !password) {
            ctx.response.status = 400;
            ctx.response.body = { success: false, error: "Email and password are required" };
            return;
        }

        // Validate credentials
        const user = await validateUser(email, password);
        if (!user) {
            ctx.response.status = 401;
            ctx.response.body = { success: false, error: "Invalid credentials" };
            return;
        }

        // Generate JWT token using the utility function
        const token = await createToken({
            userId: user.userId,
            email: user.email,
            username: user.username
        });

        // Create a new session
        const sessionId = crypto.randomUUID()
        const sessionMetadata = {
            userAgent: ctx.request.headers.get("user-agent") || "unknown",
            ip: ctx.request.ip || "unknown"
        };

        await createSession(sessionId, user.userId, sessionMetadata);

        ctx.response.status = 200;
        ctx.response.body = {
            success: true,
            token,
            sessionId, // Include session ID in the response
            user: {
                userId: user.userId,
                username: user.username,
                email: user.email
            }
        };
    } catch (error) {
        console.error("Login error:", error);
        ctx.response.status = 500;
        ctx.response.body = { success: false, error: "Server error" };
    }
});

// User registration endpoint
router.post("/auth/register", async (ctx) => {
    try {
        // Fix: Using ctx.request.body().value instead of ctx.request.body.json()
        const body = await ctx.request.body().value;
        const { username, email, password } = body;

        // Validate input
        if (!username || !email || !password) {
            ctx.response.status = 400;
            ctx.response.body = { success: false, error: "Missing required fields" };
            return;
        }

        // Check if user exists
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            ctx.response.status = 409;
            ctx.response.body = { success: false, error: "User already exists" };
            return;
        }

        // Hash password with salt - the number 10 here represents the salt rounds
        // This is secure because bcrypt.hash internally generates a salt and combines
        // it with the password using the specified number of rounds
        // The salt is automatically generated and included in the hash
        const hashedPassword = await hash(password);
        console.log("Password hashed securely with salt");

        // Create user
        const userId = await createUser({
            username,
            email,
            password: hashedPassword
        });

        if (!userId) {
            ctx.response.status = 500;
            ctx.response.body = { success: false, error: "Failed to create user" };
            return;
        }

        // Generate JWT token using the utility function
        const token = await createToken({
            userId,
            email,
            username
        });

        ctx.response.status = 201;
        ctx.response.body = {
            success: true,
            token,
            user: { userId, username, email }
        };
    } catch (error) {
        console.error("Registration error:", error);
        ctx.response.status = 500;
        ctx.response.body = { success: false, error: "Server error" };
    }
});

// Apply router middleware
app.use(router.routes());
app.use(router.allowedMethods());

// Start the HTTP server
const httpServer = await app.listen({ port: PORT, hostname: HOST });
console.log(`Server running on port ${PORT} with ${openAiTools.length} tools available`);
console.log(`You can access it via: http://localhost:${PORT} or http://127.0.0.1:${PORT}`); 