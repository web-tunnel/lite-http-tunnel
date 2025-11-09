module.exports = async () => {
  // Jest sometimes leaves open timers from socket.io keep-alives.
  // Force process exit after small delay allowing disconnect handlers to run.
  await new Promise((r) => setTimeout(r, 200));
};