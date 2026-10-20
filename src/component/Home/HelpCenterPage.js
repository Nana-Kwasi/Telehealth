import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Rocket, UserCircle, CalendarClock, CreditCard, Pill, ShieldCheck, ChevronDown, ArrowRight, Mail,
  AlertTriangle, HelpCircle, Video,
} from 'lucide-react';
import PublicPageShell from './PublicPageShell';
import { NESSA_HUB_POLICY_LINKS } from '../../constants/nessaHubPolicies';
import useCareStart from './useCareStart';

const QUESTIONS = [
  { topic: 'start', q: 'How do I get started?', a: 'Choose therapy, medical care, psychiatry or a second opinion from the home page. For therapy and psychiatry you first pick who it is for (individual, teen or couples), then answer a short intake and create your account.' },
  { topic: 'start', q: 'Can I book for my teenager?', a: 'Yes. Choose Teen. A parent or guardian gives consent first, then the teen is matched with a therapist or psychiatrist experienced with young people.' },
  { topic: 'account', q: 'I forgot my password', a: 'On the Log in page choose "Forgot password". We email you a link to set a new one. If an admin gave you a temporary password, you will be asked to choose your own at first sign-in.' },
  { topic: 'account', q: 'Why am I asked for a code when I sign in?', a: 'Two-step sign-in is on for your account. We email a 6-digit code each time you sign in, so only you can get in even if someone learns your password.' },
  { topic: 'appointments', q: 'How do I join a video consultation?', a: 'Open the appointment from your dashboard a few minutes before it starts and press Join. Allow your camera and microphone when the browser or app asks.' },
  { topic: 'appointments', q: 'Can I reschedule or cancel?', a: 'Yes, from the appointment in your dashboard, as long as it is not too close to the start time. Your clinician is told straight away.' },
  { topic: 'payments', q: 'How do I pay?', a: 'Payments are made securely through Paystack with mobile money or card. You get a receipt by email and can find it under Billing.' },
  { topic: 'payments', q: 'Can I use my health insurance?', a: 'If your insurer works with NessaHub, add your card under Insurance. Cover is checked before medicines or tests are handed over, and you are asked to confirm any claim.' },
  { topic: 'prescriptions', q: 'How do I collect my medicine?', a: 'Your doctor sends the prescription to a pharmacy branch. Show the pickup code from your Prescriptions screen at the counter; the pharmacist verifies it before handing over.' },
  { topic: 'prescriptions', q: 'Where are my lab results?', a: 'Results go to the doctor who ordered the test first. Once they have reviewed them, they share the result with you along with a note.' },
  { topic: 'privacy', q: 'Who can see my information?', a: 'Only the clinicians caring for you, and only what they need. Therapy notes stay between you and your therapist. Every access is recorded.' },
  { topic: 'privacy', q: 'Can I delete my account?', a: 'Yes. Ask from Settings or contact support. Some medical records must be kept for a period by law; we explain what is kept and why.' },
];

const TOPICS = [
  { key: 'start', Icon: Rocket, tone: 'teal', title: 'Getting started', body: 'Choosing care, intake and creating your account.' },
  { key: 'account', Icon: UserCircle, tone: 'blue', title: 'Account & sign-in', body: 'Passwords, two-step sign-in and profile details.' },
  { key: 'appointments', Icon: CalendarClock, tone: 'violet', title: 'Appointments & video', body: 'Booking, joining, rescheduling and cancelling.' },
  { key: 'payments', Icon: CreditCard, tone: 'amber', title: 'Payments & insurance', body: 'Paying, receipts and using your insurance.' },
  { key: 'prescriptions', Icon: Pill, tone: 'rose', title: 'Prescriptions & results', body: 'Pharmacy pickup, lab tests and scan reports.' },
  { key: 'privacy', Icon: ShieldCheck, tone: 'slate', title: 'Privacy & safety', body: 'Who sees your data and how it is protected.' },
];

export default function HelpCenterPage() {
  const navigate = useNavigate();
  const care = useCareStart();
  const [needle, setNeedle] = useState('');
  const [topic, setTopic] = useState(null);

  const shown = useMemo(() => {
    const s = needle.trim().toLowerCase();
    return QUESTIONS.filter((x) => (!topic || x.topic === topic) && (!s || x.q.toLowerCase().includes(s) || x.a.toLowerCase().includes(s)));
  }, [needle, topic]);

  return (
    <PublicPageShell eyebrow="Support" title="Help centre" lead="Answers to common questions, and the quickest way to reach a person when you need one.">
      <section className="pp-section">
        <div className="pp-search">
          <Search size={18} />
          <input placeholder="Search help — e.g. password, prescription, payment" value={needle} onChange={(e) => setNeedle(e.target.value)} aria-label="Search help" />
        </div>
      </section>

      <section className="pp-section">
        <div className="pp-alert" role="note">
          <AlertTriangle size={20} />
          <div>
            <strong>In danger right now?</strong>
            <p>NessaHub is not an emergency service. If you or someone else is at immediate risk, call local emergency services or see <a href="/crisis-support">crisis support</a>.</p>
          </div>
        </div>
      </section>

      <section className="pp-section">
        <div className="pp-section-head">
          <p className="pp-kicker">Browse by topic</p>
          <h2 className="pp-h2">What do you need help with?</h2>
        </div>
        <div className="pp-grid">
          {TOPICS.map(({ key, Icon, tone, title, body }) => (
            <button key={key} type="button" className="pp-card is-action" onClick={() => setTopic(topic === key ? null : key)}
              style={topic === key ? { borderColor: '#1d4ed8', boxShadow: '0 0 0 3px rgba(29,78,216,0.12)' } : undefined} aria-pressed={topic === key}>
              <span className={`pp-icon pp-tone-${tone}`}><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
              <span className="pp-cta">{topic === key ? 'Showing below' : 'See answers'} <ArrowRight size={15} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="pp-section">
        <div className="pp-section-head">
          <p className="pp-kicker">Common questions</p>
          <h2 className="pp-h2">{topic ? TOPICS.find((t) => t.key === topic)?.title : needle ? 'Search results' : 'Popular answers'}</h2>
          {topic ? <p className="pp-sub"><button type="button" onClick={() => setTopic(null)} style={{ background: 'none', border: 0, padding: 0, color: '#1d4ed8', fontWeight: 800, cursor: 'pointer' }}>Show all topics</button></p> : null}
        </div>
        {shown.length === 0 ? (
          <div className="pp-card"><p>No answers match that search. Try other words, or <a href="/contact">send us a message</a>.</p></div>
        ) : shown.map((x) => (
          <details key={x.q} className="pp-acc">
            <summary>{x.q}<ChevronDown size={18} /></summary>
            <div className="pp-acc-body">{x.a}</div>
          </details>
        ))}
      </section>

      <section className="pp-section">
        <div className="pp-section-head">
          <p className="pp-kicker">Still need help?</p>
          <h2 className="pp-h2">Talk to us or start care</h2>
        </div>
        <div className="pp-grid four">
          <button type="button" className="pp-card is-action" onClick={() => navigate('/contact')}>
            <span className="pp-icon pp-tone-blue"><Mail size={20} /></span><h3>Contact support</h3>
            <p>Send us a message — we reply within 1–2 business days.</p><span className="pp-cta">Send a message <ArrowRight size={15} /></span>
          </button>
          <button type="button" className="pp-card is-action" onClick={() => navigate('/faqs')}>
            <span className="pp-icon pp-tone-slate"><HelpCircle size={20} /></span><h3>All FAQs</h3>
            <p>The full list of questions and answers.</p><span className="pp-cta">Read FAQs <ArrowRight size={15} /></span>
          </button>
          <button type="button" className="pp-card is-action" onClick={care.openTherapy}>
            <span className="pp-icon pp-tone-teal"><Video size={20} /></span><h3>Start therapy</h3>
            <p>Individual, couples or teen therapy.</p><span className="pp-cta">Get started <ArrowRight size={15} /></span>
          </button>
          <a className="pp-card is-action" href={NESSA_HUB_POLICY_LINKS.privacy} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <span className="pp-icon pp-tone-amber"><ShieldCheck size={20} /></span><h3>Privacy policy</h3>
            <p>How we collect, use and protect your data.</p><span className="pp-cta">Open policy <ArrowRight size={15} /></span>
          </a>
        </div>
      </section>

      {care.modals}
    </PublicPageShell>
  );
}
