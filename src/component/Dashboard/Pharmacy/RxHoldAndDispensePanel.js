import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';

/**
 * Added to the prescription operations screens (parent and branch). Two parts,
 * each shown only when it applies, so routed prescriptions without quantities
 * look exactly as before:
 *
 *  1. Hold — for a prescription taken from the open list: when the hold runs
 *     out, "Still working on it" (restart the timer) and "Can't fill this"
 *     (release it to the other pharmacies).
 *  2. Dispensing — for medicines with a prescribed quantity: record how many were
 *     handed over. The server refuses anything beyond what is left, even if two
 *     people submit at once, and a double-click is recorded only once.
 */
function newKey() {
  return (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

const card = { background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '0.9rem 1rem', marginBottom: '1rem' };
const btn = (bg, color = '#fff', border = 'none') => ({ padding: '0.5rem 0.95rem', borderRadius: 10, border, background: bg, color, fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' });

export default function RxHoldAndDispensePanel({ rx, onChanged }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitKey, setSubmitKey] = useState(newKey);

  const closed = !!rx?.deliveredAt || ['DISPENSED', 'CANCELLED', 'EXPIRED'].includes(rx?.lifecycleStatus);
  const held = !!rx?.openToAll && !!rx?.claimedAt && !closed;

  const loadRows = useCallback(async () => {
    if (!rx?.id) return;
    try {
      const d = await api(`/api/v1/medical/prescriptions/${rx.id}/dispensings`);
      setRows(Array.isArray(d) ? d : []);
    } catch { setRows([]); }
  }, [rx?.id]);

  // Reload when the medicines change (the parent screen polls the prescription).
  useEffect(() => { loadRows(); }, [loadRows, rx?.medicationsJson, rx?.lifecycleStatus]);

  const extend = async () => {
    setBusy(true); setError('');
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/hold/extend`, { method: 'POST' });
      onChanged?.();
    } catch (e) { setError(e?.message || 'Could not extend the hold.'); }
    finally { setBusy(false); }
  };

  const release = async () => {
    if (!window.confirm("Release this prescription? It will be offered to other pharmacies, and anything you recorded on it will be cleared.")) return;
    setBusy(true); setError('');
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/hold/release`, { method: 'POST' });
      navigate('/dashboard/prescriptions');
    } catch (e) { setError(e?.message || 'Could not release the prescription.'); }
    finally { setBusy(false); }
  };

  const dispense = async () => {
    const items = Object.entries(amounts)
      .map(([medIndex, q]) => ({ medIndex: Number(medIndex), quantity: Number(q) }))
      .filter(i => i.quantity > 0);
    if (items.length === 0) { setError('Enter how many of each medicine you are handing over.'); return; }
    setBusy(true); setError('');
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/dispensings`, {
        method: 'POST',
        body: { items, notes: notes.trim() || null, idempotencyKey: submitKey },
      });
      setAmounts({});
      setNotes('');
      setSubmitKey(newKey());
      await loadRows();
      onChanged?.();
    } catch (e) {
      setError(e?.message || 'Could not record the handover.');
    } finally { setBusy(false); }
  };

  const quantityRows = rows.filter(r => r.quantity != null);
  if (!held && quantityRows.length === 0 && !closed) return null;

  return (
    <>
      {held && (
        <div style={{ ...card, background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#1e3a8a', fontSize: '0.9rem' }}>Taken from the open list</p>
          <p style={{ margin: '0.2rem 0 0.6rem', fontSize: '0.8rem', color: '#334155' }}>
            {rx.holdExpiresAt
              ? `Held for you until ${new Date(rx.holdExpiresAt).toLocaleString()}. If there is no update by then, it is offered to other pharmacies.`
              : 'Held for your pharmacy.'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={extend} style={btn('#1d4ed8')}>Still working on it</button>
            <button type="button" disabled={busy} onClick={release} style={btn('#fff', '#b91c1c', '1.5px solid #fecaca')}>Can't fill this</button>
          </div>
        </div>
      )}

      {quantityRows.length > 0 && (
        <div style={card}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>Hand over medicines</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '0.3rem 0' }}>Medicine</th><th>Prescribed</th><th>Given</th><th>Left</th>{!closed && <th>Now</th>}
              </tr>
            </thead>
            <tbody>
              {quantityRows.map(r => {
                const left = Number(r.remaining || 0);
                return (
                  <tr key={r.medIndex} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.4rem 0', fontWeight: 600 }}>{r.name}</td>
                    <td>{Number(r.quantity)}{r.quantityUnit ? ` ${r.quantityUnit}` : ''}</td>
                    <td>{Number(r.dispensed)}</td>
                    <td>{left}</td>
                    {!closed && (
                      <td>
                        <input type="number" min="0" max={left} step="any" disabled={left <= 0 || busy}
                          value={amounts[r.medIndex] ?? ''} aria-label={`Quantity of ${r.name} handed over`}
                          onChange={e => setAmounts(a => ({ ...a, [r.medIndex]: e.target.value }))}
                          style={{ width: 80, padding: '0.3rem 0.4rem', borderRadius: 8, border: '1.5px solid #cbd5e1' }} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!closed && (
            <>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
                style={{ marginTop: '0.6rem', width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.82rem' }} />
              <button type="button" disabled={busy} onClick={dispense} style={{ ...btn('#0f766e'), marginTop: '0.6rem' }}>
                {busy ? 'Saving…' : 'Record handover'}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p style={{ margin: '-0.5rem 0 1rem', color: '#b91c1c', fontSize: '0.82rem' }}>{error}</p>}
    </>
  );
}
