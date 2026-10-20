import React, { useState, useEffect, useMemo } from 'react';
import { parseCoords, attachDistance, formatDistanceKm } from '../../../utils/homeCareGeo';
import RxAdvicePanel from '../../Common/RxAdvicePanel';
import { RxInsurancePicker, RxEstimateCard, attachRxCard } from '../../Common/RxInsuranceCard';
import PrescriptionAssistant from '../../Common/PrescriptionAssistant';
import PrescriptionCodeCard from '../../Common/PrescriptionCodeCard';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Save, Trash2, Printer, AlertTriangle, ChevronDown } from 'lucide-react';
import { db } from '../../../services/firestoreShim';
import { isRxDelivered } from '../../../utils/pharmacyRxStatus';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, onSnapshot } from '../../../services/firestoreShim';
import Paged from '../../Common/Paged';

const FREQUENCY_OPTIONS = [
  'Single Dose', 'Once per Day', 'BID (2x/day)', 'TID (3x/day)',
  'Q4H (every 4h)', 'Q6H (every 6h)', 'Q8H (every 8h)', 'Q12H (every 12h)', 'Q24H (every 24h)',
];
const DIRECTION_OPTIONS = ['Scheduled', 'As Needed (PRN)', 'As Directed'];
const DRUG_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Inhaler', 'Patch', 'Suppository', 'Other'];
const RX_STATUSES = ['active', 'completed', 'cancelled', 'expired'];

const INJECTION_ROUTES = ['IV (Intravenous)', 'IM (Intramuscular)', 'SC (Subcutaneous)', 'ID (Intradermal)'];
const SUPPOSITORY_ROUTES = ['Rectal', 'Vaginal'];
const DROP_SITES = ['Left Eye', 'Right Eye', 'Both Eyes', 'Left Ear', 'Right Ear', 'Both Ears', 'Nose'];
const PATCH_INTERVALS = ['Every 24 Hours', 'Every 48 Hours', 'Every 72 Hours', 'Weekly (7 Days)'];

const DURATION_OPTIONS = [
  { label: '1 Day',       group: 'Days' },
  { label: '1–2 Days',    group: 'Days' },
  { label: '2–3 Days',    group: 'Days' },
  { label: '3–4 Days',    group: 'Days' },
  { label: '4–5 Days',    group: 'Days' },
  { label: '5–6 Days',    group: 'Days' },
  { label: '6–7 Days',    group: 'Days' },
  { label: '1 Week',      group: 'Weeks' },
  { label: '1–2 Weeks',   group: 'Weeks' },
  { label: '2–3 Weeks',   group: 'Weeks' },
  { label: '3–4 Weeks',   group: 'Weeks' },
  { label: '1 Month',     group: 'Months' },
  { label: '1–2 Months',  group: 'Months' },
  { label: '2–3 Months',  group: 'Months' },
  { label: '3–4 Months',  group: 'Months' },
  { label: '4–6 Months',  group: 'Months' },
  { label: '6–9 Months',  group: 'Months' },
  { label: '9–12 Months', group: 'Months' },
  { label: '1 Year',      group: 'Years' },
  { label: '1–2 Years',   group: 'Years' },
  { label: '2–3 Years',   group: 'Years' },
  { label: '3+ Years',    group: 'Years' },
];

const DURATION_GROUPS = DURATION_OPTIONS.reduce((acc, opt) => {
  (acc[opt.group] = acc[opt.group] || []).push(opt.label);
  return acc;
}, {});

function getDosagePlaceholder(drugForm) {
  switch (drugForm) {
    case 'Syrup':       return 'Volume (e.g. 5ml, 10ml, 2 tsp)';
    case 'Injection':   return 'Dose (e.g. 1ml, 0.5ml, 2ml)';
    case 'Cream':       return 'Amount (e.g. thin layer, pea-sized)';
    case 'Drops':       return 'Number of drops (e.g. 2 drops)';
    case 'Inhaler':     return 'Puffs (e.g. 1 puff, 2 puffs)';
    case 'Patch':       return 'Patch count (e.g. 1 patch)';
    case 'Suppository': return 'Dose (e.g. 1 suppository)';
    case 'Capsule':     return 'Dosage (e.g. 1 capsule)';
    default:            return 'Dosage (e.g. 1 tablet)';
  }
}

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
  direction: 'Scheduled', duration: '', specialInstructions: '',
  // How much to supply (e.g. 30 tablets). Lets pharmacies record partial dispensing.
  quantity: '', quantityUnit: '',
  prn: { indication: '', maxPerDay: '', interval: '' },
  refill: { allowed: false, count: '0', expiryDate: '' },
  schedule: [],
  // Form-specific extras
  route: '', injectionSite: '', applicationSite: '', dropSite: '',
  volumeUnit: 'ml', shakeWell: false,
  spacerRequired: false, rinseAfter: false,
  changeInterval: '', rotationRequired: false,
};

// Shared styling for the per-drug-form detail blocks
const formSpecificBox = {
  background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 8,
  padding: '0.75rem', marginTop: '0.5rem', marginBottom: '0.5rem',
};
const formSpecificTitle = { margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#0369a1' };
const toggleLabel = { display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#0f172a' };

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
  const location = useLocation();
  const navigate = useNavigate();
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [branchDirectory, setBranchDirectory] = useState([]);
  // The chosen patient's saved pharmacies and location: the branch list shows
  // only their pharmacies (nearest first) unless the prescriber asks for all.
  const [patientPh, setPatientPh] = useState({ id: null, list: [], anchor: null });
  const [showAllBranches, setShowAllBranches] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  // Set when this form is approving a patient's prescription request.
  const [requestId, setRequestId] = useState(null);

  const [form, setForm] = useState({
    patientId: '', patientName: '',
    pharmacyId: '', pharmacyName: '',
    branchId: '', branchName: '',
    openToAll: false,
    diagnosis: '', instructions: '',
    followUpDate: '', status: 'active',
    medications: [{ ...EMPTY_MED }],
  });
  const [warnings, setWarnings] = useState([]);
  // Insurance card chosen for this prescription (undefined = not loaded, '' = self-pay).
  const [rxCardId, setRxCardId] = useState(undefined);
  const [rxEstimate, setRxEstimate] = useState(null);
  const [patientAllergies, setPatientAllergies] = useState([]);
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [showBranchDirectoryPicker, setShowBranchDirectoryPicker] = useState(false);
  const [loadingBranchDirectory, setLoadingBranchDirectory] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Alternative approval modal
  const [altApprovalRx, setAltApprovalRx] = useState(null); // full rx object
  const [altApprovalSaving, setAltApprovalSaving] = useState(false);
  const [viewingRx, setViewingRx] = useState(null);
  const [showRxAllDetails, setShowRxAllDetails] = useState(false);
  const [reassignRx, setReassignRx] = useState(null);
  const [reassignBranchId, setReassignBranchId] = useState('');
  const [reassignSaving, setReassignSaving] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadPrescriptions();
      loadPatients();
      loadBranchDirectory();
    }
  }, [profile]);

  useEffect(() => {
    if (!profile?.id) return;
    const st = location.state;
    if (!st?.openRxForm || !st?.presetPatientId) return;

    loadPatientAllergies(st.presetPatientId);
    loadBranchDirectory();
    setEditing(null);
    setForm({
      patientId: st.presetPatientId,
      patientName: st.presetPatientName || '',
      pharmacyId: '',
      pharmacyName: '',
      branchId: '',
      branchName: '',
      openToAll: false,
      diagnosis: '',
      instructions: '',
      followUpDate: '',
      status: 'active',
      // From an approved prescription request: the medicines the patient named.
      // Dose, frequency and quantity are left for the prescriber to fill in.
      medications: st.presetMedications?.length ? st.presetMedications.map(m => ({ ...EMPTY_MED, ...m })) : [{ ...EMPTY_MED }],
    });
    setRequestId(st.requestId || null);
    setWarnings([]);
    setShowForm(true);

    navigate('/dashboard/prescriptions', { replace: true, state: {} });
  }, [profile?.id, location.state?.openRxForm, location.state?.presetPatientId]);

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

  useEffect(() => {
    const pid = form?.patientId;
    setShowAllBranches(false);
    if (!pid) { setPatientPh({ id: null, list: [], anchor: null }); return undefined; }
    let live = true;
    getDoc(doc(db, 'patientProfiles', pid)).then((snap) => {
      if (!live) return;
      const pd = snap?.exists?.() ? snap.data() : {};
      setPatientPh({ id: pid, list: Array.isArray(pd.pharmacies) ? pd.pharmacies : [], anchor: parseCoords(pd) });
    }).catch(() => { if (live) setPatientPh({ id: pid, list: [], anchor: null }); });
    return () => { live = false; };
  }, [form?.patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const branchOptions = useMemo(() => {
    const saved = patientPh.list || [];
    let rows = branchDirectory;
    if (form?.patientId && !showAllBranches) {
      rows = rows.filter(r => saved.some(sv => (sv.branchId && sv.branchId === r.branchId)
        || (!sv.branchId && sv.pharmacyId && sv.pharmacyId === r.pharmacyId)));
    }
    return patientPh.anchor ? attachDistance(rows, patientPh.anchor) : rows;
  }, [branchDirectory, patientPh, showAllBranches, form?.patientId]);
  const patientFirstName = (form?.patientName || 'This patient').split(' ')[0];

  const loadBranchDirectory = async () => {
    setLoadingBranchDirectory(true);
    try {
      const phSnap = await getDocs(query(collection(db, 'pharmacies'), where('status', '==', 'active')));
      const rows = [];
      for (const phDoc of phSnap.docs) {
        const ph = { id: phDoc.id, ...phDoc.data() };
        const parentName = ph.pharmacyName || ph.name || '';
        const brSnap = await getDocs(query(
          collection(db, 'pharmacyBranches'),
          where('pharmacyId', '==', ph.id),
          where('status', '==', 'active'),
        ));
        brSnap.docs.forEach(d => {
          const br = d.data();
          const branchName = br.branchName || br.name || d.id;
          rows.push({
            branchId: d.id,
            branchName,
            pharmacyId: ph.id,
            pharmacyName: parentName,
            addressLine: [br.address, br.city].filter(Boolean).join(', '),
            latitude: br.latitude ?? ph.latitude ?? null,
            longitude: br.longitude ?? ph.longitude ?? null,
          });
        });
      }
      rows.sort((a, b) => a.branchName.localeCompare(b.branchName));
      setBranchDirectory(rows);
    } catch (err) { console.error('Error loading branch directory:', err); }
    finally { setLoadingBranchDirectory(false); }
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
    setRequestId(null);
    setForm({ patientId: '', patientName: '', pharmacyId: '', pharmacyName: '', branchId: '', branchName: '', openToAll: false, diagnosis: '', instructions: '', followUpDate: '', status: 'active', medications: [{ ...EMPTY_MED }] });
    setWarnings([]); setPatientAllergies([]);
    setShowForm(true);
  };

  const openEdit = (rx) => {
    // A delivered prescription is a closed record — it is never edited afterwards.
    if (isRxDelivered(rx)) {
      alert('This prescription has been delivered by the pharmacy and can no longer be edited.');
      return;
    }
    setEditing(rx);
    setForm({
      patientId: rx.patientId || '',
      patientName: rx.patientName || '',
      pharmacyId: rx.pharmacyId || '',
      pharmacyName: rx.pharmacyName || '',
      branchId: rx.branchId || '',
      branchName: rx.branchName || '',
      openToAll: !!rx.openToAll,
      diagnosis: rx.diagnosis || '',
      instructions: rx.instructions || '',
      followUpDate: rx.followUpDate || '',
      status: rx.status || 'active',
      medications: rx.medications?.length ? rx.medications.map(m => ({ ...EMPTY_MED, ...m })) : [{ ...EMPTY_MED }],
    });
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

  const handleSave = async (ack) => {
    if (!form.patientId) { alert('Please select a patient.'); return; }
    if (!form.diagnosis.trim()) { alert('Diagnosis is required.'); return; }
    if (!form.medications[0]?.name?.trim()) { alert('At least one medication name is required.'); return; }
    if (!form.openToAll && form.pharmacyId && !form.branchId) { alert('Select a pharmacy branch before routing this prescription.'); return; }

    if (warnings.length > 0) {
      const ok = window.confirm('Safety Warnings:\n\n' + warnings.join('\n\n') + '\n\nDo you want to proceed?');
      if (!ok) return;
    }

    setSaving(true);
    try {
      const prescriptionRef = editing?.prescriptionRef || generatePrescriptionRef();
      const payload = {
        patientId: form.patientId, patientName: form.patientName,
        // Open to all pharmacies: no branch until one takes it.
        openToAll: !!form.openToAll,
        pharmacyId: form.openToAll ? null : (form.pharmacyId || null),
        pharmacyName: form.openToAll ? null : (form.pharmacyName || null),
        branchId: form.openToAll ? null : (form.branchId || null),
        branchName: form.openToAll ? null : (form.branchName || null),
        prescriptionRef,
        diagnosis: form.diagnosis.trim(), instructions: form.instructions.trim(),
        followUpDate: form.followUpDate, status: form.status || 'active',
        medications: form.medications.filter(m => m.name?.trim()).map(m => ({
          name: m.name.trim(), strength: m.strength?.trim() || '', drugForm: m.drugForm || 'Tablet',
          dosage: m.dosage?.trim() || '', frequency: m.frequency || 'Once per Day',
          direction: m.direction || 'Scheduled', duration: m.duration?.trim() || '',
          specialInstructions: m.specialInstructions?.trim() || '',
          prn: m.direction === 'As Needed (PRN)' ? { indication: m.prn?.indication || '', maxPerDay: m.prn?.maxPerDay || '', interval: m.prn?.interval || '' } : null,
          refill: m.refill?.allowed ? { allowed: true, count: parseInt(m.refill.count) || 0, expiryDate: m.refill.expiryDate || '' } : { allowed: false },
          schedule: m.schedule || [],
          quantity: Number(m.quantity) > 0 ? Number(m.quantity) : null,
          quantityUnit: m.quantityUnit?.trim() || '',
          drugStatus: m.drugStatus || 'pending',
          ...(m.drugForm === 'Syrup' && { volumeUnit: m.volumeUnit || 'ml', shakeWell: m.shakeWell || false }),
          ...(m.drugForm === 'Injection' && { route: m.route || '', injectionSite: m.injectionSite?.trim() || '' }),
          ...(m.drugForm === 'Cream' && { applicationSite: m.applicationSite?.trim() || '' }),
          ...(m.drugForm === 'Drops' && { dropSite: m.dropSite || '' }),
          ...(m.drugForm === 'Inhaler' && { spacerRequired: m.spacerRequired || false, rinseAfter: m.rinseAfter || false }),
          ...(m.drugForm === 'Patch' && { applicationSite: m.applicationSite?.trim() || '', changeInterval: m.changeInterval || '', rotationRequired: m.rotationRequired || false }),
          ...(m.drugForm === 'Suppository' && { route: m.route || '' }),
        })),
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'doctorPrescriptions', editing.id), payload);
      } else {
        const newRef = await addDoc(collection(db, 'doctorPrescriptions'), {
          ...payload, doctorId: profile.id, doctorName: profile.name || '',
          date: new Date().toISOString().split('T')[0],
          pharmacyStatus: form.openToAll ? 'open' : (form.pharmacyId ? 'sent' : null),
          createdAt: serverTimestamp(),
          // Approving a request: the server links it and enforces the formulary check.
          ...(requestId ? { requestId, safetyAcknowledged: ack === true } : {}),
        });
        // Insured e-prescription: attach the card; the patient is sent the estimate.
        if (rxCardId && newRef?.id) attachRxCard(newRef.id, rxCardId).then(est => est && setRxEstimate(est));
        // Write timeline event
        addDoc(collection(db, 'patientTimeline'), {
          patientId: form.patientId,
          type: 'PRESCRIPTION',
          title: `Prescription: ${payload.medications?.[0]?.name || 'Medication'}`,
          status: 'PENDING',
          relatedId: newRef.id,
          actor: { role: 'DOCTOR', name: profile.name || 'Doctor' },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      setShowForm(false);
      setEditing(null);
      setWarnings([]);
      setRxCardId(undefined);
      if (requestId && !editing) {
        setRequestId(null);
        alert('Request approved. The prescription has been issued and the patient notified.');
        navigate('/dashboard/prescription-requests');
      }
    } catch (err) {
      // The formulary found something the prescriber must acknowledge first.
      if (requestId && String(err?.message || '').startsWith('Safety check:')) {
        if (window.confirm(`${err.message}\n\nIssue the prescription anyway?`)) { setSaving(false); return handleSave(true); }
      } else {
        console.error('Error saving prescription:', err);
        alert(err?.message || 'Could not save prescription.');
      }
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const target = prescriptions.find(r => r.id === id);
    if (isRxDelivered(target)) {
      alert('This prescription has been delivered by the pharmacy and can no longer be deleted.');
      return;
    }
    if (!window.confirm('Delete this prescription?')) return;
    try {
      await deleteDoc(doc(db, 'doctorPrescriptions', id));
    } catch (err) { console.error('Error deleting:', err); }
  };

  const handlePrint = (rx) => {
    const meds = rx.medications?.length ? rx.medications : rx.medication ? [{ name: rx.medication, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }] : [];
    // Every value is escaped: names, diagnoses and medicines come from users.
    const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const win = window.open('', '_blank');
    if (!win) return;
    win.opener = null;   // the print view never needs this tab's session
    win.document.write(`<html><head><title>Prescription</title><style>body{font-family:Arial,sans-serif;padding:2rem;max-width:700px;margin:auto}h1{color:#1e6bb8;border-bottom:2px solid #1e6bb8;padding-bottom:0.5rem}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #ddd;padding:0.5rem;text-align:left}th{background:#f0f6fc}.footer{margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem;font-size:0.85rem;color:#666}.ref-box{background:#f0f9ff;border:2px solid #0ea5e9;border-radius:8px;padding:0.75rem 1rem;margin:1rem 0;display:flex;align-items:center;gap:1rem}.ref-label{font-size:0.75rem;color:#0369a1;font-weight:700;text-transform:uppercase}.ref-code{font-size:1.5rem;font-weight:900;color:#0c4a6e;letter-spacing:0.1em}</style></head><body><h1>Medical Prescription</h1><p><strong>Doctor:</strong> Dr. ${e(profile.name || 'Doctor')}</p><p><strong>Patient:</strong> ${e(rx.patientName || 'Patient')}</p><p><strong>Date:</strong> ${e(rx.date || '')}</p><p><strong>Diagnosis:</strong> ${e(rx.diagnosis || '—')}</p>${rx.prescriptionRef ? `<div class="ref-box"><div><div class="ref-label">Prescription Reference</div><div class="ref-code">${e(rx.prescriptionRef)}</div></div></div>` : ''}${rx.branchName ? `<p><strong>Branch:</strong> ${e(rx.branchName)}</p>` : ''}<h3>Medications</h3><table><thead><tr><th>Medication</th><th>Strength</th><th>Dosage</th><th>Frequency</th><th>Direction</th><th>Duration</th></tr></thead><tbody>${meds.map(m => `<tr><td>${e(m.name || '')}</td><td>${e(m.strength || '—')}</td><td>${e(m.dosage || '—')}</td><td>${e(m.frequency || '—')}</td><td>${e(m.direction || '—')}</td><td>${e(m.duration ? m.duration + ' ' + (m.durationUnit || '') : '—')}</td></tr>`).join('')}</tbody></table>${rx.instructions ? `<p><strong>Instructions:</strong> ${e(rx.instructions)}</p>` : ''}${rx.followUpDate ? `<p><strong>Follow-up:</strong> ${e(rx.followUpDate)}</p>` : ''}<div class="footer"><p>Generated via NessaHub Medical Platform.</p></div></body></html>`);
    win.document.close();
    win.print();
  };

  // Alternative drug approval
  const approveAlternative = async (rx, medIndex) => {
    setAltApprovalSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'approved_replacement', approvedByDoctorName: profile?.name || 'Doctor' } : m
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

  const approvePharmacyNote = async (rx, medIndex, noteIndex) => {
    try {
      const updatedMeds = (rx.medications || []).map((m, i) => {
        if (i !== medIndex) return m;
        const notes = Array.isArray(m.pharmacyNotes) ? [...m.pharmacyNotes] : [];
        if (!notes[noteIndex]) return m;
        notes[noteIndex] = {
          ...notes[noteIndex],
          approvalStatus: 'approved',
          approvedByDoctorName: profile?.name || 'Doctor',
          approvedAt: new Date().toISOString(),
        };
        return { ...m, pharmacyNotes: notes };
      });
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), { medications: updatedMeds, updatedAt: serverTimestamp() });
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? { ...r, medications: updatedMeds } : r));
      setViewingRx(prev => prev && prev.id === rx.id ? { ...prev, medications: updatedMeds } : prev);
    } catch {
      alert('Could not approve note.');
    }
  };

  const rejectPharmacyNote = async (rx, medIndex, noteIndex) => {
    try {
      const updatedMeds = (rx.medications || []).map((m, i) => {
        if (i !== medIndex) return m;
        const notes = Array.isArray(m.pharmacyNotes) ? [...m.pharmacyNotes] : [];
        if (!notes[noteIndex]) return m;
        notes[noteIndex] = {
          ...notes[noteIndex],
          approvalStatus: 'rejected',
          approvedByDoctorName: profile?.name || 'Doctor',
          approvedAt: new Date().toISOString(),
        };
        return { ...m, pharmacyNotes: notes };
      });
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), { medications: updatedMeds, updatedAt: serverTimestamp() });
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? { ...r, medications: updatedMeds } : r));
      setViewingRx(prev => prev && prev.id === rx.id ? { ...prev, medications: updatedMeds } : prev);
    } catch {
      alert('Could not reject note.');
    }
  };

  const reassignUnavailableDrugs = async () => {
    if (!reassignRx || !reassignBranchId) return;
    const target = branchDirectory.find(b => b.branchId === reassignBranchId && (!reassignRx.pharmacyId || b.pharmacyId === reassignRx.pharmacyId));
    if (!target) return;
    const hasUnavailable = (reassignRx.medications || []).some(m => m.drugStatus === 'not_available');
    if (!hasUnavailable) {
      alert('No unavailable drugs found on this prescription.');
      return;
    }
    setReassignSaving(true);
    try {
      const updatedMeds = (reassignRx.medications || []).map(m =>
        m.drugStatus === 'not_available'
          ? {
              ...m,
              drugStatus: 'transferred',
              transferFromBranchId: null,
              transferFromBranchName: `Dr. ${profile?.name || reassignRx.doctorName || 'Doctor'}`,
              transferBranchId: target.branchId,
              transferBranchName: target.branchName || 'Branch',
              transferBranchAddress: target.address || '',
            }
          : m
      );
      await updateDoc(doc(db, 'doctorPrescriptions', reassignRx.id), {
        medications: updatedMeds,
        updatedAt: serverTimestamp(),
      });
      setPrescriptions(prev => prev.map(r => r.id === reassignRx.id ? { ...r, medications: updatedMeds } : r));
      setReassignRx(null);
      setReassignBranchId('');
    } catch (e) {
      alert('Could not reassign unavailable drugs. Please try again.');
    } finally {
      setReassignSaving(false);
    }
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
           (rx.branchName || '').toLowerCase().includes(q);
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
      <RxEstimateCard estimate={rxEstimate} onClose={() => setRxEstimate(null)} />
      {showForm && (
        <div className="doctor-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0 }}>{editing ? 'Edit Prescription' : 'New Prescription'}</h3>
            <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => { setShowForm(false); setEditing(null); setWarnings([]); }}>Cancel</button>
          </div>

          {/* Formulary-backed drafting and checks: interactions with the patient's
              current medicines, duplicates and recorded allergies. Added
              orders land in this form for the doctor to edit and save. */}
          <PrescriptionAssistant
            patientId={form.patientId}
            medications={form.medications}
            allergies={patientAllergies}
            onAddOrders={(orders, patientText) => setForm((prev) => ({
              ...prev,
              medications: [
                ...prev.medications.filter((m) => m.name && m.name.trim()),
                ...orders.map((o) => ({ ...EMPTY_MED, ...o, schedule: o.frequency ? autoSchedule(o.frequency) : [] })),
              ],
              instructions: prev.instructions || patientText || '',
            }))}
          />

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
                <div onClick={() => { setShowPatientPicker(v => !v); setShowBranchDirectoryPicker(false); }}
                  style={{ cursor: 'pointer', padding: '0.55rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, background: 'white', fontSize: '0.875rem', color: form.patientId ? '#0f172a' : '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{form.patientId ? form.patientName : '— Select patient —'}</span>
                  <ChevronDown size={14} color="#94a3b8" />
                </div>
                {showPatientPicker && (
                  <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', position: 'relative', zIndex: 10 }}>
                    {patients.length === 0 && <div style={{ padding: '0.75rem', fontSize: '0.82rem', color: '#94a3b8' }}>No patients found.</div>}
                    <Paged items={patients}>{(patients) => patients.map(p => (
                      <div key={p.id} onClick={() => { setForm(prev => ({ ...prev, patientId: p.id, patientName: p.name })); setShowPatientPicker(false); loadPatientAllergies(p.id); }}
                        style={{ padding: '0.55rem 0.85rem', cursor: 'pointer', fontSize: '0.875rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', background: form.patientId === p.id ? '#eff6ff' : 'transparent' }}>
                        {p.name || 'Unknown Patient'}
                      </div>
                    ))}</Paged>
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

          {/* ── E-PHARMACY BRANCH (labels branch-only; parent id stored for routing) ── */}
          <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 700, color: '#0369a1' }}>💊 E-Pharmacy</p>
            {/* Specific pharmacy (default) or open to every onboarded NessaHub pharmacy.
                Locked once a pharmacy has taken an open prescription. */}
            {(() => {
              const locked = !!editing?.claimedAt;
              const opt = (value, label) => (
                <button type="button" disabled={locked}
                  onClick={() => setForm(p => ({ ...p, openToAll: value, ...(value ? { pharmacyId: '', pharmacyName: '', branchId: '', branchName: '' } : {}) }))}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: 8, cursor: locked ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.8rem',
                    border: form.openToAll === value ? '2px solid #0369a1' : '1.5px solid #bae6fd',
                    background: form.openToAll === value ? '#e0f2fe' : '#fff', color: form.openToAll === value ? '#0c4a6e' : '#64748b' }}>
                  {label}
                </button>
              );
              return (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {opt(false, 'Specific pharmacy')}
                    {opt(true, 'Open to all NessaHub pharmacies')}
                  </div>
                  {locked && (
                    <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#92400e' }}>
                      Taken by {editing.branchName || editing.pharmacyName || 'a pharmacy'} — this can no longer be changed.
                    </p>
                  )}
                </>
              );
            })()}
            {!form.openToAll && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 4 }}>Branch</label>
              <div onClick={() => { if (!loadingBranchDirectory) { setShowBranchDirectoryPicker(v => !v); setShowPatientPicker(false); } }}
                style={{ cursor: loadingBranchDirectory ? 'wait' : 'pointer', padding: '0.5rem 0.85rem', border: '1.5px solid #bae6fd', borderRadius: 8, background: 'white', fontSize: '0.875rem', color: form.branchId ? '#0f172a' : '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                <span>{loadingBranchDirectory ? 'Loading branches…' : form.branchId ? form.branchName : '— Select branch —'}</span>
                <ChevronDown size={14} color="#94a3b8" />
              </div>
              {showBranchDirectoryPicker && (
                <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', position: 'relative', zIndex: 20 }}>
                  <div onClick={() => { setForm(p => ({ ...p, pharmacyId: '', pharmacyName: '', branchId: '', branchName: '' })); setShowBranchDirectoryPicker(false); }}
                    style={{ padding: '0.5rem 0.85rem', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', borderBottom: '1px solid #f1f5f9', background: !form.branchId ? '#f0f9ff' : 'transparent' }}>
                    — None —
                  </div>
                  {form.patientId ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.45rem 0.85rem', background: '#f0f9ff', fontSize: '0.78rem', color: '#0c4a6e' }}>
                      <span>{showAllBranches ? 'Showing all pharmacies' : `Showing ${patientFirstName}'s pharmacies`}{patientPh.anchor ? ' · nearest first' : ''}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setShowAllBranches(v => !v); }}
                        style={{ border: 0, background: 'none', color: '#1d4ed8', fontWeight: 800, cursor: 'pointer', fontSize: '0.78rem' }}>
                        {showAllBranches ? `Only ${patientFirstName}'s` : 'Show all'}
                      </button>
                    </div>
                  ) : null}
                  {branchOptions.length === 0 && !loadingBranchDirectory && (
                    <div style={{ padding: '0.75rem', fontSize: '0.82rem', color: '#64748b' }}>
                      {form.patientId && !showAllBranches
                        ? `${patientFirstName} has not saved a pharmacy yet. Choose "Open to all pharmacies", or Show all.`
                        : 'No active branches found.'}
                    </div>
                  )}
                  <Paged items={branchOptions}>{(branchOptions) => branchOptions.map(row => (
                    <div key={`${row.pharmacyId}-${row.branchId}`} onClick={() => {
                      setForm(p => ({
                        ...p,
                        pharmacyId: row.pharmacyId,
                        pharmacyName: row.pharmacyName,
                        branchId: row.branchId,
                        branchName: row.branchName,
                      }));
                      setShowBranchDirectoryPicker(false);
                    }}
                      style={{ padding: '0.5rem 0.85rem', cursor: 'pointer', fontSize: '0.875rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', background: form.branchId === row.branchId ? '#eff6ff' : 'transparent' }}>
                      <div style={{ fontWeight: 600 }}>{row.branchName}</div>
                      {(row.addressLine || row.distanceKm != null) && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{[row.distanceKm != null ? formatDistanceKm(row.distanceKm) : null, row.addressLine].filter(Boolean).join(' · ')}</div>}
                    </div>
                  ))}</Paged>
                </div>
              )}
            </div>
            )}
            {form.openToAll && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#0369a1' }}>
                Every approved NessaHub pharmacy will see this prescription. The first one to take it prepares it; if it does not confirm in time, it is offered to the others again.
              </p>
            )}
            {!form.openToAll && form.pharmacyId && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#0369a1' }}>
                A unique prescription reference code will be auto-generated and shown to the patient for pickup verification.
              </p>
            )}
          </div>

          {/* Insurance cover, cheaper same-ingredient options and diagnosis fit. */}
          {!editing && <RxInsurancePicker patientId={form.patientId} value={rxCardId} onChange={setRxCardId} />}
          <RxAdvicePanel patientId={form.patientId} patientName={form.patientName} medications={form.medications} diagnosis={form.diagnosis}
            onSwitch={(i, name, strength) => i >= 0 && setForm(p => ({ ...p, medications: p.medications.map((m, j) => (j === i ? { ...m, name, strength: strength || m.strength } : m)) }))} />
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
                    <input className="doctor-form-input" placeholder={getDosagePlaceholder(med.drugForm)} value={med.dosage}
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
                    <select className="doctor-form-select" value={med.duration || ''} onChange={e => updateMed(i, 'duration', e.target.value)}>
                      <option value="">Select Duration</option>
                      {/* Keep a legacy value (e.g. "7" + unit) selectable so editing an old Rx doesn't silently clear it */}
                      {med.duration && !DURATION_OPTIONS.some(o => o.label === med.duration) && (
                        <option value={med.duration}>{med.duration}{med.durationUnit ? ` ${med.durationUnit}` : ''}</option>
                      )}
                      {Object.entries(DURATION_GROUPS).map(([group, labels]) => (
                        <optgroup key={group} label={group}>
                          {labels.map(l => <option key={l} value={l}>{l}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <label style={{ fontSize: '0.75rem', marginTop: 6, display: 'block' }}>Quantity to supply</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="doctor-form-input" type="number" min="0" placeholder="e.g. 30" value={med.quantity || ''}
                        onChange={e => updateMed(i, 'quantity', e.target.value)} />
                      <input className="doctor-form-input" placeholder="tablets" value={med.quantityUnit || ''}
                        onChange={e => updateMed(i, 'quantityUnit', e.target.value)} />
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

                {/* ── FORM-SPECIFIC FIELDS (mirrors the mobile Rx form) ── */}
                {med.drugForm === 'Syrup' && (
                  <div style={formSpecificBox}>
                    <p style={formSpecificTitle}>Syrup Details</p>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: '0.35rem' }}>Volume Unit</label>
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
                      {['ml', 'tsp', 'tbsp'].map(unit => (
                        <button key={unit} type="button" onClick={() => updateMed(i, 'volumeUnit', unit)}
                          style={{
                            padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            border: `1.5px solid ${med.volumeUnit === unit ? '#1e6bb8' : '#e2e8f0'}`,
                            background: med.volumeUnit === unit ? '#eff6ff' : '#fff',
                            color: med.volumeUnit === unit ? '#1d4ed8' : '#64748b',
                          }}>{unit}</button>
                      ))}
                    </div>
                    <label style={toggleLabel}>
                      <input type="checkbox" checked={med.shakeWell || false} onChange={e => updateMed(i, 'shakeWell', e.target.checked)} />
                      Shake well before use
                    </label>
                  </div>
                )}

                {med.drugForm === 'Injection' && (
                  <div style={formSpecificBox}>
                    <p style={formSpecificTitle}>Injection Details</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Route of Administration</label>
                        <select className="doctor-form-select" value={med.route || ''} onChange={e => updateMed(i, 'route', e.target.value)}>
                          <option value="">Select Route</option>
                          {INJECTION_ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Injection Site</label>
                        <input className="doctor-form-input" placeholder="e.g. Left arm, Abdomen, Thigh"
                          value={med.injectionSite || ''} onChange={e => updateMed(i, 'injectionSite', e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {med.drugForm === 'Cream' && (
                  <div style={formSpecificBox}>
                    <p style={formSpecificTitle}>Cream Details</p>
                    <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Application Site</label>
                      <input className="doctor-form-input" placeholder="e.g. Affected area, Right forearm, Scalp"
                        value={med.applicationSite || ''} onChange={e => updateMed(i, 'applicationSite', e.target.value)} />
                    </div>
                  </div>
                )}

                {med.drugForm === 'Drops' && (
                  <div style={formSpecificBox}>
                    <p style={formSpecificTitle}>Drops Details</p>
                    <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Administration Site</label>
                      <select className="doctor-form-select" value={med.dropSite || ''} onChange={e => updateMed(i, 'dropSite', e.target.value)}>
                        <option value="">Select Site</option>
                        {DROP_SITES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {med.drugForm === 'Inhaler' && (
                  <div style={formSpecificBox}>
                    <p style={formSpecificTitle}>Inhaler Details</p>
                    <label style={{ ...toggleLabel, marginBottom: '0.4rem' }}>
                      <input type="checkbox" checked={med.spacerRequired || false} onChange={e => updateMed(i, 'spacerRequired', e.target.checked)} />
                      Spacer device required
                    </label>
                    <label style={toggleLabel}>
                      <input type="checkbox" checked={med.rinseAfter || false} onChange={e => updateMed(i, 'rinseAfter', e.target.checked)} />
                      Rinse mouth after use
                    </label>
                  </div>
                )}

                {med.drugForm === 'Patch' && (
                  <div style={formSpecificBox}>
                    <p style={formSpecificTitle}>Patch Details</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.6rem' }}>
                      <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Application Site</label>
                        <input className="doctor-form-input" placeholder="e.g. Upper arm, Chest, Lower back"
                          value={med.applicationSite || ''} onChange={e => updateMed(i, 'applicationSite', e.target.value)} />
                      </div>
                      <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Change Interval</label>
                        <select className="doctor-form-select" value={med.changeInterval || ''} onChange={e => updateMed(i, 'changeInterval', e.target.value)}>
                          <option value="">Select Change Interval</option>
                          {PATCH_INTERVALS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>
                    <label style={toggleLabel}>
                      <input type="checkbox" checked={med.rotationRequired || false} onChange={e => updateMed(i, 'rotationRequired', e.target.checked)} />
                      Rotate application site
                    </label>
                  </div>
                )}

                {med.drugForm === 'Suppository' && (
                  <div style={formSpecificBox}>
                    <p style={formSpecificTitle}>Suppository Details</p>
                    <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Route</label>
                      <select className="doctor-form-select" value={med.route || ''} onChange={e => updateMed(i, 'route', e.target.value)}>
                        <option value="">Select Route</option>
                        {SUPPOSITORY_ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
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
        <input placeholder="Search by patient, diagnosis, date, ref code, or branch..." value={searchQuery}
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
              <tr><th>Patient</th><th>Diagnosis</th><th>Ref / Branch</th><th>Rx Status</th><th>Status</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              <Paged items={filtered} table>{(filtered) => filtered.map(rx => {
                const sm = STATUS_META[rx.status] || STATUS_META.active;
                const pm = rx.pharmacyStatus ? (PHARMACY_STATUS_META[rx.pharmacyStatus] || null) : null;
                const meds = rx.medications?.length ? rx.medications : rx.medication ? [{ name: rx.medication, dosage: rx.dosage }] : [];
                const hasAlt = meds.some(m => m.drugStatus === 'alternative_suggested');
                const hasTransferred = meds.some(m => m.drugStatus === 'transferred');
                const hasUnavailable = meds.some(m => m.drugStatus === 'not_available') && !hasTransferred;
                const altMed = meds.find(m => m.alternativeSuggested);
                const transferredMed = meds.find(m => m.drugStatus === 'transferred' && m.transferBranchName);
                const pendingClinicalNotes = meds.reduce(
                  (sum, m) =>
                    sum + (Array.isArray(m.pharmacyNotes) ? m.pharmacyNotes.filter(n => n.requiresDoctorApproval && n.approvalStatus === 'pending_doctor').length : 0),
                  0,
                );
                return (
                  <tr key={rx.id} style={{ cursor: 'pointer' }} onClick={() => { setShowRxAllDetails(false); setViewingRx(rx); }}>
                    <td style={{ fontWeight: 600 }}>{rx.patientName || 'Patient'}</td>
                    <td style={{ maxWidth: 140, fontSize: '0.85rem' }}>{rx.diagnosis || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {rx.prescriptionRef && (
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0c4a6e', background: '#f0f9ff', padding: '2px 6px', borderRadius: 6, display: 'inline-block', marginBottom: 2 }}>{rx.prescriptionRef}</div>
                      )}
                      {rx.branchName && <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{rx.branchName}</div>}
                      {rx.openToAll && !rx.branchName && !rx.pharmacyId && <div style={{ color: '#0369a1', fontSize: '0.75rem', fontWeight: 600 }}>Open to all pharmacies</div>}
                      {rx.lifecycleStatus === 'CANCELLED' && <div style={{ color: '#be123c', fontSize: '0.72rem', fontWeight: 700 }}>Cancelled</div>}
                      {!rx.prescriptionRef && !rx.branchName && !rx.openToAll && <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td>
                      {pm ? (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: pm.color }}>{pm.label}</span>
                      ) : <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>}
                      {hasAlt && (
                        <div style={{ marginTop: 2 }}>
                          <span style={{ fontSize: '0.7rem', background: '#fdf4ff', color: '#7c3aed', border: '1px solid #e9d5ff', borderRadius: 10, padding: '1px 6px', fontWeight: 700, cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); setAltApprovalRx(rx); }}>
                            🔁 Alt. pending
                          </span>
                        </div>
                      )}
                      {altMed && (
                        <div style={{ marginTop: 4, fontSize: '0.7rem', color: altMed.drugStatus === 'approved_replacement' ? '#166534' : '#7c3aed', fontWeight: 700 }}>
                          {altMed.alternativeSuggested} · {altMed.drugStatus === 'approved_replacement'
                            ? `Approved · Dr. ${altMed.approvedByDoctorName || rx.doctorName || 'Doctor'}`
                            : 'Waiting for Approval from your Doctor'}
                          {altMed.alternativeRationale ? ` · Why: ${altMed.alternativeRationale}` : ''}
                        </div>
                      )}
                      {transferredMed && (
                        <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#0369a1', fontWeight: 700 }}>
                          This drug ({transferredMed.name || 'Drug'}) is transfered to branch ({transferredMed.transferBranchName}{transferredMed.transferBranchAddress ? `, ${transferredMed.transferBranchAddress}` : ''}).
                        </div>
                      )}
                      {pendingClinicalNotes > 0 && (
                        <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#7c3aed', fontWeight: 700 }}>
                          {pendingClinicalNotes} clinical-impact note{pendingClinicalNotes > 1 ? 's' : ''} awaiting doctor review
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
                        <button className="doctor-btn doctor-btn-sm doctor-btn-outline" disabled={isRxDelivered(rx)} title={isRxDelivered(rx) ? 'Delivered — locked' : 'Edit'} onClick={(e) => { e.stopPropagation(); openEdit(rx); }}>Edit</button>
                        {hasUnavailable && (
                          <button
                            className="doctor-btn doctor-btn-sm doctor-btn-outline"
                            style={{ padding: '0.2rem 0.55rem', fontSize: '0.7rem', borderRadius: 14, color: '#1d4ed8', borderColor: '#bfdbfe', background: '#eff6ff' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setReassignRx(rx);
                              setReassignBranchId('');
                            }}
                          >
                            Reassign
                          </button>
                        )}
                        <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={(e) => { e.stopPropagation(); handlePrint(rx); }} title="Print"><Printer size={12} /></button>
                        <button className="doctor-btn doctor-btn-sm doctor-btn-danger" disabled={isRxDelivered(rx)} title={isRxDelivered(rx) ? 'Delivered — locked' : 'Delete'} onClick={(e) => { e.stopPropagation(); handleDelete(rx.id); }}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}</Paged>
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
                    {med.alternativeRationale ? (
                      <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6d28d9' }}>
                        Rationale: {med.alternativeRationale}
                      </p>
                    ) : null}
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600 }}>
                      Waiting for Approval from your Doctor
                    </p>
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
      {reassignRx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '1rem' }}
          onClick={() => setReassignRx(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '1.2rem', width: '100%', maxWidth: 520 }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', color: '#0f172a' }}>Reassign Unavailable Drugs</h3>
            <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#64748b' }}>
              {reassignRx.patientName} · {reassignRx.prescriptionRef || reassignRx.id}
            </p>
            <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#475569' }}>
              Only drugs currently marked as <b>Not Available</b> will be reassigned.
            </p>
            <select
              className="doctor-form-select"
              value={reassignBranchId}
              onChange={e => setReassignBranchId(e.target.value)}
            >
              <option value="">Select destination branch</option>
              {branchDirectory
                .filter(row => !reassignRx.pharmacyId || row.pharmacyId === reassignRx.pharmacyId)
                .map(row => (
                <option key={`${row.pharmacyId}-${row.branchId}`} value={row.branchId}>
                  {row.branchName}{row.address ? ` - ${row.address}` : ''}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => setReassignRx(null)}>Cancel</button>
              <button className="doctor-btn doctor-btn-sm doctor-btn-primary" disabled={!reassignBranchId || reassignSaving} onClick={reassignUnavailableDrugs}>
                {reassignSaving ? 'Reassigning…' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingRx && (() => {
        const sm = STATUS_META[viewingRx.status] || STATUS_META.active;
        const pm = viewingRx.pharmacyStatus ? (PHARMACY_STATUS_META[viewingRx.pharmacyStatus] || null) : null;
        const rxDate = viewingRx.date
          || (viewingRx.createdAt?.seconds ? new Date(viewingRx.createdAt.seconds * 1000).toLocaleDateString() : '—');
        const summaryRows = [
          ['Diagnosis', viewingRx.diagnosis || '—'],
          ['Date', rxDate],
          ['Follow-up', viewingRx.followUpDate || '—'],
          ['Pharmacy', viewingRx.pharmacyName || '—'],
          ['Branch', viewingRx.branchName || '—'],
          ['Reference', viewingRx.prescriptionRef || '—'],
        ];
        const medFieldRows = (m) => ([
          ['Strength', m.strength],
          ['Form', m.drugForm],
          ['Dosage', m.dosage],
          ['Frequency', m.frequency],
          ['Direction', m.direction],
          ['Duration', m.duration ? `${m.duration} ${m.durationUnit || ''}`.trim() : ''],
          ['Route', m.route],
          ['Injection site', m.injectionSite],
          ['Application site', m.applicationSite],
          ['Administration site', m.dropSite],
          ['Volume unit', m.drugForm === 'Syrup' ? m.volumeUnit : ''],
          ['Shake well', m.drugForm === 'Syrup' ? (m.shakeWell ? 'Yes' : 'No') : ''],
          ['Spacer required', m.drugForm === 'Inhaler' ? (m.spacerRequired ? 'Yes' : 'No') : ''],
          ['Rinse after use', m.drugForm === 'Inhaler' ? (m.rinseAfter ? 'Yes' : 'No') : ''],
          ['Change interval', m.changeInterval],
          ['Rotate site', m.drugForm === 'Patch' ? (m.rotationRequired ? 'Yes' : 'No') : ''],
          ['Special instructions', m.specialInstructions],
          ['PRN indication', m.prn?.indication],
          ['PRN max/day', m.prn?.maxPerDay],
          ['PRN interval', m.prn?.interval],
          ['Refill allowed', m.refill ? (m.refill.allowed ? 'Yes' : 'No') : ''],
          ['Refill count', m.refill?.count],
          ['Refill expiry', m.refill?.expiryDate],
          ['Schedule', Array.isArray(m.schedule) && m.schedule.length ? m.schedule.join(', ') : ''],
          ['Drug status', m.drugStatus],
        ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ''));
        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 998, padding: '1rem' }}
          onClick={() => setViewingRx(null)}>
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 22px 60px rgba(2,6,23,0.28)', border: '1px solid #e2e8f0', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '1.15rem 1.25rem', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(180deg,#f8fbff,#ffffff)' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{viewingRx.patientName || 'Patient'}</h2>
                <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>{viewingRx.diagnosis || 'Prescription'} · {rxDate}</p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: sm.bg, border: `1px solid ${sm.border}`, color: sm.color }}>
                    {(viewingRx.status || 'active').charAt(0).toUpperCase() + (viewingRx.status || 'active').slice(1)}
                  </span>
                  {pm && (
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: '#eff6ff', border: '1px solid #bfdbfe', color: pm.color }}>{pm.label}</span>
                  )}
                  {viewingRx.prescriptionRef && (
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{viewingRx.prescriptionRef}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setViewingRx(null)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.38rem 0.78rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', color: '#475569', flexShrink: 0 }}>Close</button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto' }}>
            {showRxAllDetails && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.5rem 1rem', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '0.9rem' }}>
                {summaryRows.map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
                    <div style={{ fontSize: '0.85rem', color: '#0f172a', wordBreak: 'break-word' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
            {(viewingRx.medications || []).map((m, i) => (
              <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.8rem', marginBottom: '0.55rem' }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>{m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}</p>
                <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748b' }}>{[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ') || '—'}</p>
                {showRxAllDetails && medFieldRows(m).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '0.35rem 0.9rem', marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px dashed #e2e8f0' }}>
                    {medFieldRows(m).map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{k}</div>
                        <div style={{ fontSize: '0.8rem', color: '#334155', wordBreak: 'break-word' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
                {m.alternativeSuggested ? (
                  <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: m.drugStatus === 'approved_replacement' ? '#166534' : '#7c3aed', fontWeight: 700 }}>
                    🔁 {m.alternativeSuggested} · {m.drugStatus === 'approved_replacement'
                      ? `Approved · Dr. ${m.approvedByDoctorName || viewingRx.doctorName || 'Doctor'}`
                      : 'Waiting for Approval from your Doctor'}
                    {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                  </p>
                ) : null}
                {m.drugStatus === 'transferred' && m.transferBranchName ? (
                  <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: '#0369a1', fontWeight: 700 }}>
                    This drug ({m.name || 'Drug'}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
                  </p>
                ) : null}
                {Array.isArray(m.pharmacyNotes) && m.pharmacyNotes.length > 0 ? (
                  <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                    {m.pharmacyNotes.map((n, ni) => (
                      <div key={ni} style={{ fontSize: '0.76rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 6px' }}>
                        <b>{n.label || n.type}</b> · {n.note}
                        {n.requiresDoctorApproval
                          ? ` · ${n.approvalStatus === 'approved' ? 'Approved' : n.approvalStatus === 'rejected' ? 'Rejected' : 'Pending doctor approval'}`
                          : ' · Operational'}
                        {n.requiresDoctorApproval && n.approvalStatus === 'pending_doctor' && (
                          <span style={{ marginLeft: 8 }}>
                            <button
                              className="doctor-btn doctor-btn-sm doctor-btn-outline"
                              style={{ padding: '2px 7px', fontSize: '0.68rem', marginRight: 4 }}
                              onClick={() => approvePharmacyNote(viewingRx, i, ni)}
                            >
                              Approve
                            </button>
                            <button
                              className="doctor-btn doctor-btn-sm doctor-btn-danger"
                              style={{ padding: '2px 7px', fontSize: '0.68rem' }}
                              onClick={() => rejectPharmacyNote(viewingRx, i, ni)}
                            >
                              Reject
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {viewingRx.instructions ? <p style={{ margin: '0.6rem 0 0', color: '#374151', fontSize: '0.85rem' }}><b>Instructions:</b> {viewingRx.instructions}</p> : null}
            </div>

            {/* QR / collection code, dispensing so far, new code, cancel. */}
            <div style={{ padding: '0 1.25rem 1rem' }}>
              <PrescriptionCodeCard prescription={viewingRx} canManage onChanged={() => setViewingRx(null)} />
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.25rem', borderTop: '1px solid #eef2f7', background: '#fbfdff', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowRxAllDetails(v => !v)}
                className="doctor-btn doctor-btn-outline doctor-btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <ChevronDown size={14} style={{ transform: showRxAllDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                {showRxAllDetails ? 'Hide details' : 'View all'}
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => handlePrint(viewingRx)} className="doctor-btn doctor-btn-outline doctor-btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Printer size={14} /> Print
                </button>
                <button onClick={() => setViewingRx(null)} className="doctor-btn doctor-btn-primary doctor-btn-sm">Close</button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
