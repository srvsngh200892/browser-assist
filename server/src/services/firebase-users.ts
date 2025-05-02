import { getFirestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FIREBASE_PROJECT_ID } from "../config/env";
// Initialize Firebase Admin if not already initialized
if (!getFirestore.length) {
    initializeApp({
        credential: applicationDefault(),
        projectId: FIREBASE_PROJECT_ID // or use cert({...}) if needed
    });
}


const db = getFirestore();

const USERS_COLLECTION = "users";

export interface User {
    userId: string;
    username: string;
    email: string;
    password: string; // Hashed password
    createdAt: FirebaseFirestore.Timestamp;
    lastLogin: FirebaseFirestore.Timestamp;
    role: 'user' | 'admin';
}

export async function createUser({ username, email, password }: { username: string, email: string, password: string }) {
    try {
        const userId = uuidv4();
        const userRef = db.collection(USERS_COLLECTION).doc(userId);

        const userData: Omit<User, 'createdAt' | 'lastLogin'> & {
            createdAt: FirebaseFirestore.FieldValue;
            lastLogin: FirebaseFirestore.FieldValue;
        } = {
            userId,
            username,
            email,
            password,
            role: 'user',
            createdAt: Timestamp.now(),
            lastLogin: Timestamp.now()
        };

        await userRef.set(userData);
        return userId;
    } catch (error) {
        console.error("Error creating user:", error);
        return null;
    }
}

export async function getUserByEmail(email: string) {
    try {
        const usersRef = db.collection(USERS_COLLECTION);
        const snapshot = await usersRef.where("email", "==", email).limit(1).get();

        if (snapshot.empty) {
            return null;
        }

        return snapshot.docs[0].data() as User;
    } catch (error) {
        console.error("Error fetching user by email:", error);
        return null;
    }
}

export async function validateUser(email: string, password: string) {
    try {
        const user = await getUserByEmail(email);
        if (!user) return null;

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return null;

        await db.collection(USERS_COLLECTION)
            .doc(user.userId)
            .update({ lastLogin: Timestamp.now() });

        const { password: _, ...safeUser } = user;
        return safeUser;
    } catch (error) {
        console.error("Error validating user:", error);
        return null;
    }
}

export async function getUserById(userId: string) {
    try {
        const docSnap = await db.collection(USERS_COLLECTION).doc(userId).get();
        if (!docSnap.exists) return null;

        const userData = docSnap.data() as User;
        const { password, ...userWithoutPassword } = userData;
        return userWithoutPassword;
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        return null;
    }
}
