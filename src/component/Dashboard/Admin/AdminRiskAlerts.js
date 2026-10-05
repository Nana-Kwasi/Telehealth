import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../services/apiClient';

/**
 * Unusual patterns, for a person to judge.
 *
 * Each alert shows the rule that raised it and the evidence it saw. None has
 * been acted on — no account locked, no payment reversed. Reviewing records a
 * judgement with a reason: Dismiss (nothing wrong) or Confirm (needs action,
 * which is then taken elsewhere, by a person).
 */
const TONE = { high: '#b42318', medium: '#b54708', low: '#475467' };
const LABEL = {
  inbox: 'Inbox', accounts: 'Accounts', phoneEndsWith: 'Phone ends with', amount: 'Amount', paymentRefs: 'Payment refs',
  times: 'Times', patient: 'Patient', medication: 'Medication', issued: 'Issued', bookingsLast24h: 'Bookings (24h)',
  cancelledLast7Days: 'Cancelled (7 days)', day: 'Day', clinicians: 'Clinicians', rejectedLast90Days: 'Rejected claims (90 days)',
  networksLast24h: 'Networks (24h)', browsers: 'Browsers', addresses: 'Addresses', address: 'Address', names: 'Accounts',
  failedLastHour: 'Failed sign-ins (1h)', between: 'Between', recordsLast24h: 'Records (24h)', usualPerDay: 'Usual per day',
  overnightLast7Days: 'Overnight prescriptions (7 days)', threshold: 'Threshold',
};

export default function AdminRiskAlerts() {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState({ alerts: [], counts: {} });
  const [notes, setNotes] = useState({});
  const [msg, setMsg] = useState('');
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    const d = await api(`/api/v1/admin/risk-alerts?status=${status}`).catch(() => null);
    if (d) setData(d);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const review = async (id, decision) => {
    setMsg('');
    try {
      await api(`/api/v1/admin/risk-alerts/${id}/review`, { method: 'POST', body: { decision, note: notes[id] || '' } });
      load();
    } catch (e) { setMsg(e?.message || 'Could not save that.'); }
  };

  const scan = async () => {
    setScanning(true); setMsg('');
    try {
      const r = await api('/api/v1/admin/risk-alerts/scan', { method: 'POST' });
      setMsg(r.newAlerts ? `${r.newAlerts} new pattern(s) found.` : 'Scan complete — nothing new.');
      load();
    } catch (e) { setMsg(e?.message || 'Scan failed.'); } finally { setScanning(false); }
  };

  const c = data.counts || {};
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Patterns to review</h1>
          <p className="admin-page-sub">
            Unusual activity found by fixed rules, checked hourly. These are prompts for a person to look — not
            findings. Nothing has been acted on.
          </p>
        </div>
        <button className="btn btn-primary" onClick={scan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan now'}</button>
      </div>

      <div style={S.tabs}>
        {[['open', `Open (${c.open ?? 0})`], ['confirmed', `Confirmed (${c.confirmed ?? 0})`],
          ['dismissed', `Dismissed (${c.dismissed ?? 0})`], ['all', 'All']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} style={{ ...S.tab, ...(status === k ? S.tabOn : null) }}>{l}</button>
        ))}
      </div>
      {msg ? <p style={S.msg}>{msg}</p> : null}

      {data.alerts.length === 0 ? <p style={S.muted}>Nothing here.</p> : data.alerts.map((a) => {
        let ev = {};
        try { ev = JSON.parse(a.evidence_json || '{}'); } catch { ev = {}; }
        const { why, ...facts } = ev;
        return (
          <div key={a.id} style={{ ...S.card, borderLeft: `4px solid ${TONE[a.severity] || TONE.low}` }}>
            <div style={S.top}>
              <span style={{ ...S.sev, color: TONE[a.severity] }}>{a.severity}</span>
              <b>{a.title}</b>
              {a.subject_label ? <span style={S.muted}>· {a.subject_label}</span> : null}
              <span style={{ ...S.muted, marginLeft: 'auto' }}>{new Date(a.created_at).toLocaleString()}</span>
            </div>
            {why ? <p style={S.why}>{why}</p> : null}
            <dl style={S.dl}>
              {Object.entries(facts).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt style={S.dt}>{LABEL[k] || k}</dt>
                  <dd style={S.dd}>{Array.isArray(v) ? v.join(' · ') : String(v)}</dd>
                </React.Fragment>
              ))}
            </dl>
            {a.status === 'open' ? (
              <>
                <input style={S.input} placeholder="Your reasoning (required)" value={notes[a.id] || ''}
                  onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
                <div style={S.actions}>
                  <button className="btn" onClick={() => review(a.id, 'dismissed')}>Dismiss — nothing wrong</button>
                  <button className="btn btn-primary" onClick={() => review(a.id, 'confirmed')}>Confirm — needs action</button>
                </div>
              </>
            ) : (
              <p style={S.muted}>
                {a.status} by {a.reviewed_by || 'an administrator'}{a.reviewed_at ? ` on ${new Date(a.reviewed_at).toLocaleString()}` : ''}
                {a.review_note ? ` — “${a.review_note}”` : ''}
                {' '}<button type="button" style={S.link} onClick={() => review(a.id, 'open')}>Reopen</button>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const S = {
  tabs: { display: 'flex', gap: '0.4rem', margin: '0.5rem 0 1rem', flexWrap: 'wrap' },
  tab: { padding: '0.35rem 0.8rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  tabOn: { background: '#0f172a', borderColor: '#0f172a', color: '#fff' },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.85rem 1rem', marginBottom: '0.7rem' },
  top: { display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '0.9rem' },
  sev: { fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' },
  why: { margin: '0.35rem 0', fontSize: '0.84rem', color: '#334155' },
  dl: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.2rem 0.8rem', margin: '0.4rem 0', fontSize: '0.82rem' },
  dt: { color: '#64748b', fontWeight: 600 },
  dd: { margin: 0, color: '#0f172a', wordBreak: 'break-word' },
  input: { width: '100%', boxSizing: 'border-box', marginTop: '0.4rem', padding: '0.5rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem' },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' },
  muted: { fontSize: '0.8rem', color: '#64748b' },
  msg: { fontSize: '0.86rem', color: '#166534' },
  link: { background: 'none', border: 'none', color: '#1e6bb8', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' },
};
