import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth, db } from '../../Auth/firebaseConfig';
import { doc, updateDoc, getDocs, query, collection, where, serverTimestamp } from 'firebase/firestore';
import PharmacyWalkIn from './PharmacyWalkIn';
import './PharmacyDashboard.css';

// ── Branch Prescriptions ─────────────────────────────────────────────────────
const DRUG_STATUS_META = {
  pending:               { label: 'Pending',         icon: '⏳', color: '#f59e0b' },
  available:             { label: 'Available',        icon: '✅', color: '#16a34a' },
  not_available:         { label: 'Not Available',    icon: '❌', color: '#dc2626' },
  alternative_suggested: { label: 'Alt. Suggested',  icon: '🔁', color: '#7c3aed' },
  approved_replacement:  { label: 'Approved',         icon: '✅', color: '#16a34a' },
};

const RX_STATUS_META = {
  sent:                { label: 'Sent',        badge: 'badge-blue'   },
  accepted:            { label: 'Accepted',    badge: 'badge-green'  },
  partially_fulfilled: { label: 'Partial',     badge: 'badge-yellow' },
  ready:               { label: 'Ready',       badge: 'badge-green'  },
  delivered:           { label: 'Delivered',   badge: 'badge-gray'   },
};

function BranchPrescriptions({ profile }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [altModal, setAltModal] = useState(null);
  const [altText, setAltText] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      // Branch sees ONLY prescriptions routed to its branchId
      const snap = await getDocs(query(
        collection(db, 'doctorPrescriptions'),
        where('branchId', '==', profile.id)
      ));
      const list = snap.docs.map(d => {
        const data = d.data();
        const medications = (data.medications || []).map(m => ({ ...m, drugStatus: m.drugStatus || 'pending' }));
        return { id: d.id, ...data, medications };
      });
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(list);
    } catch (e) {
      console.error('BranchPrescriptions load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateDrugStatus = async (rx, medIndex, newStatus) => {
    setSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: newStatus } : m
      );
      const statuses = updatedMeds.map(m => m.drugStatus);
      let rxStatus = 'accepted';
      if (statuses.every(s => s === 'available' || s === 'approved_replacement')) rxStatus = 'ready';
      else if (statuses.some(s => s === 'not_available' || s === 'alternative_suggested')) rxStatus = 'partially_fulfilled';

      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        medications: updatedMeds,
        pharmacyStatus: rxStatus,
        updatedAt: serverTimestamp(),
      });
      const updated = { ...rx, medications: updatedMeds, pharmacyStatus: rxStatus };
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? updated : r));
      if (selected?.id === rx.id) setSelected(updated);
    } catch { alert('Failed to update. Try again.'); }
    finally { setSaving(false); }
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
        medications: updatedMeds, pharmacyStatus: 'partially_fulfilled', updatedAt: serverTimestamp(),
      });
      const updated = { ...rx, medications: updatedMeds, pharmacyStatus: 'partially_fulfilled' };
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? updated : r));
      if (selected?.id === rx.id) setSelected(updated);
      setAltModal(null); setAltText('');
    } catch { alert('Failed to suggest alternative.'); }
    finally { setSaving(false); }
  };

  const markDelivered = async (rx) => {
    if (!window.confirm('Mark this prescription as delivered?')) return;
    try {
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), { pharmacyStatus: 'delivered', deliveredAt: serverTimestamp() });
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? { ...r, pharmacyStatus: 'delivered' } : r));
      setSelected(null);
    } catch { alert('Failed to mark delivered.'); }
  };

  const sm = (rx) => RX_STATUS_META[rx.pharmacyStatus] || RX_STATUS_META.sent;

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">Incoming Prescriptions</h1>
      <p className="pharmacy-page-sub">Showing prescriptions routed to <b>{profile?.branchName || 'this branch'}</b> only.</p>

      {loading ? (
        <div style={{ color: '#64748b' }}>Loading…</div>
      ) : prescriptions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px solid #e0f2fe' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💊</div>
          <p>No prescriptions assigned to this branch yet.</p>
        </div>
      ) : (
        <div className="rx-list">
          {prescriptions.map(rx => (
            <div key={rx.id} className="rx-card" onClick={() => setSelected(rx)}>
              <div className="rx-card-header">
                <div>
                  <div className="rx-patient">{rx.patientName || 'Patient'}</div>
                  <div className="rx-doctor">Dr. {rx.doctorName || '—'} · {rx.diagnosis || '—'}</div>
                  {rx.prescriptionRef && (
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>Ref: {rx.prescriptionRef}</div>
                  )}
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
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                📅 {rx.date || '—'} · {(rx.medications || []).length} drug(s)
              </div>
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
                {selected.prescriptionRef && <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>Ref: <b>{selected.prescriptionRef}</b></p>}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', color: '#64748b' }}>✕ Close</button>
            </div>

            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>Mark each drug's availability</h3>

            {(selected.medications || []).map((med, i) => {
              const ds = DRUG_STATUS_META[med.drugStatus] || DRUG_STATUS_META.pending;
              return (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', marginBottom: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div>
                      <b style={{ fontSize: '0.9rem' }}>{med.name}</b>
                      {med.strength && <span style={{ fontSize: '0.78rem', color: '#64748b' }}> ({med.strength})</span>}
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{med.drugForm} · {med.dosage} · {med.frequency}</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: ds.color, background: `${ds.color}15`, padding: '3px 8px', borderRadius: 20 }}>
                      {ds.icon} {ds.label}
                    </span>
                  </div>
                  {med.alternativeSuggested && (
                    <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#7c3aed', marginBottom: '0.5rem' }}>
                      🔁 Alternative: <b>{med.alternativeSuggested}</b>
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

            {selected.pharmacyStatus === 'ready' && (
              <button onClick={() => markDelivered(selected)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 10, background: '#0c4a6e', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                ✅ Mark as Delivered
              </button>
            )}
          </div>
        </div>
      )}

      {/* Alternative suggestion modal */}
      {altModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 0.5rem', fontWeight: 800, color: '#0f172a' }}>Suggest Alternative Drug</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#64748b' }}>Name the alternative. It goes to the doctor for approval before dispensing.</p>
            <input placeholder="e.g. Amoxicillin 500mg (generic)" value={altText} onChange={e => setAltText(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem', marginBottom: '1rem', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setAltModal(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: 8, background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 600, cursor: 'pointer', color: '#64748b' }}>Cancel</button>
              <button onClick={suggestAlternative} disabled={saving || !altText.trim()}
                style={{ flex: 2, padding: '0.6rem', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', opacity: !altText.trim() ? 0.5 : 1 }}>
                {saving ? 'Sending…' : '🔁 Submit Alternative'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Branch Overview ──────────────────────────────────────────────────────────
function BranchOverview({ profile }) {
  const [stats, setStats] = useState({ incoming: 0, active: 0, ready: 0, delivered: 0 });

  useEffect(() => {
    getDocs(query(collection(db, 'doctorPrescriptions'), where('branchId', '==', profile.id)))
      .then(snap => {
        const list = snap.docs.map(d => d.data());
        setStats({
          incoming:  list.filter(r => !r.pharmacyStatus || r.pharmacyStatus === 'sent').length,
          active:    list.filter(r => ['accepted', 'partially_fulfilled'].includes(r.pharmacyStatus)).length,
          ready:     list.filter(r => r.pharmacyStatus === 'ready').length,
          delivered: list.filter(r => r.pharmacyStatus === 'delivered').length,
        });
      }).catch(() => {});
  }, [profile.id]);

  const CARDS = [
    { label: 'Incoming',  value: stats.incoming,  icon: '📥', color: '#a16207' },
    { label: 'Active',    value: stats.active,    icon: '⚡', color: '#0369a1' },
    { label: 'Ready',     value: stats.ready,     icon: '✅', color: '#15803d' },
    { label: 'Delivered', value: stats.delivered, icon: '📦', color: '#475569' },
  ];

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">Branch Dashboard</h1>
      <p className="pharmacy-page-sub">{profile?.branchName} · {profile?.pharmacyName}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
        {CARDS.map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 12, padding: '1.25rem', border: '1px solid #e0f2fe' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{c.icon}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Branch Dashboard Shell ───────────────────────────────────────────────────
const NAV = [
  { path: '/dashboard',              label: 'Overview',      icon: '📊' },
  { path: '/dashboard/prescriptions',label: 'Prescriptions', icon: '💊' },
  { path: '/dashboard/walkin',       label: 'Walk-in',       icon: '🔍' },
];

export default function BranchDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [mustChange, setMustChange] = useState(profile?.mustChangePassword === true);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const handleLogout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };
  const isActive = (p) => p === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(p);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    if (newPw === oldPw) { setPwError('New password must differ from the current one.'); return; }
    setPwSaving(true);
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, oldPw));
      await updatePassword(user, newPw);
      await updateDoc(doc(db, 'pharmacyBranches', profile.id), { mustChangePassword: false });
      setMustChange(false);
    } catch (err) {
      setPwError(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.' : 'Failed to update password. Try again.');
    } finally { setPwSaving(false); }
  };

  return (
    <div className="pharmacy-dashboard">
      <aside className="pharmacy-sidebar">
        <div className="pharmacy-sidebar-header">
          <div className="pharmacy-logo">
            <span>🏪</span>
            <h2>NessaHub</h2>
            <span className="pharmacy-logo-badge">Branch</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="pharmacy-avatar">{(profile?.branchName || 'B')[0].toUpperCase()}</div>
            <div>
              <p className="pharmacy-user-name">{profile?.branchName || 'Branch'}</p>
              <p className="pharmacy-user-role">{profile?.pharmacyName || 'Pharmacy'}</p>
            </div>
          </div>
        </div>
        <nav className="pharmacy-nav">
          <div className="pharmacy-nav-section">
            <h3>Navigation</h3>
            <ul className="pharmacy-nav-list">
              {NAV.map(item => (
                <li key={item.path}>
                  <button className={`pharmacy-nav-item ${isActive(item.path) ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                    <span>{item.icon}</span><span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="pharmacy-sidebar-footer">
          <button className="pharmacy-logout-btn" onClick={handleLogout}>🚪 Logout</button>
        </div>
      </aside>

      <main className="pharmacy-main">
        {mustChange && (
          <div className="force-pw-overlay">
            <div className="force-pw-card">
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔐</div>
              <h2 className="force-pw-title">Password Reset Required</h2>
              <p className="force-pw-sub">Set a new password before accessing your branch dashboard.</p>
              {pwError && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '0.65rem', color: '#be123c', fontSize: '0.83rem', marginBottom: '1rem' }}>🚨 {pwError}</div>}
              <form onSubmit={handleChangePassword}>
                {[['Current (Temporary) Password', oldPw, setOldPw], ['New Password', newPw, setNewPw], ['Confirm New Password', confirmPw, setConfirmPw]].map(([label, val, set]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '0.875rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>{label}</label>
                    <input type="password" value={val} onChange={e => set(e.target.value)} required
                      style={{ padding: '0.6rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
                  </div>
                ))}
                <button type="submit" disabled={pwSaving}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: 8, background: '#0c4a6e', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', opacity: pwSaving ? 0.7 : 1 }}>
                  {pwSaving ? 'Saving…' : 'Set New Password & Continue'}
                </button>
              </form>
              <button onClick={handleLogout} style={{ width: '100%', marginTop: '0.75rem', padding: '0.55rem', borderRadius: 8, background: 'none', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.83rem', color: '#64748b', fontWeight: 600 }}>Log Out</button>
            </div>
          </div>
        )}
        <Routes>
          <Route path="/"              element={<BranchOverview      profile={profile} />} />
          <Route path="/prescriptions" element={<BranchPrescriptions profile={profile} />} />
          <Route path="/walkin"        element={<PharmacyWalkIn      profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
