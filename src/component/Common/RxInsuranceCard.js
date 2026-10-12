import React, { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';

/**
 * Insured e-prescription. While writing, the prescriber picks which of the
 * patient's verified insurance cards pays (or self-pay). After saving, the card
 * is attached to the prescription: the patient gets an SMS with the estimated
 * insurer / patient share, sees the pharmacies that accept the card, and the
 * pharmacy finds the card already chosen at the counter.
 */
export function RxInsurancePicker({ patientId, value, onChange }) {
  const [cards, setCards] = useState(null);
  useEffect(() => {
    setCards(null);
    if (!patientId) return;
    api(`/api/v1/insurance/patients/${patientId}/cards`)
      .then(c => {
        const list = Array.isArray(c) ? c : [];
        setCards(list);
        // A new patient: start from their default card (the prescriber can switch or choose self-pay).
        onChange((list.find(x => x.isDefault) || list[0])?.id || '');
      })
      .catch(() => setCards([]));
  }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!patientId || !cards || cards.length === 0) return null;
  return (
    <div style={{ border: '1.5px solid #bae6fd', background: '#f0f9ff', borderRadius: 14, padding: '0.8rem 1rem', margin: '0 0 1rem' }}>
      <div style={{ fontWeight: 800, color: '#075985', fontSize: '0.88rem' }}>🛡️ Who pays for this prescription?</div>
      <div style={{ fontSize: '0.78rem', color: '#0369a1', margin: '0.2rem 0 0.6rem' }}>The patient gets a cost estimate by SMS and a list of pharmacies that accept the card. The pharmacy sees the card already selected.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {cards.map(c => (
          <button key={c.id} type="button" onClick={() => onChange(c.id)}
            style={{ textAlign: 'left', border: `2px solid ${value === c.id ? '#0284c7' : '#e2e8f0'}`, background: value === c.id ? '#fff' : '#f8fafc', borderRadius: 12, padding: '0.5rem 0.75rem', cursor: 'pointer', minWidth: 180 }}>
            <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>{value === c.id ? '● ' : '○ '}{c.insurerName}</div>
            <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{c.planName || 'Plan'} · {c.memberNo}</div>
          </button>
        ))}
        <button type="button" onClick={() => onChange('')}
          style={{ border: `2px solid ${value === '' ? '#0284c7' : '#e2e8f0'}`, background: value === '' ? '#fff' : '#f8fafc', borderRadius: 12, padding: '0.5rem 0.75rem', cursor: 'pointer', fontWeight: 800, fontSize: '0.84rem' }}>
          {value === '' ? '● ' : '○ '}Self-pay
        </button>
      </div>
    </div>
  );
}

/** Attach the chosen card after the prescription is saved. Returns the estimate, or null when self-pay / it failed. */
export async function attachRxCard(rxId, cardId) {
  if (!rxId || !cardId) return null;
  try { return await api(`/api/v1/insurance/prescriptions/${rxId}/card`, { method: 'POST', body: { cardId } }); }
  catch (e) { return { available: false, note: e?.message || 'Could not attach the insurance card' }; }
}

const money = (v) => `GHS ${Number(v || 0).toFixed(2)}`;

/** The estimate the patient was sent, shown to the prescriber (and reusable for the patient). */
export function RxEstimateCard({ estimate, onClose, title = 'Insurance estimate sent to the patient' }) {
  if (!estimate) return null;
  const lines = estimate.lines || [];
  return (
    <div style={{ border: '1.5px solid #bbf7d0', background: '#f0fdf4', borderRadius: 14, padding: '0.85rem 1rem', margin: '0 0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <b style={{ color: '#166534' }}>🛡️ {title}{estimate.insurerName ? ` · ${estimate.insurerName}` : ''}</b>
        {onClose && <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 800, color: '#166534' }}>✕</button>}
      </div>
      {estimate.available ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '0.5rem 0' }}>
          <div><div style={{ fontSize: '0.72rem', color: '#166534' }}>Insurer pays (about)</div><div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#14532d' }}>{money(estimate.insurerTotal)}</div></div>
          <div><div style={{ fontSize: '0.72rem', color: '#166534' }}>Patient pays (about)</div><div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#14532d' }}>{money(estimate.patientTotal)}</div></div>
        </div>
      ) : <p style={{ margin: '0.4rem 0', fontSize: '0.82rem', color: '#92400e' }}>{estimate.note || 'No estimate available — the pharmacy will check cover at the counter.'}</p>}
      {lines.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {lines.map((l, i) => (
            <span key={i} style={{ fontSize: '0.74rem', background: '#fff', border: '1px solid #dcfce7', borderRadius: 999, padding: '0.15rem 0.6rem', color: l.tier === 'EXCLUDED' ? '#991b1b' : '#334155' }}>
              {l.name} · {String(l.tier || '').toLowerCase()}{l.requiresPreauth ? ' · needs approval' : ''}{l.tariff != null ? ` · tariff ${money(l.tariff)}` : ''}
            </span>
          ))}
        </div>
      )}
      {estimate.available && estimate.note && <div style={{ fontSize: '0.74rem', color: '#166534', marginTop: 6 }}>{estimate.note}</div>}
    </div>
  );
}

/** On the patient's prescription: "Insured · you pay about GHS X", fetched once. */
export function RxCoverChip({ rxId, cardId }) {
  const [est, setEst] = useState(null);
  useEffect(() => {
    if (!rxId || !cardId) return;
    api(`/api/v1/insurance/prescriptions/${rxId}/estimate`).then(setEst).catch(() => {});
  }, [rxId, cardId]);
  if (!cardId) return null;
  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 999, padding: '0.15rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, marginTop: 4 }}>
      🛡️ {est?.insurerName || 'Insured'}{est?.available ? ` · you pay about ${money(est.patientTotal)} · insurer ${money(est.insurerTotal)}` : ' · use a pharmacy that accepts your card'}
    </div>
  );
}
