import React, { useCallback, useEffect, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api } from '../../../services/apiClient';
import '../Diagnostic/diagnostics.css';
import { OnboardInsurerModal, InsurerStaffModal, AdminFacilities, AdminVerifications, AdminNetworkFraud, AdminAllPreauth } from './AdminOnboarding';
import Paged from '../../Common/Paged';

/**
 * Super admin → Insurance. Insurers connected through adapters, the provider
 * network (verified provider codes), every counter check (blocked = money the
 * insurer did not pay), and claims with proof. The admin acts for insurers here
 * until insurers get their own login.
 */
const API = '/api/v1/insurance/admin';
const money = (v) => `GHS ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (v) => (v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const CLAIM = {
  AWAITING_PATIENT: ['Awaiting patient', '#e0f2fe', '#075985'], CONFIRMED: ['Confirmed', '#dbeafe', '#1e40af'], SUBMITTED: ['Submitted', '#ede9fe', '#5b21b6'],
  APPROVED: ['Approved', '#dcfce7', '#166534'], PAID: ['Paid', '#bbf7d0', '#14532d'], QUERIED: ['Queried', '#fef3c7', '#92400e'],
  REJECTED: ['Rejected', '#fee2e2', '#991b1b'], FLAGGED: ['Flagged', '#fecaca', '#991b1b'],
};
const OUTCOME = { COVERED: ['#dcfce7', '#166534'], PARTIAL: ['#fef3c7', '#92400e'], NOT_COVERED: ['#fee2e2', '#991b1b'], INACTIVE: ['#fee2e2', '#991b1b'], BLOCKED: ['#dc2626', '#fff'], ERROR: ['#f1f5f9', '#475569'] };
const Pill = ({ map, k }) => { const m = map[k] || [k, '#f1f5f9', '#475569']; const [label, bg, fg] = m.length === 3 ? m : [k, m[0], m[1]]; return <span className="dx-pill" style={{ background: bg, color: fg }}>{label}</span>; };
const FLAG_LABEL = { PATIENT_DENIED_RECEIPT: 'Patient said not received', NO_PATIENT_CONFIRMATION: 'No patient reply', PARTIAL_COVER: 'Partly covered' };

function Kpi({ label, value, sub, color }) {
  return <div className="dx-kpi" style={{ '--kpi': color }}><div className="dx-kpi-label">{label}</div><div className="dx-kpi-value">{value}</div>{sub ? <div className="dx-kpi-sub">{sub}</div> : null}</div>;
}

function Overview({ insurers }) {
  const [days, setDays] = useState(30);
  const [insurerId, setInsurerId] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams({ days: String(days) }); if (insurerId) q.set('insurerId', insurerId);
    api(`${API}/overview?${q}`).then(setD).catch(() => setD(null));
  }, [days, insurerId]);
  if (!d) return <p className="dx-empty">Loading…</p>;
  const byStatus = Object.fromEntries((d.claimsByStatus || []).map(r => [r.status, r]));
  const prevented = Number(d.blocked?.amount || 0) + Number(d.deniedByPatient?.amount || 0);
  return (
    <>
      <div className="dx-toolbar" style={{ marginBottom: 12 }}>
        <select className="dx-select" value={insurerId} onChange={e => setInsurerId(e.target.value)}><option value="">All insurers</option>{insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <div className="dx-seg">{[7, 30, 90, 365].map(n => <button key={n} type="button" className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n}d</button>)}</div>
      </div>
      <div className="dx-alert" style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#14532d' }}>
        <span style={{ fontSize: '1.6rem' }}>🛡️</span>
        <div style={{ flex: 1 }}><strong style={{ fontSize: '1.05rem' }}>{money(prevented)} stopped before it was paid</strong>
          <p>{d.blocked?.count || 0} blocked at the counter ({money(d.blocked?.amount)}) · {d.deniedByPatient?.count || 0} claims the patient said they never received ({money(d.deniedByPatient?.amount)}) · last {d.days} days</p></div>
      </div>
      <div className="dx-today">
        <Kpi label="Active insurers" value={d.insurers} color="#0369a1" />
        <Kpi label="Verified members" value={d.verifiedCards} color="#2563eb" />
        <Kpi label="Network providers" value={d.networkProviders} color="#0f766e" />
        <Kpi label="Counter checks" value={d.checks} color="#8b5cf6" sub={`last ${d.days} days`} />
        <Kpi label="Claims" value={d.claimsTotal?.count || 0} color="#f59e0b" sub={`${money(d.claimsTotal?.insurer)} to insurers`} />
        <Kpi label="Patient co-pays" value={money(d.claimsTotal?.patient)} color="#64748b" />
        <Kpi label="Patient confirmation" value={d.confirmationRate == null ? '—' : `${d.confirmationRate}%`} color="#16a34a" sub="Claims confirmed by the patient" />
        <Kpi label="Flagged for review" value={byStatus.FLAGGED?.count || 0} color="#dc2626" sub={money(byStatus.FLAGGED?.amount)} />
      </div>
      <div className="dx-grid">
        <section className="dx-card dx-span-8">
          <div className="dx-card-head"><h2 className="dx-card-title">Claims vs money prevented</h2></div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <ComposedChart data={(d.series || []).map(r => ({ ...r, prevented: Number(r.prevented), day: r.date.slice(5) }))} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="claims" name="Claims" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" dataKey="prevented" name="Prevented (GHS)" stroke="#16a34a" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="dx-card dx-span-4">
          <div className="dx-card-head"><h2 className="dx-card-title">Why requests were blocked</h2></div>
          {(d.blockReasons || []).length ? d.blockReasons.map(r => (
            <div key={r.reason} className="dx-mix-row"><span title={r.reason}>{r.reason}</span><div className="dx-bar"><span style={{ width: `${(Number(r.amount) / Math.max(...d.blockReasons.map(x => Number(x.amount)), 1)) * 100}%`, background: '#dc2626' }} /></div><b style={{ textAlign: 'right' }}>{r.count}</b></div>
          )) : <p className="dx-empty">Nothing blocked in this period.</p>}
        </section>
        <section className="dx-card dx-span-6">
          <div className="dx-card-head"><h2 className="dx-card-title">Claims by status</h2></div>
          <div className="dx-pipeline">{Object.keys(CLAIM).map(k => (
            <div key={k} className="dx-stage" style={{ background: CLAIM[k][1], color: CLAIM[k][2], cursor: 'default' }}><span className="dx-stage-n">{byStatus[k]?.count || 0}</span><span className="dx-stage-l">{CLAIM[k][0]}</span></div>
          ))}</div>
        </section>
        <section className="dx-card dx-span-6">
          <div className="dx-card-head"><h2 className="dx-card-title">Top providers by claim value</h2></div>
          {(d.topProviders || []).length ? (
            <table className="dx-table"><thead><tr><th>Provider</th><th>Claims</th><th>Value</th><th>Flagged</th></tr></thead>
              <tbody>{d.topProviders.map(p => <tr key={p.name}><td><b>{p.name || '—'}</b></td><td>{p.claims}</td><td>{money(p.amount)}</td><td style={{ color: p.flagged ? '#b91c1c' : undefined, fontWeight: p.flagged ? 800 : 400 }}>{p.flagged}</td></tr>)}</tbody></table>
          ) : <p className="dx-empty">No claims yet.</p>}
        </section>
      </div>
    </>
  );
}

function Insurers({ insurers, reload }) {
  const [adapters, setAdapters] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [onboard, setOnboard] = useState(false);
  const [creds, setCreds] = useState(null);
  const [staffOf, setStaffOf] = useState(null);
  useEffect(() => { api(`${API}/adapters`).then(a => setAdapters(Array.isArray(a) ? a : [])).catch(() => {}); }, []);
  const save = async () => {
    setBusy(true); setMsg('');
    const creds = {}; (edit.credentialsText || '').split('\n').forEach(l => { const i = l.indexOf('='); if (i > 0) creds[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    const body = { name: edit.name, code: edit.code, adapter: edit.adapter, baseUrl: edit.baseUrl, status: edit.status, supportPhone: edit.supportPhone, supportEmail: edit.supportEmail, credentials: Object.keys(creds).length ? creds : null };
    try { if (edit.id) await api(`${API}/insurers/${edit.id}`, { method: 'PATCH', body }); else await api(`${API}/insurers`, { method: 'POST', body }); setEdit(null); reload(); }
    catch (e) { setMsg(e?.message || 'Could not save.'); } finally { setBusy(false); }
  };
  const test = async (i) => { try { const r = await api(`${API}/insurers/${i.id}/test`, { method: 'POST' }); alert(`${i.name}: ${r.ok ? '✓ Connected' : '✗ Failed'} — ${r.detail}`); } catch (e) { alert(e?.message); } };
  return (
    <>
      <div className="dx-card-head"><p className="dx-card-hint" style={{ margin: 0 }}>Each insurer is connected through an adapter written for its API. Credentials are stored encrypted and never shown again.</p>
        <button type="button" className="dx-btn dx-btn--primary" onClick={() => setOnboard(true)}>+ Onboard insurer</button></div>
      {creds && <div className="dx-alert" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' }}><div style={{ flex: 1 }}><strong>Insurer admin login: {creds.email}</strong><p>Temporary password: <code>{creds.temporaryPassword}</code> — share it securely; they change it on first sign-in and add their own staff.</p></div><button type="button" className="dx-btn dx-btn--sm" onClick={() => setCreds(null)}>Done</button></div>}
      {onboard && <OnboardInsurerModal adapters={adapters} onClose={() => setOnboard(false)} onDone={(admin) => { setOnboard(false); setCreds(admin); reload(); }} />}
      {staffOf && <InsurerStaffModal insurer={staffOf} onClose={() => setStaffOf(null)} />}
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Insurer</th><th>Code</th><th>Adapter</th><th>Status</th><th>Members</th><th>Network</th><th>Credentials</th><th /></tr></thead>
        <tbody>{insurers.length ? <Paged items={insurers} table>{(insurers) => insurers.map(i => (
          <tr key={i.id}><td><b>{i.name}</b><div className="dx-card-hint">{i.supportPhone || ''}</div></td><td style={{ fontFamily: 'monospace' }}>{i.code}</td><td>{i.adapter}</td>
            <td><span className="dx-pill" style={i.status === 'ACTIVE' ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}>{i.status}</span></td>
            <td>{i.verifiedMembers}</td><td>{i.networkProviders}</td><td>{i.hasCredentials ? '🔒 Set' : '—'}</td>
            <td style={{ whiteSpace: 'nowrap' }}><button type="button" className="dx-btn dx-btn--sm" onClick={() => test(i)}>Test</button>{' '}
              <button type="button" className="dx-btn dx-btn--sm" onClick={() => setEdit({ ...i, credentialsText: '' })}>Edit</button>{' '}
              <button type="button" className="dx-btn dx-btn--sm" onClick={() => setStaffOf(i)}>Logins</button></td></tr>
        ))}</Paged> : <tr><td colSpan={8} className="dx-empty">No insurers yet. Add one — use the Sandbox adapter to try the whole flow.</td></tr>}</tbody>
      </table></div></div>
      {edit && (
        <div className="dx-modal-bg" onClick={() => setEdit(null)}><div className="dx-modal" onClick={e => e.stopPropagation()}>
          <div className="dx-modal-head"><h3>{edit.id ? 'Edit insurer' : 'Add insurer'}</h3><button type="button" className="dx-btn dx-btn--sm" onClick={() => setEdit(null)}>✕</button></div>
          <div className="dx-modal-body">
            <div className="dx-two">
              <div className="dx-field"><label>Name</label><input className="dx-input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="dx-field"><label>Code</label><input className="dx-input" value={edit.code} disabled={!!edit.id} onChange={e => setEdit({ ...edit, code: e.target.value })} placeholder="e.g. ACME" /></div>
              <div className="dx-field"><label>Adapter</label><select className="dx-select" value={edit.adapter} onChange={e => setEdit({ ...edit, adapter: e.target.value })}>{adapters.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></div>
              <div className="dx-field"><label>Status</label><select className="dx-select" value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}><option>ACTIVE</option><option>SUSPENDED</option></select></div>
              <div className="dx-field"><label>API base URL</label><input className="dx-input" value={edit.baseUrl || ''} onChange={e => setEdit({ ...edit, baseUrl: e.target.value })} placeholder="https://api.insurer.com" /></div>
              <div className="dx-field"><label>Support phone</label><input className="dx-input" value={edit.supportPhone || ''} onChange={e => setEdit({ ...edit, supportPhone: e.target.value })} /></div>
            </div>
            <div className="dx-field"><label>Credentials {edit.hasCredentials ? '(leave empty to keep the saved ones)' : ''}</label>
              <textarea rows={3} value={edit.credentialsText} onChange={e => setEdit({ ...edit, credentialsText: e.target.value })} placeholder={'clientId=...\nclientSecret=...'} style={{ fontFamily: 'monospace' }} /></div>
            {msg && <p style={{ color: '#b91c1c', margin: 0 }}>{msg}</p>}
          </div>
          <div className="dx-modal-foot"><button type="button" className="dx-btn" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" disabled={busy || !edit.name || !edit.code} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
        </div></div>
      )}
    </>
  );
}

function ClaimDrawer({ id, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/v1/insurance/claims/${id}`).then(setC).catch(() => {}); }, [id]);
  const decide = async (decision) => {
    if ((decision === 'REJECT' || decision === 'QUERY') && !reason.trim()) { alert('Add a reason first.'); return; }
    setBusy(true);
    try { setC(await api(`${API}/claims/${id}/decision`, { method: 'POST', body: { decision, reason: reason.trim() || null } })); setReason(''); onChanged(); }
    catch (e) { alert(e?.message); } finally { setBusy(false); }
  };
  return (
    <div className="dx-modal-bg" onClick={onClose}><div className="dx-modal" style={{ maxWidth: 820 }} onClick={e => e.stopPropagation()}>
      {!c ? <p className="dx-empty">Loading…</p> : (<>
        <div className="dx-modal-head"><div><h3>Claim {c.claimRef} <Pill map={CLAIM} k={c.status} /></h3><div className="dx-card-hint">{c.insurerName} · {c.providerName} ({c.providerCode}) · {when(c.createdAt)}</div></div><button type="button" className="dx-btn dx-btn--sm" onClick={onClose}>✕</button></div>
        <div className="dx-modal-body">
          <div className="dx-today" style={{ marginBottom: 0 }}>
            <Kpi label="Total" value={money(c.totalAmount)} color="#64748b" /><Kpi label="Insurer pays" value={money(c.insurerAmount)} color="#2563eb" /><Kpi label="Patient paid" value={money(c.patientAmount)} color="#0f766e" />
            <Kpi label="Patient confirmed" value={c.patientConfirmation === 'YES' ? '✓ Yes' : c.patientConfirmation === 'NO' ? '✗ No' : c.patientConfirmation === 'NO_REPLY' ? 'No reply' : 'Waiting'} color={c.patientConfirmation === 'YES' ? '#16a34a' : c.patientConfirmation === 'PENDING' ? '#f59e0b' : '#dc2626'} sub={c.patientConfirmedAt ? when(c.patientConfirmedAt) : undefined} />
          </div>
          {JSON.parse(c.flagsJson || '[]').length > 0 && <div className="dx-alert dx-alert--red" style={{ marginBottom: 0 }}><div><strong>Flags</strong><p>{JSON.parse(c.flagsJson).map(f => FLAG_LABEL[f] || f).join(' · ')}</p></div></div>}
          <table className="dx-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Amount</th><th>Covered</th><th>Note</th></tr></thead>
            <tbody>{(c.lines || []).map((l, i) => <tr key={i}><td><b>{l.description}</b></td><td>{Number(l.quantity)}</td><td>{money(l.unitPrice)}</td><td>{money(l.amount)}</td><td>{money(l.coveredAmount)}</td><td className="dx-card-hint">{l.note || ''}</td></tr>)}</tbody></table>
          <div className="dx-two">
            <div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>Proof</div>
              {Object.entries(c.evidence || {}).filter(([k]) => k !== 'eligibility').map(([k, v]) => <div key={k} style={{ fontSize: '0.8rem', marginBottom: 3 }}><span className="dx-card-hint">{k}:</span> <code>{Array.isArray(v) ? `${v.length} record(s)` : String(v)}</code></div>)}</div>
            <div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>History</div>
              {(c.events || []).map((e, i) => <div key={i} style={{ fontSize: '0.8rem', borderLeft: '3px solid #2563eb', paddingLeft: 8, marginBottom: 6 }}><b>{e.eventType.replace(/_/g, ' ').toLowerCase()}</b>{e.detail ? ` — ${e.detail}` : ''}<div className="dx-card-hint">{when(e.createdAt)}</div></div>)}</div>
          </div>
          {c.decisionReason && <p style={{ margin: 0, fontSize: '0.84rem' }}><b>Decision note:</b> {c.decisionReason}</p>}
          <div className="dx-field"><label>Reason / note (required to reject or query)</label><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} /></div>
        </div>
        <div className="dx-modal-foot">
          <span className="dx-card-hint" style={{ marginRight: 'auto', alignSelf: 'center' }}>Acting for the insurer.</span>
          {['CONFIRMED', 'FLAGGED', 'QUERIED'].includes(c.status) && <button type="button" className="dx-btn" disabled={busy} onClick={() => decide('SUBMIT')}>Send to insurer</button>}
          {!['APPROVED', 'PAID', 'REJECTED'].includes(c.status) && <button type="button" className="dx-btn" disabled={busy} onClick={() => decide('QUERY')}>Query</button>}
          {!['PAID', 'REJECTED'].includes(c.status) && <button type="button" className="dx-btn dx-btn--danger" disabled={busy} onClick={() => decide('REJECT')}>Reject</button>}
          {!['APPROVED', 'PAID', 'REJECTED'].includes(c.status) && <button type="button" className="dx-btn dx-btn--primary" disabled={busy} onClick={() => decide('APPROVE')}>Approve</button>}
          {c.status === 'APPROVED' && <button type="button" className="dx-btn dx-btn--primary" disabled={busy} onClick={() => decide('PAID')}>Mark paid</button>}
        </div>
      </>)}
    </div></div>
  );
}

function Claims({ insurers }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [insurerId, setInsurerId] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    const p = new URLSearchParams(); if (status) p.set('status', status); if (insurerId) p.set('insurerId', insurerId);
    api(`${API}/claims?${p}`).then(r => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  }, [status, insurerId]);
  useEffect(() => { load(); }, [load]);
  const shown = rows.filter(r => !q || [r.claimRef, r.patientName, r.providerName, r.providerCode].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="dx-tabs">
        {[['', 'All'], ...Object.entries(CLAIM).map(([k, v]) => [k, v[0]])].map(([k, l]) => <button key={k || 'all'} type="button" className={`dx-tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}
        <select className="dx-select" value={insurerId} onChange={e => setInsurerId(e.target.value)} style={{ marginLeft: 'auto' }}><option value="">All insurers</option>{insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <input className="dx-input" placeholder="Search ref, patient, provider" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Ref</th><th>Date</th><th>Insurer</th><th>Patient</th><th>Provider</th><th>Total</th><th>Insurer pays</th><th>Patient</th><th>Status</th><th>Flags</th></tr></thead>
        <tbody>{shown.length ? <Paged items={shown} table>{(shown) => shown.map(r => (
          <tr key={r.id} className="dx-click" onClick={() => setOpen(r.id)}>
            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.claimRef}</td><td className="dx-card-hint">{when(r.createdAt)}</td><td>{r.insurerName}</td><td>{r.patientName || '—'}</td>
            <td>{r.providerName}<div className="dx-card-hint">{r.providerCode}</div></td><td>{money(r.totalAmount)}</td><td><b>{money(r.insurerAmount)}</b></td>
            <td className="dx-card-hint">{r.patientConfirmation === 'YES' ? '✓ confirmed' : r.patientConfirmation === 'NO' ? '✗ denied' : r.patientConfirmation === 'NO_REPLY' ? 'no reply' : 'waiting'}</td>
            <td><Pill map={CLAIM} k={r.status} /></td><td className="dx-card-hint">{JSON.parse(r.flagsJson || '[]').map(f => FLAG_LABEL[f] || f).join(', ')}</td>
          </tr>
        ))}</Paged> : <tr><td colSpan={10} className="dx-empty">No claims.</td></tr>}</tbody>
      </table></div></div>
      {open && <ClaimDrawer id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

function Checks({ insurers }) {
  const [rows, setRows] = useState([]);
  const [outcome, setOutcome] = useState('');
  const [insurerId, setInsurerId] = useState('');
  useEffect(() => {
    const p = new URLSearchParams(); if (outcome) p.set('outcome', outcome); if (insurerId) p.set('insurerId', insurerId);
    api(`${API}/checks?${p}`).then(r => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  }, [outcome, insurerId]);
  return (
    <>
      <div className="dx-tabs">
        {['', 'BLOCKED', 'COVERED', 'PARTIAL', 'NOT_COVERED', 'INACTIVE', 'ERROR'].map(k => <button key={k || 'all'} type="button" className={`dx-tab ${outcome === k ? 'on' : ''}`} onClick={() => setOutcome(k)}>{k ? k.replace('_', ' ').toLowerCase() : 'All'}</button>)}
        <select className="dx-select" value={insurerId} onChange={e => setInsurerId(e.target.value)} style={{ marginLeft: 'auto' }}><option value="">All insurers</option>{insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
      </div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>When</th><th>Insurer</th><th>Check</th><th>Patient</th><th>Provider</th><th>Outcome</th><th>Requested</th><th>Covered</th><th>Reason</th><th>Speed</th></tr></thead>
        <tbody>{rows.length ? <Paged items={rows} table>{(rows) => rows.map(r => (
          <tr key={r.id}><td className="dx-card-hint">{when(r.createdAt)}</td><td>{r.insurerName}</td><td>{String(r.purpose).replace(/_/g, ' ').toLowerCase()}</td><td>{r.patientName || '—'}</td><td>{r.providerName || '—'}</td>
            <td><Pill map={OUTCOME} k={r.outcome} /></td><td>{r.amountRequested != null ? money(r.amountRequested) : '—'}</td><td>{r.amountCovered != null ? money(r.amountCovered) : '—'}</td>
            <td className="dx-card-hint" style={{ maxWidth: 260 }}>{r.reason || ''}</td><td className="dx-card-hint">{r.latencyMs != null ? `${r.latencyMs} ms` : ''}</td></tr>
        ))}</Paged> : <tr><td colSpan={10} className="dx-empty">No checks yet.</td></tr>}</tbody>
      </table></div></div>
    </>
  );
}

function Network({ insurers }) {
  const [rows, setRows] = useState([]);
  const [insurerId, setInsurerId] = useState('');
  useEffect(() => { api(`${API}/provider-codes${insurerId ? `?insurerId=${insurerId}` : ''}`).then(r => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([])); }, [insurerId]);
  return (
    <>
      <div className="dx-card-head"><p className="dx-card-hint" style={{ margin: 0 }}>Providers enter the code their insurer gave them; it is checked with the insurer's API — no manual approval.</p>
        <select className="dx-select" value={insurerId} onChange={e => setInsurerId(e.target.value)}><option value="">All insurers</option>{insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Provider</th><th>Type</th><th>Insurer</th><th>Provider code</th><th>Status</th><th>Verified</th></tr></thead>
        <tbody>{rows.length ? <Paged items={rows} table>{(rows) => rows.map(r => (
          <tr key={r.id}><td><b>{r.providerName || '—'}</b><div className="dx-card-hint">{String(r.ownerKind).toLowerCase()}</div></td><td>{r.providerType}</td><td>{r.insurerName}</td><td style={{ fontFamily: 'monospace' }}>{r.providerCode}</td>
            <td><span className="dx-pill" style={r.status === 'VERIFIED' ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}>{r.status}</span>{r.statusReason ? <div className="dx-card-hint">{r.statusReason}</div> : null}</td>
            <td className="dx-card-hint">{when(r.verifiedAt)}</td></tr>
        ))}</Paged> : <tr><td colSpan={6} className="dx-empty">No provider codes yet.</td></tr>}</tbody>
      </table></div></div>
    </>
  );
}

export default function AdminInsurance() {
  const [tab, setTab] = useState('overview');
  const [insurers, setInsurers] = useState([]);
  const loadInsurers = useCallback(() => { api(`${API}/insurers`).then(r => setInsurers(Array.isArray(r) ? r : [])).catch(() => {}); }, []);
  useEffect(() => { loadInsurers(); }, [loadInsurers]);
  const TABS = [['overview', 'Overview'], ['claims', 'Claims'], ['preauth', 'Pre-auth'], ['fraud', 'Fraud (network)'], ['checks', 'Counter checks'], ['network', 'Provider network'],
    ['insurers', 'Insurers'], ['facilities', 'Facilities'], ['licences', 'Licence checks']];
  return (
    <div className="admin-page dx" style={{ padding: '1.5rem' }}>
      <div className="dx-hero"><div><h1>Insurance</h1><p>Insurers connected by API, members' cards, the provider network, checks at the counter and claims with proof.</p></div></div>
      <div className="dx-tabs">{TABS.map(([k, l]) => <button key={k} type="button" className={`dx-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'overview' && <Overview insurers={insurers} />}
      {tab === 'claims' && <Claims insurers={insurers} />}
      {tab === 'checks' && <Checks insurers={insurers} />}
      {tab === 'network' && <Network insurers={insurers} />}
      {tab === 'insurers' && <Insurers insurers={insurers} reload={loadInsurers} />}
      {tab === 'preauth' && <AdminAllPreauth />}
      {tab === 'fraud' && <AdminNetworkFraud />}
      {tab === 'facilities' && <AdminFacilities />}
      {tab === 'licences' && <AdminVerifications />}
    </div>
  );
}
