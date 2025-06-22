import OpenAI from "openai";
import { callTool } from "./mcp";
import type { MessageType } from "../services/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { stringify } from "querystring";
import { captureImageFromBrowser } from "../services/navigationAgent";

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
    mcpClient: Client,
    runVia?: string,
    stepId?: string
): Promise<MessageType[]> => {
    if (!response.choices?.[0]?.message?.tool_calls?.length) {
        return [];
    }

    const toolCallResults: MessageType[] = [];

    for (const toolCall of response.choices[0].message.tool_calls) {
        const toolCallId = toolCall.id;
        const { name, arguments: args } = toolCall.function;
        const [err, result] = await callTool(mcpClient, name, args);

        const data = await mcpClient.callTool({
            name: "browser_snapshot",
            arguments: {}
        });
        runVia === "test-case" && stepId && await captureImageFromBrowser(stepId, mcpClient)

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
                let text = extractDialogFromText(result.content[0].text)
                text = text ? text : result.content[0].text

                const data = text ? sanitizeYamlLog(text) : text;
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
        throw new Error("No choices found in response");
    }

    return response.choices[0].finish_reason === "stop";
};


/**
 * Extracts a 'dialog' block from a YAML-like text structure.
 *
 * The function looks for a line containing '- dialog' and extracts
 * it along with all subsequent, more-indented lines as the dialog block.
 *
 * @param {string} text - A string containing the text to parse.
 * @returns {string|null} A string containing the formatted dialog block, with indentation
 * normalized. Returns null if no dialog block is found.
 */
function extractDialogFromText(text: string) {
    const lines = text.split('\n');
    let yamlStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '```yaml') {
            yamlStartIndex = i;
            break;
        }
    }

    if (yamlStartIndex === -1) {
        return null;
    }

    const headerLines = lines.slice(0, yamlStartIndex + 1);
    const headerText = headerLines.join('\n');

    const yamlContentLines = [];
    for (let i = yamlStartIndex + 1; i < lines.length; i++) {
        if (lines[i].trim() === '```') {
            break;
        }
        yamlContentLines.push(lines[i]);
    }

    let dialogLineIndex = -1;
    let dialogIndent = -1;

    for (let i = 0; i < yamlContentLines.length; i++) {
        if (yamlContentLines[i].match(/^\s*-\s+dialog/)) {
            dialogLineIndex = i;
            dialogIndent = yamlContentLines[i].length - yamlContentLines[i].trimStart().length;
            break;
        }
    }

    let extractedBlock;

    if (dialogLineIndex !== -1) {
        const indents = yamlContentLines
            .map(line => line.trim().startsWith('-') ? line.length - line.trimStart().length : -1)
            .filter(indent => indent !== -1);
        const uniqueIndents = [...new Set(indents)].sort((a, b) => a - b);

        let useNewLogic = uniqueIndents.length >= 2;
        let containerIndex = -1;
        let mainIndent = -1;

        if (useNewLogic) {
            mainIndent = uniqueIndents[1];
            for (let i = dialogLineIndex; i >= 0; i--) {
                const line = yamlContentLines[i];
                if (line.trim().startsWith('-')) {
                    const currentIndent = line.length - line.trimStart().length;
                    if (currentIndent === mainIndent) {
                        containerIndex = i;
                        break;
                    }
                }
            }
            if (containerIndex === -1) {
                useNewLogic = false; // Fallback if container not found
            }
        }

        if (useNewLogic) {
            const relevantLines = yamlContentLines.slice(containerIndex);
            extractedBlock = relevantLines.map(line => {
                if (!line.trim()) return '';
                return line.substring(mainIndent);
            }).join('\n');
        } else {
            // Fallback to original logic: extract just the dialog and its children
            const dialogBlockRaw = [yamlContentLines[dialogLineIndex]];
            for (let i = dialogLineIndex + 1; i < yamlContentLines.length; i++) {
                const line = yamlContentLines[i];
                const currentIndent = line.length - line.trimStart().length;
                if (line.trim() && currentIndent <= dialogIndent) {
                    break;
                }
                dialogBlockRaw.push(line);
            }

            const firstLineTrimmed = dialogBlockRaw[0].trim();
            const outputLines = [firstLineTrimmed];
            if (dialogBlockRaw.length > 1) {
                let contentIndent = -1;
                for (let i = 1; i < dialogBlockRaw.length; i++) {
                    if (dialogBlockRaw[i].trim()) {
                        contentIndent = dialogBlockRaw[i].length - dialogBlockRaw[i].trimStart().length;
                        break;
                    }
                }

                if (contentIndent !== -1) {
                    for (let i = 1; i < dialogBlockRaw.length; i++) {
                        const line = dialogBlockRaw[i];
                        if (line.trim()) {
                            outputLines.push("  " + line.substring(contentIndent));
                        } else {
                            outputLines.push("");
                        }
                    }
                }
            }
            extractedBlock = outputLines.join('\n');
        }
    } else {
        let firstContentIndent = -1;
        for (let i = 0; i < yamlContentLines.length; i++) {
            if (yamlContentLines[i].trim()) {
                firstContentIndent = yamlContentLines[i].length - yamlContentLines[i].trimStart().length;
                break;
            }
        }

        if (firstContentIndent !== -1) {
            extractedBlock = yamlContentLines.map(line => line.substring(firstContentIndent)).join('\n');
        } else {
            extractedBlock = "";
        }
    }

    return `${headerText}\n${extractedBlock.trimEnd()}\n\`\`\``;
}


function sanitizeYamlLog(log: string) {
    const yamlBlockMatch = log.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlBlockMatch) return log;

    const fullYamlBlock = yamlBlockMatch[0];
    const yamlContent = yamlBlockMatch[1];

    const yamlLines = yamlContent.split('\n');

    // More permissive regex that allows nested structures and various attributes
    const validLineRegex = /^(\s*)-.*(\[ref=\w+]|:\s*$|text:)/;

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
