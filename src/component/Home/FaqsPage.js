import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from './PublicPageShell';

const FAQS = [
  {
    q: 'How do I start therapy?',
    a: 'From the home page choose Mental Health Therapy, pick individual / couples / teen, and complete the short questionnaire. You can create an account when prompted and continue into your therapist dashboard.',
  },
  {
    q: 'How do I book a doctor?',
    a: 'Use “Medical Consultations” on the home page to open doctor search. Pick a provider, follow booking steps, and sign in when required to confirm your appointment.',
  },
  {
    q: 'What is home-care on NessaHub?',
    a: 'Home-care lets you browse approved nurses, request visits, and track bookings. Start from the home page “Home-Care” card or go to Home Care in the navigation when available.',
  },
  {
    q: 'Is video calling secure?',
    a: 'Sessions run over encrypted transport where supported by our infrastructure partners. Always use a private space and never share login credentials.',
  },
  {
    q: 'How do I reset my password?',
    a: 'On the login screen use “Forgot password” if available, or contact support with the email on your account so we can verify and help.',
  },
  {
    q: 'Where are privacy and terms?',
    a: 'Official policies live on our hosted policies site. Use the Terms, Privacy, and Cookie links in the site footer to read the latest versions in a new tab.',
  },
];

export default function FaqsPage() {
  const [open, setOpen] = useState(() => new Set([0]));
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const s = filter.trim().toLowerCase();
    const withIdx = FAQS.map((item, i) => ({ ...item, i }));
    if (!s) return withIdx;
    return withIdx.filter(({ q: question, a: answer }) =>
      question.toLowerCase().includes(s) || answer.toLowerCase().includes(s)
    );
  }, [filter]);

  const toggle = (i) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <PublicPageShell
      eyebrow="Help"
      title="Frequently asked questions"
      lead="Quick answers about therapy, medical care, home-care, and the platform."
    >
      <div className="public-card" style={{ marginBottom: '1rem' }}>
        <label htmlFor="faq-filter" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '0.35rem' }}>Search</label>
        <input
          id="faq-filter"
          placeholder="Type to filter questions…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: '100%', maxWidth: 400, padding: '0.65rem 0.85rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: '#64748b' }}>No matches — try another keyword.</p>
      ) : (
        filtered.map(({ q: question, a: answer, i }) => (
          <div key={i} className="faq-item">
            <button type="button" className="faq-q" onClick={() => toggle(i)} aria-expanded={open.has(i)}>
              <span>{question}</span>
              <span aria-hidden>{open.has(i) ? '−' : '+'}</span>
            </button>
            {open.has(i) ? <div className="faq-a">{answer}</div> : null}
          </div>
        ))
      )}

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
