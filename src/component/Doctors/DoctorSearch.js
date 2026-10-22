import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../../services/firestoreShim';
import { collection, getDocs } from '../../services/firestoreShim';
import './DoctorSearch.css';
import Paged from '../Common/Paged';
import { api } from '../../services/apiClient';
import { careCatalog } from '../../services/careTransfers';

// Fallback until the server's list (the one doctors are onboarded with) loads.
const FALLBACK_SPECIALTIES = [
  'General Practice', 'Internal Medicine', 'Family Medicine',
  'Pediatrics', 'Psychiatry', 'Dermatology', 'Cardiology', 'Neurology',
  'Orthopedics', 'Obstetrics and Gynecology', 'Ophthalmology', 'ENT', 'Urology',
];

const LANGUAGES = ['Any Language', 'English', 'French', 'Spanish', 'Arabic', 'Portuguese', 'Twi', 'Hausa'];

const DEFAULT_FILTERS = {
  visitType: 'all',
  specialty: 'All Specialties',
  rating: 0,
  maxFee: '',
  language: 'Any Language',
  gender: 'any',
};

function getInitials(name) {
  if (!name) return 'Dr';
  const parts = name.trim().split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function getConsultTypes(types) {
  if (!types) return [];
  if (Array.isArray(types)) return types;
  if (typeof types === 'object') return Object.entries(types).filter(([, v]) => v).map(([k]) => k);
  return [];
}

function StarRow({ rating, size = 'sm' }) {
  return (
    <span className={`ds-stars ${size}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < Math.round(rating) ? 'ds-star filled' : 'ds-star'}>★</span>
      ))}
    </span>
  );
}

export default function DoctorSearch({ session }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [filters, setFilters] = useState({
    ...DEFAULT_FILTERS,
    specialty: searchParams.get('specialty') || 'All Specialties',
  });

  // Same matching the transfer and reassignment flows use: the exact specialty
  // first (best), then related specialties (close). Keyed by doctor id.
  const [specialties, setSpecialties] = useState(FALLBACK_SPECIALTIES);
  const [matchMap, setMatchMap] = useState({});
  useEffect(() => {
    careCatalog().then((c) => { if (c?.doctorSpecialties?.length) setSpecialties(c.doctorSpecialties); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (filters.specialty === 'All Specialties') { setMatchMap({}); return undefined; }
    let live = true;
    api(`/api/v1/matching/doctors?specialty=${encodeURIComponent(filters.specialty)}`, { authenticated: false })
      .then((m) => {
        if (!live) return;
        const map = {};
        [...(m?.best || []), ...(m?.close || [])].forEach((d) => { map[d.id] = d; });
        setMatchMap(map);
      })
      .catch(() => { if (live) setMatchMap({}); });
    return () => { live = false; };
  }, [filters.specialty]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'doctors'));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => d.status !== 'inactive');
        setDoctors(list);
      } catch (err) {
        console.error('Error fetching doctors:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }));

  const isGeneralDoctor = (d) =>
    ['general practice', 'family medicine', 'internal medicine'].includes(
      (d.specialization || '').toLowerCase()
    );

  const matchesFilters = (d) => {
    if (filters.rating > 0 && (d.averageRating || 0) < filters.rating) return false;
    if (filters.maxFee !== '' && (d.consultationFee || 0) > parseFloat(filters.maxFee)) return false;
    if (filters.language !== 'Any Language') {
      const langs = Array.isArray(d.languages) ? d.languages.join(' ') : (d.languages || '');
      if (!langs.toLowerCase().includes(filters.language.toLowerCase())) return false;
    }
    if (filters.gender !== 'any' && d.gender) {
      if (d.gender.toLowerCase() !== filters.gender) return false;
    }
    if (filters.visitType !== 'all') {
      const types = getConsultTypes(d.consultationTypes);
      if (!types.includes(filters.visitType)) return false;
    }
    return true;
  };

  const filtered = doctors.filter(d => {
    if (!matchesFilters(d)) return false;

    // Always include General Practice doctors
    if (isGeneralDoctor(d)) return true;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = [d.name, d.specialization, d.bio].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.specialty !== 'All Specialties') {
      const matched = Object.keys(matchMap).length > 0;
      if (matched ? !matchMap[d.id] : !(d.specialization || '').toLowerCase().includes(filters.specialty.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => {
    // Best matches, then close matches, then everyone else (general practice).
    const rank = (d) => (matchMap[d.id]?.tier === 'best' ? 0 : matchMap[d.id] ? 1 : 2);
    return rank(a) - rank(b) || (matchMap[b.id]?.score || 0) - (matchMap[a.id]?.score || 0);
  });

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <div className="ds-page">

      {/* Intake match banner */}
      {(searchParams.get('specialty') || searchParams.get('q')) && (
        <div className="ds-intake-banner">
          <span>🩺 Showing doctors matched to your condition.</span>
          <button className="ds-intake-clear" onClick={() => navigate('/doctors')}>Clear match</button>
        </div>
      )}

      {/* ── Search Hero ── */}
      <div className="ds-hero">
        <div className="ds-hero-inner">
          <p className="ds-hero-eyebrow">NessaHub Medical</p>
          <h1 className="ds-hero-title">Find the right doctor for you</h1>
          <p className="ds-hero-sub">
            Search by specialty, symptom, or condition. Book a virtual appointment in seconds.
          </p>
          <div className="ds-search-bar">
            <span className="ds-search-icon-wrap">🔍</span>
            <input
              className="ds-search-input"
              placeholder="Search by specialty, symptom, or doctor name…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button className="ds-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear">✕</button>
            )}
          </div>
          <div className="ds-hero-chips">
            {['General Practice', 'Psychiatry', 'Dermatology', 'Pediatrics', 'Cardiology'].map(s => (
              <button
                key={s}
                className="ds-hero-chip"
                onClick={() => { setFilter('specialty', s); setSearchQuery(s); }}
              >{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="ds-body">

        {/* ── Filters Sidebar ── */}
        <aside className="ds-sidebar">
          <div className="ds-sidebar-header">
            <h3 className="ds-sidebar-title">Filters</h3>
            <button className="ds-reset-btn" onClick={resetFilters}>Reset</button>
          </div>

          <div className="ds-filter-group">
            <div className="ds-filter-label">Consultation Type</div>
            {[['all', 'Any type'], ['video', '📹 Video'], ['audio', '📞 Audio'], ['chat', '💬 Chat']].map(([val, label]) => (
              <label key={val} className="ds-filter-radio">
                <input type="radio" name="visitType" checked={filters.visitType === val} onChange={() => setFilter('visitType', val)} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="ds-filter-group">
            <div className="ds-filter-label">Specialty</div>
            <select className="ds-filter-select" value={filters.specialty} onChange={e => setFilter('specialty', e.target.value)}>
              {['All Specialties', ...specialties].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="ds-filter-group">
            <div className="ds-filter-label">Minimum Rating</div>
            {[[0, 'Any rating'], [3, '3★ & above'], [4, '4★ & above'], [4.5, '4.5★ & above']].map(([val, label]) => (
              <label key={val} className="ds-filter-radio">
                <input type="radio" name="rating" checked={filters.rating === val} onChange={() => setFilter('rating', val)} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="ds-filter-group">
            <div className="ds-filter-label">Max Fee (USD)</div>
            <input
              className="ds-filter-input"
              type="number"
              placeholder="No limit"
              value={filters.maxFee}
              onChange={e => setFilter('maxFee', e.target.value)}
              min="0"
              step="10"
            />
          </div>

          <div className="ds-filter-group">
            <div className="ds-filter-label">Language</div>
            <select className="ds-filter-select" value={filters.language} onChange={e => setFilter('language', e.target.value)}>
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>

          <div className="ds-filter-group">
            <div className="ds-filter-label">Gender Preference</div>
            {[['any', 'No preference'], ['male', 'Male doctor'], ['female', 'Female doctor']].map(([val, label]) => (
              <label key={val} className="ds-filter-radio">
                <input type="radio" name="gender" checked={filters.gender === val} onChange={() => setFilter('gender', val)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </aside>

        {/* ── Results ── */}
        <main className="ds-results">
          <div className="ds-results-header">
            <span className="ds-results-count">
              {loading
                ? 'Finding doctors…'
                : `${filtered.length} doctor${filtered.length !== 1 ? 's' : ''} available`}
            </span>
          </div>

          {loading ? (
            <div className="ds-loading">
              <div className="ds-spinner" />
              <p>Finding doctors near you…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="ds-empty">
              <div className="ds-empty-icon">🩺</div>
              <h3>No doctors found</h3>
              <p>Try adjusting your search or filters.</p>
              <button className="ds-reset-inline-btn" onClick={() => { setSearchQuery(''); resetFilters(); }}>
                Clear all
              </button>
            </div>
          ) : (
            <div className="ds-cards">
              <Paged items={filtered}>{(filtered) => filtered.map(doctor => {
                const types = getConsultTypes(doctor.consultationTypes);
                const rating = doctor.averageRating || 0;
                const reviews = doctor.totalReviews || 0;
                const langs = Array.isArray(doctor.languages)
                  ? doctor.languages
                  : (doctor.languages || '').split(',').map(l => l.trim()).filter(Boolean);

                return (
                  <div key={doctor.id} className="ds-card" onClick={() => navigate(`/doctors/${doctor.id}`)}>
                    {/* Avatar */}
                    <div className="ds-card-avatar">
                      {(doctor.profileImageUrl || doctor.profileImage) ? (
                        <img src={doctor.profileImageUrl || doctor.profileImage} alt={doctor.name} className="ds-avatar-img" />
                      ) : (
                        <span className="ds-avatar-initials">{getInitials(doctor.name)}</span>
                      )}
                      {reviews >= 5 && <span className="ds-verified-dot" title="Verified provider" />}
                    </div>

                    {/* Info */}
                    <div className="ds-card-body">
                      <div className="ds-card-name-row">
                        <h3 className="ds-card-name">Dr. {doctor.name}</h3>
                        {matchMap[doctor.id] ? (
                          <span className={`ds-match-badge ${matchMap[doctor.id].tier}`}>
                            {matchMap[doctor.id].tier === 'best' ? 'Best match' : 'Close match'}
                          </span>
                        ) : null}
                        <span className="ds-verified-badge">✓ Verified</span>
                      </div>
                      <p className="ds-card-specialty">{doctor.specialization || 'General Practice'}</p>

                      <div className="ds-card-rating">
                        <StarRow rating={rating} />
                        <span className="ds-rating-num">{rating > 0 ? rating.toFixed(1) : 'New'}</span>
                        <span className="ds-rating-count">({reviews} review{reviews !== 1 ? 's' : ''})</span>
                        {doctor.experience && (
                          <span className="ds-exp-badge">{doctor.experience} yrs exp</span>
                        )}
                      </div>

                      {langs.length > 0 && (
                        <div className="ds-card-langs">
                          {langs.slice(0, 3).map(l => <span key={l} className="ds-lang-tag">{l}</span>)}
                        </div>
                      )}

                      <div className="ds-card-types">
                        {types.map(t => (
                          <span key={t} className={`ds-type-badge type-${t}`}>
                            {t === 'video' ? '📹' : t === 'audio' ? '📞' : '💬'} {t.charAt(0).toUpperCase() + t.slice(1)}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right column */}
                    <div className="ds-card-right">
                      <div className="ds-card-fee">
                        {doctor.consultationFee ? `GHS ${doctor.consultationFee}` : 'Free'}
                      </div>
                      <div className="ds-card-fee-label">per session</div>
                      <button
                        className="ds-book-btn"
                        onClick={e => { e.stopPropagation(); navigate(`/doctors/${doctor.id}`); }}
                      >
                        Book Now
                      </button>
                    </div>
                  </div>
                );
              })}</Paged>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
