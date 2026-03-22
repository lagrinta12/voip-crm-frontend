const router = require('express').Router();
const { ClientTag } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const tags = await ClientTag.findAll({ order: [['name', 'ASC']] });
    res.json(tags);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const tag = await ClientTag.create(req.body);
    res.status(201).json(tag);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const tag = await ClientTag.findByPk(req.params.id);
    if (!tag) return res.status(404).json({ error: 'Tag non trouvé' });
    await tag.destroy();
    res.json({ message: 'Supprimé' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
