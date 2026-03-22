const WebSocket = require('ws');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  global.wss = wss;
  
  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch(e) {}
    });
    ws.on('error', () => {});
  });
  
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  
  wss.on('close', () => clearInterval(interval));
  console.log('WebSocket server ready');
}

module.exports = { setupWebSocket };
