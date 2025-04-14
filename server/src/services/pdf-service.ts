import PDFDocument from 'pdfkit';
import { getStorage, ref, getDownloadURL, uploadBytes, listAll } from 'firebase/storage';
import { app } from './firebase-messages';
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { getSessionMetadata } from './firebase-sessions';
import { Readable } from 'stream';
import https from 'https';
import { USE_FIREBASE_EMULATOR } from './env';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';

// Initialize Firebase storage and Firestore
const storage = getStorage(app);
const db = getFirestore(app);

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

/**
 * Fetch all messages for a session
 */
async function fetchSessionMessages(sessionId: string) {
    try {
        const messagesCollection = collection(db, 'messages');
        const q = query(
            messagesCollection,
            where('sessionId', '==', sessionId),
            where('role', 'in', ['user', 'assistant']),
            orderBy('timestamp', 'asc')
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error('Error fetching session messages:', error);
        throw error;
    }
}

/**
 * Fetch all screenshots for a session from Firebase Storage
 */
async function fetchSessionScreenshots(sessionId: string) {
    try {
        // Get the storage reference for this session's screenshots directory
        const sessionScreenshotsRef = ref(storage, `validations/${sessionId}/screenshots`);

        // List all screenshots in the directory
        const { items } = await listAll(sessionScreenshotsRef);

        console.log(`Found ${items.length} screenshots for session ${sessionId} in storage`);

        // Create an array to hold screenshot data
        const screenshots = [];

        // Process each screenshot
        for (const itemRef of items) {
            try {
                // Get the download URL
                const url = await getDownloadURL(itemRef);

                // Extract timestamp from the path (assuming format like 'validations/{sessionId}/screenshots/{timestamp}.webp')
                const filename = itemRef.name;
                const timestamp = parseInt(filename.split('.')[0], 10) || Date.now();

                screenshots.push({
                    url,
                    timestamp,
                    path: itemRef.fullPath
                });
            } catch (itemError) {
                console.error(`Error processing screenshot ${itemRef.fullPath}:`, itemError);
            }
        }

        // Sort screenshots by timestamp (oldest first)
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

    /**
     * Get the total number of screenshots
     */
    getTotalCount(): number {
        return this.screenshots.length;
    }

    /**
     * Get the number of batches
     */
    getBatchCount(): number {
        return Math.ceil(this.screenshots.length / this.batchSize);
    }

    /**
     * Get the current batch of screenshots
     */
    getCurrentBatch(): any[] {
        const startIndex = this.currentBatchIndex * this.batchSize;
        const endIndex = Math.min(startIndex + this.batchSize, this.screenshots.length);
        return this.screenshots.slice(startIndex, endIndex);
    }

    /**
     * Move to the next batch
     */
    nextBatch(): boolean {
        if (this.hasMoreBatches()) {
            this.currentBatchIndex++;
            return true;
        }
        return false;
    }

    /**
     * Check if there are more batches
     */
    hasMoreBatches(): boolean {
        const startIndex = (this.currentBatchIndex + 1) * this.batchSize;
        return startIndex < this.screenshots.length;
    }

    /**
     * Reset the batch counter
     */
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

        // Log progress update
        console.log(`PDF generation progress for ${sessionId}: ${progress}% - ${statusMessage || ''}`);
    }
}

// // Convert WebP to PNG if needed
// const processImage = async (imageBuffer: Buffer): Promise<Buffer> => {
//     try {
//         // Detect if image is WebP
//         const metadata = await sharp(imageBuffer).metadata();
//         if (metadata.format === 'webp') {
//             // Convert WebP to PNG
//             return await sharp(imageBuffer)
//                 .png()
//                 .toBuffer();
//         }
//         return imageBuffer;
//     } catch (error) {
//         console.error('Error processing image:', error);
//         throw error;
//     }
// };

/**
 * Main function to generate validation report PDF
 */
export async function generateValidationReport(sessionId: string): Promise<{ tempFilePath: string, filename: string }> {
    // Create a temporary file path
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `validation-report-${sessionId}.pdf`);
    const filename = `validation-report-${sessionId}.pdf`;

    try {
        // Create PDF document
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        const writeStream = fs.createWriteStream(tempFilePath);

        // Pipe the PDF to the file
        doc.pipe(writeStream);

        // Fetch session data
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            throw new Error('Session not found');
        }

        // Update status with starting message
        updatePdfGenerationProgress(sessionId, 5, 'Fetching session data');

        // Fetch messages and screenshots
        const messages = await fetchSessionMessages(sessionId);
        updatePdfGenerationProgress(sessionId, 10, 'Fetching messages');

        const screenshots = await fetchSessionScreenshots(sessionId);
        updatePdfGenerationProgress(sessionId, 15, 'Fetching screenshots');

        // Create a batched processor for screenshots
        const batchProcessor = new BatchedScreenshotProcessor(sessionId, screenshots);

        // Update status with progress
        updatePdfGenerationProgress(sessionId, 20, 'Creating title page');

        // Add title page
        doc.font(styles.title.font)
            .fontSize(styles.title.fontSize)
            .text('Validation Report', {
                align: 'center',
                lineGap: styles.title.lineGap
            });

        // Add session information
        doc.font(styles.normal.font)
            .fontSize(styles.normal.fontSize)
            .text(`Session ID: ${sessionId}`, {
                align: 'center',
                lineGap: styles.normal.lineGap
            })
            .text(`Start Time: ${new Date(sessionData.createdAt || Date.now()).toLocaleString()}`, {
                align: 'center',
                lineGap: styles.normal.lineGap
            })
            .text(`Total Screenshots: ${screenshots.length}`, {
                align: 'center',
                lineGap: styles.normal.lineGap * 2
            });

        // Update progress
        updatePdfGenerationProgress(sessionId, 25, 'Adding conversation messages');

        // Add conversation messages
        doc.font(styles.header.font)
            .fontSize(styles.header.fontSize)
            .text('Conversation', {
                lineGap: styles.header.lineGap
            });

        // Filter messages for user and the last assistant message
        const userMessages = messages.filter(msg => msg.role === 'user');
        const assistantMessages = messages.filter(msg => msg.role === 'assistant');
        const lastAssistantMessage = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : null;

        // Add user messages
        for (const message of userMessages) {
            doc.font(styles.normal.font)
                .fontSize(styles.normal.fontSize)
                .text('User:', { continued: false })
                .moveDown(0.2)
                .text(message.content || 'Empty message', {
                    indent: 20  // Add left indentation for the message content
                })
                .moveDown(0.5);
        }

        // Add last assistant message if it exists
        if (lastAssistantMessage) {
            doc.font(styles.normal.font)
                .fontSize(styles.normal.fontSize)
                .text('Assistant:', { continued: false })
                .moveDown(0.2)
                .text(lastAssistantMessage.content || 'Empty message', {
                    indent: 20  // Add left indentation for the message content
                })
                .moveDown(1);
        }

        // Add screenshot pages in batches to manage memory
        if (screenshots.length > 0) {
            // Create a new page for screenshots
            doc.addPage();

            doc.font(styles.header.font)
                .fontSize(styles.header.fontSize)
                .text('Screenshots', { align: 'center' })
                .moveDown(1);

            let screenshotCounter = 1;
            const totalScreenshots = batchProcessor.getTotalCount();
            console.log(`Processing ${totalScreenshots} screenshots for session ${sessionId}`);

            // Update progress
            updatePdfGenerationProgress(sessionId, 30, 'Processing screenshots');

            // Calculate progress percentage per screenshot
            const screenshotProgressIncrement = totalScreenshots > 0 ? 65 / totalScreenshots : 0;
            const baseProgress = 30; // Start at 30% after title and messages

            // Process screenshots in batches
            do {
                const currentBatch = batchProcessor.getCurrentBatch();
                console.log(`Processing batch ${batchProcessor.getBatchCount() > 0 ? batchProcessor.getCurrentBatch().length : 0} screenshots`);

                for (const screenshot of currentBatch) {
                    try {
                        if (screenshot.url) {
                            // Log counter and total for progress tracking
                            console.log(`Processing screenshot ${screenshotCounter}/${totalScreenshots}`);

                            // Update progress
                            const currentProgress = baseProgress + (screenshotCounter * screenshotProgressIncrement);
                            updatePdfGenerationProgress(
                                sessionId,
                                Math.min(95, Math.round(currentProgress)),
                                `Processing screenshot ${screenshotCounter}/${totalScreenshots}`
                            );

                            // Add screenshot number
                            doc.font(styles.normal.font)
                                .fontSize(styles.normal.fontSize)
                                .text(`Screenshot ${screenshotCounter}`, { align: 'center' })
                                .moveDown(0.5);

                            // Add timestamp
                            const timestamp = new Date(screenshot.timestamp).toLocaleString();
                            doc.font(styles.normal.font)
                                .fontSize(styles.normal.fontSize)
                                .text(`Timestamp: ${timestamp}`, { align: 'center' })
                                .moveDown(0.5);

                            // Download the image from Firebase
                            console.log(`Downloading image from Firebase: ${screenshot.url}`);
                            const imageBuffer = await fetchImageAsBuffer(screenshot.url);
                            // Calculate image dimensions to fit on page
                            const maxWidth = 500;
                            const maxHeight = 600;
                            // Add some spacing before the image
                            doc.moveDown(2);

                            doc.image(imageBuffer, {
                                fit: [doc.page.width - (styles.pageMargin * 2), maxHeight],
                                align: 'center'
                            });

                            // Add some spacing after the image
                            doc.moveDown(2);

                            // Add a new page for the next screenshot (if not the last one)
                            if (screenshotCounter < totalScreenshots) {
                                doc.addPage();
                            }

                            screenshotCounter++;
                        }
                    } catch (error: unknown) {
                        console.error(`Error processing screenshot ${screenshotCounter}:`, error);

                        // Add error message instead of the image
                        doc.font(styles.normal.font)
                            .fontSize(styles.normal.fontSize)
                            .text(`Error loading screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`, { align: 'center' })
                            .moveDown(1);

                        screenshotCounter++;

                        // Add a new page if not the last screenshot
                        if (screenshotCounter < totalScreenshots) {
                            doc.addPage();
                        }
                    }
                }

                // Force garbage collection between batches if available
                if (global.gc) {
                    global.gc();
                }

            } while (batchProcessor.nextBatch());
        }

        // Update progress to 95%
        updatePdfGenerationProgress(sessionId, 95, 'Finalizing document');

        // Finalize the document
        doc.end();

        // Return when the write is completed
        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                // Update progress to 100% when complete
                updatePdfGenerationProgress(sessionId, 100, 'Complete');
                resolve({ tempFilePath, filename });
            });

            writeStream.on('error', (error) => {
                reject(error);
            });
        });

    } catch (error: unknown) {
        console.error('Error generating validation report:', error);
        // Clean up the file if there was an error
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

        // Create a readable stream from the file
        const stream = fs.createReadStream(tempFilePath);

        // Set up cleanup when the stream is closed
        stream.on('close', () => {
            // Delete the temporary file when done
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
        console.log(`Uploading PDF to Firebase Storage at path: ${storagePath}`);

        // Create a reference to the storage location
        const fileRef = ref(storage, storagePath);

        // Read the file into a buffer
        const fileBuffer = fs.readFileSync(pdfFilePath);

        // Upload the file
        await uploadBytes(fileRef, fileBuffer, {
            contentType: 'application/pdf'
        });

        // Get the download URL
        const downloadUrl = await getDownloadURL(fileRef);
        console.log(`PDF uploaded successfully. Download URL: ${downloadUrl}`);

        return downloadUrl;
    } catch (error) {
        console.error('Error uploading PDF to storage:', error);
        throw error;
    }
}

/**
 * Start PDF generation as a background task
 */
export async function startBackgroundValidationReport(sessionId: string): Promise<{
    status: string;
    message: string;
    estimatedTimeSeconds?: number;
}> {
    try {
        // Check if generation is already in progress
        if (pdfGenerationStatus.has(sessionId)) {
            const status = pdfGenerationStatus.get(sessionId);
            if (status?.status === 'pending' || status?.status === 'processing') {
                return {
                    status: 'already_processing',
                    message: 'PDF generation is already in progress',
                    estimatedTimeSeconds: estimateRemainingTime(sessionId)
                };
            }
        }

        // Set initial status
        pdfGenerationStatus.set(sessionId, {
            status: 'pending',
            startTime: Date.now()
        });

        // Start processing in the background
        setTimeout(async () => {
            try {
                // Update status to processing
                pdfGenerationStatus.set(sessionId, {
                    status: 'processing',
                    startTime: Date.now()
                });

                // Fetch session data to get screenshot count
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

                // Get screenshot count from metadata
                const totalScreenshots = sessionData.metadata?.screenshotCount || 0;

                // Update status with total screenshots
                pdfGenerationStatus.set(sessionId, {
                    status: 'processing',
                    startTime: Date.now(),
                    totalScreenshots,
                    progress: 0
                });

                // Generate the validation report
                const result = await generateValidationReport(sessionId);

                // Update progress before uploading to storage
                updatePdfGenerationProgress(sessionId, 95, 'Uploading PDF to storage');

                // Upload the PDF to Firebase Storage
                try {
                    const downloadUrl = await storePdfInStorage(sessionId, result.tempFilePath);

                    // Update status to completed with download URL
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

                    // Still mark as complete but without download URL
                    pdfGenerationStatus.set(sessionId, {
                        status: 'completed',
                        startTime: Date.now(),
                        endTime: Date.now(),
                        totalScreenshots,
                        progress: 100,
                        error: `PDF generated but storage upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
                    });
                }

                // Schedule cleanup of status after 1 hour
                setTimeout(() => {
                    pdfGenerationStatus.delete(sessionId);
                }, 60 * 60 * 1000);

            } catch (error: unknown) {
                console.error(`Background PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

                // Update status to failed
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
        return 30; // Default estimate of 30 seconds if we don't know
    }

    // Rough estimate: 1 second per screenshot + 5 second base time
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

    // If completed or failed, no time remaining
    if (status.status === 'completed' || status.status === 'failed') {
        return 0;
    }

    // If we have progress data, use it
    if (status.progress !== undefined && status.totalScreenshots !== undefined) {
        const percentComplete = status.progress / 100;
        const totalEstimatedTime = estimateProcessingTime(sessionId);
        const elapsedTime = (Date.now() - status.startTime) / 1000;

        // If we have valid progress data
        if (percentComplete > 0) {
            const estimatedTotalTime = elapsedTime / percentComplete;
            return Math.max(0, estimatedTotalTime - elapsedTime);
        }

        // Fall back to standard estimate
        return Math.max(0, totalEstimatedTime - elapsedTime);
    }

    // Simple estimate based on start time and default processing time
    const elapsedTime = (Date.now() - status.startTime) / 1000;
    const totalEstimatedTime = estimateProcessingTime(sessionId);

    return Math.max(0, totalEstimatedTime - elapsedTime);
} 