// Temporary placeholder for token-utils.ts

import { MessageType } from '../services/messages';
import {
    SUMMARY_SYSTEM_PROMPT
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

// Create summarized messages
export function createSummarizedMessages(
    originalMessages: MessageType[],
    summary: string
): MessageType[] {
    console.log(`Creating summarized messages from ${originalMessages.length} messages`);

    // Get the first few system messages to preserve context
    const systemMessages = originalMessages
        .filter(m => (m as any).role === 'system')
        .slice(0, 2);

    // Create a new summary message - use type assertion
    const summaryMessage = {
        role: 'system',
        content: `Previous conversation summary: ${summary}`,
        id: `summary-${Date.now()}`
    } as unknown as MessageType;

    // Get the last few messages for continuity
    const recentMessages = originalMessages
        .filter(m => (m as any).role !== 'system')
        .slice(-5);

    // Combine them
    return [
        ...systemMessages,
        summaryMessage,
        ...recentMessages
    ];
} 