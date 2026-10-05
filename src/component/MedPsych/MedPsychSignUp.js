import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import {
  REQUIRED_POLICIES, allPoliciesAccepted, getFlow, updateFlow,
} from '../../utils/medpsychFlow';
import ZenCareEmblem from '../Common/ZenCareEmblem';
import { policyUrlForKey } from '../../utils/nessaHubPolicies';
import '../../styles/zencare.css';
import './MedPsych.css';

/**
 * MedPsych sign-up — the policy gate.
 *
 * Nothing here touches the database. The details and the consent ticks are held
 * in the cached flow, and the account is only created at the end, once a
 * psychiatrist has been chosen and the consultation paid for.
 *
 * The gate itself is the point of this screen: the Continue button stays
 * disabled until every policy is ticked individually. There is no "accept all"
 * shortcut, because consent that was given by one click on a bundle is not
 * meaningfully consent to four separate documents — and this one includes an
 * acknowledgement that a second opinion does not replace the user's existing
 * care, which is exactly the sort of thing a bundle would bury.
 */
export default function MedPsychSignUp({ service = 'medpsych' }) {
  // Both services share this policy gate: the consents are the same, and so is
  // the rule that nothing is written until payment. Only the label and where
  // "continue" leads differ.
  const isSecondOpinion = service === 'second_opinion';
  const navigate = useNavigate();
  const cached = getFlow();

  const [form, setForm] = useState({
    fullName: cached.details?.fullName || '',
    email: cached.details?.email || '',
    phone: cached.details?.phone || '',
    password: cached.details?.password || '',
    confirm: cached.details?.password || '',
  });
  const [accepted, setAccepted] = useState(cached.acceptedPolicies || []);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const togglePolicy = (key) => {
    setAccepted((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const detailsComplete = form.fullName.trim() && form.email.trim() && form.password;
  const policiesDone = allPoliciesAccepted(accepted);
  const remaining = useMemo(
    () => REQUIRED_POLICIES.filter((p) => !accepted.includes(p.key)).length,
    [accepted],
  );

  const submit = (e) => {
    e.preventDefault();
    if (!detailsComplete) { setError('Please complete your details.'); return; }
    if (form.password.length < 8) { setError('Choose a password of at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setError('The two passwords do not match.'); return; }
    if (!policiesDone) { setError('Every policy must be accepted before you can continue.'); return; }

    setError('');
    updateFlow({
      step: 'therapist',
      details: {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
      },
      acceptedPolicies: accepted,
    });
    // Second Opinion asks a SHORT case intake instead of the full programme
    // questionnaire: this client already has a clinician and wants a view on
    // one decision, not a treatment plan. The long questionnaire is asked only
    // if they later convert to membership.
    if (isSecondOpinion) {
      updateFlow({ serviceType: 'second_opinion', step: 'intake' });
      navigate('/second-opinion/intake');
      return;
    }
    updateFlow({ serviceType: 'medpsych', step: 'intake' });
    navigate('/questionnaire?flow=medpsych');
  };

  return (
    <div className="zc zc-shell zc-hero-ground mp-signup">
      {/* Decorative, so hidden from assistive tech. Not drawn on Second
          Opinion: that page's copy runs longer and the artwork crowded it. */}
      {!isSecondOpinion && <ZenCareEmblem className="mp-emblem" size={620} />}

      <div className="zc-container mp-signup-inner">
        <span className="zc-badge">{isSecondOpinion ? 'Second Opinion' : 'Psychology & Counseling'}</span>

        {/* Two different services share this gate, so the copy has to say which
            one you are signing up for. This page carried the second-opinion
            pitch because that is what the module originally was; Psychology &
            Counseling is ongoing talking therapy and needed its own words. */}
        {isSecondOpinion ? (
          <>
            <h1 className="zc-display mp-signup-title">
              A second opinion, <em>on your terms</em>.
            </h1>
            <p className="zc-body mp-signup-lead">
              Already seeing someone for your mental health? Have your diagnosis,
              treatment plan or medication reviewed independently. Tell us what you
              would like looked at, choose a specialist, and book one consultation —
              no programme to join.
            </p>
          </>
        ) : (
          <>
            <h1 className="zc-display mp-signup-title">
              Therapy that <em>fits your life</em>.
            </h1>
            <p className="zc-body mp-signup-lead">
              Ongoing talking therapy with a psychologist or counsellor. We start
              with a short questionnaire so we can match you well, then you choose
              your therapist and book your first session.
            </p>
          </>
        )}

        <form className="zc-card mp-signup-card" onSubmit={submit} noValidate>
          <p className="zc-eyebrow">Your details</p>

          <div className="mp-field-grid">
            <div>
              <label className="zc-label" htmlFor="mp-name">Full name</label>
              <input id="mp-name" className="zc-input" value={form.fullName}
                onChange={set('fullName')} autoComplete="name" placeholder="Your full name" />
            </div>
            <div>
              <label className="zc-label" htmlFor="mp-email">Email</label>
              <input id="mp-email" type="email" className="zc-input" value={form.email}
                onChange={set('email')} autoComplete="email" placeholder="you@example.com" />
            </div>
            <div>
              <label className="zc-label" htmlFor="mp-phone">Phone <span className="mp-optional">optional</span></label>
              <input id="mp-phone" className="zc-input" value={form.phone}
                onChange={set('phone')} autoComplete="tel" placeholder="+233 …" />
            </div>
            <div />
            <div>
              <label className="zc-label" htmlFor="mp-pass">Password</label>
              <input id="mp-pass" type="password" className="zc-input" value={form.password}
                onChange={set('password')} autoComplete="new-password" placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="zc-label" htmlFor="mp-confirm">Confirm password</label>
              <input id="mp-confirm" type="password" className="zc-input" value={form.confirm}
                onChange={set('confirm')} autoComplete="new-password" placeholder="Repeat your password" />
            </div>
          </div>

          <hr className="zc-rule" />

          <p className="zc-eyebrow">Before you continue</p>
          <p className="zc-meta mp-policy-lead">
            Each of these must be read and accepted individually. Your acceptance is recorded
            with the date and time.
          </p>

          <div className="zc-stack mp-policy-list">
            {REQUIRED_POLICIES.map((p) => {
              const on = accepted.includes(p.key);
              return (
                <label key={p.key} className={`zc-check${on ? ' zc-check--on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => togglePolicy(p.key)} />
                  <span className="zc-check-text">
                    <strong>{p.label}</strong>
                    <br />
                    {p.summary}{' '}
                    <a
                      className="zc-link"
                      href={policyUrlForKey(p.key)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Read in full
                    </a>
                  </span>
                </label>
              );
            })}
          </div>

          {error ? <p className="mp-error">{error}</p> : null}

          <div className="mp-submit-row">
            <button
              type="submit"
              className="zc-btn zc-btn--primary zc-btn--block"
              disabled={!detailsComplete || !policiesDone}
            >
              Choose a psychiatrist <ChevronRight size={16} />
            </button>
            {!policiesDone && (
              <p className="zc-meta mp-gate-hint">
                <ShieldCheck size={13} />
                {remaining} {remaining === 1 ? 'policy' : 'policies'} still to accept
              </p>
            )}
          </div>

          <p className="zc-meta mp-nodb-note">
            Nothing is saved to your record until you have booked and paid for a consultation.
          </p>
        </form>
      </div>
    </div>
  );
}
