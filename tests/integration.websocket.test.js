const http = require('http');
const WebSocket = require('ws');
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const { httpServer } = require('../server');
const { TunnelRequest, TunnelResponse } = require('lite-http-tunnel/lib');

function ensureProxyListening() {
  return new Promise((resolve) => {
    if (httpServer.listening) return resolve(httpServer.address().port);
    httpServer.listen(0, () => resolve(httpServer.address().port));
  });
}

function createWsEchoServer() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, () => {
      const wsServer = new WebSocket.Server({ server });
      wsServer.on('connection', (socket) => {
        socket.on('message', (msg) => {
          // echo back
          socket.send(msg.toString().toUpperCase());
        });
      });
      resolve({ server, port: server.address().port });
    });
  });
}

describe('Integration: WebSocket upgrade tunnel', () => {
  let proxyPort;
  let wsEcho;
  let clientSocket;

  beforeAll(async () => {
    wsEcho = await createWsEchoServer();
    proxyPort = await ensureProxyListening();
    process.env.SECRET_KEY = 'SECRET';
    process.env.VERIFY_TOKEN = 'VERIFY';

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

    // Minimal tunnel client implementation for WS upgrade requests
    clientSocket.on('request', (requestId, request) => {
      const isWs = request.headers.upgrade === 'websocket';
      request.port = wsEcho.port;
      request.hostname = 'localhost';
      const localReq = http.request(request);
      const tunnelRequest = new TunnelRequest({ socket: clientSocket, requestId });
      tunnelRequest.pipe(localReq);
      if (isWs) {
        localReq.on('upgrade', (localRes, localSocket, localHead) => {
          if (localHead && localHead.length) localSocket.unshift(localHead);
          const tunnelResponse = new TunnelResponse({ socket: clientSocket, responseId: requestId, duplex: true });
          tunnelResponse.writeHead(null, null, localRes.headers, localRes.httpVersion);
          localSocket.pipe(tunnelResponse).pipe(localSocket);
        });
      } else {
        localReq.on('response', (localRes) => {
          const tunnelResponse = new TunnelResponse({ socket: clientSocket, responseId: requestId });
          tunnelResponse.writeHead(localRes.statusCode, localRes.statusMessage, localRes.headers, localRes.httpVersion);
          localRes.pipe(tunnelResponse);
        });
      }
    });
  });

  afterAll(async () => {
    if (clientSocket && clientSocket.connected) {
      await new Promise((resolve) => {
        clientSocket.on('disconnect', resolve);
        clientSocket.disconnect();
        setTimeout(resolve, 500);
      });
    }
    await new Promise((r) => wsEcho.server.close(() => r()));
    if (httpServer.listening) {
      await new Promise((r) => httpServer.close(() => r()));
    }
  });

  test('WebSocket echo tunneled', async () => {
    const client = new WebSocket(`ws://localhost:${proxyPort}/echo`, {
      headers: { Host: `localhost:${proxyPort}` },
    });
    const result = await new Promise((resolve, reject) => {
      client.on('open', () => {
        client.send('hello');
      });
      client.on('message', (msg) => {
        resolve(msg.toString());
      });
      client.on('error', reject);
    });
    expect(result).toBe('HELLO');
    await new Promise((resolve) => {
      client.on('close', resolve);
      client.close();
      setTimeout(resolve, 500);
    });
  });
});
