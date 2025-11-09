const { getReqHeaders } = require('../utils/headers');

function makeReq({ host = 'example.com', encrypted = false, remoteAddress = '1.2.3.4', xff } = {}) {
  return {
    isSpdy: false,
    connection: { encrypted, pair: undefined, remoteAddress },
    socket: { remoteAddress },
    headers: Object.assign({ host }, xff ? { 'x-forwarded-for': xff } : {}),
  };
}

describe('getReqHeaders', () => {
  test('adds x-forwarded-* when none exist over http', () => {
    const req = makeReq();
    const headers = getReqHeaders(req);
    expect(headers['x-forwarded-for']).toBe('1.2.3.4');
    expect(headers['x-forwarded-port']).toBe('80');
    expect(headers['x-forwarded-proto']).toBe('http');
    expect(headers['x-forwarded-host']).toBe('example.com');
  });

  test('appends to existing x-forwarded-for and sets https/443 when encrypted', () => {
    const req = makeReq({ encrypted: true, xff: '2.2.2.2' });
    const headers = getReqHeaders(req);
    expect(headers['x-forwarded-for']).toBe('2.2.2.2,1.2.3.4');
    expect(headers['x-forwarded-port']).toBe('443');
    expect(headers['x-forwarded-proto']).toBe('https');
  });
});
