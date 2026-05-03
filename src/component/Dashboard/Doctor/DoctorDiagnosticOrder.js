import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, MapPin, AlertCircle, Search, Plus, Trash2 } from 'lucide-react';
import { db, auth } from '../../Auth/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp, doc, deleteDoc, getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { useLocation } from 'react-router-dom';
import { enrichPatientNames } from '../../../utils/enrichPatientNames';

const LAB_TESTS = [
  'Blood Count (CBC)', 'Liver Function Test (LFT)', 'Kidney Function Test (KFT)',
  'Lipid Panel', 'Blood Glucose (Fasting)', 'HbA1c (Glycated Haemoglobin)',
  'Thyroid Panel (TSH/T3/T4)', 'Urine Analysis', 'Pregnancy Test (Beta-hCG)',
  'HIV Screening Test', 'STI Panel', 'Stool Analysis',
  'Culture & Sensitivity', 'Bone Markers', 'Hormone Panel', 'Allergy Test',
];

const SCAN_TYPES = ['X-Ray', 'MRI (Magnetic Resonance Imaging)', 'CT Scan', 'Ultrasound'];

const STEPS = [
  { num: 1, label: 'Order Type' },
  { num: 2, label: 'Select Test' },
  { num: 3, label: 'Patient' },
  { num: 4, label: 'Select Center' },
  { num: 5, label: 'Review & Submit' },
];

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km) {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function generateOrderId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'ORD-';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const SEARCH_TIERS_KM = [30, 80, 150, 400, 2500, 100000];

export default function DoctorDiagnosticOrder({ profile }) {
  const location = useLocation();
  const preselectedPatientId = location.state?.patientId || null;
  const preselectedPatientName = location.state?.patientName || null;

  const [step, setStep] = useState(1);
  const [orderType, setOrderType] = useState(null);
  const [selectedTest, setSelectedTest] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [customEntries, setCustomEntries] = useState([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [patientAnchor, setPatientAnchor] = useState(null);
  const [searchPhase, setSearchPhase] = useState(null);
  const [searchRingKm, setSearchRingKm] = useState(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(collection(db, 'doctors', uid, 'diagnosticCustomEntries'), (snap) => {
      setCustomEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
    loadPatients();
  }, [profile]);

  useEffect(() => {
    if (preselectedPatientId && patients.length > 0) {
      const found = patients.find(p => p.id === preselectedPatientId);
      if (found) setSelectedPatient(found);
      else if (preselectedPatientName) setSelectedPatient({ id: preselectedPatientId, name: preselectedPatientName });
    }
  }, [patients, preselectedPatientId]);

  useEffect(() => {
    if (!selectedPatient?.id) {
      setPatientAnchor(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let lat;
        let lng;
        const ppSnap = await getDoc(doc(db, 'patientProfiles', selectedPatient.id)).catch(() => null);
        if (ppSnap?.exists()) {
          const pd = ppSnap.data();
          lat = pd.latitude ?? pd.lat ?? pd.location?.latitude ?? pd.location?.lat;
          lng = pd.longitude ?? pd.lng ?? pd.location?.longitude ?? pd.location?.lng;
        }
        if (lat == null || lng == null) {
          const authSnap = await getDoc(doc(db, 'auth', selectedPatient.id)).catch(() => null);
          if (authSnap?.exists()) {
            const ad = authSnap.data();
            lat = ad.latitude ?? ad.lat;
            lng = ad.longitude ?? ad.lng;
          }
        }
        if (cancelled) return;
        if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
          setPatientAnchor({ lat: Number(lat), lng: Number(lng) });
        } else {
          setPatientAnchor(null);
        }
      } catch {
        if (!cancelled) setPatientAnchor(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  const loadPatients = async () => {
    if (!profile?.id) return;
    setLoadingPatients(true);
    try {
      const snap = await getDocs(query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id)));
      const map = new Map();
      snap.docs.forEach(d => {
        const data = d.data();
        if (!data.clientId) return;
        const prev = map.get(data.clientId);
        if (!prev) {
          map.set(data.clientId, { id: data.clientId, name: data.clientName || '', email: data.clientEmail || '' });
        } else {
          if (!prev.name && data.clientName) prev.name = data.clientName;
          if (!prev.email && data.clientEmail) prev.email = data.clientEmail;
        }
      });
      const enriched = await enrichPatientNames(map);
      const list = Array.from(enriched.values()).map((p) => ({
        ...p,
        name: p.name || 'Unknown patient',
      }));
      setPatients(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { console.error(e); }
    finally { setLoadingPatients(false); }
  };

  const loadBranchesStaged = useCallback(async () => {
    if (!orderType) return;
    setLoadingBranches(true);
    setSelectedBranch(null);
    setSearchRingKm(null);
    setBranches([]);
    setSearchPhase({ message: 'Loading registered centers…', sub: null });
    try {
      const snap = await getDocs(collection(db, orderType === 'lab' ? 'labBranches' : 'scanBranches'));
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list = list.filter((b) => {
        const s = b.status;
        return s === undefined || s === null || String(s).toLowerCase() === 'active';
      });
      if (list.length === 0) {
        setSearchPhase({ message: 'No active branches found', sub: 'Ask admin to add lab/scan branches to the directory.' });
        return;
      }

      const anchor = patientAnchor || userLoc;
      const withDist = list.map((b) => {
        if (!anchor || b.latitude == null || b.longitude == null) {
          return { ...b, distance: null };
        }
        return {
          ...b,
          distance: haversine(anchor.lat, anchor.lng, Number(b.latitude), Number(b.longitude)),
        };
      });
      withDist.sort((a, b) => {
        if (a.distance == null && b.distance == null) return (a.branchName || '').localeCompare(b.branchName || '');
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      });

      if (!anchor) {
        setBranches(withDist);
        setSearchRingKm(Infinity);
        setSearchPhase({
          message: 'Patient location not on file',
          sub: 'Enable browser location or save patient coordinates in profile for nearest-first results. Showing all active centers.',
        });
        return;
      }

      const withCoords = withDist.filter((b) => b.distance != null);
      setSearchPhase({
        message: 'Searching centers near the patient…',
        sub: patientAnchor ? 'Using patient profile / saved location' : 'Using your browser location as fallback',
      });
      await new Promise((r) => setTimeout(r, 350));

      for (let i = 0; i < SEARCH_TIERS_KM.length; i++) {
        const tier = SEARCH_TIERS_KM[i];
        const tierLabel = tier >= 100000 ? 'all regions' : `${tier} km`;
        setSearchPhase({
          message: tier <= 400
            ? `Searching near patient (within ${tierLabel})…`
            : `Expanding search (${tierLabel})…`,
          sub: 'Sorted by distance from the patient',
        });
        await new Promise((r) => setTimeout(r, 400));
        const inTier = withCoords.filter((b) => b.distance <= tier);
        if (inTier.length > 0 || i === SEARCH_TIERS_KM.length - 1) {
          setSearchRingKm(tier >= 100000 ? Infinity : tier);
          setBranches(withDist);
          setSearchPhase({
            message: inTier.length > 0
              ? `Found ${inTier.length} center(s) within ${tier >= 100000 ? 'expanded search' : `${tier} km`}.`
              : withCoords.length === 0
                ? 'Centers have no map coordinates — showing full list.'
                : 'Showing every active center sorted by distance.',
            sub: null,
          });
          break;
        }
      }
    } catch (e) {
      console.error(e);
      setSearchPhase({ message: 'Could not load centers', sub: 'Check connection and try again.' });
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }, [orderType, patientAnchor, userLoc]);

  useEffect(() => {
    if (step !== 4 || !orderType || !selectedPatient?.id) return;
    loadBranchesStaged();
  }, [step, orderType, selectedPatient?.id, patientAnchor, loadBranchesStaged]);

  const handleTypeSelect = (type) => {
    setOrderType(type);
    setSelectedTest('');
    setSelectedBranch(null);
    setBranches([]);
    setSearchRingKm(null);
    setSearchPhase(null);
  };

  const canNext = () => {
    if (step === 1) return !!orderType;
    if (step === 2) return !!selectedTest;
    if (step === 3) return !!selectedPatient;
    if (step === 4) return !!selectedBranch;
    return false;
  };

  const saveCustomTest = async () => {
    const label = customLabel.trim();
    if (!label || !orderType) return;
    try {
      await addDoc(collection(db, 'doctors', auth.currentUser.uid, 'diagnosticCustomEntries'), {
        category: orderType,
        label,
        createdAt: serverTimestamp(),
      });
      setCustomLabel('');
      setShowCustomModal(false);
      setSelectedTest(label);
    } catch {
      alert('Could not save your custom entry.');
    }
  };

  const deleteCustomEntry = async (entry) => {
    if (!window.confirm(`Remove "${entry.label}" from your list?`)) return;
    try {
      await deleteDoc(doc(db, 'doctors', auth.currentUser.uid, 'diagnosticCustomEntries', entry.id));
      if (selectedTest === entry.label) setSelectedTest('');
    } catch {
      alert('Could not delete.');
    }
  };

  const handleSubmit = async () => {
    if (!orderType || !selectedTest || !selectedPatient || !selectedBranch) return;
    setSubmitting(true);
    try {
      const orderId = generateOrderId();
      await addDoc(collection(db, 'diagnosticOrders'), {
        orderId,
        doctorId: auth.currentUser.uid,
        doctorName: profile.name || 'Doctor',
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        patientNameLower: (selectedPatient.name || '').toLowerCase(),
        centerType: orderType,
        branchId: selectedBranch.id,
        centerId: selectedBranch.labId || selectedBranch.scanId || selectedBranch.id,
        centerName: selectedBranch.branchName || selectedBranch.centerName || selectedBranch.labName || 'Center',
        testType: selectedTest,
        notes: notes.trim(),
        status: 'PENDING',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'patientTimeline'), {
        patientId: selectedPatient.id,
        type: orderType === 'lab' ? 'LAB_ORDER' : 'SCAN_ORDER',
        title: `${orderType === 'lab' ? 'Lab' : 'Scan'} order: ${selectedTest}`,
        status: 'PENDING',
        relatedId: orderId,
        actor: { role: 'DOCTOR', name: profile.name || 'Doctor' },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      setSubmitted({ orderId, patientName: selectedPatient.name, testType: selectedTest });
    } catch (e) {
      console.error(e);
      alert('Could not submit order. Please try again.');
    } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setSubmitted(null);
    setStep(1);
    setOrderType(null);
    setSelectedTest('');
    setSelectedPatient(preselectedPatientId ? selectedPatient : null);
    setSelectedBranch(null);
    setNotes('');
  };

  const filteredPatients = patients.filter(p =>
    !patientSearch || p.name.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const ring = searchRingKm;
  const nearBranches = branches.filter((b) => {
    if (b.distance == null) return false;
    if (ring === Infinity || ring == null) return true;
    return b.distance <= ring;
  });
  const farBranches = branches.filter((b) => {
    if (ring === Infinity || ring == null) return b.distance == null;
    return b.distance == null || b.distance > ring;
  });

  const accent = orderType === 'scan' ? '#4c1d95' : '#065f46';
  const accentBg = orderType === 'scan' ? '#ede9fe' : '#d1fae5';
  const accentBorder = orderType === 'scan' ? '#c4b5fd' : '#6ee7b7';

  const renderBranch = (b) => {
    const isSelected = selectedBranch?.id === b.id;
    return (
      <button key={b.id} onClick={() => setSelectedBranch(b)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
          padding: '0.85rem 1rem', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
          marginBottom: '0.5rem', transition: 'all 0.15s',
          background: isSelected ? accentBg : '#f8fafc',
          border: `1.5px solid ${isSelected ? accentBorder : '#e2e8f0'}`,
        }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: isSelected ? accentBg : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MapPin size={16} color={isSelected ? accent : '#94a3b8'} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
            {b.branchName || b.centerName || b.labName || 'Branch'}
          </p>
          {b.address && <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#64748b' }}>{b.address}</p>}
        </div>
        {b.distance != null && (
          <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 20, padding: '0.2rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
            {fmtDist(b.distance)}
          </span>
        )}
        {isSelected && <Check size={16} color={accent} style={{ flexShrink: 0 }} />}
      </button>
    );
  };

  if (submitted) {
    return (
      <div className="doctor-page">
        <div style={{ maxWidth: 500, margin: '4rem auto', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <Check size={32} color="#16a34a" />
          </div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>Order Submitted</h2>
          <p style={{ margin: '0 0 0.25rem', color: '#64748b' }}>Patient: <strong>{submitted.patientName}</strong></p>
          <p style={{ margin: '0 0 1.5rem', color: '#64748b' }}>Test: <strong>{submitted.testType}</strong></p>
          <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '1rem 1.5rem', marginBottom: '1.25rem', textAlign: 'left', maxWidth: 320, margin: '0 auto 1.5rem' }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Reference</p>
            <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 800, color: '#16a34a', letterSpacing: '0.1em' }}>{submitted.orderId}</p>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            The patient will be notified. They must present their National ID at the center.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button className="doctor-btn doctor-btn-primary" onClick={resetForm}>New Order</button>
            <button className="doctor-btn doctor-btn-outline" onClick={() => window.history.back()}>Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Order Lab / Scan Test</h1>
        <p>Create a diagnostic order for a patient at a lab or imaging center</p>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Step sidebar */}
        <div style={{ width: 190, flexShrink: 0, background: 'white', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progress</p>
          {STEPS.map(s => {
            const isDone = step > s.num;
            const isCurrent = step === s.num;
            return (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0', borderBottom: s.num < 5 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.72rem', fontWeight: 800,
                  background: isDone ? '#f0fdf4' : isCurrent ? '#1e6bb8' : '#f1f5f9',
                  color: isDone ? '#16a34a' : isCurrent ? '#fff' : '#94a3b8',
                  border: isDone ? '1.5px solid #bbf7d0' : isCurrent ? 'none' : '1.5px solid #e2e8f0',
                }}>
                  {isDone ? <Check size={12} /> : s.num}
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#1e6bb8' : isDone ? '#16a34a' : '#94a3b8' }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div style={{ flex: 1 }}>
          <div className="doctor-card">

            {/* STEP 1 — Order Type */}
            {step === 1 && (
              <div>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>What type of diagnostic test?</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: 500 }}>
                  {[
                    { type: 'lab',  label: 'Laboratory Test',  sub: 'Blood, urine, stool analysis and more', emoji: '🧪', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
                    { type: 'scan', label: 'Imaging / Scan',   sub: 'X-Ray, MRI, CT Scan, Ultrasound',       emoji: '🩻', color: '#4c1d95', bg: '#ede9fe', border: '#c4b5fd' },
                  ].map(({ type, label, sub, emoji, color, bg, border }) => (
                    <button key={type} onClick={() => handleTypeSelect(type)}
                      style={{
                        background: orderType === type ? bg : '#f8fafc',
                        border: `2px solid ${orderType === type ? border : '#e2e8f0'}`,
                        borderRadius: 14, padding: '1.75rem 1.25rem', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                      }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{emoji}</div>
                      <p style={{ margin: '0 0 0.3rem', fontWeight: 800, fontSize: '0.95rem', color: orderType === type ? color : '#0f172a' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>{sub}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2 — Select Test */}
            {step === 2 && (
              <div>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Select {orderType === 'lab' ? 'Lab Test' : 'Scan Type'}
                </h3>
                <button type="button" className="doctor-btn doctor-btn-primary doctor-btn-sm" style={{ marginBottom: '1rem', background: '#059669', borderColor: '#059669' }}
                  onClick={() => setShowCustomModal(true)}>
                  <Plus size={14} /> Add my own {orderType === 'lab' ? 'test' : 'scan type'}
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.65rem' }}>
                  {(orderType === 'lab' ? LAB_TESTS : SCAN_TYPES).map(test => (
                    <button key={test} type="button" onClick={() => setSelectedTest(test)}
                      style={{
                        padding: '0.85rem 1rem', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.15s',
                        background: selectedTest === test ? accentBg : '#f8fafc',
                        border: `1.5px solid ${selectedTest === test ? accentBorder : '#e2e8f0'}`,
                        color: selectedTest === test ? accent : '#0f172a',
                      }}>
                      {test}
                    </button>
                  ))}
                  {customEntries.filter(c => c.category === orderType).map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.35rem 0.35rem 0.35rem 0.85rem', borderRadius: 10,
                      background: selectedTest === c.label ? accentBg : '#f8fafc',
                      border: `1.5px solid ${selectedTest === c.label ? accentBorder : '#e2e8f0'}`,
                    }}>
                      <button type="button" onClick={() => setSelectedTest(c.label)}
                        style={{ flex: 1, textAlign: 'left', padding: '0.5rem 0', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: selectedTest === c.label ? accent : '#0f172a' }}>
                        {c.label}
                      </button>
                      <button type="button" title="Remove" onClick={() => deleteCustomEntry(c)}
                        style={{ padding: '0.45rem', border: 'none', background: '#fef2f2', borderRadius: 8, cursor: 'pointer', color: '#b91c1c' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 3 — Select Patient */}
            {step === 3 && (
              <div>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Select Patient</h3>
                <div className="doctor-search" style={{ marginBottom: '1rem' }}>
                  <Search size={16} color="#94a3b8" />
                  <input type="text" placeholder="Search by name..." value={patientSearch} onChange={e => setPatientSearch(e.target.value)} />
                </div>
                {loadingPatients ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>Loading patients…</p>
                ) : filteredPatients.length === 0 ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>No patients found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 360, overflowY: 'auto' }}>
                    {filteredPatients.map(p => (
                      <button key={p.id} onClick={() => setSelectedPatient(p)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                          borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                          background: selectedPatient?.id === p.id ? '#eff6ff' : '#f8fafc',
                          border: `1.5px solid ${selectedPatient?.id === p.id ? '#bfdbfe' : '#e2e8f0'}`,
                        }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e8f1fb', color: '#1e6bb8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>
                          {(p.name || 'P')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>{p.name}</p>
                          {p.email && <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{p.email}</p>}
                        </div>
                        {selectedPatient?.id === p.id && <Check size={16} color="#1e6bb8" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 4 — Select Center */}
            {step === 4 && (
              <div>
                <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Select {orderType === 'lab' ? 'Lab Branch' : 'Imaging Center'}
                </h3>
                {searchPhase?.message && (
                  <div style={{
                    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '0.75rem 1rem',
                    marginTop: '0.75rem', marginBottom: '0.75rem',
                  }}>
                    <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#1e40af' }}>{searchPhase.message}</p>
                    {searchPhase.sub && <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>{searchPhase.sub}</p>}
                  </div>
                )}
                {!patientAnchor && !userLoc && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0.25rem 0 0.75rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <AlertCircle size={13} /> Enable location or save patient coordinates for distance sorting
                  </div>
                )}
                <div style={{ marginTop: '0.5rem' }}>
                  {loadingBranches ? (
                    <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>Loading centers…</p>
                  ) : branches.length === 0 ? (
                    <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>No centers available. Add branches via Admin dashboard first.</p>
                  ) : (
                    <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
                      {nearBranches.length > 0 && (
                        <>
                          <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {searchRingKm === Infinity ? 'Near patient (by distance)'
                              : searchRingKm != null ? `Near patient (≤ ${searchRingKm} km)`
                                : 'Near patient'}
                          </p>
                          {nearBranches.map(b => renderBranch(b))}
                        </>
                      )}
                      {farBranches.length > 0 && (
                        <>
                          <p style={{ margin: '1rem 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Further / no coordinates
                          </p>
                          {farBranches.map(b => renderBranch(b))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 5 — Review & Submit */}
            {step === 5 && (
              <div>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Review & Submit</h3>
                <div style={{ background: '#f8fafc', borderRadius: 12, border: '1.5px solid #e2e8f0', padding: '1.25rem', marginBottom: '1.25rem' }}>
                  {[
                    ['Order Type', orderType === 'lab' ? '🧪 Laboratory Test' : '🩻 Imaging / Scan'],
                    ['Test / Scan', selectedTest],
                    ['Patient', selectedPatient?.name],
                    ['Center', selectedBranch?.branchName || selectedBranch?.centerName || selectedBranch?.labName],
                    ['Address', selectedBranch?.address],
                    ['Distance', selectedBranch?.distance != null ? fmtDist(selectedBranch.distance) : null],
                  ].filter(([, val]) => val).map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.6rem 0', borderBottom: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div className="doctor-form-group">
                  <label>Clinical Notes / Special Instructions (optional)</label>
                  <textarea className="doctor-form-textarea" rows={3}
                    placeholder="Any specific instructions for the lab or imaging center…"
                    value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1.5px solid #f1f5f9' }}>
              <button className="doctor-btn doctor-btn-outline" onClick={() => setStep(s => s - 1)}
                style={{ visibility: step === 1 ? 'hidden' : 'visible' }}>
                <ChevronLeft size={16} /> Back
              </button>
              {step < 5 ? (
                <button className="doctor-btn doctor-btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button className="doctor-btn doctor-btn-primary"
                  style={{ background: '#065f46', borderColor: '#065f46' }}
                  onClick={handleSubmit}
                  disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Order'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCustomModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
          onClick={() => setShowCustomModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', maxWidth: 400, width: '100%', boxShadow: '0 22px 60px rgba(2,6,23,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 0.5rem', fontWeight: 800 }}>Custom {orderType === 'lab' ? 'lab test' : 'scan type'}</h4>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#64748b' }}>Saved only for your account.</p>
            <input className="doctor-form-input" placeholder="e.g. PET-CT, specialty panel…" value={customLabel} onChange={e => setCustomLabel(e.target.value)} style={{ marginBottom: '1rem' }} />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="doctor-btn doctor-btn-outline" style={{ flex: 1 }} onClick={() => { setShowCustomModal(false); setCustomLabel(''); }}>Cancel</button>
              <button type="button" className="doctor-btn doctor-btn-primary" style={{ flex: 1 }} onClick={saveCustomTest}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
