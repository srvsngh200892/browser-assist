// Load environment variables
import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Server Configuration
const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://openai.com";
const MCP_SERVER_COMMAND = process.env.MCP_SERVER_COMMAND!;
const MCP_SERVER_ARGS = JSON.parse(process.env.MCP_SERVER_ARGS || "[]")!;

// Ensure we have a valid MCP_SERVER_URL with a robust default
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3003/sse";
const MCP_SERVER_BASE_URL = process.env.MCP_SERVER_BASE_URL || "http://localhost:3003";

const DEBUG = process.env.DEBUG === "true";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT = process.env.OPENAI_TIMEOUT || 60000;

// Firebase Configuration
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "";
const FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN || "";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "demo-local.appspot.com";
const FIREBASE_MESSAGING_SENDER_ID = process.env.FIREBASE_MESSAGING_SENDER_ID || "";
const FIREBASE_APP_ID = process.env.FIREBASE_APP_ID || "";

// Firebase Emulator Configuration
const USE_FIREBASE_EMULATOR = process.env.USE_FIREBASE_EMULATOR === "true";
const FIREBASE_EMULATOR_HOST = process.env.FIREBASE_EMULATOR_HOST || "localhost";
const FIREBASE_EMULATOR_PORT = parseInt(process.env.FIREBASE_EMULATOR_PORT || "8080", 10);
const FIREBASE_FIRESTORE_EMULATOR_PORT = parseInt(process.env.FIREBASE_FIRESTORE_EMULATOR_PORT || "8080", 10);
const FIREBASE_STORAGE_EMULATOR_PORT = parseInt(process.env.FIREBASE_STORAGE_EMULATOR_PORT || "9199", 10);

// Firebase Performance Settings
const FIRESTORE_CACHE_SIZE_MB = parseInt(process.env.FIRESTORE_CACHE_SIZE_MB || "50", 10);
const FIRESTORE_MAX_CONCURRENT_CONNECTIONS = parseInt(process.env.FIRESTORE_MAX_CONCURRENT_CONNECTIONS || "5", 10);
const FIRESTORE_PERSISTENCE = process.env.FIRESTORE_PERSISTENCE === "true";
const FIRESTORE_MAX_PAYLOAD_SIZE = parseInt(process.env.FIRESTORE_MAX_PAYLOAD_SIZE || "1048576", 10);

if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not set");
}

if (!MCP_SERVER_COMMAND) {
    console.warn("MCP_SERVER_COMMAND is not set but may not be needed with SSE transport");
}

export {
    PORT,
    HOST,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    MCP_SERVER_COMMAND,
    MCP_SERVER_ARGS,
    MCP_SERVER_URL,
    MCP_SERVER_BASE_URL,
    DEBUG,
    OPENAI_MODEL,
    OPENAI_TIMEOUT,
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
    FIREBASE_STORAGE_EMULATOR_PORT,
    FIRESTORE_CACHE_SIZE_MB,
    FIRESTORE_MAX_CONCURRENT_CONNECTIONS,
    FIRESTORE_PERSISTENCE,
    FIRESTORE_MAX_PAYLOAD_SIZE
}; 