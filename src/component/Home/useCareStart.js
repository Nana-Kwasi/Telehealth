import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { beginTherapySession } from '../../utils/patientSessionIntent';
import TherapyTypeModal, { THERAPY_TYPES, PSYCHIATRY_TYPES } from './TherapyTypeModal';

/**
 * Starting care from any public page, the same way the home page does: therapy
 * and psychiatry first ask "who is this for?" (individual, teen or couples) and
 * then hand off to that journey. The About and Resources pages linked straight
 * to the old questionnaire and /medpsych screens, skipping the choice.
 *
 * Returns the openers and the modals to render once on the page.
 */
const STALE_KEYS = [
  'th.onboard', 'th.subscription', 'th.match',
  'th.parentInfo', 'th.childInfo', 'th.parentConsent',
  'th.coupleId', 'th.couplePartnerRole', 'th.coupleInviteToken',
  'th.coupleMyIntakeComplete',
];

export default function useCareStart() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(null); // null | 'therapy' | 'psychiatry'

  const start = (type) => {
    setOpen(null);
    beginTherapySession(type === 'couples' ? 'couples' : 'therapy');
    // A half-finished teen or couple attempt must not follow the user into a new one.
    STALE_KEYS.forEach((k) => localStorage.removeItem(k));
    Object.keys(localStorage).forEach((k) => { if (k.startsWith('th.coupleDraft_')) localStorage.removeItem(k); });
    if (type === 'teen') { navigate('/teen/parent-guardian'); return; }
    if (type === 'couples') { navigate('/couple/initiation'); return; }
    localStorage.setItem('th.onboard', JSON.stringify({ therapyType: type, startedAt: new Date().toISOString() }));
    navigate('/questionnaire');
  };

  const modals = (
    <>
      <TherapyTypeModal
        open={open === 'therapy'}
        onClose={() => setOpen(null)}
        onSelect={start}
        eyebrow="Psychology & Counseling"
        title="What kind of therapy?"
        subtitle="This decides who you will be matched with."
        options={THERAPY_TYPES}
      />
      <TherapyTypeModal
        open={open === 'psychiatry'}
        onClose={() => setOpen(null)}
        onSelect={start}
        eyebrow="Psychiatry"
        title="Who is this care for?"
        subtitle="This decides which psychiatrist you are matched with."
        options={PSYCHIATRY_TYPES}
      />
    </>
  );

  return {
    openTherapy: () => setOpen('therapy'),
    openPsychiatry: () => setOpen('psychiatry'),
    goMedical: () => navigate('/medical'),
    goSecondOpinion: () => navigate('/second-opinion'),
    modals,
  };
}
