import { MessageHandler, MessageType } from './messages';
import { openaiClient } from '../server';
import { getMcpClient } from '../utils/client';
import {
    applyToolCallsIfPresent,
    isDone,
    mapToolListToOpenAiTools
} from '../utils/openai-utils';

import {
    estimateTokenCount,
    getStructuredAutomationSteps,
    MAX_TOKEN_LIMIT,
    TOKEN_THRESHOLD,
} from '../utils/token-utils';

import {
    groupMessagesIntoInteractions,
    reconstructMessages,
    trimAndAddSystemPrompt
} from '../utils/conversation-trimmer';

import { updateSessionMetadata } from './firebase-sessions';

import { performNextStepSystemPrompt, initialMessageSystemPrompt } from '../utils/prompts';
import { v4 as uuid } from 'uuid';

// Import OpenAI configuration constants from environment
import { OPENAI_MODEL, OPENAI_TIMEOUT } from './env';



export // Function to process responses asynchronously
    async function runNavigationAgent(sessionId: string, messageHandler: MessageHandler) {
    try {
        await updateSessionMetadata(sessionId, {
            messageProcessing: true
        })
        // Process with agent loop
        const maxIterations = Number.MAX_SAFE_INTEGER;
        const mcpClient = await getMcpClient(sessionId);
        let mcpToolsList: any = await mcpClient.listTools();
        console.log(`MCP Tools list for session ${sessionId}: ${mcpToolsList.length} ${OPENAI_MODEL}`);
        let toolsArray = Array.isArray(mcpToolsList.tools) ? mcpToolsList.tools : [];
        toolsArray = toolsArray.filter((tool: any) => tool.name !== 'browser_take_screenshot');
        const openAiTools = mapToolListToOpenAiTools({ tools: toolsArray });
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            try {
                console.log(`Starting agent loop iteration ${iteration + 1}/${maxIterations}`);
                let messages = await messageHandler.getMessages();
                console.log(`Before Messages: ${messages.length}`);
                const estimatedTokens = estimateTokenCount(messages);
                console.log(`Estimated tokens Before trimming: ${estimatedTokens}`);

                // Find the first user message index
                const firstUserIndex = messages.findIndex(m => m.role === 'user');
                if (firstUserIndex === -1) {
                    console.warn('No user message found in conversation', JSON.stringify(messages, null, 2));
                    throw new Error('No user message found in conversation');
                }

                const initialMessages = messages.slice(0, firstUserIndex + 1);
                const workingMessages = messages.slice(firstUserIndex + 1);

                // Use the imported utility functions
                const interactions = groupMessagesIntoInteractions(workingMessages);
                let totalToolCalls = interactions.filter(i => i.hasToolCalls).length;
                let keepNToolInteractions = totalToolCalls
                if (estimatedTokens > MAX_TOKEN_LIMIT * TOKEN_THRESHOLD) {
                    let newEstimatedTokens = 0
                    console.log(`Token limit threshold reached (${estimatedTokens} tokens). Reducing older tool interactions...`);
                    let newMessages: MessageType[] = messages
                    keepNToolInteractions = keepNToolInteractions - 1
                    while (keepNToolInteractions > 2) {
                        const reconstructedMessages = reconstructMessages(interactions, keepNToolInteractions);
                        newMessages = [...initialMessages, ...reconstructedMessages];
                        newEstimatedTokens = estimateTokenCount(newMessages);
                        if (newEstimatedTokens < MAX_TOKEN_LIMIT * TOKEN_THRESHOLD) {
                            break;
                        }
                        keepNToolInteractions--
                    }
                    messages = newMessages
                    console.log(`Reduced to ${keepNToolInteractions} tool interactions for session ${sessionId} wiht message length ${messages.length} and new estimated tokens ${newEstimatedTokens} `);
                }
                console.log(`Keeping ${keepNToolInteractions} tool interactions out of ${totalToolCalls} for session ${sessionId}`)
                const { trimmedMessage, addedSystemPrompt } = await trimAndAddSystemPrompt(messages, messageHandler, performNextStepSystemPrompt, OPENAI_MODEL, openaiClient, interactions);
                const response = await openaiClient.chat.completions.create({
                    model: OPENAI_MODEL,
                    temperature: 0.2,
                    messages: trimmedMessage as any,
                    tools: openAiTools,
                });

                // Remove the performNextStepSystemPrompt if we added it
                if (addedSystemPrompt) {
                    trimmedMessage.pop();
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
                    console.log(`Agent loop is Done for session ${sessionId}, ${JSON.stringify(response,null,2)}`);
                    break;
                }

                const toolCallResponse = await applyToolCallsIfPresent(response, mcpClient) || [];

                if (toolCallResponse.length) {
                    await messageHandler.addMessages(toolCallResponse);
                }
            } catch (error: unknown) {
                await updateSessionMetadata(sessionId, {
                    messageProcessing: false
                })
                throw error;
            }
        }
        await updateSessionMetadata(sessionId, {
            messageProcessing: false
        })
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

        await updateSessionMetadata(sessionId, {
            messageProcessing: false
        })

    }
}
