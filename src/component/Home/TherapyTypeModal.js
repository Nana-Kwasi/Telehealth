import React, { useEffect, useRef } from 'react';
import { User, Smile, Heart, ChevronRight, X } from 'lucide-react';

/**
 * "Which kind?" — asked before a sign-up that branches.
 *
 * Both Psychology & Counseling and Psychiatry ask the same question with the
 * same three answers, so they share this dialog rather than each growing their
 * own. Psychiatry previously revealed the choices as cards pushed inline into
 * the hero, which moved the page under the cursor and left the rest of the
 * hero live behind them; this presents the same options as a real modal.
 *
 * The keys match what the rest of the app already stores and branches on —
 * note `couples`, plural, which is what `th.onboard` and `startTherapy` use.
 * A singular `couple` here would look harmless and silently fail every
 * downstream comparison.
 */
export const THERAPY_TYPES = [
  { key: 'individual', title: 'Individual', body: 'One-to-one therapy for you.', Icon: User },
  { key: 'teen',       title: 'Teen',       body: 'For under-18s. A parent or guardian consents first.', Icon: Smile },
  { key: 'couples',    title: 'Couples',    body: 'For you and your partner, together.', Icon: Heart },
];

/** Psychiatry sees the same three, worded for medication-led care. */
export const PSYCHIATRY_TYPES = [
  { key: 'individual', title: 'Individual', body: 'An assessment and treatment plan for you.', Icon: User },
  { key: 'teen',       title: 'Teen',       body: 'For under-18s. A parent or guardian consents first.', Icon: Smile },
  { key: 'couples',    title: 'Couples',    body: 'For you and your partner, seen together.', Icon: Heart },
];

export default function TherapyTypeModal({
  open,
  onClose,
  onSelect,
  title = 'What kind of therapy?',
  subtitle = 'This decides who you will be matched with.',
  eyebrow = 'Psychology & Counseling',
  options = THERAPY_TYPES,
}) {
  const panelRef = useRef(null);

  // Escape closes, and the page behind must not scroll while this is up —
  // without the lock the hero slides around under the overlay on trackpads.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    // Focus the panel so the keyboard lands inside the dialog, not behind it.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ttm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="ttm-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="ttm-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <span className="ttm-eyebrow">{eyebrow}</span>
        <h2 className="ttm-title">{title}</h2>
        <p className="ttm-sub">{subtitle}</p>

        <div className="ttm-options">
          {options.map(({ key, title: optTitle, body, Icon }) => (
            <button
              key={key}
              type="button"
              className="ttm-option"
              onClick={() => onSelect(key)}
            >
              <span className="ttm-option-icon"><Icon size={20} /></span>
              <span className="ttm-option-text">
                <span className="ttm-option-title">{optTitle}</span>
                <span className="ttm-option-body">{body}</span>
              </span>
              <ChevronRight className="ttm-option-chev" size={18} />
            </button>
          ))}
        </div>

        <p className="ttm-foot">You can change this later — nothing is booked yet.</p>
      </div>
    </div>
  );
}
