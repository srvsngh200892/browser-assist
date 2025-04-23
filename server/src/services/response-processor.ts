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
    estimateTokenCount,
    MAX_TOKEN_LIMIT,
    TOKEN_THRESHOLD,
} from '../utils/token-utils';

import {
    groupMessagesIntoInteractions,
    reconstructMessages,
    trimAndAddSystemPrompt
} from '../utils/conversation-trimmer';

import { performNextStepSystemPrompt, initialMessageSystemPrompt } from '../utils/prompts';
import { v4 as uuid } from 'uuid';

// Import OpenAI configuration constants from environment
import { OPENAI_MODEL, OPENAI_TIMEOUT } from './env';



export // Function to process responses asynchronously
    async function processResponse(sessionId: string, messageHandler: MessageHandler) {
    try {
        const KEEP_LAST_N_TOOL_INTERACTIONS = 3;

        // Process with agent loop
        const maxIterations = Number.MAX_SAFE_INTEGER;
        const mcpToolsList = await mcpClient.listTools();
        console.log(`MCP Tools list for session ${sessionId}: ${mcpToolsList.length}`);
        const toolsArray = Array.isArray(mcpToolsList.tools) ? mcpToolsList.tools : [];
        const openAiTools = mapToolListToOpenAiTools({ tools: toolsArray });

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            try {
                console.log(`Starting agent loop iteration ${iteration + 1}/${maxIterations}`);
                let messages = await messageHandler.getMessages();
                console.log(`Before Messages: ${JSON.stringify(messages, null, 2)}`);
                const estimatedTokens = estimateTokenCount(messages);
                console.log(`Estimated tokens Before trimming: ${estimatedTokens}`);

                // Find the last user message index
                const lastUserIndex = messages.length - 1 - [...messages].reverse().findIndex(m => m.role === 'user');
                if (lastUserIndex === -1) {
                    console.warn('No user message found in conversation');
                    return;
                }

                const initialMessages = messages.slice(0, lastUserIndex + 1);
                const workingMessages = messages.slice(lastUserIndex + 1);

                // Use the imported utility functions
                const interactions = groupMessagesIntoInteractions(workingMessages);
                const reconstructedMessages = reconstructMessages(interactions, KEEP_LAST_N_TOOL_INTERACTIONS);

                // Combine all messages
                messages = [...initialMessages, ...reconstructedMessages];
                const { messages: trimmedMessages, addedSystemPrompt } = await trimAndAddSystemPrompt(messages, messageHandler, performNextStepSystemPrompt);
                messages = trimmedMessages;
                const response = await openaiClient.chat.completions.create({
                    model: OPENAI_MODEL,
                    temperature: 0.2,
                    messages: messages as any,
                    tools: openAiTools
                });

                // Remove the performNextStepSystemPrompt if we added it
                if (addedSystemPrompt) {
                    messages.pop();
                }
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
