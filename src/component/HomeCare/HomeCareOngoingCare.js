import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../../services/firestoreShim';
import { fetchPatientOngoingBookings, fetchVisitLogs } from '../../services/homeCareService';
import { statusLabel } from '../../utils/homeCareUtils';
import { isPackageDuration, packageSpanDaysInclusive } from '../../utils/homeCarePackage';
import './HomeCare.css';
import Paged from '../Common/Paged';

function formatVisitDisplayDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return ymd || '—';
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function EngagementCard({ booking, navigate }) {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);

  const toggleLogs = async () => {
    if (!open) {
      setLogs(await fetchVisitLogs(booking.id));
      setOpen(true);
    } else setOpen(false);
  };

  const plannedDays =
    isPackageDuration(booking.durationType) && booking.startDate && booking.endDate
      ? packageSpanDaysInclusive(booking.startDate, booking.endDate)
      : null;
  const loggedDays =
    Array.isArray(booking.loggedVisitDates) ? booking.loggedVisitDates.length : null;
  return (
    <div className="hc-card hc-ongoing-card">
      <h3>{booking.nurseName}</h3>
      <p className="hc-card-meta">
        {statusLabel(booking.status)} · {booking.durationType}
      </p>
      <p className="hc-card-meta">{booking.address}</p>
      {plannedDays != null ? (
        <p className="hc-card-meta">
          Plan days 1–{plannedDays} (through {booking.endDate}) · {booking.visitLogCount || 0} visit log
          {Number(booking.visitLogCount) === 1 ? '' : 's'}
          {loggedDays != null ? ` · ${loggedDays} calendar day${loggedDays === 1 ? '' : 's'} with entries` : null}
        </p>
      ) : null}
      <div className="hc-ongoing-actions">
        <button type="button" className="hc-btn hc-btn-outline" onClick={() => navigate(`/home-care/booking/${booking.id}`)}>
          Status
        </button>
        <button type="button" className="hc-btn hc-btn-outline" onClick={toggleLogs}>
          {open ? 'Hide logs' : 'Visit logs'}
        </button>
        {booking.nurseId ? (
          <button type="button" className="hc-btn hc-btn-outline" onClick={() => navigate(`/home-care/book/${booking.nurseId}`)}>
            Re-book
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="hc-visit-log-panel">
          <div className="hc-visit-log-panel-head">
            <h4 className="hc-visit-log-panel-title">Visit timeline</h4>
            {logs.length > 0 ? (
              <span className="hc-visit-log-count">
                {logs.length} {logs.length === 1 ? 'record' : 'records'}
              </span>
            ) : null}
          </div>
          {logs.length === 0 ? (
            <div className="hc-visit-log-empty">
              <p>No visit logs yet.</p>
              <span className="hc-visit-log-empty-hint">Your nurse will add an entry after each visit.</span>
            </div>
          ) : (
            <ul className="hc-visit-log-list">
              <Paged items={logs}>{(logs) => logs.map((l) => (
                <li key={l.id} className="hc-visit-log-card">
                  <div className="hc-visit-log-card-top">
                    <time dateTime={l.visitDate || undefined} className="hc-visit-log-date">
                      {formatVisitDisplayDate(l.visitDate)}
                    </time>
                    <div className="hc-visit-log-badges">
                      {l.packageDayNumber != null ? (
                        <span className="hc-visit-log-badge">Day {l.packageDayNumber}</span>
                      ) : null}
                      {l.weekOrdinal != null && booking.durationType === 'weekly' ? (
                        <span className="hc-visit-log-badge hc-visit-log-badge--muted">Week {l.weekOrdinal}</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="hc-visit-log-summary">{l.careSummary || 'Visit recorded'}</p>
                  {l.planCycleNotes ? (
                    <div className="hc-visit-log-block">
                      <span className="hc-visit-log-label">Care plan / focus</span>
                      <p className="hc-visit-log-block-text">{l.planCycleNotes}</p>
                    </div>
                  ) : null}
                  {l.concerns ? (
                    <div className="hc-visit-log-block hc-visit-log-block--concern">
                      <span className="hc-visit-log-label">Concerns</span>
                      <p className="hc-visit-log-block-text">{l.concerns}</p>
                    </div>
                  ) : null}
                  {(l.vitals && (l.vitals.temperature || l.vitals.bloodPressure || l.vitals.pulse)) ? (
                    <dl className="hc-visit-log-vitals">
                      {l.vitals.temperature ? (
                        <>
                          <dt>Temp</dt>
                          <dd>{l.vitals.temperature}</dd>
                        </>
                      ) : null}
                      {l.vitals.bloodPressure ? (
                        <>
                          <dt>BP</dt>
                          <dd>{l.vitals.bloodPressure}</dd>
                        </>
                      ) : null}
                      {l.vitals.pulse ? (
                        <>
                          <dt>Pulse</dt>
                          <dd>{l.vitals.pulse}</dd>
                        </>
                      ) : null}
                    </dl>
                  ) : null}
                  {l.incidentFlag ? (
                    <div className="hc-visit-log-incident">
                      <span className="hc-visit-log-label">Incident flagged</span>
                      {l.incidentDescription ? <p>{l.incidentDescription}</p> : null}
                    </div>
                  ) : null}
                </li>
              ))}</Paged>
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function HomeCareOngoingCare() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      navigate('/login');
      return;
    }
    (async () => {
      try {
        setList(await fetchPatientOngoingBookings(uid));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  return (
    <div className="hc-page">
      <p>
        <Link to="/home-care">← My Home Care</Link>
      </p>
      <h1>Ongoing care</h1>
      <p className="hc-sub">Weekly, monthly, and yearly engagements in progress.</p>
      {loading ? <p className="hc-empty">Loading…</p> : null}
      {!loading && list.length === 0 ? <p className="hc-empty">No ongoing care packages.</p> : null}
      <Paged items={list}>{(list) => list.map((b) => (
        <EngagementCard key={b.id} booking={b} navigate={navigate} />
      ))}</Paged>
    </div>
  );
}
