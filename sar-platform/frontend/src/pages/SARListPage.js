import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { sarAPI } from '../services/api';
import { FileText, Download, Eye, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const RISK_COLORS = { critical: 'var(--danger)', high: 'var(--warning)', medium: 'var(--gold)', low: 'var(--success)' };

export default function SARListPage() {
  const [sars, setSars] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', riskLevel: '' });
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sarAPI.list(filters);
      setSars(res.data.sars);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleDownloadPDF = async (sar) => {
    setDownloading(sar._id);
    try {
      await sarAPI.downloadPDF(sar._id, `${sar.sarNumber}.pdf`);
      toast.success('PDF downloaded');
    } catch { toast.error('Download failed'); }
    finally { setDownloading(null); }
  };

  const handleDownloadText = async (sar) => {
    try {
      await sarAPI.downloadText(sar._id, `${sar.sarNumber}.txt`);
      toast.success('Text file downloaded');
    } catch { toast.error('Download failed'); }
  };

  const updateStatus = async (id, status) => {
    try {
      await sarAPI.update(id, { status });
      setSars(prev => prev.map(s => s._id === id ? { ...s, status } : s));
      toast.success(`Status updated to ${status}`);
    } catch { toast.error('Update failed'); }
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">SAR Reports</div>
            <div className="page-subtitle">{total} report{total !== 1 ? 's' : ''} generated</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="page-body">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <select className="form-select" style={{ width: 180 }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>
              {['draft','review','approved','filed','rejected'].map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="form-select" style={{ width: 180 }} value={filters.riskLevel} onChange={e => setFilters(f => ({ ...f, riskLevel: e.target.value }))}>
              <option value="">All Risk Levels</option>
              {['critical','high','medium','low'].map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          {loading ? (
            <div className="loading-overlay"><div className="spinner" style={{ width: 24, height: 24 }} /></div>
          ) : sars.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-title">No SAR reports yet</div>
              <div className="empty-text">Upload transactions and run fraud analysis to generate your first SAR.</div>
              <Link to="/upload" className="btn btn-primary"><FileText size={14} /> Start Analysis</Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SAR Number</th>
                    <th>Subject</th>
                    <th>Risk Level</th>
                    <th>Score</th>
                    <th>Total Amount</th>
                    <th>Patterns</th>
                    <th>Status</th>
                    <th>Generated</th>
                    <th>By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sars.map(sar => (
                    <tr key={sar._id}>
                      <td>
                        <span className="text-mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{sar.sarNumber}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>{sar.subjectInfo?.name || '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{sar.subjectInfo?.entityType}</div>
                      </td>
                      <td><span className={`risk-badge ${sar.riskSummary?.riskLevel}`}>{sar.riskSummary?.riskLevel}</span></td>
                      <td>
                        <div className="risk-bar-wrap">
                          <div className="risk-bar">
                            <div className="risk-bar-fill" style={{ width: `${sar.riskSummary?.overallScore || 0}%`, background: RISK_COLORS[sar.riskSummary?.riskLevel] }} />
                          </div>
                          <span className="risk-score-num" style={{ color: RISK_COLORS[sar.riskSummary?.riskLevel] }}>{sar.riskSummary?.overallScore}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>${(sar.riskSummary?.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sar.detectedPatterns?.length || 0} pattern{sar.detectedPatterns?.length !== 1 ? 's' : ''}</td>
                      <td>
                        <select
                          className="form-select"
                          style={{ padding: '4px 8px', fontSize: 11, width: 100 }}
                          value={sar.status}
                          onChange={e => updateStatus(sar._id, e.target.value)}
                        >
                          {['draft','review','approved','filed','rejected'].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {sar.createdAt ? format(new Date(sar.createdAt), 'MMM d, yyyy') : '—'}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {sar.generationTimeMs ? `${(sar.generationTimeMs/1000).toFixed(1)}s` : ''}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sar.generatedBy?.name || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Link to={`/sar/${sar._id}`} className="btn btn-ghost btn-sm" title="View"><Eye size={13} /></Link>
                          <button className="btn btn-ghost btn-sm" title="Download PDF"
                            onClick={() => handleDownloadPDF(sar)} disabled={downloading === sar._id}>
                            {downloading === sar._id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Download size={13} />}
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Download TXT" onClick={() => handleDownloadText(sar)}>
                            <FileText size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
