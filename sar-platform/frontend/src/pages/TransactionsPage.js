import React, { useState, useEffect, useCallback } from 'react';
import { transactionsAPI } from '../services/api';
import { RefreshCw, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';

const RISK_COLORS = { critical: 'var(--danger)', high: 'var(--warning)', medium: 'var(--gold)', low: 'var(--success)' };

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', riskLevel: '' });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50, ...filters };
      const res = await transactionsAPI.list(params);
      setTransactions(res.data.transactions);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? transactions.filter(t =>
        t.transactionId?.toLowerCase().includes(search.toLowerCase()) ||
        t.senderName?.toLowerCase().includes(search.toLowerCase()) ||
        t.receiverName?.toLowerCase().includes(search.toLowerCase()) ||
        t.senderAccount?.includes(search)
      )
    : transactions;

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Transactions</div>
            <div className="page-subtitle">{total.toLocaleString()} total transactions analyzed</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="form-input" style={{ paddingLeft: 34 }} placeholder="Search by ID, name, account..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 160 }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              {['pending','analyzed','flagged','cleared','reported'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="form-select" style={{ width: 160 }} value={filters.riskLevel} onChange={e => setFilters(f => ({ ...f, riskLevel: e.target.value }))}>
              <option value="">All Risk Levels</option>
              {['critical','high','medium','low'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          {loading ? (
            <div className="loading-overlay"><div className="spinner" style={{ width: 24, height: 24 }} /><div className="loading-text">Loading transactions...</div></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <div className="empty-title">No transactions found</div>
              <div className="empty-text">Upload a CSV file to start analyzing transactions.</div>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Transaction ID</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Type</th>
                      <th>Sender</th>
                      <th>Receiver</th>
                      <th>Risk Score</th>
                      <th>Risk Level</th>
                      <th>Status</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(tx => (
                      <tr key={tx._id}>
                        <td><span className="text-mono" style={{ fontSize: 11 }}>{tx.transactionId}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{tx.date ? format(new Date(tx.date), 'MMM d, HH:mm') : '—'}</td>
                        <td style={{ fontWeight: 600 }}>${tx.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td><span style={{ fontSize: 11, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{tx.type}</span></td>
                        <td>
                          <div style={{ fontSize: 12 }}>{tx.senderName || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{tx.senderAccount}</div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12 }}>{tx.receiverName || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tx.receiverCountry}</div>
                        </td>
                        <td>
                          <div className="risk-bar-wrap">
                            <div className="risk-bar">
                              <div className="risk-bar-fill" style={{ width: `${tx.riskScore || 0}%`, background: RISK_COLORS[tx.riskLevel] || 'var(--accent)' }} />
                            </div>
                            <span className="risk-score-num" style={{ color: RISK_COLORS[tx.riskLevel] }}>{tx.riskScore}</span>
                          </div>
                        </td>
                        <td><span className={`risk-badge ${tx.riskLevel}`}>{tx.riskLevel}</span></td>
                        <td><span className={`status-badge ${tx.status}`}>{tx.status}</span></td>
                        <td>
                          {tx.riskFlags?.length > 0 ? (
                            <span title={tx.riskFlags.join('\n')} style={{ fontSize: 11, color: 'var(--warning)', cursor: 'help' }}>
                              ⚠ {tx.riskFlags.length} flag{tx.riskFlags.length > 1 ? 's' : ''}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 50 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingTop: 16 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>← Prev</button>
                  <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>Page {page}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p+1)} disabled={transactions.length < 50}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
