// Firebase Admin SDK replacement for client SDK usage
import { initializeApp, applicationDefault } from "firebase-admin/app";
import {
    getFirestore,
    Timestamp,
    FieldValue,
} from "firebase-admin/firestore";
import { v4 as uuid } from "uuid";

import {
    USE_FIREBASE_EMULATOR,
    FIREBASE_EMULATOR_HOST,
    FIREBASE_FIRESTORE_EMULATOR_PORT,
    FIRESTORE_MAX_PAYLOAD_SIZE,
    FIREBASE_PROJECT_ID
} from "./env";
import type { MessageType } from "./messages";

// Initialize Firebase Admin
const app = initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID });
const db = getFirestore();

// Connect to emulator if needed
if (USE_FIREBASE_EMULATOR) {
    console.log(`Using Firebase emulator at ${FIREBASE_EMULATOR_HOST}:${FIREBASE_FIRESTORE_EMULATOR_PORT}`);
    db.settings({
        host: `${FIREBASE_EMULATOR_HOST}:${FIREBASE_FIRESTORE_EMULATOR_PORT}`,
        ssl: false,
    });
}

const MAX_PAYLOAD_SIZE = FIRESTORE_MAX_PAYLOAD_SIZE;
const MAX_DOC_SIZE = 900 * 1024;
const MAX_CHUNK_SIZE = 800 * 1024;

const MESSAGES_COLLECTION = "messages";
const MESSAGE_CHUNKS_COLLECTION = "message_chunks";

function estimateMessageSize(message: any): number {
    return new TextEncoder().encode(JSON.stringify(message)).length;
}

function needsChunking(message: any): boolean {
    return estimateMessageSize(message) > MAX_DOC_SIZE;
}

async function storeChunkedMessage(sessionId: string, message: MessageType, messageId: string): Promise<string> {
    const messageContent = JSON.stringify(message);
    const messageSize = new TextEncoder().encode(messageContent).length;
    const chunkCount = Math.ceil(messageSize / MAX_CHUNK_SIZE);

    const metadataDoc = {
        messageId,
        sessionId,
        isChunked: true,
        chunkCount,
        timestamp: FieldValue.serverTimestamp(),
        role: message.role,
        size: messageSize,
    };

    await db.collection(MESSAGES_COLLECTION).doc(messageId).set(metadataDoc);

    for (let i = 0; i < chunkCount; i++) {
        const chunkId = `${messageId}_chunk_${i}`;
        const start = i * MAX_CHUNK_SIZE;
        const end = Math.min(start + MAX_CHUNK_SIZE, messageContent.length);
        const chunk = messageContent.slice(start, end);

        await db.collection(MESSAGE_CHUNKS_COLLECTION).doc(chunkId).set({
            messageId,
            chunkIndex: i,
            content: chunk,
            timestamp: FieldValue.serverTimestamp(),
        });
    }

    return messageId;
}

async function getChunkedMessage(messageId: string, metadata: any): Promise<MessageType> {
    let content = "";
    for (let i = 0; i < metadata.chunkCount; i++) {
        const docSnap = await db.collection(MESSAGE_CHUNKS_COLLECTION).doc(`${messageId}_chunk_${i}`).get();
        if (!docSnap.exists) throw new Error(`Chunk ${i} missing`);
        content += docSnap.data()?.content;
    }

    return JSON.parse(content);
}

export async function storeMessage(sessionId: string, message: MessageType) {
    const messageId = uuid();
    if (needsChunking(message)) {
        return storeChunkedMessage(sessionId, message, messageId);
    }

    await db.collection(MESSAGES_COLLECTION).doc(messageId).set({
        ...message,
        sessionId,
        messageId,
        timestamp: FieldValue.serverTimestamp(),
    });
    return messageId;
}

export async function storeMessages(sessionId: string, messages: MessageType[]) {
    const results = await Promise.all(messages.map(msg => storeMessage(sessionId, msg)));
    return results.filter(Boolean);
}

export async function getSessionMessages(sessionId: string, lastRetrievalTime?: number): Promise<MessageType[]> {
    let query = db.collection(MESSAGES_COLLECTION)
        .where("sessionId", "==", sessionId)
        .orderBy("timestamp", "asc");

    if (lastRetrievalTime) {
        const ts = Timestamp.fromMillis(lastRetrievalTime);
        query = db.collection(MESSAGES_COLLECTION)
            .where("sessionId", "==", sessionId)
            .where("timestamp", ">", ts)
            .orderBy("timestamp", "asc");
    }

    const snapshot = await query.get();
    const messages: MessageType[] = [];
    let totalSize = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        let msg: MessageType;
        if (data.isChunked) {
            try {
                msg = await getChunkedMessage(data.messageId, data);
            } catch {
                continue;
            }
        } else {
            const { timestamp, messageId, sessionId, ...content } = data;
            msg = content as MessageType;
        }

        const size = estimateMessageSize(msg);
        if (totalSize + size > MAX_PAYLOAD_SIZE) break;
        messages.push(msg);
        totalSize += size;
    }

    return messages;
}

export async function getNewMessages(sessionId: string, lastRetrievalTime: number): Promise<MessageType[]> {
    return getSessionMessages(sessionId, lastRetrievalTime);
}

export async function sessionHasMessages(sessionId: string): Promise<boolean> {
    const snapshot = await db.collection(MESSAGES_COLLECTION)
        .where("sessionId", "==", sessionId)
        .limit(1)
        .get();
    return !snapshot.empty;
}

export async function getLastAssistantMessage(sessionId: string): Promise<MessageType | null> {
    const snapshot = await db.collection(MESSAGES_COLLECTION)
        .where("sessionId", "==", sessionId)
        .where("role", "==", "assistant")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const data = snapshot.docs[0].data();
    if (data.isChunked) return await getChunkedMessage(data.messageId, data);

    const { timestamp, messageId, sessionId: sid, ...content } = data;
    return content as MessageType;
}
