const router = require('express').Router();
const { Call, User, Client } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const where = req.user.role === 'admin' ? {} : { user_id: req.user.id };
    const calls = await Call.findAll({
      where, include: [
        { model: User, attributes: ['username'] },
        { model: Client, attributes: ['name', 'phone_number'] }
      ],
      order: [['created_at', 'DESC']], limit: 100
    });
    res.json(calls);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const call = await Call.create({ ...req.body, user_id: req.user.id });
    res.status(201).json(call);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const call = await Call.findByPk(req.params.id);
    if (!call) return res.status(404).json({ error: 'Appel non trouvé' });
    await call.update(req.body);
    res.json(call);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/dtmf', authenticate, async (req, res) => {
  try {
    const { call_id, digit } = req.body;
    res.json({ success: true, call_id, digit, timestamp: new Date() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
