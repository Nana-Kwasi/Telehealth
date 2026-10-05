import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import {
  REVIEW_AREAS, INTAKE_FIELDS, canSubmitIntake, toIntakeAnswers,
} from '../../utils/secondOpinionIntake';
import { updateFlow, getFlow } from '../../utils/medpsychFlow';
import '../../styles/zencare.css';
import '../MedPsych/MedPsych.css';

/**
 * Second Opinion — the case intake.
 *
 * Sits between sign-up and choosing a specialist. It is deliberately one short
 * screen: this client already has a clinician, and is here for a view on one
 * decision, not to start a programme. The full 27-step questionnaire belongs to
 * membership, and is asked only if they convert.
 *
 * Nothing is written here. The answers go into the cached flow and are
 * committed with the account after payment, exactly like the rest of it.
 */
export default function SecondOpinionIntake() {
  const navigate = useNavigate();
  const flow = getFlow();
  const [intake, setIntake] = useState(flow.intake || {
    reviewAreas: [], reason: '', currentDiagnosis: '', currentTreatment: '',
  });
  const [touched, setTouched] = useState(false);

  const toggleArea = (key) => {
    setIntake((prev) => {
      const areas = new Set(prev.reviewAreas || []);
      if (areas.has(key)) areas.delete(key); else areas.add(key);
      return { ...prev, reviewAreas: [...areas] };
    });
  };

  const ready = canSubmitIntake(intake);

  const continueToSpecialists = () => {
    setTouched(true);
    if (!ready) return;
    updateFlow({
      serviceType: 'second_opinion',
      intake: toIntakeAnswers(intake),
      step: 'therapist',
    });
    navigate('/medpsych/psychiatrists');
  };

  return (
    <div className="zc zc-shell zc-hero-ground mp-signup">
      <div className="zc-container mp-signup-inner">
        <span className="zc-badge">Second Opinion</span>
        <h1 className="zc-display mp-signup-title">An independent view<br />on your care.</h1>
        <p className="zc-body mp-signup-lead">
          Tell us what you would like reviewed. Your answers go only to the
          specialist you choose.
        </p>

        <div className="zc-card mp-signup-card">
          <h2 className="zc-eyebrow">What would you like reviewed?</h2>
          <p className="zc-meta mp-policy-lead">Choose everything that applies.</p>
          <div className="mp-slot-grid mp-slot-grid--labels">
            {REVIEW_AREAS.map((area) => {
              const on = (intake.reviewAreas || []).includes(area.key);
              return (
                <button
                  type="button"
                  key={area.key}
                  className={`mp-slot${on ? ' mp-slot--on' : ''}`}
                  onClick={() => toggleArea(area.key)}
                  aria-pressed={on}
                >
                  {area.label}
                </button>
              );
            })}
          </div>
          {touched && !(intake.reviewAreas || []).length && (
            <p className="mp-error">Choose at least one area to review.</p>
          )}
        </div>

        <div className="zc-card mp-signup-card">
          <h2 className="zc-eyebrow">About your care</h2>
          {INTAKE_FIELDS.map((f) => (
            <div className="mp-field-grid" key={f.key}>
              <label className="zc-label" htmlFor={`so-${f.key}`}>
                {f.label}{!f.required && <span className="mp-optional"> (optional)</span>}
              </label>
              {f.multiline ? (
                <textarea
                  id={`so-${f.key}`}
                  className="zc-input"
                  rows={3}
                  placeholder={f.placeholder}
                  value={intake[f.key] || ''}
                  onChange={(e) => setIntake({ ...intake, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  id={`so-${f.key}`}
                  className="zc-input"
                  placeholder={f.placeholder}
                  value={intake[f.key] || ''}
                  onChange={(e) => setIntake({ ...intake, [f.key]: e.target.value })}
                />
              )}
              {touched && f.required && !String(intake[f.key] || '').trim() && (
                <p className="mp-error">This one is needed so the specialist knows where to start.</p>
              )}
            </div>
          ))}

          {/* Reports are uploaded AFTER the account exists: the upload endpoint
              needs an owner id, and this flow has no account until payment. The
              specialist can also request anything missing in session. */}
          <p className="zc-meta mp-nodb-note">
            <FileText size={14} aria-hidden="true" />
            You can upload reports and previous assessments from your dashboard
            once your consultation is booked.
          </p>
        </div>

        <button type="button" className="zc-btn zc-btn--primary zc-btn--block" onClick={continueToSpecialists}>
          Choose a specialist <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
