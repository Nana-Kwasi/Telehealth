import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { COUPLE_STATUSES, COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import {
  fetchCoupleDashboard,
  sendPartnerBInvitation,
  navigateAfterCoupleIntake,
  buildLocalWaitingFallback,
  ensureCouplePartnerLinked,
  isCoupleIntakeDoneLocally,
} from '../../services/coupleTherapyService';
import { api } from '../../services/apiClient';
import { updateFlow } from '../../utils/medpsychFlow';
import './CoupleTherapyIntake.css';

export default function CoupleWaitingPartner() {
  const navigate = useNavigate();
  const location = useLocation();
  const coupleId = location.state?.coupleId || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
  // DRAFT MODE: the sign-up has not been paid for, so there is no couple record
  // to poll — only the draft, keyed by the invite token.
  const draftToken =
    location.state?.draftToken ||
    (!coupleId ? localStorage.getItem(COUPLE_STORAGE_KEYS.inviteToken) : null);
  const isDraft = Boolean(draftToken) && !coupleId;
  const [draft, setDraft] = useState(null);
  const [dash, setDash] = useState(() => buildLocalWaitingFallback(coupleId));
  const [inviteUrl, setInviteUrl] = useState(location.state?.inviteUrl || '');
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [syncWarning, setSyncWarning] = useState('');

  const refresh = useCallback(async () => {
    if (isDraft) {
      setLoading(true);
      setSyncWarning('');
      try {
        const d = await api(`/api/v1/couples/drafts?token=${encodeURIComponent(draftToken)}`, {
          authenticated: false,
        });
        setDraft(d);
      } catch (e) {
        setSyncWarning(e.message || "Could not check your partner's progress.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!coupleId) {
      // Bailing out while `loading` was still true left the screen stuck on
      // "Loading…" forever, with no error and no way back, whenever the couple id
      // was missing from local storage. Recover by asking the server which couple
      // this account belongs to (claim works without a hint) before giving up.
      setLoading(true);
      try {
        const claimed = await ensureCouplePartnerLinked(undefined, 'partnerA');
        if (claimed && claimed.ok && claimed.coupleId) {
          localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, claimed.coupleId);
          navigate('/couple/waiting', { state: { coupleId: claimed.coupleId }, replace: true });
          return;
        }
        setSyncWarning('We could not find your couple registration on this device. Sign in again with the email you used to start couple therapy.');
      } catch (e) {
        setSyncWarning(e?.message || 'Could not load your couple registration.');
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setSyncWarning('');
    try {
      const link = await ensureCouplePartnerLinked(coupleId, 'partnerA');
      if (link && !link.ok) {
        const fallback = buildLocalWaitingFallback(coupleId);
        if (fallback) {
          setDash(fallback);
          setSyncWarning(link.message || 'Showing saved progress while we finish linking your account.');
        }
        return;
      }
      const data = await fetchCoupleDashboard(coupleId);
      setDash(data);
      if (data.inviteUrl) setInviteUrl(data.inviteUrl);
      if (data.otherPartnerName) {
        localStorage.setItem(COUPLE_STORAGE_KEYS.otherPartnerName, data.otherPartnerName);
      }
      if (data._localFallback) {
        setSyncWarning('Showing saved progress — live sync will resume once your account is linked.');
      }

      const aDone = data.couple?.partnerA?.intakeComplete;
      const bDone = data.couple?.partnerB?.intakeComplete;
      if (aDone && bDone && !data._localFallback) {
        await navigateAfterCoupleIntake(navigate, coupleId, 'partnerA');
      }
    } catch (e) {
      console.error(e);
      const fallback = buildLocalWaitingFallback(coupleId);
      if (fallback) {
        setDash(fallback);
        const registered = localStorage.getItem(COUPLE_STORAGE_KEYS.myRegistrationEmail);
        setSyncWarning(
          isCoupleIntakeDoneLocally()
            ? `Live sync pending${registered ? ` — couple registration used ${registered}` : ''}. Your intake is complete; use Retry sync or share the invite below.`
            : e.message || 'Could not sync with the server.',
        );
      } else {
        setSyncWarning(e.message || 'Could not load couple status.');
      }
    } finally {
      setLoading(false);
    }
  }, [coupleId, navigate, isDraft, draftToken]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const onResend = async () => {
    setResending(true);
    setMessage('');
    try {
      const res = await sendPartnerBInvitation(coupleId);
      if (res?.inviteUrl) setInviteUrl(res.inviteUrl);
      setMessage('Invitation sent again.');
    } catch (e) {
      setMessage('Could not send email — share the link below with your partner.');
    } finally {
      setResending(false);
    }
  };

  const onShare = async () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      await navigator.share({ title: 'NessaHub couple therapy', text: `Join me for couple therapy: ${inviteUrl}` });
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      setMessage('Link copied to clipboard.');
    }
  };

  const partnerName =
    (isDraft ? draft?.partnerBName : null) ||
    dash?.otherPartnerName ||
    dash?.couple?.partnerB?.name ||
    localStorage.getItem(COUPLE_STORAGE_KEYS.otherPartnerName) ||
    'your partner';

  if (loading && !dash && !draft) {
    return <div className="teen-intake-page couple-centered">Loading…</div>;
  }

  const bDone = isDraft
    ? Boolean(draft?.partnerBIntakeComplete)
    : dash?.couple?.partnerB?.intakeComplete;
  const bAccepted = isDraft ? Boolean(draft?.partnerBAccepted) : true;
  const readyToPay = isDraft ? Boolean(draft?.readyToPay) : false;

  return (
    <div className="teen-intake-page">
      {syncWarning ? (
        <div className="couple-banner-warn" style={{ marginBottom: '1rem' }}>
          <p style={{ margin: 0 }}>{syncWarning}</p>
          <button type="button" className="couple-btn-ghost" style={{ marginTop: '0.75rem' }} onClick={refresh}>
            Retry sync
          </button>
        </div>
      ) : null}

      <div className="couple-banner-ok">
        <h2>Waiting for {partnerName}</h2>
        <p>
          Your intake is complete.{' '}
          {bDone
            ? `${partnerName} has finished too.`
            : isDraft && !bAccepted
              ? `${partnerName} still needs to accept the invitation and complete their private intake.`
              : `${partnerName} still needs to complete their private intake.`}
        </p>
      </div>

      <div className="couple-card">
        <h3>Status</h3>
        <p>You: ✓ Intake complete</p>
        <p>
          {partnerName}:{' '}
          {isDraft
            ? bAccepted
              ? bDone
                ? '✓ Complete'
                : '⏳ Intake in progress'
              : '⏳ Has not accepted yet'
            : bDone
              ? '✓ Complete'
              : '⏳ Pending'}
        </p>
        <p className="couple-muted">
          {isDraft
            ? 'No accounts are created until you book and pay for your first session.'
            : `Couple status: ${dash?.couple?.status || COUPLE_STATUSES.AWAITING_PARTNER_B}`}
        </p>
      </div>

      {inviteUrl ? (
        <div className="couple-card">
          <h3>Partner invitation</h3>
          <p className="couple-invite-link">{inviteUrl}</p>
          <div className="couple-intake-footer">
            <button type="button" className="couple-btn-ghost" onClick={onShare}>
              Share link
            </button>
            <button type="button" className="couple-btn-ghost" onClick={onResend} disabled={resending}>
              {resending ? 'Sending…' : 'Resend email'}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="teen-intake-hint">{message}</p> : null}

      {isDraft ? (
        // Choosing a therapist leads straight to checkout, and the commit is
        // refused unless BOTH partners are done — so the button stays shut
        // until the server says it will go through. Otherwise the card gets
        // charged for a booking that cannot be created.
        <button
          type="button"
          className="teen-intake-submit"
          disabled={!readyToPay}
          onClick={() => {
            // Same handoff as the end of the intake: the booking funnel reads
            // the medpsych flow, and the password stays on the draft.
            updateFlow({
              serviceType: 'medpsych',
              therapyType: 'couples',
              step: 'therapist',
              details: {
                fullName: localStorage.getItem(COUPLE_STORAGE_KEYS.myPartnerName) || '',
                email: localStorage.getItem(COUPLE_STORAGE_KEYS.myRegistrationEmail) || '',
              },
            });
            navigate('/medpsych/psychiatrists');
          }}
        >
          {readyToPay ? 'Choose your therapist' : `Waiting for ${partnerName}`}
        </button>
      ) : (
        <button
          type="button"
          className="teen-intake-submit"
          onClick={() => navigate('/couple/dashboard', { state: { coupleId } })}
        >
          Open couple dashboard
        </button>
      )}
    </div>
  );
}
