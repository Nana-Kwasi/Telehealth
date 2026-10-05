import React from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from './PublicPageShell';

const TILES = [
  {
    title: 'Therapy intake',
    body: 'Begin individual, couples, or teen therapy through our guided questionnaire.',
    to: '/questionnaire',
    cta: 'Start intake',
    primary: true,
  },
  {
    title: 'Find a doctor',
    body: 'Search licensed doctors, view profiles, and book medical consultations.',
    to: '/doctors',
    cta: 'Browse doctors',
  },
  {
    title: 'Psychiatry & second opinion',
    body: 'Explore psychiatry or request an independent specialist review when you want a second view.',
    to: '/medpsych',
    cta: 'Explore psychiatry',
  },
  {
    title: 'FAQs',
    body: 'Short answers to common questions about accounts, bookings, and safety.',
    to: '/faqs',
    cta: 'Read FAQs',
  },
  {
    title: 'Help center',
    body: 'Structured help topics, shortcuts to crisis resources, and contact options.',
    to: '/help',
    cta: 'Open help center',
  },
  {
    title: 'External mental health resources',
    body: 'If you are in the United States, 988 Suicide & Crisis Lifeline offers 24/7 call or chat support (not affiliated with NessaHub).',
    href: 'https://988lifeline.org/',
    cta: '988 Lifeline (US)',
    external: true,
  },
  // Home care is intentionally hidden from the public marketing pages until it
  // is actively promoted as a supported public service.
];

export default function ResourcesPage() {
  return (
    <PublicPageShell
      eyebrow="Guides"
      title="Resources"
      lead="Start care, learn the platform, and find trusted pointers when you need more context."
    >
      <div className="public-grid-2">
        {TILES.map((t) => (
          <div key={t.title} className="resource-tile">
            <h3>{t.title}</h3>
            <p>{t.body}</p>
            {t.href ? (
              <a
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`public-btn ${t.primary ? 'public-btn-primary' : 'public-btn-ghost'}`}
                style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}
              >
                {t.cta} ↗
              </a>
            ) : (
              <Link
                to={t.to}
                className={`public-btn ${t.primary ? 'public-btn-primary' : 'public-btn-ghost'}`}
                style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}
              >
                {t.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
    </PublicPageShell>
  );
}
