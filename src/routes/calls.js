const express = require('express');
const { Op } = require('sequelize');
const { Call, User, Client, AgentStatus, CallerId, CreditTransaction } = require('../models');

function getPricing() {
  try {
    const adminRouter = require('./admin');
    if (adminRouter.getPricing) return adminRouter.getPricing();
  } catch (e) {}
  return {
    cost_per_minute: parseFloat(process.env.COST_PER_MINUTE || '0.05'),
    minimum_charge: parseFloat(process.env.MINIMUM_CHARGE || '0.01'),
    billing_increment: parseInt(process.env.BILLING_INCREMENT || '60'),
  };
}
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ============================================================
// TELNYX CALL CONTROL INTEGRATION
// ============================================================

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_URL = 'https://api.telnyx.com/v2';

async function telnyxRequest(endpoint, method = 'GET', body = null) {
  if (!TELNYX_API_KEY) throw new Error('TELNYX_API_KEY non configuree');
  const https = require('https');
  const url = new URL(endpoint.startsWith('http') ? endpoint : TELNYX_API_URL + endpoint);
  return new Promise((resolve, reject) => {
    const options = { hostname: url.hostname, path: url.pathname + url.search, method, headers: { 'Authorization': 'Bearer ' + TELNYX_API_KEY, 'Content-Type': 'application/json' } };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) { console.error('Telnyx API error:', res.statusCode, data); reject(new Error(parsed.errors && parsed.errors[0] ? parsed.errors[0].detail : 'Telnyx error ' + res.statusCode)); }
          else { resolve(parsed); }
        } catch (e) { reject(new Error('Invalid JSON response from Telnyx')); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// POST /calls/start - Start outbound call via Telnyx
router.post('/start', authenticate, async (req, res) => {
  try {
    const { called_number, caller_id_id, client_id } = req.body;
    if (!called_number) return res.status(400).json({ error: 'Numero a appeler requis' });

    const user = await User.findByPk(req.user.id);
    const pricing = getPricing();
    if (parseFloat(user.credits) < pricing.minimum_charge) {
      return res.status(402).json({ error: 'Credits insuffisants', required: pricing.minimum_charge });
    }

    let callerIdNumber = null;
    if (caller_id_id) {
      const cid = await CallerId.findOne({ where: { id: caller_id_id, user_id: req.user.id } });
      if (!cid) return res.status(400).json({ error: 'Caller ID non valide' });
      callerIdNumber = cid.phone_number;
    }

    const toNumber = called_number.startsWith('+') ? called_number : '+' + called_number.replace(/\D/g, '');
    const fromNumber = callerIdNumber || toNumber;

    const webhookUrl = process.env.TELNYX_WEBHOOK_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : 'https://voip-crm-frontend-production.up.railway.app') + '/api/calls/webhook';

    let callControlId = null;
    let telnyxError = null;

    if (TELNYX_API_KEY) {
      try {
        const telnyxResponse = await telnyxRequest('/calls', 'POST', {
          connection_id: process.env.TELNYX_CONNECTION_ID || undefined,
          to: toNumber, from: fromNumber, from_display_name: user.username,
          webhook_url: webhookUrl, webhook_url_method: 'POST', answering_machine_detection: 'detect'
        });
        callControlId = telnyxResponse.data && telnyxResponse.data.call_control_id;
      } catch (e) { telnyxError = e.message; console.error('Telnyx call error:', e.message); }
    }

    const call = await Call.create({
      user_id: req.user.id, client_id: client_id || null, direction: 'outbound',
      called_number: toNumber, caller_id: fromNumber, start_time: new Date(),
      status: callControlId ? 'ringing' : 'failed',
      notes: JSON.stringify({ call_control_id: callControlId, telnyx_error: telnyxError })
    });

    await AgentStatus.upsert({ user_id: req.user.id, status: callControlId ? 'on_call' : 'available', last_update: new Date() });

    if (global.wss) {
      const msg = JSON.stringify({ type: 'call_initiated', call_id: call.id, call_control_id: callControlId, to: toNumber, from: fromNumber, status: callControlId ? 'ringing' : 'failed', error: telnyxError });
      global.wss.clients.forEach(ws => { if (ws.readyState === 1 && ws.userId === req.user.id) ws.send(msg); });
    }

    res.status(201).json({ call, call_control_id: callControlId, pricing, telnyx_error: telnyxError });
  } catch (error) { console.error('Start call error:', error); res.status(500).json({ error: error.message || 'Erreur serveur' }); }
});

// POST /calls/hangup - Hangup call via Telnyx
router.post('/hangup', authenticate, async (req, res) => {
  try {
    const { call_id, call_control_id } = req.body;
    let controlId = call_control_id;
    let call = null;

    if (call_id) {
      call = await Call.findByPk(call_id);
      if (call && call.notes) {
        try { const notes = JSON.parse(call.notes); controlId = controlId || notes.call_control_id; } catch (e) {}
      }
    }

    if (controlId && TELNYX_API_KEY) {
      try { await telnyxRequest('/calls/' + controlId + '/actions/hangup', 'POST', {}); console.log('Call hung up via Telnyx:', controlId); }
      catch (e) { console.error('Telnyx hangup error:', e.message); }
    }

    if (call) {
      const endTime = new Date();
      const duration = Math.max(1, Math.ceil((endTime - new Date(call.start_time)) / 1000));
      const pricing = getPricing();
      const billableMinutes = Math.ceil(duration / pricing.billing_increment);
      const cost = Math.max(pricing.minimum_charge, billableMinutes * pricing.cost_per_minute);

      await call.update({ end_time: endTime, duration, cost, status: 'completed' });

      const user = await User.findByPk(call.user_id);
      const newBalance = parseFloat(user.credits) - cost;
      await user.update({ credits: Math.max(0, newBalance) });

      await CreditTransaction.create({ user_id: call.user_id, amount: -cost, type: 'deduction', description: 'Appel vers ' + call.called_number + ' (' + duration + 's)', call_id: call.id, balance_after: Math.max(0, newBalance) });

      await AgentStatus.upsert({ user_id: call.user_id, status: 'available', last_update: new Date() });

      if (global.wss) {
        const msg = JSON.stringify({ type: 'call_ended', call_id: call.id, duration, cost });
        global.wss.clients.forEach(ws => { if (ws.readyState === 1 && ws.userId === call.user_id) ws.send(msg); });
      }

      res.json({ call, cost, newBalance: Math.max(0, newBalance), duration });
    } else {
      res.json({ success: true, message: 'Hangup signal sent' });
    }
  } catch (error) { console.error('Hangup error:', error); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /calls/dtmf - Send DTMF digit via Telnyx
router.post('/dtmf', authenticate, async (req, res) => {
  try {
    const { digit, call_id, call_control_id } = req.body;
    if (!digit || !'0123456789*#'.includes(digit)) return res.status(400).json({ error: 'Digit DTMF invalide' });

    let controlId = call_control_id;
    if (!controlId && call_id) {
      const call = await Call.findByPk(call_id);
      if (call && call.notes) { try { const notes = JSON.parse(call.notes); controlId = notes.call_control_id; } catch (e) {} }
    }

    if (!controlId) {
      const activeCall = await Call.findOne({ where: { user_id: req.user.id, status: { [Op.in]: ['ringing', 'answered'] } }, order: [['start_time', 'DESC']] });
      if (activeCall && activeCall.notes) { try { const notes = JSON.parse(activeCall.notes); controlId = notes.call_control_id; } catch (e) {} }
    }

    if (controlId && TELNYX_API_KEY) {
      try { await telnyxRequest('/calls/' + controlId + '/actions/send_dtmf', 'POST', { digits: digit, duration_millis: 250 }); console.log('DTMF sent via Telnyx:', digit); }
      catch (e) { console.error('Telnyx DTMF send error:', e.message); }
    }

    console.log('DTMF digit sent:', digit, 'by user', req.user.id);
    res.json({ success: true, digit, sent_via_telnyx: !!controlId });
  } catch (error) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /calls/webhook - Telnyx webhook handler
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const eventType = body.data && body.data.event_type || body.event_type;
    const payload = body.data && body.data.payload || body.payload || body;
    console.log('Telnyx webhook:', eventType, JSON.stringify(payload).substring(0, 300));

    const callControlId = payload && payload.call_control_id;
    let call = null;
    if (callControlId) {
      const calls = await Call.findAll({ where: { status: { [Op.in]: ['ringing', 'answered', 'failed'] } }, order: [['start_time', 'DESC']], limit: 50 });
      for (const c of calls) { try { const notes = JSON.parse(c.notes || '{}'); if (notes.call_control_id === callControlId) { call = c; break; } } catch (e) {} }
    }

    switch (eventType) {
      case 'call.initiated': console.log('Call initiated:', callControlId); break;

      case 'call.answered':
        console.log('Call answered:', callControlId);
        if (call) { await call.update({ status: 'answered' }); if (global.wss) { const msg = JSON.stringify({ type: 'call_answered', call_id: call.id, call_control_id: callControlId }); global.wss.clients.forEach(ws => { if (ws.readyState === 1 && ws.userId === call.user_id) ws.send(msg); }); } }
        if (callControlId && TELNYX_API_KEY) { try { await telnyxRequest('/calls/' + callControlId + '/actions/gather', 'POST', { minimum_digits: 1, maximum_digits: 20, timeout_millis: 60000, inter_digit_timeout_millis: 10000, valid_digits: '0123456789*#' }); } catch (e) { console.error('Enable DTMF gather error:', e.message); } }
        break;

      case 'call.dtmf.received':
        var digit = payload && payload.digit;
        console.log('DTMF received:', digit, 'on call', callControlId);
        if (digit && global.wss) { const msg = JSON.stringify({ type: 'dtmf_received', digit: digit, call_id: call && call.id, call_control_id: callControlId, from: 'callee', timestamp: new Date().toISOString() });
          if (call) { global.wss.clients.forEach(ws => { if (ws.readyState === 1 && ws.userId === call.user_id) ws.send(msg); }); } else { global.wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); }); } }
        if (callControlId && TELNYX_API_KEY) { try { await telnyxRequest('/calls/' + callControlId + '/actions/gather', 'POST', { minimum_digits: 1, maximum_digits: 20, timeout_millis: 60000, inter_digit_timeout_millis: 10000, valid_digits: '0123456789*#' }); } catch (e) {} }
        break;

      case 'call.gather.ended':
        var digits = payload && payload.digits;
        console.log('Gather ended: digits=' + digits);
        if (digits && global.wss) { for (var i = 0; i < digits.length; i++) { const msg = JSON.stringify({ type: 'dtmf_received', digit: digits[i], call_id: call && call.id, from: 'callee', timestamp: new Date().toISOString() });
          if (call) { global.wss.clients.forEach(ws => { if (ws.readyState === 1 && ws.userId === call.user_id) ws.send(msg); }); } else { global.wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); }); } } }
        if (callControlId && TELNYX_API_KEY) { try { await telnyxRequest('/calls/' + callControlId + '/actions/gather', 'POST', { minimum_digits: 1, maximum_digits: 20, timeout_millis: 60000, inter_digit_timeout_millis: 10000, valid_digits: '0123456789*#' }); } catch (e) {} }
        break;

      case 'call.hangup':
        console.log('Call hangup:', callControlId, 'reason:', payload && payload.hangup_cause);
        if (call && call.status !== 'completed') {
          const endTime = new Date();
          const duration = Math.max(1, Math.ceil((endTime - new Date(call.start_time)) / 1000));
          const pricing = getPricing(); const billableMinutes = Math.ceil(duration / pricing.billing_increment); const cost = Math.max(pricing.minimum_charge, billableMinutes * pricing.cost_per_minute);
          await call.update({ end_time: endTime, duration, cost, status: 'completed' });
          const user = await User.findByPk(call.user_id);
          if (user) { const newBalance = parseFloat(user.credits) - cost; await user.update({ credits: Math.max(0, newBalance) });
            await CreditTransaction.create({ user_id: call.user_id, amount: -cost, type: 'deduction', description: 'Appel vers ' + call.called_number + ' (' + duration + 's)', call_id: call.id, balance_after: Math.max(0, newBalance) }); }
          await AgentStatus.upsert({ user_id: call.user_id, status: 'available', last_update: new Date() });
          if (global.wss) { const msg = JSON.stringify({ type: 'call_ended', call_id: call.id, duration, cost, reason: payload && payload.hangup_cause }); global.wss.clients.forEach(ws => { if (ws.readyState === 1 && ws.userId === call.user_id) ws.send(msg); }); }
        }
        break;

      case 'call.machine.detection.ended':
        console.log('AMD result:', payload && payload.result);
        if (call && global.wss) { const msg = JSON.stringify({ type: 'amd_result', call_id: call.id, result: payload && payload.result }); global.wss.clients.forEach(ws => { if (ws.readyState === 1 && ws.userId === call.user_id) ws.send(msg); }); }
        break;

      default: console.log('Unhandled Telnyx event:', eventType);
    }

    res.json({ status: 'received' });
  } catch (error) { console.error('Webhook error:', error); res.status(500).json({ error: 'Webhook error' }); }
});

// GET /calls
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, direction, status, user_id } = req.query;
    const where = {};
    if (req.user.role !== 'admin') where.user_id = req.user.id;
    else if (user_id) where.user_id = user_id;
    if (direction) where.direction = direction;
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Call.findAndCountAll({ where, include: [{ model: User, attributes: ['id', 'username'] }, { model: Client, attributes: ['id', 'name', 'phone_number'] }], limit: parseInt(limit), offset, order: [['start_time', 'DESC']] });
    res.json({ calls: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (error) { console.error('Get calls error:', error); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /calls/stats/summary
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.user.role !== 'admin') where.user_id = req.user.id;
    const totalCalls = await Call.count({ where });
    const totalDuration = await Call.sum('duration', { where }) || 0;
    const totalCost = await Call.sum('cost', { where }) || 0;
    const inboundCalls = await Call.count({ where: { ...where, direction: 'inbound' } });
    const outboundCalls = await Call.count({ where: { ...where, direction: 'outbound' } });
    const answeredCalls = await Call.count({ where: { ...where, status: 'completed' } });
    const missedCalls = await Call.count({ where: { ...where, status: 'missed' } });
    res.json({ totalCalls, totalDuration, totalCost: parseFloat(totalCost).toFixed(2), inboundCalls, outboundCalls, answeredCalls, missedCalls, avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0 });
  } catch (error) { console.error('Stats error:', error); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /calls/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const call = await Call.findByPk(req.params.id, { include: [{ model: User, attributes: ['id', 'username'] }, { model: Client }] });
    if (!call) return res.status(404).json({ error: 'Appel non trouve' });
    res.json(call);
  } catch (error) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
