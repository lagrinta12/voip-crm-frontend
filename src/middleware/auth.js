const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'voipcrm_secret_2024');
    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Non autorisé' });
    req.user = user;
    next();
  } catch (e) { return res.status(401).json({ error: 'Token invalide' }); }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  next();
};

const requireAgent = (req, res, next) => {
  if (!['agent','admin'].includes(req.user.role)) return res.status(403).json({ error: 'Agent requis' });
  next();
};

module.exports = { authenticate, requireAdmin, requireAgent };
