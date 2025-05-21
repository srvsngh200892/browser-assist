import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware';
import { getSessionMetadata, updateSessionMetadata } from '../services/firebase-sessions';
import { getValidation, updateValidation, createValidation, createOrUpdateValidation } from '../services/firebase-validation';
import { runValidationAgent } from '../services/validation-agent';
import { getValidationReportStream, getPdfGenerationStatus, startBackgroundValidationReport } from '../services/pdf-service';
import axios from 'axios';

// Initialize router
const router = express.Router();

/**
 * GET /validation/report/:sessionId
 * 
 * Generate a validation report PDF for a session and stream it to the client
 * The report contains conversation messages and screenshots
 */
router.get('/validation/report/:sessionId', authMiddleware, async (req: any, res: Response) => {
    try {
        // Get user information from the auth middleware
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID'
            });
        }

        // Verify session exists and belongs to the user
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Verify ownership
        if (sessionData.userId !== user.userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this session'
            });
        }

        // Start the PDF generation process
        const { stream, filename } = await getValidationReportStream(sessionId);

        // Set appropriate headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        // Stream the PDF to the client
        stream.pipe(res);

        // Handle errors during streaming
        stream.on('error', (error) => {
            console.error(`Error streaming PDF: ${error.message}`);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to generate validation report'
                });
            } else {
                res.end();
            }
        });

    } catch (error: unknown) {
        console.error(`Error generating validation report: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate validation report'
        });
    }
});

/**
 * GET /validation/status/:sessionId
 * 
 * Check if a session has a validation report available
 */
router.get('/validation/status/:sessionId', authMiddleware, async (req: any, res: Response) => {
    try {
        // Get user information from the auth middleware
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID'
            });
        }

        // Verify session exists and belongs to the user
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Verify ownership
        if (sessionData.userId !== user.userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this session'
            });
        }

        // Return status information
        const screenshotCount = sessionData.metadata?.screenshotCount || 0;
        return res.json({
            success: true,
            sessionId,
            hasScreenshots: screenshotCount > 0,
            screenshotCount: screenshotCount,
            canGenerateReport: true
        });

    } catch (error: unknown) {
        console.error(`Error checking validation status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to check validation status'
        });
    }
});

/**
 * POST /validation/report/:sessionId/generate
 * 
 * Start a background process to generate a validation report PDF
 */
router.post('/validation/report/:sessionId/generate', authMiddleware, async (req: any, res: Response) => {
    try {
        // Get user information from the auth middleware
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID'
            });
        }

        // Verify session exists and belongs to the user
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Verify ownership
        if (sessionData.userId !== user.userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this session'
            });
        }
        // Start the background generation process
        const result = await startBackgroundValidationReport(sessionId);

        return res.json({
            success: true,
            ...result
        });

    } catch (error: unknown) {
        console.error(`Error starting validation report generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to start validation report generation'
        });
    }
});

/**
 * GET /validation/report/:sessionId/status
 * 
 * Check the status of a validation report generation process
 */
router.get('/validation/report/:sessionId/status', authMiddleware, async (req: any, res: Response) => {
    try {
        // Get user information from the auth middleware
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID'
            });
        }

        // Verify session exists and belongs to the user
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Verify ownership
        if (sessionData.userId !== user.userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this session'
            });
        }

        // Get the generation status
        const status = getPdfGenerationStatus(sessionId);

        return res.json({
            success: true,
            sessionId,
            ...status,
            // Include a readyToDownload flag for easy UI handling
            readyToDownload: status.status === 'completed' && !!status.downloadUrl
        });

    } catch (error: unknown) {
        console.error(`Error checking validation report status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to check validation report status'
        });
    }
});

/**
 * POST /validation/download-from-storage
 * 
 * Download a file from Firebase Storage using its URL
 */
router.post('/validation/download-from-storage', authMiddleware, async (req: any, res: Response) => {
    try {
        const user = req.user;
        if (!user || !user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { fileUrl } = req.body;
        if (!fileUrl) {
            return res.status(400).json({
                success: false,
                error: 'Missing file URL'
            });
        }

        // Download the file using axios
        const response = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'stream'
        });

        // Get the filename from the URL or use a default
        const filename = fileUrl.split('/').pop() || 'downloaded-file';

        // Set headers for file download
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        // Pipe the file stream to the response
        response.data.pipe(res);

        // Handle errors during streaming
        response.data.on('error', (error: Error) => {
            console.error(`Error streaming file: ${error.message}`);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to download file'
                });
            } else {
                res.end();
            }
        });

    } catch (error: unknown) {
        console.error(`Error downloading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to download file'
        });
    }
});


router.post('/validate-via-ai', authMiddleware, async (req: any, res: Response) => {
    const { sessionId, reValidated = false } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    // Verify session exists and belongs to the user
    const sessionData = await getSessionMetadata(sessionId);
    const validationResult = await getValidation(sessionId);
    let mergedResult = true
    if (!sessionData) {
        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    }
    if (reValidated || !validationResult || (validationResult.result?.[0]?.finalResult !== 'Pass')) {
        mergedResult = false
        await createValidation(sessionId)
        await updateSessionMetadata(sessionId, {
            lastMessageUsedForValidation: null,
            lastScreenshotUsedForValidation: null
        })
    } else {
        await updateValidation(sessionId, { status: 'pending' })
    }

    (async () => {
        try {
            const newResult = await runValidationAgent(sessionId);
            if (mergedResult && validationResult && validationResult.result) {
                let index = validationResult.result.findIndex(result => result.finalResult === 'Fail');
                index = index === -1 ? validationResult.result.length : index;
                if (Object.keys(newResult).length > 0) {
                    await updateValidation(sessionId, { status: 'completed', result: [...validationResult.result.slice(0, index), newResult], progress: 100 });
                } else {
                    await updateValidation(sessionId, { status: 'completed', progress: 100 });
                }
            } else {
                await updateValidation(sessionId, { status: 'completed', result: [newResult], progress: 100 });
            }
        } catch (err) {
            console.error('Validation error:', err);
            await updateValidation(sessionId, {
                status: 'error',
                progress: 100,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    })();
    res.json({
        success: true,
        status: "processing",
        message: "Validation started.",
        agent: 'test-planner'
    });
});

router.get('/validate-via-ai/:sessionId', authMiddleware, async (req: any, res: Response) => {
    const { sessionId } = req.params;
    const sessionData = await getSessionMetadata(sessionId);
    if (!sessionData) {
        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    }
    const doc = await getValidation(sessionId);
    if (!doc) return res.status(404).json({ error: 'Validation not found' });
    //get all the results and merge steps and get final result from last result
    const mergedSteps = doc.result?.flatMap(result => result.steps) || [];
    const finalResult = doc.result?.[doc.result.length - 1]?.finalResult;
    const mergedResult = {
        steps: mergedSteps,
        finalResult
    }
    // return doc but with mergedResult instead of ResultSchema
    res.json({ ...doc, result: mergedResult });
});

export default router; 