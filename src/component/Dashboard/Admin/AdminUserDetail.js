import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../../Auth/firebaseConfig';
import {
  doc, getDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { logAction, A } from '../../../utils/auditLogger';

const EDITABLE_FIELDS = {
  auth:        ['name', 'email', 'phone', 'nationalId', 'ghanaCard', 'dateOfBirth', 'gender', 'address', 'bloodGroup'],
  clients:     ['name', 'email', 'phone', 'dateOfBirth', 'gender', 'address'],
  doctors:     ['name', 'email', 'phone', 'specialization', 'licenseNumber', 'consultationFee', 'yearsExperience', 'bio'],
  therapists:  ['name', 'email', 'phone', 'specialties', 'licenseNumber', 'consultationFee', 'yearsExperience', 'bio'],
  pharmacies:  ['pharmacyName', 'email', 'phone', 'address', 'country', 'businessReg'],
  labs:        ['labName', 'email', 'phone', 'address', 'country'],
  scanCenters: ['scanCenterName', 'email', 'phone', 'address', 'country'],
};

const COL_LABELS = {
  auth: 'Medical Patient', clients: 'Therapy Client', doctors: 'Doctor',
  therapists: 'Therapist', pharmacies: 'Pharmacy', labs: 'Lab Center', scanCenters: 'Scan Center',
};

const COL_COLORS = {
  auth: { bg: 'linear-gradient(135deg, #1e3a5f, #0f172a)', accent: '#60a5fa' },
  clients: { bg: 'linear-gradient(135deg, #3b0764, #1e1b4b)', accent: '#a78bfa' },
  doctors: { bg: 'linear-gradient(135deg, #14532d, #0f172a)', accent: '#4ade80' },
  therapists: { bg: 'linear-gradient(135deg, #312e81, #1e1b4b)', accent: '#818cf8' },
  pharmacies: { bg: 'linear-gradient(135deg, #7c2d12, #1c1917)', accent: '#fb923c' },
  labs: { bg: 'linear-gradient(135deg, #064e3b, #0f172a)', accent: '#34d399' },
  scanCenters: { bg: 'linear-gradient(135deg, #4c1d95, #1e1b4b)', accent: '#c084fc' },
};

const FIELD_LABELS = {
  name: 'Full Name', email: 'Email', phone: 'Phone', nationalId: 'National ID',
  ghanaCard: 'Ghana Card', dateOfBirth: 'Date of Birth', gender: 'Gender', address: 'Address',
  bloodGroup: 'Blood Group', specialization: 'Specialization', specialties: 'Specialties',
  licenseNumber: 'License Number', consultationFee: 'Consultation Fee', yearsExperience: 'Years Exp.',
  bio: 'Bio', pharmacyName: 'Pharmacy Name', labName: 'Lab Name', scanCenterName: 'Center Name',
  country: 'Country', businessReg: 'Business Reg.', status: 'Status',
};

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
  const [pwReset, setPwReset]     = useState({ sent: false, sending: false, error: '' });
  const [related, setRelated]     = useState({ appointments: [], prescriptions: [], diagnostics: [] });
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
        const data = { id: snap.id, ...snap.data() };
        setUser(data);
        setEditForm(data);
        setRoleType(col === 'auth' ? 'Medical Patient' : col === 'clients' ? 'Therapy Client' : COL_LABELS[col] || col);
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
      if (col === 'auth' || col === 'clients') {
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
      await updateDoc(doc(db, col, userId), payload);
      await logAction(A.ADMIN_USER_EDITED, { targetId: userId, collection: col, fields: fields.join(',') }, 'admin');
      setUser(prev => ({ ...prev, ...editForm }));
      showFeedback('success', 'Profile updated successfully.');
    } catch (e) {
      showFeedback('error', 'Failed to save: ' + e.message);
    } finally { setSaving(false); }
  };

  const changeStatus = async (status) => {
    if (!window.confirm(`Set status to "${status}"?`)) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, col, userId), { status, statusUpdatedAt: serverTimestamp() });
      await logAction(A.ADMIN_USER_STATUS, { targetId: userId, collection: col, newStatus: status }, 'admin');
      setUser(prev => ({ ...prev, status }));
      showFeedback('success', `Status changed to ${status}.`);
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

  const sendPasswordReset = async () => {
    const email = user?.email;
    if (!email) { showFeedback('error', 'No email address on this account.'); return; }
    setPwReset({ sent: false, sending: true, error: '' });
    try {
      await sendPasswordResetEmail(auth, email);
      await logAction(A.PASSWORD_RESET_SENT, { targetId: userId, email }, 'admin');
      setPwReset({ sent: true, sending: false, error: '' });
      showFeedback('success', `Password reset sent to ${email}.`);
    } catch (e) {
      setPwReset({ sent: false, sending: false, error: e.message });
      showFeedback('error', 'Reset failed: ' + e.message);
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

  const resetBranchPassword = async (branch) => {
    const cfg = getBranchCfg();
    if (!cfg) return;
    if (!branch.email) return showFeedback('error', 'Branch email missing.');
    await sendPasswordResetEmail(auth, branch.email);
    await updateDoc(doc(db, cfg.collectionName, branch.id), {
      mustChangePassword: true,
      updatedAt: serverTimestamp(),
    });
    showFeedback('success', `Password reset email sent to ${branch.email}.`);
  };

  const getName  = u => u?.name || u?.pharmacyName || u?.labName || u?.scanCenterName || u?.centerName || u?.displayName || u?.email || '—';
  const fmtDate  = ts => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : (typeof ts === 'string' ? ts : '—');
  const fmtShort = ts => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (typeof ts === 'string' ? ts?.slice(0, 10) : '—');

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

  const status = user.status || 'active';
  const statusBadge = status === 'active' ? { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }
    : status === 'suspended' ? { bg: '#fff1f2', color: '#dc2626', border: '#fecdd3' }
    : { bg: '#fff7ed', color: '#d97706', border: '#fed7aa' };

  const editableFields = EDITABLE_FIELDS[col] || [];
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
              { label: 'Joined', val: fmtShort(user.createdAt) },
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
          <button disabled={pwReset.sending} onClick={sendPasswordReset}
            style={{ padding: '0.45rem 1rem', borderRadius: 8, border: '1px solid #fcd34d50', background: '#fcd34d15', color: '#fbbf24', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            {pwReset.sending ? 'Sending…' : '🔑 Reset Password'}
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
          {status !== 'active' && (
            <button disabled={saving} onClick={() => changeStatus('active')}
              style={{ padding: '0.45rem 1rem', borderRadius: 8, border: '1px solid #4ade8040', background: '#4ade8015', color: '#4ade80', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              ✓ Activate
            </button>
          )}
          {status === 'active' && (
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
            <InfoRow label="Address"      value={user.address} />
            <InfoRow label="Country"      value={user.country || user.location?.country} />
            <InfoRow label="City"         value={user.city || user.location?.city} />
          </SectionCard>

          <SectionCard title="Account & Platform" icon="⚙️">
            <InfoRow label="Firebase UID"  value={user.uid || userId} mono />
            <InfoRow label="Firestore ID"  value={userId} mono />
            <InfoRow label="Collection"    value={col} />
            <InfoRow label="Role / Type"   value={user.role || roleType} />
            <InfoRow label="Status"        value={status} />
            <InfoRow label="Username"      value={user.username} />
            <InfoRow label="Joined"        value={fmtDate(user.createdAt)} />
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
                {field === 'bio' ? (
                  <textarea rows={3} value={editForm[field] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical', gridColumn: '1 / -1' }} />
                ) : (
                  <input value={editForm[field] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                )}
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#374151', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</label>
              <select value={editForm.status || 'active'} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', background: '#fff', boxSizing: 'border-box' }}>
                {['active', 'suspended', 'pending', 'inactive', 'rejected'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-primary" disabled={saving} onClick={saveEdits}>{saving ? 'Saving…' : '💾 Save All Changes'}</button>
            <button className="btn btn-ghost" onClick={() => { setEditForm(user); setActiveTab('profile'); }}>Cancel</button>
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

              {(col === 'auth' || col === 'clients' || col === 'doctors') && (
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
