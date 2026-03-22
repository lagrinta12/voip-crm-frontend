const router = require('express').Router();
const { Op } = require('sequelize');
const { Client, ClientNote, ClientTag, ClientInteraction, User } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const where = search ? { name: { [Op.iLike]: '%' + search + '%' } } : {};
    const { count, rows } = await Client.findAndCountAll({
      where, include: [{ model: ClientTag, as: 'tags', through: { attributes: [] } }],
      limit: parseInt(limit), offset: (parseInt(page) - 1) * parseInt(limit), order: [['created_at', 'DESC']]
    });
    res.json({ clients: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findByPk(req.params.id, {
      include: [
        { model: ClientNote, include: [{ model: User, attributes: ['username'] }] },
        { model: ClientTag, as: 'tags', through: { attributes: [] } },
        { model: ClientInteraction, include: [{ model: User, attributes: ['username'] }] }
      ]
    });
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(client);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const client = await Client.create(req.body);
    res.status(201).json(client);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const client = await Client.findByPk(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });
    await client.update(req.body);
    res.json(client);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findByPk(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });
    await client.destroy();
    res.json({ message: 'Supprimé' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/notes', async (req, res) => {
  try {
    const note = await ClientNote.create({ client_id: req.params.id, user_id: req.user.id, note_text: req.body.note_text });
    res.status(201).json(note);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
