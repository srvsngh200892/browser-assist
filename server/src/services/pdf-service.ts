import admin from '../config/firebase';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import { getSessionMetadata } from './firebase-sessions';
import { getValidation } from './firebase-validation';
import { getTestCase } from './firebase-test-cycles';

const storageBucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
const db = admin.firestore();

// Store PDF generation status
const pdfGenerationStatus = new Map<string, {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    error?: string;
    progress?: number;
    totalScreenshots?: number;
    statusMessage?: string;
    downloadUrl?: string;
}>();

// Add consistent styling
const styles = {
    title: {
        fontSize: 24,
        font: 'Helvetica-Bold',
        lineGap: 20
    },
    header: {
        fontSize: 18,
        font: 'Helvetica-Bold',
        lineGap: 16
    },
    normal: {
        fontSize: 12,
        font: 'Helvetica',
        lineGap: 12
    },
    pageMargin: 50
};

/**
 * Helper function to fetch a remote image and return it as a buffer
 */
async function fetchImageAsBuffer(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'Accept': 'image/*'  // Explicitly accept image content
        }
    });
    return Buffer.from(response.data);
}

async function getSignedUrl(file: any) {
    // Simulate a signed URL for local testing
    if (process.env.USE_FIREBASE_EMULATOR === 'true') {
        const encodedPath = encodeURIComponent(file.name);
        const url = `http://${process.env.FIREBASE_EMULATOR_HOST}:${process.env.FIREBASE_STORAGE_EMULATOR_PORT}/v0/b/${process.env.FIREBASE_STORAGE_BUCKET}/o/${encodedPath}?alt=media`;
        return [url];
    }
    return await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
}

/**
 * Fetch all messages for a session
 */
async function fetchSessionMessages(sessionId: string, type: string = 'chat') {
    //if type is test-case get testcase from testcaseId as sessiongid and get all steps id as list of sessionId and then get all messages from messages collection with where sessionId in list of sessionId
    if (type === 'test-case') {
        const testCaseDoc = await db.collection('testCases').doc(sessionId).get();
        if (!testCaseDoc.exists) {
            console.error(`Test case with ID ${sessionId} not found.`);
            return [];
        }
        const userId = testCaseDoc.data()?.userId;
        if (!userId) {
            console.error(`User ID not found for test case ${sessionId}.`);
            return [];
        }

        const testCase = await getTestCase(sessionId, userId);
        const steps = testCase?.steps;

        if (!steps || steps.length === 0) {
            console.log(`No steps found for test case ${sessionId}.`);
            return [];
        }

        const messages = [];
        for (const step of steps) {
            const messagesCollection = db.collection('messages');
            const q = messagesCollection.where('sessionId', '==', step.id)
                .where('role', 'in', ['user', 'assistant'])
                .orderBy('timestamp', 'asc');
            const snapshot = await q.get();
            messages.push(...snapshot.docs.map(doc => doc.data()));
        }
        return messages;
    }
    try {
        const messagesCollection = db.collection('messages');
        const q = messagesCollection.where('sessionId', '==', sessionId)
            .where('role', 'in', ['user', 'assistant'])
            .orderBy('timestamp', 'asc');
        const snapshot = await q.get();
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error('Error fetching session messages:', error);
        throw error;
    }
}

/**
 * Fetch all screenshots for a session from Firebase Storage
 */
async function fetchSessionScreenshots(sessionId: string, type: string = 'chat') {
    if (type === 'test-case') {
        try {
            const testCaseDoc = await db.collection('testCases').doc(sessionId).get();
            if (!testCaseDoc.exists) {
                console.error(`Test case ${sessionId} not found.`);
                return [];
            }
            const userId = testCaseDoc.data()?.userId;
            if (!userId) {
                console.error(`User ID not found for test case ${sessionId}.`);
                return [];
            }
            const testCase = await getTestCase(sessionId, userId);
            const steps = testCase?.steps;
            if (!steps || !Array.isArray(steps) || steps.length === 0) {
                console.log(`No steps found for test case ${sessionId}.`);
                return [];
            }

            const allScreenshots = [];
            for (const step of steps) {
                const stepSessionId = step.id;
                const [files] = await storageBucket.getFiles({ prefix: `validations/${stepSessionId}/screenshots` });

                for (const file of files) {
                    try {
                        const url = await getSignedUrl(file);
                        const filename = file.name;
                        const timestamp = parseInt(path.basename(filename).split('.')[0], 10) || Date.now();
                        allScreenshots.push({
                            url: url[0],
                            timestamp,
                            path: file.name
                        });
                    } catch (itemError) {
                        console.error(`Error processing screenshot ${file.name}:`, itemError);
                    }
                }
            }

            console.log(`Found ${allScreenshots.length} total screenshots for test case ${sessionId}.`);
            return allScreenshots.sort((a, b) => a.timestamp - b.timestamp);
        } catch (error) {
            console.error(`Error fetching screenshots for test case ${sessionId}:`, error);
            throw error;
        }
    }

    try {
        // List all screenshots in the directory
        const [files] = await storageBucket.getFiles({ prefix: `validations/${sessionId}/screenshots` });
        console.log(`Found ${files.length} screenshots for session ${sessionId} in storage`);

        const screenshots = [];
        for (const file of files) {
            try {
                const url = await getSignedUrl(file);
                const filename = file.name;
                const timestamp = parseInt(path.basename(filename).split('.')[0], 10) || Date.now();
                screenshots.push({
                    url: url[0],
                    timestamp,
                    path: file.name
                });
            } catch (itemError) {
                console.error(`Error processing screenshot ${file.name}:`, itemError);
            }
        }

        return screenshots.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
        console.error('Error fetching session screenshots from storage:', error);
        throw error;
    }
}

/**
 * Class to handle batched processing of screenshots to manage memory usage
 */
class BatchedScreenshotProcessor {
    private sessionId: string;
    private batchSize: number;
    private screenshots: any[];
    private currentBatchIndex: number = 0;

    constructor(sessionId: string, screenshots: any[], batchSize: number = 5) {
        this.sessionId = sessionId;
        this.screenshots = screenshots;
        this.batchSize = batchSize;
    }

    getTotalCount(): number {
        return this.screenshots.length;
    }

    getBatchCount(): number {
        return Math.ceil(this.screenshots.length / this.batchSize);
    }

    getCurrentBatch(): any[] {
        const startIndex = this.currentBatchIndex * this.batchSize;
        const endIndex = Math.min(startIndex + this.batchSize, this.screenshots.length);
        return this.screenshots.slice(startIndex, endIndex);
    }

    nextBatch(): boolean {
        if (this.hasMoreBatches()) {
            this.currentBatchIndex++;
            return true;
        }
        return false;
    }

    hasMoreBatches(): boolean {
        const startIndex = (this.currentBatchIndex + 1) * this.batchSize;
        return startIndex < this.screenshots.length;
    }

    reset(): void {
        this.currentBatchIndex = 0;
    }
}

/**
 * Update the progress of PDF generation
 */
function updatePdfGenerationProgress(sessionId: string, progress: number, statusMessage?: string): void {
    const currentStatus = pdfGenerationStatus.get(sessionId);
    if (currentStatus) {
        pdfGenerationStatus.set(sessionId, {
            ...currentStatus,
            progress,
            statusMessage
        });
    }
}

/**
 * Main function to generate validation report PDF
 */
export async function generateValidationReport(sessionId: string, type: string = 'chat'): Promise<{ tempFilePath: string, filename: string }> {
    // Create a temporary file path
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `validation-report-${sessionId}.pdf`);
    const filename = `validation-report-${sessionId}.pdf`;

    try {
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        const writeStream = fs.createWriteStream(tempFilePath);
        doc.pipe(writeStream);

        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            throw new Error('Session not found');
        }

        updatePdfGenerationProgress(sessionId, 5, 'Fetching session data');

        const messages = await fetchSessionMessages(sessionId, type);
        updatePdfGenerationProgress(sessionId, 10, 'Fetching messages');

        const screenshots = await fetchSessionScreenshots(sessionId, type);
        updatePdfGenerationProgress(sessionId, 15, 'Fetching screenshots');

        const batchProcessor = new BatchedScreenshotProcessor(sessionId, screenshots);
        updatePdfGenerationProgress(sessionId, 20, 'Creating title page');

        doc.font(styles.title.font)
            .fontSize(styles.title.fontSize)
            .text('Validation Report', {
                align: 'center',
                lineGap: styles.title.lineGap
            });

        doc.font(styles.normal.font)
            .fontSize(styles.normal.fontSize)
            .text(`Session ID: ${sessionId}`, {
                align: 'center',
                lineGap: styles.normal.lineGap
            })
            .text(`Start Time: ${new Date((sessionData.createdAt?.toDate?.() || Date.now())).toLocaleString()}`, {
                align: 'center',
                lineGap: styles.normal.lineGap
            })
            .text(`Total Screenshots: ${screenshots.length}`, {
                align: 'center',
                lineGap: styles.normal.lineGap * 2
            });

        updatePdfGenerationProgress(sessionId, 25, 'Adding conversation messages');

        doc.font(styles.header.font)
            .fontSize(styles.header.fontSize)
            .text('Conversation', {
                lineGap: styles.header.lineGap
            });

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (message.role === 'system' || message.role === 'tool' || message.tool_calls?.length > 0) continue;
            doc.font(styles.normal.font)
                .fontSize(styles.normal.fontSize)
                .font('Helvetica-Bold')
                .text(`${message.role === 'user' ? 'User' : 'Assistant'}: `, { continued: true })
                .font(styles.normal.font)
                .text(message.content || 'Empty message')
                .moveDown(0.5);
            if (message.role === 'assistant') {
                doc.moveDown(0.5);
            }
        }

        if (screenshots.length > 0) {
            doc.addPage();
            doc.font(styles.header.font)
                .fontSize(styles.header.fontSize)
                .text('Screenshots', { align: 'center' })
                .moveDown(1);
            let screenshotCounter = 1;
            const totalScreenshots = batchProcessor.getTotalCount();

            updatePdfGenerationProgress(sessionId, 30, 'Processing screenshots');

            const screenshotProgressIncrement = totalScreenshots > 0 ? 65 / totalScreenshots : 0;
            const baseProgress = 30;

            do {
                const currentBatch = batchProcessor.getCurrentBatch();
                for (const screenshot of currentBatch) {
                    try {
                        if (screenshot.url) {
                            const currentProgress = baseProgress + (screenshotCounter * screenshotProgressIncrement);
                            updatePdfGenerationProgress(
                                sessionId,
                                Math.min(95, Math.round(currentProgress)),
                                `Processing screenshot ${screenshotCounter}/${totalScreenshots}`
                            );
                            doc.font(styles.normal.font)
                                .fontSize(styles.normal.fontSize)
                                .text(`Screenshot ${screenshotCounter}`, { align: 'center' })
                                .moveDown(0.5);

                            const timestamp = new Date(screenshot.timestamp).toLocaleString();
                            doc.font(styles.normal.font)
                                .fontSize(styles.normal.fontSize)
                                .text(`Timestamp: ${timestamp}`, { align: 'center' })
                                .moveDown(0.5);

                            const imageBuffer = await fetchImageAsBuffer(screenshot.url);
                            const maxWidth = 500;
                            const maxHeight = 600;
                            doc.moveDown(2);
                            doc.image(imageBuffer, {
                                fit: [doc.page.width - (styles.pageMargin * 2), maxHeight],
                                align: 'center'
                            });
                            doc.moveDown(2);
                            if (screenshotCounter < totalScreenshots) {
                                doc.addPage();
                            }
                            screenshotCounter++;
                        }
                    } catch (error: unknown) {
                        console.error(`Error processing screenshot ${screenshotCounter}:`, error);
                        doc.font(styles.normal.font)
                            .fontSize(styles.normal.fontSize)
                            .text(`Error loading screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`, { align: 'center' })
                            .moveDown(1);
                        screenshotCounter++;
                        if (screenshotCounter < totalScreenshots) {
                            doc.addPage();
                        }
                    }
                }

                if (global.gc) {
                    global.gc();
                }
            } while (batchProcessor.nextBatch());
        }

        // Add AI Validation Results page
        try {
            const validationData = await getValidation(sessionId);
            if (validationData?.result) {
                const mergedSteps = validationData.result?.flatMap((result: any) => result.steps) || [];
                const finalStatus = validationData.result?.[validationData.result.length - 1]?.finalResult;
                const result = {
                    steps: mergedSteps,
                    finalResult: finalStatus
                }
                const finalResult = result.finalResult === 'Pass' ? 'PASSED' : 'FAILED';
                doc.addPage();

                // Green header background with checkmark - reduced height
                const headerHeight = 45;
                doc.save()
                    .fillColor(result.finalResult === 'Pass' ? '#48bb78' : '#e53e3e')
                    .roundedRect(50, 50, doc.page.width - 100, headerHeight, 10)
                    .fill();

                // Header text - reduced font size
                doc.fontSize(20)
                    .fillColor('white')
                    .font('Helvetica-Bold')
                    .text(`Validation Result - ${finalResult}`, 50, 50 + (headerHeight - 20) / 2, {
                        align: 'center',
                        width: doc.page.width - 100
                    });

                // Reset fill color and font
                doc.fillColor('black')
                    .font('Helvetica');

                // Start steps after header - reduced spacing
                const startY = 50 + headerHeight + 20;
                let currentY = startY;

                result.steps.forEach((step: { step: string; status: string; explanation: string }, index: number) => {
                    // Calculate text heights
                    const stepTextHeight = doc.heightOfString(step.step, {
                        width: doc.page.width - 200,
                        lineGap: 4
                    });
                    const explanationTextHeight = doc.heightOfString(step.explanation, {
                        width: doc.page.width - 160,
                        lineGap: 4
                    });

                    // Dynamic height calculation based on content - increased padding
                    const stepHeight = Math.max(100, stepTextHeight + explanationTextHeight + 80); // increased minimum height and padding

                    // Check if we need a new page
                    if (currentY + stepHeight > doc.page.height - 50) {
                        doc.addPage();
                        currentY = 50;
                    }

                    const stepNumber = index + 1;

                    // White background card with shadow effect
                    doc.save()
                        .fillColor('#f8fafc')
                        .roundedRect(50, currentY, doc.page.width - 100, stepHeight, 8)
                        .fill();

                    // Left border color based on status
                    doc.save()
                        .fillColor(step.status === 'passed' ? '#48bb78' : step.status === 'ignored' ? '#a0aec0' : '#e53e3e')
                        .rect(50, currentY, 4, stepHeight)
                        .fill();

                    // Step number circle - adjusted position
                    doc.save()
                        .fillColor('#6b46c1')
                        .circle(80, currentY + 25, 12)
                        .fill()
                        .fillColor('white')
                        .fontSize(12)
                        .text(stepNumber.toString(), 76, currentY + 19);

                    // Step text - increased spacing from top
                    doc.restore()
                        .fontSize(14)
                        .fillColor('#2d3748')
                        .text(step.step, 105, currentY + 20, {
                            width: doc.page.width - 200,
                            lineGap: 6
                        });

                    // Status text with appropriate color - adjusted position
                    const statusText = step.status === 'passed' ? 'PASSED' :
                        step.status === 'ignored' ? 'IGNORED' : 'FAILED';
                    const statusColor = step.status === 'passed' ? '#48bb78' :
                        step.status === 'failed' ? '#e53e3e' :
                            step.status === 'ignored' ? '#a0aec0' : '#e53e3e';
                    doc.font('Helvetica-Bold')
                        .fillColor(statusColor)
                        .fontSize(12)
                        .text(statusText, doc.page.width - 120, currentY + 20, {
                            align: 'center',
                            width: 60
                        });

                    // Explanation text - increased spacing from step text
                    doc.font('Helvetica')
                        .fontSize(12)
                        .fillColor('#718096')
                        .text(step.explanation, 105, currentY + stepTextHeight + 40, {
                            width: doc.page.width - 160,
                            lineGap: 4
                        });

                    currentY += stepHeight + 15; // Increased spacing between steps
                });

            }
        } catch (error) {
            console.error('Error adding validation results to PDF:', error);
        }

        updatePdfGenerationProgress(sessionId, 95, 'Finalizing document');
        doc.end();

        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                updatePdfGenerationProgress(sessionId, 100, 'Complete');
                resolve({ tempFilePath, filename });
            });
            writeStream.on('error', (error) => {
                reject(error);
            });
        });
    } catch (error: unknown) {
        console.error('Error generating validation report:', error);
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        throw error;
    }
}

/**
 * Create a readable stream from the validation report PDF
 */
export async function getValidationReportStream(sessionId: string): Promise<{ stream: Readable, filename: string }> {
    try {
        const { tempFilePath, filename } = await generateValidationReport(sessionId);
        const stream = fs.createReadStream(tempFilePath);
        stream.on('close', () => {
            if (fs.existsSync(tempFilePath)) {
                fs.unlink(tempFilePath, (err) => {
                    if (err) {
                        console.error(`Error deleting temporary PDF file: ${err.message}`);
                    }
                });
            }
        });
        return { stream, filename };
    } catch (error) {
        console.error('Error creating validation report stream:', error);
        throw error;
    }
}

/**
 * Upload PDF to Firebase Storage and get a download URL
 */
async function storePdfInStorage(sessionId: string, pdfFilePath: string): Promise<string> {
    try {
        const filename = path.basename(pdfFilePath);
        const storagePath = `validations/${sessionId}/reports/${filename}`;
        const file = storageBucket.file(storagePath);
        await storageBucket.upload(pdfFilePath, {
            destination: storagePath,
            contentType: 'application/pdf',
            resumable: false
        });
        const url = await getSignedUrl(file);
        return url[0];
    } catch (error) {
        console.error('Error uploading PDF to storage:', error);
        throw error;
    }
}

/**
 * Start PDF generation as a background task
 */
export async function startBackgroundValidationReport(sessionId: string, type: string = 'chat'): Promise<{
    status: string;
    message: string;
    estimatedTimeSeconds?: number;
}> {
    try {
        if (pdfGenerationStatus.has(sessionId)) {
            const status = pdfGenerationStatus.get(sessionId);
            if (status?.status === 'pending' || status?.status === 'processing') {
                return {
                    status: 'processing',
                    message: 'PDF generation is already in progress',
                    estimatedTimeSeconds: estimateRemainingTime(sessionId)
                };
            }
        }

        pdfGenerationStatus.set(sessionId, {
            status: 'pending',
            startTime: Date.now()
        });

        setTimeout(async () => {
            try {
                pdfGenerationStatus.set(sessionId, {
                    status: 'processing',
                    startTime: Date.now()
                });

                const sessionData = await getSessionMetadata(sessionId);
                if (!sessionData) {
                    pdfGenerationStatus.set(sessionId, {
                        status: 'failed',
                        startTime: Date.now(),
                        endTime: Date.now(),
                        error: 'Session not found'
                    });
                    return;
                }

                const totalScreenshots = sessionData.metadata?.screenshotCount || 0;
                pdfGenerationStatus.set(sessionId, {
                    status: 'processing',
                    startTime: Date.now(),
                    totalScreenshots,
                    progress: 0
                });

                const result = await generateValidationReport(sessionId, type);

                updatePdfGenerationProgress(sessionId, 95, 'Uploading PDF to storage');

                try {
                    const downloadUrl = await storePdfInStorage(sessionId, result.tempFilePath);
                    pdfGenerationStatus.set(sessionId, {
                        status: 'completed',
                        startTime: Date.now(),
                        endTime: Date.now(),
                        totalScreenshots,
                        progress: 100,
                        downloadUrl
                    });
                } catch (uploadError) {
                    console.error(`Error uploading PDF to storage: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
                    pdfGenerationStatus.set(sessionId, {
                        status: 'completed',
                        startTime: Date.now(),
                        endTime: Date.now(),
                        totalScreenshots,
                        progress: 100,
                        error: `PDF generated but storage upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
                    });
                }

                setTimeout(() => {
                    pdfGenerationStatus.delete(sessionId);
                }, 60 * 60 * 1000);
            } catch (error: unknown) {
                console.error(`Background PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                pdfGenerationStatus.set(sessionId, {
                    status: 'failed',
                    startTime: Date.now(),
                    endTime: Date.now(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }, 0);

        return {
            status: 'started',
            message: 'PDF generation started in the background',
            estimatedTimeSeconds: estimateProcessingTime(sessionId)
        };
    } catch (error: unknown) {
        console.error(`Error starting background PDF generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return {
            status: 'error',
            message: `Failed to start PDF generation: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

/**
 * Get the status of PDF generation
 */
export function getPdfGenerationStatus(sessionId: string): {
    status: string;
    progress?: number;
    estimatedTimeSeconds?: number;
    error?: string;
    downloadUrl?: string;
} {
    const status = pdfGenerationStatus.get(sessionId);
    if (!status) {
        return {
            status: 'not_started'
        };
    }
    return {
        status: status.status,
        progress: status.progress,
        estimatedTimeSeconds: estimateRemainingTime(sessionId),
        error: status.error,
        downloadUrl: status.downloadUrl
    };
}

/**
 * Estimate the total processing time based on screenshot count
 */
function estimateProcessingTime(sessionId: string): number {
    const status = pdfGenerationStatus.get(sessionId);
    if (!status || !status.totalScreenshots) {
        return 30;
    }
    return 5 + status.totalScreenshots;
}

/**
 * Estimate the remaining processing time
 */
function estimateRemainingTime(sessionId: string): number {
    const status = pdfGenerationStatus.get(sessionId);
    if (!status) {
        return 0;
    }
    if (status.status === 'completed' || status.status === 'failed') {
        return 0;
    }
    if (status.progress !== undefined && status.totalScreenshots !== undefined) {
        const percentComplete = status.progress / 100;
        const totalEstimatedTime = estimateProcessingTime(sessionId);
        const elapsedTime = (Date.now() - status.startTime) / 1000;
        if (percentComplete > 0) {
            const estimatedTotalTime = elapsedTime / percentComplete;
            return Math.max(0, estimatedTotalTime - elapsedTime);
        }
        return Math.max(0, totalEstimatedTime - elapsedTime);
    }
    const elapsedTime = (Date.now() - status.startTime) / 1000;
    const totalEstimatedTime = estimateProcessingTime(sessionId);
    return Math.max(0, totalEstimatedTime - elapsedTime);
}

export const analyzePdf = async (sessionId: string, pdfBuffer: Buffer, searchText: string, lastProcessedPage: number) => {
    // ...
}