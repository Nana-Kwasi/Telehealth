import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from '../../../services/authShim';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from '../../../services/firestoreShim';
import { ref, uploadBytes, getDownloadURL } from '../../../services/firestoreShim';
import { auth, db, storage } from '../../../services/firestoreShim';
import BranchOrderDetail from './BranchOrderDetail';
import GlobalReportForm from '../Common/GlobalReportForm';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import DiagnosticBranchSettings from './DiagnosticBranchSettings';
import { normalizeDiagnosticOrderStatus } from '../../../utils/diagnosticOrderStatus';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';

function diagBranchEventLabel(action, branchType) {
  const m = {
    ORDER_STARTED: 'Order started',
    ORDER_STATUS_UPDATED: 'Status updated',
    ORDER_COMPLETED: branchType === 'lab' ? 'Lab result uploaded' : 'Scan report uploaded',
    ORDER_REJECTED: 'Order rejected',
  };
  return m[action] || String(action || 'Activity').replace(/_/g, ' ');
}

function BranchOverview({ type, profile }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0, pending: 0, inProgress: 0, completed: 0, rejected: 0, weekCompleted: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const centerType = type === 'lab' ? 'lab' : 'scan';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const isBranch = profile?.role === 'lab_branch' || profile?.role === 'scan_branch';
        const pid = profile?.id || '';
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        if (isBranch) {
          const [ordersSnap, eventsSnap] = await Promise.all([
            getDocs(query(collection(db, 'diagnosticOrders'), where('branchId', '==', pid))),
            getDocs(query(collection(db, 'diagnosticBranchEvents'), where('branchId', '==', pid))),
          ]);
          if (cancelled) return;

          const rows = ordersSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((r) => (r.centerType || '') === centerType);

          let weekCompleted = 0;
          rows.forEach((r) => {
            if (normalizeDiagnosticOrderStatus(r.status) !== 'COMPLETED') return;
            const ts = r.completedAt?.seconds ? r.completedAt.seconds * 1000 : (r.updatedAt?.seconds ? r.updatedAt.seconds * 1000 : 0);
            if (ts >= weekAgo) weekCompleted += 1;
          });

          setStats({
            total: rows.length,
            pending: rows.filter((r) => normalizeDiagnosticOrderStatus(r.status) === 'PENDING').length,
            inProgress: rows.filter((r) => normalizeDiagnosticOrderStatus(r.status) === 'IN_PROGRESS').length,
            completed: rows.filter((r) => normalizeDiagnosticOrderStatus(r.status) === 'COMPLETED').length,
            rejected: rows.filter((r) => normalizeDiagnosticOrderStatus(r.status) === 'REJECTED').length,
            weekCompleted,
          });

          const sorted = [...rows].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setRecentOrders(sorted.slice(0, 6));

          const events = eventsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((e) => (e.centerType || centerType) === centerType)
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
            .slice(0, 10);
          setRecentEvents(events);
        } else {
          const snap = await getDocs(
            query(collection(db, 'diagnosticOrders'), where('centerType', '==', centerType), where('centerId', '==', pid)),
          );
          if (cancelled) return;
          const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setStats({
            total: rows.length,
            pending: rows.filter((r) => normalizeDiagnosticOrderStatus(r.status) === 'PENDING').length,
            inProgress: rows.filter((r) => normalizeDiagnosticOrderStatus(r.status) === 'IN_PROGRESS').length,
            completed: rows.filter((r) => normalizeDiagnosticOrderStatus(r.status) === 'COMPLETED').length,
            rejected: rows.filter((r) => normalizeDiagnosticOrderStatus(r.status) === 'REJECTED').length,
            weekCompleted: 0,
          });
          const sorted = [...rows].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setRecentOrders(sorted.slice(0, 6));
          setRecentEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [centerType, profile?.id, profile?.role]);

  const completionPct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
  const label = type === 'lab' ? 'Lab Branch Overview' : 'Scan Branch Overview';
  const isBranch = profile?.role === 'lab_branch' || profile?.role === 'scan_branch';

  const statusBadgeClass = (raw) => {
    const n = normalizeDiagnosticOrderStatus(raw);
    if (n === 'COMPLETED') return 'diag-branch-status diag-branch-status--done';
    if (n === 'IN_PROGRESS') return 'diag-branch-status diag-branch-status--prog';
    if (n === 'REJECTED') return 'diag-branch-status diag-branch-status--rej';
    return 'diag-branch-status diag-branch-status--pend';
  };

  const statusText = (raw) => {
    const n = normalizeDiagnosticOrderStatus(raw);
    if (n === 'COMPLETED') return 'Completed';
    if (n === 'IN_PROGRESS') return 'In progress';
    if (n === 'REJECTED') return 'Rejected';
    return 'Pending';
  };

  return (
    <div className="pharmacy-page diag-branch-overview">
      <h1 className="pharmacy-page-title">{label}</h1>
      <p className="pharmacy-page-sub">Live queue, recent orders, and branch activity.</p>
      <LocationSummaryCard
        profile={profile}
        title={isBranch ? 'Branch location' : `${type === 'lab' ? 'Lab' : 'Scan center'} location`}
        onEdit={() => navigate('/dashboard/settings')}
      />

      {loading ? (
        <p className="diag-branch-loading">Loading overview…</p>
      ) : (
        <>
      <div className="diag-branch-kpi-row">
        {[
          ['Total orders', stats.total, 'diag-branch-kpi--blue'],
          ['Pending', stats.pending, 'diag-branch-kpi--amber'],
          ['In progress', stats.inProgress, 'diag-branch-kpi--indigo'],
          ['Completed', stats.completed, 'diag-branch-kpi--green'],
        ].map(([lbl, val, cls]) => (
          <div key={lbl} className={`diag-branch-kpi ${cls}`}>
            <span className="diag-branch-kpi-label">{lbl}</span>
            <span className="diag-branch-kpi-value">{val}</span>
          </div>
        ))}
      </div>

      <div className="diag-branch-kpi-row diag-branch-kpi-row--secondary">
        <div className="diag-branch-mini">
          <span className="diag-branch-mini-label">Rejected</span>
          <span className="diag-branch-mini-value diag-branch-mini-value--muted">{stats.rejected}</span>
        </div>
        <div className="diag-branch-mini">
          <span className="diag-branch-mini-label">Completed (7 days)</span>
          <span className="diag-branch-mini-value">{stats.weekCompleted}</span>
        </div>
        <div className="diag-branch-mini diag-branch-mini--wide">
          <span className="diag-branch-mini-label">Completion rate</span>
          <span className="diag-branch-mini-value">{stats.total ? `${completionPct}%` : '—'}</span>
        </div>
      </div>

      <div className="diag-branch-actions">
        <button type="button" className="diag-branch-action-btn diag-branch-action-btn--primary" onClick={() => navigate('/dashboard/orders')}>
          Open orders queue
        </button>
        <button type="button" className="diag-branch-action-btn" onClick={() => navigate('/dashboard/settings')}>
          Branch settings
        </button>
        <button type="button" className="diag-branch-action-btn" onClick={() => navigate('/dashboard/report-issue')}>
          Report issue
        </button>
      </div>

      <div className="diag-branch-two-col">
        <section className="diag-branch-panel">
          <div className="diag-branch-panel-head">
            <h2 className="diag-branch-panel-title">Recent orders</h2>
            <button type="button" className="diag-branch-link" onClick={() => navigate('/dashboard/orders')}>View all</button>
          </div>
          {recentOrders.length === 0 ? (
            <p className="diag-branch-empty">No diagnostic orders yet.</p>
          ) : (
            <ul className="diag-branch-order-list">
              {recentOrders.map((o) => (
                <li key={o.id}>
                  <button type="button" className="diag-branch-order-card" onClick={() => navigate(`/dashboard/orders/${o.id}`)}>
                    <div className="diag-branch-order-top">
                      <span className="diag-branch-order-patient">{o.patientName || 'Patient'}</span>
                      <span className={statusBadgeClass(o.status)}>{statusText(o.status)}</span>
                    </div>
                    <div className="diag-branch-order-test">{o.testType || '—'}</div>
                    <div className="diag-branch-order-meta">
                      <span>{o.orderId || o.id.slice(0, 8)}</span>
                      <span>
                        {o.createdAt?.seconds
                          ? new Date(o.createdAt.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="diag-branch-panel">
          <div className="diag-branch-panel-head">
            <h2 className="diag-branch-panel-title">Recent activity</h2>
            <span className="diag-branch-panel-hint">Audit log at this branch</span>
          </div>
          {recentEvents.length === 0 ? (
            <p className="diag-branch-empty">No events yet — activity appears when you start orders, upload results, or change status.</p>
          ) : (
            <ul className="diag-branch-timeline">
              {recentEvents.map((e) => (
                <li key={e.id} className="diag-branch-timeline-item">
                  <span className="diag-branch-timeline-dot" aria-hidden />
                  <div className="diag-branch-timeline-body">
                    <div className="diag-branch-timeline-title">{diagBranchEventLabel(e.action, type)}</div>
                    <div className="diag-branch-timeline-meta">
                      {(e.patientName || 'Patient')} · {(e.fromStatus || '—')} → {(e.toStatus || '—')}
                    </div>
                  </div>
                  <time className="diag-branch-timeline-time">
                    {e.createdAt?.seconds
                      ? new Date(e.createdAt.seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(stats.pending > 0 || stats.inProgress > 0) ? (
        <div className="diag-branch-alert">
          <span className="diag-branch-alert-icon" aria-hidden>⏳</span>
          <div>
            <strong>Queue attention</strong>
            <p>
              {stats.pending > 0 ? `${stats.pending} pending` : ''}
              {stats.pending > 0 && stats.inProgress > 0 ? ' · ' : ''}
              {stats.inProgress > 0 ? `${stats.inProgress} in progress` : ''}
              {' — '}open Orders to verify patients and process results.
            </p>
          </div>
          <button type="button" className="diag-branch-alert-btn" onClick={() => navigate('/dashboard/orders')}>Go to orders</button>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}

function BranchOrders({ type, profile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [findings, setFindings] = useState('');
  const [techNote, setTechNote] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [idVerifyFilter, setIdVerifyFilter] = useState('');
  const centerType = type === 'lab' ? 'lab' : 'scan';

  const displayOrders = orders.filter((o) => {
    const q = idVerifyFilter.trim().toLowerCase();
    if (!q) return true;
    return (o.patientName || '').toLowerCase().includes(q);
  });

  const statusLabel = (raw) => {
    const n = normalizeDiagnosticOrderStatus(raw);
    if (n === 'COMPLETED') return 'Completed';
    if (n === 'IN_PROGRESS') return 'In progress';
    if (n === 'REJECTED') return 'Rejected';
    return 'Pending';
  };

  const logBranchEvent = async ({ action, order, fromStatus, toStatus, metadata = {} }) => {
    await addDoc(collection(db, 'diagnosticBranchEvents'), {
      centerType,
      parentId: centerType === 'lab' ? (profile?.labId || null) : (profile?.scanId || null),
      branchId: profile?.id || null,
      branchName: profile?.branchName || 'Branch',
      centerId: order?.centerId || profile?.id || null,
      centerName: order?.centerName || profile?.branchName || '',
      orderId: order?.id || null,
      orderRef: order?.orderId || null,
      patientId: order?.patientId || null,
      patientName: order?.patientName || '',
      actorId: profile?.id || null,
      actorName: profile?.branchName || 'Branch User',
      action,
      fromStatus: fromStatus || null,
      toStatus: toStatus || null,
      metadata,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  const load = async () => {
    setLoading(true);
    try {
      const isBranch = profile?.role === 'lab_branch' || profile?.role === 'scan_branch';
      const pid = profile?.id || '';
      let list;
      if (isBranch) {
        const snap = await getDocs(query(collection(db, 'diagnosticOrders'), where('branchId', '==', pid)));
        list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((o) => (o.centerType || '') === centerType);
      } else {
        const snap = await getDocs(
          query(collection(db, 'diagnosticOrders'), where('centerType', '==', centerType), where('centerId', '==', pid)),
        );
        list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [centerType, profile?.id, profile?.role]);

  useEffect(() => {
    const openId = location.state?.openUploadForId;
    if (!openId || orders.length === 0) return;
    const o = orders.find((x) => x.id === openId);
    if (o) {
      setSelected(o);
      setFindings('');
      setTechNote('');
      setAttachmentFile(null);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [orders, location.state?.openUploadForId, location.pathname, navigate]);

  const setOrderStatus = async (order, status) => {
    const prev = order.status || 'PENDING';
    await updateDoc(doc(db, 'diagnosticOrders', order.id), { status, updatedAt: serverTimestamp() });
    setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status } : o)));
    await logBranchEvent({
      action: status === 'IN_PROGRESS' ? 'ORDER_STARTED' : 'ORDER_STATUS_UPDATED',
      order,
      fromStatus: prev,
      toStatus: status,
      metadata: {},
    });
  };

  const rejectOrder = async (order) => {
    const reason = (rejectReasonDraft || '').trim();
    if (!reason) return alert('Reject reason is required.');
    const prev = order.status || 'PENDING';
    await updateDoc(doc(db, 'diagnosticOrders', order.id), {
      status: 'REJECTED',
      rejectReason: reason,
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'patientTimeline'), {
      patientId: order.patientId || null,
      type: centerType === 'lab' ? 'LAB_ORDER' : 'SCAN_ORDER',
      title: `${centerType === 'lab' ? 'Lab' : 'Scan'} order could not be completed`,
      status: 'REJECTED',
      relatedId: order.orderId || order.id,
      actor: { role: centerType === 'lab' ? 'LAB_BRANCH' : 'SCAN_BRANCH', name: profile?.branchName || 'Branch' },
      note: reason,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    await logBranchEvent({
      action: 'ORDER_REJECTED',
      order,
      fromStatus: prev,
      toStatus: 'REJECTED',
      metadata: { rejectReason: reason },
    });
    setRejecting(null);
    setRejectReasonDraft('');
    await load();
  };

  const completeOrder = async () => {
    if (!selected) return;
    if (!attachmentFile) return alert('Please attach a result file (PDF or image).');
    setSaving(true);
    try {
      const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `diagnostic-results/${selected.id}/${Date.now()}_${safeName}`;
      const sref = ref(storage, storagePath);
      await uploadBytes(sref, attachmentFile);
      const fileUrl = await getDownloadURL(sref);

      const resultRef = `RES-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      await addDoc(collection(db, 'diagnosticResults'), {
        orderId: selected.id,
        resultRef,
        doctorId: selected.doctorId || null,
        doctorName: selected.doctorName || 'Doctor',
        patientId: selected.patientId || null,
        patientName: selected.patientName || 'Patient',
        centerId: selected.centerId || profile?.id || null,
        centerName: selected.centerName || profile?.branchName || '',
        type: centerType,
        testType: selected.testType || '',
        findings: findings.trim() || null,
        notes: findings.trim() || null,
        techNote: techNote.trim() || null,
        fileUrl,
        fileName: attachmentFile.name,
        uploadedBy: profile?.id || null,
        status: 'COMPLETED',
        uploadedAt: serverTimestamp(),
      });
      const prev = selected.status || 'PENDING';
      await updateDoc(doc(db, 'diagnosticOrders', selected.id), {
        status: 'COMPLETED',
        resultFileUrl: fileUrl,
        resultFileName: attachmentFile.name,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'patientTimeline'), {
        patientId: selected.patientId || null,
        type: centerType === 'lab' ? 'LAB_RESULT' : 'SCAN_RESULT',
        title: `${centerType === 'lab' ? 'Lab' : 'Scan'} result uploaded: ${selected.testType || 'Diagnostic test'}`,
        status: 'COMPLETED',
        relatedId: selected.orderId || selected.id,
        actor: { role: centerType === 'lab' ? 'LAB_BRANCH' : 'SCAN_BRANCH', name: profile?.branchName || 'Branch' },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      await logBranchEvent({
        action: 'ORDER_COMPLETED',
        order: selected,
        fromStatus: prev,
        toStatus: 'COMPLETED',
        metadata: { hasFileUrl: true },
      });
      setSelected(null);
      setFindings('');
      setTechNote('');
      setAttachmentFile(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">{type === 'lab' ? 'Lab Branch Queue' : 'Scan Branch Queue'}</h1>
      <p className="pharmacy-page-sub">Process assigned diagnostic orders and upload final results.</p>
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem 1.1rem', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 6 }}>Verify walk-in patient</div>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
          Ask for their National ID and enter the name exactly as printed on the card. The table below filters to matching orders so you can confirm identity before starting the test.
        </p>
        <input
          type="text"
          value={idVerifyFilter}
          onChange={(e) => setIdVerifyFilter(e.target.value)}
          placeholder="Name as on National ID"
          style={{ width: '100%', maxWidth: 400, padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
        />
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
        {loading ? <p>Loading queue…</p> : orders.length === 0 ? <p style={{ color: '#64748b' }}>No orders assigned to this branch yet.</p> : displayOrders.length === 0 ? (
          <p style={{ color: '#64748b' }}>No orders match that name. Check spelling against the National ID.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Test</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(o => {
                const ns = normalizeDiagnosticOrderStatus(o.status);
                return (
                <tr key={o.id}>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.15rem 0.35rem', fontWeight: 700, color: '#1d4ed8' }}
                      onClick={() => navigate(`/dashboard/orders/${o.id}`)}
                    >
                      {o.orderId || o.id.slice(0, 8)}
                    </button>
                  </td>
                  <td>{o.patientName || '—'}</td>
                  <td>{o.doctorName || '—'}</td>
                  <td>{o.testType || '—'}</td>
                  <td>{statusLabel(o.status)}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ns === 'PENDING' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setOrderStatus(o, 'IN_PROGRESS')}>Start</button>
                    )}
                    {!['COMPLETED', 'REJECTED'].includes(ns) && (
                      <button className="btn btn-primary btn-sm" onClick={() => { setSelected(o); setFindings(''); setTechNote(''); setAttachmentFile(null); }}>Upload Result</button>
                    )}
                    {!['COMPLETED', 'REJECTED'].includes(ns) && (
                      <button className="btn btn-danger btn-sm" onClick={() => { setRejecting(o.id); setRejectReasonDraft(o.rejectReason || ''); }}>Reject</button>
                    )}
                  </td>
                </tr>
              );
              })}
              {orders.map(o => (
                rejecting === o.id ? (
                  <tr key={`${o.id}-reject`}>
                    <td colSpan={6}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '0.55rem 0.65rem' }}>
                        <input
                          value={rejectReasonDraft}
                          onChange={e => setRejectReasonDraft(e.target.value)}
                          placeholder="Reject reason (required)"
                          style={{ flex: 1, padding: '0.45rem 0.55rem', border: '1px solid #fda4af', borderRadius: 6 }}
                        />
                        <button className="btn btn-danger btn-sm" onClick={() => rejectOrder(o)}>Confirm Reject</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setRejecting(null); setRejectReasonDraft(''); }}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : null
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="admin-modal-overlay" onClick={() => { setSelected(null); setAttachmentFile(null); }}>
          <div className="admin-modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Upload {type === 'lab' ? 'Lab Result' : 'Scan Report'}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setAttachmentFile(null); }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Patient: <b>{selected.patientName || '—'}</b> · Test: <b>{selected.testType || '—'}</b>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.78rem', fontWeight: 700 }}>
                  Result file <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  style={{ width: '100%', fontSize: '0.84rem' }}
                />
                {attachmentFile ? (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>Selected: {attachmentFile.name}</p>
                ) : (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>PDF or image (required).</p>
                )}
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.78rem', fontWeight: 700 }}>Findings (optional)</label>
                <textarea rows={6} value={findings} onChange={e => setFindings(e.target.value)} placeholder="Summary text if not fully covered by the file…" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '0.55rem', fontSize: '0.84rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.78rem', fontWeight: 700 }}>Technician Note (optional)</label>
                <textarea rows={3} value={techNote} onChange={e => setTechNote(e.target.value)} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '0.55rem', fontSize: '0.84rem' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setSelected(null); setAttachmentFile(null); }}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={completeOrder} disabled={saving || !attachmentFile}>
                  {saving ? 'Saving…' : 'Complete & Publish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiagnosticBranchDashboard({ profile, type = 'lab' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [parentOrgName, setParentOrgName] = useState('');
  useEffect(() => {
    const parentId = type === 'lab' ? profile?.labId : profile?.scanId;
    if (!parentId) return;
    const col = type === 'lab' ? 'labs' : 'scanCenters';
    (async () => {
      const snap = await getDoc(doc(db, col, parentId));
      if (!snap.exists()) return;
      const d = snap.data();
      const nm = type === 'lab' ? (d.labName || d.name || '') : (d.centerName || d.name || '');
      setParentOrgName(nm || '');
    })();
  }, [type, profile?.labId, profile?.scanId]);

  const nav = [
    { path: '/dashboard', label: 'Overview', icon: '📊' },
    { path: '/dashboard/orders', label: 'Orders', icon: '📋' },
    { path: '/dashboard/report-issue', label: 'Report Issue', icon: '📩' },
    { path: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  ];
  const isActive = (path) => (path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path));
  const logout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };

  return (
    <div className="pharmacy-dashboard">
      <aside className="pharmacy-sidebar">
        <div className="pharmacy-sidebar-header">
          <div className="pharmacy-logo">
            <span>{type === 'lab' ? '🧪' : '🩻'}</span>
            <h2>NessaHub</h2>
            <span className="pharmacy-logo-badge">{type === 'lab' ? 'Lab Branch' : 'Scan Branch'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="pharmacy-avatar">{(profile?.branchName || 'B')[0].toUpperCase()}</div>
            <div>
              <p className="pharmacy-user-name">{profile?.branchName || 'Branch'}</p>
              {parentOrgName ? (
                <p className="pharmacy-user-role" style={{ fontWeight: 700, color: '#e0f2fe' }}>{parentOrgName}</p>
              ) : null}
              <p className="pharmacy-user-role">{type === 'lab' ? 'Lab' : 'Scan'} branch</p>
              <SidebarSavedLocation profile={profile} />
            </div>
          </div>
        </div>
        <nav className="pharmacy-nav">
          <div className="pharmacy-nav-section">
            <h3>Navigation</h3>
            <ul className="pharmacy-nav-list">
              {nav.map(item => (
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
          <button className="pharmacy-logout-btn" onClick={logout}>🚪 Logout</button>
        </div>
      </aside>
      <main className="pharmacy-main">
        <ForcedPasswordChangeOverlay
          profile={profile}
          firestoreCollection={type === 'lab' ? 'labBranches' : 'scanBranches'}
        />
        <Routes>
          <Route path="/" element={<BranchOverview type={type} profile={profile} />} />
          <Route path="/orders/:orderId" element={<BranchOrderDetail type={type} />} />
          <Route path="/orders" element={<BranchOrders type={type} profile={profile} />} />
          <Route path="/report-issue" element={<GlobalReportForm profile={profile} reporterType={type === 'lab' ? 'lab_branch' : 'scan_branch'} />} />
          <Route path="/settings" element={<DiagnosticBranchSettings type={type} profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
