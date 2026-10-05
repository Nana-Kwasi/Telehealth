import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X, Maximize2, Minimize2 } from 'lucide-react';
import { api } from '../../services/apiClient';
import AiChat from './AiChat';

/**
 * Screens that already own the bottom-right corner.
 *
 * Messaging puts the send button there and the calendar puts its "schedule"
 * FAB there (`.schedule-fab`, bottom 2rem / right 2rem), so a floating button
 * anchored to the same corner sat directly on top of both and swallowed the
 * click. On these screens the assistant steps aside: it drops the label and
 * lifts clear of whatever is underneath, rather than disappearing — losing the
 * assistant on the screen where you are most likely to want a second opinion
 * would be the worse trade.
 */
const CORNER_BUSY = /\/(messages|messaging|staff|chat|calendar|schedule)(\/|$)/i;

/**
 * Floating entry point to the assistant, and the modal it opens.
 *
 * Web previously had no floating button at all: the assistant lived only as a
 * sidebar route, so a clinician mid-way through a client list had to navigate
 * away — losing what they were looking at — to ask a question about it. Mobile
 * already worked this way; this brings the two into line.
 *
 * It hides itself entirely when AI is unavailable. A button that opens a panel
 * saying "not available" is worse than no button.
 */
export default function AiAssistantFab({ clinician = false }) {
  const { pathname }              = useLocation();
  const [open, setOpen]           = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api('/api/v1/ai/status');
        if (!cancelled) setAvailable(Boolean(s?.available));
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes, and the page behind must not scroll while the panel is up.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  if (!available) return null;

  const title = clinician ? 'NessaHub Clinical Assistant' : 'NessaHub Assistant';
  const stepAside = CORNER_BUSY.test(pathname);
  const label = clinician ? 'AI Assistant' : 'Ask AI';

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${title}`}
          title={stepAside ? label : undefined}
          style={{ ...S.fab, ...(stepAside ? S.fabCompact : null) }}
        >
          <Sparkles size={18} />
          {/* Labelled rather than a bare sparkle: someone should know what
              they are clicking before they click it. The label is dropped only
              where the corner is contested, and `title`/`aria-label` keep it
              named for anyone hovering or using a screen reader. */}
          {!stepAside ? <span style={S.fabText}>{label}</span> : null}
        </button>
      ) : null}

      {open ? (
        <div style={S.overlay} onClick={close} role="dialog" aria-modal="true" aria-label={title}>
          <div
            style={{ ...S.panel, ...(expanded ? S.panelExpanded : null) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={S.header}>
              <span style={S.headerTitle}>
                <Sparkles size={15} style={{ flexShrink: 0 }} />
                {title}
              </span>
              <div style={S.headerActions}>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  style={S.iconBtn}
                  aria-label={expanded ? 'Shrink the panel' : 'Expand the panel'}
                  title={expanded ? 'Shrink' : 'Expand'}
                >
                  {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button type="button" onClick={close} style={S.iconBtn} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* The same AiChat the sidebar route renders. One implementation,
                so a fix to streaming, documents or booking lands in both. */}
            <div style={S.body}>
              <AiChat clinician={clinician} embedded />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const S = {
  fab: {
    position: 'fixed',
    right: '1.5rem',
    bottom: '1.5rem',
    zIndex: 1200,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.8rem 1.15rem',
    border: 'none',
    borderRadius: 999,
    cursor: 'pointer',
    background: 'linear-gradient(135deg, #2b5ce6, #1d3fb8)',
    color: '#ffffff',
    fontSize: '0.86rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    boxShadow: '0 10px 28px rgba(29, 63, 184, 0.42)',
  },
  fabText: { whiteSpace: 'nowrap' },
  /* Clears a 56px FAB sitting at bottom 2rem (its top edge is 5.5rem up) and
     the ~4.5rem message composer, with room to breathe above both. */
  fabCompact: {
    bottom: '6.5rem',
    width: 52,
    height: 52,
    padding: 0,
    justifyContent: 'center',
  },

  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1300,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '1.25rem',
    background: 'rgba(16, 22, 48, 0.32)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    width: 'min(440px, 100%)',
    height: 'min(660px, 88vh)',
    borderRadius: 20,
    overflow: 'hidden',
    background: '#ffffff',
    border: '1px solid rgba(16,22,48,0.1)',
    boxShadow: '0 28px 80px rgba(16,22,48,0.34)',
  },
  // Room to read a long briefing without leaving the page behind.
  panelExpanded: { width: 'min(920px, 100%)', height: '92vh' },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0.8rem 0.9rem 0.8rem 1.1rem',
    borderBottom: '1px solid #edeff4',
    background: '#fafbfd',
    flexShrink: 0,
  },
  headerTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontSize: '0.88rem',
    fontWeight: 750,
    color: '#0f1424',
    minWidth: 0,
  },
  headerActions: { display: 'flex', gap: '0.25rem', flexShrink: 0 },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    padding: 0,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    background: 'transparent',
    color: '#4a5163',   /* 7.4:1 on #fafbfd */
  },

  // The chat owns its own scrolling; this only has to give it a box.
  body: { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' },
};
