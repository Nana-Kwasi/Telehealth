import React from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from './PublicPageShell';

export default function CrisisSupportPage() {
  return (
    <PublicPageShell
      eyebrow="Safety first"
      title="Crisis support"
      lead="NessaHub is not an emergency service. If you or someone else is in immediate danger, contact local emergency services right away."
    >
      <div className="crisis-banner">
        <h2>If this is an emergency</h2>
        <p>
          Call your local emergency number (e.g. <strong>911</strong> in the US/Canada, <strong>999</strong> in Ghana/UK,
          <strong>112</strong> in much of the EU). Do not wait for an email reply from our support team.
        </p>
      </div>

      <div className="public-card">
        <h2>United States — 988</h2>
        <p style={{ marginBottom: '1rem' }}>
          The <strong>988 Suicide &amp; Crisis Lifeline</strong> offers free, confidential support 24/7 by phone or chat.
          NessaHub is not affiliated with 988; we list it as a trusted public resource.
        </p>
        <div className="hotline-card">
          <span>Call or text</span>
          <a href="tel:988">988</a>
          <a href="https://988lifeline.org/" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            988lifeline.org ↗
          </a>
        </div>
      </div>

      <div className="public-card">
        <h2>International</h2>
        <p style={{ marginBottom: '0.75rem' }}>
          Find helplines by country via the international association for suicide prevention directory.
        </p>
        <a
          href="https://www.iasp.info/resources/Crisis_Centres/"
          target="_blank"
          rel="noopener noreferrer"
          className="public-btn public-btn-ghost"
        >
          IASP crisis centres directory ↗
        </a>
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
