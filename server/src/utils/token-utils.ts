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
        const toolCallMessages = messages.filter(m => (m.role === "assistant" && (m as any).tool_calls) || m.role === "tool");
        const prompt = [
            {
                role: "system",
                content: `
        You're an assistant that helps maintain conversational memory across long-running sessions.
        Summarize the tools and responses in a way that preserves the sequence of tool calls and their responses. Assistant should be able to use this summary to continue the conversation.
        Include important information from tool calls such as:
        - Tool names and their purposes
        - keep element and its references in the tools (if present)
        - Any structured data or identifiers that need to be preserved
        - Key arguments passed to tools
        - Critical results or errors returned by tools
        - Any state changes or important data discovered through tool usage
        - The sequence and relationship between multiple tool calls
              `.trim()
            },
            {
                role: "user",
                content: toolCallMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content || JSON.stringify((m as any).tool_calls)}`).join("\n")
            }
        ];

        // Create a summarization request
        const summaryResponse = await openai.chat.completions.create({
            model: model, // Use a smaller model for summarization
            messages: prompt,
            temperature: 0.2,
            timeout: timeout
        });
        return summaryResponse.choices[0].message.content ||
            "Conversation summarized due to length. Previous details condensed.";
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