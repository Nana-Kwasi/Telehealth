import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartHandshake, Stethoscope, Brain, FileSearch, HelpCircle, LifeBuoy, ArrowRight, Video, Pill, FlaskConical,
  ClipboardList, ShieldAlert,
} from 'lucide-react';
import PublicPageShell from './PublicPageShell';
import useCareStart from './useCareStart';

/**
 * Resources: start any kind of care, and short guides to how NessaHub works.
 * Therapy and psychiatry open the "who is this for?" choice (individual, teen
 * or couples) used on the home page; the tiles used to link straight to the
 * old questionnaire and /medpsych screens, skipping it.
 */
const GUIDES = [
  { Icon: ClipboardList, tone: 'teal', title: 'Before your first session', body: 'Find a quiet, private space, check your camera and microphone, and note what you want to talk about. Your therapist will lead from there.' },
  { Icon: Video, tone: 'blue', title: 'How video consultations work', body: 'Join from the appointment in your dashboard a few minutes early. If the connection drops, rejoin from the same place — your clinician will wait.' },
  { Icon: Pill, tone: 'rose', title: 'Collecting a prescription', body: 'Your doctor sends it to a pharmacy branch. Show the pickup code from your Prescriptions screen at the counter; the pharmacist verifies it before handing over.' },
  { Icon: FlaskConical, tone: 'violet', title: 'Lab tests and scans', body: 'When your doctor orders a test, the lab or scan centre sees it straight away. Results go to your doctor first, who shares them with you with a note.' },
];

export default function ResourcesPage() {
  const navigate = useNavigate();
  const care = useCareStart();

  const START = [
    { Icon: HeartHandshake, tone: 'teal', title: 'Therapy', body: 'Individual, couples or teen therapy. Tell us who it is for and we will guide you through a short intake.', cta: 'Start intake', onClick: care.openTherapy, pill: 'Most popular' },
    { Icon: Stethoscope, tone: 'blue', title: 'Medical care', body: 'See a licensed doctor online for diagnosis, prescriptions and follow-up.', cta: 'Find a doctor', onClick: care.goMedical },
    { Icon: Brain, tone: 'violet', title: 'Psychiatry', body: 'Assessment and medication-led care for adults, teens and couples.', cta: 'Explore psychiatry', onClick: care.openPsychiatry },
    { Icon: FileSearch, tone: 'amber', title: 'Second opinion', body: 'An independent specialist review of a diagnosis or treatment plan.', cta: 'Request a review', onClick: care.goSecondOpinion },
  ];

  const SUPPORT = [
    { Icon: HelpCircle, tone: 'slate', title: 'FAQs', body: 'Quick answers about accounts, bookings, payments and privacy.', cta: 'Read FAQs', onClick: () => navigate('/faqs') },
    { Icon: LifeBuoy, tone: 'blue', title: 'Help centre', body: 'Step-by-step help, account questions and ways to reach our team.', cta: 'Open help centre', onClick: () => navigate('/help') },
    { Icon: ShieldAlert, tone: 'rose', title: 'Crisis support', body: 'If you or someone else is in danger right now, find urgent help immediately.', cta: 'Get urgent help', onClick: () => navigate('/crisis-support') },
  ];

  const Card = ({ Icon, tone, title, body, cta, onClick, pill }) => (
    <button type="button" className="pp-card is-action" onClick={onClick}>
      <span className={`pp-icon pp-tone-${tone}`}><Icon size={20} /></span>
      {pill ? <span className="pp-pill">{pill}</span> : null}
      <h3>{title}</h3>
      <p>{body}</p>
      <span className="pp-cta">{cta} <ArrowRight size={15} /></span>
    </button>
  );

  return (
    <PublicPageShell
      eyebrow="Guides"
      title="Resources"
      lead="Start care, learn how NessaHub works, and find help when you need it."
    >
      <section className="pp-section">
        <div className="pp-section-head">
          <p className="pp-kicker">Start care</p>
          <h2 className="pp-h2">What would you like help with?</h2>
        </div>
        <div className="pp-grid four">{START.map((c) => <Card key={c.title} {...c} />)}</div>
      </section>

      <section className="pp-section">
        <div className="pp-section-head">
          <p className="pp-kicker">Guides</p>
          <h2 className="pp-h2">How things work on NessaHub</h2>
        </div>
        <div className="pp-grid two">
          {GUIDES.map(({ Icon, tone, title, body }) => (
            <div key={title} className="pp-card">
              <span className={`pp-icon pp-tone-${tone}`}><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pp-section">
        <div className="pp-section-head">
          <p className="pp-kicker">Support</p>
          <h2 className="pp-h2">Questions or need help?</h2>
        </div>
        <div className="pp-grid">{SUPPORT.map((c) => <Card key={c.title} {...c} />)}</div>
      </section>

      {care.modals}
    </PublicPageShell>
  );
}
