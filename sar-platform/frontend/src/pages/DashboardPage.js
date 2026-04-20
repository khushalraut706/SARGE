import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { dashboardAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { TrendingUp, FileText, AlertTriangle, CheckCircle, Clock, ArrowRight, Zap } from 'lucide-react';
import { format } from 'date-fns';

const RISK_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e' };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--accent)' }}>{p.name}: <strong>{typeof p.value === 'number' && p.value > 100 ? `$${p.value.toLocaleString()}` : p.value}</strong></div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.stats().then(res => setStats(res.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div>
      <div className="page-header"><div className="page-title">Dashboard</div></div>
      <div className="loading-overlay"><div className="spinner" style={{ width: 28, height: 28 }} /><div className="loading-text">Loading analytics...</div></div>
    </div>
  );

  const ov = stats?.overview || {};
  const riskDist = (stats?.riskDistribution || []).map(r => ({ name: r._id, value: r.count, amount: r.totalAmount }));
  const trend = (stats?.riskTrend || []).slice(-14).map(t => ({ date: t._id ? format(new Date(t._id), 'MM/dd') : '', count: t.count, risk: Math.round(t.avgRisk || 0) }));

  const statCards = [
    { label: 'Total Transactions', value: ov.totalTxns || 0, color: 'accent', icon: <TrendingUp size={18} />, meta: 'All time' },
    { label: 'Flagged Suspicious', value: ov.flaggedTxns || 0, color: 'danger', icon: <AlertTriangle size={18} />, meta: `${ov.flagRate || 0}% flag rate` },
    { label: 'SARs Generated', value: ov.totalSARs || 0, color: 'gold', icon: <FileText size={18} />, meta: `${ov.filedSARs || 0} filed` },
    { label: 'Pending Review', value: ov.pendingSARs || 0, color: 'warning', icon: <Clock size={18} />, meta: 'Awaiting action' },
    { label: 'Reports Filed', value: ov.filedSARs || 0, color: 'success', icon: <CheckCircle size={18} />, meta: 'With FinCEN' },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Dashboard</div>
            <div className="page-subtitle">Welcome back, {user?.name} · {user?.department}</div>
          </div>
          <div className="flex gap-2">
            <Link to="/upload" className="btn btn-primary"><Zap size={14} /> Analyze Transactions</Link>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          {statCards.map(card => (
            <div key={card.label} className={`stat-card ${card.color}`}>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <div className="stat-label">{card.label}</div>
                <div style={{ color: `var(--${card.color})`, opacity: 0.7 }}>{card.icon}</div>
              </div>
              <div className="stat-value" style={{ color: `var(--${card.color})` }}>{card.value.toLocaleString()}</div>
              <div className="stat-meta">{card.meta}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {/* Risk trend */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Transaction Risk Trend</div>
                <div className="card-subtitle">Average risk score over 14 days</div>
              </div>
            </div>
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend}>
                  <XAxis dataKey="date" tick={{ fill: '#4a5568', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#4a5568', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="risk" stroke="var(--accent)" strokeWidth={2} dot={false} name="Avg Risk Score" />
                  <Line type="monotone" dataKey="count" stroke="var(--gold)" strokeWidth={2} dot={false} name="Transaction Count" />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="empty-state" style={{ padding: 40 }}><div className="empty-text">No trend data yet</div></div>}
          </div>

          {/* Risk distribution */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Risk Distribution</div>
                <div className="card-subtitle">Transactions by risk level</div>
              </div>
            </div>
            {riskDist.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <ResponsiveContainer width="60%" height={200}>
                  <PieChart>
                    <Pie data={riskDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {riskDist.map((entry, i) => (
                        <Cell key={i} fill={RISK_COLORS[entry.name] || '#888'} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1 }}>
                  {riskDist.map(r => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: RISK_COLORS[r.name] || '#888', flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 12, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{r.name}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{r.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="empty-state" style={{ padding: 40 }}><div className="empty-text">No data yet</div></div>}
          </div>
        </div>

        {/* Recent SARs */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent SAR Reports</div>
              <div className="card-subtitle">Latest generated reports</div>
            </div>
            <Link to="/sar" className="btn btn-secondary btn-sm">View All <ArrowRight size={13} /></Link>
          </div>
          {stats?.recentSARs?.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SAR Number</th>
                    <th>Subject</th>
                    <th>Risk</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Generated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSARs.map(sar => (
                    <tr key={sar._id}>
                      <td><span className="text-mono" style={{ fontSize: 12 }}>{sar.sarNumber}</span></td>
                      <td>{sar.subjectInfo?.name || '—'}</td>
                      <td><span className={`risk-badge ${sar.riskSummary?.riskLevel}`}>{sar.riskSummary?.riskLevel}</span></td>
                      <td>
                        <div className="risk-bar-wrap">
                          <div className="risk-bar">
                            <div className="risk-bar-fill" style={{
                              width: `${sar.riskSummary?.overallScore || 0}%`,
                              background: RISK_COLORS[sar.riskSummary?.riskLevel] || 'var(--accent)'
                            }} />
                          </div>
                          <span className="risk-score-num">{sar.riskSummary?.overallScore}</span>
                        </div>
                      </td>
                      <td><span className={`status-badge ${sar.status}`}>{sar.status}</span></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{sar.createdAt ? format(new Date(sar.createdAt), 'MMM d, yyyy') : '—'}</td>
                      <td><Link to={`/sar/${sar._id}`} className="btn btn-ghost btn-sm">View <ArrowRight size={12} /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-title">No reports yet</div>
              <div className="empty-text">Upload transaction data to generate your first SAR.</div>
              <Link to="/upload" className="btn btn-primary">Upload Transactions</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
