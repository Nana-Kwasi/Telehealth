import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useHomeCareNurse } from './HomeCareNurseContext';
import {
  fetchBooking,
  updateBookingStatus,
  submitVisitReport,
  maybeCloseExpiredHomeCarePackage,
} from '../../../services/homeCareService';
import { BOOKING_STATUS } from '../../../constants/homeCareConstants';
import {
  isPackageDuration,
  localTodayYmd,
  packageInclusiveDayNumber,
  packageSpanDaysInclusive,
  packageWeekOrdinal,
} from '../../../utils/homeCarePackage';
import { statusLabel, contactRevealed } from '../../../utils/homeCareUtils';
import './HomeCareNurseDashboard.css';

export default function HomeCareNurseVisit() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { refresh } = useHomeCareNurse();
  const [booking, setBooking] = useState(null);
  const [report, setReport] = useState({
    visitDate: '',
    careProvided: '',
    temp: '',
    bp: '',
    pulse: '',
    concerns: '',
    planCycleNotes: '',
    incident: false,
    incidentDesc: '',
  });

  useEffect(() => {
    if (!bookingId) return;
    (async () => {
      const b = await fetchBooking(bookingId);
      if (!b) {
        setBooking(null);
        return;
      }
      const b2 = await maybeCloseExpiredHomeCarePackage(b);
      setBooking(b2);
      if (isPackageDuration(b2.durationType)) {
        setReport((r) => ({
          ...r,
          visitDate: r.visitDate || localTodayYmd(),
        }));
      }
    })();
  }, [bookingId]);

  const setStatus = async (status) => {
    await updateBookingStatus(bookingId, status);
    setBooking((b) => ({ ...b, status }));
    refresh();
  };

  const startCare = async () => {
    await setStatus(BOOKING_STATUS.IN_PROGRESS);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!report.careProvided.trim()) return;
    try {
      await submitVisitReport(bookingId, {
        vitals: { temperature: report.temp, bloodPressure: report.bp, pulse: report.pulse },
        careProvided: report.careProvided.trim(),
        concerns: report.concerns.trim(),
        visitDate: isPackageDuration(booking?.durationType) ? report.visitDate.trim() : undefined,
        planCycleNotes: isPackageDuration(booking?.durationType) ? report.planCycleNotes.trim() : undefined,
        incidentFlag: report.incident,
        incidentDescription: report.incident ? report.incidentDesc.trim() : '',
      });
    } catch (err) {
      window.alert(err?.message || 'Could not submit visit log.');
      return;
    }
    refresh();
    navigate('/dashboard');
  };

  if (!booking) {
    return (
      <div className="hcn-page">
        <p className="hcn-empty">Loading visit…</p>
      </div>
    );
  }

  const isPackage = isPackageDuration(booking.durationType);
  const canSubmitVisitReport =
    booking.status === BOOKING_STATUS.IN_PROGRESS ||
    (booking.status === BOOKING_STATUS.ONGOING && isPackage);

  const planCaption =
    booking.durationType === 'weekly'
      ? "This week's priorities / focus"
      : booking.durationType === 'monthly'
        ? 'Continuity notes (meds, follow-ups, coordination)'
        : booking.durationType === 'yearly'
          ? 'Long-term care continuity notes'
          : 'Plan notes';

  const plannedDays =
    isPackage && booking.startDate && booking.endDate
      ? packageSpanDaysInclusive(booking.startDate, booking.endDate)
      : null;
  const dayInPlan =
    isPackage && booking.startDate && report.visitDate
      ? packageInclusiveDayNumber(booking.startDate, report.visitDate)
      : null;
  const weekOrd =
    isPackage && booking.startDate && report.visitDate
      ? packageWeekOrdinal(booking.startDate, report.visitDate)
      : null;

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>Active visit</h1>
        <p>{booking.patientName} · {statusLabel(booking.status)}</p>
      </header>

      <div className="hcn-card">
        <p className="hcn-card-meta">{booking.careType} · {booking.durationType}</p>
        <p className="hcn-card-meta">{booking.address}</p>
        {booking.specialNotes ? <p className="hcn-card-meta">{booking.specialNotes}</p> : null}
      </div>

      {contactRevealed(booking) ? (
        <div className="hcn-card">
          <h3 style={{ marginTop: 0, color: '#134e4a', fontSize: '0.95rem' }}>Patient contact</h3>
          <p className="hcn-card-meta">Phone: {booking.patientPhone || '—'}</p>
          {booking.patientPhone ? (
            <a href={`tel:${booking.patientPhone.replace(/\s/g, '')}`} style={{ color: '#0d9488', fontWeight: 700 }}>
              Call patient
            </a>
          ) : null}
        </div>
      ) : null}

      {booking.status === BOOKING_STATUS.ACCEPTED ? (
        <div className="hcn-actions">
          <button type="button" className="hcn-btn" onClick={() => setStatus(BOOKING_STATUS.EN_ROUTE)}>Mark en route</button>
        </div>
      ) : null}

      {booking.status === BOOKING_STATUS.EN_ROUTE ? (
        <div className="hcn-actions">
          <button type="button" className="hcn-btn" onClick={() => setStatus(BOOKING_STATUS.ARRIVED)}>Mark arrived</button>
        </div>
      ) : null}

      {booking.status === BOOKING_STATUS.ARRIVED ? (
        <div className="hcn-actions">
          <button type="button" className="hcn-btn" onClick={startCare}>Start Care</button>
        </div>
      ) : null}

      {canSubmitVisitReport ? (
        <form className="hcn-card hcn-form" onSubmit={submit}>
          <h3 style={{ marginTop: 0, color: '#134e4a' }}>{isPackage ? 'Visit log' : 'Visit report'}</h3>
          {isPackage && booking.status === BOOKING_STATUS.ONGOING ? (
            <p className="hcn-card-meta" style={{ marginTop: '-0.25rem' }}>
              Log each visit on the day it happens. Day {dayInPlan ?? '—'}
              {plannedDays != null ? ` of ${plannedDays}` : ''}
              {booking.durationType === 'weekly' && weekOrd != null ? ` · Week ${weekOrd}` : null}
              {booking.endDate ? ` · Plan ends ${booking.endDate}` : null}
            </p>
          ) : null}
          {isPackage ? (
            <>
              <label htmlFor="hcn-visit-date">Visit date *</label>
              <input
                id="hcn-visit-date"
                type="date"
                min={booking.startDate || undefined}
                max={booking.endDate || undefined}
                value={report.visitDate}
                onChange={(e) => setReport({ ...report, visitDate: e.target.value })}
                required
              />
              <label>{planCaption} (optional)</label>
              <textarea
                rows={2}
                value={report.planCycleNotes}
                onChange={(e) => setReport({ ...report, planCycleNotes: e.target.value })}
              />
            </>
          ) : null}
          <label>Care provided *</label>
          <textarea rows={4} value={report.careProvided} onChange={(e) => setReport({ ...report, careProvided: e.target.value })} required />
          <label>Vitals (optional)</label>
          <input placeholder="Temperature" value={report.temp} onChange={(e) => setReport({ ...report, temp: e.target.value })} />
          <input placeholder="Blood pressure" value={report.bp} onChange={(e) => setReport({ ...report, bp: e.target.value })} />
          <input placeholder="Pulse" value={report.pulse} onChange={(e) => setReport({ ...report, pulse: e.target.value })} />
          <label>Concerns</label>
          <textarea rows={2} value={report.concerns} onChange={(e) => setReport({ ...report, concerns: e.target.value })} />
          <div className="hcn-incident-row">
            <span className="hcn-incident-label" id="hcn-incident-flag-label">Incident to flag</span>
            <label className="hcn-switch">
              <input
                type="checkbox"
                role="switch"
                aria-labelledby="hcn-incident-flag-label"
                checked={report.incident}
                onChange={(e) => setReport({ ...report, incident: e.target.checked })}
              />
              <span className="hcn-switch-slider" aria-hidden="true" />
            </label>
          </div>
          {report.incident ? (
            <textarea rows={2} value={report.incidentDesc} onChange={(e) => setReport({ ...report, incidentDesc: e.target.value })} placeholder="Describe incident" />
          ) : null}
          <div className="hcn-actions">
            <button type="submit" className="hcn-btn">{isPackage ? 'Submit visit log' : 'Submit & complete'}</button>
            <button type="button" className="hcn-btn hcn-btn-outline" onClick={() => navigate('/dashboard')}>Back</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
