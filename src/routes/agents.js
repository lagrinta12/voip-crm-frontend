const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const agents = await User.findAll({ where: { role: 'agent' }, attributes: { exclude: ['password'] } });
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
