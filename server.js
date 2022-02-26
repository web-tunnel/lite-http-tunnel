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
const io = new Server(httpServer);

let connectedSocket = null;

io.use((socket, next) => {
  if (connectedSocket) {
    return next(new Error('Connected error'));
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
  console.log('client connected');
  connectedSocket = socket;
  const onMessage = (message) => {
    if (message === 'ping') {
      socket.send('pong');
    }
  }
  const onDisconnect = (reason) => {
    console.log('client disconnected: ', reason);
    connectedSocket = null;
    socket.off('message', onMessage);
    socket.off('error', onError);
  };
  const onError = (e) => {
    console.log('client error: ', e && e.message);
    connectedSocket = null;
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
  if (!connectedSocket) {
    res.status(404);
    res.send('Not Found');
    return;
  }
  const requestId = uuidV4();
  const socketRequest = new SocketRequest({
    socket: connectedSocket,
    requestId,
    request: {
      method: req.method,
      headers: { ...req.headers },
      path: req.url,
    },
  });
  const onReqError = (e) => {
    socketRequest.destroy(new Error(e || 'Aborted'));
  }
  req.once('aborted', onReqError);
  req.once('error', onReqError);
  req.pipe(socketRequest);
  req.once('finish', () => {
    req.off('aborted', onReqError);
    req.off('error', onReqError);
  });
  const socketResponse = new SocketResponse({
    socket: connectedSocket,
    responseId: requestId,
  });
  socketResponse.once('response', function(statusCode, statusMessage, headers) {
    res.writeHead(statusCode, statusMessage, headers);
  });
  socketResponse.pipe(res);
  const onSocketError = () => {
    res.end(500);
  };
  socketResponse.once('error', onSocketError);
  connectedSocket.once('close', onSocketError)
  res.once('close', () => {
    connectedSocket.off('close', onSocketError);
    socketResponse.off('error', onSocketError);
  });
});

httpServer.listen(process.env.PORT);
console.log(`app start at http://localhost:${process.env.PORT}`);
