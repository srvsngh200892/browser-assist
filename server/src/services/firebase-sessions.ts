
import { getFirestore, FieldValue, WriteBatch } from "firebase-admin/firestore";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import sessionStore from './session-store';
import { MessageHandler } from './messages';
import { sessionHasMessages } from "./firebase-messages";
// Initialize Firebase Admin if not already initialized
if (!getFirestore.length) {
    initializeApp({
        credential: applicationDefault(), // or use cert({...}) if needed
    });
}


const db = getFirestore();

const SESSIONS_COLLECTION = "sessions";

export interface SessionMetadata {
    sessionId: string;
    userId: string;
    createdAt: FirebaseFirestore.Timestamp;
    lastActive: FirebaseFirestore.Timestamp;
    status: 'active' | 'inactive' | 'expired';
    messageProcessing: boolean,
    lastMessageRetrieval: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
    metadata?: Record<string, any>;
}

export interface StreamState {
    sessionId: string;
    active: boolean;
    streamId?: string;
    pauseReason?: string;
    pausedAt?: number;
    resumedAt?: number;
    lastScreenshotAt?: number;
    lastPerceptualHash?: string;
    similarityThreshold?: number;
    minScreenshotInterval?: number;
    blankImageThreshold?: number;
}

export async function createSession(
    sessionId: string,
    userId: string,
    metadata?: Record<string, any>
): Promise<string | null> {
    try {
        const sessionData: SessionMetadata = {
            sessionId,
            userId,
            createdAt: FieldValue.serverTimestamp() as any,
            lastActive: FieldValue.serverTimestamp() as any,
            lastMessageRetrieval: FieldValue.serverTimestamp() as any,
            status: 'active',
            messageProcessing: false,
            metadata,
        };

        await db.collection(SESSIONS_COLLECTION).doc(sessionId).set(sessionData);
        return sessionId;
    } catch (error) {
        console.error("Error creating session:", error);
        return null;
    }
}

export async function getSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
    try {
        const docSnap = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
        return docSnap.exists ? (docSnap.data() as SessionMetadata) : null;
    } catch (error) {
        console.error("Error getting session metadata:", error);
        return null;
    }
}

export async function deleteMcpSession(sessionId: string): Promise<boolean> {
    try {
        await db.collection("mcpSessions").doc(sessionId).delete();
        return true
    } catch (error) {
        console.error("Error getting session metadata:", error);
        return false;
    }
}

export async function updateSessionMetadata(
    sessionId: string,
    updates: Partial<Omit<SessionMetadata, 'sessionId' | 'createdAt'>>
): Promise<boolean> {
    try {
        const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) return false;

        await sessionRef.set(
            {
                ...updates,
                sessionId,
                lastActive: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return true;
    } catch (error) {
        console.error("Error updating session metadata:", error);
        return false;
    }
}

export async function listActiveSessions(): Promise<SessionMetadata[]> {
    try {
        const querySnap = await db
            .collection(SESSIONS_COLLECTION)
            .where("status", "==", "active")
            .orderBy("lastActive", "desc")
            .get();

        return querySnap.docs.map(doc => doc.data() as SessionMetadata);
    } catch (error) {
        console.error("Error listing active sessions:", error);
        return [];
    }
}

export async function setSessionStatus(sessionId: string, status: 'active' | 'inactive' | 'expired'): Promise<boolean> {
    return updateSessionMetadata(sessionId, { status });
}

export async function  updatelastMessageRetrieval(sessionId: string): Promise<boolean> {
    return updateSessionMetadata(sessionId, { lastMessageRetrieval: FieldValue.serverTimestamp() });
}

export async function sessionExists(sessionId: string): Promise<boolean> {
    try {
        const sessionDoc = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
        return sessionDoc.exists;
    } catch (error) {
        console.error("Error checking session existence:", error);
        return false;
    }
}

export async function updateSessionActivity(sessionId: string, isActive: boolean = true): Promise<boolean> {
    return updateSessionMetadata(sessionId, {
        status: isActive ? "active" : "inactive"
    });
}

export async function setStreamState(
    sessionId: string,
    streamState: Partial<Omit<StreamState, 'sessionId'>>
): Promise<boolean> {
    try {
        const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);
        const docSnap = await sessionRef.get();

        if (!docSnap.exists) return false;

        const existing = docSnap.data();
        const updatedStreamState = {
            ...(existing?.streamState || {}),
            ...streamState,
            sessionId
        };

        await sessionRef.set(
            {
                streamState: updatedStreamState,
                lastActive: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return true;
    } catch (error) {
        console.error("Error setting stream state:", error);
        return false;
    }
}
export async function getStreamState(sessionId: string): Promise<StreamState | null> {
    try {
        const docSnap = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
        const data = docSnap.data();

        return docSnap.exists
            ? (data?.streamState as StreamState) ?? { sessionId, active: true }
            : null;
    } catch (error) {
        console.error("Error getting stream state:", error);
        return null;
    }
}

export async function clearStreamState(sessionId: string): Promise<boolean> {
    try {
        const ref = db.collection(SESSIONS_COLLECTION).doc(sessionId);
        const docSnap = await ref.get();

        if (!docSnap.exists) return false;

        await ref.update({
            streamState: FieldValue.delete(),
        });

        return true;
    } catch (error) {
        console.error("Error clearing stream state:", error);
        return false;
    }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
    try {
        const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);
        const docSnap = await sessionRef.get();

        if (!docSnap.exists) return false;

        await sessionRef.delete();

        const messagesQuery = db.collection("messages").where("sessionId", "==", sessionId);
        const snapshot = await messagesQuery.get();

        const MAX_BATCH_SIZE = 400;
        let batch: WriteBatch = db.batch();
        let count = 0;

        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            count++;
            if (count >= MAX_BATCH_SIZE) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
        }

        return true;
    } catch (error) {
        console.error("Error deleting session:", error);
        return false;
    }
}

export async function createMessageHandler(sessionId: string): Promise<MessageHandler> {
    console.log(`Creating message handler for session: ${sessionId}`);
    let messageHandler;

    // Check if the session exists in Firebase
    const exists = await sessionExists(sessionId);

    if (exists) {
        // Session exists in Firebase but not in memory - restore it
        console.log(`Restoring existing session from Firebase: ${sessionId}`);
        messageHandler = await MessageHandler.create(sessionId);
        sessionStore.setMessageHandler(sessionId, messageHandler);

        // Update session activity
        await updateSessionActivity(sessionId);

        // Load messages
        const hasExistingMessages = await sessionHasMessages(sessionId);
        if (hasExistingMessages) {
            console.log(`Found existing messages for session: ${sessionId}, loading them`);
            await messageHandler.loadMessages(false);
        }
    } else {
        throw new Error(`Session ${sessionId} not found in Firebase`);
    }
    console.log(`Message handler created: ${sessionId}`);

    return messageHandler;
}

export async function getMessageHandler(sessionId: string, fromSever=true): Promise<MessageHandler> {
    console.log(`Getting message handler for session: ${sessionId}`);
    let messageHandler = sessionStore.getMessageHandler(sessionId);
    if (messageHandler) {
        await messageHandler.updateFromStorage()
        return messageHandler;
    } else {
        console.log(`No message Handler found, creating new: ${sessionId}`);
        const exists = await sessionExists(sessionId);
        if (exists) {
            messageHandler = await MessageHandler.create(sessionId);
            sessionStore.setMessageHandler(sessionId, messageHandler);
            await messageHandler.updateFromStorage()
        } else {
            throw new Error(`Invalid session ${sessionId} not found in Firebase`);
        }
    }
    return messageHandler
}
