import React, { useState } from 'react';
import { db } from '../../../services/firestoreShim';
import { collection, query, where, getDocs } from '../../../services/firestoreShim';

const DRUG_STATUS_META = {
  pending:               { icon: '⏳', label: 'Pending',       color: '#d97706' },
  available:             { icon: '✅', label: 'Available',     color: '#16a34a' },
  not_available:         { icon: '❌', label: 'Not Available', color: '#dc2626' },
  alternative_suggested: { icon: '🔁', label: 'Alt. Suggested',color: '#7c3aed' },
  approved_replacement:  { icon: '✅', label: 'Approved Alt.', color: '#16a34a' },
};

const RX_STATUS_META = {
  sent:                { label: 'Sent',               bg: '#eff6ff', color: '#1d4ed8' },
  accepted:            { label: 'Accepted',           bg: '#fff7ed', color: '#d97706' },
  partially_fulfilled: { label: 'Partially Fulfilled',bg: '#fffbeb', color: '#d97706' },
  ready:               { label: 'Ready for Pickup',   bg: '#f0fdf4', color: '#16a34a' },
  delivered:           { label: 'Delivered',          bg: '#f8fafc', color: '#475569' },
};

export default function AdminWalkInVerify() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: 'found'|'not_found', rx }
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    const val = input.trim().toUpperCase();
    if (!val) return;
    setLoading(true);
    setResult(null);
    setError('');

    try {
      // Search by prescriptionRef
      const snap = await getDocs(
        query(collection(db, 'doctorPrescriptions'), where('prescriptionRef', '==', val))
      );

      if (!snap.empty) {
        const rx = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setResult({ type: 'found', rx });
        return;
      }

      // Fallback: search by patient name prefix (case-insensitive not possible in Firestore,
      // so we do a full fetch and filter client-side only if no ref match)
      setResult({ type: 'not_found' });
    } catch (err) {
      console.error('Walk-in lookup error:', err);
      setError('Lookup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const rx = result?.rx;
  const pm = rx?.pharmacyStatus ? (RX_STATUS_META[rx.pharmacyStatus] || null) : null;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Walk-in Verification</h1>
        <p className="admin-page-sub">Look up a prescription by its reference code to verify a walk-in patient</p>
      </div>

      <div className="admin-table-card" style={{ maxWidth: 680 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter prescription reference (e.g. RX-AB3C4D5E)"
            style={{
              flex: 1, padding: '0.65rem 1rem', border: '1.5px solid #e2e8f0',
              borderRadius: 10, fontSize: '1rem', fontFamily: 'monospace',
              fontWeight: 700, letterSpacing: '0.05em', outline: 'none', color: '#0f172a',
              textTransform: 'uppercase',
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn btn-primary"
            style={{ padding: '0.65rem 1.5rem', fontWeight: 700, fontSize: '0.95rem' }}
          >
            {loading ? 'Looking up…' : '🔍 Verify'}
          </button>
        </form>

        {error && (
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '0.65rem 0.875rem', color: '#be123c', fontSize: '0.875rem', marginBottom: '1rem' }}>
            🚨 {error}
          </div>
        )}

        {result?.type === 'not_found' && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔍</div>
            <p style={{ fontWeight: 700, color: '#64748b' }}>No prescription found</p>
            <p style={{ fontSize: '0.85rem' }}>No prescription matches the reference code <b style={{ fontFamily: 'monospace', color: '#0c4a6e' }}>{input.trim().toUpperCase()}</b>. Please check the code and try again.</p>
          </div>
        )}

        {rx && (
          <div>
            {/* Status banner */}
            {pm && (
              <div style={{ background: pm.bg, border: `1.5px solid ${pm.color}40`, borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: pm.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prescription Status</p>
                  <p style={{ margin: '2px 0 0', fontSize: '1.1rem', fontWeight: 800, color: pm.color }}>{pm.label}</p>
                </div>
                {rx.pharmacyStatus === 'ready' && (
                  <div style={{ fontSize: '2rem' }}>✅</div>
                )}
              </div>
            )}

            {/* Ref code */}
            <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Prescription Reference</p>
                <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 900, color: '#0c4a6e', letterSpacing: '0.1em' }}>{rx.prescriptionRef}</p>
              </div>
            </div>

            {/* Patient & Doctor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Patient', value: rx.patientName || '—' },
                { label: 'Doctor', value: rx.doctorName ? `Dr. ${rx.doctorName}` : '—' },
                { label: 'Diagnosis', value: rx.diagnosis || '—' },
                { label: 'Date', value: rx.date || '—' },
                { label: 'Pharmacy', value: rx.pharmacyName || '—' },
                { label: 'Branch', value: rx.branchName || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '0.65rem 0.875rem' }}>
                  <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{label}</p>
                  <p style={{ margin: 0, fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Medications */}
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>Medications</h3>
            {(rx.medications || []).map((med, i) => {
              const ds = DRUG_STATUS_META[med.drugStatus] || DRUG_STATUS_META.pending;
              return (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '0.6rem', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <b style={{ color: '#0f172a' }}>{med.name}</b>
                    {med.strength && <span style={{ fontSize: '0.78rem', color: '#64748b' }}> ({med.strength})</span>}
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                      {[med.drugForm, med.dosage, med.frequency, med.duration && `${med.duration} ${med.durationUnit}`].filter(Boolean).join(' · ')}
                    </div>
                    {med.alternativeSuggested && (
                      <div style={{ fontSize: '0.78rem', color: '#7c3aed', marginTop: 4 }}>
                        🔁 Alternative: <b>{med.alternativeSuggested}</b>
                        {med.drugStatus === 'approved_replacement' ? ' (Doctor approved)' : ' (Awaiting approval)'}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: ds.color, background: `${ds.color}15`, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                    {ds.icon} {ds.label}
                  </span>
                </div>
              );
            })}

            {rx.instructions && (
              <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '0.75rem 1rem', marginTop: '0.75rem', fontSize: '0.85rem', color: '#0369a1' }}>
                <b>Instructions:</b> {rx.instructions}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
