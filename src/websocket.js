module.exports = (wss) => {
  wss.on('connection', ws => {
    console.log('Client connected');

    ws.on('message', message => {
      console.log(`Received: ${message}`);
      // Handle incoming WebSocket messages (e.g., call events)
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });

    ws.on('error', error => {
      console.error('WebSocket error:', error);
    });

    ws.send('Welcome to the VoIP CRM WebSocket!');
  });
};
