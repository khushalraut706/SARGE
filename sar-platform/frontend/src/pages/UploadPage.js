import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { transactionsAPI, sarAPI } from '../services/api';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Zap, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const TRANSACTION_TYPES = ['deposit', 'withdrawal', 'transfer', 'wire', 'cash', 'check', 'crypto', 'other'];
const CHANNELS = ['branch', 'online', 'mobile', 'atm', 'wire', 'crypto'];

const blankTx = () => ({
  transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
  date: new Date().toISOString().slice(0, 16),
  amount: '', type: 'transfer', currency: 'USD',
  senderName: '', senderAccount: '', senderBank: '', senderCountry: 'US',
  receiverName: '', receiverAccount: '', receiverBank: '', receiverCountry: '',
  description: '', channel: 'online',
});

export default function UploadPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('upload'); // 'upload' | 'manual'
  const [uploadResult, setUploadResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [transactions, setTransactions] = useState([blankTx()]);
  const [subjectName, setSubjectName] = useState('');
  const [entityType, setEntityType] = useState('individual');

  const onDrop = useCallback(async (files) => {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await transactionsAPI.upload(fd);
      setUploadResult(res.data);
      toast.success(`Processed ${res.data.summary.total} transactions — ${res.data.summary.flagged} flagged`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'], 'application/json': ['.json'] }, maxFiles: 1
  });

  const handleManualSubmit = async () => {
    const valid = transactions.filter(t => t.amount && parseFloat(t.amount) > 0);
    if (!valid.length) { toast.error('Add at least one transaction with a valid amount'); return; }
    setLoading(true);
    try {
      const res = await transactionsAPI.manual({
        transactions: valid.map(t => ({ ...t, amount: parseFloat(t.amount) }))
      });
      setUploadResult({ batchId: res.data.batchId, summary: { total: valid.length, flagged: res.data.results.filter(r => r.riskScore >= 50).length, highRisk: res.data.results.filter(r => ['high','critical'].includes(r.riskLevel)).length, avgRiskScore: Math.round(res.data.results.reduce((s,r) => s + r.riskScore, 0) / res.data.results.length) } });
      toast.success('Transactions analyzed successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const generateSAR = async () => {
    if (!uploadResult?.batchId) return;
    setGenLoading(true);
    try {
      const res = await sarAPI.generate({
        batchId: uploadResult.batchId,
        subjectInfo: { name: subjectName || 'Unknown Subject', entityType },
      });
      toast.success(`SAR ${res.data.sar.sarNumber} generated in ${(res.data.generationTimeMs / 1000).toFixed(1)}s`);
      navigate(`/sar/${res.data.sar._id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'SAR generation failed');
    } finally {
      setGenLoading(false);
    }
  };

  const addTx = () => setTransactions(p => [...p, blankTx()]);
  const removeTx = (i) => setTransactions(p => p.filter((_, idx) => idx !== i));
  const updateTx = (i, key, val) => setTransactions(p => p.map((t, idx) => idx === i ? { ...t, [key]: val } : t));

  const riskColor = (score) => score >= 75 ? 'var(--danger)' : score >= 50 ? 'var(--warning)' : score >= 25 ? 'var(--gold)' : 'var(--success)';

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Analyze Transactions</div>
        <div className="page-subtitle">Upload a CSV file or enter transactions manually to detect suspicious activity</div>
      </div>

      <div className="page-body">
        {/* Mode tabs */}
        <div className="tabs">
          <button className={`tab${mode === 'upload' ? ' active' : ''}`} onClick={() => { setMode('upload'); setUploadResult(null); }}>
            📁 CSV Upload
          </button>
          <button className={`tab${mode === 'manual' ? ' active' : ''}`} onClick={() => { setMode('manual'); setUploadResult(null); }}>
            ✏️ Manual Entry
          </button>
        </div>

        {!uploadResult ? (
          mode === 'upload' ? (
            <div className="card">
              <div className="card-header">
                <div><div className="card-title">Upload Transaction File</div><div className="card-subtitle">CSV or JSON format · Max 10MB · See sample format below</div></div>
              </div>

              <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`}>
                <input {...getInputProps()} />
                {loading ? (
                  <><div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 16px' }} /><div className="dropzone-text">Analyzing transactions...</div><div className="dropzone-sub">Running fraud detection algorithms</div></>
                ) : (
                  <><div className="dropzone-icon">📊</div><div className="dropzone-text">{isDragActive ? 'Drop your file here' : 'Drag & drop your CSV or JSON file'}</div><div className="dropzone-sub">or click to browse · Supports .csv and .json</div></>
                )}
              </div>

              {/* Sample CSV format */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Required CSV Columns:</div>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', overflowX: 'auto' }}>
                  transaction_id, date, amount, type, sender_name, sender_account, sender_bank, sender_country, receiver_name, receiver_account, receiver_bank, receiver_country, description, channel
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                  type: deposit | withdrawal | transfer | wire | cash | check | crypto | other<br />
                  channel: branch | online | mobile | atm | wire | crypto<br />
                  date format: YYYY-MM-DD or ISO 8601
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div><div className="card-title">Manual Transaction Entry</div><div className="card-subtitle">Enter transactions one by one for analysis</div></div>
                <button className="btn btn-secondary btn-sm" onClick={addTx}><Plus size={14} /> Add Row</button>
              </div>

              {transactions.map((tx, i) => (
                <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--border)' }}>
                  <div className="flex-between" style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Transaction #{i + 1}</span>
                    {transactions.length > 1 && <button className="btn btn-danger btn-sm" onClick={() => removeTx(i)}><Trash2 size={13} /></button>}
                  </div>
                  <div className="grid-3" style={{ gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Date & Time</label>
                      <input className="form-input" type="datetime-local" value={tx.date} onChange={e => updateTx(i, 'date', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Amount (USD)</label>
                      <input className="form-input" type="number" placeholder="0.00" value={tx.amount} onChange={e => updateTx(i, 'amount', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Type</label>
                      <select className="form-select" value={tx.type} onChange={e => updateTx(i, 'type', e.target.value)}>
                        {TRANSACTION_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Sender Name</label>
                      <input className="form-input" placeholder="John Doe" value={tx.senderName} onChange={e => updateTx(i, 'senderName', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Sender Account</label>
                      <input className="form-input" placeholder="****1234" value={tx.senderAccount} onChange={e => updateTx(i, 'senderAccount', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Sender Country</label>
                      <input className="form-input" placeholder="US" value={tx.senderCountry} onChange={e => updateTx(i, 'senderCountry', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Receiver Name</label>
                      <input className="form-input" placeholder="Jane Corp" value={tx.receiverName} onChange={e => updateTx(i, 'receiverName', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Receiver Country</label>
                      <input className="form-input" placeholder="US" value={tx.receiverCountry} onChange={e => updateTx(i, 'receiverCountry', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Channel</label>
                      <select className="form-select" value={tx.channel} onChange={e => updateTx(i, 'channel', e.target.value)}>
                        {CHANNELS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
                    <label className="form-label">Description</label>
                    <input className="form-input" placeholder="Payment memo / notes" value={tx.description} onChange={e => updateTx(i, 'description', e.target.value)} />
                  </div>
                </div>
              ))}

              <button className="btn btn-primary" onClick={handleManualSubmit} disabled={loading} style={{ marginTop: 8 }}>
                {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analyzing...</> : <><Zap size={14} /> Run Fraud Analysis</>}
              </button>
            </div>
          )
        ) : (
          /* Results panel */
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="flex-between" style={{ marginBottom: 20 }}>
                <div>
                  <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle size={18} color="var(--success)" /> Analysis Complete
                  </div>
                  <div className="card-subtitle" style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>Batch: {uploadResult.batchId}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setUploadResult(null)}>← Upload New</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Total Transactions', value: uploadResult.summary.total, color: 'var(--accent)' },
                  { label: 'Flagged Suspicious', value: uploadResult.summary.flagged, color: 'var(--danger)' },
                  { label: 'High Risk', value: uploadResult.summary.highRisk, color: 'var(--warning)' },
                  { label: 'Avg Risk Score', value: `${uploadResult.summary.avgRiskScore}/100`, color: riskColor(uploadResult.summary.avgRiskScore) },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {uploadResult.summary.flagged > 0 ? (
                <>
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <AlertTriangle size={16} color="var(--danger)" />
                      <span style={{ fontWeight: 600, color: 'var(--danger)' }}>Suspicious Activity Detected</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {uploadResult.summary.flagged} transaction(s) flagged. Generate a SAR report to document findings for regulatory filing.
                    </p>
                  </div>

                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>SAR Subject Information</div>
                    <div className="grid-2">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Subject Name / Entity</label>
                        <input className="form-input" placeholder="Full name or business name" value={subjectName} onChange={e => setSubjectName(e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Entity Type</label>
                        <select className="form-select" value={entityType} onChange={e => setEntityType(e.target.value)}>
                          <option value="individual">Individual</option>
                          <option value="business">Business</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button className="btn btn-primary btn-lg" onClick={generateSAR} disabled={genLoading}>
                    {genLoading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Generating SAR Narrative...</> : <><Zap size={16} /> Generate SAR Report</>}
                  </button>
                </>
              ) : (
                <div style={{ background: 'var(--success-dim)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: 20, textAlign: 'center' }}>
                  <CheckCircle size={32} color="var(--success)" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>No Suspicious Activity Detected</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All transactions appear within normal parameters. No SAR required.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
