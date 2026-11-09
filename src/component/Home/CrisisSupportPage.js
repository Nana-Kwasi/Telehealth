import React from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from './PublicPageShell';

export default function CrisisSupportPage() {
  return (
    <PublicPageShell
      eyebrow="Safety first"
      title="Crisis support"
      lead="NessaHub is not an emergency service. If you or someone else is in immediate danger, call 112 right away."
    >
      <div className="crisis-banner">
        <h2>If this is an emergency</h2>
        <p>
          Call <strong>112</strong>, Ghana&apos;s national emergency number, open 24/7. For an ambulance you can also call{' '}
          <strong>193</strong>. Do not wait for an email reply from our support team.
        </p>
      </div>

      <div className="public-card">
        <h2>Mental Health Authority helpline</h2>
        <p style={{ marginBottom: '1rem' }}>
          Ghana&apos;s Mental Health Authority runs a toll-free helpline, open 24/7, for anyone in distress, including
          if you are having thoughts of suicide. NessaHub is not affiliated with the Authority.
        </p>
        <div className="hotline-card">
          <span>Call free</span>
          <a href="tel:0800678678">0800 678 678</a>
        </div>
      </div>

      <div className="public-card">
        <h2>Accra Psychiatric Hospital</h2>
        <p style={{ marginBottom: '1rem' }}>Emergency psychiatric care, on Castle Road, Accra.</p>
        <div className="hotline-card">
          <span>Emergencies</span>
          <a href="tel:+233302228688">0302 228 688</a>
        </div>
      </div>

      <div className="public-card">
        <h2>Using NessaHub during distress</h2>
        <ul>
          <li>Continue any care plan you already have with your licensed clinician.</li>
          <li>Reach out to someone you trust who can stay with you if possible.</li>
          <li>Use <Link to="/contact">Contact</Link> only for non-urgent platform questions — not for emergencies.</li>
        </ul>
      </div>

      <div className="public-cta-row">
        <Link to="/help" className="public-btn public-btn-ghost">Back to Help center</Link>
        <Link to="/" className="public-btn public-btn-primary">Home</Link>
      </div>
    </PublicPageShell>
  );
}
