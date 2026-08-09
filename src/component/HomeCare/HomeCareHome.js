import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../../services/firestoreShim';
import { fetchApprovedNurses, fetchRecentlyHiredNurses, getCurrentLocationMobile } from '../../services/homeCareService';
import { HOME_CARE_SPECIALTIES, FEE_DISCLAIMER } from '../../constants/homeCareConstants';
import { formatGhs, feeForDuration } from '../../utils/homeCareUtils';
import { formatDistanceKm, parseCoords } from '../../utils/homeCareGeo';
import { requireHomeCarePatient } from '../../utils/homeCarePatientAuth';
import NurseAvatar from '../Dashboard/HomeCare/NurseAvatar';
import './HomeCare.css';

function NurseCard({ nurse, onBook, onProfile }) {
  const daily = feeForDuration(nurse, 'daily');
  const dist =
    nurse.distanceKm != null && parseCoords(nurse) ? ` · ${formatDistanceKm(nurse.distanceKm)}` : '';
  return (
    <div className="hc-card">
      <div className="hc-nurse-card-head">
        <NurseAvatar nurse={nurse} size={48} className="hc-nurse-card-avatar" />
        <div>
          <h3>{nurse.fullName}</h3>
          <p className="hc-card-meta">
            {nurse.specialty || 'General Nursing'} · {nurse.yearsExperience || 0} yrs{dist}
          </p>
        </div>
      </div>
      <p className="hc-stars">★ {(nurse.ratingAvg || 0).toFixed(1)} ({nurse.ratingCount || 0})</p>
      <p className="hc-card-meta">From {formatGhs(daily.amount)} {daily.label}</p>
      <p className="hc-card-meta" style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>Fee may vary</p>
      <div className="hc-actions">
        <button type="button" className="hc-btn hc-btn-outline" onClick={onProfile}>Profile</button>
        <button type="button" className="hc-btn" onClick={onBook}>Book</button>
      </div>
    </div>
  );
}

export default function HomeCareHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [nurses, setNurses] = useState([]);
  const [recent, setRecent] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const loc = await getCurrentLocationMobile();
        const approved = await fetchApprovedNurses({
          latitude: loc?.latitude,
          longitude: loc?.longitude,
        });
        setNurses(approved);
        if (auth.currentUser) {
          setRecent(await fetchRecentlyHiredNurses(auth.currentUser.uid));
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = nurses.filter((n) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (n.fullName || '').toLowerCase().includes(q) ||
      (n.specialty || '').toLowerCase().includes(q)
    );
  });

  const book = (nurse) => {
    if (!requireHomeCarePatient(navigate, { returnTo: `/home-care/book/${nurse.id}` })) return;
    navigate(`/home-care/book/${nurse.id}`);
  };

  return (
    <div className="hc-page">
      <div className="hc-hero">
        <h1>Home Care</h1>
        <p>Find verified nurses for care at home. {FEE_DISCLAIMER}</p>
      </div>

      <div className="hc-search">
        <input
          placeholder="Search nurses or specialty…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="hc-btn" onClick={() => navigate(`/home-care/search?q=${encodeURIComponent(search)}`)}>
          Search
        </button>
      </div>

      <div className="hc-card hc-emergency">
        <strong>🚨 Emergency request</strong>
        <p className="hc-card-meta" style={{ marginTop: 6 }}>Broadcast to online nurses within ~25 km.</p>
        <button type="button" className="hc-btn" style={{ marginTop: 8, background: '#b91c1c' }} onClick={() => {
          if (!requireHomeCarePatient(navigate, { returnTo: '/home-care/emergency' })) return;
          navigate('/home-care/emergency');
        }}>
          Request emergency care
        </button>
      </div>

      {recent.length > 0 ? (
        <>
          <h2 style={{ fontSize: '1rem', color: '#134e4a', margin: '1rem 0 0.75rem' }}>Recently hired</h2>
          <div className="hc-grid">
            {recent.map((n) => (
              <NurseCard key={n.id} nurse={n} onProfile={() => navigate(`/home-care/nurse/${n.id}`)} onBook={() => book(n)} />
            ))}
          </div>
        </>
      ) : null}

      {auth.currentUser ? (
        <p style={{ marginBottom: '1rem' }}>
          <Link to="/home-care/history" className="hc-btn hc-btn-outline">My visit history</Link>
        </p>
      ) : (
        <p className="hc-card-meta" style={{ marginBottom: '1rem' }}>
          <Link to="/home-care/sign-up" state={{ returnTo: '/home-care' }} onClick={() => localStorage.setItem('userIntent', 'homecare')}>
            Sign up
          </Link>
          {' or '}
          <Link to="/login" state={{ returnTo: '/home-care' }} onClick={() => localStorage.setItem('userIntent', 'homecare')}>
            sign in
          </Link>
          {' '}to book a nurse.
        </p>
      )}

      <h2 style={{ fontSize: '1rem', color: '#134e4a', marginBottom: '0.75rem' }}>Top rated</h2>
      {loading ? <p className="hc-empty">Loading…</p> : null}
      {!loading && filtered.length === 0 ? (
        <p className="hc-empty">No nurses available yet. An admin can onboard nurses from the dashboard.</p>
      ) : null}

      <div className="hc-grid">
        {filtered.slice(0, 12).map((n) => (
          <NurseCard
            key={n.id}
            nurse={n}
            onProfile={() => navigate(`/home-care/nurse/${n.id}`)}
            onBook={() => book(n)}
          />
        ))}
      </div>

      <h2 style={{ fontSize: '1rem', color: '#134e4a', margin: '1.5rem 0 0.75rem' }}>Browse by specialty</h2>
      <div className="hc-chip-row">
        {HOME_CARE_SPECIALTIES.map((s) => (
          <button key={s} type="button" className="hc-chip" onClick={() => navigate(`/home-care/search?specialty=${encodeURIComponent(s)}`)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
