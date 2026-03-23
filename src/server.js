require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const { sequelize } = require('./models');

const app = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tags', require('./routes/tags'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Serve frontend
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// WebSocket
try {
  const { setupWebSocket } = require('./websocket');
  setupWebSocket(server);
} catch(e) { console.log('WebSocket setup skipped:', e.message); }

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    await sequelize.sync({ alter: true });
    console.log('Database synced');
    
    // Auto-seed
    try {
      const { User } = require('./models');
      const bcrypt = require('bcryptjs');
      const adminExists = await User.findOne({ where: { username: 'admin' } });
      if (!adminExists) {
        await User.create({
          username: 'admin', email: 'admin@voipcrm.com',
          password: await bcrypt.hash('admin123', 10),
          role: 'admin', credits: 1000, is_active: true
        });
        await User.create({
          username: 'agent1', email: 'agent1@voipcrm.com',
          password: await bcrypt.hash('agent123', 10),
          role: 'agent', credits: 100, is_active: true
        });
        console.log('Seeded: admin/admin123, agent1/agent123');
      }
    } catch(e) { console.log('Seed skipped:', e.message); }
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log('Server running on port', PORT);
    });
  } catch(err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

start();
