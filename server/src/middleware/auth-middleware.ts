import { Request, Response, NextFunction } from 'express';
import { getUserById } from '../services/firebase-users.js';
import { verifyToken } from '../utils/jwt-utils.js';

interface AuthRequest extends Request {
    user?: any; // You can type this based on your payload
}

// Authentication middleware
export async function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    try {
        // Get the authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                error: "Authorization required"
            });
        }

        // Extract the token
        const token = authHeader.split(" ")[1];

        try {
            // Use our verifyToken utility function
            const decoded = await verifyToken(token);

            // Get user from database
            const user = await getUserById(decoded.userId);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: "Invalid user"
                });
            }

            // Attach user to request object
            req.user = user;

            // Proceed to the next middleware/handler
            next();
        } catch (jwtError) {
            console.error("JWT verification error:", jwtError);

            // Get the error message
            const errorMessage = jwtError instanceof Error ? jwtError.message : "Invalid token";

            return res.status(401).json({
                success: false,
                error: errorMessage
            });
        }
    } catch (error) {
        console.error("Auth middleware error:", error);
        return res.status(500).json({
            success: false,
            error: "Server error"
        });
    }
} 