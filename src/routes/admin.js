const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');

router.get('/users', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const users = await User.findAll({ attributes: { exclude: ['password'] } });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
