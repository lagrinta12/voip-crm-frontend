const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (!user || !await bcrypt.compare(password, user.password))
      return res.status(401).json({ error: 'Identifiants invalides' });
    if (!user.is_active) return res.status(401).json({ error: 'Compte désactivé' });
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'voipcrm_secret_2024', { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role, credits: user.credits } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', require('../middleware/auth').authenticate, async (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, email: req.user.email, role: req.user.role, credits: req.user.credits });
});

module.exports = router;
