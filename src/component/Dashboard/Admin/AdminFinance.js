import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import '../../Common/CareTransfers.css';
import './AdminApplications.css';
import './AdminFinance.css';

/**
 * NessaHub's money in one place: what patients paid, NessaHub's commission and
 * service fees, refunds, what each provider is owed, and the monthly payouts
 * that settle it. Commission and fee rates are set in System Config → Payments.
 */
const GHS = (v) => `GHS ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const SERVICE = { consultation: 'Doctor consultations', therapy: 'Therapy', psychiatry: 'Psychiatry', diagnostics: 'Lab & scan', pharmacy: 'Pharmacy', homecare: 'Home care', other: 'Memberships & other' };
const STATE = { PENDING: ['Pending', '#d97706'], AVAILABLE: ['Available', '#16a34a'], IN_PAYOUT: ['In payout', '#4f46e5'], PAID_OUT: ['Paid out', '#0f766e'], REFUNDED: ['Refunded', '#64748b'] };
const REFUND = { UNDER_REVIEW: ['Needs review', '#d97706'], APPROVED: ['Approved — to send', '#4f46e5'], PROCESSING: ['Sending', '#0891b2'], REFUNDED: ['Refunded', '#16a34a'], DECLINED: ['Declined', '#64748b'], FAILED: ['Failed', '#dc2626'] };
const BATCH = { DRAFT: ['Draft', '#d97706'], APPROVED: ['Approved — sending', '#4f46e5'], PAID: ['Completed', '#16a34a'], CANCELLED: ['Cancelled', '#64748b'] };
const ITEM = { PENDING: ['To send', '#d97706'], PAID: ['Paid', '#16a34a'], FAILED: ['Failed', '#dc2626'], HELD: ['Held', '#64748b'] };

function Chip({ map, value }) {
  const [label, color] = map[value] || [value, '#64748b'];
  return <span className="aa-chip sm" style={{ background: color }}>{label}</span>;
}

export default function AdminFinance() {
  const [tab, setTab] = useState('overview');
  const tabs = [['overview', 'Overview'], ['balances', 'Provider balances'], ['refunds', 'Refunds'], ['payouts', 'Payouts'], ['methods', 'Payout details']];
  return (
    <div className="ct-page aa-page">
      <div className="ct-head">
        <h2>Finance</h2>
        <p>Payments, NessaHub's earnings, refunds and provider payouts. Commission and fee rates are set in System Config → Payments.</p>
      </div>
      <div className="ct-tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ct-tab${tab === k ? ' is-active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'overview' && <Overview onTab={setTab} />}
      {tab === 'balances' && <Balances />}
      {tab === 'refunds' && <Refunds />}
      {tab === 'payouts' && <Payouts />}
      {tab === 'methods' && <Methods />}
    </div>
  );
}

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`af-tile${tone ? ` ${tone}` : ''}`}>
      <span className="af-tile-label">{label}</span>
      <strong className="af-tile-value">{value}</strong>
      {sub ? <span className="af-tile-sub">{sub}</span> : null}
    </div>
  );
}

function Overview({ onTab }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setD(null);
    api(`/api/v1/finance/admin/overview?from=${from}&to=${to}`).then(setD).catch((e) => setError(e.message));
  }, [from, to]);

  return (
    <>
      <div className="af-period">
        <label>From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error ? <div className="ct-error">{error}</div> : null}
      {!d ? <div className="ct-empty">Loading…</div> : (
        <>
          {(d.refundsAwaitingReview > 0 || d.refundsToSend > 0) ? (
            <div className="ct-status-note">
              {d.refundsAwaitingReview > 0 ? `${d.refundsAwaitingReview} refund request(s) need a decision. ` : ''}
              {d.refundsToSend > 0 ? `${d.refundsToSend} approved refund(s) still to send. ` : ''}
              <button type="button" className="ct-btn ghost" onClick={() => onTab('refunds')}>Open refunds</button>
            </div>
          ) : null}
          <div className="af-tiles">
            <Tile label="Patients paid" value={GHS(d.collected)} sub={`${d.payments} payments`} />
            <Tile label="Refunded" value={GHS(d.refunded)} tone="warn" />
            <Tile label="NessaHub revenue" value={GHS(d.nessaHubRevenue)} sub="Commission + service fees − free consultations" tone="ok" />
            <Tile label="Commission" value={GHS(d.commission)} />
            <Tile label="Patient service fees" value={GHS(d.serviceFees)} />
            <Tile label="Insurer platform fees" value={GHS(d.insurerFees)} sub="To invoice insurers" />
            <Tile label="Est. Paystack fees" value={GHS(d.estimatedProcessorFees)} sub={`${d.processorPercent}% of payments, paid by NessaHub`} tone="warn" />
            <Tile label="NessaHub net" value={GHS(d.nessaHubNet)} sub="Revenue + insurer fees − Paystack" tone="ok" />
            <Tile label="Provider earnings" value={GHS(d.providerEarnings)} sub="Earned in this period" />
            <Tile label="Paid out to providers" value={GHS(d.paidOut)} />
            <Tile label="Tax collected" value={GHS(d.tax)} />
            <Tile label="Free consultations" value={GHS(d.freeConsultationCost)} sub={`${d.freeConsultations} — NessaHub pays the clinician`} />
          </div>

          <section className="ct-card">
            <h3>By service</h3>
            <div className="aa-table-wrap">
              <table className="aa-table">
                <thead><tr><th>Service</th><th>Payments</th><th>Booking value</th><th>Commission</th><th>Service fees</th><th>Refunded</th><th>Commission rate</th></tr></thead>
                <tbody>
                  {d.byService.map((r) => (
                    <tr key={r.service}>
                      <td>{SERVICE[r.service] || r.service}</td><td>{r.payments}</td><td>{GHS(r.bookingValue)}</td><td>{GHS(r.commission)}</td>
                      <td>{GHS(r.serviceFees)}</td><td>{GHS(r.refunded)}</td><td>{d.rates.commissionPercent[r.service] != null ? `${d.rates.commissionPercent[r.service]}%` : '—'}</td>
                    </tr>
                  ))}
                  {d.byService.length === 0 ? <tr><td colSpan={7} className="ct-meta">No payments in this period.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <div className="aa-grid">
            <section className="ct-card">
              <h3>Current rates</h3>
              <ul className="af-rates">
                {Object.entries(d.rates.commissionPercent).map(([k, v]) => <li key={k}><span>{SERVICE[k] || k} commission</span><strong>{v}%</strong></li>)}
                <li><span>Patient service fee (added at checkout)</span><strong>{d.rates.patientServiceFeePercent}%</strong></li>
                <li><span>Tax added at checkout</span><strong>{d.rates.taxPercent}%</strong></li>
                <li><span>Payout day / minimum</span><strong>Day {d.rates.payoutDayOfMonth} · {GHS(d.rates.payoutMinimum)}</strong></li>
              </ul>
              <button type="button" className="ct-btn" onClick={() => navigate('/dashboard/system-config')}>Change rates in System Config</button>
            </section>
            <section className="ct-card">
              <h3>Insurer platform fees</h3>
              <p className="ct-meta">Insurers pay their providers directly; NessaHub charges each insurer a fee per claim, invoiced monthly.</p>
              <ul className="af-rates">
                {d.insurers.map((i) => <li key={i.insurer}><span>{i.insurer} — {i.claims} claims × {GHS(i.feePerClaim)}</span><strong>{GHS(i.fees)}</strong></li>)}
                {d.insurers.length === 0 ? <li className="ct-meta">No claims in this period.</li> : null}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Balances() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [ledger, setLedger] = useState(null);
  useEffect(() => { api('/api/v1/finance/admin/balances').then(setRows).catch(() => setRows([])); }, []);
  const show = async (id) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setLedger(null);
    setLedger(await api(`/api/v1/finance/admin/providers/${id}/ledger`).catch(() => []));
  };
  if (!rows) return <div className="ct-empty">Loading…</div>;
  return (
    <div className="aa-table-wrap">
      <table className="aa-table">
        <thead><tr><th>Provider</th><th>Pending</th><th>Available</th><th>Adjustments</th><th>Next payout</th><th>In payout</th><th>Paid out</th><th>Payout details</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <React.Fragment key={r.providerId}>
              <tr onClick={() => show(r.providerId)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && show(r.providerId)}>
                <td><strong>{r.name}</strong><div className="ct-meta">{String(r.role || '').toLowerCase().replace('_', ' ')} · {r.bookings} bookings</div></td>
                <td>{GHS(r.pending)}</td><td>{GHS(r.available)}</td><td>{GHS(r.adjustments)}</td>
                <td><strong>{GHS(r.balance)}</strong></td><td>{GHS(r.inPayout)}</td><td>{GHS(r.paidOut)}</td>
                <td>{r.payoutMethod ? <>{r.payoutMethod} {r.payoutMethodVerified ? '✓' : <span className="ct-field-error">not confirmed</span>}</> : <span className="ct-field-error">none</span>}</td>
              </tr>
              {open === r.providerId ? (
                <tr className="af-sub"><td colSpan={8}>{!ledger ? 'Loading…' : <Ledger rows={ledger} />}</td></tr>
              ) : null}
            </React.Fragment>
          ))}
          {rows.length === 0 ? <tr><td colSpan={8} className="ct-meta">No provider earnings yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

export function Ledger({ rows }) {
  return (
    <div className="aa-table-wrap">
      <table className="aa-table">
        <thead><tr><th>Paid</th><th>Patient</th><th>Service</th><th>Price</th><th>Commission</th><th>Refund deducted</th><th>Earning</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.reference}>
              <td>{fmt(e.paidAt)}{e.serviceAt ? <div className="ct-meta">Session {fmt(e.serviceAt)}</div> : null}</td>
              <td>{e.patientName || '—'}{e.freeConsultation ? <div className="ct-meta">Free first consultation (NessaHub pays)</div> : null}</td>
              <td>{SERVICE[e.serviceType] || e.serviceType}</td>
              <td>{GHS(e.price)}</td><td>{GHS(e.commission)} ({e.commissionPercent}%)</td>
              <td>{Number(e.refundDeducted) > 0 ? `− ${GHS(e.refundDeducted)}` : '—'}</td>
              <td><strong>{GHS(e.net)}</strong></td>
              <td><Chip map={STATE} value={e.state} />{e.state === 'PENDING' ? <div className="ct-meta">Available {fmt(e.clearsAt)}</div> : null}</td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={8} className="ct-meta">No bookings yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function Refunds() {
  const [status, setStatus] = useState('UNDER_REVIEW');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api(`/api/v1/finance/admin/refunds${status ? `?status=${status}` : ''}`).then(setRows).catch((e) => { setError(e.message); setRows([]); });
  }, [status]);
  useEffect(() => { setRows(null); load(); }, [load]);
  return (
    <>
      <div className="aa-stagebar">
        {[['UNDER_REVIEW', 'Needs review'], ['APPROVED', 'Approved — to send'], ['FAILED', 'Failed'], ['REFUNDED', 'Refunded'], ['DECLINED', 'Declined'], ['', 'All']].map(([k, l]) => (
          <button key={k} type="button" className={`aa-stagepill${status === k ? ' is-on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {error ? <div className="ct-error">{error}</div> : null}
      {!rows ? <div className="ct-empty">Loading…</div> : rows.length === 0 ? <div className="ct-empty">Nothing here.</div> : (
        <div className="ct-list">{rows.map((r) => <RefundCard key={r.id} r={r} onChanged={load} />)}</div>
      )}
    </>
  );
}

function RefundCard({ r, onChanged }) {
  const left = Number(r.paid) - Number(r.refunded);
  const [amount, setAmount] = useState(String(left.toFixed(2)));
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const act = async (fn, ok) => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try { await fn(); setMsg({ ok, err: '' }); onChanged(); } catch (e) { setMsg({ ok: '', err: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="ct-card">
      <div className="ct-card-row">
        <div>
          <h3>{r.patientName} — {GHS(r.paid)} paid{r.providerName ? ` to ${r.providerName}` : ''}</h3>
          <p className="ct-meta">{r.reason.replaceAll('_', ' ').toLowerCase()} · requested {fmt(r.createdAt)} · ref {r.reference}</p>
          {r.hoursBefore != null ? <p className="ct-meta">{Number(r.hoursBefore) >= 0 ? `${Number(r.hoursBefore).toFixed(1)} h before the session` : `${Math.abs(Number(r.hoursBefore)).toFixed(1)} h after the session`}</p> : null}
        </div>
        <Chip map={REFUND} value={r.status} />
      </div>
      {r.details ? <div className="ct-section"><h4>What the patient said</h4><p>{r.details}</p></div> : null}
      <div className="ct-section"><h4>Policy</h4><p>{r.policyNote}</p></div>
      {r.approvedAmount != null ? <p className="ct-meta">Approved: {GHS(r.approvedAmount)}{r.decidedBy ? ` by ${r.decidedBy}` : ''}{r.refundReference ? ` · refund ref ${r.refundReference}` : ''}</p> : null}
      {r.decisionNote ? <p className="ct-meta">Note: {r.decisionNote}</p> : null}
      {r.failureReason ? <div className="ct-error">{r.failureReason}</div> : null}

      {r.status === 'UNDER_REVIEW' ? (
        <div className="ct-section">
          <div className="ct-grid">
            <div className="ct-field"><label htmlFor={`amt-${r.id}`}>Amount to refund (up to {GHS(left)})</label>
              <input id={`amt-${r.id}`} type="number" min="0" step="0.01" max={left} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="ct-field"><label htmlFor={`note-${r.id}`}>Note to the patient</label>
              <input id={`note-${r.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required to decline" /></div>
          </div>
          <div className="ct-actions">
            <button type="button" className="ct-btn primary" disabled={busy} onClick={() => act(() => api(`/api/v1/finance/admin/refunds/${r.id}/decision`, { method: 'POST', body: { approve: true, amount: Number(amount), note } }), 'Approved and sent.')}>Approve and refund</button>
            <button type="button" className="ct-btn danger" disabled={busy || !note.trim()} onClick={() => act(() => api(`/api/v1/finance/admin/refunds/${r.id}/decision`, { method: 'POST', body: { approve: false, note } }), 'Declined. The patient has been emailed.')}>Decline</button>
          </div>
        </div>
      ) : null}
      {['APPROVED', 'FAILED'].includes(r.status) ? (
        <div className="ct-section">
          <div className="ct-actions">
            <button type="button" className="ct-btn primary" disabled={busy} onClick={() => act(() => api(`/api/v1/finance/admin/refunds/${r.id}/retry`, { method: 'POST' }), 'Sent to Paystack.')}>Send through Paystack</button>
          </div>
          <div className="ct-field" style={{ marginTop: 8 }}><label htmlFor={`ref-${r.id}`}>Or record a refund made outside Paystack</label>
            <input id={`ref-${r.id}`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transfer / MoMo reference" /></div>
          <button type="button" className="ct-btn" disabled={busy || !ref.trim()} onClick={() => act(() => api(`/api/v1/finance/admin/refunds/${r.id}/mark-refunded`, { method: 'POST', body: { reference: ref } }), 'Recorded as refunded.')}>Record manual refund</button>
        </div>
      ) : null}
      {msg.ok ? <div className="ct-ok">{msg.ok}</div> : null}
      {msg.err ? <div className="ct-error">{msg.err}</div> : null}
    </div>
  );
}

function Payouts() {
  const [batches, setBatches] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); // last day of last month
  });
  const [skipped, setSkipped] = useState(null);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const load = useCallback(() => { api('/api/v1/finance/admin/payouts').then(setBatches).catch(() => setBatches([])); }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setMsg({ ok: '', err: '' });
    try {
      const b = await api('/api/v1/finance/admin/payouts', { method: 'POST', body: { periodEnd } });
      setSkipped(b.skipped || []);
      setMsg({ ok: `Draft payout created: ${b.items} provider(s), ${GHS(b.total)}. Review it, then approve.`, err: '' });
      setOpenId(b.id);
      load();
    } catch (e) { setMsg({ ok: '', err: e.message }); }
  };

  return (
    <>
      <section className="ct-card">
        <h3>Monthly payout</h3>
        <p className="ct-meta">Collects every provider's available earnings up to the date below (after the clearing period), minus refunds taken after earlier payouts. Providers below the minimum, or without confirmed payout details, roll over to next month.</p>
        <div className="af-period">
          <label>Earnings up to <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label>
          <button type="button" className="ct-btn primary" onClick={generate}>Prepare payout</button>
        </div>
        {msg.ok ? <div className="ct-ok">{msg.ok}</div> : null}
        {msg.err ? <div className="ct-error">{msg.err}</div> : null}
        {skipped && skipped.length ? (
          <div className="ct-section"><h4>Not included this time</h4>
            <ul className="af-rates">{skipped.map((s) => <li key={s.providerId}><span>{s.name}</span><strong>{GHS(s.amount)} — {s.reason}</strong></li>)}</ul></div>
        ) : null}
      </section>
      {!batches ? <div className="ct-empty">Loading…</div> : (
        <div className="ct-list">
          {batches.map((b) => (
            <div key={b.id} className="ct-card">
              <div className="ct-card-row">
                <div><h3>Up to {b.periodEnd} — {GHS(b.total)}</h3>
                  <p className="ct-meta">{b.items} provider(s) · prepared {fmt(b.createdAt)}{b.createdBy ? ` by ${b.createdBy}` : ''}{b.approvedBy ? ` · approved by ${b.approvedBy}` : ''}</p></div>
                <Chip map={BATCH} value={b.status} />
              </div>
              <button type="button" className="ct-btn ghost" onClick={() => setOpenId(openId === b.id ? null : b.id)}>{openId === b.id ? 'Hide' : 'Open'}</button>
              {openId === b.id ? <BatchDetail id={b.id} onChanged={load} /> : null}
            </div>
          ))}
          {batches.length === 0 ? <div className="ct-empty">No payouts yet.</div> : null}
        </div>
      )}
    </>
  );
}

function BatchDetail({ id, onChanged }) {
  const [b, setB] = useState(null);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const load = useCallback(() => { api(`/api/v1/finance/admin/payouts/${id}`).then(setB).catch((e) => setMsg({ ok: '', err: e.message })); }, [id]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, ok) => {
    setMsg({ ok: '', err: '' });
    try { await fn(); setMsg({ ok, err: '' }); load(); onChanged(); } catch (e) { setMsg({ ok: '', err: e.message }); }
  };
  if (!b) return <p className="ct-meta">{msg.err || 'Loading…'}</p>;
  return (
    <div className="ct-section">
      <div className="ct-actions">
        {b.status === 'DRAFT' ? <button type="button" className="ct-btn primary" onClick={() => act(() => api(`/api/v1/finance/admin/payouts/${id}/approve`, { method: 'POST' }), 'Approved. Send each transfer, then record it below.')}>Approve payout</button> : null}
        {['DRAFT', 'APPROVED'].includes(b.status) ? <button type="button" className="ct-btn danger" onClick={() => act(() => api(`/api/v1/finance/admin/payouts/${id}/cancel`, { method: 'POST' }), 'Cancelled. Balances are back for next time.')}>Cancel payout</button> : null}
      </div>
      {msg.ok ? <div className="ct-ok">{msg.ok}</div> : null}
      {msg.err ? <div className="ct-error">{msg.err}</div> : null}
      <div className="aa-table-wrap" style={{ marginTop: 10 }}>
        <table className="aa-table">
          <thead><tr><th>Provider</th><th>Pay to</th><th>Earnings</th><th>Adjustments</th><th>Amount</th><th>Status</th><th>Record</th></tr></thead>
          <tbody>{(b.itemsDetail || []).map((i) => <ItemRow key={i.id} i={i} batchStatus={b.status} act={act} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

function ItemRow({ i, batchStatus, act }) {
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  return (
    <tr>
      <td><strong>{i.name}</strong><div className="ct-meta">{i.bookingCount} booking(s)</div></td>
      <td>{i.payTo ? <>{i.payTo.network} ({i.payTo.method === 'MOMO' ? 'mobile money' : 'bank'})<div className="af-acct">{i.payTo.accountNumber}</div><div className="ct-meta">{i.payTo.accountName}</div></> : i.method}</td>
      <td>{GHS(i.grossEarnings)}</td><td>{GHS(i.adjustments)}</td><td><strong>{GHS(i.amount)}</strong></td>
      <td><Chip map={ITEM} value={i.status} />{i.transferReference ? <div className="ct-meta">{i.transferReference}</div> : null}{i.note ? <div className="ct-meta">{i.note}</div> : null}</td>
      <td>
        {batchStatus === 'APPROVED' && i.status === 'PENDING' ? (
          <div className="af-record">
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transfer reference" aria-label={`Transfer reference for ${i.name}`} />
            <button type="button" className="ct-btn primary" disabled={!ref.trim()} onClick={() => act(() => api(`/api/v1/finance/admin/payout-items/${i.id}/paid`, { method: 'POST', body: { transferReference: ref } }), `Recorded. ${i.name} has been emailed.`)}>Paid</button>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it failed" aria-label={`Failure reason for ${i.name}`} />
            <button type="button" className="ct-btn danger" disabled={!reason.trim()} onClick={() => act(() => api(`/api/v1/finance/admin/payout-items/${i.id}/failed`, { method: 'POST', body: { reason } }), 'Marked failed; the amount returns to their balance.')}>Failed</button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function Methods() {
  const [rows, setRows] = useState(null);
  const load = () => api('/api/v1/finance/admin/payout-methods').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (!rows) return <div className="ct-empty">Loading…</div>;
  return (
    <>
      <p className="ct-meta">Confirm each provider's payout details (for example by calling them on their registered number) before money is sent. A change by the provider needs confirming again — they are emailed whenever it changes.</p>
      <div className="aa-table-wrap">
        <table className="aa-table">
          <thead><tr><th>Provider</th><th>Method</th><th>Account</th><th>Changed</th><th></th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.providerId}>
                <td><strong>{m.providerFullName}</strong><div className="ct-meta">{m.email}</div></td>
                <td>{m.network} ({m.method === 'MOMO' ? 'mobile money' : 'bank'}){m.bankBranch ? <div className="ct-meta">{m.bankBranch}</div> : null}</td>
                <td><div className="af-acct">{m.accountNumber}</div><div className="ct-meta">{m.accountName}</div></td>
                <td>{fmt(m.updatedAt)}</td>
                <td>{m.verified ? <span className="aa-chip sm" style={{ background: '#16a34a' }}>Confirmed</span>
                  : <button type="button" className="ct-btn primary" onClick={async () => { await api(`/api/v1/finance/admin/payout-methods/${m.providerId}/verify`, { method: 'POST' }); load(); }}>Confirm</button>}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={5} className="ct-meta">No provider has added payout details yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
