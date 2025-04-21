// Temporary placeholder for token-utils.ts

import { MessageType } from '../services/messages';
import {
    SUMMARY_SYSTEM_PROMPT,
    initialMessageSystemPrompt,
    performNextStepSystemPrompt
} from "../utils/prompts";

// Token limits
export const MAX_TOKEN_LIMIT = 16000; // Default for GPT-3.5-Turbo
export const TOKEN_THRESHOLD = 0.8; // 80% of maximum

// Estimate token count in a conversation
export function estimateTokenCount(messages: MessageType[]): number {
    // Simple heuristic: ~4 chars per token
    let totalChars = 0;

    for (const message of messages) {
        // Use type assertion for message properties
        const msg = message as any;
        totalChars += msg.content?.length || 0;

        // Add extra tokens for role, metadata, etc.
        totalChars += 20;

        // Add tokens for tool calls if present
        if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            for (const toolCall of msg.tool_calls) {
                totalChars += JSON.stringify(toolCall).length;
            }
        }
    }

    return Math.ceil(totalChars / 4);
}

export function compressPastMessages(messages: MessageType[], numberOfMessages: number): string {
    const summarized: string[] = [];
    const detailed: string[] = [];

    messages.slice(0, numberOfMessages).forEach((msg, idx) => {
        const role = msg.role?.toUpperCase?.() || "UNKNOWN";

        const formatToolCalls = (calls: any[]) => {
            return calls.map((call, i) => {
                const args = (() => {
                    try {
                        return JSON.stringify(JSON.parse(call.function.arguments), null, 2);
                    } catch {
                        return call.function.arguments;
                    }
                })();

                return `→ Tool Call ${i + 1}\nTool: ${call.function.name}\nArguments: ${args}`;
            }).join('\n\n');
        };

        if ((msg as any).content) {
            detailed.push(`${role}: ${msg.content}`);
        } else if ((msg as any).tool_calls) {
            detailed.push(`${role}: [Tool Requests]\n${formatToolCalls((msg as any).tool_calls)}`);
        } else if ((msg as any).tool_call_id) {
            detailed.push(`${role}: [Tool Response to "${(msg as any).tool_call_id}"]\nOutput: ${(msg as any).content || '[no content]'}`);
        } else {
            detailed.push(`${role}: [Unknown message type]`);
        }
    });

    return `# Summarized Earlier History:\n${detailed.join("\n")}`
}

export async function summarizeConversation(messages: MessageType[], openai: any, model: string, timeout: number, numberOfMessages: number): Promise<string> {
    try {
        console.log("Generating conversation summary due to approaching token limit...");
        // Filter messages to only include assistant messages with tool calls and tool response messages
        // This is used to create a summary focused on the tool interactions in the conversation
        // Assistant messages with tool_calls contain the requests to execute tools
        // Tool messages contain the responses from those tool executions
        const toolCallMessages = messages.filter(m => (m.role === "user" || m.role === "assistant" || m.role === "tool"));
        const prompt = [
            {
                role: "system",
                content: `
        You're an assistant that helps maintain conversational memory across long-running sessions.
        Analyze both the user's goal and tool responses and assistant messages to track progress and maintain forward momentum.
        Pay special attention to element references and their states to prevent stale reference errors.
        Provide your analysis in the following JSON structure:
        {
          "userGoal": "Brief description of user's primary goal",
          "currentState": {
            "lastOperation": {
              "action": "What was last attempted",
              "status": "success|failed|pending",
              "error": "Error message if any",
              "elementState": {
                "staleReferences": ["List of elements that became stale"],
                "lastKnownValid": ["List of elements that were last known valid"],
                "needsRefresh": boolean,
                "pageState": "current|needsRefresh|unknown"
              }
            },
            "completedSteps": []
          },
          "pendingSteps": [
            {
              "id": "unique_step_id",
              "action": "Description of the step",
              "prerequisite": "Any required previous step",
              "requiredData": {
                "elements": ["Required element references"],
                "validationRequired": boolean
              },
              "status": "blocked|ready|needsRefresh"
            }
          ],
          "errors": {
            "current": "Description of current error if any",
            "resolution": "Steps needed to resolve",
            "referenceErrors": {
              "type": "stale|missing|invalid",
              "elements": ["Affected elements"],
              "recommendedAction": "refresh|revalidate|retry"
            }
          },
          "nextAction": {
            "step": "Immediate next action",
            "context": "Required context for next action",
            "requiresRefresh": boolean,
            "fallbackStrategy": "Alternative approach if primary action fails"
          }
        }

        Progress Tracking Rules:
        1. First, identify the user's primary goal from their messages
        2. Review tool responses to determine:
           - Which parts of the goal have been completed
           - What steps are currently in progress
           - What remains to be done
           - Whether any element references have become stale
        3. Only focus on PENDING and FUTURE steps that align with the user's goal
        
        Reference Management Rules:
        1. Track elements that become stale or invalid
        2. Recommend page refresh when multiple references are stale
        3. Include fallback strategies for handling reference errors
        4. Monitor the page state to detect when refreshes occur
        
        Step Management Rules:
        1. Check completedSteps array before suggesting any step
        2. Never suggest or include steps that appear in completedSteps
        3. Remove any step from pendingSteps immediately upon completion
        4. Only track steps that are explicitly part of the user's current goal
        5. When a step fails, only retain it if retry is necessary
        
        DO NOT:
        - Include completed steps or achieved goals in detail
        - Summarize tool calls that were successful and finished
        - Include context from completed branches of the conversation
        - Retain information that doesn't support next steps
        - Track parallel paths not chosen by the user
        - Suggest repeating any step marked as completed
        `.trim()
            },
            {
                role: "user",
                content: toolCallMessages.map(m => {
                    const role = `[${m.role.toUpperCase()}]: `;
                    const contentPart = m.content ? `Content: ${m.content}` : '';
                    const toolCallsPart = (m as any).tool_calls ? `Tool Calls: ${JSON.stringify((m as any).tool_calls)}` : '';

                    if (contentPart && toolCallsPart) {
                        return `${role}${contentPart}\n${toolCallsPart}`;
                    } else {
                        return `${role}${contentPart || toolCallsPart}`;
                    }
                }).join("\n")
            }
        ];

        // Create a summarization request
        const summaryResponse = await openai.chat.completions.create({
            model: model, // Use a smaller model for summarization
            messages: prompt,
            temperature: 0.2,
            timeout: timeout
        });
        const result = summaryResponse.choices[0].message.content;
        try {
            // Remove backticks and any JSON formatting that might be present
            const cleanedResult = result.trim()
                .replace(/^```(?:json)?|```$/g, '') // Remove code blocks with optional json tag
                .replace(/^`+|`+$/g, '')           // Remove any remaining backticks
                .trim();                           // Trim again after removing formatting
            return JSON.stringify(JSON.parse(cleanedResult));
        } catch (e) {
            console.error("Failed to parse steps response:", e);
            return JSON.stringify([]);
        }

    } catch (error) {
        console.error("Error generating conversation summary:", error);
        return "Previous conversation was too long and has been condensed. Some context may be lost.";
    }
}

// Create summarized messages
export function createSummarizedMessages(
    originalMessages: MessageType[],
    summary: string,
    numberOfMessages: number
): MessageType[] {
    console.log(`Creating summarized messages from ${originalMessages.length} messages`);

    // Get the first few system messages to preserve context
    const firtUserMessage = originalMessages.filter(m => (m as any).role === 'user')[0] || null;
    const message = originalMessages.slice(numberOfMessages).filter(m => (m as any).role != 'system')

    console.log(`message after slice: ${JSON.stringify(message)}`, firtUserMessage);
    // Check if the first message is a tool call response
    const firstMessageIsTool = message.length > 0 && message[0].role === 'tool';

    console.log(`First message is tool: ${firstMessageIsTool}`);
    console.log(`First message is role: ${message[0].role} and content: ${(message[0] as any)?.tool_calls?.length}`);

    // If the first message is a tool response, we need to include the corresponding tool call
    let allPreviousToolCalls = [];
    if (firstMessageIsTool) {
        for (const msg of originalMessages.slice(0, numberOfMessages).reverse()) {
            if (msg.role === 'tool') {
                allPreviousToolCalls.push(msg);
            } else {
                break; // Stop collecting as soon as we encounter a non-tool message
            }
        }
    }
    let toolCallMessage = null;
    if (firstMessageIsTool && (message[0] as any).tool_call_id) {
        // Find the tool call message that corresponds to this tool response
        toolCallMessage = originalMessages.find(m => {
            return m.role === 'assistant' &&
                (m as any).tool_calls?.some((call: any) => call.id === (message[0] as any).tool_call_id);
        });
    }

    // Get the initial system prompt from the original messages
    const initialMessageSystemPrompt = originalMessages[0]
    const lastSystemMessage = message[message.length - 1].role === 'system' ? null : performNextStepSystemPrompt

    // Create a new summary message with both initial prompt and summary
    const summaryMessage = {
        role: 'system',
        content: `Here's a summary of what has happened so far (retain and rely on this context): ${summary}.`
    } as unknown as MessageType;

    return [
        summaryMessage,
        ...message,
        ...(lastSystemMessage ? [lastSystemMessage] : [])
    ];
}


export async function extractStepsFromParagraph(
    content: string,
    openaiClient: any,
    model: string
): Promise<string[]> {
    try {
        const response = await openaiClient.chat.completions.create({
            model: model,
            messages: [
                {
                    role: "system",
                    content: "Extract distinct steps from the given paragraph. Return them as a JSON array of strings, where each string is a complete step."
                },
                {
                    role: "user",
                    content: content
                }
            ],
            temperature: 0.2
        });

        const result = response.choices[0].message.content;
        try {
            // Remove backticks and any JSON formatting that might be present
            const cleanedResult = result.trim()
                .replace(/^```(?:json)?|```$/g, '') // Remove code blocks with optional json tag
                .replace(/^`+|`+$/g, '')           // Remove any remaining backticks
                .trim();                           // Trim again after removing formatting
            return JSON.parse(cleanedResult);
        } catch (e) {
            console.error("Failed to parse steps response:", e);
            return [content];
        }
    } catch (error) {
        console.error("Error extracting steps:", error);
        return [content];
    }
}