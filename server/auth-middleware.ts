import { getUserById } from "./firebase-users.ts";
import { verifyToken } from "./jwt-utils.ts";

// Authentication middleware
export async function authMiddleware(ctx, next) {
    try {
        // Get the authorization header
        const authHeader = ctx.request.headers.get("Authorization");

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            ctx.response.status = 401;
            ctx.response.body = { success: false, error: "Authorization required" };
            return;
        }

        // Extract the token
        const token = authHeader.split(" ")[1];

        try {
            // Use our verifyToken utility function
            const decoded = await verifyToken(token);

            // Get user from database
            const user = await getUserById(decoded.userId);

            if (!user) {
                ctx.response.status = 401;
                ctx.response.body = { success: false, error: "Invalid user" };
                return;
            }

            // Attach user to context
            ctx.state.user = user;

            // Proceed to the next middleware/handler
            await next();
        } catch (jwtError) {
            console.error("JWT verification error:", jwtError);

            // Get the error message
            const errorMessage = jwtError.message || "Invalid token";

            ctx.response.status = 401;
            ctx.response.body = { success: false, error: errorMessage };
        }
    } catch (error) {
        console.error("Auth middleware error:", error);
        ctx.response.status = 500;
        ctx.response.body = { success: false, error: "Server error" };
    }
} 