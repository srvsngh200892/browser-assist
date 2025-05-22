import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, applicationDefault } from "firebase-admin/app";

// Initialize Firebase Admin if not already initialized
if (!getFirestore.length) {
    initializeApp({
        credential: applicationDefault(), // or use cert({...}) if needed
    });
}


const db = getFirestore();

const VALIDATIONS_VIA_AI_COLLECTION = "validations-via-ai";

export type StepResult = {
    id: number;
    step: string;
    status: 'passed' | 'failed' | 'invisible' | 'ignored';
    explanation: string;
    count: number;
};

type ValidationResult = {
    steps: StepResult[];
    finalResult: 'Pass' | 'Fail';
};

type ValidationData = {
    status: 'pending' | 'processing' | 'completed' | 'error';
    result: ValidationResult[] | null;
    agent: 'test-planner' | 'qa-validator' | 'qa-reviewer';
    error: any;
    progress?: number;
};

export async function createValidation(sessionId: string) {
    const validationRef = await db.collection(VALIDATIONS_VIA_AI_COLLECTION).doc(sessionId);
    const initialData: ValidationData = { status: 'pending', result: null, error: null, agent: 'test-planner', progress: 0 };
    await validationRef.set(initialData, { merge: true });
}

export async function getValidation(sessionId: string): Promise<ValidationData | undefined> {
    const validationRef = await db.collection(VALIDATIONS_VIA_AI_COLLECTION).doc(sessionId);
    const validation = await validationRef.get();
    return validation.data() as ValidationData | undefined;
}

export async function updateValidation(sessionId: string, updates: Partial<ValidationData>) {
    const validationRef = await db.collection(VALIDATIONS_VIA_AI_COLLECTION).doc(sessionId);
    await validationRef.update(updates);
}

export async function createOrUpdateValidation(sessionId: string, data: Partial<ValidationData>) {
    const validationRef = await db.collection(VALIDATIONS_VIA_AI_COLLECTION).doc(sessionId);
    const existingValidation = await validationRef.get();
    if (existingValidation.exists) {
        await validationRef.update(data);
    } else {
        const initialData: ValidationData = { status: 'pending', result: null, error: null, agent: 'test-planner', progress: 0, ...data };
        await validationRef.set(initialData);
    }
}
