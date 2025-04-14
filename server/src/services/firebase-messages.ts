import { initializeApp } from "firebase/app";
import { v4 as uuid } from 'uuid';
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
    connectFirestoreEmulator,
    initializeFirestore,
    persistentLocalCache,
    memoryLocalCache,
    CACHE_SIZE_UNLIMITED,
    limit
} from "firebase/firestore";
import {
    FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID,
    USE_FIREBASE_EMULATOR,
    FIREBASE_EMULATOR_HOST,
    FIREBASE_FIRESTORE_EMULATOR_PORT,
    FIRESTORE_CACHE_SIZE_MB,
    FIRESTORE_MAX_CONCURRENT_CONNECTIONS,
    FIRESTORE_PERSISTENCE,
    FIRESTORE_MAX_PAYLOAD_SIZE
} from "./env";
import type { MessageType } from "./messages";

// Firebase configuration
const firebaseConfig = {
    apiKey: FIREBASE_API_KEY,
    authDomain: FIREBASE_AUTH_DOMAIN,
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: FIREBASE_STORAGE_BUCKET,
    messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
    appId: FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Configure Firestore with performance settings
const cacheSizeBytes = FIRESTORE_CACHE_SIZE_MB * 1024 * 1024;
const firestoreSettings = {
    ignoreUndefinedProperties: true,
    experimentalAutoDetectLongPolling: true,
    maxConcurrentLimboResolutions: FIRESTORE_MAX_CONCURRENT_CONNECTIONS,
    localCache: FIRESTORE_PERSISTENCE
        ? persistentLocalCache({ cacheSizeBytes })
        : memoryLocalCache()
};

// Initialize Firestore with custom settings
const db = initializeFirestore(app, firestoreSettings);

// Connect to Firebase emulator if enabled
if (USE_FIREBASE_EMULATOR) {
    console.log(`Using Firebase emulator at ${FIREBASE_EMULATOR_HOST}:${FIREBASE_FIRESTORE_EMULATOR_PORT}`);
    connectFirestoreEmulator(db, FIREBASE_EMULATOR_HOST, FIREBASE_FIRESTORE_EMULATOR_PORT);
}

// Configure payload size limits for queries and documents
const MAX_PAYLOAD_SIZE = FIRESTORE_MAX_PAYLOAD_SIZE;
const MAX_DOC_SIZE = 900 * 1024; // 900KB, well below Firestore's 1MB limit
const MAX_CHUNK_SIZE = 800 * 1024; // 800KB per chunk for safety

// Collection references
const MESSAGES_COLLECTION = "messages";
const MESSAGE_CHUNKS_COLLECTION = "message_chunks";

// Helper to estimate the size of a message
function estimateMessageSize(message: any): number {
    return new TextEncoder().encode(JSON.stringify(message)).length;
}

// Helper function to check if message needs chunking
function needsChunking(message: any): boolean {
    const size = estimateMessageSize(message);
    return size > MAX_DOC_SIZE;
}

// Helper function to chunk large message
async function storeChunkedMessage(sessionId: string, message: MessageType, messageId: string): Promise<string> {
    try {
        // Convert message to string
        const messageContent = JSON.stringify(message);
        const messageSize = new TextEncoder().encode(messageContent).length;

        // Calculate how many chunks we need
        const chunkCount = Math.ceil(messageSize / MAX_CHUNK_SIZE);
        console.log(`Message size ${messageSize} bytes exceeds limit. Splitting into ${chunkCount} chunks.`);

        // Create chunk references
        const chunksRef = collection(db, MESSAGE_CHUNKS_COLLECTION);

        // Create metadata document in messages collection
        const messagesRef = collection(db, MESSAGES_COLLECTION);
        const metadataDoc = {
            messageId,
            sessionId,
            isChunked: true,
            chunkCount,
            timestamp: serverTimestamp(),
            role: message.role, // Keep role in metadata for queries
            size: messageSize
        };

        await setDoc(doc(messagesRef, messageId), metadataDoc);

        // Store chunks
        for (let i = 0; i < chunkCount; i++) {
            const start = i * MAX_CHUNK_SIZE;
            const end = Math.min(start + MAX_CHUNK_SIZE, messageContent.length);
            const chunk = messageContent.substring(start, end);

            const chunkId = `${messageId}_chunk_${i}`;
            const chunkDoc = {
                messageId,
                chunkIndex: i,
                content: chunk,
                timestamp: serverTimestamp()
            };

            await setDoc(doc(chunksRef, chunkId), chunkDoc);
        }

        console.log(`Successfully stored chunked message ${messageId} with ${chunkCount} chunks`);
        return messageId;
    } catch (error) {
        console.error("Error storing chunked message:", error);
        throw error;
    }
}

// Helper function to retrieve a chunked message
async function getChunkedMessage(messageId: string, metadata: any): Promise<MessageType> {
    try {
        const { chunkCount, role } = metadata;
        const chunksRef = collection(db, MESSAGE_CHUNKS_COLLECTION);

        // Retrieve all chunks for this message
        let messageContent = "";
        for (let i = 0; i < chunkCount; i++) {
            const chunkId = `${messageId}_chunk_${i}`;
            const chunkDoc = await getDoc(doc(chunksRef, chunkId));

            if (!chunkDoc.exists()) {
                throw new Error(`Chunk ${i} of message ${messageId} not found`);
            }

            const chunkData = chunkDoc.data();
            messageContent += chunkData.content;
        }

        // Parse the reassembled message
        const message = JSON.parse(messageContent) as MessageType;
        return message;
    } catch (error) {
        console.error(`Error retrieving chunked message ${messageId}:`, error);
        // Return a placeholder message if retrieval fails
        return {
            role: metadata.role || "system",
            content: `[Error: Failed to retrieve large message content. Please try again.]`
        };
    }
}

// Store a message in Firestore
export async function storeMessage(sessionId: string, message: MessageType) {
    try {
        const messageId = uuid();

        // Check if message needs chunking
        if (needsChunking(message)) {
            return await storeChunkedMessage(sessionId, message, messageId);
        }

        // Store as normal message
        const messagesRef = collection(db, MESSAGES_COLLECTION);
        const messageData = {
            ...message,
            sessionId,
            messageId,
            timestamp: serverTimestamp()
        };

        await setDoc(doc(messagesRef, messageId), messageData);
        console.log(`Message stored with ID: ${messageId}`);
        return messageId;
    } catch (error) {
        console.error("Error storing message:", error);
        return null;
    }
}

// Store multiple messages in Firestore
export async function storeMessages(sessionId: string, messages: MessageType[]) {
    try {
        const results = await Promise.all(
            messages.map(message => storeMessage(sessionId, message))
        );
        return results.filter(Boolean);
    } catch (error) {
        console.error("Error storing multiple messages:", error);
        return [];
    }
}

// Get all messages for a session
export async function getSessionMessages(sessionId: string, lastRetrievalTime?: number): Promise<MessageType[]> {
    try {
        const messagesRef = collection(db, MESSAGES_COLLECTION);
        let messagesQuery = query(
            messagesRef,
            where("sessionId", "==", sessionId),
            orderBy("timestamp", "asc"),
            limit(10)
        );

        // If lastRetrievalTime is provided, only get messages after that time
        if (lastRetrievalTime) {
            const timestamp = new Timestamp(Math.floor(lastRetrievalTime / 1000), 0);
            messagesQuery = query(
                messagesRef,
                where("sessionId", "==", sessionId),
                where("timestamp", ">", timestamp),
                orderBy("timestamp", "asc")
            );
        }

        const snapshot = await getDocs(messagesQuery);
        const messages: MessageType[] = [];
        let totalPayloadSize = 0;
        const maxResultSize = MAX_PAYLOAD_SIZE;

        // Process each document
        for (const docSnapshot of snapshot.docs) {
            const data = docSnapshot.data();
            const { messageId } = data;

            let messageData: MessageType;

            // Check if this is a chunked message
            if (data.isChunked) {
                // Get the chunked message
                try {
                    messageData = await getChunkedMessage(messageId, data);
                } catch (chunkError) {
                    console.error(`Error retrieving chunked message ${messageId}:`, chunkError);
                    continue; // Skip this message if retrieval failed
                }
            } else {
                // Remove Firebase-specific fields before returning to client
                const { timestamp, messageId, sessionId, ...normalMessageData } = data;
                messageData = normalMessageData as MessageType;
            }

            // Estimate message size by converting to JSON and getting length
            const messageSize = estimateMessageSize(messageData);

            // Check if adding this message would exceed payload size limits
            if (totalPayloadSize + messageSize <= maxResultSize) {
                messages.push(messageData);
                totalPayloadSize += messageSize;
            } else {
                console.warn(`Message size limit reached (${totalPayloadSize}/${maxResultSize} bytes). Truncating results.`);
                // Stop processing more messages once we hit the limit
                break;
            }
        }

        console.log(`Retrieved ${messages.length} messages for session ${sessionId}, total size: ${totalPayloadSize} bytes`);
        return messages;
    } catch (error) {
        console.error(`Error getting session messages for ${sessionId}:`, error);
        return [];
    }
}

// Get new messages for a session since the last retrieval
export async function getNewMessages(sessionId: string, lastRetrievalTime: number): Promise<MessageType[]> {
    return getSessionMessages(sessionId, lastRetrievalTime);
}

// Check if a session has any messages
export async function sessionHasMessages(sessionId: string): Promise<boolean> {
    try {
        const messagesRef = collection(db, MESSAGES_COLLECTION);
        const messagesQuery = query(
            messagesRef,
            where("sessionId", "==", sessionId),
            limit(1)
        );

        const snapshot = await getDocs(messagesQuery);
        return !snapshot.empty;
    } catch (error) {
        console.error(`Error checking if session ${sessionId} has messages:`, error);
        return false;
    }
}

// Get only the last assistant message for a session
export async function getLastAssistantMessage(sessionId: string): Promise<MessageType | null> {
    try {
        console.log(`Getting last assistant message for session ${sessionId}`);

        // Use the same collection as other message functions
        const messagesRef = collection(db, MESSAGES_COLLECTION);
        console.log(`Using collection: ${MESSAGES_COLLECTION}`);

        const q = query(
            messagesRef,
            where("sessionId", "==", sessionId),
            where("role", "==", "assistant"),
            orderBy("timestamp", "desc"),
            limit(1)
        );
        console.log(`Query created for last assistant message`);

        const snapshot = await getDocs(q);
        console.log(`Query executed, empty: ${snapshot.empty}`);

        if (snapshot.empty) {
            console.log(`No assistant messages found for session ${sessionId}`);
            return null;
        }

        // Get the document data
        const docData = snapshot.docs[0].data();

        // Check if this is a chunked message
        if (docData.isChunked) {
            try {
                return await getChunkedMessage(docData.messageId, docData);
            } catch (chunkError) {
                console.error(`Error retrieving chunked assistant message:`, chunkError);
                return null;
            }
        }

        // Return the first (and only) document for non-chunked message
        const { timestamp, messageId, sessionId: msgSessionId, ...messageContent } = docData;
        return messageContent as MessageType;
    } catch (error) {
        console.error(`Error getting last assistant message for session ${sessionId}:`, error);
        return null;
    }
}

export { db, app };
