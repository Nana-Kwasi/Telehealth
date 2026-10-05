/**
 * Development only: forward /api to the local backend.
 *
 * When the web app is opened through the HTTPS call tunnel (needed for phone
 * cameras — see scripts/start-call-tunnel.sh), the page and its API calls must
 * share one address; the tunnel only exposes this dev server. Opened as
 * http://localhost:3001, apiClient still calls :8085 directly and this proxy
 * is simply unused.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  app.use('/api', createProxyMiddleware({
    target: process.env.NESSA_BACKEND_URL || 'http://localhost:8085',
    changeOrigin: true,
    // The page and /api share one origin here, so CORS does not apply — but the
    // browser still sends Origin on POSTs, and the backend's CORS filter answers
    // a tunnel origin with 403 "Invalid CORS request" (it broke joining calls).
    onProxyReq: (proxyReq) => { proxyReq.removeHeader('origin'); },
    // Server-sent events (live notifications) must not be buffered.
    onProxyRes: (proxyRes) => { proxyRes.headers['cache-control'] = 'no-cache'; },
  }));
};
