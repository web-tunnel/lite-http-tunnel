const http = require('http');
const { v4: uuidV4 } = require('uuid');
const express = require('express');
const morgan = require('morgan');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const { SocketRequest, SocketResponse } = require('./lib');

const app = express();
const httpServer = http.createServer(app);
const webTunnelPath = '/$web_tunnel';
const io = new Server(httpServer, {
  path: webTunnelPath,
});

let connectedSockets = {};

io.use((socket, next) => {
  const connectHost = socket.handshake.headers.host;
  if (connectedSockets[connectHost]) {
    return next(new Error(`${connectHost} has a existing connection`));
  }
  if (!socket.handshake.auth || !socket.handshake.auth.token){
    next(new Error('Authentication error'));
  }
  jwt.verify(socket.handshake.auth.token, process.env.SECRET_KEY, function(err, decoded) {
    if (err) {
      return next(new Error('Authentication error'));
    }
    if (decoded.token !== process.env.VERIFY_TOKEN) {
      return next(new Error('Authentication error'));
    }
    next();
  });  
});

io.on('connection', (socket) => {
  const connectHost = socket.handshake.headers.host;
  connectedSockets[connectHost] = socket;
  console.log(`client connected at ${connectHost}`);
  const onMessage = (message) => {
    if (message === 'ping') {
      socket.send('pong');
    }
  }
  const onDisconnect = (reason) => {
    console.log('client disconnected: ', reason);
    delete connectedSockets[connectHost];
    socket.off('message', onMessage);
    socket.off('error', onError);
  };
  const onError = (e) => {
    delete connectedSockets[connectHost];
    socket.off('message', onMessage);
    socket.off('disconnect', onDisconnect);
  };
  socket.on('message', onMessage);
  socket.once('disconnect', onDisconnect);
  socket.once('error', onError);
});

app.use(morgan('tiny'));
app.get('/tunnel_jwt_generator', (req, res) => {
  if (!process.env.JWT_GENERATOR_USERNAME || !process.env.JWT_GENERATOR_PASSWORD) {
    res.status(404);
    res.send('Not found');
    return;
  }
  if (
    req.query.username === process.env.JWT_GENERATOR_USERNAME &&
    req.query.password === process.env.JWT_GENERATOR_PASSWORD
  ) {
    const jwtToken = jwt.sign({ token: process.env.VERIFY_TOKEN }, process.env.SECRET_KEY);
    res.status(200);
    res.send(jwtToken);
    return;
  }
  res.status(401);
  res.send('Forbidden');
});

app.use('/', (req, res) => {
  const connectedSocket = connectedSockets[req.headers.host];
  if (!connectedSocket) {
    res.status(404);
    res.send('Not Found');
    return;
  }
  const requestId = uuidV4();
  const proxyRequest = new SocketRequest({
    socket: connectedSocket,
    requestId,
    request: {
      method: req.method,
      headers: { ...req.headers },
      path: req.url,
    },
  });
  const onReqError = (e) => {
    proxyRequest.destroy(new Error(e || 'Aborted'));
  }
  req.once('aborted', onReqError);
  req.once('error', onReqError);
  req.pipe(proxyRequest);
  req.once('finish', () => {
    req.off('aborted', onReqError);
    req.off('error', onReqError);
  });
  const proxyResponse = new SocketResponse({
    socket: connectedSocket,
    responseId: requestId,
  });
  const onRequestError = () => {
    proxyResponse.off('response', onResponse);
    proxyResponse.destroy();
    res.status(502);
    res.end('Request error');
  };
  const onResponse = ({ statusCode, statusMessage, headers }) => {
    proxyRequest.off('requestError', onRequestError)
    res.writeHead(statusCode, statusMessage, headers);
  };
  proxyResponse.once('requestError', onRequestError)
  proxyResponse.once('response', onResponse);
  proxyResponse.pipe(res);
  const onSocketError = () => {
    res.end(500);
  };
  proxyResponse.once('error', onSocketError);
  connectedSocket.once('close', onSocketError)
  res.once('close', () => {
    connectedSocket.off('close', onSocketError);
    proxyResponse.off('error', onSocketError);
  });
});

function createSocketHttpHeader(line, headers) {
  return Object.keys(headers).reduce(function (head, key) {
    var value = headers[key];

    if (!Array.isArray(value)) {
      head.push(key + ': ' + value);
      return head;
    }

    for (var i = 0; i < value.length; i++) {
      head.push(key + ': ' + value[i]);
    }
    return head;
  }, [line])
  .join('\r\n') + '\r\n\r\n';
}

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url.indexOf(webTunnelPath) === 0) {
    return;
  }
  // proxy websocket request
  const connectedSocket = connectedSockets[req.headers.host];
  if (!connectedSocket) {
    return;
  }
  if (head && head.length) socket.unshift(head);
  const requestId = uuidV4();
  const proxyRequest = new SocketRequest({
    socket: connectedSocket,
    requestId,
    request: {
      method: req.method,
      headers: { ...req.headers },
      path: req.url,
    },
  });
  req.pipe(proxyRequest);
  const proxyResponse = new SocketResponse({
    socket: connectedSocket,
    responseId: requestId,
  });
  proxyResponse.once('response', ({ statusCode, statusMessage, headers, httpVersion }) => {
    if (statusCode) {
      // not upgrade event
      socket.write(createSocketHttpHeader(`HTTP/${httpVersion} ${statusCode} ${statusMessage}`, headers));
      proxyResponse.pipe(socket);
      return;
    }
    socket.write(createSocketHttpHeader('HTTP/1.1 101 Switching Protocols', headers))
    proxyResponse.pipe(socket).pipe(proxyResponse);
  });
});

httpServer.listen(process.env.PORT);
console.log(`app start at http://localhost:${process.env.PORT}`);
