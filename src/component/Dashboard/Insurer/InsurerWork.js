import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  INS, money, when, CLAIM, PREAUTH, SEVERITY, FLAG_LABEL, flagsOf, Pill, Kpi, Modal, Page, Empty, useLoad, get, post, patch,
} from './insurerUi';
import { AttachmentLinks } from '../../Common/ProviderInsurance';
import Paged from '../../Common/Paged';

// ── Overview ─────────────────────────────────────────────────────────────────

export function InsOverview({ me }) {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const { data: d } = useLoad(() => get(`${INS}/overview?days=${days}`), [days]);
  const { data: brief } = useLoad(() => get(`${INS}/brief`), []);
  if (!d) return <Page title="Overview"><Empty>Loading…</Empty></Page>;
  const q = d.queue || {}; const pa = d.preauth || {}; const fr = d.fraud || {};
  const prevented = Number(d.blocked?.amount || 0) + Number(d.deniedByPatient?.amount || 0);
  const byStatus = Object.fromEntries((d.claimsByStatus || []).map(r => [r.status, r]));
  return (
    <Page title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}`} sub={`${me?.insurerName || 'Your insurer'} on NessaHub · ${me?.staffRole?.replace('_', ' ').toLowerCase()}`}
      actions={<div className="dx-seg">{[7, 30, 90, 365].map(n => <button key={n} type="button" className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n}d</button>)}</div>}>
      {brief?.text && <div className="dx-ai" style={{ marginBottom: 12 }}><b>Today’s brief</b>{'\n'}{brief.text}</div>}
      <div className="dx-alert" style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#14532d' }}>
        <span style={{ fontSize: '1.6rem' }}>🛡️</span>
        <div style={{ flex: 1 }}><strong style={{ fontSize: '1.05rem' }}>{money(prevented)} stopped before you paid it</strong>
          <p>{d.blocked?.count || 0} invalid requests blocked at the counter · {d.deniedByPatient?.count || 0} claims your members said they never received · last {d.days} days</p></div>
      </div>
      <div className="dx-today">
        <Kpi label="Claims to review" value={q.to_review || 0} color="#7c3aed" sub={`${q.queried || 0} queried`} onClick={() => navigate('/dashboard/claims')} />
        <Kpi label="Pre-auth open" value={pa.open || 0} color="#f59e0b" sub={`${pa.overdue || 0} past SLA`} onClick={() => navigate('/dashboard/preauth')} />
        <Kpi label="Fraud flags" value={fr.open || 0} color="#dc2626" sub={`${fr.high || 0} high · ${fr.cases || 0} cases`} onClick={() => navigate('/dashboard/fraud')} />
        <Kpi label="Ready to pay" value={money(q.payable)} color="#0f766e" sub={`${q.payable_count || 0} approved claims`} onClick={() => navigate('/dashboard/finance')} />
        <Kpi label="Members on NessaHub" value={d.verifiedCards} color="#2563eb" onClick={() => navigate('/dashboard/members')} />
        <Kpi label="Network providers" value={d.networkProviders} color="#0369a1" onClick={() => navigate('/dashboard/network')} />
        <Kpi label="Avg decision time" value={q.avg_decision_hours == null ? '—' : `${q.avg_decision_hours}h`} color="#8b5cf6" sub={`${q.auto_approved || 0} auto-approved`} />
        <Kpi label="Member confirmation" value={d.confirmationRate == null ? '—' : `${d.confirmationRate}%`} color="#16a34a" sub="Patients confirming receipt" />
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
          )) : <Empty>Nothing blocked in this period.</Empty>}
        </section>
        <section className="dx-card dx-span-12">
          <div className="dx-card-head"><h2 className="dx-card-title">Claims pipeline</h2></div>
          <div className="dx-pipeline">{Object.keys(CLAIM).map(k => (
            <button key={k} type="button" className="dx-stage" style={{ background: CLAIM[k][1], color: CLAIM[k][2] }} onClick={() => navigate('/dashboard/claims', { state: { status: k } })}>
              <span className="dx-stage-n">{byStatus[k]?.count || 0}</span><span className="dx-stage-l">{CLAIM[k][0]} · {money(byStatus[k]?.amount)}</span></button>
          ))}</div>
        </section>
        <section className="dx-card dx-span-12">
          <div className="dx-card-head"><h2 className="dx-card-title">Top providers by value</h2></div>
          {(d.topProviders || []).length ? (
            <table className="dx-table"><thead><tr><th>Provider</th><th>Claims</th><th>Value</th><th>Flagged</th></tr></thead>
              <tbody>{d.topProviders.map(p => <tr key={p.name}><td><b>{p.name || '—'}</b></td><td>{p.claims}</td><td>{money(p.amount)}</td><td style={{ color: p.flagged ? '#b91c1c' : undefined, fontWeight: p.flagged ? 800 : 400 }}>{p.flagged}</td></tr>)}</tbody></table>
          ) : <Empty>No claims yet.</Empty>}
        </section>
      </div>
    </Page>
  );
}

// ── Claims ───────────────────────────────────────────────────────────────────

function ClaimDrawer({ id, me, onClose, onChanged }) {
  const { data: c, reload } = useLoad(() => get(`${INS}/claims/${id}`), [id]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState('');
  const canDecide = ['ADMIN', 'CLAIMS_OFFICER', 'MEDICAL_REVIEWER'].includes(me?.staffRole);
  const canPay = ['ADMIN', 'FINANCE'].includes(me?.staffRole);
  const decide = async (decision) => {
    if ((decision === 'REJECT' || decision === 'QUERY') && !reason.trim()) { alert('Add a reason first.'); return; }
    setBusy(true);
    try { await post(`${INS}/claims/${id}/decision`, { decision, reason: reason.trim() || null }); setReason(''); await reload(); onChanged(); }
    catch (e) { alert(e?.message); } finally { setBusy(false); }
  };
  const review = async () => { setBusy(true); try { setAi((await post(`${INS}/claims/${id}/ai-review`)).review); } catch (e) { alert(e?.message); } finally { setBusy(false); } };
  if (!c) return <Modal title="Claim" onClose={onClose}><Empty>Loading…</Empty></Modal>;
  const flags = flagsOf(c.flagsJson);
  return (
    <Modal title={<>Claim {c.claimRef} <Pill map={CLAIM} k={c.status} /></>} sub={`${c.providerName} (${c.providerCode}) · ${c.serviceType} · ${when(c.createdAt)}`} onClose={onClose} width={900}
      footer={<>
        <button type="button" className="dx-btn" disabled={busy} onClick={review} style={{ marginRight: 'auto' }}>✨ AI review</button>
        {canDecide && ['SUBMITTED', 'FLAGGED', 'QUERIED', 'CONFIRMED'].includes(c.status) && <button type="button" className="dx-btn" disabled={busy} onClick={() => decide('QUERY')}>Query provider</button>}
        {canDecide && !['PAID', 'REJECTED', 'APPROVED'].includes(c.status) && <button type="button" className="dx-btn dx-btn--danger" disabled={busy} onClick={() => decide('REJECT')}>Reject</button>}
        {canDecide && !['APPROVED', 'PAID', 'REJECTED'].includes(c.status) && <button type="button" className="dx-btn dx-btn--primary" disabled={busy} onClick={() => decide('APPROVE')}>Approve</button>}
        {canPay && c.status === 'APPROVED' && <button type="button" className="dx-btn dx-btn--primary" disabled={busy} onClick={() => decide('PAID')}>Mark paid</button>}
      </>}>
      <div className="dx-today" style={{ marginBottom: 0 }}>
        <Kpi label="Total" value={money(c.totalAmount)} color="#64748b" /><Kpi label="You pay" value={money(c.insurerAmount)} color="#1d4ed8" /><Kpi label="Member paid" value={money(c.patientAmount)} color="#0f766e" />
        <Kpi label="Member confirmed" value={c.patientConfirmation === 'YES' ? '✓ Yes' : c.patientConfirmation === 'NO' ? '✗ No' : c.patientConfirmation === 'NO_REPLY' ? 'No reply' : c.patientConfirmation === 'NOT_REQUIRED' ? 'Not required' : 'Waiting'}
          color={c.patientConfirmation === 'YES' ? '#16a34a' : c.patientConfirmation === 'NO' ? '#dc2626' : '#f59e0b'} sub={c.patientConfirmedAt ? when(c.patientConfirmedAt) : undefined} />
      </div>
      {(flags.length > 0 || (c.flags || []).length > 0) && (
        <div className="dx-alert dx-alert--red" style={{ marginBottom: 0 }}><div><strong>Watch</strong>
          <p>{[...flags.map(f => FLAG_LABEL[f] || f), ...(c.flags || []).map(f => `${f.ruleLabel}: ${f.detail}`)].join(' · ')}</p></div></div>
      )}
      {ai && <div className="dx-ai">{ai}</div>}
      <table className="dx-table"><thead><tr><th>Item</th><th>Code</th><th>Qty</th><th>Unit</th><th>Amount</th><th>Covered</th><th>Note</th></tr></thead>
        <tbody>{(c.lines || []).map((l, i) => <tr key={i}><td><b>{l.description}</b></td><td className="dx-card-hint">{l.code || ''}</td><td>{Number(l.quantity)}</td><td>{money(l.unitPrice)}</td><td>{money(l.amount)}</td><td>{money(l.coveredAmount)}</td><td className="dx-card-hint">{l.note || ''}</td></tr>)}</tbody></table>
      <div className="dx-two">
        <div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>Proof</div>
          {Array.isArray(c.evidence?.attachments) && c.evidence.attachments.length > 0 && <div style={{ marginBottom: 6 }}><AttachmentLinks list={c.evidence.attachments} /></div>}
          {Object.entries(c.evidence || {}).filter(([k]) => k !== 'eligibility' && k !== 'attachments').map(([k, v]) => <div key={k} style={{ fontSize: '0.8rem', marginBottom: 3 }}><span className="dx-card-hint">{k}:</span> <code>{Array.isArray(v) ? `${v.length} record(s)` : typeof v === 'object' ? JSON.stringify(v) : String(v)}</code></div>)}</div>
        <div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>History</div>
          {(c.events || []).map((e, i) => <div key={i} style={{ fontSize: '0.8rem', borderLeft: '3px solid #1d4ed8', paddingLeft: 8, marginBottom: 6 }}><b>{e.eventType.replace(/_/g, ' ').toLowerCase()}</b>{e.detail ? ` — ${e.detail}` : ''}<div className="dx-card-hint">{when(e.createdAt)}</div></div>)}</div>
      </div>
      {c.decisionReason && <p style={{ margin: 0, fontSize: '0.84rem' }}><b>Decision note:</b> {c.decisionReason}</p>}
      {canDecide && <div className="dx-field"><label>Reason / note (needed to reject or query)</label><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} /></div>}
    </Modal>
  );
}

export function InsClaims({ me, initialStatus }) {
  const [status, setStatus] = useState(initialStatus || 'SUBMITTED');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState({});
  const [open, setOpen] = useState(null);
  const { data, reload } = useLoad(() => get(`${INS}/claims${status ? `?status=${status}` : ''}`), [status]);
  const rows = (data || []).filter(r => !q || [r.claimRef, r.patientName, r.providerName, r.providerCode].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())));
  const chosen = Object.keys(sel).filter(k => sel[k]);
  const bulk = async () => {
    try { const r = await post(`${INS}/claims/bulk-approve`, { ids: chosen }); alert(`Approved ${r.approved}${r.skipped.length ? ` · skipped ${r.skipped.join(', ')} (flagged or not ready)` : ''}`); setSel({}); reload(); }
    catch (e) { alert(e?.message); }
  };
  return (
    <Page title="Claims" sub="Every claim arrives with proof and the member’s confirmation. Clean ones can be approved in bulk."
      actions={chosen.length > 0 && <button type="button" className="dx-btn dx-btn--primary" onClick={bulk}>Approve {chosen.length} selected</button>}>
      <div className="dx-tabs">
        {[['SUBMITTED', 'To review'], ['FLAGGED', 'Flagged'], ['QUERIED', 'Queried'], ['AWAITING_PATIENT', 'Awaiting member'], ['APPROVED', 'Approved'], ['PAID', 'Paid'], ['REJECTED', 'Rejected'], ['', 'All']].map(([k, l]) => (
          <button key={k || 'all'} type="button" className={`dx-tab ${status === k ? 'on' : ''}`} onClick={() => { setStatus(k); setSel({}); }}>{l}</button>))}
        <input className="dx-input" style={{ marginLeft: 'auto', minWidth: 240 }} placeholder="Search ref, member, provider" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr>{status === 'SUBMITTED' && <th />}<th>Ref</th><th>Date</th><th>Member</th><th>Provider</th><th>Service</th><th>You pay</th><th>Member</th><th>Status</th><th>Flags</th></tr></thead>
        <tbody>{rows.length ? <Paged items={rows} table>{(rows) => rows.map(r => (
          <tr key={r.id} className="dx-click" onClick={() => setOpen(r.id)}>
            {status === 'SUBMITTED' && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={!!sel[r.id]} onChange={e => setSel(s => ({ ...s, [r.id]: e.target.checked }))} /></td>}
            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.claimRef}</td><td className="dx-card-hint">{when(r.createdAt)}</td><td>{r.patientName || '—'}</td>
            <td>{r.providerName}<div className="dx-card-hint">{r.providerCode}</div></td><td>{r.serviceType}</td><td><b>{money(r.insurerAmount)}</b></td>
            <td className="dx-card-hint">{r.patientConfirmation === 'YES' ? '✓' : r.patientConfirmation === 'NO' ? '✗ denied' : r.patientConfirmation === 'NO_REPLY' ? 'no reply' : r.patientConfirmation === 'NOT_REQUIRED' ? '—' : '…'}</td>
            <td><Pill map={CLAIM} k={r.status} /></td><td className="dx-card-hint">{flagsOf(r.flagsJson).map(f => FLAG_LABEL[f] || f).join(', ')}</td>
          </tr>))}</Paged> : <tr><td colSpan={10}><Empty>Nothing here.</Empty></td></tr>}</tbody>
      </table></div></div>
      {open && <ClaimDrawer id={open} me={me} onClose={() => setOpen(null)} onChanged={reload} />}
    </Page>
  );
}

// ── Pre-authorisation desk ───────────────────────────────────────────────────

function sla(r) {
  if (!['PENDING', 'QUERIED'].includes(r.status)) return null;
  const hrs = (new Date(r.slaDueAt).getTime() - Date.now()) / 3600000;
  const cls = hrs < 0 ? 'late' : hrs < 4 ? 'soon' : 'ok';
  return <span className={`dx-sla dx-sla--${cls}`}>{hrs < 0 ? `${Math.abs(hrs).toFixed(0)}h late` : `${hrs.toFixed(0)}h left`}</span>;
}
const items = (json) => { try { return JSON.parse(json || '[]'); } catch { return []; } };

function PreauthDrawer({ id, me, onClose, onChanged }) {
  const { data: p, reload } = useLoad(() => get(`${INS}/preauth/${id}`), [id]);
  const [form, setForm] = useState({ reason: '', approvedAmount: '', validDays: 30 });
  const [ai, setAi] = useState('');
  const [busy, setBusy] = useState(false);
  const canDecide = ['ADMIN', 'MEDICAL_REVIEWER'].includes(me?.staffRole);
  useEffect(() => { if (p?.aiSummary) setAi(p.aiSummary); }, [p?.aiSummary]);
  const decide = async (decision) => {
    setBusy(true);
    try { await post(`${INS}/preauth/${id}/decision`, { decision, reason: form.reason.trim() || null, approvedAmount: form.approvedAmount ? Number(form.approvedAmount) : null, validDays: Number(form.validDays) || 30 }); await reload(); onChanged(); }
    catch (e) { alert(e?.message); } finally { setBusy(false); }
  };
  const summarise = async () => { setBusy(true); try { setAi((await post(`${INS}/preauth/${id}/ai-summary`)).summary); } catch (e) { alert(e?.message); } finally { setBusy(false); } };
  if (!p) return <Modal title="Pre-authorisation" onClose={onClose}><Empty>Loading…</Empty></Modal>;
  const open = ['PENDING', 'QUERIED'].includes(p.status);
  return (
    <Modal title={<>{p.ref} <Pill map={PREAUTH} k={p.status} /> {sla(p)}</>} sub={`${p.patientName} · ${p.providerName} (${p.providerType}) · ${when(p.createdAt)}`} onClose={onClose} width={880}
      footer={<>
        <button type="button" className="dx-btn" disabled={busy} onClick={summarise} style={{ marginRight: 'auto' }}>✨ AI case summary</button>
        {canDecide && open && <>
          <button type="button" className="dx-btn" disabled={busy} onClick={() => decide('QUERY')}>Ask for more</button>
          <button type="button" className="dx-btn dx-btn--danger" disabled={busy} onClick={() => decide('REJECT')}>Reject</button>
          <button type="button" className="dx-btn" disabled={busy} onClick={() => decide('PARTIAL')}>Approve part</button>
          <button type="button" className="dx-btn dx-btn--primary" disabled={busy} onClick={() => decide('APPROVE')}>Approve</button>
        </>}
      </>}>
      <div className="dx-today" style={{ marginBottom: 0 }}>
        <Kpi label="Requested" value={money(p.estimatedAmount)} color="#f59e0b" /><Kpi label="Approved" value={p.approvedAmount == null ? '—' : money(p.approvedAmount)} color="#16a34a" />
        <Kpi label="Member’s spend this year" value={money(p.memberSpendThisYear)} color="#1d4ed8" /><Kpi label="Earlier requests" value={p.previousRequests} color="#64748b" />
      </div>
      {ai && <div className="dx-ai">{ai}</div>}
      <table className="dx-table"><thead><tr><th>Asked for</th><th>Code</th><th>Qty</th><th>Unit price</th></tr></thead>
        <tbody>{items(p.itemsJson).map((it, i) => <tr key={i}><td><b>{it.description}</b></td><td>{it.code || ''}</td><td>{Number(it.quantity || 1)}</td><td>{it.unitPrice != null ? money(it.unitPrice) : '—'}</td></tr>)}</tbody></table>
      <div className="dx-two">
        <div><div className="dx-kpi-label">Diagnosis</div><p style={{ margin: '4px 0 0' }}><b>{p.diagnosisIcd || '—'}</b> {p.diagnosisText || ''}</p></div>
        <div><div className="dx-kpi-label">Service</div><p style={{ margin: '4px 0 0' }}>{p.serviceType}</p></div>
      </div>
      <div><div className="dx-kpi-label">Clinical reason</div><p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: '0.86rem' }}>{p.clinicalNotes}</p></div>
      {items(p.attachmentsJson).length > 0 && <div><div className="dx-kpi-label" style={{ marginBottom: 4 }}>Supporting documents from the provider</div><AttachmentLinks json={p.attachmentsJson} /></div>}
      {p.decisionReason && <p style={{ margin: 0 }}><b>Decision note:</b> {p.decisionReason}</p>}
      {(p.events || []).length > 0 && <div>{p.events.map((e, i) => <div key={i} className="dx-card-hint" style={{ borderLeft: '3px solid #c7d2fe', paddingLeft: 8, marginBottom: 4 }}><b>{e.eventType.toLowerCase()}</b> {e.detail || ''} · {when(e.createdAt)}</div>)}</div>}
      {canDecide && open && (
        <div className="dx-two">
          <div className="dx-field"><label>Reason / note (needed to reject, part-approve or query)</label><textarea rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
          <div className="dx-two">
            <div className="dx-field"><label>Approved amount (part)</label><input className="dx-input" type="number" value={form.approvedAmount} onChange={e => setForm({ ...form, approvedAmount: e.target.value })} /></div>
            <div className="dx-field"><label>Valid for (days)</label><input className="dx-input" type="number" value={form.validDays} onChange={e => setForm({ ...form, validDays: e.target.value })} /></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function InsPreauth({ me }) {
  const [status, setStatus] = useState('PENDING');
  const [open, setOpen] = useState(null);
  const { data, reload } = useLoad(() => get(`${INS}/preauth${status ? `?status=${status}` : ''}`), [status]);
  useEffect(() => { const t = setInterval(reload, 60000); return () => clearInterval(t); }, [reload]);
  return (
    <Page title="Pre-authorisation desk" sub="Requests from providers before expensive or restricted care. Oldest deadline first.">
      <div className="dx-tabs">{[['PENDING', 'Pending'], ['QUERIED', 'Queried'], ['APPROVED', 'Approved'], ['PARTIAL', 'Partly approved'], ['REJECTED', 'Rejected'], ['USED', 'Used'], ['', 'All']].map(([k, l]) => (
        <button key={k || 'all'} type="button" className={`dx-tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>))}</div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Ref</th><th>Member</th><th>Provider</th><th>Service</th><th>Asked for</th><th>Amount</th><th>Deadline</th><th>Status</th></tr></thead>
        <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(r => (
          <tr key={r.id} className={`dx-click ${r.overdue ? 'dx-urgent' : ''}`} onClick={() => setOpen(r.id)}>
            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.ref}</td><td>{r.patientName}</td><td>{r.providerName}<div className="dx-card-hint">{r.providerType}</div></td><td>{r.serviceType}</td>
            <td className="dx-card-hint" style={{ maxWidth: 240 }}>{items(r.itemsJson).map(i => i.description).join(', ')}</td><td>{money(r.estimatedAmount)}</td><td>{sla(r) || <span className="dx-card-hint">{when(r.decidedAt)}</span>}</td><td><Pill map={PREAUTH} k={r.status} /></td>
          </tr>))}</Paged> : <tr><td colSpan={8}><Empty>No requests.</Empty></td></tr>}</tbody>
      </table></div></div>
      {open && <PreauthDrawer id={open} me={me} onClose={() => setOpen(null)} onChanged={reload} />}
    </Page>
  );
}

// ── Fraud & audit ────────────────────────────────────────────────────────────

export function InsFraud({ me }) {
  const [tab, setTab] = useState('flags');
  const [status, setStatus] = useState('OPEN');
  const [sel, setSel] = useState({});
  const [openCase, setOpenCase] = useState(null);
  const flags = useLoad(() => get(`${INS}/fraud/flags${status ? `?status=${status}` : ''}`), [status]);
  const cases = useLoad(() => get(`${INS}/fraud/cases`), []);
  const can = ['ADMIN', 'CLAIMS_OFFICER', 'MEDICAL_REVIEWER'].includes(me?.staffRole);
  const chosen = Object.keys(sel).filter(k => sel[k]);
  const setFlag = async (id, s) => { try { await patch(`${INS}/fraud/flags/${id}`, { status: s }); flags.reload(); } catch (e) { alert(e?.message); } };
  const makeCase = async () => {
    const title = window.prompt('Case title (e.g. "Phantom dispensing at X pharmacy")');
    if (!title) return;
    try { const c = await post(`${INS}/fraud/cases`, { title, flagIds: chosen }); setSel({}); flags.reload(); cases.reload(); setOpenCase(c.id); setTab('cases'); } catch (e) { alert(e?.message); }
  };
  return (
    <Page title="Fraud & audit" sub="Explainable signals from NessaHub’s whole network — never a model’s guess. Group them into cases to investigate."
      actions={can && chosen.length > 0 && <button type="button" className="dx-btn dx-btn--primary" onClick={makeCase}>Open case with {chosen.length} flag(s)</button>}>
      <div className="dx-tabs">
        <button type="button" className={`dx-tab ${tab === 'flags' ? 'on' : ''}`} onClick={() => setTab('flags')}>Flags</button>
        <button type="button" className={`dx-tab ${tab === 'cases' ? 'on' : ''}`} onClick={() => setTab('cases')}>Cases<b>{(cases.data || []).length}</b></button>
        {tab === 'flags' && <select className="dx-select" style={{ marginLeft: 'auto' }} value={status} onChange={e => setStatus(e.target.value)}>
          {[['OPEN', 'Open'], ['REVIEWING', 'Reviewing'], ['CONFIRMED', 'Confirmed'], ['DISMISSED', 'Dismissed'], ['', 'All']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      </div>
      {tab === 'flags' ? (
        <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
          <thead><tr>{can && <th />}<th>Severity</th><th>Signal</th><th>Who</th><th>Detail</th><th>Claim</th><th>When</th><th>Status</th>{can && <th />}</tr></thead>
          <tbody>{(flags.data || []).length ? flags.data.map(f => (
            <tr key={f.id}>
              {can && <td><input type="checkbox" checked={!!sel[f.id]} onChange={e => setSel(s => ({ ...s, [f.id]: e.target.checked }))} /></td>}
              <td><Pill map={SEVERITY} k={f.severity} /></td><td><b>{f.ruleLabel}</b></td><td>{f.subjectName || '—'}<div className="dx-card-hint">{String(f.subjectType).toLowerCase()}</div></td>
              <td style={{ maxWidth: 320 }}>{f.detail}</td><td style={{ fontFamily: 'monospace' }}>{f.claimRef || '—'}</td><td className="dx-card-hint">{when(f.createdAt)}</td>
              <td>{f.caseRef ? <span className="dx-pill" style={{ background: '#e0e7ff', color: '#3730a3' }}>{f.caseRef}</span> : f.status.toLowerCase()}</td>
              {can && <td style={{ whiteSpace: 'nowrap' }}>{f.status === 'OPEN' && <><button type="button" className="dx-btn dx-btn--sm" onClick={() => setFlag(f.id, 'REVIEWING')}>Review</button> <button type="button" className="dx-btn dx-btn--sm" onClick={() => setFlag(f.id, 'DISMISSED')}>Dismiss</button></>}</td>}
            </tr>)) : <tr><td colSpan={9}><Empty>No flags. 👍</Empty></td></tr>}</tbody>
        </table></div></div>
      ) : (
        <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
          <thead><tr><th>Case</th><th>Title</th><th>Flags</th><th>At risk</th><th>Status</th><th>Assignee</th><th>Updated</th></tr></thead>
          <tbody>{(cases.data || []).length ? cases.data.map(c => (
            <tr key={c.id} className="dx-click" onClick={() => setOpenCase(c.id)}><td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.ref}</td><td><b>{c.title}</b></td><td>{c.flags}</td><td>{money(c.amountAtRisk)}</td>
              <td>{c.status.toLowerCase()}</td><td>{c.assignee || '—'}</td><td className="dx-card-hint">{when(c.updatedAt)}</td></tr>)) : <tr><td colSpan={7}><Empty>No cases yet. Select flags and open one.</Empty></td></tr>}</tbody>
        </table></div></div>
      )}
      {openCase && <CaseDrawer id={openCase} can={can} onClose={() => setOpenCase(null)} onChanged={() => { cases.reload(); flags.reload(); }} />}
    </Page>
  );
}

function CaseDrawer({ id, can, onClose, onChanged }) {
  const { data: c, reload } = useLoad(() => get(`${INS}/fraud/cases/${id}`), [id]);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const save = async (status) => {
    try { await patch(`${INS}/fraud/cases/${id}`, { status: status || null, note: note.trim() || null, outcome: outcome.trim() || null }); setNote(''); await reload(); onChanged(); } catch (e) { alert(e?.message); }
  };
  if (!c) return <Modal title="Case" onClose={onClose}><Empty>Loading…</Empty></Modal>;
  let notes = []; try { notes = JSON.parse(c.notes || '[]'); } catch { notes = []; }
  return (
    <Modal title={`${c.ref} · ${c.title}`} sub={`${c.status.toLowerCase()} · ${money(c.amountAtRisk)} at risk`} onClose={onClose} width={860}
      footer={can && <>
        <button type="button" className="dx-btn" onClick={() => save(null)} disabled={!note.trim()}>Add note</button>
        <button type="button" className="dx-btn" onClick={() => save('INVESTIGATING')}>Investigating</button>
        <button type="button" className="dx-btn" onClick={() => save('DISMISSED')}>Dismiss</button>
        <button type="button" className="dx-btn dx-btn--danger" onClick={() => save('CONFIRMED')}>Confirm fraud</button>
      </>}>
      <table className="dx-table"><thead><tr><th>Signal</th><th>Who</th><th>Detail</th><th>Claim</th><th>Amount</th></tr></thead>
        <tbody>{(c.flagList || []).map(f => <tr key={f.id}><td><Pill map={SEVERITY} k={f.severity} /> {f.rule.replace(/_/g, ' ').toLowerCase()}</td><td>{f.subjectName}</td><td>{f.detail}</td><td>{f.claimRef || '—'}</td><td>{f.amount != null ? money(f.amount) : '—'}</td></tr>)}</tbody></table>
      <div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>Investigation notes</div>
        {notes.length ? <Paged items={notes}>{(notes) => notes.map((n, i) => <div key={i} style={{ fontSize: '0.84rem', borderLeft: '3px solid #1d4ed8', paddingLeft: 8, marginBottom: 6 }}>{n.text}<div className="dx-card-hint">{when(n.at)}</div></div>)}</Paged> : <Empty>No notes yet.</Empty>}</div>
      {c.outcome && <p style={{ margin: 0 }}><b>Outcome:</b> {c.outcome}</p>}
      {can && <div className="dx-two">
        <div className="dx-field"><label>Note</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        <div className="dx-field"><label>Outcome (when closing)</label><textarea rows={2} value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="e.g. Provider suspended, GHS 1,200 recovered" /></div>
      </div>}
    </Modal>
  );
}
