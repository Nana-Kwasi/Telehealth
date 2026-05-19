import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { fetchBooking } from '../../services/homeCareService';
import './HomeCare.css';

export default function HomeCareVisitSummary() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    fetchBooking(bookingId).then(setBooking);
  }, [bookingId]);

  const summary = booking?.patientVisitSummary;
  if (!booking) return <p className="hc-empty hc-page">Loading…</p>;
  if (!summary) return <p className="hc-empty hc-page">No visit summary yet.</p>;

  return (
    <div className="hc-page">
      <p><Link to={`/home-care/booking/${bookingId}`}>← Booking</Link></p>
      <h1>Visit summary</h1>
      <div className="hc-card">
        <p><strong>Care provided</strong></p>
        <p>{summary.careSummary}</p>
        {summary.medicationsGiven ? (
          <>
            <p><strong>Medications</strong></p>
            <p>{summary.medicationsGiven}</p>
          </>
        ) : null}
        {summary.followUpNotes ? (
          <>
            <p><strong>Follow-up</strong></p>
            <p>{summary.followUpNotes}</p>
          </>
        ) : null}
        {summary.nextVisitDate ? <p className="hc-card-meta">Next visit: {summary.nextVisitDate}</p> : null}
      </div>
    </div>
  );
}
