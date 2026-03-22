require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const sequelize = require('./config/database');
const seedDatabase = require('./seed');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tags', require('./routes/tags'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// WebSocket setup
require('./websocket')(wss);

const PORT = process.env.PORT || 3000;

sequelize.sync({ force: true }).then(() => {
  console.log('Database synced');
  seedDatabase();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Error syncing database:', err);
});
