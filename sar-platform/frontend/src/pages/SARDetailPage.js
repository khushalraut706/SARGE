import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sarAPI } from '../services/api';
import { Download, FileText, Save, ArrowLeft, AlertTriangle, Shield, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const RISK_COLORS = { critical: 'var(--danger)', high: 'var(--warning)', medium: 'var(--gold)', low: 'var(--success)' };
const SEV_COLORS = { critical: 'var(--danger)', high: 'var(--warning)', medium: 'var(--gold)', low: 'var(--success)' };

export default function SARDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sar, setSar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editNarrative, setEditNarrative] = useState({});
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    sarAPI.get(id).then(res => {
      setSar(res.data);
      setEditNarrative(res.data.narrative || {});
    }).catch(() => toast.error('Failed to load SAR')).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await sarAPI.update(id, { narrative: editNarrative });
      setSar(res.data);
      setEditing(false);
      toast.success('Narrative saved successfully');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (status) => {
    try {
      const res = await sarAPI.update(id, { status });
      setSar(res.data);
      toast.success(`Status updated to ${status}`);
    } catch { toast.error('Update failed'); }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try { await sarAPI.downloadPDF(id, `${sar.sarNumber}.pdf`); toast.success('PDF downloaded'); }
    catch { toast.error('Download failed'); }
    finally { setDownloading(false); }
  };

  if (loading) return (
    <div><div className="page-header"><div className="page-title">SAR Report</div></div>
      <div className="loading-overlay"><div className="spinner" style={{ width: 28, height: 28 }} /></div></div>
  );
  if (!sar) return <div className="page-body"><div className="alert error">SAR not found.</div></div>;

  const rs = sar.riskSummary || {};
  const riskColor = RISK_COLORS[rs.riskLevel] || 'var(--accent)';

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={20} color="var(--accent)" />
              {sar.sarNumber}
              <span className={`risk-badge ${rs.riskLevel}`}>{rs.riskLevel}</span>
              <span className={`status-badge ${sar.status}`}>{sar.status}</span>
            </div>
            <div className="page-subtitle">Generated {sar.createdAt ? format(new Date(sar.createdAt), 'MMMM d, yyyy \'at\' HH:mm') : '—'} by {sar.generatedBy?.name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editing ? (
              <>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <><div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Saving...</> : <><Save size={14} /> Save</>}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={() => setEditing(true)}>✏️ Edit Narrative</button>
                <button className="btn btn-primary" onClick={handleDownloadPDF} disabled={downloading}>
                  {downloading ? <div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <Download size={14} />} PDF
                </button>
                <button className="btn btn-secondary" onClick={() => sarAPI.downloadText(id, `${sar.sarNumber}.txt`).then(() => toast.success('Downloaded'))}>
                  <FileText size={14} /> TXT
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Risk summary banner */}
        <div style={{ background: `${riskColor}15`, border: `1px solid ${riskColor}35`, borderRadius: 12, padding: 20, marginBottom: 20, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {[
            { label: 'Risk Score', value: `${rs.overallScore}/100`, color: riskColor },
            { label: 'Total Amount', value: `$${(rs.totalAmount||0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
            { label: 'Transactions', value: rs.transactionCount || 0 },
            { label: 'Flagged', value: rs.flaggedCount || 0, color: 'var(--danger)' },
            { label: 'Patterns', value: sar.detectedPatterns?.length || 0 },
            { label: 'Gen Time', value: sar.generationTimeMs ? `${(sar.generationTimeMs/1000).toFixed(2)}s` : 'N/A', color: 'var(--success)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: item.color || 'var(--text-primary)', letterSpacing: -0.5 }}>{item.value}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Update Status</div>
            <select className="form-select" style={{ fontSize: 12 }} value={sar.status} onChange={e => handleStatusChange(e.target.value)}>
              {['draft','review','approved','filed','rejected'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {['overview', 'patterns', 'narrative', 'subject'].map(t => (
            <button key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="grid-2">
            <div className="card">
              <div className="card-header"><div className="card-title">Subject Information</div></div>
              {[
                ['Name', sar.subjectInfo?.name],
                ['Entity Type', sar.subjectInfo?.entityType],
                ['Account(s)', (sar.subjectInfo?.accountNumbers || []).join(', ')],
                ['Primary Bank', sar.subjectInfo?.primaryBank],
                ['Country', sar.subjectInfo?.country],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', gap: 12, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 100, flexShrink: 0, paddingTop: 2, fontFamily: 'var(--font-mono)' }}>{label}</div>
                  <div style={{ fontSize: 13 }}>{val || '—'}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">Filing Institution</div></div>
              {[
                ['Institution', sar.filingInstitution?.name],
                ['EIN', sar.filingInstitution?.ein],
                ['Address', sar.filingInstitution?.address],
                ['Contact', sar.filingInstitution?.contact],
                ['Filed By', sar.generatedBy?.name],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', gap: 12, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 100, flexShrink: 0, paddingTop: 2, fontFamily: 'var(--font-mono)' }}>{label}</div>
                  <div style={{ fontSize: 13 }}>{val || '—'}</div>
                </div>
              ))}
            </div>

            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-header"><div className="card-title">Risk Flags Detected</div></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(rs.primaryFlags || []).map((flag, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <AlertTriangle size={14} color="var(--warning)" style={{ marginTop: 1, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>{flag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Patterns tab */}
        {activeTab === 'patterns' && (
          <div>
            {(sar.detectedPatterns || []).length === 0 ? (
              <div className="card"><div className="empty-state"><div className="empty-text">No patterns detected</div></div></div>
            ) : (
              sar.detectedPatterns.map((p, i) => (
                <div key={i} className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${SEV_COLORS[p.severity] || '#888'}` }}>
                  <div className="flex-between" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', align: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{p.patternType}</span>
                      <span className={`risk-badge ${p.severity}`} style={{ marginLeft: 8 }}>{p.severity}</span>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{p.ruleTriggered}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 12 }}>{p.description}</p>
                  {p.evidence?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Evidence</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.evidence.map((e, j) => (
                          <span key={j} style={{ padding: '3px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{e}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Narrative tab */}
        {activeTab === 'narrative' && (
          <div className="card">
            {editing ? (
              <div>
                {[
                  { key: 'introduction', label: 'Introduction' },
                  { key: 'observedBehavior', label: 'Observed Behavior' },
                  { key: 'suspiciousPatterns', label: 'Suspicious Patterns' },
                  { key: 'conclusion', label: 'Conclusion' },
                ].map(section => (
                  <div key={section.key} className="narrative-section">
                    <h3>{section.label}</h3>
                    <textarea
                      className="form-textarea"
                      style={{ minHeight: 160, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}
                      value={editNarrative[section.key] || ''}
                      onChange={e => setEditNarrative(prev => ({ ...prev, [section.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {[
                  { key: 'introduction', label: 'Introduction' },
                  { key: 'observedBehavior', label: 'Observed Behavior' },
                  { key: 'suspiciousPatterns', label: 'Suspicious Patterns & Analysis' },
                  { key: 'conclusion', label: 'Conclusion & Certification' },
                ].map(section => (
                  <div key={section.key} className="narrative-section">
                    <h3>{section.label}</h3>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{sar.narrative?.[section.key] || 'No content.'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subject tab */}
        {activeTab === 'subject' && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Date Range of Activity</div>
            {rs.dateRange?.start && (
              <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                {format(new Date(rs.dateRange.start), 'MMM d, yyyy')} → {format(new Date(rs.dateRange.end), 'MMM d, yyyy')}
              </div>
            )}
            <div className="card-title" style={{ marginBottom: 10 }}>Account Numbers</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(sar.subjectInfo?.accountNumbers || []).map((acc, i) => (
                <span key={i} style={{ padding: '6px 14px', background: 'var(--accent-dim)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{acc}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
