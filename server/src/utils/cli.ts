import OpenAI from "openai";

// Simplified version of printMessage from the root cli.ts
export const printMessage = (
    message:
        | OpenAI.Chat.Completions.ChatCompletionMessageParam
        | OpenAI.Chat.Completions.ChatCompletionMessage,
    debug: boolean = false
) => {
    if ((message.role === "system" || message.role === "tool") && !debug) {
        return;
    }

    console.log(`${message.role}:`);

    if (message.role === "assistant" && message.tool_calls?.length) {
        console.log(
            `The tool ${message.tool_calls?.[0]?.function.name} was called with the arguments: ${message.tool_calls?.[0]?.function.arguments}`
        );
    } else {
        // If it fails, print the content as a string
        console.log(message.content);
    }

    // Add a line break
    console.log("");
}; 