import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, functions, httpsCallable } from '../../../services/firestoreShim';
import {
  doc, getDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, getDocs, query, where,
} from '../../../services/firestoreShim';
import { logAction, A } from '../../../utils/auditLogger';

const EDITABLE_FIELDS = {
  auth:        ['name', 'email', 'phone', 'nationalId', 'ghanaCard', 'dateOfBirth', 'gender', 'address', 'bloodGroup'],
  // Therapy client. These come from the intake questionnaire, which the backend
  // stores whole in preferencesJson and the shim hoists back to flat fields — so
  // they're editable here rather than being blank medical-patient fields.
  clients:     ['name', 'email', 'phone', 'dateOfBirth', 'gender', 'address',
                'therapyType', 'emergencyContact', 'preferredLanguage',
                'previousTherapy', 'concerns', 'goals', 'medications', 'notes'],
  doctors:     ['name', 'email', 'phone', 'specialization', 'licenseNumber', 'consultationFee', 'yearsExperience', 'bio'],
  therapists:  ['name', 'email', 'phone', 'specialties', 'licenseNumber', 'consultationFee', 'yearsExperience', 'bio'],
  pharmacies:  ['pharmacyName', 'email', 'phone', 'address', 'country', 'businessReg'],
  labs:        ['labName', 'email', 'phone', 'address', 'country'],
  scanCenters: ['scanCenterName', 'email', 'phone', 'address', 'country'],
  homeCareNurses: ['fullName', 'email', 'phone', 'specialty', 'licenseNumber', 'bio'],
};

const COL_LABELS = {
  auth: 'Medical Patient', clients: 'Therapy Client', doctors: 'Doctor',
  therapists: 'Therapist', homeCareNurses: 'Home Care Nurse',
  pharmacies: 'Pharmacy', labs: 'Lab Center', scanCenters: 'Scan Center',
};

const COL_COLORS = {
  auth: { bg: 'linear-gradient(135deg, #1e3a5f, #0f172a)', accent: '#60a5fa' },
  clients: { bg: 'linear-gradient(135deg, #3b0764, #1e1b4b)', accent: '#a78bfa' },
  doctors: { bg: 'linear-gradient(135deg, #14532d, #0f172a)', accent: '#4ade80' },
  therapists: { bg: 'linear-gradient(135deg, #312e81, #1e1b4b)', accent: '#818cf8' },
  pharmacies: { bg: 'linear-gradient(135deg, #7c2d12, #1c1917)', accent: '#fb923c' },
  labs: { bg: 'linear-gradient(135deg, #064e3b, #0f172a)', accent: '#34d399' },
  scanCenters: { bg: 'linear-gradient(135deg, #4c1d95, #1e1b4b)', accent: '#c084fc' },
  homeCareNurses: { bg: 'linear-gradient(135deg, #134e4a, #0f172a)', accent: '#5eead4' },
};

const FIELD_LABELS = {
  name: 'Full Name', email: 'Email', phone: 'Phone', nationalId: 'National ID',
  ghanaCard: 'Ghana Card', dateOfBirth: 'Date of Birth', gender: 'Gender', address: 'Address',
  bloodGroup: 'Blood Group', specialization: 'Specialization', specialties: 'Specialties',
  licenseNumber: 'License Number', consultationFee: 'Consultation Fee', yearsExperience: 'Years Exp.',
  bio: 'Bio', fullName: 'Full Name', specialty: 'Specialty',
  pharmacyName: 'Pharmacy Name', labName: 'Lab Name', scanCenterName: 'Center Name',
  country: 'Country', businessReg: 'Business Reg.', status: 'Status', accountStatus: 'Account status',
  role: 'Role',
  // Therapy-client intake fields
  therapyType: 'Therapy Type', emergencyContact: 'Emergency Contact',
  preferredLanguage: 'Preferred Language', previousTherapy: 'Previous Therapy',
  concerns: 'Main Concerns', goals: 'Therapy Goals', medications: 'Medications',
  notes: 'Notes',
};

// Intake answers are not all strings — `concerns`/`goals` are arrays and `phq9`
// is an object. Coerce to something a text field can show and round-trip.
function asEditableText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const THERAPIST_ROLE_OPTIONS = [
  { value: 'user', label: 'Therapist' },
  { value: 'admin', label: 'Admin therapist' },
];

function therapistRoleLabel(role) {
  return role === 'admin' ? 'Admin therapist' : 'Therapist';
}

function asDate(ts) {
  if (ts == null || ts === '') return null;
  try {
    if (typeof ts.toDate === 'function') return ts.toDate();
  } catch (_) { /* ignore */ }
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  if (ts instanceof Date && !Number.isNaN(ts.getTime())) return ts;
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function fmtDate(ts) {
  const d = asDate(ts);
  return d
    ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
}

function fmtShort(ts) {
  const d = asDate(ts);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function buildAddressFromRecord(d) {
  if (!d || typeof d !== 'object') return '';
  const direct = [d.address, d.streetAddress, d.mailingAddress]
    .map((x) => (x != null && String(x).trim() ? String(x).trim() : ''))
    .find(Boolean);
  if (direct) return direct;
  const parts = [d.street, d.area, d.city, d.region, d.country].filter((x) => x != null && String(x).trim());
  if (parts.length) return parts.map((x) => String(x).trim()).join(', ');
  const lm = d.locationMeta;
  if (lm && typeof lm === 'object') {
    const lp = [lm.street, lm.area, lm.city, lm.region, lm.country].filter((x) => x != null && String(x).trim());
    if (lp.length) return lp.map((x) => String(x).trim()).join(', ');
  }
  const loc = d.location;
  if (loc && typeof loc === 'object') {
    const lp = [loc.street, loc.city, loc.country].filter(Boolean);
    if (lp.length) return lp.join(', ');
  }
  return '';
}

function normalizeClientAdmin(c, authData) {
  const a = authData || {};
  const displayName = c.displayName || c.clientName || c.name || a.name || a.displayName || '';
  const addr = (c.address && String(c.address).trim()) || buildAddressFromRecord(c) || buildAddressFromRecord(a) || (a.address && String(a.address).trim()) || '';
  const hasClientStatus = c.status !== undefined && c.status !== null && c.status !== '';
  let status = hasClientStatus ? c.status : (a.status || 'active');
  if (String(c.status).toLowerCase() === 'pending' && String(a.status).toLowerCase() === 'active') {
    status = 'active';
  }
  return {
    ...c,
    name: c.name || displayName,
    displayName: c.displayName || displayName,
    clientName: c.clientName || displayName,
    email: c.email || a.email || '',
    phone: c.phone || c.phoneNumber || a.phone || a.phoneNumber || '',
    dateOfBirth: c.dateOfBirth || c.dob || a.dateOfBirth || '',
    gender: c.gender || a.gender || '',
    address: addr,
    status,
  };
}

function normalizeAuthAdmin(c) {
  return {
    ...c,
    name: c.name || c.displayName || '',
    phone: c.phone || c.phoneNumber || '',
    address: (c.address && String(c.address).trim()) || buildAddressFromRecord(c) || '',
  };
}

function InfoRow({ label, value, mono }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', gap: '0.75rem', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
      <span style={{ minWidth: 160, fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function SectionCard({ title, children, icon }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {icon && <span style={{ fontSize: '1rem' }}>{icon}</span>}
        <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
      </div>
      <div style={{ padding: '1rem 1.25rem' }}>{children}</div>
    </div>
  );
}

export default function AdminUserDetail() {
  const { col, userId } = useParams();
  const navigate        = useNavigate();
  const colStyle        = COL_COLORS[col] || COL_COLORS.auth;

  const [user, setUser]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [pwModal, setPwModal] = useState({ open: false, branch: null, generatedPassword: null });
  const [pwActionBusy, setPwActionBusy] = useState(false);
  const [related, setRelated]     = useState({ appointments: [], prescriptions: [], diagnostics: [], notes: [] });
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [relatedLoaded, setRelatedLoaded] = useState(false);
  const [branches, setBranches]   = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [roleType, setRoleType]   = useState('');
  const [feedback, setFeedback]   = useState({ type: '', msg: '' });
  const [branchEditModal, setBranchEditModal] = useState(null);

  useEffect(() => { loadUser(); }, [col, userId]);
  useEffect(() => {
    if (!['pharmacies', 'labs', 'scanCenters'].includes(col) || !userId) return;
    loadBranches();
  }, [col, userId]);

  const loadUser = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, col, userId));
      if (snap.exists()) {
        let data = { id: snap.id, ...snap.data() };
        if (col === 'clients') {
          let authData;
          if (data.authUid) {
            const authSnap = await getDoc(doc(db, 'auth', data.authUid));
            if (authSnap.exists()) authData = authSnap.data();
          }
          data = normalizeClientAdmin(data, authData);
        } else if (col === 'auth') {
          data = normalizeAuthAdmin(data);
        }
        setUser(data);
        const formData = col === 'therapists'
          ? { ...data, role: data.role === 'admin' ? 'admin' : 'user' }
          : { ...data };
        setEditForm(formData);
        if (col === 'therapists') {
          setRoleType(therapistRoleLabel(formData.role));
        } else {
          setRoleType(col === 'auth' ? 'Medical Patient' : col === 'clients' ? 'Therapy Client' : COL_LABELS[col] || col);
        }
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  const loadRelated = async () => {
    if (relatedLoaded) return;
    setLoadingRelated(true);
    try {
      const promises = [];
      if (col === 'clients') {
        // Therapy clients only. Prescriptions and diagnostic orders are medical-side
        // concepts a therapy client can never have, so querying them just produced
        // permanently-empty "Prescriptions (0)" cards on a therapy record.
        promises.push(getDocs(query(collection(db, 'scheduledCalls'), where('clientId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Therapy Session' }))).catch(() => []));
        promises.push(getDocs(query(collection(db, 'clinicalNotes'), where('clientId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Clinical Note' }))).catch(() => []));
      } else if (col === 'auth') {
        // An `auth` row can be either product line, so load both and let the
        // role-type detection below decide what this account actually is.
        promises.push(getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Doctor Appointment' }))).catch(() => []));
        promises.push(getDocs(query(collection(db, 'scheduledCalls'), where('clientId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Therapy Session' }))).catch(() => []));
        promises.push(getDocs(query(collection(db, 'doctorPrescriptions'), where('patientId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Prescription' }))).catch(() => []));
        promises.push(getDocs(query(collection(db, 'diagnosticOrders'), where('patientId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Diagnostic Order' }))).catch(() => []));
      } else if (col === 'doctors') {
        promises.push(getDocs(query(collection(db, 'doctorAppointments'), where('doctorId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Appointment' }))).catch(() => []));
        promises.push(getDocs(query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Prescription' }))).catch(() => []));
      } else if (col === 'therapists') {
        promises.push(getDocs(query(collection(db, 'scheduledCalls'), where('therapistId', '==', userId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _type: 'Session' }))).catch(() => []));
      }
      const results = await Promise.all(promises);
      const all     = results.flat().sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRelated({
        appointments:  all.filter(r => ['Doctor Appointment','Appointment','Therapy Session','Session'].includes(r._type)),
        prescriptions: all.filter(r => r._type === 'Prescription'),
        diagnostics:   all.filter(r => r._type === 'Diagnostic Order'),
        notes:         all.filter(r => r._type === 'Clinical Note'),
      });
      if (col === 'auth') {
        const hasDr = all.some(r => r._type === 'Doctor Appointment');
        const hasTh = all.some(r => r._type === 'Therapy Session');
        if (hasDr && hasTh) setRoleType('Patient & Therapy Client');
        else if (hasTh) setRoleType('Therapy Client');
        else if (hasDr) setRoleType('Medical Patient');
      }
      setRelatedLoaded(true);
    } catch (e) { console.error(e); }
    finally { setLoadingRelated(false); }
  };

  const getBranchCfg = () => {
    if (col === 'pharmacies') return { collectionName: 'pharmacyBranches', parentField: 'pharmacyId' };
    if (col === 'labs') return { collectionName: 'labBranches', parentField: 'labId' };
    if (col === 'scanCenters') return { collectionName: 'scanBranches', parentField: 'scanId' };
    return null;
  };

  const loadBranches = async () => {
    const cfg = getBranchCfg();
    if (!cfg) return;
    setBranchesLoading(true);
    try {
      const snap = await getDocs(query(collection(db, cfg.collectionName), where(cfg.parentField, '==', userId)));
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setBranches(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setBranchesLoading(false);
    }
  };

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback({ type: '', msg: '' }), 4000);
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      const payload = { updatedAt: serverTimestamp() };
      const fields = EDITABLE_FIELDS[col] || [];
      fields.forEach(f => { if (editForm[f] !== undefined) payload[f] = editForm[f]; });
      if (col === 'clients' && payload.name !== undefined) {
        payload.displayName = payload.name;
        payload.clientName = payload.name;
      }
      const statusKey = col === 'homeCareNurses' ? 'accountStatus' : 'status';
      const rawStatus = col === 'homeCareNurses' ? (editForm.accountStatus ?? editForm.status) : editForm.status;
      if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== '') {
        payload[statusKey] = String(rawStatus).trim();
        payload.statusUpdatedAt = serverTimestamp();
      }
      if (col === 'therapists' && editForm.role !== undefined) {
        // 'admin' is the stored value the therapist screens gate on; a plain
        // therapist is stored as 'therapist' so the backend's role hoist and the
        // UI agree on one vocabulary ('user' matched neither).
        const nextRole = editForm.role === 'admin' ? 'admin' : 'therapist';
        payload.role = nextRole;
        payload.isAdminTherapist = nextRole === 'admin';
        // Deliberately NOT writing `type`. On a therapist record `type` is the
        // therapy modality the client match screens filter on — setting it to
        // 'Administrator' matched no modality and removed the therapist from
        // every client's "Choose your therapist" list.
        if (user.type === 'Administrator') payload.type = null;
      }
      await updateDoc(doc(db, col, userId), payload);
      if (col === 'clients' && payload.status !== undefined && user.authUid) {
        await updateDoc(doc(db, 'auth', user.authUid), {
          status: payload.status,
          updatedAt: serverTimestamp(),
        });
      }
      const loggedFields = [...fields];
      if (payload[statusKey] !== undefined) loggedFields.push(statusKey);
      if (payload.role !== undefined) loggedFields.push('role');
      await logAction(A.ADMIN_USER_EDITED, { targetId: userId, collection: col, fields: loggedFields.join(',') }, 'admin');
      setUser(prev => ({ ...prev, ...editForm, ...(payload[statusKey] !== undefined ? { [statusKey]: payload[statusKey] } : {}), ...(payload.role !== undefined ? { role: payload.role, type: payload.type ?? prev.type } : {}) }));
      if (col === 'therapists' && payload.role !== undefined) {
        setRoleType(therapistRoleLabel(payload.role));
      }
      showFeedback('success', 'Profile updated successfully.');
    } catch (e) {
      showFeedback('error', 'Failed to save: ' + e.message);
    } finally { setSaving(false); }
  };

  const changeStatus = async (status) => {
    if (!window.confirm(`Set status to "${status}"?`)) return;
    setSaving(true);
    const statusField = col === 'homeCareNurses' ? 'accountStatus' : 'status';
    let next = status;
    if (col === 'homeCareNurses' && String(status).toLowerCase() === 'active') next = 'approved';
    try {
      await updateDoc(doc(db, col, userId), { [statusField]: next, statusUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      if (col === 'clients' && statusField === 'status' && user.authUid) {
        await updateDoc(doc(db, 'auth', user.authUid), { status: next, updatedAt: serverTimestamp() });
      }
      await logAction(A.ADMIN_USER_STATUS, { targetId: userId, collection: col, newStatus: next }, 'admin');
      setUser(prev => ({ ...prev, [statusField]: next }));
      setEditForm(prev => ({ ...prev, [statusField]: next }));
      showFeedback('success', `Status changed to ${next}.`);
    } catch (e) {
      showFeedback('error', 'Failed: ' + e.message);
    } finally { setSaving(false); }
  };

  const toggleMfaRequired = async () => {
    if (col !== 'pharmacies') return;
    const next = user?.mfaRequired !== true;
    const ok = window.confirm(`${next ? 'Enable' : 'Disable'} MFA requirement for this pharmacy account?`);
    if (!ok) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, col, userId), {
        mfaRequired: next,
        updatedAt: serverTimestamp(),
      });
      await logAction(A.ADMIN_USER_EDITED, {
        targetId: userId,
        collection: col,
        fields: 'mfaRequired',
        value: String(next),
      }, 'admin');
      setUser(prev => ({ ...prev, mfaRequired: next }));
      setEditForm(prev => ({ ...prev, mfaRequired: next }));
      showFeedback('success', `MFA requirement ${next ? 'enabled' : 'disabled'}.`);
    } catch (e) {
      showFeedback('error', 'Failed to update MFA requirement: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const openBranchPwReset = (branch) => {
    if (!branch?.email) {
      showFeedback('error', 'Branch email missing.');
      return;
    }
    setPwModal({ open: true, branch, generatedPassword: null });
  };

  const closePwModal = (force) => {
    if (pwActionBusy) return;
    if (pwModal.generatedPassword && !force) {
      const ok = window.confirm('Close this dialog? You cannot retrieve the one-time password here again.');
      if (!ok) return;
    }
    setPwModal({ open: false, branch: null, generatedPassword: null });
  };

  const copyPwModalPassword = async () => {
    const p = pwModal.generatedPassword;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      showFeedback('success', 'Copied.');
    } catch {
      showFeedback('error', 'Copy failed — select the password manually.');
    }
  };

  const applyAdminPasswordReset = async () => {
    const branch = pwModal.branch;
    let entityCollection = col;
    let entityDocId = userId;
    if (branch) {
      const cfg = getBranchCfg();
      if (!cfg) return;
      entityCollection = cfg.collectionName;
      entityDocId = branch.id;
    }
    setPwActionBusy(true);
    try {
      const fn = httpsCallable(functions, 'adminSetTemporaryPassword', { timeout: 120000 });
      const result = await fn({ entityCollection, entityDocId });
      const temporaryPassword = result.data?.temporaryPassword;
      if (!temporaryPassword) {
        showFeedback('error', 'Server did not return a temporary password. Redeploy the `adminSetTemporaryPassword` Cloud Function.');
        return;
      }
      await logAction(A.ADMIN_TEMP_PASSWORD_SET, {
        targetCollection: entityCollection,
        targetDocId: entityDocId,
        targetEmail: branch ? branch.email : user?.email,
      }, 'admin');
      showFeedback('success', 'One-time password generated. Copy it below; it is not kept after you close this dialog.');
      setPwModal((prev) => ({ ...prev, generatedPassword: temporaryPassword }));
      if (branch) await loadBranches();
      else await loadUser();
    } catch (e) {
      const code = e?.code || '';
      const details = e?.customData?.details ?? e?.details;
      const detailStr = typeof details === 'string' ? details : '';
      const msg = detailStr || e?.message || String(e);
      if (code === 'functions/permission-denied' || msg.includes('permission-denied')) {
        showFeedback('error', 'Permission denied.');
      } else if (code === 'functions/unauthenticated') {
        showFeedback('error', 'Your session expired. Sign in again.');
      } else if (code === 'functions/failed-precondition' || code === 'functions/invalid-argument' || code === 'functions/not-found') {
        showFeedback('error', msg || 'Reset failed.');
      } else if (code === 'functions/internal' || msg === 'internal') {
        showFeedback(
          'error',
          'Callable returned internal (often: function not deployed to teleehealth, wrong region, or Cloud Run invoker). Redeploy `adminSetTemporaryPassword` and check Functions logs in Firebase console.'
        );
      } else {
        showFeedback('error', `Reset failed: ${msg}`);
      }
    } finally {
      setPwActionBusy(false);
    }
  };

  const deleteUser = async () => {
    const name = getName(user);
    if (!window.confirm(
      `⚠️ PERMANENT DELETE\n\nDelete "${name}" from Firestore?\n\nNote: Firebase Auth account must be removed separately via Firebase Console.`
    )) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, col, userId));
      await logAction(A.ADMIN_USER_DELETED, { targetId: userId, collection: col, name }, 'admin');
      navigate('/dashboard/users');
    } catch (e) {
      showFeedback('error', 'Delete failed: ' + e.message);
    } finally { setDeleting(false); }
  };

  const openBranchEdit = (branch) => {
    setBranchEditModal({
      id: branch.id,
      branchName: branch.branchName || '',
      address: branch.address || '',
      contact: branch.contact || branch.contactNumber || '',
    });
  };

  const saveBranchEditModal = async () => {
    const cfg = getBranchCfg();
    if (!cfg || !branchEditModal?.id) return;
    try {
      const c = (branchEditModal.contact || '').trim();
      await updateDoc(doc(db, cfg.collectionName, branchEditModal.id), {
        branchName: (branchEditModal.branchName || '').trim(),
        address: (branchEditModal.address || '').trim(),
        contact: c,
        contactNumber: c,
        updatedAt: serverTimestamp(),
      });
      setBranchEditModal(null);
      await loadBranches();
      showFeedback('success', 'Branch updated.');
    } catch (e) {
      showFeedback('error', 'Branch update failed.');
    }
  };

  const toggleBranchStatus = async (branch) => {
    const cfg = getBranchCfg();
    if (!cfg) return;
    const next = (branch.status || 'active') === 'active' ? 'suspended' : 'active';
    await updateDoc(doc(db, cfg.collectionName, branch.id), {
      status: next,
      updatedAt: serverTimestamp(),
    });
    await loadBranches();
    showFeedback('success', `Branch ${next === 'active' ? 'enabled' : 'disabled'}.`);
  };

  const deleteBranch = async (branch) => {
    const cfg = getBranchCfg();
    if (!cfg) return;
    if (!window.confirm(`Delete branch "${branch.branchName || 'Branch'}"?`)) return;
    await deleteDoc(doc(db, cfg.collectionName, branch.id));
    await loadBranches();
    showFeedback('success', 'Branch deleted.');
  };

  const resetBranchPassword = (branch) => openBranchPwReset(branch);

  const getName  = u => u?.fullName || u?.name || u?.pharmacyName || u?.labName || u?.scanCenterName || u?.centerName || u?.displayName || u?.clientName || u?.email || '—';

  if (loading) return (
    <div className="admin-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: '0.75rem', color: '#94a3b8' }}>
        <div style={{ width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Loading profile…
      </div>
    </div>
  );

  if (!user) return (
    <div className="admin-page">
      <div className="admin-page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/users')}>← Back to Users</button>
      </div>
      <div className="admin-empty"><p>User not found.</p></div>
    </div>
  );

  const status = col === 'homeCareNurses'
    ? (user.accountStatus || user.status || 'pending')
    : (user.status || 'active');
  const accountLive = col === 'homeCareNurses'
    ? ['approved', 'active'].includes(String(status).toLowerCase())
    : status === 'active';
  const statusBadge = status === 'active' || status === 'approved' ? { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }
    : status === 'suspended' ? { bg: '#fff1f2', color: '#dc2626', border: '#fecdd3' }
    : { bg: '#fff7ed', color: '#d97706', border: '#fed7aa' };

  const editableFields = EDITABLE_FIELDS[col] || [];
  const statusEditKey = col === 'homeCareNurses' ? 'accountStatus' : 'status';
  const statusSelectOptions = col === 'homeCareNurses'
    ? ['pending', 'approved', 'suspended', 'rejected']
    : ['active', 'suspended', 'pending', 'inactive', 'rejected'];
  const SKIP = new Set(['id', '_col', '_roleLabel', 'password', 'uid']);
  const allFields = Object.entries(user).filter(([k]) => !SKIP.has(k)).sort(([a], [b]) => a.localeCompare(b));

  const TABS = [
    { key: 'profile',  icon: '👤', label: 'Profile'  },
    { key: 'edit',     icon: '✏️', label: 'Edit'     },
    { key: 'activity', icon: '📋', label: 'Activity'  },
    { key: 'raw',      icon: '🗂️', label: 'Raw Data'  },
  ];

  return (
    <div className="admin-page">
      {/* Back nav */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/users')}>
          ← Back to User Management
        </button>
      </div>

      {/* Feedback banner */}
      {feedback.msg && (
        <div style={{
          marginBottom: '1rem', padding: '0.75rem 1.1rem', borderRadius: 10,
          background: feedback.type === 'success' ? '#f0fdf4' : '#fff1f2',
          border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecdd3'}`,
          color: feedback.type === 'success' ? '#15803d' : '#dc2626',
          fontSize: '0.875rem', fontWeight: 600,
        }}>
          {feedback.type === 'success' ? '✅' : '🚨'} {feedback.msg}
        </div>
      )}

      {/* Hero header card */}
      <div style={{ background: colStyle.bg, borderRadius: 18, padding: '1.75rem 2rem', marginBottom: '1.5rem', boxShadow: '0 6px 30px rgba(0,0,0,0.2)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 200, height: 200, borderRadius: '50%', background: `${colStyle.accent}15`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -50, right: 100, width: 150, height: 150, borderRadius: '50%', background: `${colStyle.accent}10`, pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap', position: 'relative' }}>
          {/* Avatar */}
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${colStyle.accent}25`, border: `3px solid ${colStyle.accent}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 800, color: colStyle.accent, flexShrink: 0 }}>
            {user.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
              : (getName(user)[0] || '?').toUpperCase()}
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: '#fff' }}>{getName(user)}</h2>
              <span style={{ padding: '0.2rem 0.7rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: `${colStyle.accent}25`, color: colStyle.accent, border: `1px solid ${colStyle.accent}40` }}>{roleType}</span>
              <span style={{ padding: '0.2rem 0.7rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: statusBadge.bg + '30', color: statusBadge.color, border: `1px solid ${statusBadge.color}50` }}>{status}</span>
            </div>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem' }}>
              {user.email || '—'}{user.phone ? ` · ${user.phone}` : ''}
            </p>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', fontFamily: 'monospace' }}>
              {col}/{userId}
            </p>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Joined', val: fmtShort(user.createdAt || user.completedAt) },
              ...(user.specialization ? [{ label: 'Specialty', val: user.specialization }] : []),
              ...(user.consultationFee ? [{ label: 'Fee (GHS)', val: user.consultationFee }] : []),
              ...(user.yearsExperience ? [{ label: 'Experience', val: `${user.yearsExperience}y` }] : []),
              ...(user.country ? [{ label: 'Country', val: user.country }] : []),
            ].map(({ label, val }) => (
              <div key={label} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: colStyle.accent, marginTop: 1 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${colStyle.accent}20` }}>
          <button onClick={() => { setActiveTab('edit'); }}
            style={{ padding: '0.45rem 1rem', borderRadius: 8, border: `1px solid ${colStyle.accent}50`, background: `${colStyle.accent}15`, color: colStyle.accent, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            ✏️ Edit Profile
          </button>
          <button type="button" onClick={() => setPwModal({ open: true, branch: null, generatedPassword: null })}
            style={{ padding: '0.45rem 1rem', borderRadius: 8, border: '1px solid #fcd34d50', background: '#fcd34d15', color: '#fbbf24', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            🔑 Reset Password
          </button>
          {col === 'pharmacies' && (
            <button
              disabled={saving}
              onClick={toggleMfaRequired}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: 8,
                border: `1px solid ${user?.mfaRequired ? '#f8717150' : '#60a5fa60'}`,
                background: user?.mfaRequired ? '#fff1f215' : '#dbeafe20',
                color: user?.mfaRequired ? '#fca5a5' : '#93c5fd',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {user?.mfaRequired ? '🛡️ MFA Required: ON' : '🛡️ MFA Required: OFF'}
            </button>
          )}
          {!accountLive && status !== 'inactive' && status !== 'rejected' && (
            <button disabled={saving} onClick={() => changeStatus('active')}
              style={{ padding: '0.45rem 1rem', borderRadius: 8, border: '1px solid #4ade8040', background: '#4ade8015', color: '#4ade80', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              ✓ Activate
            </button>
          )}
          {accountLive && (
            <button disabled={saving} onClick={() => changeStatus('suspended')}
              style={{ padding: '0.45rem 1rem', borderRadius: 8, border: '1px solid #f8717150', background: '#f8717115', color: '#f87171', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              ⛔ Suspend
            </button>
          )}
          {status !== 'inactive' && (
            <button disabled={saving} onClick={() => changeStatus('inactive')}
              style={{ padding: '0.45rem 1rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              Deactivate
            </button>
          )}
          <button disabled={deleting} onClick={deleteUser}
            style={{ padding: '0.45rem 1rem', borderRadius: 8, border: '1px solid #b91c1c50', background: '#7f1d1d', color: '#fca5a5', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>
            {deleting ? 'Deleting…' : '🗑 Delete User'}
          </button>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: '#f8fafc', borderRadius: 12, padding: '0.35rem', border: '1px solid #e2e8f0' }}>
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => { setActiveTab(t.key); if (t.key === 'activity' && !relatedLoaded) loadRelated(); }}
            style={{
              flex: 1, padding: '0.55rem 0.75rem', borderRadius: 9, border: 'none',
              background: activeTab === t.key ? '#fff' : 'transparent',
              boxShadow: activeTab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              color: activeTab === t.key ? '#0f172a' : '#64748b',
              fontSize: '0.8rem', fontWeight: activeTab === t.key ? 700 : 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {activeTab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <SectionCard title="Identity & Contact" icon="👤">
            <InfoRow label="Full Name"    value={getName(user)} />
            <InfoRow label="Email"        value={user.email} />
            <InfoRow label="Phone"        value={user.phone || user.phoneNumber} />
            <InfoRow label="Date of Birth"value={user.dateOfBirth} />
            <InfoRow label="Gender"       value={user.gender} />
            <InfoRow label="Blood Group"  value={user.bloodGroup} />
            <InfoRow label="National ID"  value={user.nationalId || user.ghanaCard} />
            <InfoRow label="Address"      value={user.address || buildAddressFromRecord(user)} />
            <InfoRow label="Country"      value={user.country || user.location?.country} />
            <InfoRow label="City"         value={user.city || user.location?.city} />
          </SectionCard>

          <SectionCard title="Account & Platform" icon="⚙️">
            <InfoRow label="Firebase UID"  value={user.uid || userId} mono />
            <InfoRow label="Firestore ID"  value={userId} mono />
            <InfoRow label="Collection"    value={col} />
            <InfoRow label="Role / Type"   value={col === 'therapists' ? therapistRoleLabel(user.role) : (user.role || roleType)} />
            <InfoRow label="Status"        value={status} />
            <InfoRow label="Username"      value={user.username} />
            <InfoRow label="Joined"        value={fmtDate(user.createdAt || user.completedAt)} />
            <InfoRow label="Last Updated"  value={fmtDate(user.updatedAt || user.statusUpdatedAt)} />
            <InfoRow label="Must Change PW"value={user.mustChangePassword ? 'Yes' : undefined} />
          </SectionCard>

          {(user.specialization || user.specialties || user.licenseNumber) && (
            <SectionCard title="Professional Details" icon="🩺">
              <InfoRow label="Specialization"    value={user.specialization} />
              <InfoRow label="Specialties"       value={Array.isArray(user.specialties) ? user.specialties.join(', ') : user.specialties} />
              <InfoRow label="License Number"    value={user.licenseNumber} />
              <InfoRow label="Licensing Body"    value={user.licensingAuthority} />
              <InfoRow label="License Issued"    value={user.licenseIssueDate} />
              <InfoRow label="License Expiry"    value={user.licenseExpiryDate} />
              <InfoRow label="Years Experience"  value={user.yearsExperience} />
              <InfoRow label="Languages"         value={Array.isArray(user.languagesSpoken) ? user.languagesSpoken.join(', ') : user.languagesSpoken} />
              <InfoRow label="Consultation Fee"  value={user.consultationFee ? `GHS ${user.consultationFee}` : undefined} />
              <InfoRow label="Session Duration"  value={user.sessionDuration ? `${user.sessionDuration} min` : undefined} />
              <InfoRow label="Practice Name"     value={user.practiceName} />
              <InfoRow label="Practice Address"  value={user.practiceAddress} />
              <InfoRow label="Consultation Mode" value={user.consultationMode} />
              <InfoRow label="Therapy Approaches"value={Array.isArray(user.therapyApproaches) ? user.therapyApproaches.join(', ') : user.therapyApproaches} />
              <InfoRow label="Age Groups"        value={Array.isArray(user.ageGroupsServed) ? user.ageGroupsServed.join(', ') : user.ageGroupsServed} />
            </SectionCard>
          )}

          {(user.bio || user.education || user.workExperience) && (
            <SectionCard title="Bio & Background" icon="📄">
              {user.bio && <p style={{ margin: '0 0 0.65rem', fontSize: '0.85rem', color: '#334155', lineHeight: 1.65 }}>{user.bio}</p>}
              {user.education && <><div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Education</div><p style={{ margin: '0 0 0.65rem', fontSize: '0.85rem', color: '#334155', lineHeight: 1.65 }}>{user.education}</p></>}
              {user.workExperience && <><div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Work Experience</div><p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.65 }}>{user.workExperience}</p></>}
            </SectionCard>
          )}

          {['pharmacies', 'labs', 'scanCenters'].includes(col) && (
            <div style={{ gridColumn: '1 / -1' }}>
              <SectionCard title="Parent Branch Management" icon="🏪">
                {branchesLoading ? (
                  <p style={{ color: '#94a3b8' }}>Loading branches…</p>
                ) : branches.length === 0 ? (
                  <p style={{ color: '#94a3b8' }}>No branches linked to this parent yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {branches.map(b => (
                      <div key={b.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: '0.83rem', fontWeight: 700, color: '#0f172a' }}>{b.branchName || 'Branch'}</div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              {b.email || '—'} · {b.address || '—'} · {b.status || 'active'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openBranchEdit(b)}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => resetBranchPassword(b)}>Reset Password</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleBranchStatus(b)}>
                              {(b.status || 'active') === 'active' ? 'Disable' : 'Enable'}
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteBranch(b)}>Delete</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {user.adminNote && (
            <div style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '1rem 1.25rem' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e' }}>📌 <b>Admin Note:</b> {user.adminNote}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Edit tab ── */}
      {activeTab === 'edit' && (
        <SectionCard title="Edit User Information" icon="✏️">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            {editableFields.map(field => (
              <div key={field}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#374151', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {FIELD_LABELS[field] || field}
                </label>
                {/* Intake answers arrive as arrays (concerns, goals) or objects
                    (phq9). Render them as readable text rather than
                    "[object Object]". */}
                {['bio', 'concerns', 'goals', 'notes', 'medications'].includes(field) ? (
                  <textarea rows={3} value={asEditableText(editForm[field])}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical', gridColumn: '1 / -1' }} />
                ) : (
                  <input value={asEditableText(editForm[field])}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                )}
              </div>
            ))}
            {col === 'therapists' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#374151', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {FIELD_LABELS.role}
                </label>
                <select
                  value={editForm.role === 'admin' ? 'admin' : 'user'}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', background: '#fff', boxSizing: 'border-box' }}
                >
                  {THERAPIST_ROLE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#374151', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</label>
              <select
                value={editForm[statusEditKey] ?? (col === 'homeCareNurses' ? 'pending' : 'active')}
                onChange={(e) => setEditForm((f) => ({ ...f, [statusEditKey]: e.target.value }))}
                style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', background: '#fff', boxSizing: 'border-box' }}
              >
                {statusSelectOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-primary" disabled={saving} onClick={saveEdits}>{saving ? 'Saving…' : '💾 Save All Changes'}</button>
            <button className="btn btn-ghost" onClick={() => {
              const reset = col === 'therapists'
                ? { ...user, role: user.role === 'admin' ? 'admin' : 'user' }
                : user;
              setEditForm(reset);
              setActiveTab('profile');
            }}>Cancel</button>
          </div>
        </SectionCard>
      )}

      {/* ── Activity tab ── */}
      {activeTab === 'activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loadingRelated ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, gap: '0.75rem', color: '#94a3b8' }}>
              <div style={{ width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Loading activity…
            </div>
          ) : (
            <>
              <SectionCard title={`Appointments & Sessions (${related.appointments.length})`} icon="📅">
                {!related.appointments.length ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>No appointments or sessions found.</p>
                  : related.appointments.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.status === 'completed' ? '#16a34a' : a.status === 'cancelled' ? '#dc2626' : '#d97706', marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                        {a._type}{a.doctorName ? ` · Dr. ${a.doctorName}` : ''}{a.therapistName ? ` · ${a.therapistName}` : ''}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                        {a.date || fmtShort(a.scheduledAt)}{a.time ? ` · ${a.time}` : ''} · {a.consultationType || a.sessionType || '—'} · {a.reason || a.chiefComplaint || '—'}
                      </p>
                    </div>
                    <span style={{ padding: '0.2rem 0.65rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: a.status === 'completed' ? '#f0fdf4' : a.status === 'cancelled' ? '#fff1f2' : '#fff7ed', color: a.status === 'completed' ? '#16a34a' : a.status === 'cancelled' ? '#dc2626' : '#d97706', border: `1px solid ${a.status === 'completed' ? '#bbf7d0' : a.status === 'cancelled' ? '#fecdd3' : '#fed7aa'}` }}>
                      {a.status || 'scheduled'}
                    </span>
                  </div>
                ))}
              </SectionCard>

              {/* Therapy clients have no prescriptions — that card belongs to the
                  medical side only. They get clinical notes instead. */}
              {col === 'clients' && (
                <SectionCard title={`Clinical Notes (${related.notes.length})`} icon="📝">
                  {!related.notes.length ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>No clinical notes recorded.</p>
                    : related.notes.map(n => (
                    <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0891b2', marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                          {n.title || n.noteType || 'Session note'}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                          {n.therapistName || '—'} · {fmtShort(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </SectionCard>
              )}

              {(col === 'auth' || col === 'doctors') && (
                <SectionCard title={`Prescriptions (${related.prescriptions.length})`} icon="💊">
                  {!related.prescriptions.length ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>No prescriptions found.</p>
                    : related.prescriptions.map(rx => (
                    <div key={rx.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                          {rx.medications?.[0]?.name || rx.medication || 'Prescription'}
                          {rx.medications?.length > 1 ? ` +${rx.medications.length - 1} more` : ''}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                          {rx.diagnosis || '—'} · Dr. {rx.doctorName || '—'} · {fmtShort(rx.createdAt)}
                        </p>
                      </div>
                      <span style={{ padding: '0.2rem 0.65rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: rx.status === 'active' ? '#f0fdf4' : '#f8fafc', color: rx.status === 'active' ? '#16a34a' : '#64748b', border: `1px solid ${rx.status === 'active' ? '#bbf7d0' : '#e2e8f0'}` }}>
                        {rx.status || 'active'}
                      </span>
                    </div>
                  ))}
                </SectionCard>
              )}

              {related.diagnostics.length > 0 && (
                <SectionCard title={`Diagnostic Orders (${related.diagnostics.length})`} icon="🔬">
                  {related.diagnostics.map(o => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>{o.testType || o.testName || 'Diagnostic Order'} — {o.centerType?.toUpperCase() || ''}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' }}>{o.centerName || '—'} · {fmtShort(o.createdAt)}</p>
                      </div>
                      <span style={{ padding: '0.2rem 0.65rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff' }}>{o.status || '—'}</span>
                    </div>
                  ))}
                </SectionCard>
              )}

              <button className="btn btn-ghost btn-sm" onClick={() => { setRelatedLoaded(false); loadRelated(); }}>↻ Reload</button>
            </>
          )}
        </div>
      )}

      {/* ── Raw Data tab ── */}
      {activeTab === 'raw' && (
        <SectionCard title={`All Firestore Fields — ${col}/${userId}`} icon="🗂️">
          <p style={{ margin: '0 0 0.85rem', fontSize: '0.78rem', color: '#94a3b8' }}>Every field stored in the Firestore document. Read-only super admin view.</p>
          {allFields.map(([key, val]) => {
            const display = typeof val === 'object' && val !== null
              ? (val.seconds ? fmtDate(val) : JSON.stringify(val, null, 2))
              : String(val ?? '—');
            return (
              <div key={key} style={{ display: 'flex', borderBottom: '1px solid #f8fafc', padding: '0.4rem 0', gap: '1rem', alignItems: 'flex-start' }}>
                <span style={{ minWidth: 190, fontSize: '0.75rem', fontWeight: 700, color: '#64748b', fontFamily: 'monospace', flexShrink: 0 }}>{key}</span>
                <span style={{ fontSize: '0.8rem', color: '#0f172a', fontFamily: typeof val === 'object' ? 'monospace' : undefined, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{display}</span>
              </div>
            );
          })}
        </SectionCard>
      )}

      {pwModal.open ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          role="dialog"
          aria-modal="true"
          onClick={() => closePwModal(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 460,
              width: '100%',
              padding: '1.35rem',
              boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              {pwModal.generatedPassword ? 'One-time password' : 'Reset password'}
            </h3>
            {pwModal.generatedPassword ? (
              <>
                <p style={{ margin: '0 0 1rem', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.55 }}>
                  Hand off over a secure channel. Closing this dialog clears it from the screen (it is not stored in the app).
                </p>
                <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: 6 }}>Temporary password</div>
                  <code style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>{pwModal.generatedPassword}</code>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 1rem', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.55 }}>
                  A strong random one-time password is generated on the server when you confirm (no email link). The user must choose a new password after signing in.
                </p>
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>After confirm</div>
                  <span style={{ fontSize: '0.84rem', color: '#64748b' }}>The password appears here once so you can copy it — not saved in the dashboard after you close.</span>
                </div>
              </>
            )}
            <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: '#94a3b8' }}>
              Target:{' '}
              {(() => {
                if (!pwModal.branch) return `${col} / ${userId}`;
                const bc = getBranchCfg();
                return `${bc?.collectionName || 'branch'} / ${pwModal.branch.branchName || pwModal.branch.id}`;
              })()}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {pwModal.generatedPassword ? (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={copyPwModalPassword}>Copy</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => closePwModal(true)}>Done</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={pwActionBusy} onClick={() => closePwModal(false)}>Cancel</button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={pwActionBusy} onClick={applyAdminPasswordReset}>
                    {pwActionBusy ? 'Applying…' : 'Confirm reset'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {branchEditModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          role="dialog"
          aria-modal="true"
          onClick={() => setBranchEditModal(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 440,
              width: '100%',
              padding: '1.25rem',
              boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Edit branch</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Branch name</span>
                <input
                  value={branchEditModal.branchName}
                  onChange={(e) => setBranchEditModal((p) => ({ ...p, branchName: e.target.value }))}
                  style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Address</span>
                <input
                  value={branchEditModal.address}
                  onChange={(e) => setBranchEditModal((p) => ({ ...p, address: e.target.value }))}
                  style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Contact</span>
                <input
                  value={branchEditModal.contact}
                  onChange={(e) => setBranchEditModal((p) => ({ ...p, contact: e.target.value }))}
                  style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBranchEditModal(null)}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveBranchEditModal}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
