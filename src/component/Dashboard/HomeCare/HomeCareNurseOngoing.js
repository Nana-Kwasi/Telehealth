import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useHomeCareNurse } from './HomeCareNurseContext';
import { markBookingOngoing } from '../../../services/homeCareService';
import { statusLabel } from '../../../utils/homeCareUtils';
import { PACKAGE_DURATION_TYPES } from '../../../constants/homeCareConstants';
import './HomeCareNurseDashboard.css';

export default function HomeCareNurseOngoing({ embedded = false }) {
  const navigate = useNavigate();
  const { ongoing, refresh } = useHomeCareNurse();

  const body = (
    <>
      {ongoing.length === 0 ? (
        <p className="hcn-empty">No ongoing engagements.</p>
      ) : (
        ongoing.map((b) => (
          <div key={b.id} className="hcn-card">
            <h3>{b.patientName}</h3>
            <p className="hcn-card-meta">{b.durationType} · {statusLabel(b.status)}</p>
            <p className="hcn-card-meta">{b.address}</p>
            <div className="hcn-actions">
              {b.status !== 'ongoing' ? (
                <button
                  type="button"
                  className="hcn-btn"
                  onClick={async () => {
                    await markBookingOngoing(b.id);
                    refresh();
                  }}
                >
                  Mark ongoing
                </button>
              ) : null}
              {b.status === 'ongoing' && PACKAGE_DURATION_TYPES.includes(b.durationType) ? (
                <button type="button" className="hcn-btn" onClick={() => navigate(`/dashboard/visit/${b.id}`)}>
                  Submit visit log
                </button>
              ) : null}
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
        <h1>Ongoing engagements</h1>
        <p>Weekly, monthly, or yearly packages in progress.</p>
      </header>
      {body}
    </div>
  );
}
