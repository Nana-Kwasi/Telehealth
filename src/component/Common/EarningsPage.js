import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import { Ledger } from '../Dashboard/Admin/AdminFinance';
import { nessaHubPolicyUrl } from '../../constants/nessaHubPolicies';
import './CareTransfers.css';
import '../Dashboard/Admin/AdminApplications.css';
import '../Dashboard/Admin/AdminFinance.css';

/**
 * A provider's own money: what they have earned from bookings (price minus
 * NessaHub's commission, minus anything refunded), what is still clearing,
 * what the next monthly payout will send, and where it goes.
 */
const GHS = (v) => `GHS ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (v) => (v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
const NETWORKS = ['MTN MoMo', 'Telecel Cash', 'AT Money'];
const ITEM = { PENDING: ['On its way', '#d97706'], PAID: ['Paid', '#16a34a'], FAILED: ['Failed — check your details', '#dc2626'] };

export default function EarningsPage({ serviceKey = 'consultation' }) {
  const [s, setS] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [rates, setRates] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/api/v1/finance/earnings/summary').then(setS).catch((e) => setError(e.message));
    api('/api/v1/finance/earnings/ledger').then(setLedger).catch(() => setLedger([]));
    api('/api/v1/finance/payouts').then(setPayouts).catch(() => setPayouts([]));
    api('/api/v1/finance/rates').then(setRates).catch(() => setRates(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rate = rates?.commissionPercent?.[serviceKey];
  return (
    <div className="ct-page aa-page">
      <div className="ct-head">
        <h2>Earnings</h2>
        <p>
          What you have earned from bookings on NessaHub and when it is paid.
          {rate != null ? ` NessaHub's commission on your bookings is ${rate}% of your price; you keep the rest.` : ''}
          {' '}<a href={nessaHubPolicyUrl('provider-commission-payout-policy')} target="_blank" rel="noreferrer">How fees and payouts work</a>
        </p>
      </div>
      {error ? <div className="ct-error">{error}</div> : null}
      {!s ? <div className="ct-empty">Loading…</div> : (
        <>
          <div className="af-tiles">
            <div className="af-tile ok"><span className="af-tile-label">Next payout</span><strong className="af-tile-value">{GHS(s.balance)}</strong>
              <span className="af-tile-sub">Around {fmt(s.nextPayoutDate)}{Number(s.balance) < Number(s.payoutMinimum) ? ` · below the ${GHS(s.payoutMinimum)} minimum, rolls over` : ''}</span></div>
            <div className="af-tile warn"><span className="af-tile-label">Pending</span><strong className="af-tile-value">{GHS(s.pending)}</strong>
              <span className="af-tile-sub">Available {s.clearingDays} day(s) after each session</span></div>
            {Number(s.adjustments) !== 0 ? <div className="af-tile warn"><span className="af-tile-label">Refund adjustments</span><strong className="af-tile-value">{GHS(s.adjustments)}</strong>
              <span className="af-tile-sub">Refunds on bookings already paid out</span></div> : null}
            <div className="af-tile"><span className="af-tile-label">Being sent</span><strong className="af-tile-value">{GHS(s.inPayout)}</strong></div>
            <div className="af-tile"><span className="af-tile-label">Paid to you so far</span><strong className="af-tile-value">{GHS(s.paidOut)}</strong></div>
            <div className="af-tile"><span className="af-tile-label">Bookings</span><strong className="af-tile-value">{s.bookings}</strong>
              <span className="af-tile-sub">{GHS(s.lifetimeGross)} booked · {GHS(s.lifetimeCommission)} commission</span></div>
          </div>

          <PayoutDetails method={s.payoutMethod} onSaved={load} />

          <section className="ct-card">
            <h3>Bookings</h3>
            {!ledger ? <p className="ct-meta">Loading…</p> : <Ledger rows={ledger} />}
          </section>

          <section className="ct-card">
            <h3>Payouts</h3>
            {payouts.length === 0 ? <p className="ct-meta">No payouts yet. Payouts are made monthly, around day {rates?.payoutDayOfMonth || 5}.</p> : (
              <div className="aa-table-wrap">
                <table className="aa-table">
                  <thead><tr><th>Period up to</th><th>Bookings</th><th>Earnings</th><th>Adjustments</th><th>Sent</th><th>To</th><th>Status</th></tr></thead>
                  <tbody>{payouts.map((p) => {
                    const [label, color] = ITEM[p.status] || [p.status, '#64748b'];
                    return (
                      <tr key={p.id}>
                        <td>{p.periodEnd}</td><td>{p.bookingCount}</td><td>{GHS(p.grossEarnings)}</td><td>{GHS(p.adjustments)}</td>
                        <td><strong>{GHS(p.amount)}</strong>{p.paidAt ? <div className="ct-meta">{fmt(p.paidAt)}</div> : null}</td>
                        <td>{p.method}{p.transferReference ? <div className="ct-meta">Ref {p.transferReference}</div> : null}</td>
                        <td><span className="aa-chip sm" style={{ background: color }}>{label}</span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PayoutDetails({ method, onSaved }) {
  const [editing, setEditing] = useState(!method);
  const [f, setF] = useState({ method: 'MOMO', providerName: 'MTN MoMo', accountName: '', accountNumber: '', bankBranch: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      await api('/api/v1/finance/payout-method', { method: 'PUT', body: f });
      setMsg({ ok: 'Saved. Our finance team will confirm these details before your next payout; we have emailed you about the change.', err: '' });
      setEditing(false);
      onSaved();
    } catch (err) { setMsg({ ok: '', err: err.message }); } finally { setBusy(false); }
  };

  return (
    <section className="ct-card">
      <h3>Where we pay you</h3>
      {method && !editing ? (
        <>
          <p><strong>{method.providerName}</strong> {method.accountMasked} — {method.accountName}{method.bankBranch ? `, ${method.bankBranch}` : ''}</p>
          <p className="ct-meta">{method.verified ? 'Confirmed by NessaHub finance.' : 'Waiting for NessaHub finance to confirm — payouts are held until then.'}</p>
          <button type="button" className="ct-btn" onClick={() => setEditing(true)}>Change payout details</button>
        </>
      ) : (
        <form onSubmit={save} className="ct-form">
          <p className="ct-meta">For your security, changing these details pauses payouts until our finance team confirms them, and we email you every time they change.</p>
          <div className="ct-grid">
            <div className="ct-field"><label htmlFor="pm-method">Paid to</label>
              <select id="pm-method" value={f.method} onChange={(e) => { set('method', e.target.value); set('providerName', e.target.value === 'MOMO' ? 'MTN MoMo' : ''); }}>
                <option value="MOMO">Mobile money</option><option value="BANK">Bank account</option>
              </select></div>
            <div className="ct-field"><label htmlFor="pm-net">{f.method === 'MOMO' ? 'Network' : 'Bank'}</label>
              {f.method === 'MOMO'
                ? <select id="pm-net" value={f.providerName} onChange={(e) => set('providerName', e.target.value)}>{NETWORKS.map((n) => <option key={n}>{n}</option>)}</select>
                : <input id="pm-net" value={f.providerName} onChange={(e) => set('providerName', e.target.value)} placeholder="e.g. GCB Bank" />}</div>
            <div className="ct-field"><label htmlFor="pm-name">Account name (as registered)</label>
              <input id="pm-name" value={f.accountName} onChange={(e) => set('accountName', e.target.value)} autoComplete="name" /></div>
            <div className="ct-field"><label htmlFor="pm-num">{f.method === 'MOMO' ? 'Mobile money number' : 'Account number'}</label>
              <input id="pm-num" value={f.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} inputMode="numeric" autoComplete="off" /></div>
            {f.method === 'BANK' ? <div className="ct-field"><label htmlFor="pm-br">Branch</label>
              <input id="pm-br" value={f.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} /></div> : null}
          </div>
          <div className="ct-actions">
            <button type="submit" className="ct-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save payout details'}</button>
            {method ? <button type="button" className="ct-btn" onClick={() => setEditing(false)}>Cancel</button> : null}
          </div>
        </form>
      )}
      {msg.ok ? <div className="ct-ok">{msg.ok}</div> : null}
      {msg.err ? <div className="ct-error">{msg.err}</div> : null}
    </section>
  );
}
