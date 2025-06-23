import { MessageHandler, MessageType } from './messages';
import { openaiClient } from '../server';
import { removeMcpClient } from '../utils/playwright-mcp-client';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
import { classifySentiment } from '../utils/token-utils';

import { getSessionMetadata, getStreamState, setStreamState, updateSessionMetadata } from './firebase-sessions';

import { performNextStepSystemPrompt, initialMessageSystemPrompt } from '../utils/prompts';
import { v4 as uuid } from 'uuid';

// Import OpenAI configuration constants from environment
import { OPENAI_MODEL, OPENAI_TIMEOUT } from './env';
import { startBackgroundValidationReport } from './pdf-service';
import { startValidationViaAI } from './validation';
import { getTestCase } from './firebase-test-cycles';
import { deleteFolder, storeScreenshot } from './firebase-storage';
import { deleteValidationIfExists, getValidation } from './firebase-validation';
import { getOrCreateSessionForTestCase } from './firebase-test-case-sessions';


export // Function to process responses asynchronously
    async function runNavigationAgent(sessionId: string, messageHandler: MessageHandler, userId: string, mcpClient: Client, runVia: string = "chat", testCaseId: string = "", stepId: string = "") {
    try {
        await updateSessionMetadata(sessionId, {
            messageProcessing: true,
            testCaseProcessing: runVia === "chat" ? null : "processing"
        })
        // Process with agent loop
        const maxIterations = runVia === "chat" ? 100 : 35;
        // const userSession = await getLatestSessionByUserId(userId);
        // console.log(`navigationAgent userSession: ${JSON.stringify(userSession)}`)
        let mcpToolsList: any = await mcpClient.listTools();
        console.log(`MCP Tools list for session ${sessionId}: ${mcpToolsList.length} ${OPENAI_MODEL}`);
        let toolsArray = Array.isArray(mcpToolsList.tools) ? mcpToolsList.tools : [];

        toolsArray = toolsArray.filter((tool: any) => tool.name !== 'browser_take_screenshot' && tool.name !== 'browser_close');
        const openAiTools = mapToolListToOpenAiTools({ tools: toolsArray });
        let iteration;
        for (iteration = 0; iteration < maxIterations; iteration++) {
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
                let response = await openaiClient.chat.completions.create({
                    model: OPENAI_MODEL,
                    temperature: 0.2,
                    messages: trimmedMessage as any,
                    tools: openAiTools,
                })

                // Remove the performNextStepSystemPrompt if we added it
                if (addedSystemPrompt) {
                    trimmedMessage.pop();
                }
                // Propagate finish_reason from response to the assistant message
                // Create a new message object with the finish_reason added
                let retryCount = 0;
                while (response.choices[0].finish_reason == 'stop' && (!response.choices[0].message || !response.choices[0].message.content || response.choices[0].message.content.trim() === "") && retryCount < 10) {
                    console.log(`Empty response, retrying... attempt ${retryCount + 1}`);
                    //add message to trim message
                    trimmedMessage.push({
                        role: "system",
                        content: "Dont respond with empty message. Please retry the task by using appropriate tools provided to you to accomplish the goal."
                    })
                    //add 30 seconds delay
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    response = await openaiClient.chat.completions.create({
                        model: OPENAI_MODEL,
                        temperature: 0.2,
                        messages: trimmedMessage as any,
                        tools: openAiTools,
                    })
                    console.log(`Response after retry: ${response.choices[0].message.content}`);
                    retryCount++;
                    // instead to opposite break if response is not empt
                }
                const assistantMessage = {
                    ...response.choices[0].message,
                    id: uuid(),
                    finish_reason: response.choices[0].finish_reason
                };

                // Add the enhanced message with finish_reason to the message handler
                await messageHandler.addMessage(assistantMessage);

                if (isDone(response)) {
                    console.log(`Agent loop is Done for session ${sessionId}, ${JSON.stringify(response, null, 2)}`);
                    break;
                }

                const toolCallResponse = await applyToolCallsIfPresent(response, mcpClient, runVia, stepId) || [];

                if (toolCallResponse.length) {
                    await messageHandler.addMessages(toolCallResponse);
                }
            } catch (error: unknown) {
                await updateSessionMetadata(sessionId, {
                    messageProcessing: false,
                    testCaseProcessing: runVia === "chat" ? null : "fail"
                })
                throw error;
            }
        }
        //if max iterations reached, add a message to the message handler
        if (iteration >= maxIterations) {
            console.warn(`Max iterations (${maxIterations}) reached for session ${sessionId}`);

            await messageHandler.addMessage({
                role: "assistant",
                id: uuid(),
                content: `Agent could not complete the task. Please continue the task from where it was interrupted.`,
                finish_reason: "stop"
            });
        }
        await updateSessionMetadata(sessionId, {
            messageProcessing: false,
            testCaseProcessing: runVia === "chat" ? null : "pass"
        })
        if (runVia !== "chat") {
            // lass assistant message with stop finish reason
            let messages = await messageHandler.getMessages();
            const assistantMessage = messages.find(m => m.role === 'assistant' && (m as any).finish_reason === 'stop');
            const firstUserMessage = messages.find(m => m.role === 'user');

            const userContent = (firstUserMessage && typeof firstUserMessage.content === 'string') ? firstUserMessage.content : "";
            const assistantContent = (assistantMessage && typeof assistantMessage.content === 'string') ? assistantMessage.content : "";

            const sentiment = await classifySentiment(openaiClient, userContent, assistantContent, OPENAI_MODEL);
            console.log(`Sentiment for session ${sessionId}: ${sentiment}`);
            // if still negative retry 2 times then break and return error     
            if (sentiment === "negative") {
                console.log(`Navigation agent failed to complete the task for session ${sessionId}`);
                await updateSessionMetadata(sessionId, {
                    messageProcessing: false,
                    testCaseProcessing: runVia === "chat" ? null : "fail"
                })
                return;
            }
            console.log(`Starting validation for session ${sessionId}`);
            await startValidationViaAI(sessionId, false, runVia, testCaseId);
            console.log(`Processing complete for session ${sessionId}`);
            return;
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

        await updateSessionMetadata(sessionId, {
            messageProcessing: false,
            testCaseProcessing: runVia === "chat" ? null : "fail"
        })

    }
}


export // Function to process responses asynchronously
    async function runNavigationTestCaseAgent(stepsSessions: any, stepsMessageHandlers: any, userId: string, testCaseId: string, mcpClient: Client, runVia: string = "test-case") {
    //get all the steps from the test case
    const testCase = await getTestCase(testCaseId, userId);
    if (!testCase) {
        throw new Error('Test case not found');
    }
    const steps = testCase.steps || [];
    for (const step of steps) {
        const sessionId = stepsSessions[step.id];
        //get validation result
        try {
            const messageHandler = stepsMessageHandlers[step.id];
            await messageHandler.addMessage({
                role: "user",
                content: step.content,

            });
            await runNavigationAgent(sessionId, messageHandler, userId, mcpClient, runVia, testCaseId, step.id)
            // do only if navigate agent is not failed check testCaseProcessing is not fail
            const sessionMetadata = await getSessionMetadata(sessionId);
            if (sessionMetadata?.testCaseProcessing === "fail") {
                let retryCount = 0;
                while (retryCount < 2) {
                    console.log(`Navigation agent failed for step ${step.id}. Retrying... ${retryCount + 1} time`);
                    await messageHandler.addMessage({
                        role: "system",
                        content: "Please use refresh the page and try again and use the same tools to accomplish the goal."
                    });
                    await runNavigationAgent(sessionId, messageHandler, userId, mcpClient, runVia, testCaseId, step.id)
                    const sessionMetadata = await getSessionMetadata(sessionId);
                    if (sessionMetadata?.testCaseProcessing === "pass") {
                        break;
                    }
                    retryCount++;
                }
                if (retryCount >= 2) {
                    console.log(`Navigation agent failed for step ${step.id}, skipping rest of the steps...`);
                    break;
                }
            }
            const validationResult = await getValidation(step.id);
            if (validationResult?.status === "error" || validationResult?.result?.[validationResult.result.length - 1]?.finalResult === "Fail") {
                console.log(`Test case failed for step ${step.id}, starting retry...`);
                let retryCount = 0;
                while (retryCount < 2) {
                    console.log(`Validatio failed for ${step.id}. Retrying validation for step ${step.id} for the ${retryCount + 1} time...`);
                    await deleteValidationIfExists(step.id);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    await startValidationViaAI(sessionId, false, runVia, testCaseId);
                    const validationResult = await getValidation(step.id);
                    if (validationResult?.result?.[validationResult.result.length - 1]?.finalResult === "Pass") {
                        break;
                    }
                    retryCount++;
                }
                if (retryCount >= 2) {
                    console.log(`Test case failed for step ${step.id}, skipping rest of the steps...`);
                    break;
                }
            }
        } catch (error) {
            console.error(`Error in runNavigationTestCaseAgent for step ${step.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
            await updateSessionMetadata(sessionId, {
                messageProcessing: false,
                testCaseProcessing: runVia === "chat" ? undefined : "fail"
            })
            await mcpClient.callTool({
                name: "browser_close",
                arguments: {}
            });
            await removeMcpClient(testCaseId);
            throw error;
        }
    }
    await mcpClient.callTool({
        name: "browser_close",
        arguments: {}
    });
    await removeMcpClient(testCaseId);
}

//create function to capture image from the browser
export async function captureImageFromBrowser(sessionId: string, mcpClient: Client) {
    const streamState = await getStreamState(sessionId) || {
        active: true,
        sessionId,
        pauseReason: '',
        pausedAt: 0,
        resumedAt: 0,
        lastScreenshotAt: 0,
        lastPerceptualHash: '',
        similarityThreshold: 90, // Default 80% similarity threshold
        minScreenshotInterval: 2000, // Default 2 seconds between screenshots
        blankImageThreshold: 0.50 // Default threshold for blank image detection
    };

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
        // First, check if this is a new screenshot worth storing
        const screenshotResult = await storeScreenshot(
            sessionId,
            `data:${imageContent.mimeType || 'image/png'};base64,${imageContent.data}`,
            streamState.lastPerceptualHash,
            streamState.similarityThreshold, // Pass the similarity threshold
            streamState.blankImageThreshold, // Pass the blank image threshold
            true // Pass the skip threshold
        );

        if (screenshotResult) {
            // Send the screenshot data to the client only after confirming it's not a duplicate

            // Update the last screenshot timestamp AND hash in Firebase
            setStreamState(sessionId, {
                lastScreenshotAt: Date.now(),
                lastPerceptualHash: screenshotResult.hash
            }).catch(error => {
                console.error(`Failed to update screenshot timestamp: ${error instanceof Error ? error.message : "Unknown error"}`);
            });
        }
    }
}