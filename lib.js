
const { Writable, Readable } = require('stream');

class SocketRequest extends Writable {
  constructor({ socket, requestId, request }) {
    super();
    this._socket = socket;
    this._requestId = requestId;
    this._socket.emit('request', requestId, request);
  }

  _write(chunk, encoding, callback) {
    this._socket.emit('request-pipe', this._requestId, chunk);
    this._socket.conn.once('drain', () => {
      callback();
    });
  }

  _writev(chunks, callback) {
    this._socket.emit('request-pipes', this._requestId, chunks);
    this._socket.conn.once('drain', () => {
      callback();
    });
  }

  _final(callback) {
    this._socket.emit('request-pipe-end', this._requestId);
    this._socket.conn.once('drain', () => {
      callback();
    });
  }

  _destroy(e, callback) {
    if (e) {
      this._socket.emit('request-pipe-error', this._requestId, e && e.message);
      this._socket.conn.once('drain', () => {
        callback();
      });
      return;
    }
    callback();
  }
}

class SocketResponse extends Readable {
  constructor({ socket, responseId }) {
    super();
    this._socket = socket;
    this._responseId = responseId;
    const onResponse = (responseId, data) => {
      if (this._responseId === responseId) {
        this._socket.off('response', onResponse);
        this.emit('response', data.statusCode, data.statusMessage, data.headers);
      }
    }
    const onResponsePipe = (responseId, data) => {
      if (this._responseId === responseId) {
        this.push(data);
      }
    };
    const onResponsePipes = (responseId, data) => {
      if (this._responseId === responseId) {
        data.forEach((chunk) => {
          this.push(chunk);
        });
      }
    };
    const onResponsePipeError = (responseId, error) => {
      if (this._responseId !== responseId) {
        return;
      }
      this._socket.off('response-pipe', onResponsePipe);
      this._socket.off('response-pipes', onResponsePipes);
      this._socket.off('response-pipe-error', onResponsePipeError);
      this._socket.off('response-pipe-end', onResponsePipeEnd);
      this.destroy(new Error(error));
    };
    const onResponsePipeEnd = (responseId, data) => {
      if (this._responseId !== responseId) {
        return;
      }
      if (data) {
        this.push(data);
      }
      this._socket.off('response-pipe', onResponsePipe);
      this._socket.off('response-pipes', onResponsePipes);
      this._socket.off('response-pipe-error', onResponsePipeError);
      this._socket.off('response-pipe-end', onResponsePipeEnd);
      this.push(null);
    };
    this._socket.on('response', onResponse);
    this._socket.on('response-pipe', onResponsePipe);
    this._socket.on('response-pipes', onResponsePipes);
    this._socket.on('response-pipe-error', onResponsePipeError);
    this._socket.on('response-pipe-end', onResponsePipeEnd);
  }

  _read(size) {}
}

exports.SocketRequest = SocketRequest;
exports.SocketResponse = SocketResponse;
