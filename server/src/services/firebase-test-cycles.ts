import { getFirestore, Timestamp, FieldValue, WriteBatch } from 'firebase-admin/firestore';
import { v4 as uuid } from 'uuid';

const db = getFirestore();
const TEST_CYCLES_COLLECTION = 'testCycles';
const TEST_CASES_COLLECTION = 'testCases';
const STEPS_COLLECTION = 'steps';
const GROUPS_COLLECTION = 'groups';

export interface Step {
    id: string;
    name?: string;
    content: string;
    createdAt: Timestamp;
    tags: string[];
    type: 'shared' | 'no-shared';
    userId: string;
    groupId?: string | null;
}

export interface TestCase {
    id: string;
    description: string;
    createdAt: Timestamp;
    tags: string[];
    jiraIssueIds: string[];
    jiraTestIds: string[];
    cycleId: string;
    userId: string;
    stepIds: string[];
    // This is for API response compatibility, it won't be stored in Firestore
    steps?: Step[];
}

export interface TestCycle {
    id: string;
    name: string;
    userId: string;
    createdAt: Timestamp;
    tags: string[];
    testCaseIds: string[];
    // This is for API response compatibility, it won't be stored in Firestore
    testCases?: TestCase[];
}

export type SortOrder = 'asc' | 'desc';

export interface TestCycleQueryOptions {
    tag?: string;
    sortBy?: 'createdAt' | 'name';
    sortOrder?: SortOrder;
    limit?: number;
}

export interface Group {
    id: string;
    name: string;
    userId: string;
    type: 'step' | 'testCase';
    createdAt: Timestamp;
}

// Helper to fetch test cases for a list of IDs
async function getTestCasesForIds(testCaseIds: string[]): Promise<TestCase[]> {
    if (!testCaseIds || testCaseIds.length === 0) {
        return [];
    }
    // Firestore 'in' query is limited to 30 items per query.
    // We need to batch the requests if there are more than 30 test case IDs.
    const MAX_IN_QUERY_SIZE = 30;
    const testCasePromises: Promise<TestCase[]>[] = [];

    for (let i = 0; i < testCaseIds.length; i += MAX_IN_QUERY_SIZE) {
        const batchIds = testCaseIds.slice(i, i + MAX_IN_QUERY_SIZE);
        const promise = db.collection(TEST_CASES_COLLECTION)
            .where('id', 'in', batchIds)
            .get()
            .then(snapshot => snapshot.docs.map(doc => doc.data() as TestCase));
        testCasePromises.push(promise);
    }
    const results = await Promise.all(testCasePromises);
    const testCases = results.flat();

    // The order of documents from an 'in' query is not guaranteed.
    // We must sort them to match the order in the test cycle.
    const testCaseMap = new Map(testCases.map(tc => [tc.id, tc]));
    return testCaseIds.map(id => testCaseMap.get(id)).filter(Boolean) as TestCase[];
}

// Helper to fetch steps for a list of IDs
async function getStepsForIds(stepIds: string[]): Promise<Step[]> {
    if (!stepIds || stepIds.length === 0) {
        return [];
    }

    const MAX_IN_QUERY_SIZE = 30;
    const stepPromises: Promise<Step[]>[] = [];

    for (let i = 0; i < stepIds.length; i += MAX_IN_QUERY_SIZE) {
        const batchIds = stepIds.slice(i, i + MAX_IN_QUERY_SIZE);
        const promise = db.collection(STEPS_COLLECTION)
            .where('id', 'in', batchIds)
            .get()
            .then(snapshot => snapshot.docs.map(doc => doc.data() as Step));
        stepPromises.push(promise);
    }
    const results = await Promise.all(stepPromises);
    const steps = results.flat();

    const stepMap = new Map(steps.map(s => [s.id, s]));
    return stepIds.map(id => stepMap.get(id)).filter(Boolean) as Step[];
}

export async function createTestCycle(name: string, userId: string, tags: string[] = []): Promise<TestCycle | null> {
    try {
        const newCycle = {
            name,
            userId,
            tags,
            createdAt: Timestamp.now(),
            testCaseIds: []
        };
        const testCycleRef = await db.collection(TEST_CYCLES_COLLECTION).add(newCycle);

        return {
            id: testCycleRef.id,
            ...newCycle,
            testCases: []
        };
    } catch (error) {
        console.error('Error creating test cycle:', error);
        return null;
    }
}

export async function addTestCase(cycleId: string, userId: string, description: string, tags: string[] = [], jiraIssueIds: string[] = [], jiraTestIds: string[] = []): Promise<boolean> {
    try {
        const testCycleRef = db.collection(TEST_CYCLES_COLLECTION).doc(cycleId);
        const testCycleSnap = await testCycleRef.get();

        if (!testCycleSnap.exists || testCycleSnap.data()!.userId !== userId) {
            return false;
        }

        const testCaseId = uuid();
        const newTestCase: TestCase = {
            id: testCaseId,
            description: description,
            tags,
            jiraIssueIds,
            jiraTestIds,
            createdAt: Timestamp.now(),
            cycleId,
            userId,
            stepIds: [],
            // Create a default first step from the description]
        };

        const testCaseRef = db.collection(TEST_CASES_COLLECTION).doc(testCaseId);

        // Use a batch to ensure atomicity
        const batch = db.batch();
        batch.set(testCaseRef, newTestCase);
        batch.update(testCycleRef, {
            testCaseIds: FieldValue.arrayUnion(testCaseId)
        });

        await batch.commit();

        return true;
    } catch (error) {
        console.error('Error adding test case:', error);
        return false;
    }
}

export async function getUserTestCycles(userId: string, options: TestCycleQueryOptions = {}): Promise<TestCycle[]> {
    try {
        let query = db.collection(TEST_CYCLES_COLLECTION).where('userId', '==', userId);

        if (options.tag) {
            query = query.where('tags', 'array-contains', options.tag);
        }

        if (options.sortBy) {
            query = query.orderBy(options.sortBy, options.sortOrder || 'desc');
        } else {
            query = query.orderBy('createdAt', 'desc');
        }

        if (options.limit) {
            query = query.limit(options.limit);
        }

        const testCyclesSnapshot = await query.get();

        const cycles = testCyclesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as TestCycle[];

        // In-place hydration of testCases
        for (const cycle of cycles) {
            const testCases = await getTestCasesForIds(cycle.testCaseIds);
            // In-place hydration of steps for each test case
            for (const testCase of testCases) {
                testCase.steps = await getStepsForIds(testCase.stepIds);
            }
            cycle.testCases = testCases;
        }

        return cycles;
    } catch (error) {
        console.error('Error fetching test cycles:', error);
        return [];
    }
}

export async function getTestCycle(cycleId: string, userId: string): Promise<TestCycle | null> {
    try {
        const testCycleDoc = await db.collection(TEST_CYCLES_COLLECTION).doc(cycleId).get();

        if (!testCycleDoc.exists) return null;

        const testCycleData = testCycleDoc.data()!;
        if (testCycleData.userId !== userId) return null;

        const cycle = { id: testCycleDoc.id, ...testCycleData } as TestCycle;
        const testCases = await getTestCasesForIds(cycle.testCaseIds);
        // In-place hydration of steps for each test case
        for (const testCase of testCases) {
            testCase.steps = await getStepsForIds(testCase.stepIds);
        }
        cycle.testCases = testCases;

        return cycle;
    } catch (error) {
        console.error('Error fetching test cycle:', error);
        return null;
    }
}

export async function findTestCasesByTag(
    userId: string,
    tag: string,
    sortBy: 'createdAt' | 'content' = 'createdAt',
    sortOrder: SortOrder = 'desc'
): Promise<Array<{ cycleId: string, cycleName: string, testCase: TestCase }>> {
    try {
        let query = db.collection(TEST_CASES_COLLECTION)
            .where('userId', '==', userId)
            .where('tags', 'array-contains', tag);

        // Sorting needs to be handled after fetching cycle data
        const testCasesSnapshot = await query.get();
        const testCases = testCasesSnapshot.docs.map(doc => doc.data() as TestCase);

        // Hydrate steps for each test case
        for (const testCase of testCases) {
            testCase.steps = await getStepsForIds(testCase.stepIds);
        }

        const cycleIds = [...new Set(testCases.map(tc => tc.cycleId))];
        if (cycleIds.length === 0) return [];

        const cyclesSnapshot = await db.collection(TEST_CYCLES_COLLECTION).where('id', 'in', cycleIds).get();
        const cycleMap = new Map(cyclesSnapshot.docs.map(doc => [doc.id, doc.data() as TestCycle]));

        let results = testCases.map(testCase => {
            const cycle = cycleMap.get(testCase.cycleId);
            return {
                cycleId: testCase.cycleId,
                cycleName: cycle ? cycle.name : 'Unknown Cycle',
                testCase
            };
        });

        // Sort results
        results.sort((a, b) => {
            if (sortBy === 'createdAt') {
                const timeA = a.testCase.createdAt.toMillis();
                const timeB = b.testCase.createdAt.toMillis();
                return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
            } else {
                const contentA = a.testCase.description.toLowerCase();
                const contentB = b.testCase.description.toLowerCase();
                return sortOrder === 'desc'
                    ? contentB.localeCompare(contentA)
                    : contentA.localeCompare(contentB);
            }
        });

        return results;
    } catch (error) {
        console.error('Error finding test cases by tag:', error);
        return [];
    }
}

export async function getTestCase(testCaseId: string, userId: string): Promise<TestCase | null> {
    try {
        const testCaseDoc = await db.collection(TEST_CASES_COLLECTION).doc(testCaseId).get();

        if (!testCaseDoc.exists) return null;

        const testCase = testCaseDoc.data() as TestCase;
        if (testCase.userId !== userId) return null;

        testCase.steps = await getStepsForIds(testCase.stepIds);

        return testCase;
    } catch (error) {
        console.error('Error getting test case:', error);
        return null;
    }
}

export async function updateTestCycleTags(cycleId: string, userId: string, tags: string[]): Promise<boolean> {
    try {
        const testCycleRef = db.collection(TEST_CYCLES_COLLECTION).doc(cycleId);
        const testCycle = await testCycleRef.get();

        if (!testCycle.exists || testCycle.data()!.userId !== userId) {
            return false;
        }

        await testCycleRef.update({ tags });
        return true;
    } catch (error) {
        console.error('Error updating test cycle tags:', error);
        return false;
    }
}

export async function updateTestCaseTag(cycleId: string, userId: string, testCaseId: string, tags: string[]): Promise<boolean> {
    try {
        // We don't need cycleId anymore, but we check ownership via userId on the test case itself
        const testCaseRef = db.collection(TEST_CASES_COLLECTION).doc(testCaseId);
        const testCaseDoc = await testCaseRef.get();

        if (!testCaseDoc.exists || testCaseDoc.data()!.userId !== userId) {
            return false;
        }

        await testCaseRef.update({ tags });
        return true;
    } catch (error) {
        console.error('Error updating test case tags:', error);
        return false;
    }
}

export async function deleteTestCycle(cycleId: string, userId: string): Promise<boolean> {
    try {
        const testCycleRef = db.collection(TEST_CYCLES_COLLECTION).doc(cycleId);
        const testCycleDoc = await testCycleRef.get();

        if (!testCycleDoc.exists || testCycleDoc.data()!.userId !== userId) {
            return false;
        }

        const testCaseIds = testCycleDoc.data()!.testCaseIds || [];

        const batch = db.batch();

        // Delete all associated test cases
        if (testCaseIds.length > 0) {
            testCaseIds.forEach((id: string) => {
                batch.delete(db.collection(TEST_CASES_COLLECTION).doc(id));
            });
        }

        // Delete the test cycle itself
        batch.delete(testCycleRef);

        await batch.commit();
        return true;
    } catch (error) {
        console.error('Error deleting test cycle:', error);
        return false;
    }
}

export async function deleteTestCase(cycleId: string, userId: string, testCaseId: string): Promise<boolean> {
    try {
        const testCaseRef = db.collection(TEST_CASES_COLLECTION).doc(testCaseId);
        const testCaseDoc = await testCaseRef.get();
        if (!testCaseDoc.exists || testCaseDoc.data()!.userId !== userId) {
            return false;
        }

        const testCycleRef = db.collection(TEST_CYCLES_COLLECTION).doc(cycleId);

        const batch = db.batch();
        batch.delete(testCaseRef);
        batch.update(testCycleRef, {
            testCaseIds: FieldValue.arrayRemove(testCaseId)
        });

        await batch.commit();
        return true;
    } catch (error) {
        console.error('Error deleting test case:', error);
        return false;
    }
}

export async function updateTestCase(
    cycleId: string,
    userId: string,
    testCaseId: string,
    updates: { description?: string; tags?: string[], jiraIssueIds?: string[], jiraTestIds?: string[] }
): Promise<boolean> {
    try {
        const testCaseRef = db.collection(TEST_CASES_COLLECTION).doc(testCaseId);
        const testCaseDoc = await testCaseRef.get();

        if (!testCaseDoc.exists || testCaseDoc.data()!.userId !== userId) {
            return false;
        }

        // Remove undefined values from updates
        const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));

        if (Object.keys(cleanUpdates).length === 0) {
            return true; // Nothing to update
        }

        await testCaseRef.update(cleanUpdates);
        return true;
    } catch (error) {
        console.error('Error updating test case:', error);
        return false;
    }
}

export async function addStepToTestCase(
    userId: string,
    testCaseId: string,
    content: string,
    tags: string[] = [],
    isShared: boolean = false
): Promise<Step | null> {
    try {
        const testCaseRef = db.collection(TEST_CASES_COLLECTION).doc(testCaseId);
        const testCaseDoc = await testCaseRef.get();

        if (!testCaseDoc.exists || testCaseDoc.data()!.userId !== userId) {
            return null;
        }

        const newStep: Step = {
            id: uuid(),
            content,
            createdAt: Timestamp.now(),
            tags,
            type: isShared ? 'shared' : 'no-shared',
            userId,
        };

        const stepRef = db.collection(STEPS_COLLECTION).doc(newStep.id);

        // Use a batch to ensure atomicity
        const batch = db.batch();
        batch.set(stepRef, newStep);
        batch.update(testCaseRef, {
            stepIds: FieldValue.arrayUnion(newStep.id)
        });
        await batch.commit();

        return newStep;
    } catch (error) {
        console.error('Error adding step to test case:', error);
        return null;
    }
}

export async function updateStepInTestCase(
    userId: string,
    testCaseId: string,
    stepId: string,
    updates: { content?: string, tags?: string[], type?: 'shared' | 'no-shared' }
): Promise<boolean> {
    try {
        // We need to check for test case ownership first.
        const testCaseRef = db.collection(TEST_CASES_COLLECTION).doc(testCaseId);
        const testCaseDoc = await testCaseRef.get();

        if (!testCaseDoc.exists || testCaseDoc.data()!.userId !== userId) {
            return false;
        }

        // Now, get the step and verify ownership
        const stepRef = db.collection(STEPS_COLLECTION).doc(stepId);
        const stepDoc = await stepRef.get();
        if (!stepDoc.exists || stepDoc.data()!.userId !== userId) {
            return false;
        }

        const step = stepDoc.data() as Step;
        if (step.type === 'shared') {
            console.warn(`Attempt to edit a shared step (${stepId}) by user ${userId}. Operation blocked.`);
            return false;
        }

        // Remove undefined values from updates
        const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));

        if (Object.keys(cleanUpdates).length > 0) {
            await stepRef.update(cleanUpdates);
        }

        return true;
    } catch (error) {
        console.error('Error updating step in test case:', error);
        return false;
    }
}

export async function deleteStepFromTestCase(
    userId: string,
    testCaseId: string,
    stepId: string
): Promise<boolean> {
    try {
        const testCaseRef = db.collection(TEST_CASES_COLLECTION).doc(testCaseId);
        const testCaseDoc = await testCaseRef.get();

        if (!testCaseDoc.exists || testCaseDoc.data()!.userId !== userId) {
            return false;
        }

        const stepRef = db.collection(STEPS_COLLECTION).doc(stepId);
        const stepDoc = await stepRef.get();

        const batch = db.batch();

        // Remove step from testcase
        batch.update(testCaseRef, {
            stepIds: FieldValue.arrayRemove(stepId)
        });

        // If step exists and is not shared, delete it.
        if (stepDoc.exists && stepDoc.data()!.userId === userId) {
            const step = stepDoc.data() as Step;
            if (step.type === 'no-shared') {
                batch.delete(stepRef);
            }
        }

        await batch.commit();
        return true;
    } catch (error) {
        console.error('Error deleting step from test case:', error);
        return false;
    }
}

export async function deleteStep(userId: string, stepId: string): Promise<{ success: boolean; message: string }> {
    try {
        const stepRef = db.collection(STEPS_COLLECTION).doc(stepId);
        const stepDoc = await stepRef.get();

        if (!stepDoc.exists || stepDoc.data()!.userId !== userId) {
            return { success: false, message: 'Step not found or you do not have permission to delete it.' };
        }

        const step = stepDoc.data() as Step;

        // If the step is shared, check if it's used in any test cases.
        if (step.type === 'shared') {
            const query = db.collection(TEST_CASES_COLLECTION)
                .where('userId', '==', userId)
                .where('stepIds', 'array-contains', stepId)
                .limit(1);

            const snapshot = await query.get();
            if (!snapshot.empty) {
                return { success: false, message: 'This shared step is used in at least one test case and cannot be deleted.' };
            }
        }
        // If it's a non-shared step, or a shared step that is not in use, it can be deleted.
        await stepRef.delete();
        return { success: true, message: 'Step deleted successfully.' };
    } catch (error) {
        console.error('An internal error occurred while deleting the step.', error);
        return { success: false, message: 'An internal error occurred while deleting the step.' };
    }
}

export async function checkStepUsage(userId: string, stepId: string): Promise<{ usageCount: number }> {
    try {
        const stepDoc = await db.collection(STEPS_COLLECTION).doc(stepId).get();

        if (!stepDoc.exists || stepDoc.data()!.userId !== userId) {
            // If the user doesn't own the step, they can't see its usage.
            return { usageCount: 0 };
        }

        const query = db.collection(TEST_CASES_COLLECTION)
            .where('userId', '==', userId)
            .where('stepIds', 'array-contains', stepId);

        const snapshot = await query.get();
        return { usageCount: snapshot.size };
    } catch (error) {
        console.error(`Error checking step usage for step ${stepId}:`, error);
        // In case of error, returning 0 is a safe default to avoid blocking the user unnecessarily.
        return { usageCount: 0 };
    }
}

export async function linkStepToTestCase(userId: string, testCaseId: string, stepId: string): Promise<boolean> {
    try {
        const testCaseRef = db.collection(TEST_CASES_COLLECTION).doc(testCaseId);
        const testCaseDoc = await testCaseRef.get();

        if (!testCaseDoc.exists || testCaseDoc.data()!.userId !== userId) {
            return false; // Test case not found or not owner
        }

        const stepRef = db.collection(STEPS_COLLECTION).doc(stepId);
        const stepDoc = await stepRef.get();

        if (!stepDoc.exists || stepDoc.data()!.userId !== userId) {
            return false; // Step not found or not owner
        }

        const step = stepDoc.data() as Step;
        if (step.type !== 'shared') {
            // Only shared steps can be linked.
            console.warn(`Attempt to link a non-shared step (${stepId}) to test case ${testCaseId} by user ${userId}. Operation blocked.`);
            return false;
        }

        await testCaseRef.update({
            stepIds: FieldValue.arrayUnion(stepId)
        });

        return true;
    } catch (error) {
        console.error(`Error linking step ${stepId} to test case ${testCaseId}:`, error);
        return false;
    }
}

export async function getSharedSteps(userId: string): Promise<Step[]> {
    try {
        const query = db.collection(STEPS_COLLECTION)
            .where('userId', '==', userId)
            .where('type', '==', 'shared')
            .where('groupId', '==', null)
            .orderBy('createdAt', 'desc');

        const snapshot = await query.get();
        return snapshot.docs.map(doc => doc.data() as Step);
    } catch (error) {
        console.error(`Error fetching shared steps for user ${userId}:`, error);
        return [];
    }
}

export async function getSharedStepsByGroup(userId: string, groupId: string): Promise<Step[]> {
    try {
        const query = db.collection(STEPS_COLLECTION)
            .where('userId', '==', userId)
            .where('type', '==', 'shared')
            .where('groupId', '==', groupId)
            .orderBy('createdAt', 'desc');

        const snapshot = await query.get();
        return snapshot.docs.map(doc => doc.data() as Step);
    } catch (error) {
        console.error(`Error fetching shared steps for user ${userId} and group ${groupId}:`, error);
        return [];
    }
}

export async function createSharedStep(userId: string, name: string, content: string, tags: string[] = [], groupId?: string): Promise<Step | null> {
    try {
        const newStep: Step = {
            id: uuid(),
            name,
            content,
            createdAt: Timestamp.now(),
            tags,
            type: 'shared',
            userId,
            groupId: groupId || null
        };

        const stepRef = db.collection(STEPS_COLLECTION).doc(newStep.id);
        await stepRef.set(newStep);

        return newStep;
    } catch (error) {
        console.error('Error creating shared step:', error);
        return null;
    }
}

export async function updateSharedStep(
    userId: string,
    stepId: string,
    updates: { name?: string, content?: string, tags?: string[], groupId?: string | null }
): Promise<boolean> {
    try {
        const stepRef = db.collection(STEPS_COLLECTION).doc(stepId);
        const stepDoc = await stepRef.get();
        const step = stepDoc.data() as Step;

        if (!stepDoc.exists || step.userId !== userId || step.type !== 'shared') {
            return false;
        }

        const cleanUpdates: { [key: string]: any } = {};
        for (const key in updates) {
            if (updates[key as keyof typeof updates] !== undefined) {
                cleanUpdates[key] = updates[key as keyof typeof updates];
            }
        }

        if (updates.groupId === null) {
            cleanUpdates.groupId = null;
        }


        if (Object.keys(cleanUpdates).length > 0) {
            await stepRef.update(cleanUpdates);
        }

        return true;
    } catch (error) {
        console.error('Error updating shared step:', error);
        return false;
    }
}

export async function createGroup(userId: string, name: string, type: 'step' | 'testCase' = 'step'): Promise<Group | null> {
    try {
        const newGroup = {
            name,
            userId,
            type,
            createdAt: Timestamp.now(),
        };
        const groupRef = await db.collection(GROUPS_COLLECTION).add(newGroup);

        return {
            id: groupRef.id,
            ...newGroup,
        };
    } catch (error) {
        console.error('Error creating group:', error);
        return null;
    }
}

export async function getGroups(userId: string, type: 'step' | 'testCase' = 'step'): Promise<Group[]> {
    try {
        const query = db.collection(GROUPS_COLLECTION)
            .where('userId', '==', userId)
            .where('type', '==', type)
            .orderBy('name', 'asc');

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
    } catch (error) {
        console.error(`Error fetching groups for user ${userId}:`, error);
        return [];
    }
}

export async function updateStep(
    userId: string,
    stepId: string,
    updates: { name?: string, content?: string, tags?: string[], type?: 'shared' | 'no-shared' }
): Promise<boolean> {
    try {
        const stepRef = db.collection(STEPS_COLLECTION).doc(stepId);
        const stepDoc = await stepRef.get();

        if (!stepDoc.exists || stepDoc.data()!.userId !== userId || stepDoc.data()!.type === 'shared') {
            return false;
        }

        // Remove undefined values from updates
        const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));

        if (Object.keys(cleanUpdates).length > 0) {
            await stepRef.update(cleanUpdates);
        }

        return true;
    } catch (error) {
        console.error('Error updating step:', error);
        return false;
    }
} 