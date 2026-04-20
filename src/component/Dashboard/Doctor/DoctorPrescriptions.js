import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Save, Trash2, Printer, AlertTriangle, ChevronDown } from 'lucide-react';
import { db } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

const FREQUENCY_OPTIONS = [
  'Single Dose', 'Once per Day', 'BID (2x/day)', 'TID (3x/day)',
  'Q4H (every 4h)', 'Q6H (every 6h)', 'Q8H (every 8h)', 'Q12H (every 12h)', 'Q24H (every 24h)',
];
const DIRECTION_OPTIONS = ['Scheduled', 'As Needed (PRN)', 'As Directed'];
const DRUG_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Inhaler', 'Patch', 'Suppository', 'Other'];
const DURATION_UNITS = ['Days', 'Weeks', 'Months', 'Years'];
const RX_STATUSES = ['active', 'completed', 'cancelled', 'expired'];

const INTERACTION_PAIRS = [
  ['warfarin', 'aspirin'], ['metformin', 'alcohol'], ['ssri', 'maoi'],
  ['ciprofloxacin', 'antacid'], ['digoxin', 'amiodarone'],
];

function autoSchedule(frequency) {
  switch (frequency) {
    case 'BID (2x/day)':   return ['Morning', 'Evening'];
    case 'TID (3x/day)':   return ['Morning', 'Afternoon', 'Night'];
    case 'Q4H (every 4h)': return ['6:00', '10:00', '14:00', '18:00', '22:00', '02:00'];
    case 'Q6H (every 6h)': return ['6:00', '12:00', '18:00', '00:00'];
    case 'Q8H (every 8h)': return ['8:00', '16:00', '00:00'];
    case 'Q12H (every 12h)': return ['8:00', '20:00'];
    case 'Once per Day':   return ['Morning'];
    default: return [];
  }
}

function generatePrescriptionRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'RX-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

const EMPTY_MED = {
  name: '', strength: '', drugForm: 'Tablet', dosage: '', frequency: 'Once per Day',
  direction: 'Scheduled', duration: '', durationUnit: 'Days', specialInstructions: '',
  prn: { indication: '', maxPerDay: '', interval: '' },
  refill: { allowed: false, count: '0', expiryDate: '' },
  schedule: [],
};

const STATUS_META = {
  active:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  completed: { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
  cancelled: { bg: '#fff1f2', border: '#fecdd3', color: '#be123c' },
  expired:   { bg: '#f8fafc', border: '#cbd5e1', color: '#475569' },
};

const PHARMACY_STATUS_META = {
  sent:                { label: 'Sent',     color: '#1d4ed8' },
  accepted:            { label: 'Accepted', color: '#16a34a' },
  partially_fulfilled: { label: 'Partial',  color: '#d97706' },
  ready:               { label: 'Ready',    color: '#16a34a' },
  delivered:           { label: 'Delivered',color: '#475569' },
};

export default function DoctorPrescriptions({ profile }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    patientId: '', patientName: '',
    pharmacyId: '', pharmacyName: '',
    branchId: '', branchName: '',
    diagnosis: '', instructions: '',
    followUpDate: '', status: 'active',
    medications: [{ ...EMPTY_MED }],
  });
  const [warnings, setWarnings] = useState([]);
  const [patientAllergies, setPatientAllergies] = useState([]);
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [showPharmacyPicker, setShowPharmacyPicker] = useState(false);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Alternative approval modal
  const [altApprovalRx, setAltApprovalRx] = useState(null); // full rx object
  const [altApprovalSaving, setAltApprovalSaving] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadPrescriptions();
      loadPatients();
      loadPharmacies();
    }
  }, [profile]);

  const loadPrescriptions = () => {
    // Use onSnapshot for real-time updates (alternative suggestions)
    const q = query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', profile.id));
    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data();
        let medications = data.medications;
        if (!medications || medications.length === 0) {
          if (data.medication) {
            medications = [{ name: data.medication, dosage: data.dosage || '', frequency: data.frequency || '', duration: data.duration || '' }];
          } else { medications = []; }
        }
        return { id: d.id, ...data, medications };
      });
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      const isNameMissing = r => !r.patientName || r.patientName === 'Patient';
      const missingIds = [...new Set(list.filter(isNameMissing).map(r => r.patientId).filter(Boolean))];
      if (missingIds.length > 0) {
        await Promise.all(missingIds.map(async id => {
          try {
            const s = await getDoc(doc(db, 'auth', id));
            if (s.exists()) {
              const d = s.data();
              const name = d.name || d.displayName || d.fullName || null;
              if (name) list.forEach(r => { if (r.patientId === id && isNameMissing(r)) r.patientName = name; });
            }
          } catch (_) {}
        }));
      }
      list.forEach(r => { if (!r.patientName) r.patientName = 'Patient'; });
      setPrescriptions(list);
      setLoading(false);
    }, (err) => {
      console.error('Error loading prescriptions:', err);
      setLoading(false);
    });
    return unsub;
  };

  const loadPatients = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id)));
      const seen = new Set(); const list = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.clientId && !seen.has(data.clientId)) {
          seen.add(data.clientId);
          list.push({ id: data.clientId, name: data.clientName || '' });
        }
      }
      const enriched = await Promise.all(list.map(async p => {
        if (!p.name || p.name === 'Patient') {
          try {
            const s = await getDoc(doc(db, 'auth', p.id));
            if (s.exists()) {
              const d = s.data();
              return { ...p, name: d.name || d.displayName || p.name || 'Patient' };
            }
          } catch (_) {}
        }
        return p;
      }));
      setPatients(enriched);
    } catch (err) { console.error('Error loading patients:', err); }
  };

  const loadPharmacies = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'pharmacies'), where('status', '==', 'active')));
      setPharmacies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('Error loading pharmacies:', err); }
  };

  const loadBranches = async (pharmacyId) => {
    setLoadingBranches(true);
    setBranches([]);
    try {
      const snap = await getDocs(query(collection(db, 'pharmacyBranches'), where('pharmacyId', '==', pharmacyId), where('status', '==', 'active')));
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('Error loading branches:', err); }
    finally { setLoadingBranches(false); }
  };

  const loadPatientAllergies = async (patientId) => {
    try {
      const snap = await getDoc(doc(db, 'auth', patientId));
      if (snap.exists()) {
        const al = snap.data().allergies || '';
        setPatientAllergies(al ? al.toLowerCase().split(/[,;]/).map(s => s.trim()) : []);
      }
    } catch (_) {}
  };

  const runSafetyChecks = (meds, allergies) => {
    const w = [];
    const names = meds.map(m => (m.name || '').toLowerCase().trim()).filter(Boolean);
    const seen = new Set();
    names.forEach(n => { if (seen.has(n)) w.push(`Duplicate: "${n}" appears more than once.`); seen.add(n); });
    (allergies || patientAllergies).forEach(al => {
      if (names.some(n => n.includes(al) || al.includes(n))) w.push(`Allergy alert: Patient is allergic to "${al}".`);
    });
    INTERACTION_PAIRS.forEach(([a, b]) => {
      if (names.some(n => n.includes(a)) && names.some(n => n.includes(b)))
        w.push(`Interaction warning: ${a} + ${b} may interact.`);
    });
    setWarnings(w);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ patientId: '', patientName: '', pharmacyId: '', pharmacyName: '', branchId: '', branchName: '', diagnosis: '', instructions: '', followUpDate: '', status: 'active', medications: [{ ...EMPTY_MED }] });
    setWarnings([]); setPatientAllergies([]);
    setBranches([]);
    setShowForm(true);
  };

  const openEdit = (rx) => {
    setEditing(rx);
    setForm({
      patientId: rx.patientId || '',
      patientName: rx.patientName || '',
      pharmacyId: rx.pharmacyId || '',
      pharmacyName: rx.pharmacyName || '',
      branchId: rx.branchId || '',
      branchName: rx.branchName || '',
      diagnosis: rx.diagnosis || '',
      instructions: rx.instructions || '',
      followUpDate: rx.followUpDate || '',
      status: rx.status || 'active',
      medications: rx.medications?.length ? rx.medications.map(m => ({ ...EMPTY_MED, ...m })) : [{ ...EMPTY_MED }],
    });
    if (rx.pharmacyId) loadBranches(rx.pharmacyId);
    setWarnings([]);
    setShowForm(true);
  };

  const updateMed = (i, field, val) => {
    setForm(prev => {
      const meds = [...prev.medications];
      meds[i] = { ...meds[i], [field]: val };
      if (field === 'frequency' && !meds[i].schedule?.length) meds[i].schedule = autoSchedule(val);
      const updated = { ...prev, medications: meds };
      runSafetyChecks(updated.medications, patientAllergies);
      return updated;
    });
  };

  const updateMedNested = (i, section, field, val) => {
    setForm(prev => {
      const meds = [...prev.medications];
      meds[i] = { ...meds[i], [section]: { ...meds[i][section], [field]: val } };
      return { ...prev, medications: meds };
    });
  };

  const handleSave = async () => {
    if (!form.patientId) { alert('Please select a patient.'); return; }
    if (!form.diagnosis.trim()) { alert('Diagnosis is required.'); return; }
    if (!form.medications[0]?.name?.trim()) { alert('At least one medication name is required.'); return; }

    if (warnings.length > 0) {
      const ok = window.confirm('Safety Warnings:\n\n' + warnings.join('\n\n') + '\n\nDo you want to proceed?');
      if (!ok) return;
    }

    setSaving(true);
    try {
      const prescriptionRef = editing?.prescriptionRef || generatePrescriptionRef();
      const payload = {
        patientId: form.patientId, patientName: form.patientName,
        pharmacyId: form.pharmacyId || null,
        pharmacyName: form.pharmacyName || null,
        branchId: form.branchId || null,
        branchName: form.branchName || null,
        prescriptionRef,
        diagnosis: form.diagnosis.trim(), instructions: form.instructions.trim(),
        followUpDate: form.followUpDate, status: form.status || 'active',
        medications: form.medications.filter(m => m.name?.trim()).map(m => ({
          name: m.name.trim(), strength: m.strength?.trim() || '', drugForm: m.drugForm || 'Tablet',
          dosage: m.dosage?.trim() || '', frequency: m.frequency || 'Once per Day',
          direction: m.direction || 'Scheduled', duration: m.duration?.trim() || '',
          durationUnit: m.durationUnit || 'Days', specialInstructions: m.specialInstructions?.trim() || '',
          prn: m.direction === 'As Needed (PRN)' ? { indication: m.prn?.indication || '', maxPerDay: m.prn?.maxPerDay || '', interval: m.prn?.interval || '' } : null,
          refill: m.refill?.allowed ? { allowed: true, count: parseInt(m.refill.count) || 0, expiryDate: m.refill.expiryDate || '' } : { allowed: false },
          schedule: m.schedule || [],
          drugStatus: m.drugStatus || 'pending',
        })),
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'doctorPrescriptions', editing.id), payload);
      } else {
        await addDoc(collection(db, 'doctorPrescriptions'), {
          ...payload, doctorId: profile.id, doctorName: profile.name || '',
          date: new Date().toISOString().split('T')[0],
          pharmacyStatus: form.pharmacyId ? 'sent' : null,
          createdAt: serverTimestamp(),
        });
      }
      setShowForm(false);
      setEditing(null);
      setWarnings([]);
    } catch (err) { console.error('Error saving prescription:', err); alert('Could not save prescription.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this prescription?')) return;
    try {
      await deleteDoc(doc(db, 'doctorPrescriptions', id));
    } catch (err) { console.error('Error deleting:', err); }
  };

  const handlePrint = (rx) => {
    const meds = rx.medications?.length ? rx.medications : rx.medication ? [{ name: rx.medication, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }] : [];
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Prescription</title><style>body{font-family:Arial,sans-serif;padding:2rem;max-width:700px;margin:auto}h1{color:#1e6bb8;border-bottom:2px solid #1e6bb8;padding-bottom:0.5rem}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #ddd;padding:0.5rem;text-align:left}th{background:#f0f6fc}.footer{margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem;font-size:0.85rem;color:#666}.ref-box{background:#f0f9ff;border:2px solid #0ea5e9;border-radius:8px;padding:0.75rem 1rem;margin:1rem 0;display:flex;align-items:center;gap:1rem}.ref-label{font-size:0.75rem;color:#0369a1;font-weight:700;text-transform:uppercase}.ref-code{font-size:1.5rem;font-weight:900;color:#0c4a6e;letter-spacing:0.1em}</style></head><body><h1>Medical Prescription</h1><p><strong>Doctor:</strong> Dr. ${profile.name || 'Doctor'}</p><p><strong>Patient:</strong> ${rx.patientName || 'Patient'}</p><p><strong>Date:</strong> ${rx.date || ''}</p><p><strong>Diagnosis:</strong> ${rx.diagnosis || '—'}</p>${rx.prescriptionRef ? `<div class="ref-box"><div><div class="ref-label">Prescription Reference</div><div class="ref-code">${rx.prescriptionRef}</div></div></div>` : ''}${rx.pharmacyName ? `<p><strong>Pharmacy:</strong> ${rx.pharmacyName}${rx.branchName ? ` — ${rx.branchName}` : ''}</p>` : ''}<h3>Medications</h3><table><thead><tr><th>Medication</th><th>Strength</th><th>Dosage</th><th>Frequency</th><th>Direction</th><th>Duration</th></tr></thead><tbody>${meds.map(m => `<tr><td>${m.name || ''}</td><td>${m.strength || '—'}</td><td>${m.dosage || '—'}</td><td>${m.frequency || '—'}</td><td>${m.direction || '—'}</td><td>${m.duration ? m.duration + ' ' + (m.durationUnit || '') : '—'}</td></tr>`).join('')}</tbody></table>${rx.instructions ? `<p><strong>Instructions:</strong> ${rx.instructions}</p>` : ''}${rx.followUpDate ? `<p><strong>Follow-up:</strong> ${rx.followUpDate}</p>` : ''}<div class="footer"><p>Generated via NessaHub Medical Platform.</p></div></body></html>`);
    win.document.close();
    win.print();
  };

  // Alternative drug approval
  const approveAlternative = async (rx, medIndex) => {
    setAltApprovalSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'approved_replacement' } : m
      );
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        medications: updatedMeds,
        updatedAt: serverTimestamp(),
      });
      setAltApprovalRx(prev => prev ? { ...prev, medications: updatedMeds } : null);
    } catch (e) { alert('Failed to approve. Please try again.'); }
    finally { setAltApprovalSaving(false); }
  };

  const rejectAlternative = async (rx, medIndex) => {
    setAltApprovalSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'not_available', alternativeSuggested: null } : m
      );
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        medications: updatedMeds,
        updatedAt: serverTimestamp(),
      });
      setAltApprovalRx(prev => prev ? { ...prev, medications: updatedMeds } : null);
    } catch (e) { alert('Failed to reject. Please try again.'); }
    finally { setAltApprovalSaving(false); }
  };

  // Find prescriptions with pending alternative suggestions
  const altPendingCount = prescriptions.reduce((count, rx) => {
    return count + (rx.medications || []).filter(m => m.drugStatus === 'alternative_suggested').length;
  }, 0);

  const filtered = prescriptions.filter(rx => {
    if (statusFilter !== 'all' && (rx.status || 'active') !== statusFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (rx.patientName || '').toLowerCase().includes(q) ||
           (rx.diagnosis || '').toLowerCase().includes(q) ||
           (rx.date || '').includes(q) ||
           (rx.prescriptionRef || '').toLowerCase().includes(q) ||
           (rx.pharmacyName || '').toLowerCase().includes(q);
  });

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Prescriptions</h1>
        <p>Create and manage advanced patient prescriptions</p>
      </div>

      {/* Alt suggestion alert banner */}
      {altPendingCount > 0 && (
        <div style={{ background: '#fdf4ff', border: '1.5px solid #e9d5ff', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🔁</span>
          <div style={{ flex: 1 }}>
            <b style={{ color: '#7c3aed', fontSize: '0.9rem' }}>{altPendingCount} alternative drug suggestion{altPendingCount > 1 ? 's' : ''} awaiting your approval</b>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#6d28d9' }}>A pharmacy has suggested replacement drugs for one or more prescriptions.</p>
          </div>
          <button onClick={() => {
            const rx = prescriptions.find(r => r.medications?.some(m => m.drugStatus === 'alternative_suggested'));
            if (rx) setAltApprovalRx(rx);
          }} style={{ padding: '0.45rem 0.9rem', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
            Review Now
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="doctor-btn doctor-btn-primary" onClick={openNew}>
          <Plus size={16} /> New Prescription
        </button>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['all', 'active', 'completed', 'cancelled', 'expired'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: '0.35rem 0.85rem', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', ...(statusFilter === s ? { background: '#1e6bb8', color: '#fff', borderColor: '#1e6bb8' } : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' }) }}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── NEW / EDIT FORM ── */}
      {showForm && (
        <div className="doctor-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0 }}>{editing ? 'Edit Prescription' : 'New Prescription'}</h3>
            <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => { setShowForm(false); setEditing(null); setWarnings([]); }}>Cancel</button>
          </div>

          {/* Safety Warnings */}
          {warnings.length > 0 && (
            <div style={{ background: '#fff7ed', border: '1.5px solid #fde68a', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <AlertTriangle size={16} color="#d97706" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#d97706' }}>Safety Warnings</span>
              </div>
              {warnings.map((w, i) => <p key={i} style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: '#92400e' }}>• {w}</p>)}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            {/* Patient picker */}
            {!editing && (
              <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                <label>Patient *</label>
                <div onClick={() => { setShowPatientPicker(v => !v); setShowPharmacyPicker(false); setShowBranchPicker(false); }}
                  style={{ cursor: 'pointer', padding: '0.55rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, background: 'white', fontSize: '0.875rem', color: form.patientId ? '#0f172a' : '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{form.patientId ? form.patientName : '— Select patient —'}</span>
                  <ChevronDown size={14} color="#94a3b8" />
                </div>
                {showPatientPicker && (
                  <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', position: 'relative', zIndex: 10 }}>
                    {patients.length === 0 && <div style={{ padding: '0.75rem', fontSize: '0.82rem', color: '#94a3b8' }}>No patients found.</div>}
                    {patients.map(p => (
                      <div key={p.id} onClick={() => { setForm(prev => ({ ...prev, patientId: p.id, patientName: p.name })); setShowPatientPicker(false); loadPatientAllergies(p.id); }}
                        style={{ padding: '0.55rem 0.85rem', cursor: 'pointer', fontSize: '0.875rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', background: form.patientId === p.id ? '#eff6ff' : 'transparent' }}>
                        {p.name || 'Unknown Patient'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Status */}
            <div className="doctor-form-group" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select className="doctor-form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                {RX_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>

            {/* Diagnosis */}
            <div className="doctor-form-group" style={{ marginBottom: 0, gridColumn: editing ? '1 / -1' : 'auto' }}>
              <label>Diagnosis *</label>
              <input className="doctor-form-input" placeholder="e.g., Upper respiratory infection"
                value={form.diagnosis} onChange={e => setForm(p => ({ ...p, diagnosis: e.target.value }))} />
            </div>

            {/* Follow-up Date */}
            <div className="doctor-form-group" style={{ marginBottom: 0 }}>
              <label>Follow-up Date</label>
              <input className="doctor-form-input" type="date" value={form.followUpDate}
                onChange={e => setForm(p => ({ ...p, followUpDate: e.target.value }))} />
            </div>
          </div>

          {/* ── PHARMACY ROUTING ── */}
          <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 700, color: '#0369a1' }}>💊 Route to Pharmacy (optional)</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {/* Pharmacy picker */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 4 }}>Pharmacy</label>
                <div onClick={() => { setShowPharmacyPicker(v => !v); setShowPatientPicker(false); setShowBranchPicker(false); }}
                  style={{ cursor: 'pointer', padding: '0.5rem 0.85rem', border: '1.5px solid #bae6fd', borderRadius: 8, background: 'white', fontSize: '0.875rem', color: form.pharmacyId ? '#0f172a' : '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{form.pharmacyId ? form.pharmacyName : '— Select pharmacy —'}</span>
                  <ChevronDown size={14} color="#94a3b8" />
                </div>
                {showPharmacyPicker && (
                  <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', position: 'relative', zIndex: 20 }}>
                    <div onClick={() => { setForm(p => ({ ...p, pharmacyId: '', pharmacyName: '', branchId: '', branchName: '' })); setShowPharmacyPicker(false); setBranches([]); }}
                      style={{ padding: '0.5rem 0.85rem', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', borderBottom: '1px solid #f1f5f9', background: !form.pharmacyId ? '#f0f9ff' : 'transparent' }}>
                      — None —
                    </div>
                    {pharmacies.length === 0 && <div style={{ padding: '0.75rem', fontSize: '0.82rem', color: '#94a3b8' }}>No active pharmacies found.</div>}
                    {pharmacies.map(ph => (
                      <div key={ph.id} onClick={() => {
                        setForm(p => ({ ...p, pharmacyId: ph.id, pharmacyName: ph.pharmacyName || ph.name || '', branchId: '', branchName: '' }));
                        setShowPharmacyPicker(false);
                        loadBranches(ph.id);
                      }}
                        style={{ padding: '0.5rem 0.85rem', cursor: 'pointer', fontSize: '0.875rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', background: form.pharmacyId === ph.id ? '#eff6ff' : 'transparent' }}>
                        <div style={{ fontWeight: 600 }}>{ph.pharmacyName || ph.name}</div>
                        {ph.country && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{ph.country}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Branch picker */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 4 }}>Branch {form.pharmacyId ? '' : '(select pharmacy first)'}</label>
                <div onClick={() => { if (!form.pharmacyId) return; setShowBranchPicker(v => !v); setShowPatientPicker(false); setShowPharmacyPicker(false); }}
                  style={{ cursor: form.pharmacyId ? 'pointer' : 'not-allowed', padding: '0.5rem 0.85rem', border: '1.5px solid #bae6fd', borderRadius: 8, background: form.pharmacyId ? 'white' : '#f8fafc', fontSize: '0.875rem', color: form.branchId ? '#0f172a' : '#94a3b8', display: 'flex', justifyContent: 'space-between', opacity: form.pharmacyId ? 1 : 0.6 }}>
                  <span>{loadingBranches ? 'Loading branches…' : form.branchId ? form.branchName : '— Select branch (optional) —'}</span>
                  <ChevronDown size={14} color="#94a3b8" />
                </div>
                {showBranchPicker && form.pharmacyId && (
                  <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', position: 'relative', zIndex: 20 }}>
                    <div onClick={() => { setForm(p => ({ ...p, branchId: '', branchName: '' })); setShowBranchPicker(false); }}
                      style={{ padding: '0.5rem 0.85rem', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', borderBottom: '1px solid #f1f5f9', background: !form.branchId ? '#f0f9ff' : 'transparent' }}>
                      — None (pharmacy-level only) —
                    </div>
                    {branches.length === 0 && !loadingBranches && <div style={{ padding: '0.75rem', fontSize: '0.82rem', color: '#94a3b8' }}>No active branches for this pharmacy.</div>}
                    {branches.map(br => (
                      <div key={br.id} onClick={() => { setForm(p => ({ ...p, branchId: br.id, branchName: br.branchName || br.name || '' })); setShowBranchPicker(false); }}
                        style={{ padding: '0.5rem 0.85rem', cursor: 'pointer', fontSize: '0.875rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', background: form.branchId === br.id ? '#eff6ff' : 'transparent' }}>
                        <div style={{ fontWeight: 600 }}>{br.branchName || br.name}</div>
                        {br.address && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{br.address}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {form.pharmacyId && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#0369a1' }}>
                A unique prescription reference code will be auto-generated and shown to the patient for pickup verification.
              </p>
            )}
          </div>

          {/* ── MEDICATIONS ── */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>Medications *</label>
              <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => setForm(p => ({ ...p, medications: [...p.medications, { ...EMPTY_MED }] }))}>
                <Plus size={13} /> Add Drug
              </button>
            </div>

            {form.medications.map((med, i) => (
              <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', marginBottom: '0.75rem', border: '1.5px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Drug {i + 1}</span>
                  {form.medications.length > 1 && (
                    <button className="doctor-btn doctor-btn-sm doctor-btn-danger" onClick={() => setForm(p => ({ ...p, medications: p.medications.filter((_, idx) => idx !== i) }))}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Drug Name *</label>
                    <input className="doctor-form-input" placeholder="e.g. Amoxicillin" value={med.name}
                      onChange={e => updateMed(i, 'name', e.target.value)} />
                  </div>
                  <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Strength</label>
                    <input className="doctor-form-input" placeholder="e.g. 500mg" value={med.strength}
                      onChange={e => updateMed(i, 'strength', e.target.value)} />
                  </div>
                  <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Form</label>
                    <select className="doctor-form-select" value={med.drugForm} onChange={e => updateMed(i, 'drugForm', e.target.value)}>
                      {DRUG_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Dosage</label>
                    <input className="doctor-form-input" placeholder="e.g. 1 tablet" value={med.dosage}
                      onChange={e => updateMed(i, 'dosage', e.target.value)} />
                  </div>
                  <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Frequency</label>
                    <select className="doctor-form-select" value={med.frequency} onChange={e => updateMed(i, 'frequency', e.target.value)}>
                      {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Direction</label>
                    <select className="doctor-form-select" value={med.direction} onChange={e => updateMed(i, 'direction', e.target.value)}>
                      {DIRECTION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Duration</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input className="doctor-form-input" placeholder="e.g. 7" type="number" value={med.duration}
                        onChange={e => updateMed(i, 'duration', e.target.value)} style={{ flex: 1 }} />
                      <select className="doctor-form-select" value={med.durationUnit} onChange={e => updateMed(i, 'durationUnit', e.target.value)} style={{ flex: 1 }}>
                        {DURATION_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Refill */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a' }}>Allow Refills</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input type="checkbox" checked={med.refill?.allowed || false}
                        onChange={e => updateMedNested(i, 'refill', 'allowed', e.target.checked)} />
                      Enable refills
                    </label>
                    {med.refill?.allowed && (
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                        <input className="doctor-form-input" placeholder="# (0-5)" type="number" min="0" max="5"
                          value={med.refill?.count} onChange={e => updateMedNested(i, 'refill', 'count', Math.min(5, parseInt(e.target.value) || 0).toString())}
                          style={{ width: 70 }} />
                        <input className="doctor-form-input" type="date" placeholder="Expiry" value={med.refill?.expiryDate}
                          onChange={e => updateMedNested(i, 'refill', 'expiryDate', e.target.value)} style={{ flex: 1 }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* PRN fields */}
                {med.direction === 'As Needed (PRN)' && (
                  <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#d97706' }}>PRN Details</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                      <input className="doctor-form-input" placeholder="Indication (e.g. Pain)" value={med.prn?.indication}
                        onChange={e => updateMedNested(i, 'prn', 'indication', e.target.value)} />
                      <input className="doctor-form-input" placeholder="Max/day" type="number" value={med.prn?.maxPerDay}
                        onChange={e => updateMedNested(i, 'prn', 'maxPerDay', e.target.value)} />
                      <input className="doctor-form-input" placeholder="Min interval (e.g. 4h)" value={med.prn?.interval}
                        onChange={e => updateMedNested(i, 'prn', 'interval', e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Special instructions */}
                {(med.direction === 'As Directed' || med.direction === 'As Needed (PRN)') && (
                  <div className="doctor-form-group" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem' }}>Special Instructions</label>
                    <textarea className="doctor-form-textarea" rows={2} placeholder="Instructions for patient..."
                      value={med.specialInstructions} onChange={e => updateMed(i, 'specialInstructions', e.target.value)} />
                  </div>
                )}

                {/* Auto-schedule preview */}
                {med.schedule?.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Dosage Schedule</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {med.schedule.map((s, si) => (
                        <span key={si} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 20, padding: '0.2rem 0.6rem', fontSize: '0.72rem', fontWeight: 600 }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* General Instructions */}
          <div className="doctor-form-group">
            <label>General Instructions</label>
            <textarea className="doctor-form-textarea" rows={3} placeholder="Overall patient instructions..."
              value={form.instructions} onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="doctor-btn doctor-btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving…' : (editing ? 'Update Prescription' : 'Save Prescription')}
            </button>
            <button className="doctor-btn doctor-btn-outline" onClick={() => { setShowForm(false); setEditing(null); setWarnings([]); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="doctor-search">
        <Search size={18} color="#94a3b8" />
        <input placeholder="Search by patient, diagnosis, date, ref code, or pharmacy..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)} />
      </div>

      {/* List */}
      <div className="doctor-card">
        <h3>Prescriptions ({filtered.length})</h3>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="doctor-empty-state">
            <FileText size={40} /><h3>{searchQuery ? 'No prescriptions match your search' : 'No prescriptions yet'}</h3>
            <p>Click "New Prescription" to create one.</p>
          </div>
        ) : (
          <table className="doctor-table">
            <thead>
              <tr><th>Patient</th><th>Diagnosis</th><th>Ref / Pharmacy</th><th>Rx Status</th><th>Status</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(rx => {
                const sm = STATUS_META[rx.status] || STATUS_META.active;
                const pm = rx.pharmacyStatus ? (PHARMACY_STATUS_META[rx.pharmacyStatus] || null) : null;
                const meds = rx.medications?.length ? rx.medications : rx.medication ? [{ name: rx.medication, dosage: rx.dosage }] : [];
                const hasAlt = meds.some(m => m.drugStatus === 'alternative_suggested');
                return (
                  <tr key={rx.id}>
                    <td style={{ fontWeight: 600 }}>{rx.patientName || 'Patient'}</td>
                    <td style={{ maxWidth: 140, fontSize: '0.85rem' }}>{rx.diagnosis || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {rx.prescriptionRef && (
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0c4a6e', background: '#f0f9ff', padding: '2px 6px', borderRadius: 6, display: 'inline-block', marginBottom: 2 }}>{rx.prescriptionRef}</div>
                      )}
                      {rx.pharmacyName && <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{rx.pharmacyName}{rx.branchName ? ` › ${rx.branchName}` : ''}</div>}
                      {!rx.prescriptionRef && !rx.pharmacyName && <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td>
                      {pm ? (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: pm.color }}>{pm.label}</span>
                      ) : <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>}
                      {hasAlt && (
                        <div style={{ marginTop: 2 }}>
                          <span style={{ fontSize: '0.7rem', background: '#fdf4ff', color: '#7c3aed', border: '1px solid #e9d5ff', borderRadius: 10, padding: '1px 6px', fontWeight: 700, cursor: 'pointer' }}
                            onClick={() => setAltApprovalRx(rx)}>
                            🔁 Alt. pending
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`, padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize' }}>
                        {rx.status || 'active'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{rx.date || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => openEdit(rx)}>Edit</button>
                        <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => handlePrint(rx)} title="Print"><Printer size={12} /></button>
                        <button className="doctor-btn doctor-btn-sm doctor-btn-danger" onClick={() => handleDelete(rx.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── ALTERNATIVE DRUG APPROVAL MODAL ── */}
      {altApprovalRx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '1rem' }}
          onClick={() => setAltApprovalRx(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 800, color: '#0c4a6e' }}>Alternative Drug Review</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  {altApprovalRx.patientName} · {altApprovalRx.prescriptionRef || altApprovalRx.id}
                </p>
              </div>
              <button onClick={() => setAltApprovalRx(null)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', color: '#64748b' }}>✕ Close</button>
            </div>

            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#374151', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '0.65rem 0.875rem' }}>
              The pharmacy has suggested alternative drugs below. Review each and approve or reject the substitution.
            </p>

            {(altApprovalRx.medications || []).map((med, i) => {
              if (med.drugStatus !== 'alternative_suggested') return null;
              return (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', marginBottom: '0.75rem', border: '1.5px solid #e9d5ff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <b style={{ color: '#0f172a' }}>{med.name}</b>
                      {med.strength && <span style={{ fontSize: '0.78rem', color: '#64748b' }}> ({med.strength})</span>}
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>{med.dosage} · {med.frequency}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#dc2626', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>Not Available</span>
                  </div>

                  <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '0.65rem 0.875rem', marginBottom: '0.75rem' }}>
                    <p style={{ margin: '0 0 2px', fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Pharmacy suggests</p>
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#4c1d95' }}>{med.alternativeSuggested}</p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button disabled={altApprovalSaving} onClick={() => approveAlternative(altApprovalRx, i)}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: 8, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
                      ✅ Approve Substitution
                    </button>
                    <button disabled={altApprovalSaving} onClick={() => rejectAlternative(altApprovalRx, i)}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: 8, background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
                      ❌ Reject
                    </button>
                  </div>
                </div>
              );
            })}

            {!(altApprovalRx.medications || []).some(m => m.drugStatus === 'alternative_suggested') && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                <p>All alternative suggestions have been reviewed.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
