import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, storeSession } from '../../services/apiClient';
import { refreshSession } from '../Auth/authService';
import {
  getFlow, updateFlow, clearFlow, canCommit, canCommitCouple, toRegisterPayload,
} from '../../utils/medpsychFlow';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import '../../styles/zencare.css';
import './MedPsych.css';

/** Half-hour slots across a working day. */
const SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
];

/** The next seven days, as YYYY-MM-DD in local time. */
function nextDays(n = 7) {
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      ymd: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }),
    });
  }
  return out;
}

/**
 * Book and pay for the consultation — and, on success, commit the whole cached
 * sign-up in one call.
 *
 * This is the only place in the MedPsych flow that writes anything. Up to the
 * moment payment succeeds the person does not exist server-side; after it, the
 * account, consent records, psychiatrist assignment, session and receipt all
 * land together inside one transaction.
 */
export default function MedPsychBooking() {
  const navigate = useNavigate();
  const flow = getFlow();
  const days = useMemo(() => nextDays(7), []);

  const [day, setDay] = useState(flow.booking?.scheduledAt?.slice(0, 10) || days[0].ymd);
  const [time, setTime] = useState(flow.booking?.scheduledAt?.slice(11, 16) || '');
  const [reason, setReason] = useState(flow.booking?.reasonForVisit || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!flow.details?.email) { navigate('/medpsych', { replace: true }); return; }
    if (!flow.therapist?.id) navigate('/medpsych/psychiatrists', { replace: true });
  }, [flow.details, flow.therapist, navigate]);

  // ── Returning from Paystack ───────────────────────────────────────────────
  // The hosted checkout sends the user back here with the reference in the
  // query string (`reference`, and `trxref` for older integrations). Strip it
  // from the URL first so a refresh cannot re-run the commit, then finish the
  // booking. Runs once.
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) return;
    const params = new URLSearchParams(window.location.search);
    // Prefer the reference Paystack hands back; fall back to the one cached
    // before we navigated away. Without the fallback, a user who pays and then
    // returns by any route OTHER than Paystack's redirect — back button, a
    // bookmark, reopening the tab — arrives with a completed charge and no way
    // for this screen to know about it.
    const reference =
      params.get('reference') || params.get('trxref') || getFlow()?.payment?.reference;
    if (!reference) return;
    setReturning(true);
    window.history.replaceState({}, '', window.location.pathname);
    completeAfterPayment(reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning]);

  // Carried from the selection step, which read it through therapistFee.
  const rate = Number(flow.therapist?.rate ?? 0);

  const payAndBook = async () => {
    if (!time) { setError('Choose a time for your consultation.'); return; }
    setError('');
    setSubmitting(true);
    try {
      // ── Couple sign-ups: check the draft BEFORE charging anything ────────
      // The commit refuses unless partner B has accepted and both intakes are
      // in. Finding that out after Paystack has taken the money leaves the
      // client charged with no accounts and no booking, so the check happens
      // first and the payment never starts.
      const preToken = localStorage.getItem(COUPLE_STORAGE_KEYS.inviteToken);
      if (preToken) {
        const draft = await api(
          `/api/v1/couples/drafts?token=${encodeURIComponent(preToken)}`,
          { authenticated: false },
        ).catch(() => null);
        if (draft?.draftId && !draft.readyToPay) {
          setError(
            draft.partnerBAccepted
              ? 'Your partner still needs to finish their private intake. You have not been charged.'
              : 'Your partner has not accepted the invitation yet. You have not been charged.',
          );
          setSubmitting(false);
          return;
        }
      }

      const scheduledAt = `${day}T${time}:00`;

      // ── Start a real charge ──────────────────────────────────────────────
      // This used to mint a fake reference (`medpsych_<timestamp>`) and hand it
      // straight to the commit endpoint, so no money ever moved. Paystack is
      // initialised server-side (the secret key never reaches the browser) and
      // the user is sent to the hosted checkout.
      const init = await api('/api/v1/payments/initialize', {
        method: 'POST',
        authenticated: false,
        body: {
          email: flow.details.email,
          amount: rate,
          purpose: 'medpsych',
          // Paystack returns the user here with ?reference=... and the block
          // at the top of this component finishes the booking.
          callbackUrl: window.location.origin + window.location.pathname,
          metadata: { therapistId: flow.therapist?.id },
        },
      }).catch(() => null);

      if (!init?.authorizationUrl) {
        setError('We could not start the payment. Please try again.');
        setSubmitting(false);
        return;
      }

      // The booking details must survive the round trip to Paystack, so they
      // go into the cached flow BEFORE we navigate away.
      const committed = updateFlow({
        step: 'payment',
        booking: { scheduledAt, durationMinutes: 50, sessionType: 'video', reasonForVisit: reason.trim() },
        payment: { reference: init.reference, amount: rate, currency: init.currency || 'GHS' },
      });

      const couplePending = (committed.therapyType || '') === 'couples'
        && Boolean(localStorage.getItem(COUPLE_STORAGE_KEYS.inviteToken));
      if (!(couplePending ? canCommitCouple(committed) : canCommit(committed))) {
        setError('Something is missing from your sign-up. Please start again.');
        setSubmitting(false);
        return;
      }

      window.location.href = init.authorizationUrl;
      return;
    } catch (err) {
      setError(err?.message || 'We could not start the payment.');
      setSubmitting(false);
      return;
    }
  };

  /** Finish the booking after Paystack sends the user back. */
  const completeAfterPayment = async (reference) => {
    setSubmitting(true);
    try {
      // Confirm server-side rather than trusting the redirect: anyone can put
      // ?reference= in the address bar, but only a real charge verifies.
      const check = await api(`/api/v1/payments/verify/${encodeURIComponent(reference)}`, {
        authenticated: false,
      }).catch(() => null);

      if (!check?.paid) {
        setError('We could not confirm your payment. You have not been charged for an account.');
        setSubmitting(false);
        return;
      }

      const committed = getFlow();
      const draftToken = localStorage.getItem(COUPLE_STORAGE_KEYS.inviteToken);
      const isCouple = (committed.therapyType || '') === 'couples' && Boolean(draftToken);

      if (!(isCouple ? canCommitCouple(committed) : canCommit(committed))) {
        setError('Something is missing from your sign-up. Please start again.');
        setSubmitting(false);
        return;
      }

      // One transactional call: account + consent + assignment + session + receipt.
      // A couple sign-up commits against its draft instead, which creates BOTH
      // accounts together — neither exists until this succeeds.
      const res = isCouple
        ? await api('/api/v1/couples/drafts/commit', {
            method: 'POST',
            authenticated: false,
            body: {
              token: draftToken,
              paymentReference: reference,
              amountPaid: committed.payment?.amount,
              currency: committed.payment?.currency || 'GHS',
              therapistId: committed.therapist?.id,
              scheduledAt: committed.booking?.scheduledAt,
              durationMinutes: committed.booking?.durationMinutes,
              sessionType: committed.booking?.sessionType,
            },
          })
        : await api('/api/v1/medpsych/register', {
            method: 'POST',
            authenticated: false,
            body: toRegisterPayload(committed),
          });

      // Signed in and on the dashboard, exactly as a normal registration ends.
      // Role is normalised to the web's own vocabulary: the backend returns
      // CLIENT, and the dashboard router keys off lowercase 'client'.
      storeSession({
        token: res.token,
        refreshToken: res.refreshToken,
        userId: res.userId,
        role: 'client',
        profile: {
          id: res.userId,
          uid: res.userId,
          email: res.email,
          name: committed.details.fullName,
          fullName: committed.details.fullName,
          role: 'client',
          userIntent: 'therapy',
          ...(isCouple
            ? { therapyType: 'couples', coupleId: res.coupleId, couplePartnerRole: 'partnerA' }
            // Second Opinion is its own tier with its own dashboard. This was
            // hardcoded to 'medpsych', so someone who paid for a second opinion
            // was handed a session claiming full membership — the backend had
            // already stored the right tier.
            : { membershipTier: (committed.serviceType || 'medpsych') === 'second_opinion'
                ? 'second_opinion'
                : 'medpsych' }),
        },
      });

      // storeSession only writes sessionStorage. App.js derives `session` from
      // the auth observer, and this is the one place outside authService that
      // creates a session — so without this the observer never fires,
      // session.role stays null and PrivateRoute sends a user who has just PAID
      // to the login page.
      refreshSession();

      clearFlow(); // the password must not outlive the flow

      if (isCouple) {
        // The draft is spent; leaving the token behind would make the next
        // booking think it is still mid sign-up.
        localStorage.removeItem(COUPLE_STORAGE_KEYS.inviteToken);
        if (res.coupleId) localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, res.coupleId);
        navigate('/couple/dashboard', { state: { coupleId: res.coupleId }, replace: true });
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err?.message || 'We could not complete your booking. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="zc zc-shell zc-hero-ground mp-book">
      <div className="zc-container">
        <span className="zc-badge">Step 3 of 3</span>
        <h1 className="zc-display" style={{ fontSize: 'clamp(1.9rem,3.6vw,3rem)', margin: '1rem 0 2rem' }}>
          Book your <em>consultation</em>.
        </h1>

        <div className="mp-book-grid">
          <div className="zc-card">
            <p className="zc-eyebrow">Pick a day</p>
            <div className="mp-slot-grid" style={{ marginBottom: '1.5rem' }}>
              {days.map((d) => (
                <button
                  key={d.ymd}
                  type="button"
                  className={`mp-slot${day === d.ymd ? ' mp-slot--on' : ''}`}
                  onClick={() => setDay(d.ymd)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <p className="zc-eyebrow">Pick a time</p>
            <div className="mp-slot-grid">
              {SLOTS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`mp-slot${time === t ? ' mp-slot--on' : ''}`}
                  onClick={() => setTime(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <hr className="zc-rule" />

            <label className="zc-label" htmlFor="mp-reason">What would you like reviewed?</label>
            <textarea
              id="mp-reason"
              className="zc-input"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. I have been prescribed sertraline 50mg and would like a second view on the dose."
            />
            <p className="zc-meta" style={{ marginTop: '0.5rem' }}>
              Shared only with the psychiatrist you selected.
            </p>
          </div>

          <div className="zc-card">
            <p className="zc-eyebrow">Summary</p>
            <div className="mp-summary-row">
              <span>Psychiatrist</span><strong>{flow.therapist?.name || '—'}</strong>
            </div>
            <div className="mp-summary-row">
              <span>Focus</span><strong>{flow.therapist?.specialization || 'Psychiatry'}</strong>
            </div>
            <div className="mp-summary-row">
              <span>When</span>
              <strong>{days.find((d) => d.ymd === day)?.label}{time ? `, ${time}` : ''}</strong>
            </div>
            <div className="mp-summary-row">
              <span>Length</span><strong>50 minutes</strong>
            </div>
            <div className="mp-summary-total">
              <span>Total</span><span>GHS {rate.toFixed(2)}</span>
            </div>

            {error ? <p className="mp-error">{error}</p> : null}

            <button
              type="button"
              className="zc-btn zc-btn--primary zc-btn--block"
              style={{ marginTop: '1.25rem' }}
              onClick={payAndBook}
              disabled={submitting || !time}
            >
              {submitting ? 'Completing…' : `Pay GHS ${rate.toFixed(0)} and book`}
            </button>

            <p className="zc-meta mp-nodb-note">
              Your account is created at this point, once payment succeeds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
