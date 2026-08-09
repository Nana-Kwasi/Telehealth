import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from '../../../services/firestoreShim';
import { db } from '../../../services/firestoreShim';
import { getDoctorDisplayName } from '../../../utils/doctorDisplayName';

function fmtTs(ts) {
  if (!ts?.seconds) return '—';
  return new Date(ts.seconds * 1000).toLocaleString();
}

export default function BranchOrderDetail({ type }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [doctorLabel, setDoctorLabel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orderId) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'diagnosticOrders', orderId));
        if (cancelled) return;
        if (snap.exists()) setOrder({ id: snap.id, ...snap.data() });
        else setOrder(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    if (!order?.doctorId) {
      setDoctorLabel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const label = await getDoctorDisplayName(db, order.doctorId, [order.doctorName]);
      if (!cancelled) setDoctorLabel(label);
    })();
    return () => { cancelled = true; };
  }, [order?.doctorId, order?.doctorName]);

  const centerType = type === 'lab' ? 'lab' : 'scan';

  const openUpload = () => {
    if (!order?.id) return;
    navigate('/dashboard/orders', { state: { openUploadForId: order.id } });
  };

  const norm = (s) => String(s || '').toUpperCase();
  const st = norm(order?.status);
  const canUpload = order && !['COMPLETED', 'REJECTED'].includes(st);

  if (loading) {
    return (
      <div className="pharmacy-page">
        <p style={{ color: '#64748b' }}>Loading order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="pharmacy-page">
        <p style={{ color: '#64748b' }}>Order not found.</p>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard/orders')}>← Back to queue</button>
      </div>
    );
  }

  if ((order.centerType || '') !== centerType) {
    return (
      <div className="pharmacy-page">
        <p style={{ color: '#b91c1c' }}>This order does not belong to this branch type.</p>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard/orders')}>← Back to queue</button>
      </div>
    );
  }

  const rows = [
    ['Order reference', order.orderId || order.id],
    ['Patient', order.patientName || '—'],
    ['Patient ID', order.patientId || '—'],
    ['Doctor', doctorLabel || order.doctorName || '—'],
    ['Test / scan type', order.testType || '—'],
    ['Center (org)', order.centerName || '—'],
    ['Branch', order.branchName || '—'],
    ['Clinical notes (from doctor)', order.notes ? order.notes : '—'],
    ['Status', order.status || 'pending'],
    ['Created', fmtTs(order.createdAt)],
    ['Updated', fmtTs(order.updatedAt)],
    ...(order.rejectReason ? [['Reject reason', order.rejectReason]] : []),
  ];

  return (
    <div className="pharmacy-page">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/orders')}>← Queue</button>
        <h1 className="pharmacy-page-title" style={{ margin: 0 }}>Order detail</h1>
      </div>
      <p className="pharmacy-page-sub">Full diagnostic order record for this branch.</p>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
        <table className="admin-table" style={{ margin: 0 }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ fontWeight: 700, color: '#64748b', width: 220, verticalAlign: 'top' }}>{k}</td>
                <td style={{ wordBreak: 'break-word' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canUpload ? (
        <button type="button" className="btn btn-primary" onClick={openUpload}>Upload result</button>
      ) : (
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>This order is closed. Use the queue for other actions.</p>
      )}
    </div>
  );
}
