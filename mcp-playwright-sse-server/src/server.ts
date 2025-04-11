import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "@playwright/mcp";

const server = createServer({
    launchOptions: { headless: true },
});

const app = express();
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (_: Request, res: Response) => {
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    console.log("Transport created for sessionId:", transport.sessionId);
    res.on("close", () => {
        console.log("Transport closed for sessionId:", transport.sessionId);
        delete transports[transport.sessionId];
    });
    await server.connect(transport);
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

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});