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
    MAX_TOKEN_LIMIT,
    TOKEN_THRESHOLD,
    estimateTokenCount
} from '../utils/token-utils';

import { performNextStepSystemPrompt } from '../utils/prompts';
import { v4 as uuid } from 'uuid';
import { MessageType } from './messages';

// Import OpenAI configuration constants from environment
import { OPENAI_MODEL, OPENAI_TIMEOUT } from './env';

// Process response function 
export // Function to process responses asynchronously
    async function processResponse(sessionId: string, messageHandler: MessageHandler) {
    try {
        // Get or create an MCP client for this session


        // Process with agent loop
        const maxIterations = Number.MAX_SAFE_INTEGER;
        let summarizationApplied = false;
        const mcpToolsList = await mcpClient.listTools();
        console.log(`MCP Tools list for session ${sessionId}: ${mcpToolsList.length}`);
        // Extract the tools array from the response or use an empty array if not available
        const toolsArray = Array.isArray(mcpToolsList.tools) ? mcpToolsList.tools : [];
        const openAiTools = mapToolListToOpenAiTools({ tools: toolsArray });

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
                    const summary = await summarizeConversation(messages, openaiClient, OPENAI_MODEL, OPENAI_TIMEOUT);

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
                        const summary = await summarizeConversation(messages, openaiClient, OPENAI_MODEL, OPENAI_TIMEOUT);
                        const summarizedMessages = createSummarizedMessages(messages, summary);
                        messageHandler.setMessages(summarizedMessages);
                        console.log(`Agent loop is Done for session ${sessionId}`);

                        break;
                    }

                    const toolCallResponse = await applyToolCallsIfPresent(response, mcpClient);

                    if (toolCallResponse.length) {
                        await messageHandler.addMessages(toolCallResponse);
                    }

                    await messageHandler.addMessage(performNextStepSystemPrompt);
                } catch (apiError: unknown) {
                    // Check if the error is related to token limits
                    if (apiError instanceof Error && apiError.message && apiError.message.includes("maximum context length")) {
                        console.error("Token limit exceeded error from OpenAI API:", apiError.message);

                        // Force summarization on token limit errors
                        const messages = await messageHandler.getMessages();
                        const summary = await summarizeConversation(messages, openaiClient, OPENAI_MODEL, OPENAI_TIMEOUT);

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

            } catch (error: unknown) {
                // Add a system message about the error
                await messageHandler.addMessage({
                    role: "system",
                    content: `Error during processing request ${error instanceof Error ? error.message : "Unknown error"}`
                } as MessageType);
                throw error;
            }
        }
        console.log(`Processing complete for session ${sessionId}`);
    } catch (error) {
        console.error(`Error in async processing for session ${sessionId}: ${error instanceof Error ? error.message : "Unknown error"}`);

        // Add error to message handler
        await messageHandler.addMessage({
            role: "system",
            content: `Error processing message: ${error instanceof Error ? error.message : "Unknown error"}`
        });

    }
}
