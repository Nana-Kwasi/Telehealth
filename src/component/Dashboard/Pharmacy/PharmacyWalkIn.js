import React, { useState } from 'react';
import { db } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

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

export default function PharmacyWalkIn({ profile }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rx, setRx] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    const val = input.trim().toUpperCase();
    if (!val) return;
    setLoading(true);
    setRx(null);
    setNotFound(false);
    setError('');
    setMarked(false);

    try {
      const q = query(
        collection(db, 'doctorPrescriptions'),
        where('prescriptionRef', '==', val),
        where('pharmacyId', '==', profile.id)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setRx({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error('Walk-in lookup error:', err);
      setError('Lookup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const markDelivered = async () => {
    if (!rx) return;
    setMarking(true);
    try {
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        pharmacyStatus: 'delivered',
        deliveredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRx(prev => ({ ...prev, pharmacyStatus: 'delivered' }));
      setMarked(true);
    } catch (err) {
      alert('Failed to mark as delivered. Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const pm = rx?.pharmacyStatus ? (RX_STATUS_META[rx.pharmacyStatus] || null) : null;

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">Walk-in Verification</h1>
      <p className="pharmacy-page-sub">Scan or enter a prescription reference code to verify a walk-in patient</p>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e0f2fe', padding: '1.5rem', maxWidth: 640, marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder="RX-XXXXXXXX"
            style={{
              flex: 1, padding: '0.7rem 1rem', border: '1.5px solid #bae6fd',
              borderRadius: 10, fontSize: '1.1rem', fontFamily: 'monospace',
              fontWeight: 700, letterSpacing: '0.08em', outline: 'none', color: '#0c4a6e',
              background: '#f0f9ff',
            }}
          />
          <button type="submit" disabled={loading || !input.trim()}
            style={{ padding: '0.7rem 1.5rem', borderRadius: 10, background: '#0c4a6e', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Searching…' : '🔍 Look Up'}
          </button>
        </form>
      </div>

      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '0.75rem 1rem', color: '#be123c', fontSize: '0.875rem', maxWidth: 640, marginBottom: '1rem' }}>
          🚨 {error}
        </div>
      )}

      {notFound && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '2.5rem', textAlign: 'center', maxWidth: 640 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔍</div>
          <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>Prescription not found</p>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            No prescription with code <b style={{ fontFamily: 'monospace', color: '#0c4a6e' }}>{input}</b> is routed to this pharmacy.
          </p>
        </div>
      )}

      {rx && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e0f2fe', padding: '1.5rem', maxWidth: 640 }}>
          {/* Status banner */}
          {pm && (
            <div style={{ background: pm.bg, border: `1.5px solid ${pm.color}40`, borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '0.72rem', fontWeight: 700, color: pm.color, textTransform: 'uppercase' }}>Status</p>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: pm.color }}>{pm.label}</p>
              </div>
              {rx.pharmacyStatus === 'ready' && <div style={{ fontSize: '2rem' }}>✅</div>}
              {rx.pharmacyStatus === 'delivered' && <div style={{ fontSize: '2rem' }}>📦</div>}
            </div>
          )}

          {/* Ref */}
          <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
            <p style={{ margin: '0 0 2px', fontSize: '0.7rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Prescription Reference</p>
            <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 900, color: '#0c4a6e', letterSpacing: '0.12em' }}>{rx.prescriptionRef}</p>
          </div>

          {/* Patient / Doctor info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Patient', value: rx.patientName || '—' },
              { label: 'Doctor', value: rx.doctorName ? `Dr. ${rx.doctorName}` : '—' },
              { label: 'Diagnosis', value: rx.diagnosis || '—' },
              { label: 'Date', value: rx.date || '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '0.6rem 0.875rem' }}>
                <p style={{ margin: '0 0 2px', fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{label}</p>
                <p style={{ margin: 0, fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Medications */}
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0c4a6e', marginBottom: '0.75rem' }}>Medications</h3>
          {(rx.medications || []).map((med, i) => {
            const ds = DRUG_STATUS_META[med.drugStatus] || DRUG_STATUS_META.pending;
            return (
              <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <b style={{ color: '#0f172a' }}>{med.name}</b>
                  {med.strength && <span style={{ fontSize: '0.78rem', color: '#64748b' }}> ({med.strength})</span>}
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    {[med.drugForm, med.dosage, med.frequency, med.duration && `${med.duration} ${med.durationUnit}`].filter(Boolean).join(' · ')}
                  </div>
                  {med.alternativeSuggested && (
                    <div style={{ fontSize: '0.78rem', color: '#7c3aed', marginTop: 4 }}>
                      🔁 Alternative: <b>{med.alternativeSuggested}</b>
                      {med.drugStatus === 'approved_replacement' ? ' ✅ Doctor approved' : ''}
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

          {/* Mark as delivered button */}
          {rx.pharmacyStatus === 'ready' && !marked && (
            <button onClick={markDelivered} disabled={marking}
              style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem', borderRadius: 10, background: '#0c4a6e', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.95rem', cursor: marking ? 'not-allowed' : 'pointer', opacity: marking ? 0.7 : 1 }}>
              {marking ? 'Marking…' : '📦 Mark as Delivered'}
            </button>
          )}
          {(rx.pharmacyStatus === 'delivered' || marked) && (
            <div style={{ marginTop: '1.25rem', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '0.85rem', textAlign: 'center', color: '#15803d', fontWeight: 700 }}>
              ✅ Prescription marked as delivered
            </div>
          )}
        </div>
      )}
    </div>
  );
}
