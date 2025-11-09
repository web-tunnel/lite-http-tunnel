const http = require('http');
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const { httpServer } = require('../server');
const { TunnelRequest, TunnelResponse } = require('../../proxy-client/lib');

function ensureProxyListening() {
  return new Promise((resolve) => {
    if (httpServer.listening) return resolve(httpServer.address().port);
    httpServer.listen(0, () => resolve(httpServer.address().port));
  });
}

function makeLocalServer(text) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(text);
    });
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

describe('Integration: path-prefix routing across multiple clients', () => {
  let proxyPort;
  let localA;
  let localB;
  let clientA;
  let clientB;

  beforeAll(async () => {
    process.env.SECRET_KEY = 'SECRET';
    process.env.VERIFY_TOKEN = 'VERIFY';
    proxyPort = await ensureProxyListening();
    localA = await makeLocalServer('A');
    localB = await makeLocalServer('B');

    // client A for /a
    clientA = io(`http://localhost:${proxyPort}`, {
      path: '/$web_tunnel',
      transports: ['websocket'],
      auth: { token: jwt.sign({ token: 'VERIFY' }, 'SECRET') },
      extraHeaders: { 'path-prefix': '/a' },
      autoConnect: false,
    });
    // client B for /a/b (longer prefix)
    clientB = io(`http://localhost:${proxyPort}`, {
      path: '/$web_tunnel',
      transports: ['websocket'],
      auth: { token: jwt.sign({ token: 'VERIFY' }, 'SECRET') },
      extraHeaders: { 'path-prefix': '/a/b' },
      autoConnect: false,
    });

    // minimal tunnel handlers for both clients
    const setupHandler = (client, targetPort) => {
      client.on('request', (requestId, request) => {
        request.port = targetPort;
        request.hostname = 'localhost';
        const localReq = http.request(request, (localRes) => {
          const tunnelResponse = new TunnelResponse({ socket: client, responseId: requestId });
          tunnelResponse.writeHead(
            localRes.statusCode,
            localRes.statusMessage,
            localRes.headers,
            localRes.httpVersion,
          );
          localRes.pipe(tunnelResponse);
        });
        const tunnelRequest = new TunnelRequest({ socket: client, requestId });
        tunnelRequest.pipe(localReq);
      });
    };

    await Promise.all([
      new Promise((resolve, reject) => { clientA.on('connect_error', reject); clientA.on('connect', resolve); clientA.connect(); }),
      new Promise((resolve, reject) => { clientB.on('connect_error', reject); clientB.on('connect', resolve); clientB.connect(); }),
    ]);

    setupHandler(clientA, localA.port);
    setupHandler(clientB, localB.port);
  });

  afterAll(async () => {
    const disconnect = (c) => new Promise((r) => { if (!c || !c.connected) return r(); c.on('disconnect', r); c.disconnect(); setTimeout(r, 200); });
    await disconnect(clientA);
    await disconnect(clientB);
    await new Promise((r) => localA.server.close(() => r()));
    await new Promise((r) => localB.server.close(() => r()));
    if (httpServer.listening) await new Promise((r) => httpServer.close(() => r()));
  });

  test('routes /a/hello to client A', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: 'localhost', port: proxyPort, path: '/a/hello', method: 'GET', headers: { Host: `localhost:${proxyPort}` } }, (res) => {
        let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject); req.end();
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe('A');
  });

  test('routes /a/b/hello to client B (longest prefix wins)', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: 'localhost', port: proxyPort, path: '/a/b/hello', method: 'GET', headers: { Host: `localhost:${proxyPort}` } }, (res) => {
        let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject); req.end();
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe('B');
  });

  test('routes /no-prefix to 404 when no default client', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: 'localhost', port: proxyPort, path: '/no-prefix', method: 'GET', headers: { Host: `localhost:${proxyPort}` } }, (res) => {
        let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject); req.end();
    });
    expect(res.status).toBe(404);
  });
});
