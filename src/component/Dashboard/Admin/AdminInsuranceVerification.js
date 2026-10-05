import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../services/apiClient';

/**
 * Insurance waiting to be verified, and claims waiting to be sent or settled.
 *
 * There is no insurer API, so a person checks the cover (with the insurer, or
 * against the card) and records the outcome here. What the system already did:
 * listed missing details, flagged expired cover and a member name that is not
 * the patient's, and assembled each claim with the clinician-approved codes.
 * Every decision is explained to the patient in fixed plain words.
 */
export default function AdminInsuranceVerification() {
  const [queue, setQueue] = useState({ insurance: [], claims: [] });
  const [reasons, setReasons] = useState({});
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const q = await api('/api/v1/billing/assist/queue').catch(() => null);
    setQueue(q || { insurance: [], claims: [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, verified) => {
    setMsg('');
    try {
      await api(`/api/v1/billing/assist/insurance/${id}/decision`, {
        method: 'POST', body: { verified, note: reasons[id] || null },
      });
      setMsg(verified ? 'Verified — the patient has been told.' : 'Rejected — the patient has been told why.');
      load();
    } catch (e) { setMsg(e?.message || 'That could not be saved.'); }
  };

  const claimStatus = async (id, status) => {
    setMsg('');
    try {
      await api(`/api/v1/billing/assist/claims/${id}/status`, {
        method: 'POST', body: { status, note: reasons[id] || null },
      });
      setMsg(`Claim marked ${status} — the patient has been told.`);
      load();
    } catch (e) { setMsg(e?.message || 'That could not be saved.'); }
  };

  const flags = (json) => {
    try { const v = JSON.parse(json || '{}'); return [...(v.missing || []), ...(v.warnings || [])]; } catch { return []; }
  };
  const list = (json) => { try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Insurance & Claims</h1>
          <p className="admin-page-sub">Verify submitted cover and record what happens to each claim.</p>
        </div>
        <button className="btn btn-primary" onClick={load}>↻ Refresh</button>
      </div>
      {msg ? <p style={S.msg}>{msg}</p> : null}

      <h2 style={S.h2}>Insurance to verify ({queue.insurance.length})</h2>
      {queue.insurance.length === 0 ? <p style={S.muted}>Nothing waiting.</p> : queue.insurance.map((i) => (
        <div key={i.id} style={S.card}>
          <div style={S.top}>
            <strong>{i.patient}</strong>
            <span>{i.provider} · {i.policy_number}{i.plan_name ? ` · ${i.plan_name}` : ''}</span>
          </div>
          <div style={S.muted}>Member: {i.member_name} · Valid until: {i.valid_to || 'not given'}
            {i.card_file_url ? <> · <a href={i.card_file_url} target="_blank" rel="noreferrer">card</a></> : null}</div>
          {flags(i.missing_json).map((f) => <div key={f} style={S.flag}>⚠ {f}</div>)}
          <input style={S.input} placeholder="Reason (required to reject)" value={reasons[i.id] || ''}
            onChange={(e) => setReasons({ ...reasons, [i.id]: e.target.value })} />
          <div style={S.actions}>
            <button className="btn btn-primary" onClick={() => decide(i.id, true)}>Verified</button>
            <button className="btn" onClick={() => decide(i.id, false)}>Reject</button>
          </div>
        </div>
      ))}

      <h2 style={S.h2}>Claims ({queue.claims.length})</h2>
      {queue.claims.length === 0 ? <p style={S.muted}>No open claims.</p> : queue.claims.map((c) => (
        <div key={c.id} style={S.card}>
          <div style={S.top}>
            <strong>{c.patient}</strong>
            <span>{c.invoice_number} · {c.currency} {(Number(c.amount_minor || 0) / 100).toFixed(2)} · <b>{c.status}</b></span>
          </div>
          <div style={S.muted}>{c.provider ? `${c.provider} · ${c.policy_number}` : 'No insurance attached'}</div>
          <div style={S.muted}>Codes: {list(c.codes_json).map((x) => `${x.code} ${x.description}`).join('; ') || 'none approved'}</div>
          {list(c.missing_json).map((m) => <div key={m} style={S.flag}>⚠ {m}</div>)}
          <input style={S.input} placeholder="Note to the patient (required to reject)" value={reasons[c.id] || ''}
            onChange={(e) => setReasons({ ...reasons, [c.id]: e.target.value })} />
          <div style={S.actions}>
            {c.status === 'draft' ? <button className="btn btn-primary" onClick={() => claimStatus(c.id, 'submitted')}>Mark submitted</button> : null}
            {c.status === 'submitted' ? <>
              <button className="btn btn-primary" onClick={() => claimStatus(c.id, 'approved')}>Approved</button>
              <button className="btn" onClick={() => claimStatus(c.id, 'rejected')}>Rejected</button></> : null}
            {c.status === 'approved' ? <button className="btn btn-primary" onClick={() => claimStatus(c.id, 'paid')}>Mark paid</button> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

const S = {
  h2: { fontSize: '1rem', margin: '1.4rem 0 0.6rem' },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '0.7rem' },
  top: { display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.9rem' },
  muted: { fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem' },
  flag: { fontSize: '0.82rem', color: '#9a3412', marginTop: '0.25rem' },
  input: { width: '100%', boxSizing: 'border-box', marginTop: '0.6rem', padding: '0.5rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem' },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.6rem' },
  msg: { fontSize: '0.88rem', color: '#166534' },
};
