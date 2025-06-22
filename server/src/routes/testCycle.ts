import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware';
import {
    createTestCycle,
    addTestCase,
    getUserTestCycles,
    getTestCycle,
    findTestCasesByTag,
    updateTestCycleTags,
    updateTestCaseTag,
    deleteTestCycle,
    deleteTestCase,
    updateTestCase,
    TestCycleQueryOptions,
    SortOrder,
    addStepToTestCase,
    updateStepInTestCase,
    deleteStepFromTestCase,
    getTestCase,
    deleteStep,
    linkStepToTestCase,
    getSharedSteps,
    createSharedStep,
    updateSharedStep,
    updateStep,
    checkStepUsage,
    createGroup,
    getGroups,
    getSharedStepsByGroup,
} from '../services/firebase-test-cycles';
import {
    createSession,
    updateSessionMetadata,
    getMessageHandler,
    getSessionMetadata,
} from '../services/firebase-sessions';
import { runNavigationTestCaseAgent } from '../services/navigationAgent';
import { v4 as uuid } from 'uuid';
import { MessageHandler } from '../services/messages';
import { getValidation } from '../services/firebase-validation';
import { getLastAssistantMessage } from '../services/firebase-messages';

interface AuthRequest extends Request {
    user?: {
        userId: string;
        username: string;
        email: string;
    };
}

const router = Router();

// Create a new test cycle
router.post('/test-cycles', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { name, tags = [] } = req.body;
        const userId = req.user!.userId;

        if (!name) {
            return res.status(400).json({ error: 'Test cycle name is required' });
        }

        const testCycle = await createTestCycle(name, userId, tags);

        if (!testCycle) {
            return res.status(500).json({ error: 'Failed to create test cycle' });
        }

        res.status(201).json(testCycle);
    } catch (error) {
        console.error('Error creating test cycle:', error);
        res.status(500).json({ error: 'Failed to create test cycle' });
    }
});

// Add a test case to a test cycle
router.post('/test-cycles/:cycleId/test-cases', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { cycleId } = req.params;
        const { description, tags = [], jiraIssueIds = [], jiraTestIds = [] } = req.body;
        const userId = req.user!.userId;

        if (!description) {
            return res.status(400).json({ error: 'Test case description is required' });
        }

        const success = await addTestCase(cycleId, userId, description, tags, jiraIssueIds, jiraTestIds);

        if (!success) {
            return res.status(404).json({ error: 'Test cycle not found or unauthorized' });
        }

        res.status(201).json({
            message: 'Test case added successfully'
        });
    } catch (error) {
        console.error('Error adding test case:', error);
        res.status(500).json({ error: 'Failed to add test case' });
    }
});

// Get all test cycles for the authenticated user
router.get('/test-cycles', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const {
            tag,
            sortBy,
            sortOrder = 'desc',
            limit
        } = req.query;

        const options: TestCycleQueryOptions = {
            tag: tag as string | undefined,
            sortBy: sortBy as 'createdAt' | 'name' | undefined,
            sortOrder: sortOrder as SortOrder,
            limit: limit ? parseInt(limit as string) : undefined
        };

        const testCycles = await getUserTestCycles(userId, options);
        res.json(testCycles);
    } catch (error) {
        console.error('Error fetching test cycles:', error);
        res.status(500).json({ error: 'Failed to fetch test cycles' });
    }
});

// Get a specific test cycle with its test cases
router.get('/test-cycles/:cycleId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { cycleId } = req.params;
        const userId = req.user!.userId;

        const testCycle = await getTestCycle(cycleId, userId);

        if (!testCycle) {
            return res.status(404).json({ error: 'Test cycle not found or unauthorized' });
        }

        res.json(testCycle);
    } catch (error) {
        console.error('Error fetching test cycle:', error);
        res.status(500).json({ error: 'Failed to fetch test cycle' });
    }
});

// Find test cases by tag
router.get('/test-cases/by-tag/:tag', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { tag } = req.params;
        const {
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        const userId = req.user!.userId;

        const testCases = await findTestCasesByTag(
            userId,
            tag,
            sortBy as 'createdAt' | 'content',
            sortOrder as SortOrder
        );
        res.json(testCases);
    } catch (error) {
        console.error('Error finding test cases by tag:', error);
        res.status(500).json({ error: 'Failed to find test cases' });
    }
});

// Update test cycle tags
router.put('/test-cycles/:cycleId/tags', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { cycleId } = req.params;
        const { tags } = req.body;
        const userId = req.user!.userId;

        if (!Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags must be an array' });
        }

        const success = await updateTestCycleTags(cycleId, userId, tags);

        if (!success) {
            return res.status(404).json({ error: 'Test cycle not found or unauthorized' });
        }

        res.json({ message: 'Tags updated successfully' });
    } catch (error) {
        console.error('Error updating test cycle tags:', error);
        res.status(500).json({ error: 'Failed to update tags' });
    }
});

// Update test case tags
router.put('/test-cycles/:cycleId/test-cases/:testCaseId/tags', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { cycleId, testCaseId } = req.params;
        const { tags } = req.body;
        const userId = req.user!.userId;

        if (!Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags must be an array' });
        }

        const success = await updateTestCaseTag(cycleId, userId, testCaseId, tags);

        if (!success) {
            return res.status(404).json({ error: 'Test case not found or unauthorized' });
        }

        res.json({ message: 'Tags updated successfully' });
    } catch (error) {
        console.error('Error updating test case tags:', error);
        res.status(500).json({ error: 'Failed to update tags' });
    }
});

// Delete a test cycle
router.delete('/test-cycles/:cycleId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { cycleId } = req.params;
        const userId = req.user!.userId;

        const success = await deleteTestCycle(cycleId, userId);

        if (!success) {
            return res.status(404).json({ error: 'Test cycle not found or unauthorized' });
        }

        res.json({ message: 'Test cycle deleted successfully' });
    } catch (error) {
        console.error('Error deleting test cycle:', error);
        res.status(500).json({ error: 'Failed to delete test cycle' });
    }
});

// Delete a test case from a test cycle
router.delete('/test-cycles/:cycleId/test-cases/:testCaseId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { cycleId, testCaseId } = req.params;
        const userId = req.user!.userId;

        const success = await deleteTestCase(cycleId, userId, testCaseId);

        if (!success) {
            return res.status(404).json({ error: 'Test case not found or unauthorized' });
        }

        res.json({ message: 'Test case deleted successfully' });
    } catch (error) {
        console.error('Error deleting test case:', error);
        res.status(500).json({ error: 'Failed to delete test case' });
    }
});

// Update a test case
router.put('/test-cycles/:cycleId/test-cases/:testCaseId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { cycleId, testCaseId } = req.params;
        const { description, tags, jiraIssueIds, jiraTestIds } = req.body;
        const userId = req.user!.userId;

        if (!description && !tags) {
            return res.status(400).json({ error: 'Either description or tags must be provided' });
        }

        const success = await updateTestCase(cycleId, userId, testCaseId, { description, tags, jiraIssueIds, jiraTestIds });

        if (!success) {
            return res.status(404).json({ error: 'Test case not found or unauthorized' });
        }

        res.json({ message: 'Test case updated successfully' });
    } catch (error) {
        console.error('Error updating test case:', error);
        res.status(500).json({ error: 'Failed to update test case' });
    }
});

// Add a step to a test case by creating a new one or linking an existing shared step
router.post('/test-cycles/:cycleId/test-cases/:testCaseId/steps', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { testCaseId } = req.params;
        const { content, tags = [], stepId, isShared = false } = req.body;
        const userId = req.user!.userId;

        if (stepId) {
            // Link an existing shared step
            const success = await linkStepToTestCase(userId, testCaseId, stepId);

            if (!success) {
                return res.status(400).json({ error: 'Test case not found, or step is not a shared step, or unauthorized.' });
            }

            return res.status(200).json({ message: 'Shared step linked successfully' });
        }

        if (content) {
            // Create a new step (shared or non-shared) and link it
            const newStep = await addStepToTestCase(userId, testCaseId, content, tags, isShared);

            if (!newStep) {
                return res.status(404).json({ error: 'Test case not found or unauthorized' });
            }

            return res.status(201).json(newStep);
        }

        return res.status(400).json({ error: 'Either stepId or content must be provided' });
    } catch (error) {
        console.error('Error adding step to test case:', error);
        res.status(500).json({ error: 'Failed to add step to test case' });
    }
});

// Update a step in a test case
router.put('/test-cycles/:cycleId/test-cases/:testCaseId/steps/:stepId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { testCaseId, stepId } = req.params;
        const { content, tags } = req.body;
        const userId = req.user!.userId;

        if (content === undefined && tags === undefined) {
            return res.status(400).json({ error: 'Either content or tags must be provided' });
        }

        const success = await updateStepInTestCase(userId, testCaseId, stepId, { content, tags });

        if (!success) {
            return res.status(400).json({ error: 'Test case or step not found, unauthorized, or step is shared and cannot be edited.' });
        }

        res.json({ message: 'Step updated successfully' });
    } catch (error) {
        console.error('Error updating step in test case:', error);
        res.status(500).json({ error: 'Failed to update step' });
    }
});

// Delete a step from a test case
router.delete('/test-cycles/:cycleId/test-cases/:testCaseId/steps/:stepId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { testCaseId, stepId } = req.params;
        const userId = req.user!.userId;

        const success = await deleteStepFromTestCase(userId, testCaseId, stepId);

        if (!success) {
            return res.status(404).json({ error: 'Test case or step not found, or unauthorized' });
        }

        res.json({ message: 'Step deleted successfully' });
    } catch (error) {
        console.error('Error deleting step from test case:', error);
        res.status(500).json({ error: 'Failed to delete step' });
    }
});

// Run a test case
router.get('/test-cases/:testCaseId/run-status', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { testCaseId } = req.params;
        const userId = req.user!.userId;

        const testCase = await getTestCase(testCaseId, userId);
        if (!testCase) {
            return res.status(404).json({ error: 'Test case not found or unauthorized' });
        }

        if (!testCase.steps || testCase.steps.length === 0) {
            return res.status(200).json({
                steps: {},
                finalResult: 'invlaid',
                error: 'Test case has no steps to run.'
            });
        }

        let response: any = {
            steps: {}
        };
        let anyFailedStep = false;
        let sessionForStep = true;
        let anyStepProcessing = false;

        //check if any one step has session
        let hasSession = false;


        for (const step of testCase.steps) {
            // get session for each step
            const session = await getSessionMetadata(step.id);
            //get assisatant message for role 

            if (!session) {
                sessionForStep = false;
            } else {
                hasSession = true;
            }
            const assistantMessage = await getLastAssistantMessage(step.id) || {};
            const validationResult = await getValidation(step.id);
            const lastResult = validationResult?.result?.[validationResult.result.length - 1];
            const navigationStatus = session ? (session.testCaseProcessing || 'not-started') : 'invalidated';
            let validationStatus;
            if (navigationStatus == "pass") {
                validationStatus = lastResult?.finalResult || 'processing';
            } else if (navigationStatus == "processing") {
                validationStatus = 'not-started';
            } else {
                validationStatus = navigationStatus;
            }

            if (validationStatus == "not-started" || validationStatus == "processing" || validationResult?.status == "pending" || validationResult?.status == "processing") {
                anyStepProcessing = true;
            }

            if ((typeof validationStatus === 'string' && validationStatus.toLowerCase() === "fail") || validationResult?.status === "error" || navigationStatus === 'fail') {
                validationStatus = "fail";
                anyFailedStep = true;
            }
            response.steps[step.id] = { navigationStatus: navigationStatus, validationStatus: validationStatus, validationResult, assistantMessage };
        }
        if (anyFailedStep) {
            response.finalResult = 'fail';
        } else if (!sessionForStep) {
            response.finalResult = 'invalidated';
        } else if (anyStepProcessing) {
            response.finalResult = 'processing';
        } else {
            response.finalResult = 'pass';
        }
        response.sessionId = testCaseId;

        if (!hasSession) {
            response = { steps: {}, finalResult: 'noRunFound', sessionId: testCaseId };
        }

        res.status(200).json(response);

    } catch (error) {
        console.error('Error running test case:', error);
        res.status(500).json({ error: 'Failed to run test case' });
    }
});

router.delete('/shared-steps/:stepId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { stepId } = req.params;
        const userId = req.user!.userId;

        const result = await deleteStep(userId, stepId);

        if (!result.success) {
            return res.status(400).json({ error: result.message });
        }

        res.json({ message: result.message });
    } catch (error) {
        console.error('Error deleting step:', error);
        res.status(500).json({ error: 'Failed to delete step' });
    }
});

// Get all shared steps for the authenticated user
router.get('/shared-steps', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const sharedSteps = await getSharedSteps(userId);
        res.json(sharedSteps);
    } catch (error) {
        console.error('Error fetching shared steps:', error);
        res.status(500).json({ error: 'Failed to fetch shared steps' });
    }
});

// Create a new shared step (ungrouped)
router.post('/shared-steps', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { name, content, tags } = req.body;
        const userId = req.user!.userId;

        if (!content) return res.status(400).json({ error: 'Step content is required' });
        if (!name) return res.status(400).json({ error: 'Step name is required' });

        const step = await createSharedStep(userId, name, content, tags);
        if (!step) return res.status(500).json({ error: 'Failed to create shared step' });

        res.status(201).json(step);
    } catch (error) {
        console.error('Error creating shared step:', error);
        res.status(500).json({ error: 'Failed to create shared step' });
    }
});

// Create a new shared step within a group
router.post('/groups/:groupId/shared-steps', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { groupId } = req.params;
        const { name, content, tags } = req.body;
        const userId = req.user!.userId;

        if (!content) return res.status(400).json({ error: 'Step content is required' });
        if (!name) return res.status(400).json({ error: 'Step name is required' });

        const step = await createSharedStep(userId, name, content, tags, groupId);
        if (!step) return res.status(500).json({ error: 'Failed to create shared step' });

        res.status(201).json(step);
    } catch (error) {
        console.error('Error creating shared step in group:', error);
        res.status(500).json({ error: 'Failed to create shared step' });
    }
});

// Update a step
router.put('/shared-steps/:stepId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { stepId } = req.params;
        const { name, content, tags, groupId } = req.body;
        const userId = req.user!.userId;

        const updates = { name, content, tags, groupId };

        const success = await updateSharedStep(userId, stepId, updates);

        if (!success) {
            return res.status(404).json({ error: 'Shared step not found, unauthorized, or cannot be updated.' });
        }

        res.json({ message: 'Shared step updated successfully.' });
    } catch (error) {
        console.error('Error updating shared step:', error);
        res.status(500).json({ error: 'Failed to update shared step.' });
    }
});

router.get('/shared-steps/:stepId/usage', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { stepId } = req.params;
        const userId = req.user!.userId;

        const usage = await checkStepUsage(userId, stepId);
        res.json(usage);
    } catch (error) {
        console.error('Error checking step usage:', error);
        res.status(500).json({ error: 'Failed to check step usage' });
    }
});

// Group routes
router.post('/groups', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { name, type } = req.body;
        const userId = req.user!.userId;

        if (!name) {
            return res.status(400).json({ error: 'Group name is required' });
        }

        const group = await createGroup(userId, name, type);
        if (!group) {
            return res.status(500).json({ error: 'Failed to create group' });
        }
        res.status(201).json(group);
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

router.get('/groups', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const type = req.query.type as 'step' | 'testCase' | undefined;

        const groups = await getGroups(userId, type);
        res.json(groups);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});


router.get('/groups/:groupId/steps', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { groupId } = req.params;
        const userId = req.user!.userId;

        const steps = await getSharedStepsByGroup(userId, groupId);
        res.json(steps);
    } catch (error) {
        console.error('Error fetching shared steps by group:', error);
        res.status(500).json({ error: 'Failed to fetch shared steps by group' });
    }
});
export default router; 