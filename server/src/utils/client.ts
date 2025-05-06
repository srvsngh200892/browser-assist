import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getFirestore } from "firebase-admin/firestore";
import { MCP_SERVER_URL } from "../config/env";


const db = getFirestore();

// Map to store active MCP clients by session ID
const activeClients = new Map<string, Client>();

// Function to set a session lock in Firestore
const setSessionLock = async (
  sessionId: string,
  maxRetries = 3,
  baseDelayMs = 100
): Promise<boolean> => {
  const sessionDocRef = db.collection('sessionLocks').doc(sessionId);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const lock = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(sessionDocRef);
        if (!doc.exists) {
          transaction.set(sessionDocRef, { locked: true, timestamp: Date.now() });
          console.log(`Lock acquired for mcp session ${sessionId}`);
          return true;
        }
        return false;
      });
      return lock;
    } catch (error: any) {
      const isRetryable =
        error.code === 10 || // ABORTED: Transaction lock timeout
        error.code === 4 ||  // DEADLINE_EXCEEDED
        error.code === 13;   // INTERNAL

      console.warn(`Attempt ${attempt} failed for session ${sessionId}:`, error.message);

      if (!isRetryable || attempt === maxRetries) {
        console.error(`Giving up on lock for session ${sessionId} after ${attempt} attempts`);
        throw error; // or return false if you prefer soft failure
      }

      const delay = baseDelayMs * Math.pow(2, attempt); // exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return false;
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
    const client = activeClients.get(sessionId)!;
    console.log(`Returning existing MCP client for session ${sessionId}`);
    try {
      await client.listTools();
      await db.collection("mcpSessions").doc(sessionId).set({
        lastConnectedAt: Date.now()
      }, { merge: true });
      return client;
    } catch (error) {
      console.log('Error getting data from MCP client', error);
      console.log(`Creating new client for session id ${sessionId}`);
      await db.collection("mcpSessions").doc(sessionId).delete();
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
  const mcpSession = await getMcpSession(sessionId);
  const mcpSessionId = mcpSession ? mcpSession.mcpSessionId : undefined
  if (mcpSessionId) {
    console.log(`reconnecting with same client for mcp session ${mcpSessionId}`)
  } 
  const url = `${MCP_SERVER_URL}?userSessionId=${sessionId}`
  let sseUrl = new URL(url);
  console.log(`old session id ${mcpSessionId}`)
  const transport = new StreamableHTTPClientTransport(
    sseUrl,
    mcpSessionId ? { sessionId: mcpSessionId } : {}
  );

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
    const client = JSON.parse(JSON.stringify(activeClients.get(sessionId)));
    console.log(`transport for session ${sessionId} for mcp session ${client._transport._sessionId}`);
    await db.collection("mcpSessions").doc(sessionId).set({
      mcpSessionId: client._transport._sessionId,
      sessionId: sessionId,
      connectedAt: Date.now(),
      lastConnectedAt: Date.now()
    });
    console.log(`Successfully connected MCP client for session ${sessionId}`);
    return mcpClient;
  } catch (error) {
    console.error(`Error connecting MCP client for session ${sessionId}:`, error);
    console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    activeClients.delete(sessionId);
    throw error;
  }
};

type McpSessionData = {
  mcpSessionId: string;
  sessionId: string;
} | null;

const getMcpSession = async (sessionId: string): Promise<McpSessionData> => {
  const docRef = db.collection("mcpSessions").doc(sessionId);
  const docSnap = await docRef.get();

  if (docSnap.exists) {
    const data = docSnap.data();
    return {
      mcpSessionId: data?.mcpSessionId,
      sessionId: data?.sessionId
    };
  }

  return null;
};

