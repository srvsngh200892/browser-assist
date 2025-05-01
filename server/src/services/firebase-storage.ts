import admin from 'firebase-admin';
import sharp from 'sharp';
import phash from 'sharp-phash';
import { USE_FIREBASE_EMULATOR, FIREBASE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_PORT } from "./env";

// Initialize Firebase Admin if not already initialized
console.log(`Initializing Firebase Admin with storage bucket ${process.env.FIREBASE_STORAGE_BUCKET}`);
if (!admin.apps.length) {
    admin.initializeApp({
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // Ensure this is set
    });
}

if (USE_FIREBASE_EMULATOR) {
    const host = `http://${FIREBASE_EMULATOR_HOST}:${FIREBASE_STORAGE_EMULATOR_PORT}`;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${FIREBASE_EMULATOR_HOST}:${FIREBASE_STORAGE_EMULATOR_PORT}`;
    console.log(`Using Firebase Storage emulator at ${host}`);
}

const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);

const getScreenshotPath = (sessionId: string, timestamp: number) => {
    return `validations/${sessionId}/screenshots/${timestamp}.png`;
};

async function isScreenshotBlankOrWithLoading(imageBuffer: Buffer, tolerancePercent = 0.5) {
    const { data, info } = await sharp(imageBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const [r0, g0, b0, a0] = data.slice(0, 4);
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

async function compressScreenshot(base64Image: string): Promise<{ compressedImage: string, imageBuffer: Buffer }> {
    if (!base64Image || typeof base64Image !== 'string') {
        throw new Error('Invalid base64 image provided');
    }

    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

    if (!base64Data || base64Data.trim() === '') {
        throw new Error('Empty image data after removing data URL prefix');
    }

    let imageBuffer: Buffer;

    try {
        imageBuffer = Buffer.from(base64Data, 'base64');

        if (!imageBuffer || imageBuffer.length === 0) {
            throw new Error('Failed to create buffer from base64 data');
        }
    } catch (error) {
        throw new Error(`Failed to create buffer from image data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
        const compressedBuffer = await sharp(imageBuffer)
            .resize(1024, 768, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .png({
                quality: 80,
                effort: 6
            })
            .toBuffer();

        return {
            compressedImage: compressedBuffer.toString('base64'),
            imageBuffer: compressedBuffer
        };
    } catch (error) {
        throw new Error(`Image compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function calculatePerceptualSimilarity(imageBuffer: Buffer, lastHash?: string): Promise<{ similarity: number, hash: string }> {
    try {
        const currentHash = await phash(imageBuffer);

        if (!lastHash || !lastHash.trim()) {
            return { similarity: 0, hash: currentHash };
        }

        const distance = hammingDistance(lastHash, currentHash);
        const similarity = 100 - ((distance / 64) * 100);

        return { similarity, hash: currentHash };
    } catch (error) {
        console.error('Error calculating perceptual similarity:', error);
        return { similarity: 0, hash: '' };
    }
}

export async function storeScreenshot(
    sessionId: string,
    base64Image: string,
    lastPerceptualHash?: string,
    similarityThreshold: number = 80,
    blankImageThreshold: number = 0.50
): Promise<{
    url: string;
    hash: string;
    timestamp: number;
    path: string;
    similarity?: number;
} | null> {
    try {
        if (!base64Image || typeof base64Image !== 'string') {
            console.error('Invalid image data provided');
            return null;
        }

        const compressResult = await compressScreenshot(base64Image);

        const isBlank = await isScreenshotBlankOrWithLoading(compressResult.imageBuffer, blankImageThreshold);
        if (isBlank) return null;

        const { similarity, hash } = await calculatePerceptualSimilarity(compressResult.imageBuffer, lastPerceptualHash);
        if (similarity >= similarityThreshold) return null;

        const timestamp = Date.now();
        const path = getScreenshotPath(sessionId, timestamp);
        const file = bucket.file(path);
        const buffer = Buffer.from(compressResult.compressedImage, 'base64');

        await file.save(buffer, {
            contentType: 'image/png',
            public: true,
            metadata: { cacheControl: 'public,max-age=31536000' }
        });

        const url = `https://storage.googleapis.com/${bucket.name}/${path}`;

        await updateScreenshotCount(sessionId);

        return {
            url,
            hash,
            timestamp,
            path,
            similarity
        };
    } catch (error) {
        console.error('Error storing screenshot:', error);
        return null;
    }
}

function hammingDistance(hash1: string, hash2: string): number {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) {
            distance++;
        }
    }
    return distance;
}

async function updateScreenshotCount(sessionId: string): Promise<void> {
    try {
        const { updateSessionMetadata, getSessionMetadata } = await import('./firebase-sessions');
        const sessionData = await getSessionMetadata(sessionId);
        if (!sessionData) {
            console.error(`Cannot update screenshot count for non-existent session: ${sessionId}`);
            return;
        }

        const currentCount = sessionData.metadata?.screenshotCount || 0;
        const newCount = currentCount + 1;

        await updateSessionMetadata(sessionId, {
            metadata: {
                ...(sessionData.metadata || {}),
                screenshotCount: newCount
            }
        });

    } catch (error) {
        console.error(`Error updating screenshot count for session ${sessionId}:`, error);
    }
}
