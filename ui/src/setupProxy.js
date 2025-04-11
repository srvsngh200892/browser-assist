const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    // Log all proxy requests
    app.use((req, res, next) => {
        if (req.url.startsWith('/api')) {
            console.log(`Proxy request: ${req.method} ${req.url}`);
        }
        next();
    });

    // Special proxy for SSE browser stream
    app.use(
        '/api/browser-stream',
        createProxyMiddleware({
            target: 'http://localhost:3001',
            changeOrigin: true,
            // These settings are essential for SSE (Server-Sent Events)
            proxyTimeout: 600000, // 10 minutes timeout for SSE
            timeout: 600000, // 10 minutes
            // Don't buffer responses
            buffer: false,
            // Handle SSE headers properly
            onProxyReq: (proxyReq, req, res) => {
                console.log(`SSE Proxying ${req.method} ${req.url} to API server as ${proxyReq.path}`);
                // Set proper headers for SSE request
                proxyReq.setHeader('Accept', 'text/event-stream');
                proxyReq.setHeader('Cache-Control', 'no-cache');
                proxyReq.setHeader('Connection', 'keep-alive');
            },
            onProxyRes: (proxyRes, req, res) => {
                console.log(`SSE stream response: ${req.url} status: ${proxyRes.statusCode}`);
                // Ensure proper SSE headers are sent to client
                proxyRes.headers['Content-Type'] = 'text/event-stream';
                proxyRes.headers['Cache-Control'] = 'no-cache, no-transform';
                proxyRes.headers['Connection'] = 'keep-alive';
                // Disable buffering in proxy servers
                proxyRes.headers['X-Accel-Buffering'] = 'no';
            },
            onError: (err, req, res) => {
                console.error('SSE Proxy error:', err);
                if (!res.headersSent) {
                    res.writeHead(502, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                    });
                    // Send an error event that the EventSource can receive
                    res.write(`event: error\ndata: {"message":"Proxy error connecting to backend: ${err.message}"}\n\n`);
                    res.end();
                }
            }
        })
    );

    // General API proxy for non-SSE requests
    app.use(
        '/api',
        createProxyMiddleware({
            target: 'http://localhost:3001',
            changeOrigin: true,
            // Do not rewrite paths - preserve the /api prefix
            pathRewrite: undefined, // This ensures /api prefix is NOT removed

            // Log request for debugging
            onProxyReq: (proxyReq, req, res) => {
                console.log(`Proxying ${req.method} ${req.url} to API server as ${proxyReq.path}`);
            },
            // Configure for longer polling connections
            proxyTimeout: 300000, // 5 minutes
            timeout: 300000, // 5 minutes
            // Add headers to improve caching behavior for polling
            onProxyRes: (proxyRes, req) => {
                // Add cache control headers for polling requests
                if (req.url.includes('/messages/') || req.url.includes('/status')) {
                    proxyRes.headers['Cache-Control'] = 'no-cache';
                    proxyRes.headers['Pragma'] = 'no-cache';
                }
            },
            onError: (err, req, res) => {
                console.error('Proxy error:', err);
                if (!res.headersSent) {
                    res.writeHead(500, {
                        'Content-Type': 'application/json',
                    });
                    res.end(JSON.stringify({
                        message: 'Proxy error connecting to backend',
                        error: err.message,
                        url: req.url
                    }));
                }
            }
        })
    );

    // Webpack HMR WebSocket proxy - keep this for development
    app.use(
        '/ws',
        createProxyMiddleware({
            target: 'http://127.0.0.1:3002',
            ws: true,
            logLevel: 'silent', // Don't log webpack dev server websocket traffic
            onError: (err, req, res) => {
                console.error('Webpack HMR WebSocket proxy error:', err);
            }
        })
    );
}; 