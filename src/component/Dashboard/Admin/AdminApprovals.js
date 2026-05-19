import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../Auth/firebaseConfig';
import {
  collection, doc, updateDoc, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { NURSE_ACCOUNT_STATUS, NURSE_PRESENCE } from '../../../constants/homeCareConstants';

const QUEUES = [
  { key: 'pharmacies', label: 'Pharmacies', icon: '💊', col: 'pharmacies', nameField: 'pharmacyName', statusField: 'status' },
  { key: 'doctors', label: 'Doctors', icon: '🩺', col: 'doctors', nameField: 'name', statusField: 'status' },
  { key: 'therapists', label: 'Therapists', icon: '🧠', col: 'therapists', nameField: 'name', statusField: 'status' },
  { key: 'nurses', label: 'Home Care Nurses', icon: '🏠', col: 'homeCareNurses', nameField: 'fullName', statusField: 'accountStatus' },
  { key: 'labs', label: 'Lab Centers', icon: '🧪', col: 'labs', nameField: 'labName', statusField: 'status' },
  { key: 'scans', label: 'Scan Centers', icon: '🩻', col: 'scanCenters', nameField: 'scanCenterName', statusField: 'status' },
];

function rowStatus(item) {
  const field = item._statusField || 'status';
  return item[field];
}

/** Approved / live accounts — excluded from Pending tab */
function isApprovedStatus(item) {
  const s = (rowStatus(item) === undefined || rowStatus(item) === null ? '' : String(rowStatus(item))).toLowerCase().trim();
  if (item._col === 'homeCareNurses') {
    return s === 'approved' || s === 'active';
  }
  return s === 'active' || s === 'approved';
}

/** Can still approve (not yet live, not rejected) */
function needsDecision(item) {
  const s = (rowStatus(item) === undefined || rowStatus(item) === null ? '' : String(rowStatus(item))).toLowerCase().trim();
  if (s === 'rejected') return false;
  if (isApprovedStatus(item)) return false;
  return true;
}

export default function AdminApprovals() {
  const [queueData, setQueueData] = useState({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [entityTab, setEntityTab] = useState('pharmacies');
  const [listTab, setListTab] = useState('pending');
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    const unsubs = QUEUES.map((q) =>
      onSnapshot(
        collection(db, q.col),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            _col: q.col,
            _nameField: q.nameField,
            _statusField: q.statusField || 'status',
          }));
          setQueueData((prev) => ({ ...prev, [q.key]: rows }));
          setLoading(false);
        },
        (err) => console.error('Approvals snapshot', q.col, err)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const { pendingByQueue, approvedByQueue, counts } = useMemo(() => {
    const pendingByQueue = {};
    const approvedByQueue = {};
    let pendingTotal = 0;
    let approvedTotal = 0;
    QUEUES.forEach((q) => {
      const rows = queueData[q.key] || [];
      const approved = rows.filter((r) => isApprovedStatus(r));
      const pending = rows.filter((r) => !isApprovedStatus(r));
      pendingByQueue[q.key] = pending;
      approvedByQueue[q.key] = approved;
      pendingTotal += pending.length;
      approvedTotal += approved.length;
    });
    return { pendingByQueue, approvedByQueue, counts: { pendingTotal, approvedTotal } };
  }, [queueData]);

  const approve = async (item) => {
    setActing(item.id);
    try {
      if (item._col === 'homeCareNurses') {
        await updateDoc(doc(db, item._col, item.id), {
          accountStatus: NURSE_ACCOUNT_STATUS.APPROVED,
          presenceStatus: NURSE_PRESENCE.ONLINE,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, item._col, item.id), {
          status: 'active',
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (selected?.id === item.id) setSelected(null);
    } catch {
      alert('Could not approve. Try again.');
    } finally {
      setActing(null);
    }
  };

  const reject = async () => {
    if (!rejectModal) return;
    setActing(rejectModal.id);
    try {
      if (rejectModal._col === 'homeCareNurses') {
        await updateDoc(doc(db, rejectModal._col, rejectModal.id), {
          accountStatus: NURSE_ACCOUNT_STATUS.REJECTED,
          presenceStatus: NURSE_PRESENCE.OFFLINE,
          rejectedAt: serverTimestamp(),
          rejectionReason: rejectReason.trim() || 'Does not meet platform requirements',
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, rejectModal._col, rejectModal.id), {
          status: 'rejected',
          rejectedAt: serverTimestamp(),
          rejectionReason: rejectReason.trim() || 'Does not meet platform requirements',
          updatedAt: serverTimestamp(),
        });
      }
      if (selected?.id === rejectModal.id) setSelected(null);
      setRejectModal(null);
      setRejectReason('');
    } catch {
      alert('Could not reject. Try again.');
    } finally {
      setActing(null);
    }
  };

  const getName = (item) => item[item._nameField] || item.name || item.email || '—';
  const getEmail = (item) => item.email || '—';
  const getPhone = (item) => item.phone || item.phoneNumber || '—';
  const getCountry = (item) => item.country || item.location?.country || '—';
  const fmtDate = (ts) =>
    ts?.seconds
      ? new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

  const currentQ = QUEUES.find((q) => q.key === entityTab);
  const currentList =
    listTab === 'pending'
      ? pendingByQueue[entityTab] || []
      : approvedByQueue[entityTab] || [];

  const statusBadgeStyle = (item) => {
    const s = String(rowStatus(item) || 'pending').toLowerCase();
    const ok = isApprovedStatus(item);
    const rej = s === 'rejected';
    return {
      background: ok ? '#f0fdf4' : rej ? '#fff1f2' : '#fff7ed',
      color: ok ? '#16a34a' : rej ? '#dc2626' : '#d97706',
      border: `1px solid ${ok ? '#bbf7d0' : rej ? '#fecdd3' : '#fed7aa'}`,
    };
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Account Approvals</h1>
          <p className="admin-page-sub">Live queues — pending vs approved accounts (updates instantly). Includes home care nurses awaiting approval after onboard.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {counts.pendingTotal > 0 && (
            <span
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1.5px solid #fecaca',
                borderRadius: 20,
                padding: '0.3rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              {counts.pendingTotal} awaiting decision
            </span>
          )}
        </div>
      </div>

      {/* Pending | Approved */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {[
          { key: 'pending', label: 'Pending', count: counts.pendingTotal },
          { key: 'approved', label: 'Approved', count: counts.approvedTotal },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setListTab(t.key)}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: 10,
              border: listTab === t.key ? '2px solid #1d4ed8' : '1.5px solid #e2e8f0',
              background: listTab === t.key ? '#eff6ff' : '#fff',
              color: listTab === t.key ? '#1d4ed8' : '#64748b',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
            }}
          >
            {t.label}
            <span
              style={{
                marginLeft: 8,
                background: listTab === t.key ? '#dbeafe' : '#f1f5f9',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: '0.75rem',
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Entity type tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {QUEUES.map((q) => {
          const pCount = (pendingByQueue[q.key] || []).length;
          const aCount = (approvedByQueue[q.key] || []).length;
          const badge = listTab === 'pending' ? pCount : aCount;
          return (
            <button
              key={q.key}
              type="button"
              onClick={() => setEntityTab(q.key)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: entityTab === q.key ? '#1d4ed8' : '#f1f5f9',
                color: entityTab === q.key ? '#fff' : '#475569',
                transition: 'all 0.15s',
              }}
            >
              {q.icon} {q.label}
              {badge > 0 && (
                <span
                  style={{
                    background: entityTab === q.key ? 'rgba(255,255,255,0.3)' : '#e2e8f0',
                    color: entityTab === q.key ? '#fff' : '#475569',
                    borderRadius: 20,
                    padding: '1px 7px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="admin-empty">
          <p>Connecting live queues…</p>
        </div>
      ) : currentList.length === 0 ? (
        <div className="admin-table-card">
          <div className="admin-empty" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{listTab === 'pending' ? '✅' : '📋'}</div>
            <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 0.25rem' }}>
              {listTab === 'pending' ? `No pending ${currentQ?.label}` : `No approved ${currentQ?.label} yet`}
            </p>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
              {listTab === 'pending'
                ? 'New onboarding requests will appear here in real time.'
                : 'Approved accounts appear here after you activate them.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="admin-table-card">
          <div className="admin-table-header" style={{ padding: '0.9rem 1.1rem' }}>
            <p className="admin-table-title">
              {currentQ?.icon}{' '}
              {listTab === 'pending' ? 'Pending' : 'Approved'} {currentQ?.label} ({currentList.length})
            </p>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email / Phone</th>
                <th>Country</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>{getName(item)}</div>
                    {item.licenseNumber && (
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Lic: {item.licenseNumber}</div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.82rem' }}>{getEmail(item)}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{getPhone(item)}</div>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{getCountry(item)}</td>
                  <td>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: 20,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        ...statusBadgeStyle(item),
                      }}
                    >
                      {rowStatus(item) || 'pending'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{fmtDate(item.createdAt || item.submittedAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(item)}>
                        View
                      </button>
                      {listTab === 'pending' && needsDecision(item) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            disabled={acting === item.id}
                            onClick={() => approve(item)}
                          >
                            ✓ Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            disabled={acting === item.id}
                            onClick={() => {
                              setRejectModal(item);
                              setRejectReason('');
                            }}
                          >
                            ✕ Reject
                          </button>
                        </>
                      )}
                      {listTab === 'pending' && !needsDecision(item) && (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>—</span>
                      )}
                      {listTab === 'approved' && (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Live</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="admin-modal-overlay" onClick={() => setSelected(null)}>
          <div className="admin-modal admin-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">{getName(selected)} — Application Detail</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[
                ['Name', getName(selected)],
                ['Email', getEmail(selected)],
                ['Phone', getPhone(selected)],
                ['Country', getCountry(selected)],
                ['City', selected.city || selected.location?.city || '—'],
                ['Status', rowStatus(selected) || 'pending'],
                ['Submitted', fmtDate(selected.createdAt || selected.submittedAt)],
                ...(selected.licenseNumber ? [['License #', selected.licenseNumber]] : []),
                ...(selected.registrationNumber ? [['Registration #', selected.registrationNumber]] : []),
                ...(selected.specialization ? [['Specialization', selected.specialization]] : []),
                ...(selected.specialty ? [['Specialty', selected.specialty]] : []),
                ...(selected.yearsExperience ? [['Experience', `${selected.yearsExperience} years`]] : []),
                ...(selected.pharmacyName ? [['Pharmacy', selected.pharmacyName]] : []),
                ...(selected.labName ? [['Lab Name', selected.labName]] : []),
                ...(selected.testsOffered?.length ? [['Tests Offered', selected.testsOffered.join(', ')]] : []),
              ].map(([label, val]) => (
                <div key={label} className="admin-info-row">
                  <span className="admin-info-label">{label}</span>
                  <span className="admin-info-value">{val || '—'}</span>
                </div>
              ))}
            </div>

            {selected.bio && (
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: 8,
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  fontSize: '0.82rem',
                }}
              >
                <b>Bio / Description:</b> {selected.bio}
              </div>
            )}

            {selected.documents?.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>
                  Submitted Documents
                </p>
                {selected.documents.map((docu, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.4rem 0.6rem',
                      background: '#f8fafc',
                      borderRadius: 6,
                      marginBottom: 4,
                      fontSize: '0.8rem',
                    }}
                  >
                    📎 {docu.name || `Document ${i + 1}`}
                    {docu.url && (
                      <a href={docu.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', marginLeft: 'auto' }}>
                        View
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              {needsDecision(selected) && (
                <>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    disabled={acting === selected.id}
                    onClick={() => approve(selected)}
                  >
                    ✓ Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={acting === selected.id}
                    onClick={() => {
                      setRejectModal(selected);
                      setSelected(null);
                      setRejectReason('');
                    }}
                  >
                    ✕ Reject
                  </button>
                </>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="admin-modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="admin-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Reject Application</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejectModal(null)}>
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.5rem' }}>
              Rejecting: <b>{getName(rejectModal)}</b>
            </p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 0.75rem' }}>
              Provide a reason for rejection. This may be recorded for compliance purposes.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="e.g. Incomplete documentation, unverifiable license number…"
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: 8,
                border: '1.5px solid #d1d5db',
                fontSize: '0.85rem',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-danger btn-sm" onClick={reject} disabled={acting === rejectModal?.id}>
                {acting === rejectModal?.id ? 'Rejecting…' : '✕ Confirm Reject'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejectModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
