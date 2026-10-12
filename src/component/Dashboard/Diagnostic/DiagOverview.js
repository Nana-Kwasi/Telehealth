import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api } from '../../../services/apiClient';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import { STAGES, PRIORITY, priorityOf, fmtHours, fmtDateTime, money } from './diagUi';
import './diagnostics.css';

/**
 * Lab / scan dashboard home, for both the parent (whole network) and a branch.
 * Everything comes from GET /diagnostics/operations/dashboard, scoped on the
 * server to the signed-in centre.
 */

export function useDiagDashboard(days, branchId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams({ days: String(days) });
      if (branchId) q.set('branchId', branchId);
      setData(await api(`/api/v1/diagnostics/operations/dashboard?${q}`));
    } catch (e) { setError(e?.message || 'Could not load the dashboard.'); }
    finally { setLoading(false); }
  }, [days, branchId]);
  useEffect(() => { load(); }, [load]);
  // Keep the board fresh while it is open.
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  return { data, loading, error, reload: load };
}

export function Kpi({ label, value, sub, color, onClick }) {
  return (
    <div className={`dx-kpi ${onClick ? 'dx-kpi--click' : ''}`} style={{ '--kpi': color }} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="dx-kpi-label">{label}</div>
      <div className="dx-kpi-value">{value}</div>
      {sub ? <div className="dx-kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function StagePill({ status }) {
  const m = STAGES[status] || STAGES.PENDING;
  return <span className="dx-pill" style={{ background: m.bg, color: m.fg }}><span className="dx-dot" style={{ background: m.dot }} />{m.short}</span>;
}

export function PriorityPill({ priority, hideRoutine = true }) {
  const k = priorityOf(priority);
  if (hideRoutine && k === 'ROUTINE') return null;
  const m = PRIORITY[k];
  return <span className="dx-pill" style={{ background: m.bg, color: m.fg }}>{k === 'STAT' ? '⚡ ' : ''}{m.label}</span>;
}

export function Pipeline({ stages, type, onPick }) {
  const flow = type === 'scan' ? ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] : ['PENDING', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'COMPLETED'];
  return (
    <div className="dx-pipeline">
      {flow.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className="dx-arrow">›</span>}
          <button type="button" className="dx-stage" style={{ background: STAGES[s].bg, color: STAGES[s].fg }} onClick={() => onPick?.(s)}>
            <span className="dx-stage-n">{stages?.[s] ?? 0}</span>
            <span className="dx-stage-l">{STAGES[s].label}</span>
          </button>
        </React.Fragment>
      ))}
      <span className="dx-arrow" />
      <button type="button" className="dx-stage" style={{ background: STAGES.REJECTED.bg, color: STAGES.REJECTED.fg, flex: '0 1 110px' }} onClick={() => onPick?.('REJECTED')}>
        <span className="dx-stage-n">{stages?.REJECTED ?? 0}</span>
        <span className="dx-stage-l">Rejected</span>
      </button>
    </div>
  );
}

export function TrendChart({ series }) {
  const rows = (series || []).map(r => ({ ...r, day: new Date(`${r.date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }));
  return (
    <div style={{ width: '100%', height: 230 }}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="dxRecv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
            <linearGradient id="dxDone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} /><stop offset="100%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="received" name="Received" stroke="#3b82f6" fill="url(#dxRecv)" strokeWidth={2} />
          <Area type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" fill="url(#dxDone)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TestMix({ mix }) {
  if (!mix?.length) return <p className="dx-empty">No orders in this period.</p>;
  const max = Math.max(...mix.map(m => m.count));
  return (
    <div>
      {mix.map(m => (
        <div key={m.name} className="dx-mix-row">
          <span title={m.name}>{m.name}</span>
          <div className="dx-bar"><span style={{ width: `${(m.count / max) * 100}%` }} /></div>
          <b style={{ textAlign: 'right' }}>{m.count}</b>
        </div>
      ))}
    </div>
  );
}

export function HourlyLoad({ hourly }) {
  const h = hourly || [];
  const max = Math.max(1, ...h);
  const peak = h.indexOf(Math.max(...h));
  return (
    <div>
      <div className="dx-heat">{h.map((v, i) => <span key={i} title={`${String(i).padStart(2, '0')}:00 — ${v}`} style={{ height: `${(v / max) * 100}%` }} />)}</div>
      <div className="dx-heat-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span style={{ textAlign: 'right' }}>18:00</span></div>
      {h.some(Boolean) && <p className="dx-card-hint" style={{ margin: '0.5rem 0 0' }}>Busiest hour: <b>{String(peak).padStart(2, '0')}:00–{String(peak + 1).padStart(2, '0')}:00</b> — plan staff around it.</p>}
    </div>
  );
}

export function TatGauge({ tat }) {
  const pct = tat?.withinTargetPct ?? 0;
  const color = pct >= 90 ? '#16a34a' : pct >= 70 ? '#f59e0b' : '#dc2626';
  return (
    <div className="dx-gauge">
      <div className="dx-ring" style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, #f1f5f9 0)` }}><div style={{ color }}>{pct}%</div></div>
      <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.6 }}>
        <div><b>{pct}%</b> finished within target</div>
        <div>Average <b>{fmtHours(tat?.avgHours)}</b> · median <b>{fmtHours(tat?.medianHours)}</b></div>
        <div className="dx-card-hint">Target: STAT 2h · urgent 6h · catalog turnaround, else 24h lab / 48h scan</div>
      </div>
    </div>
  );
}

export function OrderRows({ rows, onOpen, extra }) {
  if (!rows?.length) return null;
  return (
    <ul className="dx-list">
      {rows.map(r => (
        <li key={r.orderId} className="dx-row" onClick={() => onOpen?.(r)}>
          <PriorityPill priority={r.priority} />
          <div className="dx-row-main">
            <div className="dx-row-title">{r.patientName || 'Patient'} · {r.testType || 'Test'}</div>
            <div className="dx-row-meta">{[r.orderCode, r.branchName].filter(Boolean).join(' · ')}</div>
          </div>
          {extra?.(r)}
        </li>
      ))}
    </ul>
  );
}

export function BranchTable({ branches, onOpen, currency = 'GHS' }) {
  if (!branches?.length) return <p className="dx-empty">No branches yet. Add one under Branches.</p>;
  const best = [...branches].filter(b => b.avgTatHours != null).sort((a, b) => a.avgTatHours - b.avgTatHours)[0];
  return (
    <div className="dx-table-wrap">
      <table className="dx-table">
        <thead><tr><th>Branch</th><th>Status</th><th>Orders</th><th>Open</th><th>Done</th><th>Overdue</th><th>Avg TAT</th><th>Completion</th><th>Revenue</th></tr></thead>
        <tbody>
          {branches.map(b => (
            <tr key={b.branchId} className="dx-click" onClick={() => onOpen?.(b)}>
              <td><b>{b.name || 'Branch'}</b>{best && best.branchId === b.branchId ? <span className="dx-pill" style={{ background: '#dcfce7', color: '#166534', marginLeft: 6 }}>Fastest</span> : null}<div className="dx-card-hint">{b.city || ''}</div></td>
              <td><span className="dx-pill" style={b.status === 'active' ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}>{b.status}</span></td>
              <td>{b.total}</td>
              <td>{b.open}</td>
              <td>{b.completed}</td>
              <td style={{ color: b.overdue ? '#b91c1c' : undefined, fontWeight: b.overdue ? 800 : 400 }}>{b.overdue}</td>
              <td>{fmtHours(b.avgTatHours)}</td>
              <td style={{ minWidth: 110 }}>
                {b.completionRate == null ? '—' : (<><div className="dx-bar"><span style={{ width: `${b.completionRate}%` }} /></div><span className="dx-card-hint">{b.completionRate}%</span></>)}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{money(b.revenue, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RangeSeg({ value, onChange, options = [7, 14, 30, 90] }) {
  return (
    <div className="dx-seg">
      {options.map(d => <button key={d} type="button" className={value === d ? 'on' : ''} onClick={() => onChange(d)}>{d}d</button>)}
    </div>
  );
}

export default function DiagOverview({ type = 'lab', profile, mode = 'branch' }) {
  const navigate = useNavigate();
  const [days, setDays] = useState(14);
  const { data, loading, error, reload } = useDiagDashboard(days);
  const isParent = mode === 'parent';
  const name = isParent ? (profile?.labName || profile?.centerName || profile?.name) : profile?.branchName;
  const ordersPath = '/dashboard/orders';
  const openOrder = (r) => navigate(`${ordersPath}/${r.orderId}`);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const t = data?.totals || {};
  const currency = data?.revenue?.currency || 'GHS';

  return (
    <div className={`pharmacy-page dx ${type === 'scan' ? 'dx--scan' : ''}`}>
      <div className="dx-hero">
        <div>
          <h1>{greet}{name ? `, ${name}` : ''}</h1>
          <p>{isParent
            ? `Your ${type === 'lab' ? 'laboratory' : 'imaging'} network at a glance — every branch, live.`
            : `Today's ${type === 'lab' ? 'lab' : 'scan'} queue, turnaround and results at this branch.`}</p>
          <span className="dx-hero-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{data ? ` · updated ${fmtDateTime(data.generatedAt)}` : ''}</span>
        </div>
        <div className="dx-toolbar">
          <RangeSeg value={days} onChange={setDays} />
          <button type="button" className="dx-btn" onClick={reload}>↻ Refresh</button>
          <button type="button" className="dx-btn dx-btn--primary" onClick={() => navigate(ordersPath)}>{isParent ? 'All orders' : 'Open worklist'}</button>
        </div>
      </div>

      {error && <div className="dx-alert dx-alert--red"><div><strong>Could not load</strong><p>{error}</p></div></div>}
      {loading && !data ? <p className="dx-empty">Loading dashboard…</p> : data && (
        <>
          {data.results?.criticalInRange > 0 && (
            <div className="dx-alert dx-alert--red">
              <span style={{ fontSize: '1.3rem' }}>🚨</span>
              <div style={{ flex: 1 }}>
                <strong>{data.results.criticalInRange} critical result{data.results.criticalInRange > 1 ? 's' : ''} in the last {days} days</strong>
                <p>The ordering doctor was alerted automatically. Phone the doctor too if your protocol requires it.</p>
              </div>
            </div>
          )}
          {t.overdue > 0 && (
            <div className="dx-alert dx-alert--amber">
              <span style={{ fontSize: '1.3rem' }}>⏱️</span>
              <div style={{ flex: 1 }}>
                <strong>{t.overdue} order{t.overdue > 1 ? 's are' : ' is'} past the turnaround target</strong>
                <p>Oldest first in “Overdue” below.{t.urgentOpen ? ` ${t.urgentOpen} open urgent/STAT order${t.urgentOpen > 1 ? 's' : ''}.` : ''}</p>
              </div>
              <button type="button" className="dx-btn" onClick={() => navigate(ordersPath, { state: { tab: 'overdue' } })}>View</button>
            </div>
          )}

          <div className="dx-today">
            <Kpi label="Received today" value={data.today?.received ?? 0} color="#3b82f6" sub={`${t.inRange ?? 0} in ${days} days`} />
            <Kpi label="Completed today" value={data.today?.completed ?? 0} color="#22c55e" sub={`${t.completedInRange ?? 0} in ${days} days`} />
            <Kpi label="Open queue" value={t.open ?? 0} color="#f59e0b" sub={t.urgentOpen ? `${t.urgentOpen} urgent / STAT` : 'No urgent orders'} onClick={() => navigate(ordersPath)} />
            <Kpi label="Overdue" value={t.overdue ?? 0} color="#dc2626" sub="Past turnaround target" onClick={() => navigate(ordersPath, { state: { tab: 'overdue' } })} />
            <Kpi label="Avg turnaround" value={fmtHours(data.tat?.avgHours)} color="#8b5cf6" sub={`${data.tat?.withinTargetPct ?? 0}% within target`} />
            <Kpi label={`Revenue (${days}d)`} value={money(data.revenue?.completedValue, currency)} color="#0f766e" sub="Completed tests at catalog price" />
            <Kpi label="Rejection rate" value={`${data.rejectionRatePct ?? 0}%`} color="#be123c" sub={`${t.rejectedInRange ?? 0} rejected`} />
            {isParent
              ? <Kpi label="Branches" value={data.branches?.length ?? 0} color="#0369a1" sub={`${(data.branches || []).filter(b => b.status === 'active').length} active`} onClick={() => navigate('/dashboard/branches')} />
              : <Kpi label="Abnormal results" value={data.results?.abnormalInRange ?? 0} color="#ea580c" sub={`${data.results?.criticalInRange ?? 0} critical`} />}
          </div>

          <div className="dx-grid">
            <section className="dx-card dx-span-12">
              <div className="dx-card-head"><h2 className="dx-card-title">Work pipeline</h2><span className="dx-card-hint">Tap a stage to open those orders</span></div>
              <Pipeline stages={data.stages} type={type} onPick={(s) => navigate(ordersPath, { state: { tab: s } })} />
            </section>

            <section className="dx-card dx-span-8">
              <div className="dx-card-head"><h2 className="dx-card-title">Orders received vs completed</h2><span className="dx-card-hint">Last {days} days</span></div>
              <TrendChart series={data.series} />
            </section>
            <section className="dx-card dx-span-4">
              <div className="dx-card-head"><h2 className="dx-card-title">Turnaround time</h2></div>
              <TatGauge tat={data.tat} />
              <div style={{ marginTop: '1rem' }}>
                <div className="dx-card-head" style={{ marginBottom: '0.4rem' }}><h2 className="dx-card-title" style={{ fontSize: '0.84rem' }}>When orders arrive</h2></div>
                <HourlyLoad hourly={data.hourly} />
              </div>
            </section>

            <section className="dx-card dx-span-6">
              <div className="dx-card-head"><h2 className="dx-card-title">⏱️ Overdue</h2><span className="dx-card-hint">Most late first</span></div>
              {data.overdue?.length ? (
                <OrderRows rows={data.overdue} onOpen={openOrder} extra={(r) => (
                  <span className="dx-tat dx-tat--late">{fmtHours(r.ageHours)} / {fmtHours(r.targetHours)}</span>
                )} />
              ) : <p className="dx-empty">✓ Nothing overdue. Nice work.</p>}
            </section>
            <section className="dx-card dx-span-6">
              {type === 'scan' ? (
                <>
                  <div className="dx-card-head"><h2 className="dx-card-title">📅 Upcoming scans</h2><span className="dx-card-hint">Booked appointments</span></div>
                  {data.upcoming?.length ? (
                    <OrderRows rows={data.upcoming} onOpen={openOrder} extra={(r) => <span className="dx-pill" style={{ background: STAGES.SCHEDULED.bg, color: STAGES.SCHEDULED.fg }}>{fmtDateTime(r.scheduledAt)}</span>} />
                  ) : <p className="dx-empty">No scans booked yet. Book patients from the worklist.</p>}
                </>
              ) : (
                <>
                  <div className="dx-card-head"><h2 className="dx-card-title">🚨 Critical results</h2><span className="dx-card-hint">Doctor alerted automatically</span></div>
                  {data.critical?.length ? (
                    <OrderRows rows={data.critical.map(c => ({ ...c, priority: 'STAT' }))} onOpen={openOrder} extra={(r) => <span className="dx-card-hint">{fmtDateTime(r.createdAt)}</span>} />
                  ) : <p className="dx-empty">No critical values in this period.</p>}
                </>
              )}
            </section>

            <section className={`dx-card ${isParent ? 'dx-span-5' : 'dx-span-12'}`}>
              <div className="dx-card-head"><h2 className="dx-card-title">Most requested {type === 'lab' ? 'tests' : 'scans'}</h2><span className="dx-card-hint">Last {days} days</span></div>
              <TestMix mix={data.testMix} />
            </section>
            {isParent && (
              <section className="dx-card dx-span-7">
                <div className="dx-card-head"><h2 className="dx-card-title">Branch performance</h2><span className="dx-card-hint">Tap a branch to manage it</span></div>
                <BranchTable branches={data.branches} currency={currency} onOpen={(b) => navigate(`/dashboard/branches/${b.branchId}`)} />
              </section>
            )}
          </div>

          <div style={{ marginTop: '0.9rem' }}>
            <LocationSummaryCard profile={profile} title={isParent ? `${type === 'lab' ? 'Lab' : 'Scan centre'} HQ location` : 'Branch location'} onEdit={isParent ? undefined : () => navigate('/dashboard/settings')} />
          </div>
        </>
      )}
    </div>
  );
}
