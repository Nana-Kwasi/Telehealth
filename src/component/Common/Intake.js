import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import './Measures.css';
import './PsychRecord.css';

/*
 * Intake packets.
 *  - ShareIntakeModal: the clinician picks forms and questionnaires and sends them in one go.
 *  - IntakeStatus: what has been sent to this client and what is signed.
 *  - MyIntakeForms: the client reads and signs each form (Home screen).
 */

const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function ShareIntakeModal({ clientId, clientName, onClose, onSent }) {
  const [catalog, setCatalog] = useState(null);
  const [docs, setDocs] = useState([]);
  const [measures, setMeasures] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/v1/intake/catalog').then((c) => { setCatalog(c); setDocs(c.documents.map((d) => d.key)); })
      .catch((e) => setError(e?.message || 'Could not load the forms.'));
  }, []);

  const toggle = (list, set, key) => set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const send = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('/api/v1/intake/packets', { method: 'POST', body: { clientId, documents: docs, measures, message } });
      onSent && onSent(r);
      onClose();
    } catch (e) { setError(e?.message || 'Could not send.'); setBusy(false); }
  };

  return (
    <div className="pr-modal-back" onClick={onClose}>
      <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Share forms" onClick={(e) => e.stopPropagation()}>
        <h3 className="ms-title">Send forms to {clientName || 'this client'}</h3>
        {!catalog ? <p className="ms-muted">{error || 'Loading…'}</p> : (
          <>
            <p className="ms-muted">Forms to read and sign</p>
            {catalog.documents.map((d) => (
              <label key={d.key} className="pr-check" style={{ display: 'flex', margin: '0.3rem 0' }}>
                <input type="checkbox" checked={docs.includes(d.key)} onChange={() => toggle(docs, setDocs, d.key)} /> {d.title}
              </label>
            ))}
            <p className="ms-muted" style={{ marginTop: '0.75rem' }}>Questionnaires</p>
            {catalog.measures.map((m) => (
              <label key={m.code} className="pr-check" style={{ display: 'flex', margin: '0.3rem 0' }}>
                <input type="checkbox" checked={measures.includes(m.code)} onChange={() => toggle(measures, setMeasures, m.code)} /> {m.name} ({m.purpose})
              </label>
            ))}
            <label className="pr-label" style={{ marginTop: '0.75rem' }}>Message (optional)
              <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A short welcome note" />
            </label>
            {error && <p className="ms-err">{error}</p>}
            <div className="ms-actions">
              <button className="ms-link" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="ms-btn" onClick={send} disabled={busy || (docs.length === 0 && measures.length === 0)}>{busy ? 'Sending…' : 'Send'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function IntakeStatus({ clientId, refreshKey }) {
  const [packets, setPackets] = useState([]);
  useEffect(() => {
    api(`/api/v1/intake/clients/${clientId}`).then((p) => setPackets(Array.isArray(p) ? p : [])).catch(() => setPackets([]));
  }, [clientId, refreshKey]);
  const open = packets.filter((p) => p.status === 'sent');
  if (open.length === 0) return null;
  return (
    <div className="ms-card ms-client">
      <h3 className="ms-title">Forms waiting for the client</h3>
      {open.map((p) => (
        <p key={p.id} className="ms-muted" style={{ margin: '0.25rem 0' }}>
          Sent {fmt(p.created_at)}: {p.documents.map((d) => `${d.title} ${d.signedAt ? '✓ signed' : '(not signed yet)'}`).join(' · ')}
        </p>
      ))}
    </div>
  );
}

export function MyIntakeForms() {
  const [packets, setPackets] = useState([]);
  const [reading, setReading] = useState(null);

  const load = useCallback(() => {
    api('/api/v1/intake/mine').then((p) => setPackets(Array.isArray(p) ? p : [])).catch(() => setPackets([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (reading) {
    return <SignForm packet={reading.packet} doc={reading.doc} onClose={() => setReading(null)} onSigned={() => { setReading(null); load(); }} />;
  }
  if (packets.length === 0) return null;
  return (
    <div className="ms-card ms-client">
      <h3 className="ms-title">Forms to read and sign</h3>
      {packets.map((p) => (
        <div key={p.id}>
          <p className="ms-muted" style={{ margin: '0 0 0.4rem' }}>From {p.clinician_name || 'your clinician'}{p.message ? `: “${p.message}”` : ''}</p>
          <ul className="ms-pending">
            {p.documents.map((d) => (
              <li key={d.key}>
                <span>{d.title}</span>
                {d.signedAt ? <span className="ms-ok" style={{ margin: 0 }}>Signed</span>
                  : <button className="ms-btn" onClick={() => setReading({ packet: p, doc: d })}>Read and sign</button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SignForm({ packet, doc, onClose, onSigned }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sign = async () => {
    setBusy(true); setError('');
    try {
      await api(`/api/v1/intake/packets/${packet.id}/sign`, { method: 'POST', body: { document: doc.key, signedName: name, platform: 'web' } });
      onSigned();
    } catch (e) { setError(e?.message || 'Could not sign.'); setBusy(false); }
  };
  return (
    <div className="ms-card ms-client pr-doc">
      <h3 className="ms-title">{doc.title}</h3>
      {doc.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      <label className="pr-check" style={{ display: 'flex', margin: '0.75rem 0' }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read this and I agree to it.
      </label>
      <label className="pr-label">Type your full name to sign
        <input className="pr-full" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions">
        <button className="ms-link" onClick={onClose} disabled={busy}>Later</button>
        <button className="ms-btn" onClick={sign} disabled={busy || !agree || name.trim().length < 2}>{busy ? 'Signing…' : 'Sign'}</button>
      </div>
    </div>
  );
}
