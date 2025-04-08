import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const callTool = async (
  client: Client,
  toolName: string,
  inputArgs: string
): Promise<[err: null, result: any] | [err: string, result: null]> => {
  try {
    const args = JSON.parse(inputArgs);

    const resourceContent = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return [null, resourceContent];
  } catch (error) {
    // console.error("Error parsing arguments:", error);
    return [(error as Error).message, null];
  }
};

export { callTool };
