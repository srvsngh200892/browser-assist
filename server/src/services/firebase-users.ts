import { db } from "./firebase-messages";
import bcrypt from "bcryptjs";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    where,
    serverTimestamp
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";

// Collection reference
const USERS_COLLECTION = "users";

// User interface
export interface User {
    userId: string;
    username: string;
    email: string;
    password: string; // Hashed password only
    createdAt: any; // Firebase Timestamp
    lastLogin: any; // Firebase Timestamp
    role: 'user' | 'admin';
}

// Create a new user
export async function createUser({ username, email, password }: { username: string, email: string, password: string }) {
    try {
        const usersRef = collection(db, USERS_COLLECTION);
        const userId = uuidv4();

        const userData = {
            userId,
            username,
            email,
            password, // This should be pre-hashed
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            role: 'user' // Default role
        };

        await setDoc(doc(usersRef, userId), userData);
        return userId;
    } catch (error) {
        console.error("Error creating user:", error);
        return null;
    }
}

// Get user by email
export async function getUserByEmail(email: string) {
    try {
        const usersRef = collection(db, USERS_COLLECTION);
        const q = query(usersRef, where("email", "==", email));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return null;
        }

        const userData = snapshot.docs[0].data();
        return userData;
    } catch (error) {
        console.error("Error fetching user by email:", error);
        return null;
    }
}

// Validate user credentials
export async function validateUser(email: string, password: string) {
    try {
        const user = await getUserByEmail(email);

        if (!user) {
            return null;
        }

        let isMatch = false;
        try {
            // Try with bcrypt compare first
            isMatch = await bcrypt.compare(password, user.password)
        } catch (compareError) {
            console.error("Error with bcrypt.compare:", compareError);

            throw compareError;
        }

        if (!isMatch) {
            return null;
        }

        // Update last login
        const userRef = doc(db, USERS_COLLECTION, user.userId);
        await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });

        return {
            userId: user.userId,
            username: user.username,
            email: user.email,
            role: user.role
        };
    } catch (error) {
        console.error("Error validating user:", error);
        return null;
    }
}

// Get user by ID
export async function getUserById(userId: string) {
    try {
        const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));

        if (!userDoc.exists()) {
            return null;
        }

        const userData = userDoc.data();
        // Don't return the password hash
        const { password, ...userWithoutPassword } = userData;
        return userWithoutPassword;
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        return null;
    }
} 