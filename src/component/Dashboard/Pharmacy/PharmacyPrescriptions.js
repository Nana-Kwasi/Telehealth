import React, { useState, useEffect } from 'react';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const STATUS_META = {
  sent:                { label: 'Sent',               badge: 'badge-blue'   },
  accepted:            { label: 'Accepted',           badge: 'badge-green'  },
  partially_fulfilled: { label: 'Partial',            badge: 'badge-yellow' },
  ready:               { label: 'Ready',              badge: 'badge-green'  },
  delivered:           { label: 'Delivered',          badge: 'badge-gray'   },
};

const DRUG_STATUS_META = {
  pending:              { label: 'Pending',           icon: '⏳', color: '#f59e0b' },
  available:            { label: 'Available',         icon: '✅', color: '#16a34a' },
  not_available:        { label: 'Not Available',     icon: '❌', color: '#dc2626' },
  alternative_suggested:{ label: 'Alt. Suggested',   icon: '🔁', color: '#7c3aed' },
  approved_replacement: { label: 'Approved',          icon: '✅', color: '#16a34a' },
};

export default function PharmacyPrescriptions({ profile }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [altModal, setAltModal] = useState(null); // { rxId, medIndex }
  const [altText, setAltText] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', profile.id)));
      const list = snap.docs.map(d => {
        const data = d.data();
        // Ensure each medication has a drugStatus field
        const medications = (data.medications || []).map(m => ({ ...m, drugStatus: m.drugStatus || 'pending' }));
        return { id: d.id, ...data, medications };
      });
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(list);
    } catch (e) {
      console.error('Pharmacy prescriptions load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateDrugStatus = async (rx, medIndex, newStatus) => {
    setSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) => i === medIndex ? { ...m, drugStatus: newStatus } : m);

      // Compute prescription-level status from drug statuses
      const statuses = updatedMeds.map(m => m.drugStatus);
      let rxStatus = 'accepted';
      if (statuses.every(s => s === 'available' || s === 'approved_replacement')) {
        rxStatus = 'ready';
      } else if (statuses.some(s => s === 'not_available' || s === 'alternative_suggested')) {
        rxStatus = 'partially_fulfilled';
      }

      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        medications: updatedMeds,
        pharmacyStatus: rxStatus,
        updatedAt: serverTimestamp(),
      });

      const updated = { ...rx, medications: updatedMeds, pharmacyStatus: rxStatus };
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? updated : r));
      if (selected?.id === rx.id) setSelected(updated);
    } catch (e) {
      alert('Failed to update drug status. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const suggestAlternative = async () => {
    if (!altText.trim()) return;
    const { rxId, medIndex } = altModal;
    const rx = prescriptions.find(r => r.id === rxId);
    if (!rx) return;
    setSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'alternative_suggested', alternativeSuggested: altText.trim() } : m
      );
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        medications: updatedMeds,
        pharmacyStatus: 'partially_fulfilled',
        updatedAt: serverTimestamp(),
      });
      const updated = { ...rx, medications: updatedMeds, pharmacyStatus: 'partially_fulfilled' };
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? updated : r));
      if (selected?.id === rx.id) setSelected(updated);
      setAltModal(null);
      setAltText('');
    } catch (e) {
      alert('Failed to suggest alternative.');
    } finally {
      setSaving(false);
    }
  };

  const sm = (rx) => STATUS_META[rx.pharmacyStatus] || STATUS_META.sent;

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">Prescriptions</h1>
      <p className="pharmacy-page-sub">All prescriptions routed to {profile?.pharmacyName || 'your pharmacy'}.</p>

      {loading ? (
        <div style={{ color: '#64748b' }}>Loading prescriptions…</div>
      ) : prescriptions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px solid #e0f2fe' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💊</div>
          <p>No prescriptions routed to this pharmacy yet.</p>
        </div>
      ) : (
        <div className="rx-list">
          {prescriptions.map(rx => (
            <div key={rx.id} className="rx-card" onClick={() => setSelected(rx)}>
              <div className="rx-card-header">
                <div>
                  <div className="rx-patient">{rx.patientName || 'Patient'}</div>
                  <div className="rx-doctor">Dr. {rx.doctorName || 'Doctor'} · {rx.diagnosis || '—'}</div>
                </div>
                <span className={`badge ${sm(rx).badge}`}>{sm(rx).label}</span>
              </div>
              <div className="rx-meds">
                {(rx.medications || []).map((m, i) => {
                  const ds = DRUG_STATUS_META[m.drugStatus] || DRUG_STATUS_META.pending;
                  return (
                    <span key={i} className="rx-med-pill" style={{ background: `${ds.color}18`, color: ds.color }}>
                      {ds.icon} {m.name}
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>📅 {rx.date || '—'} · {(rx.medications || []).length} drug(s)</div>
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '1rem' }}
          onClick={() => setSelected(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 800, color: '#0c4a6e' }}>{selected.patientName}</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Dr. {selected.doctorName} · {selected.diagnosis}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', color: '#64748b' }}>✕ Close</button>
            </div>

            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
              Medications — mark availability for each
            </h3>

            {(selected.medications || []).map((med, i) => {
              const ds = DRUG_STATUS_META[med.drugStatus] || DRUG_STATUS_META.pending;
              return (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', marginBottom: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div>
                      <b style={{ fontSize: '0.9rem', color: '#0f172a' }}>{med.name}</b>
                      {med.strength && <span style={{ fontSize: '0.78rem', color: '#64748b' }}> ({med.strength})</span>}
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                        {med.drugForm} · {med.dosage} · {med.frequency} · {med.duration}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: ds.color, background: `${ds.color}15`, padding: '3px 8px', borderRadius: 20 }}>
                      {ds.icon} {ds.label}
                    </span>
                  </div>

                  {med.alternativeSuggested && (
                    <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#7c3aed', marginBottom: '0.5rem' }}>
                      🔁 Alternative suggested: <b>{med.alternativeSuggested}</b>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    <button disabled={saving || med.drugStatus === 'available'} onClick={() => updateDrugStatus(selected, i, 'available')}
                      style={{ padding: '0.3rem 0.75rem', borderRadius: 8, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem', opacity: med.drugStatus === 'available' ? 0.5 : 1 }}>
                      ✅ Available
                    </button>
                    <button disabled={saving || med.drugStatus === 'not_available'} onClick={() => updateDrugStatus(selected, i, 'not_available')}
                      style={{ padding: '0.3rem 0.75rem', borderRadius: 8, background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem', opacity: med.drugStatus === 'not_available' ? 0.5 : 1 }}>
                      ❌ Not Available
                    </button>
                    <button disabled={saving} onClick={() => { setAltModal({ rxId: selected.id, medIndex: i }); setAltText(''); }}
                      style={{ padding: '0.3rem 0.75rem', borderRadius: 8, background: '#fdf4ff', color: '#7c3aed', border: '1px solid #e9d5ff', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem' }}>
                      🔁 Suggest Alt.
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alternative suggestion modal */}
      {altModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Suggest Alternative Drug</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#64748b' }}>
              Enter the name of the alternative drug you recommend. This will be sent to the doctor for approval.
            </p>
            <input
              placeholder="e.g. Amoxicillin 500mg (generic)"
              value={altText}
              onChange={e => setAltText(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem', marginBottom: '1rem', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setAltModal(null)}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 8, background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', color: '#64748b' }}>
                Cancel
              </button>
              <button onClick={suggestAlternative} disabled={saving || !altText.trim()}
                style={{ flex: 2, padding: '0.6rem', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', opacity: !altText.trim() ? 0.5 : 1 }}>
                {saving ? 'Sending…' : '🔁 Submit Alternative'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
