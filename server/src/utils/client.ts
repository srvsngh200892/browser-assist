import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { MCP_SERVER_URL } from "../config/env";

// Map to store active MCP clients by session ID
const activeClients = new Map<string, Client>();

// Create or retrieve an MCP client for a session
export const getMcpClient = async (sessionId: string): Promise<Client> => {
    // Return existing client if available
    if (activeClients.has(sessionId)) {
        console.log(`Returning existing MCP client for session ${sessionId}`);
        return activeClients.get(sessionId)!;
    }

    // Create new client if none exists
    const sseUrl = new URL(MCP_SERVER_URL);
    const transport = new SSEClientTransport(sseUrl);

    const mcpClient = new Client(
        {
            name: `session-${sessionId}`,
            version: "1.0.0",
        },
        {
            capabilities: {},
        }
    );

    try {
        await mcpClient.connect(transport);
        activeClients.set(sessionId, mcpClient);
        console.log(`Successfully connected MCP client for session ${sessionId}`);
        return mcpClient;
    } catch (error) {
        console.error(`Error connecting MCP client for session ${sessionId}:`, error);
        console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        throw error;
    }
};

// Cleanup function to disconnect and remove a client
export const removeMcpClient = async (sessionId: string): Promise<void> => {
    const client = activeClients.get(sessionId);
    if (client) {
        try {
            await client.close();
            activeClients.delete(sessionId);
            console.log(`Successfully disconnected MCP client for session ${sessionId}`);
        } catch (error) {
            console.error(`Error disconnecting MCP client for session ${sessionId}:`, error);
            throw error;
        }
    }
}; 