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

type StepResult = {
    id: number;
    step: string;
    status: 'passed' | 'filed' | 'invisible';
    explanation: string;
};

type ValidationResult = {
    steps: StepResult[];
    finalResult: 'Pass' | 'Fail';
};

type ValidationData = {
    status: 'pending' | 'processing' | 'completed' | 'error';
    result: ValidationResult | null;
    agent: 'test-planner' | 'qa-validator' | 'qa-reviewer';
    error: any;
};

export async function createValidation(sessionId: string) {
    const validationRef = await db.collection(VALIDATIONS_VIA_AI_COLLECTION).doc(sessionId);
    const initialData: ValidationData = { status: 'pending', result: null, error: null, agent: 'test-planner' };
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
