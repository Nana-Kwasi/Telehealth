import React from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from './PublicPageShell';

export default function AboutPage() {
  return (
    <PublicPageShell
      eyebrow="NessaHub"
      title="About NessaHub"
      lead="One platform for therapy, medical care, and home-based nursing — built so quality care is easier to reach."
    >
      <div className="public-card">
        <h2>Our mission</h2>
        <p>
          NessaHub connects people with licensed therapists, doctors, and home-care nurses through secure video,
          messaging, and coordinated in-person visits. We focus on clarity, privacy, and continuity so you spend less
          time navigating care and more time feeling better.
        </p>
      </div>
      <div className="public-grid-2">
        <div className="public-card">
          <h2>What we offer</h2>
          <ul>
            <li>Individual, couples, and teen therapy pathways</li>
            <li>Medical consultations and doctor discovery</li>
            <li>Home-care nurse browse, booking, and visit tracking</li>
            <li>Diagnostics and pharmacy integrations where enabled</li>
          </ul>
        </div>
        <div className="public-card">
          <h2>Trust &amp; safety</h2>
          <ul>
            <li>Role-based access and audit-friendly workflows</li>
            <li>Encryption in transit; infrastructure-aligned safeguards</li>
            <li>Policies hosted separately for transparency — see footer legal links</li>
          </ul>
        </div>
      </div>
      <div className="public-cta-row">
        <Link to="/questionnaire" className="public-btn public-btn-primary">Start therapy intake</Link>
        <Link to="/doctors" className="public-btn public-btn-ghost">Find a doctor</Link>
        <Link to="/home-care/browse" className="public-btn public-btn-ghost">Home-care nurses</Link>
      </div>
    </PublicPageShell>
  );
}
