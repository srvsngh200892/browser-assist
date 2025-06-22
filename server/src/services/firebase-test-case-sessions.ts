import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
    createSession,
    SessionMetadata,
    getSessionMetadata,
    updateSessionMetadata
} from "./firebase-sessions";
import { v4 as uuidv4 } from 'uuid';

const db = getFirestore();
const SESSIONS_COLLECTION = "sessions";

export async function createSessionForTestCase(
    testCaseId: string,
    userId: string
): Promise<string | null> {
    try {
        const metadata = { testCaseId, originalTestCaseId: testCaseId };

        await createSession(testCaseId, userId, metadata, 'test-case');

        return testCaseId;
    } catch (error) {
        console.error("Error creating session for test case:", error);
        return null;
    }
}

export async function findActiveSessionForTestCase(
    testCaseId: string,
    userId: string
): Promise<SessionMetadata | null> {
    try {
        const querySnap = await db
            .collection(SESSIONS_COLLECTION)
            .where("userId", "==", userId)
            .where("metadata.testCaseId", "==", testCaseId)
            .where("status", "==", "active")
            .orderBy("lastActive", "desc")
            .limit(1)
            .get();

        if (querySnap.empty) {
            return null;
        }

        return querySnap.docs[0].data() as SessionMetadata;
    } catch (error) {
        console.error("Error finding active session for test case:", error);
        return null;
    }
}

export async function getOrCreateSessionForTestCase(
    testCaseId: string,
    userId: string
): Promise<SessionMetadata | null> {
    let session = await findActiveSessionForTestCase(testCaseId, userId);

    if (session) {
        await updateSessionMetadata(session.sessionId, { lastActive: FieldValue.serverTimestamp() as any });
        return getSessionMetadata(session.sessionId);
    }
    const metadata = { testCaseId, originalTestCaseId: testCaseId };
    const newSessionId = await createSessionForTestCase(testCaseId, userId);
    if (!newSessionId) {
        return null;
    }

    return getSessionMetadata(newSessionId);
} 