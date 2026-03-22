const express = require('express');
const { Op } = require('sequelize');
const { Call, User, Client, AgentStatus, CallerId, CreditTransaction } = require('../models');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

function getPricing() {
  return { cost_per_minute: parseFloat(process.env.COST_PER_MINUTE || '0.05'), minimum_charge: parseFloat(process.env.MINIMUM_CHARGE || '0.01'), billing_increment: parseInt(process.env.BILLING_INCREMENT || '60') };
}

router.post('/initiate', authenticate, async (req, res) => {
  try {
    const { to, callerId } = req.body;
    if (!to) return res.status(400).json({ error: 'Numero requis' });
    const user = await User.findByPk(req.user.id);
    const pricing = getPricing();
    if (parseFloat(user.credits) < pricing.minimum_charge) return res.status(402).json({ error: 'Credits insuffisants' });
    const call = await Call.create({ user_id: req.user.id, direction: 'outbound', called_number: to, caller_id: callerId || to, start_time: new Date(), status: 'ringing' });
    await AgentStatus.upsert({ user_id: req.user.id, status: 'on_call', last_update: new Date() });
    res.json({ success: true, call, pricing });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/start', authenticate, async (req, res) => {
  try {
    const { called_number, caller_id_id, client_id } = req.body;
    if (!called_number) return res.status(400).json({ error: 'Numero requis' });
    const user = await User.findByPk(req.user.id);
    const pricing = getPricing();
    if (parseFloat(user.credits) < pricing.minimum_charge) return res.status(402).json({ error: 'Credits insuffisants' });
    let callerIdNumber = called_number;
    if (caller_id_id) { const cid = await CallerId.findOne({ where: { id: caller_id_id, user_id: req.user.id } }); if (cid) callerIdNumber = cid.phone_number; }
    const call = await Call.create({ user_id: req.user.id, client_id: client_id || null, direction: 'outbound', called_number, caller_id: callerIdNumber, start_time: new Date(), status: 'ringing' });
    await AgentStatus.upsert({ user_id: req.user.id, status: 'on_call', last_update: new Date() });
    res.status(201).json({ call, pricing });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/end', authenticate, async (req, res) => {
  try {
    const { call_id, status } = req.body;
    const call = call_id ? await Call.findByPk(call_id) : await Call.findOne({ where: { user_id: req.user.id, status: { [Op.in]: ['ringing','answered'] } }, order: [['start_time','DESC']] });
    if (!call) return res.status(404).json({ error: 'Appel non trouve' });
    const endTime = new Date();
    const duration = Math.max(1, Math.ceil((endTime - new Date(call.start_time)) / 1000));
    const pricing = getPricing();
    const cost = Math.max(pricing.minimum_charge, Math.ceil(duration / pricing.billing_increment) * pricing.cost_per_minute);
    await call.update({ end_time: endTime, duration, cost, status: status || 'completed' });
    const user = await User.findByPk(call.user_id);
    const newBal = Math.max(0, parseFloat(user.credits) - cost);
    await user.update({ credits: newBal });
    await CreditTransaction.create({ user_id: call.user_id, amount: -cost, type: 'deduction', description: 'Appel vers '+call.called_number+' ('+duration+'s)', call_id: call.id, balance_after: newBal });
    await AgentStatus.upsert({ user_id: call.user_id, status: 'available', last_update: new Date() });
    res.json({ call, cost, newBalance: newBal, duration });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/dtmf', authenticate, async (req, res) => {
  try {
    const { digit } = req.body;
    if (!digit || !'0123456789*#'.includes(digit)) return res.status(400).json({ error: 'Digit invalide' });
    res.json({ success: true, digit });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/caller-ids', authenticate, async (req, res) => {
  try { const ids = await CallerId.findAll({ where: { user_id: req.user.id } }); res.json(ids); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/dtmf-received', async (req, res) => {
  try {
    const { call_id, digit, digits, from } = req.body;
    const d = digit || (digits ? digits[0] : null);
    if (call_id) {
      const call = await Call.findByPk(call_id);
      if (call && global.wss) { const msg = JSON.stringify({ type: 'dtmf_received', digit: d, call_id: call.id, from: from || 'callee', timestamp: new Date().toISOString() }); global.wss.clients.forEach(ws => { if (ws.readyState === 1 && ws.userId === call.user_id) ws.send(msg); }); }
    } else if (global.wss) { const msg = JSON.stringify({ type: 'dtmf_received', digit: d, from: from || 'callee', timestamp: new Date().toISOString() }); global.wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); }); }
    res.json({ status: 'received', digit: d });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.data && body.data.event_type === 'call.dtmf.received') {
      const digit = body.data.payload?.digit;
      if (digit && global.wss) { const msg = JSON.stringify({ type: 'dtmf_received', digit, timestamp: new Date().toISOString() }); global.wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); }); }
    }
    if (body.Digits && global.wss) { for (const d of body.Digits) { const msg = JSON.stringify({ type: 'dtmf_received', digit: d, from: body.From || 'callee', timestamp: new Date().toISOString() }); global.wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); }); } }
    res.json({ status: 'received' });
  } catch (e) { res.status(500).json({ error: 'Webhook error' }); }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, direction, status, user_id } = req.query;
    const where = {};
    if (req.user.role !== 'admin') where.user_id = req.user.id; else if (user_id) where.user_id = user_id;
    if (direction) where.direction = direction;
    if (status) where.status = status;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Call.findAndCountAll({ where, include: [{ model: User, attributes: ['id','username'] }, { model: Client, attributes: ['id','name','phone_number'] }], limit: parseInt(limit), offset, order: [['start_time','DESC']] });
    res.json({ calls: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.user.role !== 'admin') where.user_id = req.user.id;
    const totalCalls = await Call.count({ where });
    const totalDuration = await Call.sum('duration', { where }) || 0;
    const totalCost = await Call.sum('cost', { where }) || 0;
    res.json({ totalCalls, totalDuration, totalCost: parseFloat(totalCost).toFixed(2), avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0 });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try { const call = await Call.findByPk(req.params.id, { include: [{ model: User, attributes: ['id','username'] }, { model: Client }] }); if (!call) return res.status(404).json({ error: 'Non trouve' }); res.json(call); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
