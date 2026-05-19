import React from 'react';
import { useHomeCareNurse } from './HomeCareNurseContext';
import { nurseAcceptBooking, nurseDeclineBooking } from '../../../services/homeCareService';
import { maskPatientName, formatGhs } from '../../../utils/homeCareUtils';
import './HomeCareNurseDashboard.css';

export default function HomeCareNurseRequests({ embedded = false }) {
  const { nurse, pending, refresh } = useHomeCareNurse();

  const accept = async (b) => {
    await nurseAcceptBooking(b.id, nurse);
    refresh();
  };

  const decline = async (id) => {
    await nurseDeclineBooking(id);
    refresh();
  };

  const body = (
    <>
      {pending.length === 0 ? (
        <p className="hcn-empty">No pending requests right now.</p>
      ) : (
        pending.map((b) => (
          <div key={b.id} className="hcn-card">
            <h3>{maskPatientName(b.patientName)}</h3>
            <p className="hcn-card-meta">{b.careType} · {b.durationType}</p>
            <p className="hcn-card-meta">{b.address}</p>
            <p className="hcn-card-meta">Start: {b.startDate} · Ref. {formatGhs(b.referenceFeeAmount)}</p>
            {b.specialNotes ? <p className="hcn-card-meta">{b.specialNotes}</p> : null}
            <div className="hcn-actions">
              <button type="button" className="hcn-btn" onClick={() => accept(b)}>Accept</button>
              <button type="button" className="hcn-btn hcn-btn-outline" onClick={() => decline(b.id)}>Decline</button>
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
        <h1>Incoming requests</h1>
        <p>Accept or decline patient booking requests assigned to you.</p>
      </header>
      {body}
    </div>
  );
}
