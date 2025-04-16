import { getStorage, ref, uploadString, getDownloadURL, connectStorageEmulator } from "firebase/storage";
import { app } from "./firebase-messages"; // Reuse existing Firebase app
import sharp from 'sharp';
import { USE_FIREBASE_EMULATOR, FIREBASE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_PORT } from "./env";
import phash from 'sharp-phash';

const storage = getStorage(app);

// Connect to Firebase Storage emulator if enabled
if (USE_FIREBASE_EMULATOR) {
    console.log(`Connecting to Firebase Storage emulator at ${FIREBASE_EMULATOR_HOST}:${FIREBASE_STORAGE_EMULATOR_PORT}`);
    connectStorageEmulator(storage, FIREBASE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_PORT);
}

const SCREENSHOTS_FOLDER = "screenshots";

// Helper to generate a unique screenshot filename
const getScreenshotPath = (sessionId: string, timestamp: number) => {
    // Format: sessions/{sessionId}/screenshots/{timestamp}.webp
    return `validations/${sessionId}/screenshots/${timestamp}.png`;
};


async function isScreenshotBlankOrWithLoading(imageBuffer: Buffer, tolerancePercent = 0.5) {
    const { data, info } = await sharp(imageBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const [r0, g0, b0, a0] = data.slice(0, 4); // First pixel
    let diffCount = 0;
    const totalPixels = info.width * info.height;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (r !== r0 || g !== g0 || b !== b0 || a !== a0) {
            diffCount++;
        }
    }

    const diffPercent = (diffCount / totalPixels) * 100;

    return diffPercent <= tolerancePercent;
}

// Helper to compress image before storage
async function compressScreenshot(base64Image: string): Promise<{ compressedImage: string, imageBuffer: Buffer }> {
    try {
        // Check if input is valid
        if (!base64Image || typeof base64Image !== 'string') {
            throw new Error('Invalid base64 image provided');
        }

        // Remove data URL prefix if present
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

        // Validate that we have actual base64 data
        if (!base64Data || base64Data.trim() === '') {
            throw new Error('Empty image data after removing data URL prefix');
        }

        console.log(`Converting base64 to buffer, length: ${base64Data.length}`);
        let imageBuffer: Buffer;

        try {
            imageBuffer = Buffer.from(base64Data, 'base64');

            // Check if buffer is valid
            if (!imageBuffer || imageBuffer.length === 0) {
                throw new Error('Failed to create buffer from base64 data');
            }

            console.log(`Successfully created image buffer, size: ${imageBuffer.length} bytes`);
        } catch (error) {
            console.error('Buffer creation error:', error);
            throw new Error(`Failed to create buffer from image data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Compress and convert to png
        try {
            console.log('Starting image compression and conversion to png');
            const compressedBuffer = await sharp(imageBuffer)
                .resize(1024, 768, { // Reduce dimensions
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .png({ // Convert to png with compression
                    quality: 80,
                    effort: 6
                })
                .toBuffer();

            console.log(`Compression complete, new size: ${compressedBuffer.length} bytes`);
            return {
                compressedImage: compressedBuffer.toString('base64'),
                imageBuffer: compressedBuffer
            };
        } catch (error) {
            console.error('Sharp processing error:', error);
            throw new Error(`Image compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    } catch (error) {
        console.error('compressScreenshot error:', error);
        throw error; // Propagate the error to be handled by the caller
    }
}

// Calculate image similarity based on perceptual hash
async function calculatePerceptualSimilarity(imageBuffer: Buffer, lastHash?: string): Promise<{ similarity: number, hash: string }> {
    try {
        // Generate perceptual hash for current image
        const currentHash = await phash(imageBuffer);

        // If we don't have a previous hash, return zero similarity
        if (!lastHash || !lastHash.trim()) {
            console.log('No previous hash provided for comparison');
            return { similarity: 0, hash: currentHash };
        }

        // Calculate Hamming distance between hashes
        const distance = hammingDistance(lastHash, currentHash);

        // Log the actual hash and distance for debugging
        console.log(`Hash comparison: 
            Previous: ${lastHash.substring(0, 20)}... 
            Current:  ${currentHash.substring(0, 20)}...
            Hamming distance: ${distance}/64`);

        // Convert distance to similarity percentage (64 is max distance for pHash)
        // Lower distance means higher similarity
        const similarity = 100 - ((distance / 64) * 100);

        return { similarity, hash: currentHash };
    } catch (error) {
        console.error('Error calculating perceptual similarity:', error);
        // Return a default hash and zero similarity on error
        return { similarity: 0, hash: '' };
    }
}

// Store screenshot with deduplication
export async function storeScreenshot(
    sessionId: string,
    base64Image: string,
    lastPerceptualHash?: string,
    similarityThreshold: number = 80, // Increased default threshold for stricter matching
    blankImageThreshold: number = 0.50 // Default threshold for blank image detection
): Promise<{
    url: string;
    hash: string;
    timestamp: number;
    path: string; // Added path to response
    similarity?: number;
} | null> {
    try {
        // Validate input
        if (!base64Image || typeof base64Image !== 'string') {
            console.error('Invalid image data provided');
            return null;
        }

        // Compress image first
        let compressResult;
        try {
            compressResult = await compressScreenshot(base64Image);
        } catch (compressionError) {
            console.error('Error compressing screenshot:', compressionError);
            return null;
        }

        // Check if image is blank or has loading
        const isBlank = await isScreenshotBlankOrWithLoading(compressResult.imageBuffer, blankImageThreshold);
        if (isBlank) {
            console.log(`Detected blank image for session ${sessionId}, skipping`);
            return null;
        }

        // Calculate perceptual similarity
        const { similarity, hash } = await calculatePerceptualSimilarity(
            compressResult.imageBuffer,
            lastPerceptualHash
        );

        console.log(`Perceptual similarity: ${similarity.toFixed(2)}% for session ${sessionId}`);

        // Skip if image hasn't changed significantly based on threshold
        if (similarity >= similarityThreshold) {
            console.log(`Image similarity (${similarity.toFixed(2)}%) above threshold (${similarityThreshold}%), skipping`);
            return null;
        } else {
            console.log(`Image differs significantly (${similarity.toFixed(2)}% similarity < ${similarityThreshold}% threshold), storing new screenshot`);
        }

        // Attempt to upload the image
        const timestamp = Date.now();
        const path = getScreenshotPath(sessionId, timestamp);
        const storageRef = ref(storage, path);

        try {
            // Upload the compressed image
            await uploadString(storageRef, compressResult.compressedImage, 'base64');
            const url = await getDownloadURL(storageRef);

            // Update screenshot count in session metadata
            await updateScreenshotCount(sessionId);

            return {
                url,
                hash,
                timestamp,
                path,
                similarity
            };
        } catch (uploadError) {
            console.error('Failed to upload screenshot:', uploadError);
            return null;
        }
    } catch (error) {
        console.error('Error storing screenshot:', error);
        return null;
    }
}

// Helper function to calculate Hamming distance between two hashes
function hammingDistance(hash1: string, hash2: string): number {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) {
        return 64; // Maximum distance for 64-bit hash
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) {
            distance++;
        }
    }
    return distance;
}

// Helper function to update screenshot count in session metadata
async function updateScreenshotCount(sessionId: string): Promise<void> {
    try {
        // Import the required function from firebase-sessions
        const { updateSessionMetadata, getSessionMetadata } = await import('./firebase-sessions');

        // Get current session metadata
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            console.error(`Cannot update screenshot count for non-existent session: ${sessionId}`);
            return;
        }

        // Calculate new screenshot count
        const currentCount = sessionData.metadata?.screenshotCount || 0;
        const newCount = currentCount + 1;

        // Update session metadata with new screenshot count
        await updateSessionMetadata(sessionId, {
            metadata: {
                ...(sessionData.metadata || {}),
                screenshotCount: newCount
            }
        });

        console.log(`Updated screenshot count for session ${sessionId} to ${newCount}`);
    } catch (error) {
        console.error(`Error updating screenshot count for session ${sessionId}:`, error);
    }
} 