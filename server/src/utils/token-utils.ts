// Temporary placeholder for token-utils.ts

import openai from 'openai';
import { MessageType } from '../services/messages';


// Token limits
export const MAX_TOKEN_LIMIT = 20000;
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

export async function classifySentiment(openai: any, userTask: string, aiResponse: string, model: string) {
    if (!userTask || !aiResponse) {
        return "negative";
    }
    //add log to check agent and user input , in one line
    console.log(`Checking sentiment for Agent input: ${userTask} against User input: ${aiResponse}`);
    const prompt = `
  You will receive a user task and an AI response.
  
  Your job is to determine the sentiment of the AI response based on whether it achieves the user's end goal — not on whether it follows every individual instruction.
  
  If the AI response clearly accomplishes the user's final objective (the end goal), return "positive".
  If the AI response fails to achieve the intended outcome, or leaves it ambiguous, return "negative".
  
  Only return one word: "positive" or "negative".
  
  User Task:
  ${userTask}
  
  AI Response:
  ${aiResponse}
  `;

    const response = await openai.chat.completions.create({
        model: model, // or "gpt-3.5-turbo"
        messages: [
            { role: "system", content: "You are a sentiment classification assistant focused on task outcomes." },
            { role: "user", content: prompt }
        ],
        temperature: 0
    });

    const sentiment = response.choices[0].message.content.trim().toLowerCase();
    return sentiment || "negative";
}