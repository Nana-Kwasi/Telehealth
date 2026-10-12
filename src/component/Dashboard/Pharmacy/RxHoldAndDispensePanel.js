import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import { PreauthRequestModal } from '../../Common/ProviderInsurance';

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
 *  3. Insurance — when the patient has a verified card and this pharmacy has a
 *     verified provider code: enter prices, check cover with the insurer, and
 *     the handover is billed to the insurer. A refusal stops the handover.
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
  const [ins, setIns] = useState({ cards: [] });
  const [payer, setPayer] = useState('SELF');
  const [cardId, setCardId] = useState('');
  const [prices, setPrices] = useState({});
  const [quote, setQuote] = useState(null);
  const [okMsg, setOkMsg] = useState('');
  const [askApproval, setAskApproval] = useState(false);

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

  useEffect(() => {
    if (!rx?.id) return;
    api(`/api/v1/insurance/pharmacy/prescriptions/${rx.id}`).then(d => {
      setIns(d || { cards: [] });
      const usable = (d?.cards || []).filter(c => c.status === 'VERIFIED' && c.pharmacyInNetwork);
      // The prescriber's chosen card comes first; then the patient's default.
      const prescribed = usable.find(c => c.prescribed);
      if (usable.length) { setCardId((prescribed || usable.find(c => c.isDefault) || usable[0]).id); }
      if (prescribed) setPayer('INSURANCE');
    }).catch(() => {});
  }, [rx?.id]);
  const usableCards = (ins.cards || []).filter(c => c.status === 'VERIFIED' && c.pharmacyInNetwork);
  const otherCards = (ins.cards || []).filter(c => c.status === 'VERIFIED' && !c.pharmacyInNetwork);

  const insuredLines = () => Object.entries(amounts)
    .map(([medIndex, q]) => ({ medIndex: Number(medIndex), quantity: Number(q), unitPrice: prices[medIndex] === undefined || prices[medIndex] === '' ? null : Number(prices[medIndex]),
      name: rows.find(r => r.medIndex === Number(medIndex))?.name }))
    .filter(i => i.quantity > 0);

  const checkCover = async () => {
    const lines = insuredLines();
    if (!lines.length) { setError('Enter quantities first.'); return; }
    if (lines.some(l => l.unitPrice == null)) { setError('Enter the unit price of each medicine.'); return; }
    setBusy(true); setError(''); setQuote(null);
    try { setQuote(await api(`/api/v1/insurance/pharmacy/prescriptions/${rx.id}/preview`, { method: 'POST', body: { cardId, lines } })); }
    catch (e) { setError(e?.message || 'Could not check cover.'); }
    finally { setBusy(false); }
  };

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
    const insured = payer === 'INSURANCE';
    const items = insured
      ? insuredLines().map(({ medIndex, quantity, unitPrice }) => ({ medIndex, quantity, unitPrice }))
      : Object.entries(amounts).map(([medIndex, q]) => ({ medIndex: Number(medIndex), quantity: Number(q) })).filter(i => i.quantity > 0);
    if (items.length === 0) { setError('Enter how many of each medicine you are handing over.'); return; }
    if (insured && items.some(i => i.unitPrice == null)) { setError('Enter the unit price of each medicine to bill the insurer.'); return; }
    setBusy(true); setError(''); setOkMsg('');
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/dispensings`, {
        method: 'POST',
        body: { items, notes: notes.trim() || null, idempotencyKey: submitKey, ...(insured ? { payer: 'INSURANCE', insuranceCardId: cardId } : {}) },
      });
      if (insured) setOkMsg('Billed to the insurer. The patient has been asked to confirm they received the medicine before the claim is sent.');
      setPrices({}); setQuote(null);
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
          {!closed && (usableCards.length > 0 || otherCards.length > 0) && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.6rem 0.75rem', marginBottom: '0.6rem', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <b>Who pays?</b>
                <label><input type="radio" checked={payer === 'SELF'} onChange={() => { setPayer('SELF'); setQuote(null); }} /> Patient</label>
                <label style={{ opacity: usableCards.length ? 1 : 0.5 }}><input type="radio" disabled={!usableCards.length} checked={payer === 'INSURANCE'} onChange={() => setPayer('INSURANCE')} /> Bill insurer</label>
                {payer === 'INSURANCE' && (
                  <select value={cardId} onChange={e => { setCardId(e.target.value); setQuote(null); }} style={{ padding: '0.3rem 0.4rem', borderRadius: 8, border: '1.5px solid #cbd5e1' }}>
                    {usableCards.map(c => <option key={c.id} value={c.id}>{c.insurerName} · {c.planName || 'plan'} · {c.memberNo}{c.prescribed ? ' · chosen by prescriber' : ''}</option>)}
                  </select>
                )}
              </div>
              {(ins.cards || []).some(c => c.prescribed) && <div style={{ color: '#075985', marginTop: 4 }}>🛡️ The prescriber marked this as an insured e-prescription ({(ins.cards || []).find(c => c.prescribed)?.insurerName}){(ins.cards || []).some(c => c.prescribed && !c.pharmacyInNetwork) ? ' — but your pharmacy is not in that insurer’s network yet.' : '.'}</div>}
              {otherCards.length > 0 && <div style={{ color: '#92400e', marginTop: 4 }}>Patient also has {otherCards.map(c => c.insurerName).join(', ')} — add that insurer's provider code in Settings → Insurance to bill it.</div>}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '0.3rem 0' }}>Medicine</th><th>Prescribed</th><th>Given</th><th>Left</th>{!closed && <th>Now</th>}{!closed && payer === 'INSURANCE' && <th>Unit price (GHS)</th>}{quote && <th>Insurer pays</th>}
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
                    {!closed && payer === 'INSURANCE' && (
                      <td>
                        <input type="number" min="0" step="0.01" disabled={left <= 0 || busy} value={prices[r.medIndex] ?? ''}
                          aria-label={`Unit price of ${r.name}`} onChange={e => { setPrices(p => ({ ...p, [r.medIndex]: e.target.value })); setQuote(null); }}
                          style={{ width: 90, padding: '0.3rem 0.4rem', borderRadius: 8, border: '1.5px solid #cbd5e1' }} />
                      </td>
                    )}
                    {quote && (() => {
                      const q = (quote.lines || []).find(l => l.medIndex === r.medIndex);
                      return <td>{q ? <span title={q.reason || ''} style={{ color: q.reason ? '#b45309' : '#166534', fontWeight: 700 }}>GHS {Number(q.covered).toFixed(2)}{q.reason ? ' ⚠' : ''}</span> : '—'}</td>;
                    })()}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!closed && (
            <>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
                style={{ marginTop: '0.6rem', width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.82rem' }} />
              {quote && (
                <div style={{ marginTop: '0.6rem', borderRadius: 10, padding: '0.6rem 0.75rem', fontSize: '0.82rem',
                  background: ['COVERED', 'PARTIAL'].includes(quote.outcome) ? '#f0fdf4' : '#fef2f2', border: `1px solid ${['COVERED', 'PARTIAL'].includes(quote.outcome) ? '#bbf7d0' : '#fecaca'}` }}>
                  <b>{quote.insurerName}: {quote.outcome === 'COVERED' ? 'Covered' : quote.outcome === 'PARTIAL' ? 'Partly covered' : 'Not covered'}</b>
                  {quote.reason ? ` — ${quote.reason}` : ''}
                  <div>Insurer pays <b>GHS {Number(quote.coveredTotal || 0).toFixed(2)}</b> · patient pays <b>GHS {Number(quote.patientTotal || 0).toFixed(2)}</b>
                    {quote.benefitRemaining != null ? ` · benefit left after this: GHS ${Number(quote.benefitRemaining).toFixed(2)}` : ''}</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: '0.6rem' }}>
                {payer === 'INSURANCE' && <button type="button" disabled={busy} onClick={checkCover} style={btn('#fff', '#0f766e', '1.5px solid #0f766e')}>Check cover</button>}
                <button type="button" disabled={busy || (payer === 'INSURANCE' && quote && !['COVERED', 'PARTIAL'].includes(quote.outcome))} onClick={dispense} style={btn('#0f766e')}>
                  {busy ? 'Saving…' : payer === 'INSURANCE' ? 'Hand over & bill insurer' : 'Record handover'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p style={{ margin: '-0.5rem 0 1rem', color: '#b91c1c', fontSize: '0.82rem' }}>{error}</p>}
      {okMsg && <p style={{ margin: '-0.5rem 0 1rem', color: '#166534', fontSize: '0.82rem', fontWeight: 600 }}>✓ {okMsg}</p>}
      {payer === 'INSURANCE' && /pre-approval/i.test(error) && (
        <button type="button" style={{ ...btn('#fff', '#0f766e', '1.5px solid #0f766e'), margin: '-0.5rem 0 1rem' }} onClick={() => setAskApproval(true)}>Ask the insurer for approval</button>
      )}
      {askApproval && (
        <PreauthRequestModal patientId={rx.patientId} patientName={rx.patientName}
          cards={usableCards.map(c => ({ id: c.id, insurerName: c.insurerName, planName: c.planName, memberNo: c.memberNo }))} cardId={cardId}
          serviceType="PHARMACY" sourceType="PRESCRIPTION" sourceId={rx.id} diagnosisText={rx.diagnosis}
          initialItems={insuredLines().map(l => ({ description: l.name, code: '', quantity: l.quantity, unitPrice: l.unitPrice ?? '' }))}
          onClose={() => setAskApproval(false)} onDone={() => { setAskApproval(false); setError(''); setOkMsg('Approval requested. You can hand over and bill once the insurer approves (see Pre-authorisations).'); }} />
      )}
    </>
  );
}
