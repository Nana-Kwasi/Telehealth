import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/apiClient';
import { PreauthRequestModal } from './ProviderInsurance';

/**
 * While the doctor writes a prescription for an insured patient: is each
 * medicine covered, is there a cheaper product with the same ingredient (one-tap
 * switch), does it fit the diagnosis, and does anything need the insurer's
 * approval first. Hidden for patients without a verified insurance card unless a
 * diagnosis warning applies.
 */
const SEV = { HIGH: ['#fef2f2', '#fecaca', '#991b1b'], MEDIUM: ['#fffbeb', '#fde68a', '#92400e'], LOW: ['#f8fafc', '#e2e8f0', '#334155'] };
const COVER = { PREFERRED: ['#dcfce7', '#166534'], COVERED: ['#dbeafe', '#1e40af'], RESTRICTED: ['#fef3c7', '#92400e'], EXCLUDED: ['#fee2e2', '#991b1b'], UNLISTED: ['#f1f5f9', '#475569'] };

export default function RxAdvicePanel({ patientId, patientName, medications, diagnosis, onSwitch }) {
  const [advice, setAdvice] = useState(null);
  const [preauth, setPreauth] = useState(null);
  const timer = useRef(null);
  const meds = (medications || []).filter(m => m?.name?.trim());
  const key = JSON.stringify([patientId, meds.map(m => [m.name, m.strength, m.quantity]), diagnosis]);

  useEffect(() => {
    if (!patientId || !meds.length) { setAdvice(null); return undefined; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const icd = (diagnosis || '').match(/\b[A-TV-Z]\d{2}(\.\d{1,2})?\b/i)?.[0] || null;
      api('/api/v1/insurance/rx-advice', { method: 'POST', body: {
        patientId, medications: meds.map(m => ({ name: m.name, strength: m.strength || null, quantity: m.quantity ? Number(m.quantity) : null })),
        diagnosisIcd: icd, diagnosisText: diagnosis || null,
      } }).then(setAdvice).catch(() => setAdvice(null));
    }, 700);
    return () => clearTimeout(timer.current);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!advice || (!advice.insured && !(advice.warnings || []).length)) return null;
  const needsPa = (advice.lines || []).filter(l => l.requiresPreauth);
  return (
    <div style={{ border: '1.5px solid #c7d2fe', background: 'linear-gradient(135deg,#eef2ff,#f8fafc)', borderRadius: 14, padding: '0.85rem 1rem', margin: '0 0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ color: '#312e81' }}>✨ Prescription check{advice.insured ? ` · ${advice.insurerName}${advice.planName ? ` (${advice.planName})` : ''}` : ''}</b>
        {Number(advice.potentialSaving) > 0 && <span style={{ background: '#16a34a', color: '#fff', borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 800 }}>Save GHS {Number(advice.potentialSaving).toFixed(2)}</span>}
      </div>
      {advice.aiNote && <p style={{ margin: '0.4rem 0', fontSize: '0.84rem', color: '#3730a3' }}>{advice.aiNote}</p>}
      {(advice.warnings || []).map((w, i) => { const c = SEV[w.severity] || SEV.LOW; return (
        <div key={i} style={{ background: c[0], border: `1px solid ${c[1]}`, color: c[2], borderRadius: 10, padding: '0.45rem 0.65rem', fontSize: '0.82rem', marginTop: 6 }}>⚠ {w.text}</div>); })}
      {advice.insured && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: 8 }}>
          <tbody>{(advice.lines || []).map((l, i) => { const c = COVER[l.cover] || COVER.UNLISTED; return (
            <tr key={i} style={{ borderTop: '1px solid #e0e7ff' }}>
              <td style={{ padding: '0.4rem 0', fontWeight: 700 }}>{l.name}{l.generic && l.isBrand ? <div style={{ fontWeight: 400, color: '#64748b', fontSize: '0.74rem' }}>{l.generic}</div> : null}</td>
              <td><span style={{ background: c[0], color: c[1], borderRadius: 999, padding: '0.1rem 0.5rem', fontSize: '0.7rem', fontWeight: 800 }}>{(l.cover || '').toLowerCase()}</span>
                <div style={{ color: '#64748b', fontSize: '0.74rem' }}>{l.coverText}</div></td>
              <td style={{ textAlign: 'right' }}>
                {l.cheaperOption && (
                  <div><span style={{ fontSize: '0.76rem', color: '#166534' }}>{l.cheaperOption.name} — {l.cheaperOption.why}{l.cheaperOption.saving != null ? ` · save GHS ${Number(l.cheaperOption.saving).toFixed(2)}` : ''}</span>
                    {onSwitch && <button type="button" className="doctor-btn doctor-btn-sm doctor-btn-outline" style={{ marginLeft: 6 }} onClick={() => onSwitch(medications.findIndex(m => m.name === l.name), l.cheaperOption.name, l.cheaperOption.strength)}>Switch</button>}</div>)}
                {l.requiresPreauth && <button type="button" className="doctor-btn doctor-btn-sm doctor-btn-outline" style={{ marginTop: 4 }} onClick={() => setPreauth([l])}>Ask insurer for approval</button>}
              </td>
            </tr>); })}</tbody>
        </table>
      )}
      {needsPa.length > 1 && <button type="button" className="doctor-btn doctor-btn-sm doctor-btn-outline" style={{ marginTop: 6 }} onClick={() => setPreauth(needsPa)}>Ask approval for all {needsPa.length}</button>}
      {preauth && <PreauthRequestModal patientId={patientId} patientName={patientName} serviceType="PHARMACY" sourceType="PRESCRIPTION"
        initialItems={preauth.map(l => { const m = medications.find(x => x.name === l.name) || {}; return { description: l.name, code: '', quantity: Number(m.quantity) || 1, unitPrice: l.tariff ?? '' }; })}
        diagnosisText={diagnosis} onClose={() => setPreauth(null)} onDone={() => { setPreauth(null); alert('Sent to the insurer. You will be notified of the decision — the pharmacy can dispense once approved.'); }} />}
    </div>
  );
}
