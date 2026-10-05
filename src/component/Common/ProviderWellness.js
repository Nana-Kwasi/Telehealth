import React, { useState, useEffect } from 'react';
import { Leaf, Send, Users } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Wellness content a provider sends to their OWN people.
 *
 * `audience` is fixed by the dashboard that mounts this — 'my_clients' for a
 * therapist, 'my_patients' for a doctor — and is never a choice on screen. The
 * backend rejects the wrong pairing anyway; keeping it out of the UI means a
 * therapist is never even offered the option of mailing medical patients.
 *
 * Recipients can turn wellness email off, so the reach line shows both numbers
 * rather than implying everyone will receive it.
 */
export default function ProviderWellness({ audience = 'my_clients', peopleNoun = 'clients' }) {
  const [sent, setSent]       = useState([]);
  const [reach, setReach]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm]       = useState({ title: '', subject: '', bodyHtml: '' });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, r] = await Promise.all([
        api('/api/v1/campaigns?type=wellness'),
        api(`/api/v1/campaigns/audience-preview?audience=${encodeURIComponent(audience)}&category=wellness`)
          .catch(() => null),
      ]);
      setSent(Array.isArray(list) ? list : []);
      setReach(r);
    } catch (e) {
      setError(e.message || 'Could not load your wellness messages.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [audience]);

  const sendNow = async () => {
    if (!form.title.trim() || !form.subject.trim() || !form.bodyHtml.trim()) {
      setError('Add a name, a subject and a message before sending.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const created = await api('/api/v1/campaigns', {
        method: 'POST',
        body: {
          campaignType: 'wellness',
          category: 'wellness',
          audience,
          title: form.title,
          subject: form.subject,
          bodyHtml: form.bodyHtml,
        },
      });
      const res = await api(`/api/v1/campaigns/${created.id}/send`, { method: 'POST' });
      setMessage(
        `Sent to ${res.sent} of your ${res.audienceSize} ${peopleNoun}.` +
        (res.skipped ? ` ${res.skipped} have wellness email turned off.` : ''),
      );
      setForm({ title: '', subject: '', bodyHtml: '' });
      load();
    } catch (e) {
      setError(e.message || 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.page}>
      <header style={S.head}>
        <span style={S.headIcon}><Leaf size={20} /></span>
        <div>
          <h1 style={S.h1}>Wellness messages</h1>
          <p style={S.lead}>
            Encouragement and tips for your own {peopleNoun}. Nobody else receives these.
          </p>
        </div>
      </header>

      {error   ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      <section style={S.card}>
        <h2 style={S.h2}>Compose</h2>

        <Field label="Title" hint="For your own records — recipients never see this.">
          <input style={S.input} value={form.title} placeholder="e.g. September check-in"
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>

        <Field label="Subject line" hint="This is what lands in their inbox.">
          <input style={S.input} value={form.subject}
            placeholder="A small thing to try this week"
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
        </Field>

        <Field label="Message" hint="Plain text or simple HTML. Keep it short.">
          <textarea rows={8} style={{ ...S.input, ...S.textarea }}
            value={form.bodyHtml}
            placeholder="Write as you would speak to them."
            onChange={(e) => setForm((f) => ({ ...f, bodyHtml: e.target.value }))} />
        </Field>

        {/* Both numbers, never just the total: wellness email is refusable, and
            implying everyone receives it would be untrue. */}
        {reach ? (
          <div style={reach.total === 0 ? S.reachEmpty : S.reach}>
            <Users size={15} />
            <span>
              {reach.total === 0
                ? `You have no ${peopleNoun} to send to yet.`
                : `${reach.optedIn} of ${reach.total} ${peopleNoun} will receive this — the rest have wellness email switched off.`}
            </span>
          </div>
        ) : null}

        <div style={S.actions}>
          <button
            onClick={sendNow}
            disabled={busy || (reach && reach.total === 0)}
            style={busy || (reach && reach.total === 0) ? S.primaryOff : S.primary}
          >
            <Send size={15} />
            {busy ? 'Sending…' : 'Send now'}
          </button>
        </div>
      </section>

      <h2 style={S.sectionTitle}>Previously sent</h2>
      {loading ? (
        <p style={S.muted}>Loading…</p>
      ) : sent.length === 0 ? (
        <section style={S.card}>
          <p style={S.empty}>
            You have not sent any wellness messages yet. The first one you send appears here.
          </p>
        </section>
      ) : sent.map((c) => (
        <section key={c.id} style={S.sentCard}>
          <div style={S.sentTop}>
            <span style={S.sentTitle}>{c.title}</span>
            <span style={S.sentPill}>{c.status || 'sent'}</span>
          </div>
          <div style={S.sentMeta}>
            {c.subject ? `${c.subject} · ` : ''}
            {c.sent_at ? new Date(c.sent_at).toLocaleDateString(undefined,
              { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not sent yet'}
          </div>
        </section>
      ))}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={S.field}>
      <span style={S.label}>{label}</span>
      {children}
      {hint ? <span style={S.hint}>{hint}</span> : null}
    </label>
  );
}

function Banner({ tone, children }) {
  const ok = tone === 'ok';
  return (
    <div style={{
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      color: ok ? '#166534' : '#991b1b',
      padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem',
    }}>{children}</div>
  );
}

/* Literals, each measured against the surface it sits on — this screen renders
   inside role shells that do not define the zencare tokens. */
const S = {
  page: { padding: '1.5rem', maxWidth: 820, margin: '0 auto' },

  head: { display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '1.25rem' },
  headIcon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, flexShrink: 0, borderRadius: 14,
    background: '#e4f6ec', color: '#12602f',            /* 6.82:1 */
  },
  h1: { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#15173a' },   /* 17.28:1 */
  h2: { margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800, color: '#15173a' },
  lead: { margin: '0.2rem 0 0', fontSize: '0.87rem', lineHeight: 1.55, color: '#656b7d' }, /* 5.31:1 */
  sectionTitle: {
    margin: '1.75rem 0 0.8rem', fontSize: '0.8rem', fontWeight: 800,
    letterSpacing: '0.06em', textTransform: 'uppercase', color: '#2b3142',
  },

  card: {
    background: '#ffffff', border: '1px solid #ebecf3', borderRadius: 20,
    padding: '1.25rem',
  },

  field: { display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1rem' },
  label: { fontSize: '0.8rem', fontWeight: 700, color: '#2b3142' },           /* 12.96:1 */
  hint:  { fontSize: '0.74rem', lineHeight: 1.45, color: '#6b7283' },         /* 4.82:1 */
  input: {
    width: '100%', padding: '0.65rem 0.8rem', border: '1.5px solid #d8dce6',
    borderRadius: 11, fontSize: '0.88rem', fontFamily: 'inherit',
    color: '#15173a', background: '#ffffff', boxSizing: 'border-box',
  },
  textarea: { minHeight: 150, resize: 'vertical', lineHeight: 1.6 },

  reach: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.7rem 0.85rem', borderRadius: 12, marginBottom: '1rem',
    background: '#e4f6ec', border: '1px solid #c6e9d5',
    color: '#12602f', fontSize: '0.82rem', lineHeight: 1.5,                    /* 6.82:1 */
  },
  reachEmpty: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.7rem 0.85rem', borderRadius: 12, marginBottom: '1rem',
    background: '#fdeee0', border: '1px solid #f8d9bd',
    color: '#8a4b09', fontSize: '0.82rem', lineHeight: 1.5,                    /* 5.98:1 */
  },

  actions: { display: 'flex', gap: '0.6rem' },
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
    padding: '0.72rem 1.3rem', border: 'none', borderRadius: 999,
    background: '#15803d', color: '#ffffff',                                   /* 5.02:1 */
    fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(21, 128, 61, 0.28)',
  },
  primaryOff: {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
    padding: '0.72rem 1.3rem', border: 'none', borderRadius: 999,
    background: '#15803d', color: '#ffffff', opacity: 0.45,
    fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700, cursor: 'not-allowed',
  },

  sentCard: {
    background: '#ffffff', border: '1px solid #ebecf3', borderRadius: 16,
    padding: '0.9rem 1rem', marginBottom: '0.6rem',
  },
  sentTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' },
  sentTitle: { fontSize: '0.92rem', fontWeight: 750, color: '#15173a' },
  sentPill: {
    flexShrink: 0, padding: '0.14rem 0.55rem', borderRadius: 999,
    background: '#e4f6ec', color: '#12602f', fontSize: '0.68rem', fontWeight: 800,
  },
  /* Was #7b8190 at 3.90:1 — under the floor. */
  sentMeta: { marginTop: '0.25rem', fontSize: '0.78rem', color: '#656b7d' },   /* 5.31:1 */

  muted: { fontSize: '0.86rem', color: '#656b7d' },
  empty: { margin: 0, fontSize: '0.86rem', lineHeight: 1.6, color: '#656b7d' },
};
