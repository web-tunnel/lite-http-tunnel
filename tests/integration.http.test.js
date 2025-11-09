const http = require('http');
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');

// Import server pieces
const { httpServer } = require('../server');
// Use the client-side tunnel classes for the simulated client
const { TunnelRequest, TunnelResponse } = require('lite-http-tunnel/lib');

// Helper to create a local target HTTP server
function createLocalTarget(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

// Start the proxy server on ephemeral port
function ensureProxyListening() {
  return new Promise((resolve) => {
    if (httpServer.listening) {
      return resolve(httpServer.address().port);
    }
    httpServer.listen(0, () => {
      resolve(httpServer.address().port);
    });
  });
}

describe('Integration: HTTP tunnel flow', () => {
  let localTarget;
  let proxyPort;
  let clientSocket;

  beforeAll(async () => {
    // Create a simple echo JSON endpoint
    localTarget = await createLocalTarget((req, res) => {
      if (req.url === '/ping' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404);
      res.end('NF');
    });
    proxyPort = await ensureProxyListening();

    // Set auth envs expected by the server for Socket.IO auth middleware
    process.env.SECRET_KEY = 'SECRET';
    process.env.VERIFY_TOKEN = 'VERIFY';

    // Fake client socket to receive tunneled requests (simulate real tunnel client logic minimal subset)
    clientSocket = io(`http://localhost:${proxyPort}`, {
      path: '/$web_tunnel',
      transports: ['websocket'],
      auth: { token: jwt.sign({ token: 'VERIFY' }, 'SECRET') },
      autoConnect: false,
    });
    await new Promise((resolve, reject) => {
      clientSocket.on('connect_error', reject);
      clientSocket.on('connect', resolve);
      clientSocket.connect();
    });
  });

  afterAll(async () => {
    if (clientSocket && clientSocket.connected) clientSocket.disconnect();
    await new Promise((r) => httpServer.close(() => r()));
    await new Promise((r) => localTarget.server.close(() => r()));
  });

  test('GET /ping proxied successfully', async () => {
    // Implement minimal client-side handling of tunnel events
    clientSocket.on('request', (requestId, request) => {
      // rewrite target
      request.port = localTarget.port;
      request.hostname = 'localhost';
      const localReq = http.request(request, (localRes) => {
        const tunnelResponse = new TunnelResponse({ socket: clientSocket, responseId: requestId });
        tunnelResponse.writeHead(localRes.statusCode, localRes.statusMessage, localRes.headers, localRes.httpVersion);
        localRes.pipe(tunnelResponse);
      });
      const tunnelRequest = new TunnelRequest({ socket: clientSocket, requestId });
      tunnelRequest.pipe(localReq);
    });

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: 'localhost',
        port: proxyPort,
        path: '/ping',
        method: 'GET',
        headers: { Host: `localhost:${proxyPort}` },
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    expect(body.status).toBe(200);
    expect(body.json).toEqual({ ok: true });
  });
});
