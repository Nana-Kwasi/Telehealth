import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchApprovedNurses, getCurrentLocationMobile } from '../../services/homeCareService';
import { formatGhs, feeForDuration } from '../../utils/homeCareUtils';
import { formatDistanceKm, parseCoords } from '../../utils/homeCareGeo';
import { requireHomeCarePatient } from '../../utils/homeCarePatientAuth';
import NurseAvatar from '../Dashboard/HomeCare/NurseAvatar';
import './HomeCare.css';
import Paged from '../Common/Paged';

export default function HomeCareSearch() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [nurses, setNurses] = useState([]);
  const [loading, setLoading] = useState(true);
  const q = params.get('q') || '';
  const specialty = params.get('specialty') || '';

  useEffect(() => {
    (async () => {
      try {
        const loc = await getCurrentLocationMobile();
        const list = await fetchApprovedNurses({
          specialty: specialty || undefined,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
        });
        const query = q.trim().toLowerCase();
        setNurses(
          query
            ? list.filter(
                (n) =>
                  (n.fullName || '').toLowerCase().includes(query) ||
                  (n.specialty || '').toLowerCase().includes(query),
              )
            : list,
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [q, specialty]);

  const book = (id) => {
    if (!requireHomeCarePatient(navigate, { returnTo: `/home-care/book/${id}` })) return;
    navigate(`/home-care/book/${id}`);
  };

  return (
    <div className="hc-page">
      <p><Link to="/home-care">← Home Care</Link></p>
      <h1>{specialty || 'Search results'}</h1>
      {loading ? <p className="hc-empty">Loading…</p> : null}
      <div className="hc-grid">
        <Paged items={nurses}>{(nurses) => nurses.map((n) => {
          const daily = feeForDuration(n, 'daily');
          const dist =
            n.distanceKm != null && parseCoords(n) ? ` · ${formatDistanceKm(n.distanceKm)}` : '';
          return (
            <div key={n.id} className="hc-card">
              <div className="hc-nurse-card-head">
                <NurseAvatar nurse={n} size={48} className="hc-nurse-card-avatar" />
                <h3>{n.fullName}</h3>
              </div>
              <p className="hc-card-meta">
                {n.specialty} · {n.yearsExperience || 0} yrs{dist}
              </p>
              <p className="hc-card-meta">From {formatGhs(daily.amount)} {daily.label}</p>
              <div className="hc-actions">
                <button type="button" className="hc-btn hc-btn-outline" onClick={() => navigate(`/home-care/nurse/${n.id}`)}>Profile</button>
                <button type="button" className="hc-btn" onClick={() => book(n.id)}>Book</button>
              </div>
            </div>
          );
        })}</Paged>
      </div>
    </div>
  );
}
