const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { httpServer } = require('../server');

function ensureProxyListening() {
  return new Promise((resolve) => {
    if (httpServer.listening) return resolve(httpServer.address().port);
    httpServer.listen(0, () => resolve(httpServer.address().port));
  });
}

describe('Auth: invalid JWT is rejected', () => {
  let proxyPort;

  beforeAll(async () => {
    process.env.SECRET_KEY = 'SECRET';
    process.env.VERIFY_TOKEN = 'VERIFY';
    proxyPort = await ensureProxyListening();
  });

  afterAll(async () => {
    if (httpServer.listening) {
      await new Promise((r) => httpServer.close(() => r()));
    }
  });

  test('token signed with correct secret but wrong payload is rejected', async () => {
    const socket = io(`http://localhost:${proxyPort}`, {
      path: '/$web_tunnel',
      transports: ['websocket'],
      reconnection: false,
      auth: { token: jwt.sign({ token: 'WRONG' }, 'SECRET') },
      autoConnect: false,
    });
    const err = await new Promise((resolve) => {
      socket.on('connect', () => resolve(new Error('should not connect')));
      socket.on('connect_error', (e) => resolve(e));
      socket.connect();
    });
    socket.close();
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/Authentication error/i);
  });

  test('token signed with wrong secret is rejected', async () => {
    const socket = io(`http://localhost:${proxyPort}`, {
      path: '/$web_tunnel',
      transports: ['websocket'],
      reconnection: false,
      auth: { token: jwt.sign({ token: 'VERIFY' }, 'BADSECRET') },
      autoConnect: false,
    });
    const err = await new Promise((resolve) => {
      socket.on('connect', () => resolve(new Error('should not connect')));
      socket.on('connect_error', (e) => resolve(e));
      socket.connect();
    });
    socket.close();
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/Authentication error/i);
  });
});
