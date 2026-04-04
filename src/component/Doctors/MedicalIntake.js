import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './MedicalIntake.css';

const CATEGORIES = [
  { emoji: '🤒', label: 'Fever / Flu',  keywords: ['General Practice', 'Internal Medicine', 'Family Medicine'] },
  { emoji: '❤️', label: 'Heart / Chest', keywords: ['Cardiology'] },
  { emoji: '🦷', label: 'Skin / Rash',   keywords: ['Dermatology'] },
  { emoji: '👶', label: 'Child Health',  keywords: ['Pediatrics'] },
  { emoji: '🦴', label: 'Bone / Joint',  keywords: ['Orthopedics'] },
  { emoji: '👁️', label: 'Eyes',           keywords: ['Ophthalmology'] },
  { emoji: '👂', label: 'Ear / Nose',    keywords: ['ENT'] },
  { emoji: '🫁', label: 'Breathing',     keywords: ['Pulmonology', 'General Practice'] },
  { emoji: '🩺', label: 'Other',         keywords: [] },
];

const URGENCY = [
  { key: 'routine',  label: 'Routine check-up',    desc: 'Not urgent, general care' },
  { key: 'soon',     label: 'Soon — within days',  desc: 'Uncomfortable but manageable' },
  { key: 'urgent',   label: 'Urgent — today',       desc: 'Significant pain or concern' },
];

export default function MedicalIntake() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = category, 2 = describe, 3 = urgency
  const [selected, setSelected] = useState(null);
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('routine');

  const handleSkip = () => {
    localStorage.setItem('th.medicalSkip', 'true');
    navigate('/signup');
  };

  const handleCategorySelect = (cat) => {
    setSelected(cat);
    setStep(2);
  };

  const handleContinue = () => {
    if (step === 2) { setStep(3); return; }

    // Build search params and go to doctor search
    const params = new URLSearchParams();
    if (selected?.keywords?.length) {
      params.set('specialty', selected.keywords[0]);
    }
    if (description.trim()) {
      params.set('q', description.trim());
    }
    params.set('urgency', urgency);

    navigate(`/doctors?${params.toString()}`);
  };

  return (
    <div className="mi-page">
      <div className="mi-card">

        {/* Back */}
        {step > 1 && (
          <button className="mi-back" onClick={() => setStep(s => s - 1)}>← Back</button>
        )}

        {/* Progress dots */}
        <div className="mi-progress">
          {[1, 2, 3].map(n => (
            <div key={n} className={`mi-dot ${step >= n ? 'active' : ''}`} />
          ))}
        </div>

        {/* Step 1 — Category */}
        {step === 1 && (
          <>
            <div className="mi-icon-top">🩺</div>
            <h1 className="mi-title">What brings you in today?</h1>
            <p className="mi-sub">Select the area that best describes your concern.</p>
            <div className="mi-grid">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.label}
                  className="mi-cat-btn"
                  onClick={() => handleCategorySelect(cat)}
                >
                  <span className="mi-cat-emoji">{cat.emoji}</span>
                  <span className="mi-cat-label">{cat.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2 — Describe */}
        {step === 2 && (
          <>
            <div className="mi-icon-top">{selected?.emoji}</div>
            <h1 className="mi-title">Tell us a bit more</h1>
            <p className="mi-sub">
              Describe your symptoms briefly. Doctors will see this before your consultation.
            </p>
            <textarea
              className="mi-textarea"
              placeholder={`E.g. "I've had a headache and mild fever for 3 days…"`}
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              autoFocus
            />
            <button
              className="mi-btn"
              onClick={handleContinue}
            >
              Continue →
            </button>
          </>
        )}

        {/* Step 3 — Urgency */}
        {step === 3 && (
          <>
            <div className="mi-icon-top">⏱️</div>
            <h1 className="mi-title">How soon do you need care?</h1>
            <p className="mi-sub">This helps us show you doctors available at the right time.</p>
            <div className="mi-urgency-list">
              {URGENCY.map(u => (
                <button
                  key={u.key}
                  className={`mi-urgency-btn ${urgency === u.key ? 'selected' : ''}`}
                  onClick={() => setUrgency(u.key)}
                >
                  <div className="mi-urgency-label">{u.label}</div>
                  <div className="mi-urgency-desc">{u.desc}</div>
                </button>
              ))}
            </div>
            <button className="mi-btn" onClick={handleContinue}>
              Find matching doctors →
            </button>
          </>
        )}

      </div>

      {/* Skip link */}
      <div className="mi-skip-row">
        <button className="mi-skip-link" onClick={handleSkip}>
          I'll find a doctor later — Sign up without booking →
        </button>
      </div>
    </div>
  );
}
