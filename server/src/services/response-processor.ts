// Temporary placeholder for response-processor.ts
// Replace with actual implementation

import { MessageHandler } from './messages';
import { openaiClient } from '../server';
import { mcpClient } from '../utils/client';
import {
    applyToolCallsIfPresent,
    isDone,
    mapToolListToOpenAiTools
} from '../utils/openai-utils';

import {
    summarizeConversation,
    createSummarizedMessages,
    estimateTokenCount,
} from '../utils/token-utils';



import { performNextStepSystemPrompt, initialMessageSystemPrompt } from '../utils/prompts';
import { v4 as uuid } from 'uuid';
import { MessageType } from './messages';

// Import OpenAI configuration constants from environment
import { OPENAI_MODEL, OPENAI_TIMEOUT } from './env';



export // Function to process responses asynchronously
    async function processResponse(sessionId: string, messageHandler: MessageHandler) {
    try {
        // Process with agent loop
        const maxIterations = Number.MAX_SAFE_INTEGER;
        const mcpToolsList = await mcpClient.listTools();
        console.log(`MCP Tools list for session ${sessionId}: ${mcpToolsList.length}`);
        // Extract the tools array from the response or use an empty array if not available
        const toolsArray = Array.isArray(mcpToolsList.tools) ? mcpToolsList.tools : [];
        const openAiTools = mapToolListToOpenAiTools({ tools: toolsArray });
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            try {
                console.log(`Starting agent loop iteration ${iteration + 1}/${maxIterations}`);
                let messages = await messageHandler.getMessages();
                console.log(`Messages: ${JSON.stringify(messages, null, 2)}`);
                const estimatedTokens = estimateTokenCount(messages);
                console.log(`Estimated tokens: ${estimatedTokens}`);

                try {
                    // Make the API call with current messages
                    console.log(`in this side try`);
                    const response = await openaiClient.chat.completions.create({
                        model: OPENAI_MODEL,
                        temperature: 0.2,
                        messages: messages as any, // Cast to any to fix type error
                        tools: openAiTools
                    });
                    console.log(`Using ${openAiTools.length} tools for agent processing`);

                    // Propagate finish_reason from response to the assistant message
                    // Create a new message object with the finish_reason added
                    const assistantMessage = {
                        ...response.choices[0].message,
                        id: uuid(),
                        finish_reason: response.choices[0].finish_reason
                    };

                    // Add the enhanced message with finish_reason to the message handler
                    await messageHandler.addMessage(assistantMessage);

                    if (isDone(response)) {
                        console.log(`Agent loop is Done for session ${sessionId}`);
                        break;
                    }

                    const toolCallResponse = await applyToolCallsIfPresent(response, mcpClient) || [];

                    if (toolCallResponse.length) {
                        await messageHandler.addMessages(toolCallResponse);
                    }
                    let summarizedMessagesAssistant: MessageType[] = []
                    messages = await messageHandler.getMessages();
                    const summarizedMessages = await summarizeConversation(messages, openaiClient, OPENAI_MODEL, OPENAI_TIMEOUT, 5);
                    summarizedMessagesAssistant = [{
                        role: 'assistant',
                        content: summarizedMessages
                    } as unknown as MessageType];

                    console.log(`Summarized Messages Assistant: ${JSON.stringify(summarizedMessagesAssistant, null, 2)}`);
                    // Find the latest user message by iterating backwards through messages
                    let latestUserMessage: MessageType = { role: 'user', content: '' };
                    for (let i = messages.length - 1; i >= 0; i--) {
                        if (messages[i].role === 'user') {
                            latestUserMessage = messages[i];
                            break;
                        }
                    }
                    // We're managing the conversation context by:
                    // 1. Keeping the initial system prompt (messages[0])
                    // 2. Preserving the latest user message to maintain context
                    // 3. Adding summarized messages if we're beyond the first iteration
                    // 4. Including the latest assistant message and any tool responses
                    // 5. Adding the "perform next step" system prompt to guide the next iteration
                    // This approach helps manage token usage while maintaining conversation coherence
                    console.log(`Preparing to update message handler with optimized message set`);
                    await messageHandler.setMessages([messages[0], latestUserMessage, ...summarizedMessagesAssistant, assistantMessage, ...toolCallResponse], false);
                    await messageHandler.addMessage(performNextStepSystemPrompt);

                } catch (apiError: unknown) {
                    // Check if the error is related to token limits
                    if (apiError instanceof Error && apiError.message && apiError.message.includes("maximum context length")) {
                        console.error("Token limit exceeded error from OpenAI API:", apiError.message);

                        // Force summarization on token limit errors
                        const messages = await messageHandler.getMessages();
                        const summary = await summarizeConversation(messages, openaiClient, OPENAI_MODEL, OPENAI_TIMEOUT, 5);

                        // Create summarized messages with our utility function
                        const summarizedMessages = createSummarizedMessages(messages, summary, 5);

                        // Update the message handler with the summarized messages
                        messageHandler.setMessages(summarizedMessages);

                        // Try again with summarized messages on the next iteration
                        continue;
                    } else {
                        // Re-throw other API errors
                        throw apiError;
                    }
                }

            } catch (error: unknown) {
                throw error;
            }
        }
        console.log(`Processing complete for session ${sessionId}`);
    } catch (error) {
        console.error(`Error in async processing for session ${sessionId}: ${error instanceof Error ? error.message : "Unknown error"}`);

        // Add error to message handler
        await messageHandler.addMessage({
            role: "assistant",
            id: uuid(),
            content: `Error processing message: ${error instanceof Error ? error.message : "Unknown error"}`,
            finish_reason: "stop"
        });

    }
}
