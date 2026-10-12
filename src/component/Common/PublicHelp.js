import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Sparkles, HelpCircle, ArrowUp } from 'lucide-react';
import { api } from '../../services/apiClient';
import FaqSection from './FaqSection';
import './PublicHelp.css';

/**
 * Floating help for visitors: a button on every public page until someone signs
 * in or signs up (App renders it only without a session), opening a window
 * with two tabs — "Ask Ness" (answers from the FAQ and app guide only, POST
 * /api/v1/help/ask) and the FAQ. Matches the app's PublicHelpFab.
 */
const SUGGESTIONS = [
  'How do I book a doctor?',
  'How does therapy matching work?',
  'Is my information private?',
  'Can teenagers use NessaHub?',
];

export default function PublicHelp() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('ask');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([]);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread, busy]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ('');
    setBusy(true);
    setThread((t) => [...t, { role: 'me', text: question }]);
    try {
      const d = await api('/api/v1/help/ask', { method: 'POST', body: { question, audience: 'visitor' }, authenticated: false });
      setThread((t) => [...t, { role: 'ness', text: d.answer, related: d.related || [], limited: d.limited }]);
    } catch (err) {
      setThread((t) => [...t, { role: 'ness', text: err?.message || 'Ness could not answer right now. Please try again shortly.', related: [] }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      {!open ? (
        <button type="button" className="ph-fab" onClick={() => setOpen(true)} aria-label="Help: ask Ness or read the FAQ">
          <MessageCircle size={26} />
          <span className="ph-fab-dot" aria-hidden="true">?</span>
          <span className="ph-fab-label">Need help?</span>
        </button>
      ) : null}

      {open ? (
        <div className="ph-panel" role="dialog" aria-modal="false" aria-label="Help and questions">
          <div className="ph-head">
            <div className="ph-head-row">
              <span className="ph-head-icon"><Sparkles size={18} /></span>
              <div className="ph-head-text">
                <strong>Help &amp; questions</strong>
                <span>Ask Ness, or browse the FAQ</span>
              </div>
              <button type="button" className="ph-close" onClick={() => setOpen(false)} aria-label="Close help"><X size={22} /></button>
            </div>
            <div className="ph-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'ask'} className={tab === 'ask' ? 'on' : ''} onClick={() => setTab('ask')}>
                <MessageCircle size={15} /> Ask Ness
              </button>
              <button type="button" role="tab" aria-selected={tab === 'faq'} className={tab === 'faq' ? 'on' : ''} onClick={() => setTab('faq')}>
                <HelpCircle size={15} /> FAQ
              </button>
            </div>
          </div>

          {tab === 'faq' ? (
            <div className="ph-body">
              <FaqSection audience="visitor" showAsk={false} bare title="All questions" />
            </div>
          ) : (
            <>
              <div className="ph-body ph-thread" aria-live="polite">
                <div className="ph-bubble ness">
                  Hi, I'm Ness. Ask me anything about using NessaHub — booking, therapy, payments, privacy.
                  I answer from our help pages only and can't see accounts or give medical advice.
                </div>
                {thread.length === 0 ? (
                  <div className="ph-chips">
                    {SUGGESTIONS.map((t) => <button key={t} type="button" className="ph-chip" onClick={() => ask(t)}>{t}</button>)}
                  </div>
                ) : null}
                {thread.map((m, i) => (
                  <div key={i} className={`ph-bubble ${m.role}`}>
                    {m.text}
                    {m.related?.length ? (
                      <div className="ph-chips">
                        {m.related.map((r) => <button key={r.id} type="button" className="ph-chip" onClick={() => setTab('faq')}>{r.question}</button>)}
                      </div>
                    ) : null}
                    {m.limited ? <p className="ph-note">You've asked a lot today, so this is the closest FAQ answer.</p> : null}
                  </div>
                ))}
                {busy ? <div className="ph-bubble ness ph-typing"><span /><span /><span /></div> : null}
                <div ref={endRef} />
              </div>
              <form className="ph-input" onSubmit={(e) => { e.preventDefault(); ask(); }}>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ask Ness a question…"
                  maxLength={500}
                  aria-label="Ask Ness a question about NessaHub"
                />
                <button type="submit" disabled={busy || !q.trim()} aria-label="Send"><ArrowUp size={18} /></button>
              </form>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
