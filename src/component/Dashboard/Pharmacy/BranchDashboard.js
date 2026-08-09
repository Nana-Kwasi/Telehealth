import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { signOut, updatePassword } from '../../../services/authShim';
import { auth, db } from '../../../services/firestoreShim';
import { doc, updateDoc, getDocs, query, collection, where, serverTimestamp, orderBy, limit, onSnapshot } from '../../../services/firestoreShim';
import { PharmacyWalkInVerifyPanel } from './PharmacyWalkIn';
import BranchPrescriptionOps from './BranchPrescriptionOps';
import BranchReports from './BranchReports';
import GlobalReportForm from '../Common/GlobalReportForm';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import { buildTransferRows } from '../../../utils/pharmacyTransfers';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';
import { logPharmacyRxEvent, queuePatientRxNotification } from '../../../utils/pharmacyCollab';
import { deriveRxStockStatus } from '../../../utils/pharmacyRxStatus';
import './PharmacyDashboard.css';

function branchRxEventLabel(action) {
  const m = {
    DRUG_STATUS_UPDATED: 'Drug status updated',
    RX_ROUTED: 'Prescription routed',
    RX_ACCEPTED: 'Prescription accepted',
    TRANSFER_INITIATED: 'Transfer started',
    TRANSFER_COMPLETED: 'Transfer completed',
  };
  return m[action] || String(action || 'Event').replace(/_/g, ' ');
}

// ── Branch Prescriptions ─────────────────────────────────────────────────────
const DRUG_STATUS_META = {
  pending:               { label: 'Pending',         icon: '⏳', color: '#f59e0b' },
  available:             { label: 'Available',        icon: '✅', color: '#16a34a' },
  not_available:         { label: 'Not Available',    icon: '❌', color: '#dc2626' },
  alternative_suggested: { label: 'Alt. Suggested',  icon: '🔁', color: '#7c3aed' },
  approved_replacement:  { label: 'Approved',         icon: '✅', color: '#16a34a' },
  transferred:           { label: 'Transferred',      icon: '↔️', color: '#0369a1' },
};

const RX_STATUS_META = {
  sent:                { label: 'Sent',        badge: 'badge-blue'   },
  accepted:            { label: 'Accepted',    badge: 'badge-green'  },
  partially_fulfilled: { label: 'Partial',     badge: 'badge-yellow' },
  ready:               { label: 'Ready',       badge: 'badge-green'  },
  delivered:           { label: 'Delivered',   badge: 'badge-gray'   },
};

function BranchPrescriptions({ profile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (location.hash === '#branch-walkin-verify') {
      requestAnimationFrame(() => {
        document.getElementById('branch-walkin-verify')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [location.pathname, location.hash]);

  // A branch profile carries the parent org id as `organizationId` (and not always
  // `pharmacyId`). Without this fallback the prescription query runs with '' and the
  // branch sees nothing routed to it.
  const parentOrgId = profile?.pharmacyId || profile?.organizationId || '';

  useEffect(() => {
    const q = query(
      collection(db, 'doctorPrescriptions'),
      where('pharmacyId', '==', parentOrgId)
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => {
        const data = d.data();
        const medications = (data.medications || []).map(m => ({ ...m, drugStatus: m.drugStatus || 'pending' }));
        return { id: d.id, ...data, medications };
      });
      const visible = list.filter(rx =>
        (rx.branchId || '') === (profile.id || '') ||
        (rx.medications || []).some(m => (m.transferBranchId || '') === (profile.id || ''))
      );
      visible.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(visible);
      setLoading(false);
    }, e => {
      console.error('BranchPrescriptions load error:', e);
      setLoading(false);
    });
    return unsub;
  }, [parentOrgId, profile?.id]);

  const updateDrugStatus = async (rx, medIndex, newStatus) => {
    setSaving(true);
    try {
      const prevStatus = rx.pharmacyStatus || 'sent';
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: newStatus } : m
      );
      const rxStatus = deriveRxStockStatus(updatedMeds);

      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        medications: updatedMeds,
        pharmacyStatus: rxStatus,
        updatedAt: serverTimestamp(),
      });
      await logPharmacyRxEvent({
        rxId: rx.id,
        patientId: rx.patientId,
        pharmacyId: rx.pharmacyId || null,
        branchId: profile?.id || rx.branchId || null,
        actorId: profile?.id || null,
        actorName: profile?.branchName || 'Branch',
        actorRole: 'PHARMACY_BRANCH',
        action: 'DRUG_STATUS_UPDATED',
        fromStatus: prevStatus,
        toStatus: rxStatus,
        metadata: { medIndex, drugStatus: newStatus },
      }).catch(() => {});
      if (prevStatus !== rxStatus) {
        await queuePatientRxNotification({
          patientId: rx.patientId,
          rxId: rx.id,
          prescriptionRef: rx.prescriptionRef,
          pharmacyStatus: rxStatus,
          branchName: profile?.branchName || rx.branchName || '',
          pharmacyName: profile?.pharmacyName || rx.pharmacyName || '',
        }).catch(() => {});
      }
      const updated = { ...rx, medications: updatedMeds, pharmacyStatus: rxStatus };
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? updated : r));
    } catch { alert('Failed to update. Try again.'); }
    finally { setSaving(false); }
  };

  const sm = (rx) => RX_STATUS_META[rx.pharmacyStatus] || RX_STATUS_META.sent;

  return (
    <div className="pharmacy-page branch-prescriptions-page">
      <PharmacyWalkInVerifyPanel profile={profile} embedded />

      <h1 className="pharmacy-page-title">Incoming Prescriptions</h1>
      <p className="pharmacy-page-sub">Showing prescriptions routed to <b>{profile?.branchName || 'this branch'}</b> and transfers sent to this branch.</p>

      {loading ? (
        <div style={{ color: '#64748b' }}>Loading…</div>
      ) : prescriptions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px solid #e0f2fe' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💊</div>
          <p>No prescriptions assigned to this branch yet.</p>
        </div>
      ) : (
        <div className="rx-list">
          {prescriptions.map(rx => {
            const incomingTransferMeds = (rx.medications || []).filter(m => (m.transferBranchId || '') === (profile.id || ''));
            const isIncomingTransfer = (rx.branchId || '') !== (profile.id || '') && incomingTransferMeds.length > 0;
            const sourceBranch = incomingTransferMeds[0]?.transferFromBranchName || rx.branchName || 'Branch';
            const displayMeds = isIncomingTransfer ? incomingTransferMeds : (rx.medications || []);
            return (
            <div key={rx.id} className="rx-card" onClick={() => navigate(`/dashboard/prescriptions/${rx.id}`)}>
              <div className="rx-card-header">
                <div>
                  <div className="rx-patient">{rx.patientName || 'Patient'}</div>
                  <div className="rx-doctor">Dr. {rx.doctorName || '—'} · {rx.diagnosis || '—'}</div>
                  {rx.prescriptionRef && (
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>Ref: {rx.prescriptionRef}</div>
                  )}
                  {isIncomingTransfer && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 20, padding: '2px 8px' }}>
                        ↔ Incoming Transfer ({incomingTransferMeds.length} drug{incomingTransferMeds.length > 1 ? 's' : ''})
                      </span>
                      <div style={{ fontSize: '0.72rem', color: '#0369a1', marginTop: 3 }}>
                        From: {sourceBranch}
                      </div>
                    </div>
                  )}
                </div>
                <span className={`badge ${sm(rx).badge}`}>{sm(rx).label}</span>
              </div>
              <div className="rx-meds">
                {displayMeds.map((m, i) => {
                  const ds = DRUG_STATUS_META[m.drugStatus] || DRUG_STATUS_META.pending;
                  return (
                    <span key={i} className="rx-med-pill" style={{ background: `${ds.color}18`, color: ds.color }}>
                      {ds.icon} {m.name}
                      {m.transferOutcome === 'not_received' ? ` · Rejected by ${m.transferFailedByBranchName || 'Branch B'}` : ''}
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                📅 {rx.date || '—'} · {displayMeds.length} drug(s)
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  );
}

// ── Branch Overview ──────────────────────────────────────────────────────────
function BranchOverview({ profile }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ incoming: 0, active: 0, ready: 0, delivered: 0 });
  const [recent, setRecent] = useState([]);
  const [drugSummary, setDrugSummary] = useState({ available: 0, not_available: 0, pending: 0, alternative_suggested: 0, approved_replacement: 0, transferred: 0 });
  const [events, setEvents] = useState([]);

  // Branch profiles carry the parent org id as `organizationId` (not always
  // `pharmacyId`); fall back so the prescription stats query isn't empty.
  const parentOrgId = profile?.pharmacyId || profile?.organizationId || '';

  useEffect(() => {
    const locationMeta = profile?.locationMeta || {};
    const location = profile?.location || {};
    const country = profile?.country || locationMeta.country || location.country || '';
    const city = profile?.city || locationMeta.city || location.city || '';
    const area = profile?.area || locationMeta.area || location.area || '';
    const street = profile?.street || locationMeta.street || location.street || '';
    const composed = [area || street, city, country].filter(Boolean).join(', ');
    const raw = (profile?.address || location.address || '').trim();
    const fallback = /^[A-Z]{2}-\d{3}-\d{4}$/i.test(raw) ? '' : raw;
    const formattedAddress = composed || fallback;
    if (!profile?.id || profile?.formattedAddress || !formattedAddress) return;
    updateDoc(doc(db, 'pharmacyBranches', profile.id), {
      formattedAddress,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }, [profile]);

  useEffect(() => {
    getDocs(query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', parentOrgId)))
      .then(snap => {
        const full = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const list = full.filter(rx =>
          (rx.branchId || '') === (profile.id || '') ||
          (rx.medications || []).some(m => (m.transferBranchId || '') === (profile.id || ''))
        );
        setStats({
          incoming:  list.filter(r => !r.pharmacyStatus || r.pharmacyStatus === 'sent').length,
          active:    list.filter(r => ['accepted', 'partially_fulfilled'].includes(r.pharmacyStatus)).length,
          ready:     list.filter(r => r.pharmacyStatus === 'ready').length,
          delivered: list.filter(r => r.pharmacyStatus === 'delivered').length,
        });
        const ds = { available: 0, not_available: 0, pending: 0, alternative_suggested: 0, approved_replacement: 0, transferred: 0 };
        list.forEach(rx => (rx.medications || []).forEach(m => {
          const key = m.drugStatus || 'pending';
          if (ds[key] !== undefined) ds[key] += 1;
          else ds.pending += 1;
        }));
        setDrugSummary(ds);
        setRecent(
          [...list]
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
            .slice(0, 6),
        );
      }).catch(() => {});
  }, [parentOrgId, profile.id]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'pharmacyRxEvents'), where('branchId', '==', profile.id)));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .slice(0, 5);
        setEvents(list);
      } catch {
        setEvents([]);
      }
    })();
  }, [profile.id]);

  const unresolved = stats.incoming + stats.active;
  const needsAttention = (drugSummary.not_available || 0) + (drugSummary.alternative_suggested || 0) + (drugSummary.transferred || 0);

  const CARDS = [
    { label: 'Incoming',  value: stats.incoming,  icon: '📥', accent: 'branch-kpi--amber', bar: '#fbbf24' },
    { label: 'Active',    value: stats.active,    icon: '⚡', accent: 'branch-kpi--blue', bar: '#38bdf8' },
    { label: 'Ready',     value: stats.ready,     icon: '✅', accent: 'branch-kpi--green', bar: '#4ade80' },
    { label: 'Delivered', value: stats.delivered, icon: '📦', accent: 'branch-kpi--slate', bar: '#94a3b8' },
  ];

  const rxMeta = (rx) => RX_STATUS_META[rx.pharmacyStatus] || RX_STATUS_META.sent;

  return (
    <div className="pharmacy-page branch-home">
      <h1 className="pharmacy-page-title">Branch Dashboard</h1>
      <p className="pharmacy-page-sub">{profile?.branchName} · {profile?.pharmacyName}</p>
      <LocationSummaryCard profile={profile} title="Branch Location" onEdit={() => navigate('/dashboard/settings')} />
      <div className="branch-home-kpi-grid">
        {CARDS.map(c => (
          <div key={c.label} className={`branch-home-kpi-card ${c.accent}`}>
            <div className="branch-home-kpi-bar" style={{ background: c.bar }} aria-hidden />
            <div className="branch-home-kpi-inner">
              <span className="branch-home-kpi-icon">{c.icon}</span>
              <div className="branch-home-kpi-value">{c.value}</div>
              <div className="branch-home-kpi-label">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="branch-home-two-col">
        <div className="branch-home-panel branch-home-panel--rx">
          <div className="branch-home-panel-head">
            <div>
              <h3 className="branch-home-panel-title">Recent prescriptions</h3>
              <p className="branch-home-panel-hint">Latest routed to this branch — tap to open</p>
            </div>
            <span className="branch-home-badge-count">{recent.length}</span>
          </div>
          {recent.length === 0 ? (
            <p className="branch-home-empty">No prescriptions yet.</p>
          ) : (
            <ul className="branch-home-rx-list">
              {recent.map(r => {
                const sm = rxMeta(r);
                const ts = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
                return (
                  <li key={r.id}>
                    <button type="button" className="branch-home-rx-card" onClick={() => navigate(`/dashboard/prescriptions/${r.id}`)}>
                      <div className="branch-home-rx-card-top">
                        <span className="branch-home-rx-name">{r.patientName || 'Patient'}</span>
                        <span className={`branch-home-rx-status ${sm.badge}`}>{sm.label}</span>
                      </div>
                      <div className="branch-home-rx-meta">
                        <span>{r.diagnosis || 'No diagnosis'}</span>
                        <span className="branch-home-rx-ref">{r.prescriptionRef || '—'}</span>
                      </div>
                      {ts ? (
                        <div className="branch-home-rx-time">{ts.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="branch-home-panel">
          <h3 className="branch-home-panel-title branch-home-panel-title--solo">Drug status mix</h3>
          <p className="branch-home-panel-hint">Across all line items at this branch</p>
          <ul className="branch-home-drug-mix">
            {Object.entries(drugSummary).map(([k, v]) => (
              <li key={k}>
                <span className="branch-home-drug-key">{k.replace(/_/g, ' ')}</span>
                <span className="branch-home-drug-val">{v}</span>
              </li>
            ))}
          </ul>
          <div className="branch-home-panel-actions">
            <button type="button" className="doctor-btn doctor-btn-sm doctor-btn-primary" onClick={() => navigate('/dashboard/prescriptions')}>Open queue</button>
            <button type="button" className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => navigate('/dashboard/prescriptions#branch-walkin-verify')}>Walk-in verify</button>
          </div>
        </div>
      </div>

      <div className="branch-home-triple">
        <div className="branch-home-mini-panel branch-home-mini-panel--attention">
          <h3 className="branch-home-mini-title">Attention</h3>
          <ul className="branch-home-mini-stats">
            <li><span>Unresolved Rx</span><strong>{unresolved}</strong></li>
            <li><span>Drug issues</span><strong>{needsAttention}</strong></li>
            <li><span>Ready pickup</span><strong>{stats.ready}</strong></li>
          </ul>
          <button type="button" className="doctor-btn doctor-btn-sm doctor-btn-outline branch-home-mini-btn" onClick={() => navigate('/dashboard/prescriptions')}>Resolve now</button>
        </div>

        <div className="branch-home-mini-panel">
          <h3 className="branch-home-mini-title">Shortcuts</h3>
          <div className="branch-home-shortcuts">
            <button type="button" className="branch-home-shortcut" onClick={() => navigate('/dashboard/prescriptions#branch-walkin-verify')}>Walk-in verify</button>
            <button type="button" className="branch-home-shortcut" onClick={() => navigate('/dashboard/transfers')}>Transfers</button>
            <button type="button" className="branch-home-shortcut" onClick={() => navigate('/dashboard/activity')}>Full activity log</button>
          </div>
        </div>

        <div className="branch-home-mini-panel branch-home-mini-panel--health">
          <h3 className="branch-home-mini-title">Workload</h3>
          <div className="branch-health-row">
            <span>Queue pressure</span>
            <span className={`branch-health-pill ${unresolved > 20 ? 'branch-health-pill--bad' : unresolved > 8 ? 'branch-health-pill--warn' : 'branch-health-pill--ok'}`}>
              {unresolved > 20 ? 'High' : unresolved > 8 ? 'Medium' : 'Normal'}
            </span>
          </div>
          <div className="branch-health-row">
            <span>Issue rate</span>
            <span className={`branch-health-pill ${needsAttention > 8 ? 'branch-health-pill--bad' : needsAttention > 3 ? 'branch-health-pill--warn' : 'branch-health-pill--ok'}`}>
              {needsAttention > 8 ? 'High' : needsAttention > 3 ? 'Medium' : 'Low'}
            </span>
          </div>
          <div className="branch-health-row">
            <span>Pickup bench</span>
            <span className={stats.ready > 0 ? 'branch-health-pill branch-health-pill--ok' : 'branch-health-pill'}>{stats.ready > 0 ? `${stats.ready} ready` : 'Empty'}</span>
          </div>
        </div>
      </div>

      <div className="branch-home-activity-section">
        <div className="branch-home-activity-head">
          <h3 className="branch-home-panel-title">Latest branch activity</h3>
          <button type="button" className="branch-home-link-all" onClick={() => navigate('/dashboard/activity')}>View all</button>
        </div>
        {events.length === 0 ? (
          <p className="branch-home-empty">No audit events yet — updates appear when you change drug or Rx status.</p>
        ) : (
          <ul className="branch-home-activity-timeline">
            {events.map(e => (
              <li key={e.id} className="branch-home-activity-item">
                <span className="branch-home-activity-dot" aria-hidden />
                <div className="branch-home-activity-body">
                  <div className="branch-home-activity-title">{branchRxEventLabel(e.action)}</div>
                  <div className="branch-home-activity-detail">
                    {(e.fromStatus || '—')} → {(e.toStatus || '—')}
                    {e.metadata?.drugStatus ? ` · ${String(e.metadata.drugStatus).replace(/_/g, ' ')}` : ''}
                  </div>
                </div>
                <time className="branch-home-activity-time" dateTime={e.createdAt?.seconds ? new Date(e.createdAt.seconds * 1000).toISOString() : undefined}>
                  {e.createdAt?.seconds
                    ? new Date(e.createdAt.seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BranchTransfers({ profile }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');

  // Previously this listed only lines where a transfer had FAILED and this branch was
  // the one that failed to receive it — a single failure case, so the screen was
  // permanently empty in normal use. It now shows every transfer this branch is party
  // to, in both directions, with the stage each has reached.
  const parentOrgId = profile?.pharmacyId || profile?.organizationId || '';

  useEffect(() => {
    if (!parentOrgId || !profile?.id) { setLoading(false); return; }
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', parentOrgId)));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRows(buildTransferRows(list, profile.id));
      } finally { setLoading(false); }
    })();
  }, [parentOrgId, profile?.id]);

  const actionCount = rows.filter(r => r.actionable).length;
  const visible = filter === 'all' ? rows
    : filter === 'action' ? rows.filter(r => r.actionable)
    : rows.filter(r => r.direction === filter);

  const TONE = {
    ok:   { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
    bad:  { bg: '#fff1f2', border: '#fecdd3', color: '#be123c' },
    warn: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
    info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af' },
  };

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">Transfers</h1>
      <p className="pharmacy-page-sub">Drugs moving to or from this branch</p>

      {actionCount > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.65rem 0.85rem', color: '#1e40af', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          {actionCount} transfer{actionCount === 1 ? '' : 's'} waiting for you to confirm receipt.
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        {[['all', 'All'], ['incoming', 'Incoming'], ['outgoing', 'Outgoing'], ['action', `Needs action${actionCount ? ` (${actionCount})` : ''}`]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setFilter(v)}
            style={{
              padding: '0.35rem 0.75rem', borderRadius: 8, border: '1.5px solid',
              borderColor: filter === v ? '#2563eb' : '#e2e8f0',
              background: filter === v ? '#eff6ff' : '#fff',
              color: filter === v ? '#2563eb' : '#64748b',
              fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
            }}>{l}</button>
        ))}
      </div>

      {loading ? <p>Loading…</p> : visible.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>
          {filter === 'all' ? 'No drug transfers involve this branch yet.' : 'Nothing matches this filter.'}
        </p>
      ) : (
        <div className="pharmacy-table-wrap">
          <table className="pharmacy-table">
            <thead>
              <tr><th>Direction</th><th>Drug</th><th>Counterparty</th><th>Patient</th><th>Ref</th><th>Stage</th><th>Updated</th><th /></tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const tone = TONE[r.stage.tone] || TONE.info;
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 700, color: r.direction === 'incoming' ? '#1e40af' : '#0f766e' }}>
                      {r.direction === 'incoming' ? '↓ Incoming' : '↑ Outgoing'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.drug}{r.strength ? ` (${r.strength})` : ''}</td>
                    <td>{r.counterparty}</td>
                    <td>{r.patientName}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.ref}</td>
                    <td>
                      <span style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, borderRadius: 20, padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {r.stage.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{r.at ? new Date(r.at).toLocaleString() : '—'}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/dashboard/prescriptions/${r.rxId}`)}>
                        {r.actionable ? 'Confirm receipt' : 'Open'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BranchActivity({ profile }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'pharmacyRxEvents'), where('branchId', '==', profile.id), orderBy('createdAt', 'desc'), limit(100)));
        setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        const fallback = await getDocs(query(collection(db, 'pharmacyRxEvents'), where('branchId', '==', profile.id)));
        setEvents(fallback.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 100));
      } finally { setLoading(false); }
    })();
  }, [profile.id]);

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">Activity</h1>
      <p className="pharmacy-page-sub">Latest branch actions on prescriptions</p>
      {loading ? <p>Loading…</p> : events.length === 0 ? <p style={{ color: '#94a3b8' }}>No activity yet.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map(e => (
            <div key={e.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem 0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <b style={{ fontSize: '0.82rem', color: '#0f172a' }}>{e.action}</b>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  {e.createdAt?.seconds ? new Date(e.createdAt.seconds * 1000).toLocaleString() : '—'}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Rx: {e.rxId || '—'} · {e.fromStatus || '—'} → {e.toStatus || '—'}
              </div>
              {e.note ? <div style={{ fontSize: '0.78rem', color: '#475569' }}>{e.note}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BranchSettings({ profile }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [transferTtlHours, setTransferTtlHours] = useState(profile?.transferApprovalTtlHours || 6);

  const toggleMfa = async () => {
    setSaving(true);
    setMsg('');
    try {
      const next = profile?.mfaRequired !== true;
      await updateDoc(doc(db, 'pharmacyBranches', profile.id), {
        mfaRequired: next,
        updatedAt: serverTimestamp(),
      });
      setMsg(`MFA requirement ${next ? 'enabled' : 'disabled'}. Please re-login to refresh session state.`);
    } catch {
      setMsg('Could not update MFA requirement.');
    } finally {
      setSaving(false);
    }
  };

  const saveTransferTtl = async () => {
    setSaving(true);
    setMsg('');
    try {
      const ttl = Math.max(1, Math.min(72, Number(transferTtlHours) || 6));
      await updateDoc(doc(db, 'pharmacyBranches', profile.id), {
        transferApprovalTtlHours: ttl,
        updatedAt: serverTimestamp(),
      });
      setTransferTtlHours(ttl);
      setMsg(`Transfer approval window updated to ${ttl} hour${ttl > 1 ? 's' : ''}.`);
    } catch {
      setMsg('Could not update transfer approval window.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">Branch Settings</h1>
      <p className="pharmacy-page-sub">Manage branch account preferences and security</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>Branch Profile</h3>
          <div style={{ fontSize: '0.82rem', color: '#475569', display: 'grid', gap: 6 }}>
            <div><b>Name:</b> {profile?.branchName || '—'}</div>
            <div><b>Parent Pharmacy:</b> {profile?.pharmacyName || '—'}</div>
            <div><b>Email:</b> {profile?.email || '—'}</div>
            <div><b>Status:</b> {profile?.status || 'active'}</div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>Security</h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            MFA can be required for this branch login. Password change is available on sign-in reset prompt.
          </p>
          <button
            className="doctor-btn doctor-btn-sm doctor-btn-outline"
            disabled={saving}
            onClick={toggleMfa}
          >
            {saving ? 'Saving…' : `MFA Required: ${profile?.mfaRequired ? 'ON' : 'OFF'}`}
          </button>
          {msg ? <p style={{ marginTop: 8, fontSize: '0.78rem', color: '#0369a1' }}>{msg}</p> : null}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>Transfer approval SLA</h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            How long patients have to approve branch-to-branch transfer requests before they auto-expire to Not Available.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min="1"
              max="72"
              value={transferTtlHours}
              onChange={e => setTransferTtlHours(e.target.value)}
              style={{ width: 88, padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db' }}
            />
            <span style={{ fontSize: '0.82rem', color: '#334155' }}>hours</span>
            <button
              className="doctor-btn doctor-btn-sm doctor-btn-outline"
              disabled={saving}
              onClick={saveTransferTtl}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Branch Dashboard Shell ───────────────────────────────────────────────────
const NAV = [
  { path: '/dashboard',              label: 'Overview',      icon: '📊' },
  { path: '/dashboard/prescriptions',label: 'Prescriptions', icon: '💊' },
  { path: '/dashboard/transfers',    label: 'Transfers',     icon: '↔️' },
  { path: '/dashboard/activity',     label: 'Activity',      icon: '🧾' },
  { path: '/dashboard/reports',      label: 'Reports',       icon: '📈' },
  { path: '/dashboard/report-issue', label: 'Report Issue',  icon: '📩' },
  { path: '/dashboard/settings',     label: 'Settings',      icon: '⚙️' },
];

export default function BranchDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [mustChange, setMustChange] = useState(profile?.mustChangePassword === true);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const mfaRequired = profile?.mfaRequired === true;
  const hasMfaFactor = (auth.currentUser?.multiFactor?.enrolledFactors || []).length > 0;

  const handleLogout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };
  const isActive = (p) => p === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(p);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    setPwSaving(true);
    try {
      const user = auth.currentUser;
      await updatePassword(user, newPw);
      await updateDoc(doc(db, 'pharmacyBranches', profile.id), { mustChangePassword: false });
      setMustChange(false);
    } catch (err) {
      setPwError(err.code === 'auth/requires-recent-login'
        ? 'Log out, sign in with your temporary password again, then set a new password.'
        : 'Failed to update password. Try again.');
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
              <SidebarSavedLocation profile={profile} />
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
        {mfaRequired && !hasMfaFactor && (
          <div style={{ margin: '1rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '0.85rem 1rem', color: '#9a3412', fontSize: '0.86rem', fontWeight: 600 }}>
            Multi-factor authentication is required for this branch account. Please enroll MFA in your account settings flow before production rollout.
          </div>
        )}
        {mustChange && (
          <div className="force-pw-overlay">
            <div className="force-pw-card">
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔐</div>
              <h2 className="force-pw-title">Password Reset Required</h2>
              <p className="force-pw-sub">Set a new password before accessing your branch dashboard.</p>
              {pwError && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '0.65rem', color: '#be123c', fontSize: '0.83rem', marginBottom: '1rem' }}>🚨 {pwError}</div>}
              <form onSubmit={handleChangePassword}>
                {[['New Password', newPw, setNewPw], ['Confirm New Password', confirmPw, setConfirmPw]].map(([label, val, set]) => (
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
          <Route path="/prescriptions/:rxId" element={<BranchPrescriptionOps profile={profile} />} />
          <Route path="/transfers"     element={<BranchTransfers profile={profile} />} />
          <Route path="/activity"      element={<BranchActivity profile={profile} />} />
          <Route path="/reports"       element={<BranchReports profile={profile} />} />
          <Route path="/walkin" element={<Navigate to="/dashboard/prescriptions#branch-walkin-verify" replace />} />
          <Route path="/report-issue"  element={<GlobalReportForm profile={profile} reporterType="pharmacy_branch" />} />
          <Route path="/settings"      element={<BranchSettings profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
