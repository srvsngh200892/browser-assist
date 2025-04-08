import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from "firebase/firestore";
import { db } from "./firebase-messages.ts";

// Collection references
const SESSIONS_COLLECTION = "sessions";

// Session metadata interface
export interface SessionMetadata {
    sessionId: string;
    userId: string;
    createdAt: any; // Firebase Timestamp
    lastActive: any; // Firebase Timestamp
    status: 'active' | 'inactive' | 'expired';
    metadata?: Record<string, any>; // Optional additional metadata
}

// Stream state interface for session streaming status
export interface StreamState {
    sessionId: string;
    active: boolean;
    streamId?: string;     // Unique ID for each stream to prevent stream hijacking
    pauseReason?: string;  // Can be empty string or undefined
    pausedAt?: number;
    resumedAt?: number;
    lastScreenshotAt?: number; // Added to track last screenshot time
}

// Create a new session in Firebase
export async function createSession(
    sessionId: string,
    userId: string,
    metadata?: Record<string, any>
): Promise<string | null> {
    try {
        const sessionsRef = collection(db, SESSIONS_COLLECTION);
        const sessionData: SessionMetadata = {
            sessionId,
            userId,
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp(),
            status: 'active',
            metadata
        };

        await setDoc(doc(sessionsRef, sessionId), sessionData);
        console.log(`Session created in Firebase with ID: ${sessionId} for user: ${userId}`);
        return sessionId;
    } catch (error) {
        console.error("Error creating session:", error);
        return null;
    }
}

// Get session metadata from Firebase
export async function getSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
    try {
        const sessionDoc = await getDoc(doc(db, SESSIONS_COLLECTION, sessionId));

        if (sessionDoc.exists()) {
            return sessionDoc.data() as SessionMetadata;
        }

        console.log(`No session found with ID: ${sessionId}`);
        return null;
    } catch (error) {
        console.error(`Error getting session metadata for ${sessionId}:`, error);
        return null;
    }
}

// Update session metadata (e.g., lastActive timestamp)
export async function updateSessionMetadata(
    sessionId: string,
    updates: Partial<Omit<SessionMetadata, 'sessionId' | 'createdAt'>>
): Promise<boolean> {
    try {
        const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
        const sessionDoc = await getDoc(sessionRef);

        if (!sessionDoc.exists()) {
            console.log(`Cannot update non-existent session: ${sessionId}`);
            return false;
        }

        // Get existing session data
        const existingData = sessionDoc.data();
        console.log(`Existing session data before update:`, existingData);

        // Combine existing data with updates, ensuring we preserve all fields
        const updatedData = {
            ...existingData,
            ...updates,
            lastActive: serverTimestamp()
        };

        // Ensure sessionId is preserved
        updatedData.sessionId = sessionId;

        // Log the update operation
        console.log(`Updating session ${sessionId} with data:`, updatedData);

        await setDoc(sessionRef, updatedData, { merge: true });
        console.log(`Session ${sessionId} metadata updated successfully`);
        return true;
    } catch (error) {
        console.error(`Error updating session metadata for ${sessionId}:`, error);
        return false;
    }
}

// List active sessions
export async function listActiveSessions(): Promise<SessionMetadata[]> {
    try {
        const sessionsRef = collection(db, SESSIONS_COLLECTION);
        const sessionsQuery = query(
            sessionsRef,
            where("status", "==", "active"),
            orderBy("lastActive", "desc")
        );

        const snapshot = await getDocs(sessionsQuery);
        const sessions: SessionMetadata[] = [];

        snapshot.forEach(doc => {
            sessions.push(doc.data() as SessionMetadata);
        });

        return sessions;
    } catch (error) {
        console.error("Error listing active sessions:", error);
        return [];
    }
}

// Set session status (active, inactive, expired)
export async function setSessionStatus(sessionId: string, status: 'active' | 'inactive' | 'expired'): Promise<boolean> {
    return updateSessionMetadata(sessionId, { status });
}

// Check if a session exists in Firebase
export async function sessionExists(sessionId: string): Promise<boolean> {
    try {
        const sessionDoc = await getDoc(doc(db, SESSIONS_COLLECTION, sessionId));
        return sessionDoc.exists();
    } catch (error) {
        console.error(`Error checking if session ${sessionId} exists:`, error);
        return false;
    }
}

// Update session activity timestamp
export async function updateSessionActivity(sessionId: string): Promise<boolean> {
    try {
        const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
        const sessionDoc = await getDoc(sessionRef);

        if (!sessionDoc.exists()) {
            console.log(`Cannot update activity for non-existent session: ${sessionId}`);
            return false;
        }

        // Get existing session data to ensure we preserve it
        const existingData = sessionDoc.data();

        // Update only the lastActive field and preserve all other fields
        await setDoc(sessionRef, {
            ...existingData,
            lastActive: serverTimestamp()
        }, { merge: true });

        console.log(`Session ${sessionId} activity timestamp updated`);
        return true;
    } catch (error) {
        console.error(`Error updating session activity for ${sessionId}:`, error);
        return false;
    }
}

// Set or update the stream state for a session
export async function setStreamState(
    sessionId: string,
    streamState: Partial<Omit<StreamState, 'sessionId'>>
): Promise<boolean> {
    try {
        const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
        const sessionDoc = await getDoc(sessionRef);

        if (!sessionDoc.exists()) {
            console.log(`Cannot update stream state for non-existent session: ${sessionId}`);
            return false;
        }

        // Get existing session data
        const existingData = sessionDoc.data();
        const existingStreamState = existingData.streamState || {};

        // Combine existing stream state with updates
        const updatedStreamState = {
            ...existingStreamState,
            ...streamState,
            sessionId  // Always ensure sessionId is included
        };

        // Update the session with the new stream state
        await setDoc(sessionRef, {
            ...existingData,
            streamState: updatedStreamState,
            lastActive: serverTimestamp()
        }, { merge: true });

        console.log(`Stream state updated for session ${sessionId}: ${JSON.stringify(updatedStreamState)}`);
        return true;
    } catch (error) {
        console.error(`Error updating stream state for ${sessionId}:`, error);
        return false;
    }
}

// Get the current stream state for a session
export async function getStreamState(sessionId: string): Promise<StreamState | null> {
    try {
        const sessionDoc = await getDoc(doc(db, SESSIONS_COLLECTION, sessionId));

        if (sessionDoc.exists()) {
            const data = sessionDoc.data();
            if (data.streamState) {
                return data.streamState as StreamState;
            }
            // Default state if not explicitly set
            return {
                sessionId,
                active: true
            };
        }

        console.log(`No session found with ID: ${sessionId} to get stream state`);
        return null;
    } catch (error) {
        console.error(`Error getting stream state for ${sessionId}:`, error);
        return null;
    }
}

// Clear stream state when disconnecting
export async function clearStreamState(sessionId: string): Promise<boolean> {
    try {
        const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
        const sessionDoc = await getDoc(sessionRef);

        if (!sessionDoc.exists()) {
            console.log(`Cannot clear stream state for non-existent session: ${sessionId}`);
            return false;
        }

        // Get existing session data
        const existingData = sessionDoc.data();

        // Create a new object without the streamState field
        const { streamState, ...updatedData } = existingData;

        // Update the session doc, effectively removing the streamState field
        await setDoc(sessionRef, updatedData);

        console.log(`Stream state cleared for session ${sessionId}`);
        return true;
    } catch (error) {
        console.error(`Error clearing stream state for ${sessionId}:`, error);
        return false;
    }
} 