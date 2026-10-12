import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/apiClient';

/**
 * Prescription Requests — the doctor's / psychiatrist's queue of refill and new
 * prescription requests from their patients and psychiatry clients.
 *
 * Approving never issues anything from here: it opens the normal prescription
 * form pre-filled with the requested medicines, and the prescription is created
 * by the same endpoint (with its safety checks) as any other.
 */
const FILTERS = [
  ['open', 'Open'], ['APPROVED', 'Approved'], ['DECLINED', 'Declined'], ['all', 'All'],
];
const STATUS_LABEL = {
  PENDING_REVIEW: 'New', UNDER_REVIEW: 'Reviewing', NEEDS_CLARIFICATION: 'Waiting for patient',
  APPROVED: 'Approved', DECLINED: 'Declined', CANCELLED: 'Closed', EXPIRED: 'Expired',
};
const ROUTE_LABEL = {
  ORIGINAL_PRESCRIBER: 'You wrote the original prescription', MY_DOCTOR: 'You are their chosen doctor',
  ASSIGNED_THERAPIST: 'You are their assigned psychiatrist', PATIENT_CHOSE: 'The patient chose you',
};
const btn = (bg, color = '#fff', border = 'none') => ({ padding: '0.5rem 0.9rem', borderRadius: 10, border, background: bg, color, fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' });

export default function PrescriptionRequestsInbox() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('open');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/v1/medical/prescription-requests/inbox?status=${encodeURIComponent(filter)}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setError(e?.message || 'Could not load requests.'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const open = async (row) => {
    setError(''); setText('');
    try {
      const d = await api(`/api/v1/medical/prescription-requests/${row.id}${row.status === 'PENDING_REVIEW' ? '/review' : ''}`,
        row.status === 'PENDING_REVIEW' ? { method: 'POST' } : undefined);
      setSelected(d);
      if (row.status === 'PENDING_REVIEW') load();
    } catch (e) { setError(e?.message || 'Could not open the request.'); }
  };

  const act = async (path, body) => {
    setBusy(true); setError('');
    try {
      const d = await api(`/api/v1/medical/prescription-requests/${selected.id}/${path}`, { method: 'POST', body });
      setSelected(d); setText(''); load();
    } catch (e) { setError(e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  const approve = () => {
    // Open the usual prescription form with the patient and medicines filled in.
    navigate('/dashboard/prescriptions', {
      state: {
        openRxForm: true,
        presetPatientId: selected.patientId,
        presetPatientName: selected.patientName || '',
        presetMedications: (selected.items || []).map(i => ({ name: i.name, strength: i.strength || '' })),
        requestId: selected.id,
      },
    });
  };

  const isOpen = selected && ['PENDING_REVIEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'].includes(selected.status);
  const flags = selected?.safety?.flags || [];

  return (
    <div className="doctor-page" style={{ padding: '1.25rem' }}>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem' }}>Prescription Requests</h1>
      <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.9rem' }}>Refill and new prescription requests from your patients.</p>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => { setFilter(key); setSelected(null); }}
            style={btn(filter === key ? '#1d4ed8' : '#fff', filter === key ? '#fff' : '#334155', filter === key ? 'none' : '1.5px solid #e2e8f0')}>{label}</button>
        ))}
      </div>
      {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(300px, 2fr)', gap: '1rem', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {loading ? <p style={{ color: '#94a3b8' }}>Loading…</p> : rows.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>No requests here.</p>
          ) : rows.map(r => (
            <button key={r.id} type="button" onClick={() => open(r)}
              style={{ textAlign: 'left', background: selected?.id === r.id ? '#eff6ff' : '#fff', border: `1.5px solid ${r.urgentFlag && ['PENDING_REVIEW', 'UNDER_REVIEW'].includes(r.status) ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 12, padding: '0.7rem 0.8rem', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{r.patientName || 'Patient'}</strong>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: r.urgentFlag ? '#b91c1c' : '#475569' }}>
                  {r.urgentFlag ? 'URGENT · ' : ''}{STATUS_LABEL[r.status] || r.status}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                {r.type === 'REFILL' ? 'Refill' : 'New prescription'} · {(r.items || []).map(i => i.name).join(', ') || 'see message'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</div>
            </button>
          ))}
        </div>

        {selected && (
          <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '1rem 1.1rem', display: 'grid', gap: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{selected.patientName || 'Patient'}</h2>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                {selected.type === 'REFILL' ? 'Refill request' : 'New prescription request'} · {STATUS_LABEL[selected.status]} ·{' '}
                {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : ''}{selected.source === 'SMS' ? ' · by SMS' : ''}
              </p>
              {selected.routingReason && <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>{ROUTE_LABEL[selected.routingReason]}</p>}
            </div>

            {selected.urgentFlag && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '0.6rem 0.8rem', color: '#991b1b', fontSize: '0.85rem', fontWeight: 700 }}>
                The patient's words may describe an emergency or self-harm. They were shown emergency guidance; please contact them directly.
              </div>
            )}

            <div>
              <p style={{ margin: '0 0 0.25rem', fontWeight: 700, fontSize: '0.85rem' }}>Requested</p>
              {(selected.items || []).length === 0 ? <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>No medicine named.</p> : (
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                  {selected.items.map((i, k) => (
                    <li key={k}>{i.name}{i.strength ? ` ${i.strength}` : ''}{i.note ? ` — ${i.note}` : ''}
                      {i.decision && <span style={{ color: i.decision === 'approved' ? '#047857' : '#b45309' }}> ({i.decision === 'approved' ? 'approved' : 'not included'})</span>}
                    </li>
                  ))}
                </ul>
              )}
              {selected.message && <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#334155', background: '#f8fafc', padding: '0.5rem 0.7rem', borderRadius: 8 }}>"{selected.message}"</p>}
              {selected.clarificationQuestion && (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: '#475569' }}>
                  <b>You asked:</b> {selected.clarificationQuestion}<br />
                  <b>Patient:</b> {selected.patientReply || <i>no reply yet</i>}
                </p>
              )}
              {selected.decisionNotes && <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: '#475569' }}><b>Decision:</b> {selected.decisionNotes}</p>}
            </div>

            {(flags.length > 0 || selected.safety?.allergyWarning) && (
              <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '0.6rem 0.8rem' }}>
                <p style={{ margin: '0 0 0.25rem', fontWeight: 700, fontSize: '0.85rem', color: '#92400e' }}>Safety check</p>
                {flags.map((f, k) => <p key={k} style={{ margin: '0.1rem 0', fontSize: '0.8rem', color: '#78350f' }}>• [{f.severity}] {f.message}</p>)}
                {selected.safety?.allergyWarning && <p style={{ margin: '0.1rem 0', fontSize: '0.8rem', color: '#78350f' }}>• {selected.safety.allergyWarning}</p>}
              </div>
            )}
            {selected.safety?.allergyHistory && <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Allergies: {selected.safety.allergyHistory}</p>}

            {(selected.prescriptionHistory || []).length > 0 && (
              <div>
                <p style={{ margin: '0 0 0.25rem', fontWeight: 700, fontSize: '0.85rem' }}>Previous prescriptions</p>
                {selected.prescriptionHistory.slice(0, 6).map(h => (
                  <div key={h.id} style={{ fontSize: '0.8rem', color: '#334155', padding: '0.3rem 0', borderTop: '1px solid #f1f5f9', background: h.matchesRequest ? '#f0fdf4' : 'transparent' }}>
                    {(h.medications || []).map(m => [m.name, m.strength, m.dosage, m.frequency, m.duration].filter(Boolean).join(' ')).join('; ') || '—'}
                    <span style={{ color: '#94a3b8' }}> · {h.prescriberName || ''} · {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''} · {h.lifecycleStatus}</span>
                  </div>
                ))}
              </div>
            )}
            {(selected.previousRequests || []).length > 0 && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                Asked for the same medicine before: {selected.previousRequests.map(p => `${new Date(p.createdAt).toLocaleDateString()} (${STATUS_LABEL[p.status] || p.status})`).join(', ')}
              </p>
            )}

            {isOpen && (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" disabled={busy} onClick={approve} style={btn('#047857')}>Approve — open prescription form</button>
                  <button type="button" disabled={busy} onClick={() => act('cancel', { text: text || null })} style={btn('#fff', '#475569', '1.5px solid #e2e8f0')}>Close as duplicate</button>
                </div>
                <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Question for the patient, or the reason for declining"
                  style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }} />
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" disabled={busy || !text.trim()} onClick={() => act('clarification', { text })} style={btn('#1d4ed8')}>Ask the patient</button>
                  <button type="button" disabled={busy || !text.trim()} onClick={() => act('decline', { text })} style={btn('#fff', '#b91c1c', '1.5px solid #fecaca')}>Decline</button>
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Need to see them first? Ask them to book a consultation, then decline with that reason.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
