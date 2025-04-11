import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { MCP_SERVER_URL } from "../config/env";

// Create a proper URL object from the string
const sseUrlString = MCP_SERVER_URL;

const sseUrl = new URL(sseUrlString);

// Create the transport with the URL object
console.log(`Connecting to MCP server via SSE at: ${sseUrl.href}`);

const transport = new SSEClientTransport(sseUrl);

// Print out the transport object to debug
console.log("Transport object created with URL:", sseUrl.href);

const mcpClient = new Client(
    {
        name: "example-client",
        version: "1.0.0",
    },
    {
        capabilities: {},
    }
);

// Connect to MCP server
const connectToMcpServer = async () => {
    try {
        await mcpClient.connect(transport);
        console.log("Successfully connected to MCP server via SSE");
    } catch (error) {
        console.error("Error connecting to MCP server:", error);
        console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }
};

// Connect when this module is imported
connectToMcpServer();

export { mcpClient }; 