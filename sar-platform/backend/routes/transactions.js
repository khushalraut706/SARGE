const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const { analyzeTransaction, analyzeBatch } = require('../services/fraudDetection');

const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(csv|json)$/i)) {
      return cb(new Error('Only CSV and JSON files are allowed'));
    }
    cb(null, true);
  }
});

// Upload CSV transactions
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const content = fs.readFileSync(req.file.path, 'utf8');
    let rawData = [];

    if (req.file.originalname.endsWith('.json')) {
      rawData = JSON.parse(content);
      if (!Array.isArray(rawData)) rawData = [rawData];
    } else {
      rawData = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    }

    if (!rawData.length) return res.status(400).json({ error: 'File contains no data.' });

    const batchId = uuidv4();
    const txnDocs = rawData.map(row => ({
      uploadedBy: req.user._id,
      batchId,
      transactionId: row.transaction_id || row.transactionId || uuidv4(),
      date: new Date(row.date || row.Date || Date.now()),
      amount: parseFloat(row.amount || row.Amount || 0),
      currency: row.currency || 'USD',
      type: (row.type || row.Type || 'other').toLowerCase(),
      senderName: row.sender_name || row.senderName || '',
      senderAccount: row.sender_account || row.senderAccount || '',
      senderBank: row.sender_bank || row.senderBank || '',
      senderCountry: row.sender_country || row.senderCountry || 'US',
      receiverName: row.receiver_name || row.receiverName || '',
      receiverAccount: row.receiver_account || row.receiverAccount || '',
      receiverBank: row.receiver_bank || row.receiverBank || '',
      receiverCountry: row.receiver_country || row.receiverCountry || '',
      description: row.description || row.Description || '',
      channel: (row.channel || 'online').toLowerCase(),
      ipAddress: row.ip_address || row.ipAddress || '',
      location: row.location || '',
    }));

    const savedTxns = await Transaction.insertMany(txnDocs);

    // Run batch analysis
    const analysisResults = analyzeBatch(savedTxns.map(t => t.toObject()));
    const bulkOps = analysisResults.map(r => ({
      updateOne: {
        filter: { transactionId: r.transactionId },
        update: {
          $set: {
            riskScore: r.riskScore,
            riskLevel: r.riskLevel,
            riskFlags: r.riskFlags,
            anomalyScore: r.anomalyScore,
            status: r.riskScore >= 50 ? 'flagged' : 'analyzed',
            analysisComplete: true
          }
        }
      }
    }));
    await Transaction.bulkWrite(bulkOps);

    const flagged = analysisResults.filter(r => r.riskScore >= 50).length;
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      message: `Successfully processed ${savedTxns.length} transactions`,
      batchId,
      summary: {
        total: savedTxns.length,
        flagged,
        highRisk: analysisResults.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical').length,
        avgRiskScore: Math.round(analysisResults.reduce((s, r) => s + r.riskScore, 0) / analysisResults.length)
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit transactions manually
router.post('/manual', auth, async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions) || !transactions.length) {
      return res.status(400).json({ error: 'Provide an array of transactions.' });
    }

    const batchId = uuidv4();
    const allExisting = await Transaction.find({ uploadedBy: req.user._id }).lean();

    const txnDocs = transactions.map(t => ({
      ...t,
      uploadedBy: req.user._id,
      batchId,
      transactionId: t.transactionId || uuidv4(),
      date: new Date(t.date || Date.now()),
      amount: parseFloat(t.amount || 0),
    }));

    const saved = await Transaction.insertMany(txnDocs);
    const allForAnalysis = [...allExisting, ...saved.map(t => t.toObject())];
    const results = analyzeBatch(allForAnalysis);
    const newResults = results.filter(r => saved.some(s => s.transactionId === r.transactionId));

    const bulkOps = newResults.map(r => ({
      updateOne: {
        filter: { transactionId: r.transactionId },
        update: {
          $set: {
            riskScore: r.riskScore, riskLevel: r.riskLevel,
            riskFlags: r.riskFlags, anomalyScore: r.anomalyScore,
            status: r.riskScore >= 50 ? 'flagged' : 'analyzed',
            analysisComplete: true
          }
        }
      }
    }));
    await Transaction.bulkWrite(bulkOps);

    res.json({ batchId, results: newResults, total: saved.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all transactions for current user
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, riskLevel, batchId, sort = '-date' } = req.query;
    const filter = { uploadedBy: req.user._id };
    if (status) filter.status = status;
    if (riskLevel) filter.riskLevel = riskLevel;
    if (batchId) filter.batchId = batchId;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort(sort).skip((page-1)*limit).limit(Number(limit)).lean(),
      Transaction.countDocuments(filter)
    ]);

    res.json({ transactions, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single transaction
router.get('/:id', auth, async (req, res) => {
  try {
    const tx = await Transaction.findOne({ _id: req.params.id, uploadedBy: req.user._id });
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get batch summary
router.get('/batch/:batchId', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ batchId: req.params.batchId, uploadedBy: req.user._id }).lean();
    if (!transactions.length) return res.status(404).json({ error: 'Batch not found.' });

    const flagged = transactions.filter(t => t.riskScore >= 50);
    res.json({
      batchId: req.params.batchId,
      total: transactions.length,
      flagged: flagged.length,
      avgRiskScore: Math.round(transactions.reduce((s, t) => s + t.riskScore, 0) / transactions.length),
      maxRiskScore: Math.max(...transactions.map(t => t.riskScore)),
      transactions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
