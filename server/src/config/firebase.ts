import admin from 'firebase-admin';
import {
    USE_FIREBASE_EMULATOR,
    FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET,
    FIREBASE_EMULATOR_HOST,
    FIREBASE_STORAGE_EMULATOR_PORT
} from '../services/env';

function initializeFirebase() {
    if (admin.apps.length) {
        return;
    }

    console.log('Initializing Firebase Admin SDK...');

    const options: admin.AppOptions = {
        projectId: FIREBASE_PROJECT_ID,
        storageBucket: FIREBASE_STORAGE_BUCKET,
    };

    admin.initializeApp(options);

    if (USE_FIREBASE_EMULATOR) {
        console.log('--- Firebase Emulator Mode Enabled ---');

        const storageHost = `${FIREBASE_EMULATOR_HOST}:${FIREBASE_STORAGE_EMULATOR_PORT}`;
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = storageHost;
        console.log(`- Storage Emulator targeting: ${storageHost}`);

        // Note: You would add other emulator hosts here if you use them
        // e.g., process.env.FIRESTORE_EMULATOR_HOST = ...
        // e.g., process.env.FIREBASE_AUTH_EMULATOR_HOST = ...

        console.log('------------------------------------');
    } else {
        console.log('Connecting to LIVE Firebase services.');
    }
}

// Initialize immediately
initializeFirebase();

// Export the initialized admin object for use in other parts of the app
export default admin; 