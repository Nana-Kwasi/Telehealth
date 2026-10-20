import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, ShieldCheck, Clock, MapPin, AlertTriangle, Send, HelpCircle, ArrowRight } from 'lucide-react';
import PublicPageShell from './PublicPageShell';
import useSystemConfig, { cfg } from '../../hooks/useSystemConfig';
import { api } from '../../services/apiClient';

const DEFAULT_SUPPORT_EMAIL = 'support@nessahub.com';
const TOPICS = ['General question', 'Account or sign-in', 'Appointments', 'Payments & billing', 'Prescriptions & pharmacies', 'Privacy & data', 'Partner with NessaHub', 'Something else'];

/**
 * Contact. The form used to open the visitor's email app (nothing reached us
 * if they had no mail app set up). It now sends straight to NessaHub: the
 * message lands in the admin Reports Centre and is emailed to the team.
 */
export default function ContactPage() {
  const sysConfig = useSystemConfig();
  const SUPPORT_EMAIL = cfg(sysConfig, 'general', 'supportEmail', DEFAULT_SUPPORT_EMAIL) || DEFAULT_SUPPORT_EMAIL;
  const SUPPORT_PHONE = cfg(sysConfig, 'general', 'supportPhone', '');
  const [form, setForm] = useState({ name: '', email: '', topic: TOPICS[0], subject: '', message: '', website: '' });
  const [state, setState] = useState({ busy: false, ok: '', err: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || form.message.trim().length < 5) {
      setState({ busy: false, ok: '', err: 'Please add your email and a short message.' });
      return;
    }
    setState({ busy: true, ok: '', err: '' });
    try {
      await api('/api/v1/support/public-contact', { method: 'POST', authenticated: false, body: form });
      setState({ busy: false, ok: 'Thank you — your message has reached our team. We will reply to your email within 1–2 business days.', err: '' });
      setForm((f) => ({ ...f, subject: '', message: '' }));
    } catch (err) {
      setState({ busy: false, ok: '', err: err?.message || `We could not send that. Please email ${SUPPORT_EMAIL} instead.` });
    }
  };

  return (
    <PublicPageShell eyebrow="Get in touch" title="Contact us" lead="Questions about accounts, billing or using NessaHub? Our team reads every message.">
      <section className="pp-section">
        <div className="pp-grid four">
          <a className="pp-card is-action" href={`mailto:${SUPPORT_EMAIL}`} style={{ textDecoration: 'none' }}>
            <span className="pp-icon pp-tone-blue"><Mail size={20} /></span>
            <h3>Email support</h3><p>{SUPPORT_EMAIL}</p>
          </a>
          {SUPPORT_PHONE ? (
            <a className="pp-card is-action" href={`tel:${SUPPORT_PHONE.replace(/\s+/g, '')}`} style={{ textDecoration: 'none' }}>
              <span className="pp-icon pp-tone-teal"><Phone size={20} /></span>
              <h3>Call us</h3><p>{SUPPORT_PHONE}</p>
            </a>
          ) : (
            <div className="pp-card">
              <span className="pp-icon pp-tone-teal"><Clock size={20} /></span>
              <h3>Response time</h3><p>Most messages are answered within 1–2 business days.</p>
            </div>
          )}
          <a className="pp-card is-action" href="mailto:privacy@nessahub.com" style={{ textDecoration: 'none' }}>
            <span className="pp-icon pp-tone-violet"><ShieldCheck size={20} /></span>
            <h3>Privacy & data</h3><p>privacy@nessahub.com</p>
          </a>
          <div className="pp-card">
            <span className="pp-icon pp-tone-amber"><MapPin size={20} /></span>
            <h3>Where we are</h3><p>Accra, Ghana · serving patients online across the country</p>
          </div>
        </div>
      </section>

      <section className="pp-section pp-split">
        <div className="pp-card">
          <h3 style={{ fontSize: '1.15rem' }}>Send us a message</h3>
          <p>Tell us what you need and how to reach you. If you have an account, use the email you sign in with so we can find it.</p>
          <form className="pp-form" onSubmit={submit} noValidate>
            <label>Your name<input value={form.name} onChange={set('name')} autoComplete="name" placeholder="e.g. Ama Mensah" /></label>
            <label>Your email *<input type="email" required value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" /></label>
            <label>Topic
              <select value={form.topic} onChange={set('topic')}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label>Subject<input value={form.subject} onChange={set('subject')} placeholder="A few words" /></label>
            <label className="full">Message *<textarea required value={form.message} onChange={set('message')} placeholder="How can we help?" /></label>
            {/* Bots fill every field; people never see this one. */}
            <label className="pp-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
            {state.ok ? <div className="pp-note ok full" role="status">{state.ok}</div> : null}
            {state.err ? <div className="pp-note err full" role="alert">{state.err}</div> : null}
            <div className="full">
              <button type="submit" className="pp-btn" disabled={state.busy}><Send size={16} /> {state.busy ? 'Sending…' : 'Send message'}</button>
            </div>
          </form>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="pp-alert" role="note">
            <AlertTriangle size={20} />
            <div>
              <strong>Not for emergencies</strong>
              <p>If you or someone else is at risk of harm, call local emergency services or see <a href="/crisis-support">crisis support</a>. This form is not monitored around the clock.</p>
            </div>
          </div>
          <div className="pp-card">
            <span className="pp-icon pp-tone-slate"><Clock size={20} /></span>
            <h3>When we reply</h3>
            <p>We answer most messages within 1–2 business days. Include your account email and a short description so we can help faster.</p>
          </div>
          <Link to="/help" className="pp-card is-action" style={{ textDecoration: 'none' }}>
            <span className="pp-icon pp-tone-blue"><HelpCircle size={20} /></span>
            <h3>Find an answer now</h3>
            <p>Many questions are answered in the help centre — passwords, payments, prescriptions and more.</p>
            <span className="pp-cta">Open help centre <ArrowRight size={15} /></span>
          </Link>
        </div>
      </section>
    </PublicPageShell>
  );
}
