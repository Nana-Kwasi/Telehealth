import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import individualIcon from '../../../src/Images /v.jpg';
import couplesIcon    from '../../../src/Images /v2.jpg';
import teenIcon       from '../../../src/Images /v1.jpg';

const therapyTypes = [
  { key: 'individual', title: 'Individual', desc: 'For myself',      iconSrc: individualIcon, bgColor: '#2d6a4f' },
  { key: 'couples',    title: 'Couples',    desc: 'Me & my partner', iconSrc: couplesIcon,    bgColor: '#1a5276' },
  { key: 'teen',       title: 'Teen',       desc: 'For my child',    iconSrc: teenIcon,       bgColor: '#6d4c41' },
];

const steps = [
  { n: '1', title: 'Choose your service',       desc: 'Select therapy or medical consultations — or both.' },
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
  const [selectedService, setSelectedService] = useState(null);
  const [counters, setCounters] = useState({ therapists: 0, sessions: 0, clients: 0, messages: 0 });
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: '' });
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

  const startTherapy = (type) => {
    localStorage.removeItem('th.onboard');
    localStorage.removeItem('th.subscription');
    localStorage.removeItem('th.match');
    localStorage.setItem('th.onboard', JSON.stringify({ therapyType: type, startedAt: new Date().toISOString() }));
    navigate('/questionnaire');
  };

  const openModal = (type) => {
    const content = {
      privacy: {
        title: 'Privacy Policy',
        content: `<h3>Privacy Policy</h3><p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p>
          <h4>Information We Collect</h4><p>We collect information you provide when you create an account or use our services.</p>
          <h4>How We Use Your Information</h4><p>We use collected information to provide, maintain, and improve our services.</p>
          <h4>Data Security</h4><p>We implement appropriate security measures to protect your personal information.</p>
          <h4>Contact Us</h4><p>Questions? Email us at privacy@nessahub.com</p>`
      },
    };
    setModalContent(content[type] || { title: type, content: '' });
    setShowModal(true);
  };

  return (
    <div className="page-container">

      {/* ── HERO ── */}
      <section className="hero-section">
        <div className="home-container">

          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            Therapy &amp; Medical — One Platform
          </div>

          <h1 className="home-title">
            Care that meets you<br />
            <span className="title-highlight-therapy">where you are.</span>
          </h1>

          <p className="home-subtitle">
            Access licensed therapists and medical doctors from the comfort of your home.
            Mental health support and medical consultations, all in one place.
          </p>

          {/* ── 2-Choice Entry Cards ── */}
          <div className="hero-service-choice">
            <div
              className={`hero-choice-card therapy ${selectedService === 'therapy' ? 'selected' : ''}`}
              onClick={() => setSelectedService(selectedService === 'therapy' ? null : 'therapy')}
            >
              <div className="choice-card-icon">🧠</div>
              <h3 className="choice-card-title">Mental Health Therapy</h3>
              <p className="choice-card-desc">
                Work with a licensed therapist for individual, couples, or teen therapy.
                Flexible scheduling. Complete privacy.
              </p>
              <div className="choice-card-cta">
                {selectedService === 'therapy' ? '▲ Choose your type below' : 'Find a therapist →'}
              </div>
            </div>

            <div
              className="hero-choice-card medical"
              onClick={() => navigate('/medical')}
            >
              <div className="choice-card-icon">🩺</div>
              <h3 className="choice-card-title">Medical Consultations</h3>
              <p className="choice-card-desc">
                Search and book licensed doctors for general practice, specialist
                consultations, and prescriptions.
              </p>
              <div className="choice-card-cta">Find a doctor →</div>
            </div>
          </div>

          {/* ── Therapy Type Cards (revealed on Therapy click) ── */}
          {selectedService === 'therapy' && (
            <div className="therapy-reveal">
              <p className="cards-section-title">Start therapy today — choose your type</p>
              <div className="cards-grid">
                {therapyTypes.map(({ key, title, desc, iconSrc, bgColor }) => (
                  <div
                    key={key}
                    className="therapy-card"
                    onClick={() => startTherapy(key)}
                    style={{ backgroundColor: bgColor }}
                  >
                    <div className="card-content">
                      <h3 className="therapy-title">{title}</h3>
                      <p className="therapy-description">{desc}</p>
                      <div className="therapy-arrow">→</div>
                    </div>
                    <div className="therapy-icon">
                      <img src={iconSrc} alt={title} className="therapy-icon-img" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                <li><a href="/about">About</a></li>
                <li><a href="/login">Log in</a></li>
                <li><a href="/faqs">FAQs</a></li>
                <li><a href="/contact">Contact</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Services</h4>
              <ul>
                <li><a href="/questionnaire">Individual Therapy</a></li>
                <li><a href="/questionnaire">Couples Therapy</a></li>
                <li><a href="/questionnaire">Teen Therapy</a></li>
                <li><a href="/doctors">Medical Consultations</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Support</h4>
              <ul>
                <li><a href="/advice">Resources</a></li>
                <li><a href="/faqs">Help Center</a></li>
                <li><a href="/contact">Crisis Support</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Legal</h4>
              <ul>
                <li><button className="footer-link-button" onClick={() => navigate('/terms')}>Terms of Service</button></li>
                <li><button className="footer-link-button" onClick={() => navigate('/privacy')}>Privacy Policy</button></li>
                <li><button className="footer-link-button" onClick={() => openModal('privacy')}>Cookie Policy</button></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {currentYear} NessaHub. All rights reserved.</p>
            <p>We accept <strong>HSA/FSA</strong> for Individual and Teen therapy</p>
          </div>
        </div>
      </footer>

      {/* ── MODAL ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalContent.title}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body" dangerouslySetInnerHTML={{ __html: modalContent.content }} />
          </div>
        </div>
      )}
    </div>
  );
}
