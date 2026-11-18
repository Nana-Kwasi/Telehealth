import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import '../../Common/CareTransfers.css';

/**
 * Clinician profiles that cannot be matched reliably yet — saved before the
 * onboarding fields were required. Patients are matched (and transfers are
 * reassigned) from these fields, so each gap here is someone the system may
 * show to the wrong people or never show at all.
 */
export default function AdminProfileReadiness() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api('/api/v1/admin/matching/incomplete-profiles')
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => { setRows([]); setError(e.message); });
  }, []);

  return (
    <div className="ct-page">
      <div className="ct-head">
        <h2>Clinician profile completeness</h2>
        <p>Doctors and therapists whose profiles are missing what matching needs. Open a profile to fill in what is listed — it saves straight to the details matching reads.</p>
      </div>
      {error ? <div className="ct-error">{error}</div> : null}
      {rows === null ? <div className="ct-empty">Loading…</div> : rows.length === 0 ? (
        <div className="ct-ok">Every doctor and therapist profile is complete.</div>
      ) : (
        <div className="pr-ready">
          {rows.map((r) => {
            const initials = String(r.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
            return (
              <div key={`${r.kind}-${r.id}`} className="pr-ready-card">
                <div className="pr-ready-top">
                  <div className={`pr-ready-avatar ${r.kind}`} aria-hidden>{initials}</div>
                  <div className="pr-ready-name">
                    <strong>{r.kind === 'doctor' ? `Dr. ${r.name}` : r.name}</strong>
                    <span>{r.kind === 'doctor' ? 'Doctor' : 'Therapist'}</span>
                  </div>
                  <span className="ct-badge warn">{r.missing.length} to fix</span>
                </div>
                <ul className="pr-ready-missing" aria-label="Missing from the profile">
                  {r.missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
                <div className="pr-ready-foot">
                  <button type="button" className="ct-btn primary"
                    onClick={() => navigate(`/dashboard/users/${r.kind === 'doctor' ? 'doctors' : 'therapists'}/${r.id}?tab=professional`)}>
                    Fix profile
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
