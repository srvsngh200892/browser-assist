import OpenAI from "openai";
import { callTool } from "./mcp";
import type { MessageType } from "../services/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { stringify } from "querystring";

type OpenAiToolsInputType = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>; // JSONSchema
    };
};

export type ToolsListServerResponseType = {
    tools: {
        name: string;
        description?: string;
        inputSchema: Record<string, unknown>; // JSONSchema
    }[];
};

/**
 * Maps the tool list received from the server via tools/list to the OpenAI tools format
 * @param toolList
 * @returns
 */
export const mapToolListToOpenAiTools = (
    toolList: ToolsListServerResponseType
): OpenAiToolsInputType[] => {
    return toolList.tools.map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        },
    }));
};

/**
 * Applies the tool call(s) if they exists in the response and returns the result as a message to append
 * @param response - The OpenAI chat completion response
 * @param mcpClient - The MCP client to use for tool calls
 * @returns Array of messages generated from tool calls
 */
export const applyToolCallsIfPresent = async (
    response: OpenAI.Chat.Completions.ChatCompletion,
    mcpClient: Client
): Promise<MessageType[]> => {
    if (!response.choices?.[0]?.message?.tool_calls?.length) {
        return [];
    }

    const toolCallResults: MessageType[] = [];

    for (const toolCall of response.choices[0].message.tool_calls) {
        const toolCallId = toolCall.id;
        const { name, arguments: args } = toolCall.function;

        const [err, result] = await callTool(mcpClient, name, args);

        if (err) {
            toolCallResults.push({
                role: "tool",
                content: `ERROR: Tool call failed - ${err}`,
                tool_call_id: toolCallId,
            });
            continue;
        }

        if (!result.content?.length) {
            toolCallResults.push({
                role: "tool",
                content: `WARNING: No content returned from tool`,
                tool_call_id: toolCallId,
            });
            continue;
        }

        switch (result.content[0].type) {
            case "text":
                const data = sanitizeYamlLog(result.content[0].text);
                toolCallResults.push({
                    role: "tool",
                    content: data,
                    tool_call_id: toolCallId,
                });
                break;
            case "jpeg":
            case "image":
                toolCallResults.push({
                    role: "tool",
                    content: JSON.stringify(result.content),
                    tool_call_id: toolCallId,
                });
                break;
            default:
                // console.log("Unknown content type returned from tool:", result.content);
                throw new Error(
                    "Unknown content type returned from tool:" + JSON.stringify(result.content)
                );
        }
    }

    return toolCallResults;
};

export const isDone = (
    response: OpenAI.Chat.Completions.ChatCompletion
): boolean => {
    if (!response.choices?.length) {
        // console.log("No choices found in response");
        throw new Error("No choices found in response");
    }

    return response.choices[0].finish_reason === "stop";
};

function sanitizeYamlLog(log: string) {
    const yamlBlockMatch = log.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlBlockMatch) return log;

    const fullYamlBlock = yamlBlockMatch[0];
    const yamlContent = yamlBlockMatch[1];

    const yamlLines = yamlContent.split('\n');

    // More permissive regex that allows nested structures and various attributes
    const validLineRegex = /^(\s*)-.*(\[ref=\w+]|:\s*$)/;

    const cleanedYaml = yamlLines
        .filter(line => {
            const trimmed = line.trimEnd();
            // Keep empty lines and valid YAML lines
            return !trimmed || validLineRegex.test(trimmed);
        })
        .join('\n');

    const cleanedYamlBlock = '```yaml\n' + cleanedYaml + '\n```';
    return log.replace(fullYamlBlock, cleanedYamlBlock);
}