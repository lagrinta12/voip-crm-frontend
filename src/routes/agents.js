const router = require('express').Router();
const { User, AgentStatus, Call } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/status', async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: 'agent', is_active: true },
      include: [{ model: AgentStatus }],
      attributes: ['id', 'username', 'email', 'credits']
    });
    res.json(agents);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/status', async (req, res) => {
  try {
    const [status, created] = await AgentStatus.findOrCreate({
      where: { user_id: req.user.id },
      defaults: { status: req.body.status, last_update: new Date() }
    });
    if (!created) await status.update({ status: req.body.status, last_update: new Date() });
    res.json(status);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/caller-ids', async (req, res) => {
  try {
    const { CallerId } = require('../models');
    const ids = await CallerId.findAll({ where: { user_id: req.user.id } });
    res.json(ids);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
