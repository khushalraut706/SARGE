const express = require('express');
const Transaction = require('../models/Transaction');
const SAR = require('../models/SAR');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const filter = req.user.role === 'analyst' ? { uploadedBy: userId } : {};
    const sarFilter = req.user.role === 'analyst' ? { generatedBy: userId } : {};

    const [
      totalTxns, flaggedTxns, totalSARs, pendingSARs, filedSARs,
      riskDist, recentSARs, riskTrend
    ] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.countDocuments({ ...filter, status: 'flagged' }),
      SAR.countDocuments(sarFilter),
      SAR.countDocuments({ ...sarFilter, status: { $in: ['draft', 'review'] } }),
      SAR.countDocuments({ ...sarFilter, status: 'filed' }),
      Transaction.aggregate([
        { $match: filter },
        { $group: { _id: '$riskLevel', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
      ]),
      SAR.find(sarFilter).populate('generatedBy', 'name').sort('-createdAt').limit(5).lean(),
      Transaction.aggregate([
        { $match: filter },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          count: { $sum: 1 },
          avgRisk: { $avg: '$riskScore' },
          totalAmount: { $sum: '$amount' }
        }},
        { $sort: { _id: -1 } },
        { $limit: 30 }
      ])
    ]);

    res.json({
      overview: { totalTxns, flaggedTxns, totalSARs, pendingSARs, filedSARs, flagRate: totalTxns > 0 ? ((flaggedTxns / totalTxns) * 100).toFixed(1) : 0 },
      riskDistribution: riskDist,
      recentSARs,
      riskTrend: riskTrend.reverse()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
