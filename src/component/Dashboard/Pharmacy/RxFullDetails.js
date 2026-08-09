import React, { useState } from 'react';
import { patientVisibleNotes } from '../../../utils/pharmacyRxStatus';

/**
 * Collapsible read-only view of everything the doctor put on a prescription.
 *
 * The pharmacy screens are built around the dispensing workflow and only render the
 * few fields that workflow needs, so form-specific prescribing detail (route,
 * injection site, PRN limits, refills, schedule…) was invisible to the dispenser.
 * This panel surfaces the full record without touching the ops controls.
 */

const rxRow = (k, v) => [k, v === 0 || v ? String(v) : ''];

function medRows(m) {
  return [
    rxRow('Strength', m.strength),
    rxRow('Form', m.drugForm),
    rxRow('Dosage', m.dosage),
    rxRow('Frequency', m.frequency),
    rxRow('Direction', m.direction),
    rxRow('Duration', m.duration ? `${m.duration} ${m.durationUnit || ''}`.trim() : ''),
    rxRow('Route', m.route),
    rxRow('Injection site', m.injectionSite),
    rxRow('Application site', m.applicationSite),
    rxRow('Administration site', m.dropSite),
    rxRow('Volume unit', m.drugForm === 'Syrup' ? m.volumeUnit : ''),
    rxRow('Shake well', m.drugForm === 'Syrup' ? (m.shakeWell ? 'Yes' : 'No') : ''),
    rxRow('Spacer required', m.drugForm === 'Inhaler' ? (m.spacerRequired ? 'Yes' : 'No') : ''),
    rxRow('Rinse after use', m.drugForm === 'Inhaler' ? (m.rinseAfter ? 'Yes' : 'No') : ''),
    rxRow('Change interval', m.changeInterval),
    rxRow('Rotate site', m.drugForm === 'Patch' ? (m.rotationRequired ? 'Yes' : 'No') : ''),
    rxRow('Special instructions', m.specialInstructions),
    rxRow('PRN indication', m.prn?.indication),
    rxRow('PRN max/day', m.prn?.maxPerDay),
    rxRow('PRN interval', m.prn?.interval),
    rxRow('Refill allowed', m.refill ? (m.refill.allowed ? 'Yes' : 'No') : ''),
    rxRow('Refill count', m.refill?.count),
    rxRow('Refill expiry', m.refill?.expiryDate),
    rxRow('Schedule', Array.isArray(m.schedule) && m.schedule.length ? m.schedule.join(', ') : ''),
    rxRow('Partial fill reason', m.partialFillReasoning),
  ].filter(([, v]) => v && v.trim() !== '');
}

const cellLabel = { fontSize: '0.66rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em' };
const cellValue = { fontSize: '0.8rem', color: '#334155', wordBreak: 'break-word' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.4rem 0.9rem' };

export default function RxFullDetails({ rx }) {
  const [open, setOpen] = useState(false);
  if (!rx) return null;

  const summary = [
    rxRow('Patient', rx.patientName),
    rxRow('Prescriber', rx.doctorName ? `Dr. ${rx.doctorName}` : ''),
    // Contact numbers: the dispenser needs to reach the prescriber about a dose, or
    // the patient about a substitution/transfer.
    rxRow('Prescriber phone', rx.doctorPhone),
    rxRow('Patient phone', rx.patientPhone),
    rxRow('Diagnosis', rx.diagnosis),
    rxRow('Date', rx.date),
    rxRow('Follow-up', rx.followUpDate),
    rxRow('Reference', rx.prescriptionRef),
    rxRow('Pharmacy', rx.pharmacyName),
    rxRow('Branch', rx.branchName),
    rxRow('Rx status', rx.status),
    rxRow('Pharmacy status', rx.pharmacyStatus),
    rxRow('Delivered at', rx.deliveredAt ? new Date(rx.deliveredAt.seconds ? rx.deliveredAt.seconds * 1000 : rx.deliveredAt).toLocaleString() : ''),
    rxRow('Dispensed brand/pack', rx.dispensedBrandPackUsed),
    rxRow('Counseling / pickup', rx.counselingPickupInstruction),
    rxRow('Cold chain / storage', rx.coldChainStorageHandling),
    rxRow('Dispense exception', rx.dispenseExceptionDetail),
  ].filter(([, v]) => v && v.trim() !== '');

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.85rem 1rem', marginBottom: '0.9rem' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: '#1d4ed8' }}
      >
        {open ? '▾ Hide full prescription details' : '▸ View full prescription details'}
      </button>

      {open && (
        <div style={{ marginTop: '0.8rem' }}>
          <div style={grid}>
            {summary.map(([k, v]) => (
              <div key={k}>
                <div style={cellLabel}>{k}</div>
                <div style={cellValue}>{v}</div>
              </div>
            ))}
          </div>

          {rx.instructions && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: '#334155' }}>
              <b>General instructions:</b> {rx.instructions}
            </p>
          )}

          {(rx.medications || []).map((m, i) => {
            const rows = medRows(m);
            const notes = patientVisibleNotes(m);
            return (
              <div key={i} style={{ marginTop: '0.75rem', paddingTop: '0.7rem', borderTop: '1px dashed #e2e8f0' }}>
                <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>
                  {m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}
                </p>
                {rows.length > 0 ? (
                  <div style={grid}>
                    {rows.map(([k, v]) => (
                      <div key={k}>
                        <div style={cellLabel}>{k}</div>
                        <div style={cellValue}>{v}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>No further prescribing detail recorded.</p>
                )}
                {m.alternativeSuggested && (
                  <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: m.drugStatus === 'approved_replacement' ? '#166534' : '#7c3aed', fontWeight: 700 }}>
                    🔁 {m.alternativeSuggested} · {m.drugStatus === 'approved_replacement' ? 'Approved by doctor' : 'Awaiting doctor approval'}
                    {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                  </p>
                )}
                {notes.map((n, ni) => (
                  <p key={ni} style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#475569' }}>
                    💊 <b>{n.label || 'Pharmacy note'}</b>: {n.note}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
