import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { Users, FileText, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [sars, setSars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    Promise.all([adminAPI.stats(), adminAPI.users(), adminAPI.sars()])
      .then(([s, u, r]) => { setStats(s.data); setUsers(u.data); setSars(r.data.sars); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleActive = async (user) => {
    try {
      await adminAPI.updateUser(user._id, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => u._id === user._id ? { ...u, isActive: !u.isActive } : u));
      toast.success(`User ${user.isActive ? 'deactivated' : 'activated'}`);
    } catch { toast.error('Update failed'); }
  };

  const changeRole = async (user, role) => {
    try {
      await adminAPI.updateUser(user._id, { role });
      setUsers(prev => prev.map(u => u._id === user._id ? { ...u, role } : u));
      toast.success('Role updated');
    } catch { toast.error('Update failed'); }
  };

  if (loading) return (
    <div><div className="page-header"><div className="page-title">Admin Panel</div></div>
      <div className="loading-overlay"><div className="spinner" style={{ width: 28, height: 28 }} /></div></div>
  );

  const sarStatusMap = Object.fromEntries((stats?.sarsByStatus || []).map(s => [s._id, s.count]));
  const avgTimeSec = stats?.avgGenerationTimeMs ? (stats.avgGenerationTimeMs / 1000).toFixed(2) : '0.00';

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Admin Panel</div>
            <div className="page-subtitle">System monitoring and user management</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="page-body">
        {/* System stats */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          {[
            { label: 'Total Users', value: stats?.users || 0, color: 'accent', icon: <Users size={18} /> },
            { label: 'Total Transactions', value: stats?.transactions || 0, color: 'gold', icon: <TrendingUp size={18} /> },
            { label: 'Total SARs', value: stats?.sars || 0, color: 'warning', icon: <FileText size={18} /> },
            { label: 'Avg Gen Time', value: `${avgTimeSec}s`, color: 'success', icon: <Zap size={18} /> },
          ].map(card => (
            <div key={card.label} className={`stat-card ${card.color}`}>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <div className="stat-label">{card.label}</div>
                <div style={{ color: `var(--${card.color})`, opacity: 0.6 }}>{card.icon}</div>
              </div>
              <div className="stat-value" style={{ color: `var(--${card.color})` }}>{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</div>
            </div>
          ))}
        </div>

        <div className="tabs">
          {['overview','users','reports'].map(t => (
            <button key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="grid-2">
            <div className="card">
              <div className="card-header"><div className="card-title">SAR Status Breakdown</div></div>
              {['draft','review','approved','filed','rejected'].map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className={`status-badge ${s}`}>{s}</span>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>{sarStatusMap[s] || 0}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">Top Analysts by Reports</div></div>
              {(stats?.topAnalysts || []).map((analyst, i) => (
                <div key={analyst._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 28, height: 28, background: 'var(--accent-dim)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{i+1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{analyst.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{analyst.role}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{analyst.reportsGenerated}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users tab */}
        {activeTab === 'users' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Reports</th>
                    <th>Last Login</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user._id}>
                      <td style={{ fontWeight: 600 }}>{user.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user.email}</td>
                      <td>
                        <select className="form-select" style={{ fontSize: 11, padding: '4px 8px', width: 110 }}
                          value={user.role} onChange={e => changeRole(user, e.target.value)}>
                          {['analyst','supervisor','admin'].map(r => <option key={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user.department}</td>
                      <td style={{ fontWeight: 600, color: 'var(--accent)', textAlign: 'center' }}>{user.reportsGenerated || 0}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {user.lastLogin ? format(new Date(user.lastLogin), 'MMM d, HH:mm') : 'Never'}
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: user.isActive ? 'var(--success-dim)' : 'var(--danger-dim)', color: user.isActive ? 'var(--success)' : 'var(--danger)', border: `1px solid ${user.isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button className={`btn btn-sm ${user.isActive ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(user)}>
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reports tab */}
        {activeTab === 'reports' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SAR Number</th>
                    <th>Subject</th>
                    <th>Risk</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Analyst</th>
                    <th>Generated</th>
                    <th>Gen Time</th>
                  </tr>
                </thead>
                <tbody>
                  {sars.map(sar => (
                    <tr key={sar._id}>
                      <td><span className="text-mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{sar.sarNumber}</span></td>
                      <td style={{ fontSize: 12 }}>{sar.subjectInfo?.name || '—'}</td>
                      <td><span className={`risk-badge ${sar.riskSummary?.riskLevel}`}>{sar.riskSummary?.riskLevel}</span></td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>${(sar.riskSummary?.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td><span className={`status-badge ${sar.status}`}>{sar.status}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sar.generatedBy?.name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sar.createdAt ? format(new Date(sar.createdAt), 'MMM d, yyyy') : '—'}</td>
                      <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>{sar.generationTimeMs ? `${(sar.generationTimeMs/1000).toFixed(2)}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
