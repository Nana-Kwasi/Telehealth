import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from './PublicPageShell';
import { NESSA_HUB_POLICY_LINKS } from '../../constants/nessaHubPolicies';

const TOPICS = [
  { title: 'Getting started', desc: 'Choose therapy, medical care, psychiatry, or second opinion and create your account.', to: '/' },
  { title: 'FAQs', desc: 'Searchable answers about the most common tasks.', to: '/faqs' },
  { title: 'Contact support', desc: 'Email the team or open a pre-filled message from your mail app.', to: '/contact' },
  { title: 'Account & login', desc: 'Use Log in / Sign up in the navigation. Reset flows live on the login page when enabled.', to: '/login' },
  { title: 'Privacy & data', desc: 'Read how we handle health and account data on the official policy site.', href: NESSA_HUB_POLICY_LINKS.privacy },
  { title: 'Terms of service', desc: 'Platform rules, acceptable use, and limitations.', href: NESSA_HUB_POLICY_LINKS.terms },
  { title: 'Crisis & urgent risk', desc: 'If you or someone else is in immediate danger, use local emergency services.', to: '/crisis-support' },
];

export default function HelpCenterPage() {
  const [needle, setNeedle] = useState('');
  const list = useMemo(() => {
    const s = needle.trim().toLowerCase();
    if (!s) return TOPICS;
    return TOPICS.filter((t) => t.title.toLowerCase().includes(s) || t.desc.toLowerCase().includes(s));
  }, [needle]);

  return (
    <PublicPageShell
      eyebrow="Support"
      title="Help center"
      lead="Find the right next step — from first visit to privacy questions and crisis resources."
    >
      <div className="public-card">
        <label htmlFor="help-search" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '0.35rem' }}>Search topics</label>
        <input
          id="help-search"
          placeholder="e.g. privacy, login, crisis…"
          value={needle}
          onChange={(e) => setNeedle(e.target.value)}
          style={{ width: '100%', maxWidth: 420, padding: '0.65rem 0.85rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'grid', gap: '0.65rem' }}>
        {list.map((t) => (
          <div key={t.title} className="public-card" style={{ marginBottom: 0 }}>
            <h2>{t.title}</h2>
            <p style={{ marginBottom: '0.75rem' }}>{t.desc}</p>
            {t.href ? (
              <a href={t.href} target="_blank" rel="noopener noreferrer" className="public-btn public-btn-primary">
                Open ↗
              </a>
            ) : (
              <Link to={t.to} className="public-btn public-btn-primary">Go</Link>
            )}
          </div>
        ))}
      </div>

      {list.length === 0 ? <p style={{ color: '#64748b', marginTop: '1rem' }}>No topics match that search.</p> : null}
    </PublicPageShell>
  );
}
