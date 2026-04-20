const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  batchId: { type: String, required: true },
  
  // Core transaction fields
  transactionId: { type: String, required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  type: { type: String, enum: ['deposit', 'withdrawal', 'transfer', 'wire', 'cash', 'check', 'crypto', 'other'], required: true },
  
  // Party info
  senderName: { type: String },
  senderAccount: { type: String },
  senderBank: { type: String },
  senderCountry: { type: String, default: 'US' },
  receiverName: { type: String },
  receiverAccount: { type: String },
  receiverBank: { type: String },
  receiverCountry: { type: String },
  
  // Context
  description: { type: String },
  channel: { type: String, enum: ['branch', 'online', 'mobile', 'atm', 'wire', 'crypto'], default: 'online' },
  ipAddress: { type: String },
  deviceId: { type: String },
  location: { type: String },
  
  // Risk assessment (computed)
  riskScore: { type: Number, default: 0, min: 0, max: 100 },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  riskFlags: [{ type: String }],
  anomalyScore: { type: Number, default: 0 },
  
  // Status
  status: { type: String, enum: ['pending', 'analyzed', 'flagged', 'cleared', 'reported'], default: 'pending' },
  analysisComplete: { type: Boolean, default: false },
}, { timestamps: true });

transactionSchema.index({ batchId: 1 });
transactionSchema.index({ riskScore: -1 });
transactionSchema.index({ date: -1 });
transactionSchema.index({ senderAccount: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
