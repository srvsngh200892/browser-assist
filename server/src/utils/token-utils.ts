// Temporary placeholder for token-utils.ts

import { MessageType } from '../services/messages';


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

export async function getStructuredAutomationSteps(
    openai: any,  // Type should match your OpenAI client
    userRawInput: string,
    model: string
): Promise<string> {
    const systemPrompt = `You are an expert assistant that reformats user-provided automation steps into a structured, step-by-step format that can be easily turned into Playwright code.
                    IMPORTANT:
                    - Do NOT remove or skip any user action.
                    - Do NOT add extra actions or assumptions.
                    - Keep all user intentions intact.
                    - Only rewrite for clarity, structure, and readability.
                    - Preserve original order and detail exactly.
                    - Return the result as plain text.
                    - DO NOT include Markdown formatting, links, or special characters.
                    - DO NOT escape quotes or use \\n. Just return normal human-readable text.
                    - Example formatting:
                        1. Click "Login".
                        2. Enter email.
                        3. Click "Submit".
                    Output the steps in a clean, imperative format (e.g., "Click", "Fill", "Select").`;


    const response = await openai.chat.completions.create({
        model: model,
        messages: [
            {
                role: 'system',
                content: systemPrompt,
            },
            {
                role: 'user',
                content: userRawInput,
            },
        ],
        temperature: 0.3,
    });

    return response.choices[0].message.content;
}