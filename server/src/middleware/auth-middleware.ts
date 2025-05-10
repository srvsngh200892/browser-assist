import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUserById } from '../services/firebase-users.js';
import { verifyToken } from '../utils/jwt-utils.js';

const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-key-change-in-production";

interface AuthRequest extends Request {
    user?: any;
}

function sendSSEAuthError(res: Response) {
    console.log(`closing stream because of auth error`);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.write(`event: auth_error\n`);
    res.write(`data: {"code":401,"message":"Unauthorized"}\n\n`);
    res.end();
}

export async function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    try {
        // ✅ Read token from cookie
        const token = req.cookies?.token;

        if (!token) {
            if (req.headers.accept === 'text/event-stream') {
                return sendSSEAuthError(res);
            }
            return res.status(401).json({
                success: false,
                error: "Authentication token missing",
                errorCode: 'missing_or_expired'
            });
        }

        try {
            const decoded = await verifyToken(token, JWT_SECRET);
            if (req.headers.accept !== 'text/event-stream')  {
                const user = await getUserById(decoded.userId);

                if (!user) {
                    return res.status(401).json({
                        success: false,
                        error: "Invalid user"
                    });
                }

                req.user = user;
            }

            next();
        } catch (jwtError) {
            console.error("JWT verification error:", jwtError);
            const errorMessage = jwtError instanceof Error ? jwtError.message : "Invalid token";
            const errorCode = jwtError instanceof jwt.TokenExpiredError ? 'token_expired' : 'invalid_token'
            if (req.headers.accept === 'text/event-stream') {
                return sendSSEAuthError(res);
            }
            return res.status(401).json({
                success: false,
                error: errorMessage,
                errorCode: errorCode
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
