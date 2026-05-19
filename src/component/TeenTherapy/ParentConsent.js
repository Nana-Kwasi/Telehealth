import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  buildTeenOnboardPayload,
  loadJson,
  saveJson,
  TEEN_STORAGE_KEYS,
} from '../../utils/teenTherapyStorage';
import TeenIntakeLayout from './TeenIntakeLayout';
import { TEEN_CONSENT_ITEMS } from '../../utils/teenTherapyConfig';
import { nessaHubPolicyUrl, NESSA_HUB_POLICY_LINKS } from '../../constants/nessaHubPolicies';
import './TeenTherapyIntake.css';

export default function ParentConsent() {
  const navigate = useNavigate();
  const [consents, setConsents] = useState({
    treatmentConsent: false,
    privacyConsent: false,
    emergencyConsent: false,
    communicationConsent: false,
    billingConsent: false,
  });
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const date = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const parent = loadJson(TEEN_STORAGE_KEYS.parent);
    const child = loadJson(TEEN_STORAGE_KEYS.child);
    if (!parent.firstName) navigate('/teen/parent-guardian', { replace: true });
    else if (!child.firstName) navigate('/teen/child', { replace: true });
  }, [navigate]);

  const allAccepted = Object.values(consents).every(Boolean);

  const toggle = (key) => setConsents((c) => ({ ...c, [key]: !c[key] }));

  const onSubmit = (ev) => {
    ev.preventDefault();
    setError('');
    if (!allAccepted) {
      setError('Please accept all consents to proceed.');
      return;
    }
    if (!signature.trim()) {
      setError('Please provide your electronic signature (full name).');
      return;
    }

    const consentData = {
      ...consents,
      signature: signature.trim(),
      date,
      signedAt: new Date().toISOString(),
    };

    saveJson(TEEN_STORAGE_KEYS.consent, consentData);
    saveJson(TEEN_STORAGE_KEYS.onboard, buildTeenOnboardPayload(consentData));
    navigate('/questionnaire');
  };

  return (
    <TeenIntakeLayout
      step={3}
      title="Parent/Guardian Consent"
      subtitle="Please review and accept the following consents to register your child for therapy services."
    >
      <form onSubmit={onSubmit}>
        {TEEN_CONSENT_ITEMS.map((item) => (
          <div key={item.key} className="teen-intake-consent-row">
            <label className="teen-intake-consent-main">
              <input
                type="checkbox"
                checked={consents[item.key]}
                onChange={() => toggle(item.key)}
              />
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </label>
            {item.policySlug ? (
              <a
                className="teen-intake-consent-link"
                href={nessaHubPolicyUrl(item.policySlug)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Read full ${item.title} policy`}
                title="Read full policy"
              >
                →
              </a>
            ) : null}
          </div>
        ))}

        <section className="teen-intake-card">
          <h2>Electronic Signature</h2>
          <p className="section-hint">
            By typing your full name below, you are providing your electronic signature, which has the
            same legal effect as a handwritten signature.
          </p>
          <div className="teen-field">
            <label>
              Full Name (Parent/Guardian) <span className="req">*</span>
            </label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Type your full name as your electronic signature"
            />
          </div>
          <p className="teen-field-hint">Date: {date}</p>
        </section>

        <div className="teen-note">
          <strong>Important Note</strong>
          <p>
            By proceeding, you acknowledge that you are the legal parent or guardian of the child being
            registered, and you have the authority to consent to treatment on their behalf. You also agree
            to our{' '}
            <a href={NESSA_HUB_POLICY_LINKS.terms} target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href={NESSA_HUB_POLICY_LINKS.privacy} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {error ? <p className="teen-field-error">{error}</p> : null}

        <div className="teen-actions">
          <button type="button" className="btn" onClick={() => navigate('/teen/child')}>
            Back
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={!allAccepted || !signature.trim()}
          >
            I Agree and Continue to Questionnaire
          </button>
        </div>
      </form>
    </TeenIntakeLayout>
  );
}
