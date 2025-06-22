import { getSessionMetadata, updateSessionMetadata } from "./firebase-sessions";
import { createValidation, getValidation, updateValidation, StepResult } from "./firebase-validation";
import { runValidationAgent } from "./validation-agent";

export async function startValidationViaAI(sessionId: string, reValidated: boolean = false, runVia: string = "chat", testCaseId: string = "") {
    let partialRetry = false;
    let stepToRetry: string[] = [];
    let failedStepsWithIndex: { step: string, index: number }[] = [];
    let mergedResult = true;

    const sessionData = await getSessionMetadata(sessionId);
    if (!sessionData) {
        return { error: 'Session not found', code: 404 };
    }

    const validationResult = await getValidation(sessionId);

    if (validationResult?.result) {
        const index = validationResult.result.findIndex(result => result.finalResult === 'Fail');
        if (index !== -1) {
            const totalSteps = validationResult.result[index].steps.length;
            failedStepsWithIndex = validationResult.result[index].steps
                .map((step, idx) =>
                    ['failed', 'invisible'].includes(step.status)
                        ? { step: step.step, index: idx }
                        : null
                )
                .filter(Boolean) as { step: string, index: number }[];

            stepToRetry = failedStepsWithIndex.map(step => step.step);
            partialRetry = true
        }
    }

    if (reValidated || !validationResult) {
        mergedResult = false;
        await createValidation(sessionId);
        await updateSessionMetadata(sessionId, {
            lastMessageUsedForValidation: null,
            lastScreenshotUsedForValidation: null
        });
    } else {
        await updateValidation(sessionId, { status: 'pending' });
    }

    const performValidation = async () => {
        try {
            const { result, lastScreenshotUsedForValidation, error } = await runValidationAgent(sessionId, stepToRetry, partialRetry, runVia, testCaseId);
            if (error) {
                await updateValidation(sessionId, {
                    status: 'error',
                    error: error,
                    progress: 100
                });
                return;
            }
            if (mergedResult && validationResult?.result) {
                let index = validationResult.result.findIndex(result => result.finalResult === 'Fail');
                index = index === -1 ? validationResult.result.length : index;

                if (Object.keys(result).length > 0) {
                    if (partialRetry) {
                        const failedBatch = validationResult.result[index].steps;
                        const steps = failedBatch.map((step, idx) => {
                            if (['failed', 'invisible'].includes(step.status)) {
                                step.status = result.steps[0].status;
                                step.step = result.steps[0].step;
                                step.count = (step.count || 0) + 1;
                                step.status = step.count > 2 ? 'ignored' : result.steps[0].status;
                                step.explanation = step.count > 2 ? 'Ignored because it failed too many times, validate it manually, it wont be part of the validation with AI' : result.steps[0].explanation;
                                result.steps.shift();
                            }
                            return step;
                        });

                        const stepsToAdd = steps.filter(step => !result.steps.includes(step));
                        result.steps = [...stepsToAdd, ...result.steps];
                        //check if all steps are passed other exluding status ignored
                        const allPassed = result.steps.every((step: StepResult) => step.status === 'passed' || step.status === 'ignored');
                        if (allPassed) {
                            result.finalResult = 'Pass';
                            await updateSessionMetadata(sessionId, {
                                lastScreenshotUsedForValidation: lastScreenshotUsedForValidation
                            });
                        }
                    }
                    await updateValidation(sessionId, {
                        status: 'completed',
                        result: [...validationResult.result.slice(0, index), result],
                        progress: 100
                    });
                } else {
                    await updateValidation(sessionId, { status: 'completed', progress: 100 });
                }
            } else {
                await updateValidation(sessionId, {
                    status: 'completed',
                    result: [result],
                    progress: 100
                });
            }
        } catch (err) {
            console.error('Validation error:', err);
            await updateValidation(sessionId, {
                status: 'error',
                progress: 100,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    };

    if (runVia === 'test-case') {
        await performValidation();

    } else {
        performValidation();
        return { success: true, status: 'processing', message: 'Validation started.', agent: 'test-planner' };
    }
}