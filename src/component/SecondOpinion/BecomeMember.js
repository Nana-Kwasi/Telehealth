import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../../services/apiClient';
import { payForBooking } from '../../services/paystack';
import '../../styles/zencare.css';
import '../MedPsych/MedPsych.css';

/**
 * Converting a limited account (Second Opinion or Psychology & Counseling)
 * into full membership.
 *
 * Three decisions, in the order they actually matter:
 *
 *   1. WHICH SERVICE — psychiatry (a prescriber) or counselling. These are
 *      different clinicians doing different work, so it is asked outright
 *      rather than inferred from whoever reviewed the original case.
 *   2. WHO — keep the specialist who handled the consultation, or pick someone
 *      else. Most people want to continue with the person who already knows
 *      their case; assuming either way would be wrong.
 *   3. PAY — the account only converts once the payment is confirmed, the same
 *      rule the rest of the platform follows.
 *
 * The membership questionnaire is asked AFTER this, since it differs by track.
 */

const TRACKS = [
  {
    key: 'counselling',
    title: 'Psychology & Counseling',
    body: 'Talking therapy with a psychologist or counsellor. No medication.',
  },
  {
    key: 'psychiatry',
    title: 'Psychiatry',
    body: 'Care with a psychiatrist, who can review and prescribe medication.',
  },
];

export default function BecomeMember({ profile }) {
  const navigate = useNavigate();
  const [track, setTrack] = useState('');
  const [keepTherapist, setKeepTherapist] = useState(true);
  const [currentTherapist, setCurrentTherapist] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const clientId = profile?.id || profile?.uid;

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      // Who handled the consultation — offered as "keep this person".
      const assignments = await api(
        `/api/v1/therapy-management/assignments?clientId=${clientId}`,
      ).catch(() => []);
      const first = Array.isArray(assignments) ? assignments[0] : null;
      if (first) setCurrentTherapist(first);
    })();
  }, [clientId]);

  const submit = async () => {
    setError('');
    if (!track) { setError('Choose which kind of care you would like.'); return; }
    setBusy(true);
    try {
      const paid = await payForBooking({
        email: profile?.email,
        amount: Number(profile?.membershipFee ?? 0),
        purpose: 'membership',
        metadata: { clientId, careTrack: track },
      });

      if (!paid.ok) { setError(paid.reason || 'Payment was not completed.'); setBusy(false); return; }

      await api(`/api/v1/medpsych/${clientId}/upgrade`, {
        method: 'POST',
        body: {
          paymentReference: paid.reference,
          amountPaid: paid.amount,
          currency: paid.currency,
          careTrack: track,
          // null means "keep whoever handled my case" — the server treats it
          // that way rather than clearing the assignment.
          therapistId: keepTherapist ? null : undefined,
        },
      });

      // The questionnaire comes after conversion: it is what builds the
      // programme, and it differs by track.
      navigate('/questionnaire');
    } catch (e) {
      setError(e?.message || 'We could not complete the upgrade.');
      setBusy(false);
    }
  };

  return (
    <div className="zc zc-container">
      <h1 className="zc-display">Continue your care with us</h1>
      <p className="zc-body">
        Membership turns a one-off review into ongoing therapy — with a
        programme, session notes and progress you can follow.
      </p>

      <div className="zc-card">
        <h2 className="zc-eyebrow">Which kind of care?</h2>
        <div className="mp-slot-grid mp-slot-grid--labels">
          {TRACKS.map((t) => (
            <button
              type="button"
              key={t.key}
              className={`mp-slot${track === t.key ? ' mp-slot--on' : ''}`}
              onClick={() => setTrack(t.key)}
              aria-pressed={track === t.key}
            >
              {track === t.key ? <Check size={14} /> : null} {t.title}
            </button>
          ))}
        </div>
        <p className="zc-meta">{TRACKS.find((t) => t.key === track)?.body || 'These are different services — choose the one you want.'}</p>
      </div>

      <div className="zc-card">
        <h2 className="zc-eyebrow">Who would you like to see?</h2>
        <div className="mp-slot-grid mp-slot-grid--labels">
          <button
            type="button"
            className={`mp-slot${keepTherapist ? ' mp-slot--on' : ''}`}
            onClick={() => setKeepTherapist(true)}
            aria-pressed={keepTherapist}
          >
            Stay with {currentTherapist?.therapistName || 'my specialist'}
          </button>
          <button
            type="button"
            className={`mp-slot${!keepTherapist ? ' mp-slot--on' : ''}`}
            onClick={() => setKeepTherapist(false)}
            aria-pressed={!keepTherapist}
          >
            Choose someone new
          </button>
        </div>
      </div>

      {error ? <p className="mp-error">{error}</p> : null}

      <button
        type="button"
        className="zc-btn zc-btn--primary zc-btn--block"
        onClick={submit}
        disabled={busy}
      >
        {busy ? 'Completing…' : <>Continue <ArrowRight size={16} /></>}
      </button>
    </div>
  );
}
