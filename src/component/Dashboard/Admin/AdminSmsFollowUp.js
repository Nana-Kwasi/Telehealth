import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/apiClient';

/**
 * Incoming SMS that could not be turned into a request automatically — the
 * manual-resolution queue. NEEDS_MANUAL: a matched patient whose request could
 * not be routed (no doctor chosen, duplicate, daily limit…). UNKNOWN_SENDER: a
 * number that is not a verified patient phone. Phone numbers are masked.
 */
const FILTERS = [['NEEDS_MANUAL', 'Needs follow-up'], ['UNKNOWN_SENDER', 'Unknown numbers'], ['REQUEST_CREATED', 'Turned into requests'], ['', 'All']];

export default function AdminSmsFollowUp() {
  const [filter, setFilter] = useState('NEEDS_MANUAL');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/api/v1/admin/sms/inbound?outcome=${encodeURIComponent(filter)}`)
      .then(d => { setRows(Array.isArray(d) ? d : []); setError(''); })
      .catch(e => setError(e?.message || 'Could not load messages.'));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: '1.25rem' }}>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem' }}>SMS follow-up</h1>
      <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.9rem' }}>
        Incoming prescription-request texts. Nothing is ever prescribed from an SMS; these need a person to contact the patient.
      </p>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {FILTERS.map(([k, l]) => (
          <button key={l} type="button" onClick={() => setFilter(k)}
            style={{ padding: '0.45rem 0.85rem', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
              border: filter === k ? 'none' : '1.5px solid #e2e8f0', background: filter === k ? '#1d4ed8' : '#fff', color: filter === k ? '#fff' : '#334155' }}>{l}</button>
        ))}
      </div>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {rows.length === 0 ? <p style={{ color: '#94a3b8' }}>Nothing here.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: '#fff' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b' }}><th style={{ padding: 8 }}>Received</th><th>From</th><th>Message</th><th>Outcome</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}{r.user_id ? ' · patient' : ''}</td>
                <td style={{ maxWidth: 360 }}>{r.body}</td>
                <td>{r.outcome || r.status}</td>
                <td style={{ color: '#64748b', maxWidth: 260 }}>{r.detail || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
