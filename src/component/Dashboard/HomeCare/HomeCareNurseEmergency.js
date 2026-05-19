import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useHomeCareNurse } from './HomeCareNurseContext';
import { claimEmergencyBooking } from '../../../services/homeCareService';
import './HomeCareNurseDashboard.css';

export default function HomeCareNurseEmergency({ embedded = false }) {
  const navigate = useNavigate();
  const { nurse, emergency, refresh } = useHomeCareNurse();

  const claim = async (b) => {
    await claimEmergencyBooking(b.id, nurse);
    refresh();
    navigate(`/dashboard/visit/${b.id}`);
  };

  const body = (
    <>
      {emergency.length === 0 ? (
        <p className="hcn-empty">No open emergency requests.</p>
      ) : (
        emergency.map((b) => (
          <div key={b.id} className="hcn-card" style={{ borderColor: '#fecaca' }}>
            <h3>{b.careType} · Urgent</h3>
            <p className="hcn-card-meta">{b.address}</p>
            {b.specialNotes ? <p className="hcn-card-meta">{b.specialNotes}</p> : null}
            <p className="hcn-card-meta">Patient: {b.patientName}</p>
            <div className="hcn-actions">
              <button type="button" className="hcn-btn hcn-btn-danger" onClick={() => claim(b)}>Claim request</button>
            </div>
          </div>
        ))
      )}
    </>
  );

  if (embedded) return body;

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>Emergency requests</h1>
        <p>Open broadcasts — first nurse to claim gets the visit.</p>
      </header>
      {body}
    </div>
  );
}
