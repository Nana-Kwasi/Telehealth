import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Home.css';
// NOTE: the assets folder is named "Images " — with a trailing space.
import heroBackground from '../../Images /main.png';
import { NESSA_HUB_POLICY_LINKS } from '../../constants/nessaHubPolicies';
import { beginTherapySession } from '../../utils/patientSessionIntent';
import TherapyTypeModal, { THERAPY_TYPES, PSYCHIATRY_TYPES } from './TherapyTypeModal';

import FaqSection from '../Common/FaqSection';
const steps = [
  { n: '1', title: 'Choose your service',       desc: 'Select therapy, medical care, psychiatry, or second opinion.' },
  { n: '2', title: 'Match with a professional', desc: 'We pair you with the right therapist or doctor based on your needs.' },
  { n: '3', title: 'Start your session',        desc: 'Connect via video, chat, or audio. Get care on your schedule.' },
];

const features = [
  { icon: '🎓', title: 'Licensed & Credentialed',  body: 'All providers are licensed, trained, and accredited professionals.' },
  { icon: '🔒', title: 'Private & Secure',          body: 'End-to-end encrypted sessions and strict privacy guidelines protect you.' },
  { icon: '💬', title: 'Multiple Ways to Connect',  body: 'Video, audio, or live chat — whatever works best for you.' },
  { icon: '📱', title: 'Accessible Anywhere',       body: 'Access care from home, office, or anywhere you have a private space.' },
];

export default function Home() {
  const navigate = useNavigate();
  // Which "what kind?" dialog is open: null | 'psychiatry' | 'counselling'.
  // One value rather than two booleans, so the two cannot both be open.
  const [typeModal, setTypeModal] = useState(null);
  const [counters, setCounters] = useState({ therapists: 0, sessions: 0, clients: 0, messages: 0 });
  const currentYear = new Date().getFullYear();

  const finalValues = { therapists: 150, sessions: 278000000, clients: 1000000, messages: 50000000 };

  useEffect(() => {
    const duration = 2800;
    const steps = 60;
    Object.keys(finalValues).forEach(key => {
      const increment = finalValues[key] / steps;
      let current = 0;
      let count = 0;
      const timer = setInterval(() => {
        count++;
        current += increment;
        if (count >= steps) { current = finalValues[key]; clearInterval(timer); }
        setCounters(prev => ({ ...prev, [key]: Math.floor(current) }));
      }, duration / steps);
    });
  }, []);

  const fmt = (n) => {
    if (n == null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M+';
    if (n >= 1000)    return (n / 1000).toFixed(0) + 'K+';
    return n.toLocaleString() + '+';
  };

  /**
   * Psychology & Counseling, after the type has been chosen.
   *
   * Teen and couples keep their existing journeys (parent/guardian consent and
   * partner invitation). Individual goes into the policy-gated, cached sign-up
   * where nothing is written until payment succeeds.
   */
  const startCounselling = (type) => {
    setTypeModal(null);

    // Teen and couples keep their existing journeys unchanged.
    if (type === 'teen' || type === 'couples') {
      startTherapy(type);
      return;
    }

    // Individual goes to the policy-gated, cached sign-up instead of straight
    // to the questionnaire — so startTherapy is NOT reused here: it ends by
    // navigating to /questionnaire, which would fight this navigation.
    // Clearing the stale per-flow keys still matters: a half-finished teen or
    // couple attempt leaves parent, child and invite records behind, and they
    // must not follow the user into a different type.
    beginTherapySession('therapy');
    [
      'th.onboard', 'th.subscription', 'th.match',
      'th.parentInfo', 'th.childInfo', 'th.parentConsent',
      'th.coupleId', 'th.couplePartnerRole', 'th.coupleInviteToken',
      'th.coupleMyIntakeComplete',
    ].forEach((k) => localStorage.removeItem(k));
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('th.coupleDraft_')) localStorage.removeItem(k);
    });
    localStorage.setItem('th.onboard', JSON.stringify({
      therapyType: 'individual', startedAt: new Date().toISOString(),
    }));

    navigate('/medpsych');
  };

  const startTherapy = (type) => {
    beginTherapySession(type === 'couples' ? 'couples' : 'therapy');

    const keys = [
      'th.onboard',
      'th.subscription',
      'th.match',
      'th.parentInfo',
      'th.childInfo',
      'th.parentConsent',
      'th.coupleId',
      'th.couplePartnerRole',
      'th.coupleInviteToken',
      'th.coupleMyIntakeComplete',
    ];
    keys.forEach((k) => localStorage.removeItem(k));
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('th.coupleDraft_')) localStorage.removeItem(k);
    });

    if (type === 'teen') {
      navigate('/teen/parent-guardian');
      return;
    }

    if (type === 'couples') {
      navigate('/couple/initiation');
      return;
    }

    localStorage.setItem('th.onboard', JSON.stringify({ therapyType: type, startedAt: new Date().toISOString() }));
    navigate('/questionnaire');
  };

  // Home care remains intentionally hidden from the public marketing pages until
  // it is actively promoted as a supported public entry point.
  // const selectHomeCare = () => {
  //   beginHomeCareSession();
  //   navigate('/home-care/browse');
  // };

  return (
    <div className="page-container">

      {/* ── HERO ── */}
      <section
        className="hero-section"
        style={{
          // No overlay — the artwork carries its own headline and brightness.
          backgroundImage: `url(${heroBackground})`,
        }}
      >
        <div className="home-container">

        </div>

          {/* ── Module picker ──
            Was three large frosted cards that covered the artwork. The image
            already carries the headline and description, so this is just the
            three entry points: icon + label, sitting under that copy. */}
        <div className="hero-modules">
          <button
            type="button"
            className={`hero-module ${typeModal === 'psychiatry' ? 'is-active' : ''}`}
            onClick={() => setTypeModal('psychiatry')}
          >
            <svg className="hero-module-icon" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="26" cy="16" r="10" />
              <path d="M8 56c0-11 8-19 18-19 3 0 6 .6 8 1.8" />
              <path d="M45.5 34.2c2.6-2.7 6.9-2.7 9.5 0 2.6 2.7 2.6 7 0 9.7L45.5 54l-9.5-10.1c-2.6-2.7-2.6-7 0-9.7 2.6-2.7 6.9-2.7 9.5 0z" />
            </svg>
            <span className="hero-module-label">Psychiatry</span>
          </button>

          <button
            type="button"
            className="hero-module"
            onClick={() => navigate('/medical')}
          >
            <svg className="hero-module-icon" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M18 8v14c0 7.2 5.8 13 13 13s13-5.8 13-13V8" />
              <path d="M14 8h8M40 8h8" />
              <path d="M31 35v8c0 7.2 5.8 13 13 13s13-5.8 13-13v-5" />
              <circle cx="57" cy="34" r="5" />
            </svg>
            <span className="hero-module-label">Medical Care</span>
          </button>

          {/* Home Care is parked, not removed — the module and its routes are
              untouched, so restoring this button brings it straight back.
          <button
            type="button"
            className="hero-module"
            onClick={selectHomeCare}
          >
            <svg className="hero-module-icon" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M8 28L32 8l24 20" />
              <path d="M14 27v27h36V27" />
              <path d="M32 46l-7-7.2c-1.9-2-1.9-5.1 0-7.1 1.9-2 5-2 6.9 0l.1.1.1-.1c1.9-2 5-2 6.9 0 1.9 2 1.9 5.1 0 7.1z" />
            </svg>
            <span className="hero-module-label">Home Care</span>
          </button>
          */}

          {/* Psychology & Counseling: ongoing talking therapy. Asks WHICH kind
              first, then hands off to the journey that already handles it —
              individual questionnaire, teen consent, or couple invitation. */}
          <button
            type="button"
            className="hero-module"
            onClick={() => setTypeModal('counselling')}
          >
            <svg className="hero-module-icon" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M32 10c-9 0-16 6.7-16 15 0 5.2 2.6 9.4 6 12v7h20v-7c3.4-2.6 6-6.8 6-12 0-8.3-7-15-16-15z" />
              <path d="M26 51h12M28 56h8" />
              <path d="M32 25v10M27 30h10" />
            </svg>
            <span className="hero-module-label">Psychology &amp; Counseling</span>
          </button>

          {/* Second Opinion: for someone ALREADY under care elsewhere who wants
              an independent view on one decision. Its own entry because the
              intake is different — a short case questionnaire rather than the
              full programme questionnaire — and so is what they get afterwards. */}
          <button
            type="button"
            className="hero-module"
            onClick={() => navigate('/second-opinion')}
          >
            <svg className="hero-module-icon" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M20 12h18l10 10v30a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" />
              <path d="M38 12v10h10" />
              <circle cx="30" cy="36" r="7" />
              <path d="M35 41l6 6" />
            </svg>
            <span className="hero-module-label">Second Opinion</span>
          </button>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="stats-section">
        <div className="stats-container">
          <h2 className="stats-title">The world's largest telehealth service.</h2>
          <p className="stats-subtitle">Therapy and medical care, 100% online.</p>
          <div className="stats-grid">
            {[
              { value: fmt(counters.therapists), label: 'Licensed therapists & doctors' },
              { value: fmt(counters.sessions),   label: 'Consultations completed' },
              { value: fmt(counters.clients),    label: 'People helped' },
              { value: fmt(counters.messages),   label: 'Messages, video & chat sessions' },
            ].map(({ value, label }) => (
              <div key={label} className="stat-item">
                <div className="stat-number">{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="how-section">
        <div className="how-container">
          <p className="section-eyebrow">— Simple process</p>
          <h2 className="section-title">Get started in minutes</h2>
          <p className="section-subtitle">Three steps to connecting with the right professional for your needs.</p>
          <div className="steps-grid">
            {steps.map(({ n, title, desc }) => (
              <div key={n} className="step-card">
                <div className="step-number">{n}</div>
                <h3 className="step-title">{title}</h3>
                <p className="step-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="therapists-section">
        <div className="therapists-container">
          <h2 className="therapists-title">Qualified professionals you can trust</h2>
          <div className="therapists-grid">
            {features.map(({ icon, title, body }) => (
              <div key={title} className="therapist-feature">
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── shared with the dashboards and the app (backend /api/v1/faq) */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '1rem 16px 2.5rem' }}>
        <FaqSection compact audience="visitor" limit={8} />
      </section>

      {/* ── FOOTER ── */}
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <span className="footer-brand-name">NessaHub</span>
            <p className="footer-brand-tagline">Therapy &amp; Medical Care — One Platform</p>
          </div>
          <div className="footer-content">
            <div className="footer-section">
              <h4>Navigation</h4>
              <ul>
                <li><Link to="/about">About</Link></li>
                <li><Link to="/login">Log in</Link></li>
                <li><Link to="/faqs">FAQs</Link></li>
                <li><Link to="/contact">Contact</Link></li>
              </ul>
            </div>
            <div className="footer-section">
              {/* Mirrors the modules in the hero, one entry each, going where
                  its button goes. It previously listed the old therapy types —
                  Individual, Couples and Teen — and pointed all three at
                  /questionnaire, so every link landed on the individual intake
                  regardless of which was clicked, and Psychiatry and Second
                  Opinion had no footer entry at all. */}
              <h4>Services</h4>
              <ul>
                <li>
                  <button type="button" className="footer-link-button" onClick={() => setTypeModal('psychiatry')}>
                    Psychiatry
                  </button>
                </li>
                <li><Link to="/medical">Medical Care</Link></li>
                <li>
                  <button type="button" className="footer-link-button" onClick={() => setTypeModal('counselling')}>
                    Psychology &amp; Counseling
                  </button>
                </li>
                <li><Link to="/second-opinion">Second Opinion</Link></li>
                {/* <li><button type="button" className="footer-link-button" onClick={selectHomeCare}>Home-Care</button></li> */}
              </ul>
            </div>
            <div className="footer-section">
              <h4>Support</h4>
              <ul>
                <li><Link to="/advice">Resources</Link></li>
                <li><Link to="/help">Help Center</Link></li>
                <li><Link to="/crisis-support">Crisis Support</Link></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Legal</h4>
              <ul>
                <li>
                  <a className="footer-external-link" href={NESSA_HUB_POLICY_LINKS.terms} target="_blank" rel="noopener noreferrer">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a className="footer-external-link" href={NESSA_HUB_POLICY_LINKS.privacy} target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a className="footer-external-link" href={NESSA_HUB_POLICY_LINKS.cookies} target="_blank" rel="noopener noreferrer">
                    Cookie Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {currentYear} NessaHub. All rights reserved.</p>
            <p>We accept <strong>HSA/FSA</strong> for Individual and Teen therapy</p>
          </div>
        </div>
      </footer>

    {/* Psychiatry and Psychology ask the same question with the same three
        answers, but hand off to different journeys, so they share the dialog
        and differ only in the handler. */}
    <TherapyTypeModal
      open={typeModal === 'psychiatry'}
      onClose={() => setTypeModal(null)}
      onSelect={(key) => { setTypeModal(null); startTherapy(key); }}
      eyebrow="Psychiatry"
      title="Who is this care for?"
      subtitle="This decides which psychiatrist you are matched with."
      options={PSYCHIATRY_TYPES}
    />

    <TherapyTypeModal
      open={typeModal === 'counselling'}
      onClose={() => setTypeModal(null)}
      onSelect={startCounselling}
      eyebrow="Psychology & Counseling"
      title="What kind of therapy?"
      subtitle="This decides who you will be matched with."
      options={THERAPY_TYPES}
    />

    </div>
  );
}
