import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, ArrowUp } from 'lucide-react';
import { api } from '../../services/apiClient';
import AiMarkdown from './AiMarkdown';

/**
 * "Ask AI" on the pharmacy, lab / scan centre, insurer and facility
 * dashboards. Answers from this organisation's live figures and about any
 * person who dealt with it, by name (first name is enough). Read-only;
 * clinical details stay private. Server: POST /api/v1/assistant/ask.
 */
const SUGGESTIONS = {
  pharmacy: ['What is waiting for us today?', 'Which medicines did we dispense most this month?', 'How are our insurance claims doing?', 'Any holds about to expire?'],
  lab: ['What is overdue right now?', 'What is our average turnaround?', 'Which tests are ordered most?', 'Which doctors send us the most orders?'],
  insurer: ['What needs a decision today?', 'Which providers cost us the most this month?', 'How many pre-authorisations are past deadline?', 'Any high fraud flags?'],
  facility: ['How many patients are still open from earlier days?', 'How are our claims doing?', 'Which insurers did we see most this month?', 'What happened today?'],
};

export default function RoleAssistant({ kind = 'pharmacy', accent = '#0f766e', label = 'Ask AI' }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const ask = useCallback(async (text) => {
    const question = String(text || '').trim();
    if (!question || busy) return;
    setQ(''); setBusy(true);
    const history = thread.map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }));
    setThread((t) => [...t, { role: 'me', text: question }]);
    try {
      const d = await api('/api/v1/assistant/ask', { method: 'POST', body: { question, history } });
      setThread((t) => [...t, { role: 'ai', text: d.answer, people: d.people || [] }]);
    } catch (e) {
      setThread((t) => [...t, { role: 'ai', text: e?.message || 'The assistant could not answer right now.' }]);
    } finally { setBusy(false); }
  }, [busy, thread]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread, busy]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} style={{ ...S.fab, background: accent }} aria-label="Ask AI">
          <Sparkles size={17} /> {label}
        </button>
      )}
      {open && (
        <div style={S.wrap} role="dialog" aria-label="AI assistant">
          <div style={S.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
          <aside style={S.drawer}>
            <header style={{ ...S.head, background: accent }}>
              <span style={S.icon}><Sparkles size={18} /></span>
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block' }}>NessaHub AI</strong>
                <small style={{ opacity: 0.85 }}>Live figures for your organisation · read-only</small>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={S.close} aria-label="Close"><X size={18} /></button>
            </header>
            <div style={S.body}>
              {thread.length === 0 && (
                <div>
                  <p style={S.intro}>Ask about your queue, figures or any person who dealt with you — a first name is enough. Medical details stay private.</p>
                  <div style={S.chips}>{(SUGGESTIONS[kind] || SUGGESTIONS.pharmacy).map((s) => <button key={s} type="button" style={S.chip} onClick={() => ask(s)}>{s}</button>)}</div>
                </div>
              )}
              {thread.map((m, i) => (
                <div key={i} style={m.role === 'me' ? { ...S.me, background: accent } : S.ai}>
                  {m.role === 'ai' ? <AiMarkdown text={m.text} /> : m.text}
                  {m.people?.length > 1 ? (
                    <div style={S.chips}>{m.people.map((p) => (
                      <button key={p.id} type="button" style={S.chip} onClick={() => ask(`Tell me about ${p.name} (${p.hint})`)}>{p.name} · {p.hint}</button>
                    ))}</div>
                  ) : null}
                </div>
              ))}
              {busy && <div style={{ ...S.ai, color: '#64748b' }}>Thinking…</div>}
              <div ref={endRef} />
            </div>
            <form style={S.form} onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your organisation…" maxLength={800} autoFocus style={S.input} />
              <button type="submit" disabled={busy || !q.trim()} style={{ ...S.send, background: accent, opacity: busy || !q.trim() ? 0.5 : 1 }} aria-label="Send"><ArrowUp size={17} /></button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

const S = {
  fab: { position: 'fixed', right: 20, bottom: 20, zIndex: 900, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fff', border: 'none', borderRadius: 999, padding: '0.7rem 1.05rem', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', boxShadow: '0 8px 24px rgba(15,23,42,0.25)' },
  wrap: { position: 'fixed', inset: 0, zIndex: 1000 },
  scrim: { position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.35)' },
  drawer: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(440px, 100%)', background: '#f8fafc', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(15,23,42,0.2)' },
  head: { display: 'flex', alignItems: 'center', gap: 10, color: '#fff', padding: '1rem 1.1rem' },
  icon: { width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  close: { border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 },
  intro: { margin: '0 0 0.6rem', color: '#475569', fontSize: '0.86rem', lineHeight: 1.5 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 999, padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  me: { alignSelf: 'flex-end', color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '0.55rem 0.8rem', maxWidth: '85%', fontSize: '0.88rem' },
  ai: { alignSelf: 'flex-start', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px 14px 14px 4px', padding: '0.6rem 0.85rem', maxWidth: '92%', fontSize: '0.88rem', color: '#0f172a' },
  form: { display: 'flex', gap: 8, padding: '0.8rem', borderTop: '1px solid #e2e8f0', background: '#fff' },
  input: { flex: 1, border: '1.5px solid #cbd5e1', borderRadius: 999, padding: '0.6rem 0.9rem', fontSize: '0.88rem' },
  send: { border: 'none', color: '#fff', borderRadius: 999, width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
