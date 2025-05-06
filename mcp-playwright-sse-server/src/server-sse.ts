import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "@playwright/mcp";
import path from 'path';
import fs from 'fs';


const app = express();
const transports: { [sessionId: string]: SSEServerTransport } = {};

const serverConfig = {
    launchOptions: { headless: true },
};

app.get("/sse", async (req: Request, res: Response) => {
    const sessionId = req.query.userSessionId as string;
    const transportSessionId = req.query.transportSessionId as string;
    if (transportSessionId) {
        res.status(200).send(`reusing transport for available transport for ${transportSessionId} for user session ${sessionId}`);
        return
    }
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    console.log("Transport created for sessionId:", transport.sessionId);
    // Example: Create a unique userDataDir path using session ID
    const userDataDir = path.resolve(process.env.USER_DATA_DIR || '', sessionId);
    // Ensure the directory exists (optional, Playwright can create it)
    fs.mkdirSync(userDataDir, { recursive: true });
    const server = createServer({userDataDir, ...serverConfig});
    await server.connect(transport);

    res.on("close", async () => {
        console.log("Transport closed for sessionId:", transport.sessionId);
        delete transports[transport.sessionId];
        await server.close(); // Clean up the server when connection closes
    });
});

app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    console.log("Received message for sessionId:", sessionId);
    const transport = transports[sessionId];
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(400).send("No transport found for sessionId");
    }
});

app.get('/health', async (_req, res) => {
    try {
        // Add any critical checks here
        // For example, verify browser connections, check memory usage, etc.
        const isHealthy = true; // Add your health check logic here

        if (isHealthy) {
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error: any) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId in URL path" });
    }
    const transport = transports[sessionId];
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(400).send("No transport found for sessionId");
    }
});

app.delete("/delete-session-folder/:sessionId", async (req: Request, res: Response) => {
    const sessionId = req.params.sessionId;

    if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId in URL path" });
        return;
    }

    const baseDir = process.env.USER_DATA_DIR || '';

    const userDataDir = path.resolve(baseDir, sessionId);

    try {
        const exists = fs.existsSync(userDataDir);

        if (exists) {
            fs.rmSync(userDataDir, { recursive: true, force: true });
            res.status(200).json({
                message: "Session folder deleted",
                path: userDataDir
            });
            return;
        } else {
            res.status(404).json({
                error: "Folder does not exist",
                path: userDataDir
            });
        }
    } catch (err: any) {
        console.log("error", err)
        res.status(500).json({
            error: "Failed to delete folder",
            details: err.message
        });
        return
    }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});