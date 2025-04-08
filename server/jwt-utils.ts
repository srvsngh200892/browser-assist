import {
    create,
    verify,
    getNumericDate,
    type VerifyOptions
} from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// JWT Secret
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "your-jwt-secret-key-change-in-production";

// User payload interface
export interface UserPayload {
    userId: string;
    email: string;
    username: string;
}

// Helper to prepare the secret key
export async function getSecretKey() {
    try {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(JWT_SECRET);

        // Import key using the secret data
        return await crypto.subtle.importKey(
            "raw",
            keyData,
            { name: "HMAC", hash: { name: "SHA-256" } },
            false,
            ["sign", "verify"]
        );
    } catch (error) {
        console.error("Error creating secret key:", error);
        throw new Error("Failed to create JWT secret key");
    }
}

// Create JWT token with user information
export async function createToken(user: UserPayload, expiresInHours = 24) {
    try {
        // Get expiration time
        const exp = getNumericDate(60 * 60 * expiresInHours);

        // Get cryptographic key
        const secretKey = await getSecretKey();

        // Create token
        return await create(
            { alg: "HS256", typ: "JWT" },
            {
                ...user,
                exp
            },
            secretKey
        );
    } catch (error) {
        console.error("Error creating JWT token:", error);
        throw new Error("Failed to generate authentication token");
    }
}

// Verify JWT token
export async function verifyToken(token: string) {
    try {
        // Get cryptographic key
        const secretKey = await getSecretKey();

        // Verify options
        const verifyOptions: VerifyOptions = {
            algorithm: "HS256"
        };

        // Verify token and return payload
        const payload = await verify(token, secretKey, verifyOptions);

        // Check if token has expired
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            throw new Error("Token expired");
        }

        return payload;
    } catch (error) {
        console.error("Error verifying JWT token:", error);

        // Rethrow with more specific message if possible
        if (error.message && error.message.includes("expired")) {
            throw new Error("Token expired");
        }

        throw new Error("Invalid token");
    }
} 