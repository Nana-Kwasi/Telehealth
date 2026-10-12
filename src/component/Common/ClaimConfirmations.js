import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * "Did you receive your medicine?" — shown on the patient/client dashboard after
 * a pharmacy bills their insurer. The insurer is only asked to pay once the
 * patient confirms (here or by replying to the SMS). Renders nothing otherwise.
 */
export default function ClaimConfirmations() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState({});

  const load = useCallback(() => {
    api('/api/v1/insurance/me/claims/pending').then(r => setItems(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const answer = async (c, received) => {
    if (!received && !window.confirm('Tell your insurer you did NOT receive this medicine? They will review it.')) return;
    setBusy(c.id);
    try {
      await api(`/api/v1/insurance/me/claims/${c.id}/confirm`, { method: 'POST', body: { received } });
      setDone(d => ({ ...d, [c.id]: received ? 'Thanks — confirmed.' : 'Thanks — your insurer will review it.' }));
      setTimeout(load, 2500);
    } catch (e) { alert(e?.message || 'Could not save your answer.'); }
    finally { setBusy(''); }
  };

  if (!items.length) return null;
  return (
    <div style={{ display: 'grid', gap: '0.6rem', margin: '0 0 1rem' }}>
      <Paged items={items}>{(items) => items.map(c => (
        <div key={c.id} role="status" style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 12, padding: '0.8rem 1rem', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.4rem' }}>💊</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong style={{ color: '#1e3a8a', fontSize: '0.9rem' }}>Did you receive your medicine?</strong>
            <div style={{ fontSize: '0.82rem', color: '#1e40af', marginTop: 2 }}>
              {c.placeName || 'A pharmacy'} gave: {(c.lines || []).map(l => `${l.description} ×${Number(l.quantity)}`).join(', ')} · billed to {c.insurerName}
              {Number(c.patientAmount) > 0 ? ` · you paid GHS ${Number(c.patientAmount).toFixed(2)}` : ''} · ref {c.claimRef}
            </div>
          </div>
          {done[c.id] ? <span style={{ fontWeight: 700, color: '#166534', fontSize: '0.85rem' }}>{done[c.id]}</span> : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={busy === c.id} onClick={() => answer(c, true)} style={{ border: 'none', background: '#16a34a', color: '#fff', borderRadius: 10, padding: '0.45rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Yes, I got it</button>
              <button type="button" disabled={busy === c.id} onClick={() => answer(c, false)} style={{ border: '1.5px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 10, padding: '0.45rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>No</button>
            </div>
          )}
        </div>
      ))}</Paged>
    </div>
  );
}
