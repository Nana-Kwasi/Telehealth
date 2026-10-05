import React, { useState, useEffect } from 'react';
import { Leaf, Mail, MailOpen, User } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Wellness content a client or patient has RECEIVED.
 *
 * The counterpart to ProviderWellness. Until now wellness campaigns existed
 * only as outbound email, so anyone who had wellness email switched off — or
 * who simply wanted to re-read something from last week — had no way back to
 * it. There was no screen at all on either platform.
 *
 * This is pull, not push: it does not notify, and opening it is a deliberate
 * act, which is why a message skipped by an email opt-out is still listed.
 * Nothing here is clinical advice and nothing here is a message from the
 * platform — each item names the clinician who wrote it.
 */
export default function ClientWellness({ peopleNoun = 'therapist' }) {
  const [items, setItems]     = useState([]);
  const [openId, setOpenId]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api('/api/v1/campaigns/mine');
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load your wellness messages.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={S.page}>
      <header style={S.head}>
        <span style={S.headIcon}><Leaf size={20} /></span>
        <div>
          <h1 style={S.h1}>Wellness</h1>
          <p style={S.lead}>
            Encouragement and tips your {peopleNoun} has sent you. Everything here
            is kept, so you can come back to it whenever you like.
          </p>
        </div>
      </header>

      {error ? <div style={S.error}>{error}</div> : null}

      {loading ? (
        <p style={S.muted}>Loading…</p>
      ) : items.length === 0 ? (
        <section style={S.card}>
          <Leaf size={30} style={{ color: '#9aa1b4' }} />
          <p style={S.empty}>
            Nothing yet. When your {peopleNoun} sends wellness content it will
            appear here — you do not have to do anything to receive it.
          </p>
        </section>
      ) : items.map((m) => {
        const open = openId === m.id;
        const body = toPlainText(m.body_html);
        return (
          <article key={m.id} style={S.item}>
            <button
              type="button"
              style={S.itemTop}
              onClick={() => setOpenId(open ? null : m.id)}
              aria-expanded={open}
            >
              <span style={S.itemIcon}>
                {open ? <MailOpen size={16} /> : <Mail size={16} />}
              </span>
              <span style={S.itemText}>
                <span style={S.itemSubject}>{m.subject || m.title || 'Wellness note'}</span>
                <span style={S.itemMeta}>
                  <User size={12} />
                  {m.author_name || 'Your care team'}
                  {m.received_at ? ` · ${fmtDate(m.received_at)}` : ''}
                </span>
              </span>
            </button>

            {open ? (
              <div style={S.itemBody}>
                {body
                  ? body.split(/\n{2,}/).map((para, i) => (
                      <p key={i} style={S.para}>{para}</p>
                    ))
                  : <p style={S.para}>This message has no content.</p>}

                {/* Said plainly rather than left to be discovered: a message
                    can be here while the email never arrived. */}
                {m.delivery_status === 'skipped' ? (
                  <p style={S.skipNote}>
                    This was not emailed to you because wellness email is
                    switched off in your notification settings.
                  </p>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

/**
 * Providers type into a plain textarea, so the stored "html" is almost always
 * plain text — but it is free text written by another account, and injecting it
 * as markup would hand whoever wrote it a script on this page. Render the words
 * only: strip tags, unwrap the handful of entities a person actually types.
 */
function toPlainText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* Literals, each measured against the surface it sits on — this screen renders
   inside role shells that do not define the zencare tokens. */
const S = {
  page: { padding: '1.5rem', maxWidth: 780, margin: '0 auto' },

  head: { display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '1.25rem' },
  headIcon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, flexShrink: 0, borderRadius: 14,
    background: '#e4f6ec', color: '#12602f',            /* 6.82:1 */
  },
  h1: { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#15173a' },   /* 17.28:1 */
  lead: { margin: '0.2rem 0 0', fontSize: '0.87rem', lineHeight: 1.55, color: '#656b7d' }, /* 5.31:1 */

  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
    padding: '2.5rem 1.5rem', textAlign: 'center',
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 18,
  },
  empty: { margin: 0, maxWidth: 420, fontSize: '0.88rem', lineHeight: 1.6, color: '#656b7d' },
  muted: { fontSize: '0.88rem', color: '#656b7d' },
  error: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
    padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1rem', fontSize: '0.88rem',
  },

  item: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 16,
    marginBottom: '0.6rem', overflow: 'hidden',
  },
  itemTop: {
    display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%',
    padding: '0.95rem 1.05rem', textAlign: 'left',
    background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  },
  itemIcon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 34, height: 34, flexShrink: 0, borderRadius: 10,
    background: '#eef4ff', color: '#1a3ea8',            /* 7.61:1 */
  },
  itemText: { display: 'flex', flexDirection: 'column', gap: '0.18rem', minWidth: 0, flex: 1 },
  itemSubject: { fontSize: '0.92rem', fontWeight: 700, color: '#15173a' },
  itemMeta: {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    fontSize: '0.76rem', color: '#656b7d',              /* 5.31:1 */
  },

  itemBody: { padding: '0 1.05rem 1.1rem', borderTop: '1px solid #eef0f5' },
  para: { margin: '0.85rem 0 0', fontSize: '0.9rem', lineHeight: 1.65, color: '#3d4257' }, /* 9.42:1 */
  skipNote: {
    margin: '1rem 0 0', padding: '0.6rem 0.8rem', borderRadius: 10,
    background: '#fff8ec', border: '1px solid #f6e2bd',
    fontSize: '0.8rem', lineHeight: 1.55, color: '#7a4a08',   /* 6.28:1 */
  },
};
