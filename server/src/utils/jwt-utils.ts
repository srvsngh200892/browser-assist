import jwt from 'jsonwebtoken';

// JWT Secret - should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-key-change-in-production";

// User payload interface
export interface UserPayload {
    userId: string;
    email: string;
    username: string;
}

// Create JWT token with user information
export async function createToken(user: UserPayload, expiresInHours = 24): Promise<string> {
    try {
        // Create token with expiration time
        return jwt.sign(
            { ...user },
            JWT_SECRET,
            {
                expiresIn: `${expiresInHours}h`,
                algorithm: 'HS256'
            }
        );
    } catch (error) {
        console.error("Error creating JWT token:", error);
        throw new Error("Failed to generate authentication token");
    }
}

// Verify JWT token
export async function verifyToken(token: string): Promise<UserPayload> {
    try {
        // Verify token and return payload
        const payload = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256']
        }) as UserPayload & { exp?: number };

        // Check if token has expired (jwt.verify should already do this, but we double-check)
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            throw new Error("Token expired");
        }

        return {
            userId: payload.userId,
            email: payload.email,
            username: payload.username
        };
    } catch (error) {
        console.error("Error verifying JWT token:", error);

        // Provide more specific error message if possible
        if (error instanceof Error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error("Token expired");
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error("Invalid token");
            }
        }

        throw new Error("Invalid token");
    }
} 