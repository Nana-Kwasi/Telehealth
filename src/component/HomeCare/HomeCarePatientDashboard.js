import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../../services/firestoreShim';
import { doc, getDoc } from '../../services/firestoreShim';
import LocationSummaryCard from '../Common/LocationSummaryCard';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../utils/locationProfile';
import {
  fetchPatientActiveBookings,
  fetchHomeCarePatientProfile,
} from '../../services/homeCareService';
import { statusLabel, formatGhs, bookingStatusTone } from '../../utils/homeCareUtils';
import NurseAvatar from '../Dashboard/HomeCare/NurseAvatar';
import './HomeCare.css';

const QUICK_ACTIONS = [
  { to: '/home-care/browse', label: 'Find nurses', sub: 'Browse verified professionals', icon: '🔍', primary: true },
  { to: '/home-care/emergency', label: 'Emergency', sub: 'Urgent at-home care', icon: '🚨', danger: true },
  { to: '/home-care/ongoing', label: 'Ongoing care', sub: 'Weekly, monthly & yearly', icon: '📅' },
  { to: '/home-care/history', label: 'Visit history', sub: 'Past visits & receipts', icon: '📋' },
];

function BookingCard({ booking, onOpen }) {
  const tone = bookingStatusTone(booking.status);
  const nurse = { fullName: booking.nurseName, photoURL: booking.nursePhotoURL };
  return (
    <button type="button" className="hc-dash-booking" onClick={onOpen}>
      <div className="hc-dash-booking-top">
        <span className="hc-dash-pill" style={{ background: tone.bg, color: tone.text }}>
          {statusLabel(booking.status)}
        </span>
        <span className="hc-dash-chevron">→</span>
      </div>
      <div className="hc-dash-booking-body">
        <NurseAvatar nurse={nurse} size={52} className="hc-dash-booking-avatar" />
        <div className="hc-dash-booking-info">
          <strong className="hc-dash-booking-name">{booking.nurseName || 'Awaiting nurse'}</strong>
          <p className="hc-card-meta">📅 {booking.startDate || 'Date TBC'}</p>
          <p className="hc-dash-booking-fee">
            {formatGhs(booking.referenceFeeAmount)} <span>{booking.referenceFeeLabel || ''}</span>
          </p>
        </div>
      </div>
    </button>
  );
}

export default function HomeCarePatientDashboard() {
  const navigate = useNavigate();
  const [active, setActive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [locationProfile, setLocationProfile] = useState(null);

  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setActive([]);
        setLoading(false);
        return;
      }
      try {
        const [bookings, profile] = await Promise.all([
          fetchPatientActiveBookings(uid),
          fetchHomeCarePatientProfile(uid),
        ]);
        setActive(bookings);
        setUserName(profile.name || 'Guest');

        const authLoc = await fetchAuthLocationProfile(uid);
        let clientData = null;
        try {
          const clientSnap = await getDoc(doc(db, 'clients', uid));
          if (clientSnap.exists()) clientData = clientSnap.data();
        } catch {
          /* ignore */
        }
        setLocationProfile(mergeLocationProfile(authLoc, clientData));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const greetingName = userName && userName !== 'Guest' ? userName : 'there';

  return (
    <div className="hc-dash-page">
      <header className="hc-dash-hero hc-dash-hero--tall">
        <div className="hc-dash-hero-inner">
          <span className="hc-dash-hero-badge">🏠 Nessa Hub · Home Care</span>
          <h1>Hello, {greetingName}</h1>
          <p className="hc-dash-hero-tagline">Track visits and manage your home care in one place.</p>
        </div>
      </header>

      <div className="hc-dash-body hc-dash-body--spaced">
        <LocationSummaryCard profile={locationProfile} title="Your location" />

        <section>
          <h2 className="hc-dash-section-title">Quick actions</h2>
          <div className="hc-dash-actions">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className={`hc-dash-action ${a.primary ? 'hc-dash-action--primary' : ''} ${a.danger ? 'hc-dash-action--danger' : ''}`}
              >
                <span className="hc-dash-action-icon">{a.icon}</span>
                <span className="hc-dash-action-label">{a.label}</span>
                <span className="hc-dash-action-sub">{a.sub}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="hc-dash-bookings-section">
          <div className="hc-dash-section-head">
            <h2 className="hc-dash-section-title">Active bookings</h2>
            {active.length > 0 ? <span className="hc-dash-count">{active.length}</span> : null}
          </div>

          {loading ? <p className="hc-empty">Loading your bookings…</p> : null}

          {!loading && active.length === 0 ? (
            <div className="hc-dash-empty">
              <div className="hc-dash-empty-icon">📋</div>
              <h3>No active bookings</h3>
              <p>When you book a nurse, your request appears here with live status updates.</p>
              <Link to="/home-care/browse" className="hc-btn">Find a nurse</Link>
            </div>
          ) : null}

          <div className="hc-dash-bookings-list">
            {active.map((b) => (
              <BookingCard key={b.id} booking={b} onOpen={() => navigate(`/home-care/booking/${b.id}`)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
