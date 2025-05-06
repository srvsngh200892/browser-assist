import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getFirestore } from "firebase-admin/firestore";
import { MCP_SERVER_URL } from "../config/env";


const db = getFirestore();

// Map to store active MCP clients by session ID
const activeClients = new Map<string, Client>();

// Function to set a session lock in Firestore
const setSessionLock = async (sessionId: string): Promise<boolean> => {
  const sessionDocRef = db.collection('sessionLocks').doc(sessionId);

  try {
    const lock = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(sessionDocRef);
      if (!doc.exists) {
        transaction.set(sessionDocRef, { locked: true });
        console.log(`getting lock for mcp session ${sessionId}`)
        return true; // Lock acquired
      }
      return false; // Lock already exists
    });
    return lock;
  } catch (error) {
    console.error(`Error setting lock for session ${sessionId}:`, error);
    throw error;
  }
};

// Function to release session lock in Firestore
const releaseSessionLock = async (sessionId: string): Promise<void> => {
  const sessionDocRef = db.collection('sessionLocks').doc(sessionId);

  try {
    await sessionDocRef.delete();
  } catch (error) {
    console.error(`Error releasing lock for session ${sessionId}:`, error);
    throw error;
  }
};

// Create or retrieve an MCP client for a session
export const getMcpClient = async (sessionId: string): Promise<Client> => {
  // Return existing client if available
  if (activeClients.has(sessionId)) {
    console.log(`Returning existing MCP client for session ${sessionId}`);
    const client = activeClients.get(sessionId)!;
    try {
      await client.listTools();
      return client;
    } catch (error) {
      console.log('Error getting data from MCP client', error);
      console.log(`Creating new client for session id ${sessionId}`);
      activeClients.delete(sessionId);
    }
  }

  // Attempt to acquire lock for session
  const lockAcquired = await setSessionLock(sessionId);
  if (!lockAcquired) {
    // Wait for the lock to be released if not acquired
    console.log(`Waiting for session lock on session ${sessionId}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return await getMcpClient(sessionId);
  }

  try {
    return await createNewClient(sessionId);
  } finally {
    await releaseSessionLock(sessionId);
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

const createNewClient = async (sessionId: string): Promise<Client> => {
  const url  = `${MCP_SERVER_URL}?userSessionId=${sessionId}`
  let sseUrl = new URL(url);
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
    activeClients.delete(sessionId);
    throw error;
  }
};
