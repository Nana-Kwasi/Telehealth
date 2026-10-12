import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getStoredRole } from '../../services/apiClient';

/**
 * The FAQ, from the backend (/api/v1/faq) — one source for the web home, every
 * dashboard home and the mobile app, so the answers cannot drift apart again.
 *
 * compact: a short list for a home screen (first `limit` questions, a search
 * box that searches everything, and a link to the full page).
 */

/** Which FAQ audience the signed-in person belongs to. */
export function faqAudience(role = getStoredRole()) {
  const r = String(role || '').toLowerCase();
  if (r === 'client') return 'client';
  if (r === 'patient') return 'patient';
  if (r === 'therapist' || r === 'doctor') return 'clinician';
  return r ? 'all' : 'visitor';
}

/**
 * "Ask Ness": a question in your own words, answered from this FAQ and the app
 * guide only (POST /api/v1/help/ask). Public, so visitors can use it too; the
 * server caps how often. Related questions open the matching FAQ entry below.
 */
function AskNess({ audience, onOpen }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(null);

  const ask = async (e) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    try {
      const d = await api('/api/v1/help/ask', { method: 'POST', body: { question, audience }, authenticated: false });
      setReply({ question, ...d });
    } catch (err) {
      setReply({ question, answer: err?.message || 'Ness could not answer right now. Please try again shortly.', related: [] });
    } finally { setBusy(false); }
  };

  return (
    <div style={S.ask}>
      <form onSubmit={ask} style={S.askRow}>
        <span style={S.askBadge} aria-hidden>✦</span>
        <input
          aria-label="Ask Ness a question about NessaHub"
          placeholder="Ask Ness anything about using NessaHub…"
          value={q}
          maxLength={500}
          onChange={(e) => setQ(e.target.value)}
          style={S.askInput}
        />
        <button type="submit" disabled={busy || !q.trim()} style={{ ...S.askBtn, opacity: busy || !q.trim() ? 0.6 : 1 }}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      {reply ? (
        <div style={S.answer} aria-live="polite">
          <p style={S.answerQ}>“{reply.question}”</p>
          <p style={S.answerText}>{reply.answer}</p>
          {reply.related?.length ? (
            <div style={S.related}>
              {reply.related.map((r) => (
                <button key={r.id} type="button" style={S.chip} onClick={() => onOpen(r.id)}>{r.question}</button>
              ))}
            </div>
          ) : null}
          <p style={S.answerNote}>
            {reply.limited ? 'You have asked a lot today, so this is the closest FAQ answer. ' : ''}
            Ness answers from our help pages only. It cannot see your account or give medical advice.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function FaqSection({ audience, compact = false, limit = 6, title = 'Frequently asked questions', showAsk = true, bare = false }) {
  const who = audience || faqAudience();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    api(`/api/v1/faq?audience=${encodeURIComponent(who)}`, { authenticated: false })
      .then((d) => { if (!cancelled) setItems(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) { setItems([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [who]);

  const shown = useMemo(() => {
    const list = items || [];
    const s = search.trim().toLowerCase();
    if (s) return list.filter((f) => `${f.question} ${f.answer} ${f.category}`.toLowerCase().includes(s));
    return compact ? list.slice(0, limit) : list;
  }, [items, search, compact, limit]);

  // Grouped by category on the full page; a flat list on a home screen.
  const groups = useMemo(() => {
    if (compact) return [[null, shown]];
    const m = new Map();
    shown.forEach((f) => { if (!m.has(f.category)) m.set(f.category, []); m.get(f.category).push(f); });
    return [...m.entries()];
  }, [shown, compact]);

  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <section style={bare ? S.bare : S.wrap} aria-labelledby="faq-title">
      <div style={S.head}>
        <h2 id="faq-title" style={S.title}>{title}</h2>
        {compact ? <Link to={`/faqs?for=${who}`} style={S.all}>See all FAQs →</Link> : null}
      </div>
      {showAsk ? <AskNess audience={who} onOpen={(id) => { setSearch(''); setOpen((prev) => new Set(prev).add(id)); setTimeout(() => document.getElementById(`faq-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }} /> : null}
      <input
        type="search"
        aria-label="Search the FAQ"
        placeholder="Search questions…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={S.search}
      />
      {items === null ? <p style={S.muted}>Loading…</p> : null}
      {failed ? <p style={S.muted}>The FAQ could not be loaded right now. Please try again shortly.</p> : null}
      {items && !failed && shown.length === 0 ? <p style={S.muted}>No matches — try another word.</p> : null}
      {groups.map(([category, list]) => (
        <div key={category || 'all'}>
          {category ? <h3 style={S.cat}>{category}</h3> : null}
          {list.map((f) => (
            <div key={f.id} id={`faq-${f.id}`} style={S.item}>
              <button type="button" style={S.q} onClick={() => toggle(f.id)} aria-expanded={open.has(f.id)}>
                <span>{f.question}</span>
                <span aria-hidden style={S.sign}>{open.has(f.id) ? '−' : '+'}</span>
              </button>
              {open.has(f.id) ? <div style={S.a}>{f.answer}</div> : null}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

const S = {
  wrap: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.1rem 1.2rem', margin: '1rem 0', boxSizing: 'border-box' },
  bare: { padding: '0.25rem 0.25rem 1rem' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' },
  title: { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' },
  all: { fontSize: '0.88rem', fontWeight: 700, color: '#2b5ce6', textDecoration: 'none' },
  search: { width: '100%', maxWidth: 420, margin: '0.75rem 0 0.5rem', padding: '0.6rem 0.85rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' },
  cat: { margin: '1rem 0 0.35rem', fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b' },
  item: { borderBottom: '1px solid #f1f5f9' },
  q: { width: '100%', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', textAlign: 'left', background: 'none', border: 'none', padding: '0.75rem 0', fontSize: '0.95rem', fontWeight: 650, color: '#0f172a', cursor: 'pointer' },
  sign: { fontSize: '1.15rem', color: '#2b5ce6', flex: '0 0 auto' },
  a: { padding: '0 0 0.85rem', fontSize: '0.92rem', lineHeight: 1.55, color: '#334155' },
  muted: { color: '#64748b', fontSize: '0.9rem' },
  ask: { margin: '0.85rem 0 0.25rem', padding: '0.75rem', borderRadius: 14, background: 'linear-gradient(135deg, #eef6f0, #f6faf4)', border: '1px solid #d6e7da' },
  askRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  askBadge: { width: 34, height: 34, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, background: 'linear-gradient(135deg, #5a9a6d, #2f5e3f)' },
  askInput: { flex: 1, minWidth: 0, padding: '0.6rem 0.85rem', borderRadius: 10, border: '1.5px solid #b9d4bf', fontSize: '0.9rem', background: '#fff' },
  askBtn: { border: 'none', borderRadius: 10, padding: '0.6rem 1rem', fontWeight: 700, color: '#fff', background: '#4a7c59', cursor: 'pointer' },
  answer: { marginTop: '0.7rem', background: '#fff', borderRadius: 12, padding: '0.75rem 0.9rem', border: '1px solid #d6e7da' },
  answerQ: { margin: 0, fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' },
  answerText: { margin: '0.35rem 0 0', fontSize: '0.92rem', lineHeight: 1.55, color: '#0f172a', whiteSpace: 'pre-line' },
  related: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' },
  chip: { border: '1px solid #b9d4bf', background: '#eef6f0', color: '#2f5e3f', borderRadius: 999, padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  answerNote: { margin: '0.6rem 0 0', fontSize: '0.74rem', color: '#94a3b8' },
};
