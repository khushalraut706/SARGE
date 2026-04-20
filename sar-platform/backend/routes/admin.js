const express = require('express');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SAR = require('../models/SAR');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get all users
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find().sort('-createdAt').lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user role/status
router.patch('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { role, isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { role, isActive }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System stats
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const [users, transactions, sars, topAnalysts] = await Promise.all([
      User.countDocuments(),
      Transaction.countDocuments(),
      SAR.countDocuments(),
      User.find().sort('-reportsGenerated').limit(5).select('name email reportsGenerated role').lean()
    ]);

    const sarsByStatus = await SAR.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const avgGenTime = await SAR.aggregate([
      { $group: { _id: null, avg: { $avg: '$generationTimeMs' } } }
    ]);

    res.json({
      users, transactions, sars,
      sarsByStatus,
      avgGenerationTimeMs: avgGenTime[0]?.avg || 0,
      topAnalysts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All SARs (admin)
router.get('/sars', auth, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = status ? { status } : {};
    const [sars, total] = await Promise.all([
      SAR.find(filter).populate('generatedBy', 'name email').sort('-createdAt').skip((page-1)*limit).limit(Number(limit)).lean(),
      SAR.countDocuments(filter)
    ]);
    res.json({ sars, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
