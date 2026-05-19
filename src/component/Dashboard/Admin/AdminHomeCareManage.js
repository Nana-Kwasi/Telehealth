import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchAllNursesAdmin,
  updateNurseAccountStatus,
  updateNurseFeesAdmin,
  fetchAllBookingsAdmin,
  fetchBooking,
  fetchAllComplaintsAdmin,
  updateComplaintStatus,
  verifyNurseDocumentsAdmin,
  fetchHomeCareAnalyticsAdmin,
} from '../../../services/homeCareService';
import { formatGhs } from '../../../utils/homeCareUtils';
import './AdminOnboardHomeCareNurse.css';
import './AdminHomeCareManage.css';

const TABS = ['analytics', 'nurses', 'bookings', 'complaints'];

function formatHcAdminTimestamp(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toLocaleString();
  if (typeof v.toDate === 'function') {
    const d = v.toDate();
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
  }
  if (typeof v.seconds === 'number') {
    return new Date(v.seconds * 1000).toLocaleString();
  }
  return null;
}

function BookingDetailModal({ booking, loading, onClose }) {
  if (!booking) return null;

  const rows = [
    ['Booking ID', booking.id],
    ['Patient', booking.patientName],
    ['Patient ID', booking.patientId],
    ['Patient phone', booking.patientPhone],
    ['Nurse', booking.nurseName],
    ['Nurse ID', booking.nurseId],
    ['Nurse phone', booking.nursePhone],
    ['Booking type', booking.bookingType || (booking.isEmergency ? 'emergency' : '')],
    ['Care type', booking.careType],
    ['Duration', booking.durationType],
    ['Status', booking.status],
    ['Reference fee', formatGhs(booking.referenceFeeAmount || 0)],
    ['Fee label', booking.referenceFeeLabel],
    ['Address', booking.address],
    ['Latitude', booking.latitude != null ? String(booking.latitude) : null],
    ['Longitude', booking.longitude != null ? String(booking.longitude) : null],
    ['Start date', booking.startDate],
    ['End date', booking.endDate],
    ['Notes', booking.specialNotes],
    ['Urgency', booking.urgency],
    ['Cancelled by', booking.cancelledBy],
    ['Cancel reason', booking.cancelReason],
    ['Visit log count', booking.visitLogCount != null ? String(booking.visitLogCount) : null],
    ['Created', formatHcAdminTimestamp(booking.createdAt)],
    ['Updated', formatHcAdminTimestamp(booking.updatedAt)],
    ['Accepted', formatHcAdminTimestamp(booking.acceptedAt)],
    ['Completed', formatHcAdminTimestamp(booking.completedAt)],
    ['Cancelled', formatHcAdminTimestamp(booking.cancelledAt)],
    ['Last visit', formatHcAdminTimestamp(booking.lastVisitAt)],
  ].filter(([, val]) => val != null && val !== '');

  const vr = booking.visitReport;
  const summary = booking.patientVisitSummary;
  const feedback = booking.patientFeedback;

  return createPortal(
    <div className="ahcm-modal-root">
      <button type="button" className="ahcm-modal-backdrop" onClick={onClose} aria-label="Close" />
      <div
        className="ahcm-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ahcm-booking-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ahcm-modal-head">
          <div>
            <h2 id="ahcm-booking-detail-title">Booking details</h2>
            <p className="ahcm-modal-sub">
              {booking.patientName || 'Patient'} · {booking.bookingType || booking.careType || '—'} ·{' '}
              <span className="ahcm-modal-status">{booking.status}</span>
            </p>
          </div>
          <button type="button" className="ahcm-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {loading ? <p className="ahcm-modal-loading">Refreshing…</p> : null}
        <dl className="ahcm-detail-dl">
          {rows.map(([label, val]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd>{val}</dd>
            </React.Fragment>
          ))}
        </dl>
        {vr ? (
          <section className="ahcm-modal-section">
            <h3>Visit report</h3>
            <dl className="ahcm-detail-dl ahcm-detail-dl--compact">
              {vr.careProvided != null && vr.careProvided !== '' ? (
                <>
                  <dt>Care provided</dt>
                  <dd>{vr.careProvided}</dd>
                </>
              ) : null}
              {vr.concerns != null && vr.concerns !== '' ? (
                <>
                  <dt>Follow-up / concerns</dt>
                  <dd>{vr.concerns}</dd>
                </>
              ) : null}
              {vr.vitals ? (
                <>
                  <dt>Vitals</dt>
                  <dd>
                    {typeof vr.vitals === 'object'
                      ? Object.entries(vr.vitals)
                          .filter(([, x]) => x != null && x !== '')
                          .map(([k, x]) => `${k}: ${x}`)
                          .join(' · ') || '—'
                      : String(vr.vitals)}
                  </dd>
                </>
              ) : null}
              <dt>Incident flagged</dt>
              <dd>{vr.incidentFlag ? 'Yes' : 'No'}</dd>
              {vr.incidentDescription ? (
                <>
                  <dt>Incident note</dt>
                  <dd>{vr.incidentDescription}</dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}
        {summary && typeof summary === 'object' ? (
          <section className="ahcm-modal-section">
            <h3>Patient visit summary</h3>
            <pre className="ahcm-modal-pre">{JSON.stringify(summary, null, 2)}</pre>
          </section>
        ) : null}
        {feedback && typeof feedback === 'object' ? (
          <section className="ahcm-modal-section">
            <h3>Patient feedback</h3>
            <pre className="ahcm-modal-pre">{JSON.stringify(feedback, null, 2)}</pre>
          </section>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default function AdminHomeCareManage() {
  const [tab, setTab] = useState('nurses');
  const [nurses, setNurses] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  const bookingDetailOpenIdRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, b, c, a] = await Promise.all([
        fetchAllNursesAdmin(),
        fetchAllBookingsAdmin(),
        fetchAllComplaintsAdmin(),
        fetchHomeCareAnalyticsAdmin(),
      ]);
      setNurses(n);
      setBookings(b);
      setComplaints(c);
      setAnalytics(a);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeBookingDetail = useCallback(() => {
    bookingDetailOpenIdRef.current = null;
    setBookingDetail(null);
    setBookingDetailLoading(false);
  }, []);

  const openBookingDetail = (b) => {
    bookingDetailOpenIdRef.current = b.id;
    setBookingDetail(b);
    setBookingDetailLoading(true);
    const id = b.id;
    fetchBooking(id)
      .then((fresh) => {
        if (bookingDetailOpenIdRef.current !== id || !fresh) return;
        setBookingDetail(fresh);
      })
      .catch(() => {})
      .finally(() => {
        if (bookingDetailOpenIdRef.current === id) setBookingDetailLoading(false);
      });
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!bookingDetail) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeBookingDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bookingDetail, closeBookingDetail]);

  const setNurseStatus = async (id, accountStatus) => {
    await updateNurseAccountStatus(id, accountStatus);
    load();
  };

  const saveFees = async (id, fees) => {
    const daily = Number(fees.daily);
    const weekly = Number(fees.weekly);
    const monthly = Number(fees.monthly);
    const yearly = Number(fees.yearly);
    if ([daily, weekly, monthly, yearly].some((x) => Number.isNaN(x) || x < 0)) return;
    await updateNurseFeesAdmin(id, { daily, weekly, monthly, yearly });
    load();
  };

  const resolveComplaint = async (id, status) => {
    await updateComplaintStatus(id, status);
    load();
  };

  return (
    <div className="admin-onboard-hc admin-onboard-hc--wide">
      <header className="ahcm-page-top">
        <div className="ahcm-page-top-text">
          <h1>Home Care management</h1>
          <p className="ahcm-page-lead">
            Review nurses, bookings, and complaints. Use the tabs to switch sections.
          </p>
        </div>
        <div className="ahcm-tabs-wrap">
          <div className="ahcm-tabs" role="tablist" aria-label="Home care sections">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`ahcm-tab${tab === t ? ' ahcm-tab--active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? <p>Loading…</p> : null}

      {!loading && tab === 'analytics' && analytics && (
        <div className="ahcm-panel">
          <h2 className="ahcm-panel-title">Overview</h2>
          <div className="ahcm-stats-grid">
            {[
              ['Total nurses', analytics.totalNurses],
              ['Approved', analytics.approvedNurses],
              ['Bookings', analytics.totalBookings],
              ['Completed', analytics.completed],
              ['Cancelled', analytics.cancelled],
              ['Emergency', analytics.emergencyBookings],
              ['Open complaints', analytics.openComplaints],
              ['Avg rating', analytics.avgRating?.toFixed(1)],
            ].map(([label, val]) => (
              <div key={label} className="ahcm-stat-card">
                <p className="ahcm-stat-label">{label}</p>
                <p className="ahcm-stat-value">{val ?? '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === 'nurses' && (
        <div className="ahcm-panel admin-onboard-hc-scroll">
          <h2 className="ahcm-panel-title">Nurses</h2>
          <div className="ahcm-nurse-list">
          {nurses.map((n) => (
            <article key={n.id} className="ahcm-nurse-card">
              <div className="ahcm-nurse-head">
                <div>
                  <h3>{n.fullName}</h3>
                  <p className="ahcm-nurse-meta">
                    {n.specialty || '—'} · Account: <strong>{n.accountStatus || 'pending'}</strong>
                    {' · '}Documents: {n.documentsStatus || '—'}
                  </p>
                </div>
                <p className="ahcm-nurse-rating">
                  ★ {(n.ratingAvg || 0).toFixed(1)} <span style={{ fontWeight: 500, color: '#64748b' }}>({n.ratingCount || 0})</span>
                </p>
              </div>

              {(n.licenseDocUrl || n.idDocUrl) ? (
                <div>
                  <p className="ahcm-section-label">Verification files</p>
                  <div className="ahcm-docs">
                    {n.licenseDocUrl ? <a href={n.licenseDocUrl} target="_blank" rel="noreferrer">View license</a> : null}
                    {n.idDocUrl ? <a href={n.idDocUrl} target="_blank" rel="noreferrer">View ID</a> : null}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="ahcm-section-label">Document decision</p>
                <div className="ahcm-actions-row">
                  <button
                    type="button"
                    className="ahcm-btn ahcm-btn--primary"
                    onClick={() => verifyNurseDocumentsAdmin(n.id, { licenseVerified: true, documentsStatus: 'verified' }).then(load)}
                  >
                    Verify docs
                  </button>
                  <button
                    type="button"
                    className="ahcm-btn ahcm-btn--outline"
                    onClick={() => verifyNurseDocumentsAdmin(n.id, { licenseVerified: false, documentsStatus: 'rejected' }).then(load)}
                  >
                    Reject docs
                  </button>
                </div>
              </div>

              <div>
                <p className="ahcm-section-label">Account status</p>
                <div className="ahcm-status-group">
                  {['approved', 'suspended', 'pending'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`ahcm-btn ahcm-btn--outline${(n.accountStatus || 'pending') === s ? ' ahcm-status-active' : ''}`}
                      onClick={() => setNurseStatus(n.id, s)}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ahcm-fee-block">
                <p className="ahcm-section-label">Reference fees (GHS)</p>
                <FeeEditor nurse={n} onSave={(fees) => saveFees(n.id, fees)} />
              </div>
            </article>
          ))}
          </div>
        </div>
      )}

      {!loading && tab === 'bookings' && (
        <div className="ahcm-panel admin-onboard-hc-scroll">
          <h2 className="ahcm-panel-title">All bookings</h2>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Nurse</th>
                <th>Type</th>
                <th>Status</th>
                <th>Fee ref.</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="ahcm-booking-row" onClick={() => openBookingDetail(b)}>
                  <td>{b.patientName || b.patientId?.slice(0, 8)}</td>
                  <td>{b.nurseName || '—'}</td>
                  <td>{b.bookingType || b.careType}</td>
                  <td>{b.status}</td>
                  <td>{formatGhs(b.referenceFeeAmount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bookingDetail ? (
        <BookingDetailModal
          booking={bookingDetail}
          loading={bookingDetailLoading}
          onClose={closeBookingDetail}
        />
      ) : null}

      {!loading && tab === 'complaints' && (
        <div className="ahcm-panel admin-onboard-hc-scroll">
          <h2 className="ahcm-panel-title">Complaints</h2>
          {complaints.length === 0 ? <p>No complaints.</p> : complaints.map((c) => (
            <div key={c.id} className="hc-card" style={{ marginBottom: 12 }}>
              <h3>{c.nature}</h3>
              <p className="hc-card-meta">Status: {c.status || 'open'}</p>
              <p>{c.description}</p>
              <div className="hc-actions">
                <button type="button" className="hc-btn" onClick={() => resolveComplaint(c.id, 'reviewing')}>Reviewing</button>
                <button type="button" className="hc-btn hc-btn-outline" onClick={() => resolveComplaint(c.id, 'resolved')}>Resolved</button>
                <button type="button" className="hc-btn hc-btn-outline" onClick={() => resolveComplaint(c.id, 'dismissed')}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeeEditor({ nurse, onSave }) {
  const [fees, setFees] = useState({
    daily: nurse.fees?.daily ?? '',
    weekly: nurse.fees?.weekly ?? '',
    monthly: nurse.fees?.monthly ?? '',
    yearly: nurse.fees?.yearly ?? '',
  });

  useEffect(() => {
    setFees({
      daily: nurse.fees?.daily ?? '',
      weekly: nurse.fees?.weekly ?? '',
      monthly: nurse.fees?.monthly ?? '',
      yearly: nurse.fees?.yearly ?? '',
    });
  }, [nurse.id, nurse.fees?.daily, nurse.fees?.weekly, nurse.fees?.monthly, nurse.fees?.yearly]);

  return (
    <div className="ahcm-fee-grid">
      {[
        { key: 'daily', label: 'Per visit' },
        { key: 'weekly', label: 'Per week' },
        { key: 'monthly', label: 'Per month' },
        { key: 'yearly', label: 'Per year' },
      ].map(({ key, label }) => (
        <div key={key} className="ahcm-fee-field">
          <label htmlFor={`fee-${nurse.id}-${key}`}>{label}</label>
          <input
            id={`fee-${nurse.id}-${key}`}
            type="number"
            min={0}
            step={1}
            value={fees[key]}
            onChange={(e) => setFees((f) => ({ ...f, [key]: e.target.value }))}
          />
        </div>
      ))}
      <div className="ahcm-fee-save">
        <button type="button" className="ahcm-btn ahcm-btn--primary" onClick={() => onSave(fees)}>
          Save fees
        </button>
      </div>
    </div>
  );
}
