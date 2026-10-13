import React, { useState } from 'react';
import PublicPageShell from './PublicPageShell';
import useSystemConfig, { cfg } from '../../hooks/useSystemConfig';

const DEFAULT_SUPPORT_EMAIL = 'support@nessahub.com';

export default function ContactPage() {
  const [name, setName] = useState('');
  // Set by the super admin in System Config → General.
  const sysConfig = useSystemConfig();
  const SUPPORT_EMAIL = cfg(sysConfig, 'general', 'supportEmail', DEFAULT_SUPPORT_EMAIL) || DEFAULT_SUPPORT_EMAIL;
  const SUPPORT_PHONE = cfg(sysConfig, 'general', 'supportPhone', '');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sentHint, setSentHint] = useState('');

  const openMailto = (e) => {
    e.preventDefault();
    if (!email.trim() || !message.trim()) {
      setSentHint('Please add your email and a message.');
      return;
    }
    const subj = subject.trim() || 'NessaHub web inquiry';
    const body = `From: ${name || '—'}\nReply-To: ${email.trim()}\n\n${message.trim()}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    setSentHint('Your mail app should open. If nothing happens, copy the address below.');
  };

  return (
    <PublicPageShell
      eyebrow="Get in touch"
      title="Contact us"
      lead="Questions about accounts, billing, or using the platform? Reach our team — we read every message."
    >
      <div className="public-grid-2">
        <div className="public-card">
          <h2>Direct channels</h2>
          <p><strong>Email:</strong>{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
          {SUPPORT_PHONE && <p><strong>Phone:</strong>{' '}<a href={`tel:${SUPPORT_PHONE.replace(/\s+/g, '')}`}>{SUPPORT_PHONE}</a></p>}
          <p><strong>Privacy:</strong>{' '}
            <a href="mailto:privacy@nessahub.com">privacy@nessahub.com</a>
          </p>
          <p style={{ marginBottom: 0, fontSize: '0.85rem', color: '#64748b' }}>
            For emergencies or risk of harm, use the <a href="/crisis-support">Crisis support</a> page — not this form.
          </p>
        </div>
        <div className="public-card">
          <h2>Office hours</h2>
          <p>We respond to most inquiries within <strong>1–2 business days</strong>.</p>
          <p style={{ marginBottom: 0 }}>Include your account email and a short description so we can help faster.</p>
        </div>
      </div>

      <div className="public-card" style={{ marginTop: '1rem' }}>
        <h2>Send a message</h2>
        <p className="public-form-hint" style={{ marginTop: 0 }}>
          Opens your email app with a pre-filled message. No data is stored on this page.
        </p>
        <form className="public-form" onSubmit={openMailto}>
          <label htmlFor="c-name">Name</label>
          <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />

          <label htmlFor="c-email">Your email *</label>
          <input id="c-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

          <label htmlFor="c-subject">Subject</label>
          <input id="c-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Login issue" />

          <label htmlFor="c-msg">Message *</label>
          <textarea id="c-msg" required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" />

          {sentHint ? <p className="public-form-hint" style={{ color: sentHint.includes('Please') ? '#b45309' : '#15803d' }}>{sentHint}</p> : null}

          <div className="public-cta-row" style={{ marginTop: 0 }}>
            <button type="submit" className="public-btn public-btn-primary">Open in email app</button>
          </div>
        </form>
      </div>
    </PublicPageShell>
  );
}
