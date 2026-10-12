import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PublicPageShell from './PublicPageShell';
import FaqSection, { faqAudience } from '../Common/FaqSection';

/**
 * The full FAQ. The questions come from the backend (/api/v1/faq) — the same
 * list the dashboards and the mobile app show — instead of a hard-coded array
 * here that drifted from the app. ?for= picks the audience (a dashboard's
 * "See all" link passes it); otherwise it follows the signed-in role.
 */
export default function FaqsPage() {
  const [params] = useSearchParams();
  const audience = params.get('for') || faqAudience();

  return (
    <PublicPageShell
      eyebrow="Help"
      title="Frequently asked questions"
      lead="Answers about therapy, medical care, appointments, payments, privacy and the app."
    >
      <FaqSection audience={audience} title="All questions" />

      <div className="public-card" style={{ marginTop: '1.5rem' }}>
        <h2>Still stuck?</h2>
        <p style={{ marginBottom: '0.75rem' }}>Visit the Help center for topics and shortcuts, or talk to us directly.</p>
        <div className="public-cta-row" style={{ marginTop: 0 }}>
          <Link to="/help" className="public-btn public-btn-primary">Help center</Link>
          <Link to="/contact" className="public-btn public-btn-ghost">Contact</Link>
        </div>
      </div>
    </PublicPageShell>
  );
}
