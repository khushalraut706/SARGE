const mongoose = require('mongoose');

const sarSchema = new mongoose.Schema({
  sarNumber: { type: String, unique: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  batchId: { type: String, required: true },
  transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
  
  // Subject info
  subjectInfo: {
    name: String,
    accountNumbers: [String],
    identifiers: [String],
    entityType: { type: String, enum: ['individual', 'business', 'unknown'], default: 'individual' },
    primaryBank: String,
    country: String,
  },
  
  // Risk summary
  riskSummary: {
    overallScore: { type: Number, min: 0, max: 100 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    primaryFlags: [String],
    totalAmount: Number,
    transactionCount: Number,
    dateRange: { start: Date, end: Date },
    flaggedCount: Number,
  },
  
  // Detected patterns
  detectedPatterns: [{
    patternType: String,
    description: String,
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    evidence: [String],
    ruleTriggered: String,
  }],
  
  // AI-generated narrative sections
  narrative: {
    introduction: String,
    observedBehavior: String,
    suspiciousPatterns: String,
    conclusion: String,
    fullNarrative: String,
  },
  
  // Metadata
  filingInstitution: {
    name: { type: String, default: 'First National Bank' },
    ein: { type: String, default: '12-3456789' },
    address: { type: String, default: '100 Main Street, New York, NY 10001' },
    contact: String,
  },
  
  status: { type: String, enum: ['draft', 'review', 'approved', 'filed', 'rejected'], default: 'draft' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  filedAt: Date,
  comments: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, text: String, createdAt: { type: Date, default: Date.now } }],
  
  generationTimeMs: Number,
  modelVersion: { type: String, default: '1.0.0' },
}, { timestamps: true });

sarSchema.pre('save', async function(next) {
  if (!this.sarNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('SAR').countDocuments();
    this.sarNumber = `SAR-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.model('SAR', sarSchema);
