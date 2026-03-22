const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { User, Call, Client, CreditTransaction, AgentStatus } = require('../models');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sequelize } = require('../models');

router.use(authenticate, requireAdmin);

router.get('/analytics', async (req, res) => {
  try {
    const totalUsers = await User.count({ where: { role: 'agent' } });
    const totalClients = await Client.count();
    const totalCalls = await Call.count();
    const activeCalls = await Call.count({ where: { status: 'answered' } });
    const agents = await User.findAll({
      where: { role: 'agent', is_active: true },
      include: [{ model: AgentStatus }],
      attributes: ['id', 'username', 'credits']
    });
    const recentCalls = await Call.findAll({
      include: [{ model: User, attributes: ['username'] }],
      order: [['created_at', 'DESC']], limit: 10
    });
    res.json({ totalUsers, totalClients, totalCalls, activeCalls, agents, recentCalls });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.findAll({ attributes: { exclude: ['password'] }, order: [['created_at', 'DESC']] });
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', async (req, res) => {
  try {
    const { username, email, password, role, credits } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashed, role: role || 'agent', credits: credits || 0 });
    res.status(201).json({ id: user.id, username: user.username, email: user.email, role: user.role, credits: user.credits });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    if (req.body.password) req.body.password = await bcrypt.hash(req.body.password, 10);
    await user.update(req.body);
    res.json({ id: user.id, username: user.username, email: user.email, role: user.role, credits: user.credits, is_active: user.is_active });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    await user.destroy();
    res.json({ message: 'Supprimé' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/credits', async (req, res) => {
  try {
    const { user_id, amount, type, description } = req.body;
    const user = await User.findByPk(user_id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const newCredits = parseFloat(user.credits) + parseFloat(amount);
    await user.update({ credits: newCredits });
    const tx = await CreditTransaction.create({ user_id, amount, type: type || 'topup', description, balance_after: newCredits });
    res.json({ transaction: tx, new_balance: newCredits });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
