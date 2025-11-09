const { getAvailableTunnelSocket, setTunnelSocket, removeTunnelSocket } = require('../utils/tunnels');

// We will monkey-patch tunnelSockets via require cache introspection.
// server.js stores tunnelSockets in its module scope; to test selection logic
// we replicate the array shape used in production.

describe('getAvailableTunnelSocket', () => {
  test('returns null when no sockets match host', () => {
    // simulate empty set
    expect(getAvailableTunnelSocket('example.com', '/any')).toBeNull();
  });

  test('chooses longest matching path prefix for same host', () => {
    const a = { id: 'A' };
    const b = { id: 'B' };
    const c = { id: 'C' };

    setTunnelSocket('example.com', '/api', a);
    setTunnelSocket('example.com', '/api_v1', b);
    setTunnelSocket('example.com', undefined, c);

    expect(getAvailableTunnelSocket('example.com', '/api_v1/hello')).toBe(b);
    expect(getAvailableTunnelSocket('example.com', '/api/hello')).toBe(a);
    expect(getAvailableTunnelSocket('example.com', '/no-prefix')).toBe(c);

    // cleanup
    removeTunnelSocket('example.com', '/api');
    removeTunnelSocket('example.com', '/api_v1');
    removeTunnelSocket('example.com', undefined);
  });
});
