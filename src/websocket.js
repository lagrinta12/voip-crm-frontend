const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://'+req.headers.host);
    const token = url.searchParams.get('token');
    if (token) { try { const d = jwt.verify(token, process.env.JWT_SECRET); ws.userId = d.id; ws.userRole = d.role; ws.username = d.username; ws.isAuthenticated = true; } catch(e) { ws.isAuthenticated = false; } }
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => { try { const msg = JSON.parse(data); handleMessage(wss, ws, msg); } catch(e) {} });
    ws.on('close', () => { if (ws.username) broadcast(wss, { type: 'agent_disconnected', userId: ws.userId, username: ws.username }); });
  });
  const interval = setInterval(() => { wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }); }, 30000);
  wss.on('close', () => clearInterval(interval));
  global.wss = wss;
  return wss;
}

function handleMessage(wss, ws, message) {
  switch (message.type) {
    case 'agent_status': broadcast(wss, { type: 'agent_status_changed', userId: ws.userId, username: ws.username, status: message.status }); break;
    case 'call_event': if (message.targetUserId) sendToUser(wss, message.targetUserId, { type: 'incoming_call', ...message.data }); sendToAdmins(wss, { type: 'call_event', ...message.data }); break;
    case 'dtmf_send': broadcast(wss, { type: 'dtmf_sent', userId: ws.userId, username: ws.username, digit: message.digit, callId: message.callId, timestamp: new Date().toISOString() }); break;
    case 'dtmf_received': if (message.targetUserId) { sendToUser(wss, message.targetUserId, { type: 'dtmf_received', digit: message.digit, from: message.from || 'callee', callId: message.callId, timestamp: new Date().toISOString() }); } else { broadcast(wss, { type: 'dtmf_received', digit: message.digit, from: message.from || 'callee', callId: message.callId, timestamp: new Date().toISOString() }); } break;
    default: break;
  }
}

function broadcast(wss, data) { const msg = JSON.stringify(data); wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); }); }
function sendToUser(wss, userId, data) { const msg = JSON.stringify(data); wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN && c.userId === userId) c.send(msg); }); }
function sendToAdmins(wss, data) { const msg = JSON.stringify(data); wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN && c.userRole === 'admin') c.send(msg); }); }

module.exports = { setupWebSocket };
