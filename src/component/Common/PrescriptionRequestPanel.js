import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import PhoneForSms from './PhoneForSms';

/**
 * Patient / psychiatry-client side of prescription requests, shown at the top of
 * their Prescriptions page:
 *   - My doctor (medical patients): the doctor new requests go to.
 *   - Request a prescription: a refill of one they have, or a new one.
 *   - My requests: status, the clinician's question (with a reply box), withdraw.
 *
 * A request is only a request — the clinician decides, and nothing is issued
 * until they write the prescription.
 */
const STATUS = {
  PENDING_REVIEW: ['Sent', '#1d4ed8'], UNDER_REVIEW: ['Being reviewed', '#1d4ed8'],
  NEEDS_CLARIFICATION: ['Your clinician has a question', '#b45309'], APPROVED: ['Approved — prescription issued', '#047857'],
  DECLINED: ['Not approved', '#b91c1c'], CANCELLED: ['Closed', '#64748b'], EXPIRED: ['Expired', '#64748b'],
};
const card = { background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '1rem' };
const btn = (bg, color = '#fff', border = 'none') => ({ padding: '0.5rem 0.95rem', borderRadius: 10, border, background: bg, color, fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' });
const input = { padding: '0.5rem 0.65rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.88rem' };

export default function PrescriptionRequestPanel() {
  const [opts, setOpts] = useState(null);
  // Medical patient vs therapy client comes from the server (see options()).
  const isPatient = opts?.kind === 'PATIENT';
  const [mine, setMine] = useState([]);
  const [myDoctor, setMyDoctor] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('REFILL');
  const [sourceId, setSourceId] = useState('');
  const [items, setItems] = useState([{ name: '', strength: '' }]);
  const [message, setMessage] = useState('');
  const [clinicianId, setClinicianId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [guidance, setGuidance] = useState('');
  const [replies, setReplies] = useState({});

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([
        api('/api/v1/medical/prescription-requests/options').catch(() => null),
        api('/api/v1/medical/prescription-requests/mine').catch(() => []),
      ]);
      setOpts(o);
      setMine(Array.isArray(m) ? m : []);
      if (o?.kind === 'PATIENT') setMyDoctor(await api('/api/v1/medical/my-doctor').catch(() => null));
    } catch { /* panel stays minimal */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const chooseDoctor = async (id) => {
    if (!id) return;
    setBusy(true); setError('');
    try { setMyDoctor(await api('/api/v1/medical/my-doctor', { method: 'PUT', body: { doctorId: id } })); await load(); }
    catch (e) { setError(e?.message || 'Could not save your doctor.'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true); setError(''); setGuidance('');
    try {
      const res = await api('/api/v1/medical/prescription-requests', {
        method: 'POST',
        body: {
          type,
          sourcePrescriptionId: type === 'REFILL' && sourceId ? sourceId : null,
          items: items.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), strength: i.strength.trim() || null })),
          message: message.trim() || null,
          clinicianId: clinicianId || null,
        },
      });
      if (res?.guidance) setGuidance(res.guidance);
      setShowForm(false); setItems([{ name: '', strength: '' }]); setMessage(''); setSourceId('');
      await load();
    } catch (e) { setError(e?.message || 'Could not send your request.'); }
    finally { setBusy(false); }
  };

  const reply = async (id) => {
    const text = (replies[id] || '').trim();
    if (!text) return;
    setBusy(true);
    try { await api(`/api/v1/medical/prescription-requests/${id}/reply`, { method: 'POST', body: { text } }); setReplies(r => ({ ...r, [id]: '' })); await load(); }
    catch (e) { alert(e?.message || 'Could not send your answer.'); }
    finally { setBusy(false); }
  };

  const withdraw = async (id) => {
    if (!window.confirm('Withdraw this request?')) return;
    try { await api(`/api/v1/medical/prescription-requests/${id}/withdraw`, { method: 'POST' }); await load(); }
    catch (e) { alert(e?.message || 'Could not withdraw.'); }
  };

  if (!opts) return null;
  const candidates = myDoctor?.candidates || [];
  const needsDoctor = isPatient && !myDoctor?.primary;
  const clinicians = opts.clinicians || [];

  return (
    <>
      {/* Verified phone for SMS codes and updates (hidden until SMS is set up). */}
      <PhoneForSms />
      {guidance && (
        <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', whiteSpace: 'pre-line', fontSize: '0.9rem' }}>
          <strong>Please get help now.</strong>{'\n'}{guidance}
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Need a refill or a new prescription?</h3>
            {isPatient && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                My doctor: <strong>{myDoctor?.primary?.name || 'not chosen yet'}</strong>
              </p>
            )}
          </div>
          {opts.eligible && !showForm && (
            <button type="button" onClick={() => setShowForm(true)} style={btn('#047857')}>Request a prescription</button>
          )}
        </div>

        {!opts.eligible && <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#92400e' }}>{opts.reason}</p>}

        {isPatient && candidates.length > 0 && (
          <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.8rem', color: '#475569' }}>{needsDoctor ? 'Choose your doctor:' : 'Change doctor:'}</label>
            <select style={input} value={myDoctor?.primary?.id || ''} disabled={busy} onChange={e => chooseDoctor(e.target.value)}>
              {!myDoctor?.primary && <option value="">— Select —</option>}
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name || 'Doctor'}</option>)}
            </select>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>New prescription requests go to this doctor. Refills go to whoever wrote the prescription.</span>
          </div>
        )}

        {showForm && (
          <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.6rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[['REFILL', 'Refill a prescription I have'], ['NEW_PRESCRIPTION', 'Ask for a new prescription']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setType(k)}
                  style={{ ...btn(type === k ? '#e0f2fe' : '#fff', type === k ? '#0c4a6e' : '#64748b', type === k ? '2px solid #0369a1' : '1.5px solid #e2e8f0'), flex: 1 }}>{l}</button>
              ))}
            </div>

            {type === 'REFILL' && (
              <select style={input} value={sourceId} onChange={e => setSourceId(e.target.value)}>
                <option value="">— Which prescription? (optional) —</option>
                {(opts.refillable || []).map(r => (
                  <option key={r.prescriptionId} value={r.prescriptionId}>
                    {(r.medications || []).join(', ') || 'Prescription'} · {r.prescriberName || ''} · {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                  </option>
                ))}
              </select>
            )}

            {(type === 'NEW_PRESCRIPTION' || !sourceId) && (
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>Medicines (name and strength if you know it)</label>
                {items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.4rem' }}>
                    <input style={{ ...input, flex: 2 }} placeholder="e.g. Amlodipine" value={it.name}
                      onChange={e => setItems(arr => arr.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} />
                    <input style={{ ...input, flex: 1 }} placeholder="e.g. 5mg" value={it.strength}
                      onChange={e => setItems(arr => arr.map((x, k) => k === i ? { ...x, strength: e.target.value } : x))} />
                    {items.length > 1 && <button type="button" onClick={() => setItems(arr => arr.filter((_, k) => k !== i))} style={btn('#fff', '#b91c1c', '1.5px solid #fecaca')}>×</button>}
                  </div>
                ))}
                {items.length < 10 && <button type="button" onClick={() => setItems(arr => [...arr, { name: '', strength: '' }])} style={{ ...btn('#fff', '#0369a1', '1.5px dashed #7dd3fc'), justifySelf: 'start' }}>+ Add medicine</button>}
              </div>
            )}

            <textarea rows={3} style={input} value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Anything your clinician should know (optional)" />

            {opts.needsChoice && !isPatient && clinicians.length > 1 && (
              <select style={input} value={clinicianId} onChange={e => setClinicianId(e.target.value)}>
                <option value="">— Which therapist should review this? —</option>
                {clinicians.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {needsDoctor && type === 'NEW_PRESCRIPTION' && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e' }}>Choose your doctor above first.</p>
            )}

            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
              Your clinician reviews every request; nothing is issued automatically. If you feel unwell right now, contact emergency services.
            </p>
            {error && <p style={{ margin: 0, fontSize: '0.82rem', color: '#b91c1c' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" disabled={busy} onClick={submit} style={btn('#047857')}>{busy ? 'Sending…' : 'Send request'}</button>
              <button type="button" onClick={() => { setShowForm(false); setError(''); }} style={btn('#fff', '#475569', '1.5px solid #e2e8f0')}>Cancel</button>
            </div>
          </div>
        )}
        {!showForm && error && <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#b91c1c' }}>{error}</p>}
      </div>

      {mine.length > 0 && (
        <div style={card}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>My requests</h3>
          {mine.slice(0, 10).map(r => {
            const [label, color] = STATUS[r.status] || [r.status, '#475569'];
            const open = ['PENDING_REVIEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'].includes(r.status);
            return (
              <div key={r.id} style={{ borderTop: '1px solid #f1f5f9', padding: '0.55rem 0', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span>{r.type === 'REFILL' ? 'Refill' : 'New prescription'}: {(r.items || []).map(i => i.name).join(', ') || 'see message'}</span>
                  <span style={{ color, fontWeight: 700 }}>{label}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  To {r.clinicianName || 'your clinician'} · {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                </div>
                {r.decisionNotes && <div style={{ marginTop: 4, color: '#475569' }}>{r.decisionNotes}</div>}
                {r.status === 'NEEDS_CLARIFICATION' && (
                  <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                    <div style={{ color: '#92400e' }}><b>Question:</b> {r.clarificationQuestion}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={{ ...input, flex: 1 }} value={replies[r.id] || ''} placeholder="Your answer"
                        onChange={e => setReplies(x => ({ ...x, [r.id]: e.target.value }))} />
                      <button type="button" disabled={busy} onClick={() => reply(r.id)} style={btn('#1d4ed8')}>Send</button>
                    </div>
                  </div>
                )}
                {open && <button type="button" onClick={() => withdraw(r.id)} style={{ ...btn('#fff', '#64748b', '1.5px solid #e2e8f0'), marginTop: 6, fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}>Withdraw</button>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
