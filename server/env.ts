// TODO: Move to .env file

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MCP_SERVER_COMMAND = Deno.env.get("MCP_SERVER_COMMAND")!;
const MCP_SERVER_ARGS = JSON.parse(Deno.env.get("MCP_SERVER_ARGS") || "[]")!;

// Ensure we have a valid MCP_SERVER_URL with a robust default
const MCP_SERVER_URL = Deno.env.get("MCP_SERVER_URL") || "http://localhost:3003/sse";

const DEBUG = Deno.env.get("DEBUG") === "true";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

// Firebase Configuration
const FIREBASE_API_KEY = Deno.env.get("FIREBASE_API_KEY") || "";
const FIREBASE_AUTH_DOMAIN = Deno.env.get("FIREBASE_AUTH_DOMAIN") || "";
const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") || "";
const FIREBASE_STORAGE_BUCKET = Deno.env.get("FIREBASE_STORAGE_BUCKET") || "";
const FIREBASE_MESSAGING_SENDER_ID = Deno.env.get("FIREBASE_MESSAGING_SENDER_ID") || "";
const FIREBASE_APP_ID = Deno.env.get("FIREBASE_APP_ID") || "";

// Firebase Emulator Configuration
const USE_FIREBASE_EMULATOR = Deno.env.get("USE_FIREBASE_EMULATOR") === "true";
const FIREBASE_EMULATOR_HOST = Deno.env.get("FIREBASE_EMULATOR_HOST") || "localhost";
const FIREBASE_EMULATOR_PORT = parseInt(Deno.env.get("FIREBASE_EMULATOR_PORT") || "8080", 10);
const FIREBASE_FIRESTORE_EMULATOR_PORT = parseInt(Deno.env.get("FIREBASE_FIRESTORE_EMULATOR_PORT") || "8080", 10);

// Firebase Performance Settings
const FIRESTORE_CACHE_SIZE_MB = parseInt(Deno.env.get("FIRESTORE_CACHE_SIZE_MB") || "50", 10);
const FIRESTORE_MAX_CONCURRENT_CONNECTIONS = parseInt(Deno.env.get("FIRESTORE_MAX_CONCURRENT_CONNECTIONS") || "5", 10);
const FIRESTORE_PERSISTENCE = Deno.env.get("FIRESTORE_PERSISTENCE") === "true";
const FIRESTORE_MAX_PAYLOAD_SIZE = parseInt(Deno.env.get("FIRESTORE_MAX_PAYLOAD_SIZE") || "1048576", 10);

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

if (!MCP_SERVER_COMMAND) {
  console.warn("MCP_SERVER_COMMAND is not set but may not be needed with SSE transport");
}

if (!MCP_SERVER_ARGS) {
  console.warn("MCP_SERVER_ARGS is not set but may not be needed with SSE transport");
}

export {
  OPENAI_API_KEY,
  MCP_SERVER_COMMAND,
  MCP_SERVER_ARGS,
  MCP_SERVER_URL,
  DEBUG,
  OPENAI_MODEL,
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
  USE_FIREBASE_EMULATOR,
  FIREBASE_EMULATOR_HOST,
  FIREBASE_EMULATOR_PORT,
  FIREBASE_FIRESTORE_EMULATOR_PORT,
  FIRESTORE_CACHE_SIZE_MB,
  FIRESTORE_MAX_CONCURRENT_CONNECTIONS,
  FIRESTORE_PERSISTENCE,
  FIRESTORE_MAX_PAYLOAD_SIZE
};
