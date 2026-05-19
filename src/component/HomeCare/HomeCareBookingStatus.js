import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchBooking, extendHomeCarePackage } from '../../services/homeCareService';
import { statusLabel, contactRevealed, formatGhs } from '../../utils/homeCareUtils';
import { PACKAGE_DURATION_TYPES } from '../../constants/homeCareConstants';
import './HomeCare.css';

function addOneCalendarDay(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function HomeCareBookingStatus() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extEnd, setExtEnd] = useState('');
  const [extDur, setExtDur] = useState('');
  const [extBusy, setExtBusy] = useState(false);
  const [extErr, setExtErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const b = await fetchBooking(bookingId);
        setBooking(b);
        setExtDur(b?.durationType || '');
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId]);

  if (loading) return <p className="hc-empty hc-page">Loading…</p>;
  if (!booking) return <p className="hc-empty hc-page">Booking not found.</p>;

  const canExtend =
    booking.status === 'completed' &&
    PACKAGE_DURATION_TYPES.includes(booking.durationType) &&
    !!booking.nurseId;

  const extendSubmit = async (e) => {
    e.preventDefault();
    setExtErr('');
    if (!extEnd.trim()) {
      setExtErr('Pick a new expected end date.');
      return;
    }
    if (booking.endDate && extEnd <= booking.endDate) {
      setExtErr('New end date must be after your previous plan end.');
      return;
    }
    setExtBusy(true);
    try {
      await extendHomeCarePackage(bookingId, extEnd.trim(), extDur !== booking.durationType ? extDur : null);
      const b = await fetchBooking(bookingId);
      setBooking(b);
      setExtEnd('');
    } catch (err) {
      setExtErr(err.message || 'Could not extend.');
    } finally {
      setExtBusy(false);
    }
  };

  return (
    <div className="hc-page">
      <p><Link to="/home-care">← My Home Care</Link></p>
      <div className="hc-card">
        <span className="hc-status">{statusLabel(booking.status)}</span>
        <h1 style={{ marginTop: '0.5rem' }}>{booking.nurseName}</h1>
        <p className="hc-card-meta">{booking.careType} · {booking.durationType}</p>
        <p className="hc-card-meta">{booking.address}</p>
        <p className="hc-card-meta">Start: {booking.startDate}</p>
        {booking.endDate ? <p className="hc-card-meta">Expected end: {booking.endDate}</p> : null}
        {booking.packageClosureReason === 'period_end' ? (
          <p className="hc-disclaimer">This package closed because the scheduled period ended.</p>
        ) : null}
        <p><strong>Reference fee:</strong> {formatGhs(booking.referenceFeeAmount)} {booking.referenceFeeLabel}</p>

        {contactRevealed(booking) ? (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdfa', borderRadius: 8 }}>
            <p><strong>Nurse contact</strong></p>
            <p>Phone: {booking.nursePhone || '—'}</p>
            {booking.nurseWhatsapp ? <p>WhatsApp: {booking.nurseWhatsapp}</p> : null}
          </div>
        ) : (
          <p className="hc-disclaimer">Contact details appear after the nurse accepts your request.</p>
        )}

        {booking.status === 'completed' && booking.patientVisitSummary ? (
          <div style={{ marginTop: '1rem' }}>
            <p><strong>Visit summary</strong></p>
            <p>{booking.patientVisitSummary.careSummary || booking.patientVisitSummary.careProvided}</p>
            <Link to={`/home-care/visit-summary/${bookingId}`}>Full summary →</Link>
          </div>
        ) : null}

        <div className="hc-actions" style={{ marginTop: '1rem' }}>
          {canExtend ? (
            <form className="hc-form" onSubmit={extendSubmit} style={{ width: '100%', maxWidth: 420 }}>
              <h2 style={{ fontSize: '1.1rem' }}>Extend care plan</h2>
              <p className="hc-disclaimer">Adds more time with the same nurse. Confirm payment and logistics with them.</p>
              <label>New expected end date *</label>
              <input
                type="date"
                required
                value={extEnd}
                min={booking.endDate ? addOneCalendarDay(booking.endDate) : undefined}
                onChange={(e) => setExtEnd(e.target.value)}
              />
              <label>Optional: switch billing rhythm</label>
              <select value={extDur} onChange={(e) => setExtDur(e.target.value)}>
                {PACKAGE_DURATION_TYPES.map((v) => (
                  <option key={v} value={v}>{`${v.charAt(0).toUpperCase()}${v.slice(1)}`}</option>
                ))}
              </select>
              {extErr ? <p style={{ color: '#dc2626' }}>{extErr}</p> : null}
              <button type="submit" className="hc-btn" disabled={extBusy}>{extBusy ? 'Saving…' : 'Request extension'}</button>
            </form>
          ) : null}
          {booking.status === 'completed' && !booking.patientFeedback ? (
            <Link to={`/home-care/feedback/${bookingId}`} className="hc-btn">Leave feedback</Link>
          ) : null}
          {booking.nurseId ? (
            <Link to={`/home-care/report/${bookingId}?nurseId=${booking.nurseId}`} className="hc-btn hc-btn-outline">Report issue</Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
