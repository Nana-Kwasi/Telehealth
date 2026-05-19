import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../Auth/firebaseConfig';
import { fetchPatientBookings } from '../../services/homeCareService';
import { statusLabel } from '../../utils/homeCareUtils';
import './HomeCare.css';

export default function HomeCareHistory() {
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
        setList(await fetchPatientBookings(uid));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  return (
    <div className="hc-page">
      <p><Link to="/home-care">← Home Care</Link></p>
      <h1>My visits</h1>
      {loading ? <p className="hc-empty">Loading…</p> : null}
      {!loading && list.length === 0 ? <p className="hc-empty">No bookings yet.</p> : null}
      {list.map((b) => (
        <div key={b.id} className="hc-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/home-care/booking/${b.id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/home-care/booking/${b.id}`)}>
          <span className="hc-status">{statusLabel(b.status)}</span>
          <h3>{b.nurseName}</h3>
          <p className="hc-card-meta">{b.startDate} · {b.careType}</p>
        </div>
      ))}
    </div>
  );
}
