import React, { useState } from 'react';
import { useHomeCareNurse } from './HomeCareNurseContext';
import { updateNurseAvailability } from '../../../services/homeCareService';
import './HomeCareNurseDashboard.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function HomeCareNurseAvailability({ embedded = false }) {
  const { profile, nurse } = useHomeCareNurse();
  const [avail, setAvail] = useState({
    workingDays: nurse?.availability?.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    startHour: nurse?.availability?.startHour || '08:00',
    endHour: nurse?.availability?.endHour || '17:00',
  });
  const [saved, setSaved] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    await updateNurseAvailability(profile.id, avail);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const body = (
    <form className="hcn-card hcn-form" onSubmit={save}>
      <label>Working days</label>
      <div className="hcn-chip-row">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            className={`hcn-chip ${avail.workingDays.includes(d) ? 'active' : ''}`}
            onClick={() => setAvail((a) => ({
              ...a,
              workingDays: a.workingDays.includes(d)
                ? a.workingDays.filter((x) => x !== d)
                : [...a.workingDays, d],
            }))}
          >
            {d}
          </button>
        ))}
      </div>
      <label>Start time</label>
      <input value={avail.startHour} onChange={(e) => setAvail({ ...avail, startHour: e.target.value })} />
      <label>End time</label>
      <input value={avail.endHour} onChange={(e) => setAvail({ ...avail, endHour: e.target.value })} />
      <div className="hcn-actions">
        <button type="submit" className="hcn-btn">Save availability</button>
        {saved ? <span className="hcn-card-meta" style={{ alignSelf: 'center' }}>Saved ✓</span> : null}
      </div>
    </form>
  );

  if (embedded) return body;

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>Availability & schedule</h1>
        <p>Patients see your working days when booking.</p>
      </header>
      {body}
    </div>
  );
}
