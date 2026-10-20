import React from 'react';
import {
  HeartHandshake, Stethoscope, Brain, FileSearch, Pill, FlaskConical, ShieldCheck, Lock, Users, Building2,
  Sparkles, CheckCircle2, Globe, Video,
} from 'lucide-react';
import PublicPageShell from './PublicPageShell';

const SERVICES = [
  { Icon: HeartHandshake, tone: 'teal', title: 'Therapy & counselling', body: 'Individual, couples and teen therapy with licensed therapists, by video, voice or chat.' },
  { Icon: Stethoscope, tone: 'blue', title: 'Medical consultations', body: 'See a doctor online, get a diagnosis, prescriptions and follow-up care without the queue.' },
  { Icon: Brain, tone: 'violet', title: 'Psychiatry', body: 'Assessment and medication-led care from psychiatrists, for adults, teens and couples.' },
  { Icon: FileSearch, tone: 'amber', title: 'Second opinion', body: 'An independent specialist review of a diagnosis or treatment plan before you decide.' },
  { Icon: Pill, tone: 'rose', title: 'E-prescriptions & pharmacies', body: 'Prescriptions go straight to a partner pharmacy branch, with a secure pickup code.' },
  { Icon: FlaskConical, tone: 'slate', title: 'Labs & scans', body: 'Doctors order tests digitally; results come back to your doctor, who shares them with you.' },
];

const STEPS = [
  { title: 'Choose your care', body: 'Therapy, medical care, psychiatry or a second opinion — and who it is for.' },
  { title: 'Get matched', body: 'We match you with a licensed provider based on your needs and availability.' },
  { title: 'Meet securely', body: 'Consult by video, voice or chat from wherever you have a private space.' },
  { title: 'Stay connected', body: 'Prescriptions, tests, results and follow-ups stay together in one place.' },
];

const AUDIENCES = [
  { Icon: Users, tone: 'teal', title: 'Patients & families', body: 'One account for therapy and medical care, with your history in one place.' },
  { Icon: Stethoscope, tone: 'blue', title: 'Doctors & therapists', body: 'Schedules, notes, prescribing and referrals in a single workspace.' },
  { Icon: Building2, tone: 'violet', title: 'Pharmacies, labs & scan centres', body: 'Receive orders digitally, manage branches and report results without paper.' },
  { Icon: ShieldCheck, tone: 'amber', title: 'Insurers', body: 'Cover checks, pre-approvals and claims handled with the providers in real time.' },
];

const PRINCIPLES = [
  'Every provider is licensed, and verified before they can see patients.',
  'You decide what is shared: results reach you through your own clinician.',
  'Therapy notes stay between you and your therapist.',
  'AI helps clinicians write and check, but a person always makes the decision.',
  'Every sign-in and change is recorded, so access can always be traced.',
];

export default function AboutPage() {
  return (
    <PublicPageShell
      eyebrow="NessaHub"
      title="About NessaHub"
      lead="One platform for therapy, medical care, psychiatry and specialist support — built so quality care is easier to reach."
    >
      <section className="pp-section pp-split">
        <div>
          <p className="pp-kicker">Our mission</p>
          <h2 className="pp-h2">Care that is close, connected and private</h2>
          <p className="pp-sub">
            NessaHub connects people with licensed therapists, doctors, psychiatrists and specialist care through secure
            video, messaging and coordinated follow-up. Instead of moving between clinics, pharmacies and labs with paper,
            everything that belongs to your care — consultations, prescriptions, tests and results — stays in one place.
          </p>
        </div>
        <blockquote className="pp-quote">
          “Less time navigating care, more time feeling better.” That is the promise behind every screen we build.
        </blockquote>
      </section>

      <section className="pp-section">
        <div className="pp-band" aria-label="NessaHub at a glance">
          <div><strong>4 types of care</strong><span>Therapy, medical, psychiatry and second opinion</span></div>
          <div><strong>Web & mobile</strong><span>The same account on your computer and phone</span></div>
          <div><strong>End-to-end</strong><span>From consultation to pharmacy pickup and lab results</span></div>
          <div><strong>Made in Ghana</strong><span>Built in Accra for patients and providers here</span></div>
        </div>
      </section>

      <section className="pp-section">
        <div className="pp-section-head">
          <p className="pp-kicker">What we offer</p>
          <h2 className="pp-h2">Everything your care needs, together</h2>
        </div>
        <div className="pp-grid">
          {SERVICES.map(({ Icon, tone, title, body }) => (
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
          <p className="pp-kicker">How it works</p>
          <h2 className="pp-h2">From first click to follow-up</h2>
        </div>
        <div className="pp-steps">
          {STEPS.map((s) => (
            <div key={s.title} className="pp-step"><h3>{s.title}</h3><p>{s.body}</p></div>
          ))}
        </div>
      </section>

      <section className="pp-section">
        <div className="pp-section-head">
          <p className="pp-kicker">Who we serve</p>
          <h2 className="pp-h2">One network, every part of care</h2>
          <p className="pp-sub">NessaHub links the people and places involved in your care, so information moves safely instead of you carrying it.</p>
        </div>
        <div className="pp-grid four">
          {AUDIENCES.map(({ Icon, tone, title, body }) => (
            <div key={title} className="pp-card">
              <span className={`pp-icon pp-tone-${tone}`}><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pp-section pp-split">
        <div className="pp-card">
          <span className="pp-icon pp-tone-teal"><Lock size={20} /></span>
          <h3>Trust & safety</h3>
          <ul className="pp-check">
            {PRINCIPLES.map((p) => <li key={p}><CheckCircle2 size={17} />{p}</li>)}
          </ul>
        </div>
        <div className="pp-grid two" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          <div className="pp-card">
            <span className="pp-icon pp-tone-blue"><Video size={20} /></span>
            <h3>Care that fits your day</h3>
            <p>Book a time that suits you and join from home, work or anywhere private — no travel, no waiting room.</p>
          </div>
          <div className="pp-card">
            <span className="pp-icon pp-tone-violet"><Sparkles size={20} /></span>
            <h3>Smarter, not automated</h3>
            <p>Assistants help with notes, safety checks and summaries. Clinicians review and approve everything.</p>
          </div>
          <div className="pp-card">
            <span className="pp-icon pp-tone-amber"><Globe size={20} /></span>
            <h3>Transparent policies</h3>
            <p>Our terms and privacy policy are published in full — find them in the footer of every page.</p>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
