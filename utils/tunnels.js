let tunnelSockets = [];

function getTunnelSocket(host, pathPrefix) {
  return tunnelSockets.find((s) => s.host === host && s.pathPrefix === pathPrefix);
}

function setTunnelSocket(host, pathPrefix, socket) {
  tunnelSockets.push({ host, pathPrefix, socket });
}

function removeTunnelSocket(host, pathPrefix) {
  tunnelSockets = tunnelSockets.filter((s) => !(s.host === host && s.pathPrefix === pathPrefix));
  console.log('tunnelSockets: ', tunnelSockets);
}

function getAvailableTunnelSocket(host, url) {
  const tunnels = tunnelSockets
    .filter((s) => {
      if (s.host !== host) return false;
      if (!s.pathPrefix) return true;
      return url.indexOf(s.pathPrefix) === 0;
    })
    .sort((a, b) => {
      if (!a.pathPrefix) return 1;
      if (!b.pathPrefix) return -1;
      return b.pathPrefix.length - a.pathPrefix.length;
    });
  if (tunnels.length === 0) return null;
  return tunnels[0].socket;
}

module.exports = {
  getTunnelSocket,
  setTunnelSocket,
  removeTunnelSocket,
  getAvailableTunnelSocket,
};
