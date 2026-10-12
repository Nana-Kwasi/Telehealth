// Add an e-pharmacy for several psychiatry clients at once — a copy of the
// E-Pharmacy feature on Doctor/DoctorHome.js (state, directory loading, save and
// modal), for therapists. Differences are marked "Psychiatry:".
// Keep fixes in step with DoctorHome.js.
import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, Search, X } from 'lucide-react';
import { db, collection, query, where, getDocs, doc, getDoc, setDoc } from '../../../services/firestoreShim';
import { dedupePatientPharmacies, hasPatientPharmacy } from '../../../utils/patientPharmacyDedupe';
import Paged from '../../Common/Paged';

export default function ClientEPharmacyModal({ open, onClose, therapistId }) {
  const [showEPharmacy, setShowEPharmacy] = useState(false);
  const [ephForm, setEphForm] = useState({ name: '', address: '', phone: '' });
  const [selectedPatientIds, setSelectedPatientIds] = useState(new Set());
  const [ephSearch, setEphSearch] = useState('');
  const [savingEph, setSavingEph] = useState(false);
  const [ephSource, setEphSource] = useState('platform');
  const [ephPharmacies, setEphPharmacies] = useState([]);
  const [ephBranches, setEphBranches] = useState([]);
  const [ephPharmacyId, setEphPharmacyId] = useState('');
  const [ephPharmacyName, setEphPharmacyName] = useState('');
  const [ephBranchId, setEphBranchId] = useState('');
  const [ephBranchName, setEphBranchName] = useState('');
  const [ephLoadingPh, setEphLoadingPh] = useState(false);
  const [ephLoadingBranches, setEphLoadingBranches] = useState(false);

  // Psychiatry: opened from the therapist home rather than toggled inside it.
  useEffect(() => { if (open) openEPharmacy(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!showEPharmacy && open) onClose?.(); }, [showEPharmacy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Psychiatry: the therapist's own psychiatry-track clients stand in for the
  // doctor's patients-from-appointments (same source as TherapistPrescriptions).
  const [allPatientsList, setAllPatientsList] = useState([]);
  useEffect(() => {
    if (!open || !therapistId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'therapists', therapistId, 'clients'));
        const ids = [...new Set(snap.docs.map(d => d.data().clientId).filter(Boolean))];
        const list = [];
        for (const cid of ids) {
          try {
            const c = await getDoc(doc(db, 'clients', cid));
            if (!c.exists()) continue;
            const data = c.data();
            if (String(data.careTrack || '').toLowerCase() !== 'psychiatry') continue;
            list.push({ id: cid, name: data.name || data.fullName || data.displayName || 'Client' });
          } catch (_) {}
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setAllPatientsList(list);
      } catch { if (!cancelled) setAllPatientsList([]); }
    })();
    return () => { cancelled = true; };
  }, [open, therapistId]);

  useEffect(() => {
    if (!showEPharmacy) return;
    let cancelled = false;
    (async () => {
      setEphLoadingPh(true);
      try {
        const snap = await getDocs(query(collection(db, 'pharmacies'), where('status', '==', 'active')));
        if (!cancelled) setEphPharmacies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        if (!cancelled) setEphPharmacies([]);
      } finally {
        if (!cancelled) setEphLoadingPh(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showEPharmacy]);

  const loadEphBranches = async (pharmacyId) => {
    if (!pharmacyId) {
      setEphBranches([]);
      return;
    }
    setEphLoadingBranches(true);
    setEphBranches([]);
    try {
      const snap = await getDocs(query(
        collection(db, 'pharmacyBranches'),
        where('pharmacyId', '==', pharmacyId),
        where('status', '==', 'active'),
      ));
      setEphBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      setEphBranches([]);
    } finally {
      setEphLoadingBranches(false);
    }
  };

  const ephPatients = useMemo(() => {
    if (!ephSearch.trim()) return allPatientsList;
    const q = ephSearch.toLowerCase();
    return allPatientsList.filter(p => p.name.toLowerCase().includes(q));
  }, [allPatientsList, ephSearch]);

  const toggleEphPatient = (id) => setSelectedPatientIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const openEPharmacy = () => {
    setEphForm({ name: '', address: '', phone: '' });
    setSelectedPatientIds(new Set());
    setEphSearch('');
    setEphSource('platform');
    setEphPharmacyId('');
    setEphPharmacyName('');
    setEphBranchId('');
    setEphBranchName('');
    setEphBranches([]);
    setShowEPharmacy(true);
  };

  const saveEPharmacy = async () => {
    if (selectedPatientIds.size === 0) { alert('Select at least one client.'); return; }

    let pharmacy;
    if (ephSource === 'platform') {
      if (!ephPharmacyId || !ephBranchId) {
        alert('Select a pharmacy and branch from the platform directory.');
        return;
      }
      const ph = ephPharmacies.find(p => p.id === ephPharmacyId);
      const br = ephBranches.find(b => b.id === ephBranchId);
      const lineName = [ephBranchName, ephPharmacyName].filter(Boolean).join(' · ');
      pharmacy = {
        name: lineName,
        address: (br?.address || ph?.address || '').trim(),
        country: (br?.country || ph?.country || br?.location?.country || ph?.location?.country || '').trim(),
        city: (br?.city || ph?.city || br?.location?.city || ph?.location?.city || '').trim(),
        area: (br?.area || ph?.area || br?.location?.area || ph?.location?.area || '').trim(),
        region: (br?.region || ph?.region || br?.location?.region || ph?.location?.region || '').trim(),
        street: (br?.street || ph?.street || br?.location?.street || ph?.location?.street || '').trim(),
        ghanaDigitalAddress: (br?.ghanaDigitalAddress || ph?.ghanaDigitalAddress || '').trim(),
        latitude: Number.isFinite(Number(br?.latitude ?? ph?.latitude ?? br?.location?.latitude ?? ph?.location?.latitude))
          ? Number(br?.latitude ?? ph?.latitude ?? br?.location?.latitude ?? ph?.location?.latitude)
          : null,
        longitude: Number.isFinite(Number(br?.longitude ?? ph?.longitude ?? br?.location?.longitude ?? ph?.location?.longitude))
          ? Number(br?.longitude ?? ph?.longitude ?? br?.location?.longitude ?? ph?.location?.longitude)
          : null,
        phone: (br?.phone || ph?.phone || '').trim(),
        pharmacyId: ephPharmacyId,
        branchId: ephBranchId,
        pharmacyName: ephPharmacyName,
        branchName: ephBranchName,
        source: 'platform',
        addedByDoctor: true,
        addedAt: new Date().toISOString(),
      };
    } else {
      if (!ephForm.name.trim()) { alert('Pharmacy name is required.'); return; }
      pharmacy = {
        name: ephForm.name.trim(),
        address: ephForm.address.trim(),
        country: '',
        city: '',
        area: '',
        region: '',
        street: '',
        ghanaDigitalAddress: '',
        latitude: null,
        longitude: null,
        phone: ephForm.phone.trim(),
        source: 'manual',
        addedByDoctor: true,
        addedAt: new Date().toISOString(),
      };
    }

    setSavingEph(true);
    try {
      let added = 0;
      let skippedDup = 0;
      for (const patientId of selectedPatientIds) {
        const patRef = doc(db, 'patientProfiles', patientId);
        const snap = await getDoc(patRef);
        const cleaned = dedupePatientPharmacies(snap.exists() ? (snap.data().pharmacies || []) : []);
        if (hasPatientPharmacy(cleaned, pharmacy)) {
          skippedDup += 1;
          continue;
        }
        await setDoc(patRef, { pharmacies: [...cleaned, pharmacy] }, { merge: true });
        added += 1;
      }
      setShowEPharmacy(false);
      const parts = [];
      if (added) parts.push(`Added to ${added} client${added > 1 ? 's' : ''}.`);
      if (skippedDup) parts.push(`${skippedDup} skipped (branch already on file).`);
      alert(parts.join(' ') || 'No changes.');
    } catch (err) {
      console.error('E-Pharmacy save error:', err);
      alert('Failed to save. Please try again.');
    }
    setSavingEph(false);
  };


  return (
    <>
      {showEPharmacy && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowEPharmacy(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShoppingBag size={20} color="#0f766e" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Add E-Pharmacy</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Assign a pharmacy to your psychiatry clients</p>
              </div>
              <button onClick={() => setShowEPharmacy(false)} style={{ width: 34, height: 34, borderRadius: 17, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#64748b" />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setEphSource('platform')}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: 10, border: ephSource === 'platform' ? '2px solid #0f766e' : '1.5px solid #e2e8f0', background: ephSource === 'platform' ? '#f0fdfa' : '#fff', fontWeight: 700, fontSize: '0.78rem', color: ephSource === 'platform' ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                  Platform directory
                </button>
                <button type="button" onClick={() => setEphSource('manual')}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: 10, border: ephSource === 'manual' ? '2px solid #0f766e' : '1.5px solid #e2e8f0', background: ephSource === 'manual' ? '#f0fdfa' : '#fff', fontWeight: 700, fontSize: '0.78rem', color: ephSource === 'manual' ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                  Enter manually
                </button>
              </div>

              {/* Pharmacy details */}
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                  {ephSource === 'platform' ? 'Choose e-pharmacy (onboarded)' : 'Pharmacy details'}
                </p>
                {ephSource === 'platform' ? (
                  <>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.45 }}>Same directory as when routing prescriptions — only admin-approved (<code style={{ fontSize: '0.7rem' }}>active</code>) pharmacies and branches.</p>
                    {ephLoadingPh ? <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Loading pharmacies…</p>
                      : ephPharmacies.length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309' }}>No active pharmacies. Use &quot;Enter manually&quot; or ask admin to approve the pharmacy in Account Approvals.</p>
                      ) : (
                        <>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Pharmacy</label>
                          <select
                            value={ephPharmacyId}
                            onChange={e => {
                              const id = e.target.value;
                              const ph = ephPharmacies.find(p => p.id === id);
                              setEphPharmacyId(id);
                              setEphPharmacyName(ph ? (ph.pharmacyName || ph.name || '') : '');
                              setEphBranchId('');
                              setEphBranchName('');
                              loadEphBranches(id);
                            }}
                            style={{ border: '1.5px solid #bae6fd', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff' }}
                          >
                            <option value="">— Select pharmacy —</option>
                            {ephPharmacies.map(ph => (
                              <option key={ph.id} value={ph.id}>{ph.pharmacyName || ph.name || 'Pharmacy'}</option>
                            ))}
                          </select>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginTop: 4 }}>Branch</label>
                          <select
                            value={ephBranchId}
                            disabled={!ephPharmacyId || ephLoadingBranches}
                            onChange={e => {
                              const id = e.target.value;
                              const br = ephBranches.find(b => b.id === id);
                              setEphBranchId(id);
                              setEphBranchName(br ? (br.branchName || '') : '');
                            }}
                            style={{ border: '1.5px solid #bae6fd', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff', opacity: !ephPharmacyId ? 0.55 : 1 }}
                          >
                            <option value="">{ephLoadingBranches ? 'Loading…' : !ephPharmacyId ? 'Select pharmacy first' : ephBranches.length === 0 ? 'No active branches' : '— Select branch —'}</option>
                            {ephBranches.map(br => (
                              <option key={br.id} value={br.id}>{br.branchName || 'Branch'}</option>
                            ))}
                          </select>
                        </>
                      )}
                  </>
                ) : (
                  <>
                    <input style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.875rem', fontSize: '0.875rem', color: '#0f172a', outline: 'none', background: '#fff' }}
                      placeholder="Pharmacy name *" value={ephForm.name} onChange={e => setEphForm(f => ({ ...f, name: e.target.value }))} />
                    <input style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.875rem', fontSize: '0.875rem', color: '#0f172a', outline: 'none', background: '#fff' }}
                      placeholder="Address (optional)" value={ephForm.address} onChange={e => setEphForm(f => ({ ...f, address: e.target.value }))} />
                    <input style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.875rem', fontSize: '0.875rem', color: '#0f172a', outline: 'none', background: '#fff' }}
                      placeholder="Phone number (optional)" value={ephForm.phone} onChange={e => setEphForm(f => ({ ...f, phone: e.target.value }))} />
                  </>
                )}
              </div>

              {/* Patient selection */}
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>Select Clients</p>
                  {selectedPatientIds.size > 0 && (
                    <span style={{ background: '#0f766e', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: 12 }}>{selectedPatientIds.size} selected</span>
                  )}
                </div>
                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.5rem 0.75rem', marginBottom: '0.625rem' }}>
                  <Search size={14} color="#94a3b8" />
                  <input style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.875rem', color: '#0f172a', background: 'transparent' }}
                    placeholder="Search clients…" value={ephSearch} onChange={e => setEphSearch(e.target.value)} />
                </div>
                {/* Patient list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 240, overflowY: 'auto' }}>
                  {allPatientsList.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '1rem 0' }}>No psychiatry clients found</p>
                  ) : <Paged items={ephPatients}>{(ephPatients) => ephPatients.map(p => {
                    const isSel = selectedPatientIds.has(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => toggleEphPatient(p.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 10, border: `1.5px solid ${isSel ? '#5eead4' : '#e2e8f0'}`, background: isSel ? '#f0fdfa' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 17, background: isSel ? '#0f766e' : '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSel ? '#fff' : '#0284c7' }}>{(p.name || 'P')[0].toUpperCase()}</span>
                        </div>
                        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: isSel ? '#0f766e' : '#334155' }}>{p.name}</span>
                        <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isSel ? '#0f766e' : '#cbd5e1'}`, background: isSel ? '#0f766e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSel && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                        </div>
                      </button>
                    );
                  })}</Paged>}
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={saveEPharmacy}
                disabled={
                  savingEph
                  || selectedPatientIds.size === 0
                  || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId))
                  || (ephSource === 'manual' && !ephForm.name.trim())
                }
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem', borderRadius: 12, border: 'none',
                  background: (selectedPatientIds.size === 0 || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId)) || (ephSource === 'manual' && !ephForm.name.trim())) ? '#e2e8f0' : '#0f766e',
                  color: (selectedPatientIds.size === 0 || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId)) || (ephSource === 'manual' && !ephForm.name.trim())) ? '#94a3b8' : '#fff',
                  fontWeight: 700, fontSize: '0.9rem',
                  cursor: (selectedPatientIds.size === 0 || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId)) || (ephSource === 'manual' && !ephForm.name.trim())) ? 'not-allowed' : 'pointer',
                  opacity: savingEph ? 0.65 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <ShoppingBag size={16} />
                {savingEph ? 'Saving…'
                  : selectedPatientIds.size === 0 ? 'Select patients first'
                    : ephSource === 'manual' && !ephForm.name.trim() ? 'Enter pharmacy name'
                      : ephSource === 'platform' && (!ephPharmacyId || !ephBranchId) ? 'Select pharmacy & branch'
                        : `Add to ${selectedPatientIds.size} Patient${selectedPatientIds.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
