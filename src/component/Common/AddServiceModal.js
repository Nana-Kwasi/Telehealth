import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import * as HI from '@healthicons/react';
import { IconBubble } from './EmptyState';
import './AddServiceModal.css';

/*
 * "Add therapy to your account" / "See a doctor on NessaHub".
 *
 * One NessaHub account covers medical care and therapy, so someone who already
 * has an account skips everything they have done (account, sign-in, contact
 * details, the NessaHub policies) and goes through only what this service needs.
 * Nothing that matters is skipped: the questions, the service's own consent and
 * policies, choosing the clinician and paying all still happen, in the same
 * screens a new person uses.
 */
const COPY = {
  therapy: {
    icon: HI.MentalHealthTherapy, tone: 'violet',
    title: 'Add therapy to your NessaHub account',
    lead: 'You do not need a new account. We will use the details you have already given us.',
    done: ['Your account and sign-in', 'Your contact details', 'The NessaHub policies you accepted'],
    steps: [
      ['A few questions about how you have been feeling', 'So we can match you with the right therapist. About 5 minutes.'],
      ['Read and accept the therapy consent and policies', 'What therapy covers, how your privacy is protected, and its limits. You sign with your name.'],
      ['Choose your therapist', 'From therapists matched to your answers.'],
      ['Choose a plan and pay', 'Then book your first session.'],
    ],
    start: 'Start',
    path: '/questionnaire',
  },
  medical: {
    icon: HI.Stethoscope, tone: 'blue',
    title: 'See a doctor on NessaHub',
    lead: 'You do not need a new account. We will use the details you have already given us.',
    done: ['Your account and sign-in', 'Your contact details', 'The NessaHub policies you accepted'],
    steps: [
      ['Tell us what is wrong', 'Three short steps: what you feel, for how long, and how bad it is.'],
      ['Choose a doctor', 'From doctors who can help with it.'],
      ['Pick a time and pay', 'Your consultation is then booked.'],
    ],
    start: 'Start',
    path: '/medical',
  },
};

export default function AddServiceModal({ service, onClose }) {
  const navigate = useNavigate();
  const c = COPY[service];
  useEffect(() => {
    if (!c) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [c, onClose]);
  if (!c) return null;

  const start = () => {
    onClose();
    navigate(c.path, { state: { addingService: service } });
  };

  // Drawn on the page body: inside a sidebar or chat panel it could be hidden or clipped.
  return createPortal(
    <div className="asm-back" onClick={onClose}>
      <div className={`asm-card asm-${service}`} role="dialog" aria-modal="true" aria-labelledby="asm-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="asm-x" onClick={onClose} aria-label="Close">×</button>
        <div className="asm-hero">
          <IconBubble icon={c.icon} tone={c.tone} size={40} />
          <h2 id="asm-title">{c.title}</h2>
          <p>{c.lead}</p>
        </div>
        <div className="asm-done">
          <span className="asm-kicker">Already done</span>
          <ul>{c.done.map((d) => <li key={d}><span className="asm-tick" aria-hidden>✓</span>{d}</li>)}</ul>
        </div>
        <div className="asm-steps">
          <span className="asm-kicker">What is left</span>
          <ol>
            {c.steps.map(([t, d], i) => (
              <li key={t}>
                <span className="asm-num" aria-hidden>{i + 1}</span>
                <span><strong>{t}</strong><small>{d}</small></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="asm-actions">
          <button type="button" className="asm-later" onClick={onClose}>Not now</button>
          <button type="button" className="asm-go" onClick={start}>{c.start}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
