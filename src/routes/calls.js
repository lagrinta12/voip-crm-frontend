const express = require('express');
const router = express.Router();
const { Call } = require('../models');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const calls = await Call.findAll();
    res.json(calls);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  const { agentId, clientId, duration, status, notes } = req.body;
  try {
    const call = await Call.create({ agentId, clientId, duration, status, notes });
    res.status(201).json(call);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
