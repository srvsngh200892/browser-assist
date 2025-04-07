const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    // Log all proxy requests
    app.use((req, res, next) => {
        if (req.url.startsWith('/api')) {
            console.log(`Proxy request: ${req.method} ${req.url}`);
        }
        next();
    });

    // API endpoints - configure for optimal polling performance
    app.use(
        '/api',
        createProxyMiddleware({
            target: 'http://localhost:3001',  // Using explicit hostname
            changeOrigin: true,
            pathRewrite: {
                '^/api': '', // remove the /api prefix when forwarding
            },
            // Configure for longer polling connections
            proxyTimeout: 300000, // 5 minutes
            timeout: 300000, // 5 minutes
            // Add headers to improve caching behavior for polling
            onProxyReq: (proxyReq, req) => {
                // Add cache control headers for polling requests
                if (req.url.includes('/messages/') || req.url.includes('/status')) {
                    proxyReq.setHeader('Cache-Control', 'no-cache');
                    proxyReq.setHeader('Pragma', 'no-cache');
                }

                // Log all browser stream requests
                if (req.url.includes('/browser-stream')) {
                    console.log(`Setting up SSE stream: ${req.url}`);
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