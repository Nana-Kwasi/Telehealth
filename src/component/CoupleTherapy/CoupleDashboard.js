import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import {
  fetchCoupleDashboard,
  canBrowseTherapists,
  isPaymentAllowed,
  isTherapistSelectionUnlocked,
  isMyCoupleIntakeComplete,
  ensureCouplePartnerLinked,
  buildLocalWaitingFallback,
  isCoupleIntakeDoneLocally,
  mapCoupleCallableError,
  syncCoupleSessionFromProfile,
} from '../../services/coupleTherapyService';
import { resolveRole } from '../Auth/authService';
import { auth } from '../../services/firestoreShim';
import LocationSummaryCard from '../Common/LocationSummaryCard';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../utils/locationProfile';
import './CoupleTherapyIntake.css';

function Row({ label, value }) {
  return (
    <div className="couple-row">
      <span>{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}

export default function CoupleDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const coupleIdParam = location.state?.coupleId;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationProfile, setLocationProfile] = useState(null);

  const coupleId = coupleIdParam || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
  const partnerRole =
    localStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole) || data?.myRole || 'partnerA';

  const refresh = useCallback(async () => {
    if (!coupleId) {
      // Local storage is not the source of truth — a signed-in partner whose
      // couple id is missing (cleared storage, different device) was told "No
      // couple registration found" even though the server has one. Ask the
      // server first; only fall back to the error if it really has none.
      setLoading(true);
      try {
        const claimed = await ensureCouplePartnerLinked(undefined, 'partnerA');
        if (claimed && claimed.ok && claimed.coupleId) {
          localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, claimed.coupleId);
          navigate(`/couple/dashboard`, { state: { coupleId: claimed.coupleId }, replace: true });
          return;
        }
      } catch { /* fall through to the message below */ }
      setLoading(false);
      setError('No couple registration found. Start from the home page under Couples therapy.');
      setData(null);
      return;
    }

    setLoading(true);
    setError('');
    const intakeDoneLocal = isCoupleIntakeDoneLocally();
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const { profile: roleProfile } = await resolveRole(uid);
        syncCoupleSessionFromProfile(roleProfile);
        const authLoc = await fetchAuthLocationProfile(uid);
        setLocationProfile(mergeLocationProfile(roleProfile, authLoc));
      }
      const role = partnerRole === 'partnerB' ? 'partnerB' : 'partnerA';
      await ensureCouplePartnerLinked(coupleId, role);
      const dash = await fetchCoupleDashboard(coupleId);
      setData(dash);
      const mineDone = isMyCoupleIntakeComplete(dash) || intakeDoneLocal;
      localStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, mineDone ? 'true' : 'false');
    } catch (e) {
      console.error(e);
      const fallback = buildLocalWaitingFallback(coupleId);
      if (fallback) {
        setData(fallback);
        setError('');
      } else {
        setData(null);
        setError(mapCoupleCallableError(e));
      }
    } finally {
      setLoading(false);
    }
  }, [coupleId, partnerRole]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const intakeDoneLocal = isCoupleIntakeDoneLocally();

  const continueIntake = () => {
    if (intakeDoneLocal || (data && isMyCoupleIntakeComplete(data))) {
      navigate('/couple/waiting', { state: { coupleId } });
      return;
    }
    navigate('/couple/intake', {
      state: { coupleId, partnerRole: data?.myRole || partnerRole },
    });
  };

  if (loading && !data && !error) {
    return <div className="teen-intake-page couple-centered">Loading couple dashboard…</div>;
  }

  const couple = data?.couple;
  const myIntakeDone = intakeDoneLocal || (data ? isMyCoupleIntakeComplete(data) : false);
  const other = data?.otherPartnerName || 'your partner';
  const unlocked = isTherapistSelectionUnlocked(couple);
  const payAllowed = isPaymentAllowed(couple);
  const browse = canBrowseTherapists(couple);
  const proposal = couple?.therapistProposal;

  return (
    <div className="teen-intake-page">
      <header className="teen-intake-header">
        <h1>Couple therapy</h1>
        <p>Shared status — your private answers are never shown here.</p>
      </header>

      <LocationSummaryCard
        profile={locationProfile}
        onEdit={() => navigate('/dashboard/settings')}
      />

      {error ? (
        <div className="teen-intake-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}

      <button type="button" className="couple-btn-ghost couple-refresh" onClick={refresh} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>

      {!myIntakeDone && coupleId ? (
        <div className="couple-banner-warn">
          <h3>Finish your private intake first</h3>
          <p>
            The couple dashboard shows shared progress after you complete all intake sections and consent.
            Your answers stay private from your partner.
          </p>
          <button type="button" className="teen-intake-submit" onClick={continueIntake}>
            Continue private intake
          </button>
        </div>
      ) : null}

      {error && myIntakeDone && coupleId ? (
        <div className="couple-banner-ok">
          <h3>Your intake is complete</h3>
          <p>We could not refresh shared status. Return to waiting or retry.</p>
          <div className="couple-intake-footer">
            <button
              type="button"
              className="teen-intake-submit"
              onClick={() => navigate('/couple/waiting', { state: { coupleId } })}
            >
              Back to waiting
            </button>
            <button type="button" className="couple-btn-ghost" onClick={refresh}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {data?.waitingForPartner ? (
        <div className="couple-banner-warn">
          <h3>Waiting for {other}</h3>
          <p>They need to complete their private intake and consent.</p>
          <button
            type="button"
            className="couple-btn-ghost"
            onClick={() => navigate('/couple/waiting', { state: { coupleId: couple.id } })}
          >
            View invitation status
          </button>
        </div>
      ) : null}

      {couple ? (
        <div className="couple-card">
          <h3>Couple profile</h3>
          <Row label="Relationship" value={couple.relationshipType} />
          <Row label="Status" value={couple.status} />
          <Row
            label="Your intake"
            value={
              data.myRole === 'partnerA'
                ? couple.partnerA?.intakeComplete
                  ? 'Complete'
                  : 'Incomplete'
                : couple.partnerB?.intakeComplete
                  ? 'Complete'
                  : 'Incomplete'
            }
          />
          <Row
            label="Your consent"
            value={
              data.myRole === 'partnerA'
                ? couple.partnerA?.consentComplete
                  ? 'Signed'
                  : 'Pending'
                : couple.partnerB?.consentComplete
                  ? 'Signed'
                  : 'Pending'
            }
          />
          <Row
            label={`${other} intake`}
            value={
              couple.partnerA?.intakeComplete && couple.partnerB?.intakeComplete ? 'Complete' : 'Pending'
            }
          />
          {couple.therapistName ? <Row label="Therapist" value={couple.therapistName} /> : null}
        </div>
      ) : null}

      {myIntakeDone && !unlocked ? (
        <p className="couple-muted">Therapist browsing unlocks after both partners finish intake and consent.</p>
      ) : null}

      {myIntakeDone ? (
        <div className="couple-dashboard-actions">
          {payAllowed ? (
            <button
              type="button"
              className="teen-intake-submit"
              onClick={() => navigate('/payment', { state: { coupleId: couple.id, therapyType: 'couples' } })}
            >
              Complete couple payment
            </button>
          ) : null}

          {browse && !proposal?.therapistId ? (
            <button
              type="button"
              className="teen-intake-submit"
              onClick={() => navigate('/match-therapist', { state: { coupleId: couple.id, therapyType: 'couples' } })}
            >
              Browse therapists
            </button>
          ) : null}

          {couple?.therapistId ? (
            <button type="button" className="couple-btn-ghost" onClick={() => navigate('/dashboard')}>
              Go to therapy dashboard
            </button>
          ) : null}
        </div>
      ) : null}

      {proposal?.status === 'pending' && myIntakeDone ? (
        <div className="couple-card">
          <h3>Therapist proposal</h3>
          <p>
            {proposal.proposedBy === data?.myRole
              ? `You selected ${proposal.therapistName}. Waiting for ${other} to confirm.`
              : `${other} selected ${proposal.therapistName}. Please confirm.`}
          </p>
          {proposal.proposedBy !== data?.myRole ? (
            <button
              type="button"
              className="teen-intake-submit"
              onClick={() => navigate('/match-therapist', { state: { coupleId: couple.id, therapyType: 'couples' } })}
            >
              Review & confirm
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
