
const { Writable, Duplex } = require('stream');

class TunnelRequest extends Writable {
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

class TunnelResponse extends Duplex {
  constructor({ socket, responseId }) {
    super();
    this._socket = socket;
    this._responseId = responseId;
    const onResponse = (responseId, data) => {
      if (this._responseId === responseId) {
        this._socket.off('response', onResponse);
        this._socket.off('request-error', onRequestError);
        this.emit('response', {
          statusCode: data.statusCode,
          statusMessage: data.statusMessage,
          headers: data.headers,
          httpVersion: data.httpVersion,
        });
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
    const onRequestError = (requestId, error) => {
      if (requestId === this._responseId) {
        this._socket.off('request-error', onRequestError);
        this._socket.off('response', onResponse);
        this._socket.off('response-pipe', onResponsePipe);
        this._socket.off('response-pipes', onResponsePipes);
        this._socket.off('response-pipe-error', onResponsePipeError);
        this._socket.off('response-pipe-end', onResponsePipeEnd);
        this.emit('requestError', error);
      }
    };
    this._socket.on('response', onResponse);
    this._socket.on('response-pipe', onResponsePipe);
    this._socket.on('response-pipes', onResponsePipes);
    this._socket.on('response-pipe-error', onResponsePipeError);
    this._socket.on('response-pipe-end', onResponsePipeEnd);
    this._socket.on('request-error', onRequestError);
  }

  _read(size) {}

  _write(chunk, encoding, callback) {
    this._socket.emit('response-pipe', this._responseId, chunk);
    this._socket.conn.once('drain', () => {
      callback();
    });
  }

  _writev(chunks, callback) {
    this._socket.emit('response-pipes', this._responseId, chunks);
    this._socket.conn.once('drain', () => {
      callback();
    });
  }

  _final(callback) {
    this._socket.emit('response-pipe-end', this._responseId);
    this._socket.conn.once('drain', () => {
      callback();
    });
  }

  _destroy(e, callback) {
    if (e) {
      this._socket.emit('response-pipe-error', this._responseId, e && e.message);
      this._socket.conn.once('drain', () => {
        callback();
      });
      return;
    }
    callback();
  }
}

exports.TunnelRequest = TunnelRequest;
exports.TunnelResponse = TunnelResponse;
