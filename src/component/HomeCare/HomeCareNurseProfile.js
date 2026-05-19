import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { requireHomeCarePatient } from '../../utils/homeCarePatientAuth';
import { fetchNurseById } from '../../services/homeCareService';
import { FEE_DISCLAIMER } from '../../constants/homeCareConstants';
import { formatGhs, feeForDuration } from '../../utils/homeCareUtils';
import NurseAvatar from '../Dashboard/HomeCare/NurseAvatar';
import './HomeCare.css';

export default function HomeCareNurseProfile() {
  const { nurseId } = useParams();
  const navigate = useNavigate();
  const [nurse, setNurse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setNurse(await fetchNurseById(nurseId));
      } finally {
        setLoading(false);
      }
    })();
  }, [nurseId]);

  const book = () => {
    if (!requireHomeCarePatient(navigate, { returnTo: `/home-care/book/${nurseId}` })) return;
    navigate(`/home-care/book/${nurseId}`);
  };

  if (loading) return <p className="hc-empty hc-page">Loading…</p>;
  if (!nurse) return <p className="hc-empty hc-page">Nurse not found.</p>;

  const daily = feeForDuration(nurse, 'daily');
  const weekly = feeForDuration(nurse, 'weekly');
  const monthly = feeForDuration(nurse, 'monthly');
  const yearly = feeForDuration(nurse, 'yearly');

  return (
    <div className="hc-page">
      <p><Link to="/home-care">← Home Care</Link></p>
      <div className="hc-card hc-profile-card">
        <div className="hc-profile-head">
          <NurseAvatar nurse={nurse} size={88} className="hc-profile-avatar" />
          <div>
            <h1 style={{ margin: 0 }}>{nurse.fullName}</h1>
            <p className="hc-card-meta">{nurse.specialty}</p>
            <p className="hc-stars">★ {(nurse.ratingAvg || 0).toFixed(1)} · {nurse.completedVisits || 0} visits</p>
          </div>
        </div>
        <p>{nurse.bio || 'No bio yet.'}</p>
        <p className="hc-card-meta">Languages: {(nurse.languages || []).join(', ') || '—'}</p>
        <hr />
        <p><strong>Reference fees</strong></p>
        <p className="hc-card-meta">{formatGhs(daily.amount)} {daily.label}</p>
        <p className="hc-card-meta">{formatGhs(weekly.amount)} {weekly.label}</p>
        <p className="hc-card-meta">{formatGhs(monthly.amount)} {monthly.label}</p>
        <p className="hc-card-meta">{formatGhs(yearly.amount)} {yearly.label}</p>
        <p className="hc-disclaimer">{FEE_DISCLAIMER}</p>
        <button type="button" className="hc-btn" onClick={book}>Request booking</button>
      </div>
    </div>
  );
}
