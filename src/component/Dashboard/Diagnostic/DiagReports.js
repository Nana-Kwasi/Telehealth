import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import { useDiagDashboard, Kpi, TrendChart, TestMix, HourlyLoad, TatGauge, BranchTable, RangeSeg, OrderRows } from './DiagOverview';
import { ResultView } from './DiagWorklist';
import { fmtHours, money, exportCsv, fmtDateTime } from './diagUi';
import './diagnostics.css';

/** Period reports with CSV export (parent: network + branches; branch: itself). */
export function DiagReports({ type = 'lab', mode = 'branch' }) {
  const isParent = mode === 'parent';
  const [days, setDays] = useState(30);
  const [branchId, setBranchId] = useState('');
  const { data, loading } = useDiagDashboard(days, branchId || undefined);
  const [branches, setBranches] = useState([]);
  useEffect(() => { if (isParent && data?.branches && !branchId) setBranches(data.branches); }, [isParent, data, branchId]);
  const t = data?.totals || {};
  const currency = data?.revenue?.currency || 'GHS';

  const exportSummary = () => exportCsv(`${type}-daily-${days}d.csv`, [
    { label: 'Date', value: 'date' }, { label: 'Received', value: 'received' }, { label: 'Completed', value: 'completed' },
  ], data?.series || []);
  const exportBranches = () => exportCsv(`${type}-branches-${days}d.csv`, [
    { label: 'Branch', value: 'name' }, { label: 'Status', value: 'status' }, { label: 'Orders', value: 'total' }, { label: 'Open', value: 'open' },
    { label: 'Completed', value: 'completed' }, { label: 'Rejected', value: 'rejected' }, { label: 'Overdue', value: 'overdue' },
    { label: 'Avg TAT (h)', value: 'avgTatHours' }, { label: 'Completion %', value: 'completionRate' }, { label: `Revenue (${currency})`, value: 'revenue' },
  ], data?.branches || []);

  return (
    <div className={`pharmacy-page dx ${type === 'scan' ? 'dx--scan' : ''}`}>
      <div className="dx-hero">
        <div><h1>Reports</h1><p>Volume, turnaround, quality and revenue for the period. Export for your records or management meetings.</p></div>
        <div className="dx-toolbar">
          {isParent && branches.length > 0 && (
            <select className="dx-select" value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">Whole network</option>{branches.map(b => <option key={b.branchId} value={b.branchId}>{b.name}</option>)}
            </select>
          )}
          <RangeSeg value={days} onChange={setDays} options={[7, 30, 90, 180]} />
          <button type="button" className="dx-btn" disabled={!data} onClick={exportSummary}>⬇ Daily CSV</button>
          {isParent && <button type="button" className="dx-btn" disabled={!data?.branches?.length} onClick={exportBranches}>⬇ Branch CSV</button>}
          <button type="button" className="dx-btn" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>
      {loading && !data ? <p className="dx-empty">Loading…</p> : data && (
        <>
          <div className="dx-today">
            <Kpi label="Orders received" value={t.inRange ?? 0} color="#3b82f6" />
            <Kpi label="Completed" value={t.completedInRange ?? 0} color="#22c55e" />
            <Kpi label="Rejected" value={t.rejectedInRange ?? 0} color="#be123c" sub={`${data.rejectionRatePct}% of received`} />
            <Kpi label="Avg turnaround" value={fmtHours(data.tat?.avgHours)} color="#8b5cf6" sub={`median ${fmtHours(data.tat?.medianHours)}`} />
            <Kpi label="Within target" value={`${data.tat?.withinTargetPct ?? 0}%`} color="#0f766e" />
            <Kpi label="Revenue" value={money(data.revenue?.completedValue, currency)} color="#0f766e" sub="Completed × catalog price" />
            <Kpi label="Abnormal results" value={data.results?.abnormalInRange ?? 0} color="#ea580c" />
            <Kpi label="Critical results" value={data.results?.criticalInRange ?? 0} color="#dc2626" />
          </div>
          <div className="dx-grid">
            <section className="dx-card dx-span-8"><div className="dx-card-head"><h2 className="dx-card-title">Daily volume</h2></div><TrendChart series={data.series} /></section>
            <section className="dx-card dx-span-4"><div className="dx-card-head"><h2 className="dx-card-title">Turnaround</h2></div><TatGauge tat={data.tat} /><div style={{ marginTop: 14 }}><HourlyLoad hourly={data.hourly} /></div></section>
            <section className="dx-card dx-span-6"><div className="dx-card-head"><h2 className="dx-card-title">Top {type === 'lab' ? 'tests' : 'scans'}</h2></div><TestMix mix={data.testMix} /></section>
            <section className="dx-card dx-span-6"><div className="dx-card-head"><h2 className="dx-card-title">Critical results</h2></div>
              {data.critical?.length ? <OrderRows rows={data.critical.map(c => ({ ...c, priority: 'STAT' }))} extra={(r) => <span className="dx-card-hint">{fmtDateTime(r.createdAt)}</span>} /> : <p className="dx-empty">None in this period.</p>}
            </section>
            {isParent && !branchId && <section className="dx-card dx-span-12"><div className="dx-card-head"><h2 className="dx-card-title">Branch comparison</h2></div><BranchTable branches={data.branches} currency={currency} /></section>}
          </div>
        </>
      )}
    </div>
  );
}

/** Uploaded results with abnormal / critical filters (for QA and follow-up). */
export function DiagResultsLog({ type = 'lab' }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    api('/api/v1/diagnostics/operations/results-query').then(r => setRows((Array.isArray(r) ? r : []).filter(x => String(x.resultType || x.diagnosticType || 'lab').toLowerCase().includes(type)))).catch(() => setRows([])).finally(() => setLoading(false));
  }, [type]);
  const shown = rows.filter(r => (filter === 'all' || (filter === 'critical' ? r.critical : filter === 'abnormal' ? r.abnormal : !r.abnormal))
    && (!q || [r.patientName, r.testType, r.orderCode, r.branchName].some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))));
  return (
    <div className={`pharmacy-page dx ${type === 'scan' ? 'dx--scan' : ''}`}>
      <div className="dx-hero">
        <div><h1>Results</h1><p>Everything uploaded, newest first. Results go to the ordering doctor, who decides when the patient sees them.</p></div>
        <div className="dx-toolbar"><button type="button" className="dx-btn" disabled={!shown.length} onClick={() => exportCsv(`${type}-results.csv`, [
          { label: 'Date', value: r => r.createdAt }, { label: 'Order', value: 'orderCode' }, { label: 'Patient', value: 'patientName' }, { label: 'Test', value: 'testType' },
          { label: 'Branch', value: 'branchName' }, { label: 'Abnormal', value: r => (r.abnormal ? 'yes' : '') }, { label: 'Critical', value: r => (r.critical ? 'yes' : '') },
          { label: 'Shared by doctor', value: r => (r.releasedToPatient ? 'yes' : '') }], shown)}>⬇ Export CSV</button></div>
      </div>
      <div className="dx-tabs">
        {[['all', 'All'], ['critical', '🚨 Critical'], ['abnormal', 'Abnormal'], ['normal', 'Normal']].map(([k, l]) => (
          <button key={k} type="button" className={`dx-tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}<b>{rows.filter(r => k === 'all' || (k === 'critical' ? r.critical : k === 'abnormal' ? r.abnormal : !r.abnormal)).length}</b></button>
        ))}
        <input className="dx-input" style={{ marginLeft: 'auto', minWidth: 220 }} placeholder="Search patient, test, order" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="dx-card">
        {loading ? <p className="dx-empty">Loading…</p> : shown.length === 0 ? <p className="dx-empty">No results.</p> : (
          <div className="dx-table-wrap"><table className="dx-table">
            <thead><tr><th>Date</th><th>Patient</th><th>Test</th><th>Order</th><th>Branch</th><th>Flags</th><th>Doctor</th><th /></tr></thead>
            <tbody>{shown.map(r => (
              <React.Fragment key={r.id}>
                <tr className="dx-click" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className="dx-card-hint">{fmtDateTime(r.createdAt)}</td><td><b>{r.patientName || '—'}</b></td><td>{r.testType || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.orderCode || '—'}</td><td>{r.branchName || '—'}</td>
                  <td>{r.critical ? <span className="dx-pill" style={{ background: '#dc2626', color: '#fff' }}>CRITICAL</span> : r.abnormal ? <span className="dx-pill" style={{ background: '#ffedd5', color: '#9a3412' }}>Abnormal</span> : <span className="dx-pill" style={{ background: '#dcfce7', color: '#166534' }}>Normal</span>}</td>
                  <td className="dx-card-hint">{r.releasedToPatient ? 'Shared with patient' : 'Reviewing'}</td>
                  <td onClick={e => e.stopPropagation()}><button type="button" className="dx-btn dx-btn--sm" onClick={() => navigate(`/dashboard/orders/${r.orderId}`)}>Order</button></td>
                </tr>
                {open === r.id && <tr><td colSpan={8} style={{ background: '#f8fafc' }}><ResultView r={r} /></td></tr>}
              </React.Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
