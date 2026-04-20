const express = require('express');
const Transaction = require('../models/Transaction');
const SAR = require('../models/SAR');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { detectPatterns, generateNarrative } = require('../services/fraudDetection');
const { generateSARPDF } = require('../services/pdfGenerator');

const router = express.Router();

// Generate SAR from batch
router.post('/generate', auth, async (req, res) => {
  const startTime = Date.now();
  try {
    const { batchId, subjectInfo, filingInstitution } = req.body;
    if (!batchId) return res.status(400).json({ error: 'batchId is required.' });

    const transactions = await Transaction.find({
      batchId,
      uploadedBy: req.user._id,
      analysisComplete: true
    }).lean();

    if (!transactions.length) return res.status(404).json({ error: 'No analyzed transactions found for this batch.' });

    const flagged = transactions.filter(t => t.riskScore >= 25);
    if (!flagged.length) return res.status(400).json({ error: 'No suspicious transactions detected. Risk scores below threshold.' });

    // Aggregate risk data
    const totalAmount = flagged.reduce((s, t) => s + t.amount, 0);
    const allFlags = [...new Set(flagged.flatMap(t => t.riskFlags))];
    const maxScore = Math.max(...flagged.map(t => t.riskScore));
    const avgScore = Math.round(flagged.reduce((s, t) => s + t.riskScore, 0) / flagged.length);
    const overallScore = Math.round(maxScore * 0.6 + avgScore * 0.4);

    const riskLevel = overallScore >= 75 ? 'critical' : overallScore >= 50 ? 'high' : overallScore >= 25 ? 'medium' : 'low';
    const dates = flagged.map(t => new Date(t.date)).sort((a, b) => a - b);

    // Detect patterns
    const detectedPatterns = detectPatterns(flagged);

    // Build subject info
    const accounts = [...new Set(flagged.map(t => t.senderAccount).filter(Boolean))];
    const subject = {
      name: subjectInfo?.name || flagged[0]?.senderName || 'Unknown Subject',
      accountNumbers: accounts.length ? accounts : ['N/A'],
      identifiers: subjectInfo?.identifiers || [],
      entityType: subjectInfo?.entityType || 'individual',
      primaryBank: flagged[0]?.senderBank || 'Unknown',
      country: flagged[0]?.senderCountry || 'US',
    };

    const riskSummary = {
      overallScore,
      riskLevel,
      primaryFlags: allFlags.slice(0, 10),
      totalAmount,
      transactionCount: transactions.length,
      dateRange: { start: dates[0], end: dates[dates.length - 1] },
      flaggedCount: flagged.length,
    };

    const fi = {
      name: filingInstitution?.name || 'First National Bank',
      ein: filingInstitution?.ein || '12-3456789',
      address: filingInstitution?.address || '100 Main Street, New York, NY 10001',
      contact: req.user.email,
    };

    // Generate narrative
    const narrative = generateNarrative({ subjectInfo: subject, riskSummary, detectedPatterns, filingInstitution: fi });

    const sar = await SAR.create({
      generatedBy: req.user._id,
      batchId,
      transactions: flagged.map(t => t._id),
      subjectInfo: subject,
      riskSummary,
      detectedPatterns,
      narrative,
      filingInstitution: fi,
      status: 'draft',
      generationTimeMs: Date.now() - startTime,
    });

    // Update transaction status
    await Transaction.updateMany({ batchId, uploadedBy: req.user._id }, { $set: { status: 'reported' } });

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, { $inc: { reportsGenerated: 1 } });

    await sar.populate('generatedBy', 'name email');
    res.status(201).json({ sar, generationTimeMs: Date.now() - startTime });
  } catch (err) {
    console.error('SAR generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all SARs for user
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, riskLevel } = req.query;
    const filter = {};
    if (req.user.role === 'analyst') filter.generatedBy = req.user._id;
    if (status) filter.status = status;
    if (riskLevel) filter['riskSummary.riskLevel'] = riskLevel;

    const [sars, total] = await Promise.all([
      SAR.find(filter).populate('generatedBy', 'name email role')
         .sort('-createdAt').skip((page-1)*limit).limit(Number(limit)).lean(),
      SAR.countDocuments(filter)
    ]);

    res.json({ sars, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single SAR
router.get('/:id', auth, async (req, res) => {
  try {
    const sar = await SAR.findById(req.params.id).populate('generatedBy', 'name email role').populate('reviewedBy', 'name email');
    if (!sar) return res.status(404).json({ error: 'SAR not found.' });
    res.json(sar);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update SAR (review/edit narrative)
router.patch('/:id', auth, async (req, res) => {
  try {
    const { narrative, status, subjectInfo, comments } = req.body;
    const sar = await SAR.findById(req.params.id);
    if (!sar) return res.status(404).json({ error: 'SAR not found.' });

    if (narrative) sar.narrative = { ...sar.narrative, ...narrative };
    if (subjectInfo) sar.subjectInfo = { ...sar.subjectInfo, ...subjectInfo };
    if (status) {
      sar.status = status;
      if (['approved', 'filed'].includes(status)) {
        sar.reviewedBy = req.user._id;
        sar.reviewedAt = new Date();
      }
      if (status === 'filed') sar.filedAt = new Date();
    }
    if (comments) {
      sar.comments.push({ user: req.user._id, text: comments });
    }

    await sar.save();
    await sar.populate('generatedBy', 'name email');
    res.json(sar);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download SAR as PDF
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const sar = await SAR.findById(req.params.id).populate('generatedBy', 'name email').lean();
    if (!sar) return res.status(404).json({ error: 'SAR not found.' });
    generateSARPDF(sar, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download SAR as text
router.get('/:id/text', auth, async (req, res) => {
  try {
    const sar = await SAR.findById(req.params.id).lean();
    if (!sar) return res.status(404).json({ error: 'SAR not found.' });
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${sar.sarNumber}.txt"`);
    res.send(sar.narrative?.fullNarrative || 'No narrative available.');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete SAR
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await SAR.findByIdAndDelete(req.params.id);
    res.json({ message: 'SAR deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
