import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Thermometer, HeartPulse, Droplet, Baby, Bone, Eye, Ear, Wind, Stethoscope,
  ArrowLeft, ArrowRight, Clock, CalendarCheck, Zap, ShieldCheck,
} from 'lucide-react';
import './MedicalIntake.css';
import { api, getStoredToken, getStoredRole, getStoredUserId } from '../../services/apiClient';
import { chooseService } from '../../utils/careServices';
import { refreshSession } from '../Auth/authService';

/**
 * Medical Care intake — three short steps before the doctor list.
 *
 * Icons are line art rather than emoji. Emoji rendered at three different
 * weights across platforms and two of them were plainly wrong for the label
 * they sat above — a tooth for "Skin / Rash", a stethoscope for "Other" —
 * which is most of why the step read as unfinished.
 */
const CATEGORIES = [
  { Icon: Thermometer, label: 'Fever / Flu',   hint: 'Temperature, aches, cold',  keywords: ['General Practice', 'Internal Medicine', 'Family Medicine'] },
  { Icon: HeartPulse,  label: 'Heart / Chest', hint: 'Chest pain, palpitations',  keywords: ['Cardiology'] },
  { Icon: Droplet,     label: 'Skin / Rash',   hint: 'Rashes, itching, acne',     keywords: ['Dermatology'] },
  { Icon: Baby,        label: 'Child Health',  hint: 'Under-18 concerns',         keywords: ['Pediatrics'] },
  { Icon: Bone,        label: 'Bone / Joint',  hint: 'Pain, injury, mobility',    keywords: ['Orthopedics'] },
  { Icon: Eye,         label: 'Eyes',          hint: 'Vision, irritation',        keywords: ['Ophthalmology'] },
  { Icon: Ear,         label: 'Ear / Nose',    hint: 'Hearing, sinus, throat',    keywords: ['ENT'] },
  { Icon: Wind,        label: 'Breathing',     hint: 'Cough, shortness of breath', keywords: ['Pulmonology', 'General Practice'] },
  { Icon: Stethoscope, label: 'Something else', hint: 'Not sure where it fits',   keywords: [] },
];

const URGENCY = [
  { key: 'routine', label: 'Routine check-up',   desc: 'Not urgent — general care',        Icon: CalendarCheck },
  { key: 'soon',    label: 'Soon — within days', desc: 'Uncomfortable but manageable',     Icon: Clock },
  { key: 'urgent',  label: 'Urgent — today',     desc: 'Significant pain or concern',      Icon: Zap },
];

const STEP_LABELS = ['Your concern', 'Details', 'Timing'];

export default function MedicalIntake() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = category, 2 = describe, 3 = urgency
  const [selected, setSelected] = useState(null);
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('routine');
  // Emergency screening result, when the words describe one. See handleContinue.
  const [safetyAlert, setSafetyAlert] = useState(null);
  const [screening, setScreening] = useState(false);

  const handleSkip = () => {
    // Already signed in (e.g. a therapy client): same account, no sign-up step.
    if (getStoredToken() && getStoredRole() === 'client') {
      chooseService(getStoredUserId(), 'medical');
      refreshSession();
      navigate('/dashboard');
      return;
    }
    localStorage.setItem('th.medicalSkip', 'true');
    navigate('/signup');
  };

  const handleCategorySelect = (cat) => {
    setSelected(cat);
    setStep(2);
  };

  /**
   * Screen the description for emergency language before going any further.
   *
   * Runs WITHOUT an account, deliberately. The check is pattern-based on the
   * server and costs nothing to run, and somebody typing "crushing chest pain"
   * here is exactly the person who must not be walked through a booking flow
   * first. Anything it cannot recognise simply continues as before — a check
   * that is unavailable stays out of the way rather than blocking the journey.
   */
  const screenForEmergency = async (text) => {
    if (!text.trim()) return null;
    try {
      const res = await api('/api/v1/ai/triage', {
        method: 'POST',
        authenticated: false,
        body: { complaint: text },
      });
      return res?.ok && res.canBookOnline === false ? res : null;
    } catch {
      return null;
    }
  };

  const handleContinue = async () => {
    if (step === 2) {
      setScreening(true);
      const alert = await screenForEmergency(description);
      setScreening(false);
      if (alert) { setSafetyAlert(alert); return; }
      setStep(3);
      return;
    }

    const params = new URLSearchParams();
    if (selected?.keywords?.length) params.set('specialty', selected.keywords[0]);
    if (description.trim()) params.set('q', description.trim());
    params.set('urgency', urgency);
    navigate(`/doctors?${params.toString()}`);
  };

  const SelectedIcon = selected?.Icon || Stethoscope;

  return (
    <div className="mi-page">
      <div className="mi-card">

        {/* ── Header ──
            The back control is in the flow rather than absolutely positioned,
            which is what let it collide with the progress rail before. */}
        <div className="mi-head">
          {step > 1 ? (
            <button className="mi-back" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft size={15} /> Back
            </button>
          ) : <span className="mi-badge">Medical Care</span>}
          <span className="mi-step-count">Step {step} of 3</span>
        </div>

        <div className="mi-progress" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3}>
          {STEP_LABELS.map((label, i) => (
            <div key={label} className={`mi-track ${step > i ? 'is-done' : ''}`}>
              <span className="mi-track-bar" />
              <span className="mi-track-label">{label}</span>
            </div>
          ))}
        </div>

        {/* ── Step 1 — Category ── */}
        {step === 1 && (
          <>
            <h1 className="mi-title">What brings you in today?</h1>
            <p className="mi-sub">Pick the area closest to your concern. You can add detail next.</p>

            <div className="mi-grid">
              {CATEGORIES.map(({ Icon, label, hint, keywords }) => (
                <button
                  key={label}
                  className="mi-cat-btn"
                  onClick={() => handleCategorySelect({ Icon, label, hint, keywords })}
                >
                  <span className="mi-cat-icon"><Icon size={21} strokeWidth={1.8} /></span>
                  <span className="mi-cat-label">{label}</span>
                  <span className="mi-cat-hint">{hint}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 2 — Describe ── */}
        {step === 2 && (
          <>
            <div className="mi-chosen">
              <span className="mi-chosen-icon"><SelectedIcon size={18} strokeWidth={1.8} /></span>
              {selected?.label}
            </div>
            <h1 className="mi-title">Tell us a bit more</h1>
            <p className="mi-sub">
              Your doctor reads this before the consultation. A sentence or two is enough.
            </p>
            <textarea
              className="mi-textarea"
              placeholder={'E.g. "I have had a headache and mild fever for 3 days…"'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              autoFocus
            />
            {safetyAlert ? (
              <div className="mi-safety" role="alert">
                <strong className="mi-safety-title">{safetyAlert.headline}</strong>
                <p className="mi-safety-reason">{safetyAlert.reason}</p>
                {safetyAlert.safetyMessage ? (
                  <p className="mi-safety-body">{safetyAlert.safetyMessage}</p>
                ) : null}
                <p className="mi-safety-number">
                  Emergency number: <strong>{safetyAlert.emergencyNumber}</strong>
                </p>
                {/* Continuing stays possible — this is a screen, not a lock, and
                    somebody who knows their own situation better than a pattern
                    match must not be trapped. It is no longer the obvious path. */}
                <button className="mi-ghost" onClick={() => { setSafetyAlert(null); setStep(3); }}>
                  This is not an emergency — continue booking
                </button>
              </div>
            ) : (
              <>
                <button className="mi-btn" onClick={handleContinue} disabled={screening}>
                  {screening ? 'Checking…' : <>Continue <ArrowRight size={17} /></>}
                </button>
                <button className="mi-ghost" onClick={handleContinue} disabled={screening}>
                  Skip this step
                </button>
              </>
            )}
          </>
        )}

        {/* ── Step 3 — Urgency ── */}
        {step === 3 && (
          <>
            <h1 className="mi-title">How soon do you need care?</h1>
            <p className="mi-sub">This decides which doctors we show you first.</p>

            <div className="mi-urgency-list">
              {URGENCY.map(({ key, label, desc, Icon }) => (
                <button
                  key={key}
                  className={`mi-urgency-btn ${urgency === key ? 'selected' : ''}`}
                  onClick={() => setUrgency(key)}
                  aria-pressed={urgency === key}
                >
                  <span className="mi-urgency-icon"><Icon size={18} strokeWidth={1.8} /></span>
                  <span className="mi-urgency-text">
                    <span className="mi-urgency-label">{label}</span>
                    <span className="mi-urgency-desc">{desc}</span>
                  </span>
                  <span className="mi-radio" aria-hidden="true" />
                </button>
              ))}
            </div>

            {/* Said plainly here rather than buried in a footer: someone
                choosing "urgent" needs to know this is not an emergency room. */}
            <p className="mi-note">
              <ShieldCheck size={14} />
              For a medical emergency, call <strong>112</strong> — do not wait for a consultation.
            </p>

            <button className="mi-btn" onClick={handleContinue}>
              Find matching doctors <ArrowRight size={17} />
            </button>
          </>
        )}

        <div className="mi-skip-row">
          <button className="mi-skip-link" onClick={handleSkip}>
            I'll find a doctor later — sign up without booking
          </button>
        </div>
      </div>
    </div>
  );
}
