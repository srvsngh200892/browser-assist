import OpenAI from "npm:openai@4.76.1";
import { type MessageType } from "./messages.ts";
import { SUMMARY_SYSTEM_PROMPT } from "./prompts.ts";

// Define token limit constants
export const MAX_TOKEN_LIMIT = 128000; // Maximum token limit for gpt-4o model
export const TOKEN_THRESHOLD = 0.8; // When to start summarizing (80% of max)

/**
 * Estimates the token count for a collection of messages
 * This is a simplified version - for production use a proper tokenizer library
 * @param messages Array of message objects
 * @returns Estimated token count
 */
export function estimateTokenCount(messages: MessageType[]): number {
    let tokenCount = 0;

    for (const message of messages) {
        // Base token count for message structure
        tokenCount += 4; // Role and message markers

        // Content token estimation - approx 4 chars per token for English
        if (typeof message.content === 'string') {
            tokenCount += Math.ceil(message.content.length / 4);
        }

        // Add tokens for tool calls if present
        if (message.tool_calls && message.tool_calls.length > 0) {
            for (const toolCall of message.tool_calls) {
                // Base tokens for tool call
                tokenCount += 10;

                // Function name
                if (toolCall.function?.name) {
                    tokenCount += Math.ceil(toolCall.function.name.length / 4);
                }

                // Function arguments
                if (toolCall.function?.arguments) {
                    try {
                        // If it's a JSON string, estimate based on its length
                        tokenCount += Math.ceil(toolCall.function.arguments.length / 4);
                    } catch (e) {
                        // If parsing fails, use the string length
                        tokenCount += Math.ceil(String(toolCall.function.arguments).length / 4);
                    }
                }
            }
        }

        // Add tokens for tool responses
        if (message.role === 'tool' && message.tool_call_id) {
            tokenCount += 10; // Base tokens for tool response
            tokenCount += message.tool_call_id.length / 4;

            // Content of tool response
            if (message.content) {
                if (typeof message.content === 'string') {
                    tokenCount += Math.ceil(message.content.length / 4);
                } else {
                    // For non-string content, estimate based on JSON size
                    tokenCount += Math.ceil(JSON.stringify(message.content).length / 4);
                }
            }
        }
    }

    return Math.ceil(tokenCount);
}

/**
 * Generates a summary of conversation history to reduce token count
 * @param messages Array of message objects to summarize
 * @param openai OpenAI client instance
 * @returns A string containing the summary
 */
export async function summarizeConversation(messages: MessageType[], openai: any, model: string, timeout: number): Promise<string> {
    try {
        console.log("Generating conversation summary due to approaching token limit...");
        // Create a summarization request
        const summaryResponse = await openai.chat.completions.create({
            model: model, // Use a smaller model for summarization
            messages: [
                { role: "system", content: SUMMARY_SYSTEM_PROMPT },
                {
                    role: "user", content: "Please provide a detailed summary of this conversation, focusing on important context, instructions given, and actions taken. Include any crucial information that would be needed to continue the conversation effectively. The summary should be comprehensive but concise.\n\n" +
                        messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n")
                }
            ],
            temperature: 0.3,
            max_tokens: 1000,
            timeout: timeout
        });
        return summaryResponse.choices[0].message.content ||
            "Conversation summarized due to length. Previous details condensed.";
    } catch (error) {
        console.error("Error generating conversation summary:", error);
        return "Previous conversation was too long and has been condensed. Some context may be lost.";
    }
}

/**
 * Creates a summarized version of the messages
 * Keeps essential context while reducing token count
 * @param messages Original messages array
 * @param summary Summary text
 * @returns New array with summarized messages
 */
export function createSummarizedMessages(messages: MessageType[], summary: string): MessageType[] {
    // Keep only system messages, the most recent user message, and replace others with summary
    const systemMessages = messages.filter(msg => msg.role === 'system').slice(0, 1);
    const userMessages = messages.filter(msg => msg.role === 'user');
    const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;

    // Create a new set of messages with the summary
    const summarizedMessages: MessageType[] = [
        ...systemMessages,
        {
            role: "system",
            content: `NOTE: The following is a summary of the previous conversation:
                    ${summary}
                    Please continue based on this summary and the user's latest message. 
                    If user tasks require DOM elements and you are unable to find the element, 
                    please call the browser snapshot tool and then perform the user task.`
        }
    ];

    // Add the last user message if it exists
    if (lastUserMessage) {
        summarizedMessages.push(lastUserMessage);
    }

    return summarizedMessages;
} 