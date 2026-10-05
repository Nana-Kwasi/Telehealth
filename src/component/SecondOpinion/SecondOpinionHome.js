import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, Video, ArrowRight, Sparkles } from 'lucide-react';
import { api } from '../../services/apiClient';
import { describeReviewAreas } from '../../utils/secondOpinionIntake';
import '../../styles/zencare.css';
import '../MedPsych/MedPsych.css';

/**
 * Second Opinion — the case dashboard.
 *
 * One case, one consultation, one opinion. The whole screen answers "where is
 * my review up to?", which is the only question this client has. There is no
 * mood tracking, no goals and no homework: those belong to a programme they
 * have not bought, and showing them would misrepresent what they paid for.
 *
 * The one piece of forward-selling is the membership card at the bottom, which
 * is honest about being an upgrade rather than dressed up as part of the case.
 */

/** The case lifecycle, in order. Matches how the specialist actually works. */
const STAGES = [
  { key: 'submitted', label: 'Case submitted',   icon: FileText },
  { key: 'assigned',  label: 'Specialist assigned', icon: CheckCircle },
  { key: 'review',    label: 'Under review',      icon: Clock },
  { key: 'delivered', label: 'Opinion delivered', icon: CheckCircle },
];

export default function SecondOpinionHome({ profile }) {
  const navigate = useNavigate();
  const [intake, setIntake] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clientId = profile?.id || profile?.uid;
    if (!clientId) { setLoading(false); return; }
    (async () => {
      const [prof, calls] = await Promise.all([
        api(`/api/v1/clients/${clientId}`).catch(() => null),
        api(`/api/v1/scheduled-calls?clientId=${clientId}`).catch(() => []),
      ]);
      try {
        setIntake(prof?.preferencesJson ? JSON.parse(prof.preferencesJson) : null);
      } catch { setIntake(null); }

      // The soonest consultation that has not happened yet.
      const upcoming = (Array.isArray(calls) ? calls : [])
        .map((c) => ({ ...c, when: new Date(c.scheduledTime || c.scheduledAt || NaN) }))
        .filter((c) => !Number.isNaN(c.when.getTime()) && c.when.getTime() > Date.now() - 60 * 60 * 1000)
        .sort((a, b) => a.when - b.when)[0] || null;
      setSession(upcoming);
      setLoading(false);
    })();
  }, [profile]);

  // Stage is derived from what actually exists rather than stored separately,
  // so it cannot fall out of step with reality.
  const stageIndex = session ? (session.status === 'completed' ? 3 : 2) : 1;

  if (loading) return <div className="zc-container"><p className="zc-meta">Loading your case…</p></div>;

  return (
    <div className="zc zc-container">
      <h1 className="zc-display">Your case</h1>
      <p className="zc-body">An independent review of the care you are already receiving.</p>

      {/* ── Where the review has got to ── */}
      <div className="zc-card">
        <h2 className="zc-eyebrow">Progress</h2>
        <ol className="so-stages">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const done = i <= stageIndex;
            return (
              <li key={stage.key} className={`so-stage${done ? ' so-stage--done' : ''}`}>
                <Icon size={16} aria-hidden="true" />
                <span>{stage.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── The consultation ── */}
      <div className="zc-card">
        <h2 className="zc-eyebrow">Your consultation</h2>
        {session ? (
          <>
            <p className="zc-body">
              {session.when.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              })} at {session.when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
            <button
              type="button"
              className="zc-btn zc-btn--primary"
              onClick={() => navigate('/dashboard/video')}
            >
              <Video size={16} /> Go to consultation
            </button>
          </>
        ) : (
          <p className="zc-meta">No consultation scheduled yet.</p>
        )}
      </div>

      {/* ── What they asked to have reviewed ── */}
      <div className="zc-card">
        <h2 className="zc-eyebrow">What you asked us to review</h2>
        <p className="zc-body">{describeReviewAreas(intake?.reviewAreas)}</p>
        {intake?.reason ? (
          <>
            <p className="zc-label">Your reason</p>
            <p className="zc-body">{intake.reason}</p>
          </>
        ) : null}
        {intake?.currentDiagnosis ? (
          <>
            <p className="zc-label">Current diagnosis</p>
            <p className="zc-body">{intake.currentDiagnosis}</p>
          </>
        ) : null}
        {intake?.currentTreatment ? (
          <>
            <p className="zc-label">Current treatment</p>
            <p className="zc-body">{intake.currentTreatment}</p>
          </>
        ) : null}
      </div>

      {/* ── The upgrade. Last, and clearly an offer rather than a task. ── */}
      <div className="zc-card">
        <h2 className="zc-eyebrow"><Sparkles size={14} /> Continue your care here</h2>
        <p className="zc-body">
          A second opinion is a one-off review. If you would like ongoing therapy
          with us, becoming a member sets up a full programme — with goals,
          session notes and progress you can follow.
        </p>
        <button
          type="button"
          className="zc-btn zc-btn--primary"
          onClick={() => navigate('/dashboard/become-member')}
        >
          Become a member <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
