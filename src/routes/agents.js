const express = require("express");
const { User, AgentStatus, Call, CallerId } = require("../models");
const { authenticate } = require("../middleware/auth");
const router = express.Router();

router.get("/caller-ids", authenticate, async (req, res) => { try { const ids = await CallerId.findAll({ where: { user_id: req.user.id } }); res.json(ids); } catch(e) { res.status(500).json({ error: "Erreur" }); } });
router.post("/caller-ids", authenticate, async (req, res) => { try { const { phone_number, label } = req.body; const c = await CallerId.create({ user_id: req.user.id, phone_number, label }); res.status(201).json(c); } catch(e) { res.status(500).json({ error: "Erreur" }); } });
router.put("/caller-ids/:id", authenticate, async (req, res) => { try { const c = await CallerId.findOne({ where: { id: req.params.id, user_id: req.user.id } }); if (!c) return res.status(404).json({ error: "Not found" }); const { phone_number, label } = req.body; if (phone_number) c.phone_number = phone_number; if (label !== undefined) c.label = label; await c.save(); res.json(c); } catch(e) { res.status(500).json({ error: "Erreur" }); } });
router.delete("/caller-ids/:id", authenticate, async (req, res) => { try { const c = await CallerId.findOne({ where: { id: req.params.id, user_id: req.user.id } }); if (!c) return res.status(404).json({ error: "Not found" }); await c.destroy(); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: "Erreur" }); } });
router.post("/status", authenticate, async (req, res) => { try { const { status } = req.body; await AgentStatus.upsert({ user_id: req.user.id, status, last_update: new Date() }); res.json({ status }); } catch(e) { res.status(500).json({ error: "Erreur" }); } });
router.get("/status", authenticate, async (req, res) => { try { const a = await AgentStatus.findAll({ include: [{ model: User, attributes: ["id","username","role"] }] }); res.json(a); } catch(e) { res.status(500).json({ error: "Erreur" }); } });

module.exports = router;
