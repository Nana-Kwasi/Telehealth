import React, { useEffect, useMemo, useState } from 'react';
import PriceTag from '../Common/PriceTag';
import { quotePrices } from '../../services/pricing';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../../services/firestoreShim';
import './MatchTherapist.css';
import { collection, doc, getDocs, setDoc } from '../../services/firestoreShim';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import {
  loadCouple,
  canBrowseTherapists,
  getCoupleMatchedTherapists,
  proposeCoupleTherapist,
  confirmCoupleTherapist,
} from '../../services/coupleTherapyService';
import { therapistFee } from '../../utils/therapistFee';
import { resolveFileUrl } from '../../utils/fileUrl';


/** A therapist's own per-session charge (stored in their profile metadata). */
export function therapistRate(t) {
  // One implementation, shared with every other fee reader.
  const raw = therapistFee(t);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function MatchTherapist() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [therapists, setTherapists] = useState([]);
  // Keyed by therapist id. Empty until the batch quote lands, which is why the
  // card falls back to the plain rate rather than rendering a blank price.
  const [quotes, setQuotes] = useState({});
  const [coupleProfile, setCoupleProfile] = useState(null);
  const [coupleBlocked, setCoupleBlocked] = useState(false);
  const [availabilityOverlap, setAvailabilityOverlap] = useState(true);
  const [myPartnerKey, setMyPartnerKey] = useState(null);

  // One request for the whole list. Twelve cards firing twelve quotes is both
  // slow and a good way to have half the list show a discount and half not.
  // Declared with the other hooks: below an early return it would run
  // conditionally, which React forbids.
  useEffect(() => {
    const items = therapists
      .map((t) => ({
        key: t.id || t.uid,
        providerId: t.id || t.uid,
        serviceType: 'therapy',
        baseAmount: therapistRate(t),
      }))
      .filter((i) => i.key && i.baseAmount > 0);
    if (!items.length) { setQuotes({}); return undefined; }
    let live = true;
    quotePrices(items).then((map) => { if (live) setQuotes(map || {}); });
    return () => { live = false; };
  }, [therapists]);


  // MUST be memoised: this object is a dependency of the loader effect below, and
  // rebuilding it on every render made the effect re-run on every render — an
  // infinite render/fetch loop that fired well over a thousand
  // /couples/{id}/matched-therapists requests in a few seconds.
  const questionnaireData = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('th.onboard') || '{}');
    } catch {
      return {};
    }
  }, []);

  const clientId = localStorage.getItem('th.clientId');

  const calculateRelevanceScore = (therapist, data) => {
    let score = 50;
    if (therapist.role === 'admin') score += 25;
    else if (therapist.role === 'therapist') score += 15;
    // The API returns `therapyType`; `type` is the Firestore-era name.
    const therapistType = therapist.therapyType || therapist.type;
    if (therapistType && data.therapyType) {
      if (String(therapistType).toLowerCase().includes(String(data.therapyType).toLowerCase())) score += 10;
    }
    if (data.preferChristianTherapist === 'Yes' && therapist.religion === 'Christianity') score += 8;
    if (data.therapistGender && data.therapistGender !== 'No preference') {
      if (therapist.gender?.toLowerCase() === data.therapistGender.toLowerCase()) score += 5;
    }
    if (data.lgbtqia === 'Yes, this is important to me' && therapist.lgbtqiaAffirming) score += 7;
    if (therapist.yearsExperience) score += Math.min(therapist.yearsExperience, 20) * 0.5;
    return score;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const routeCoupleId = location.state?.coupleId;
        const storedCoupleId = localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
        const resolvedCoupleId = routeCoupleId || storedCoupleId || questionnaireData.coupleId;
        const isCoupleFlow =
          resolvedCoupleId ||
          questionnaireData.therapyType === 'couples' ||
          location.state?.therapyType === 'couples';

        if (isCoupleFlow && resolvedCoupleId) {
          const couple = await loadCouple(resolvedCoupleId);
          setCoupleProfile(couple);
          const uid = auth.currentUser?.uid;
          const pk =
            couple?.partnerA?.authUid === uid
              ? 'partnerA'
              : couple?.partnerB?.authUid === uid
                ? 'partnerB'
                : null;
          setMyPartnerKey(pk);

          if (!canBrowseTherapists(couple)) {
            setCoupleBlocked(true);
            setTherapists([]);
            setLoading(false);
            return;
          }

          const match = await getCoupleMatchedTherapists(resolvedCoupleId);
          setAvailabilityOverlap(match.availabilityOverlap !== false);
          const list = (match.therapists || []).map((t) => ({
            ...t,
            score: t.matchScore || 50,
          }));
          setTherapists(list);
          setLoading(false);
          return;
        }

        const col = collection(db, 'therapists');
        const res = await getDocs(col);
        const all = res.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Only exclude a therapist on a *definite* mismatch. These filters used to read
        // `t.type` (the API returns `therapyType`) and treated a therapist with no
        // recorded gender / religion / affirming flag as a mismatch — so a single stated
        // preference emptied the whole list and the screen rendered no names at all.
        // Preference strength is already expressed by calculateRelevanceScore ranking.
        const matchesPreference = (value, pref) => {
          if (!pref) return true;
          if (value == null || value === '') return true; // unknown → don't exclude
          return String(value).toLowerCase() === String(pref).toLowerCase();
        };
        const filtered = all.filter((t) => {
          // Therapy modality (individual/couples/teen) is its own axis — do NOT fold
          // specialization/specialties in here, or a therapist listed under "Anxiety"
          // gets excluded from individual therapy.
          // therapyType only — `t.type` is 'Administrator' for an admin therapist,
          // which matches no modality and would drop them from the match list.
          const therapistType = String(t.therapyType || '').toLowerCase();
          const typeMatch =
            !questionnaireData.therapyType ||
            !therapistType ||
            therapistType.includes(String(questionnaireData.therapyType).toLowerCase());
          const religionMatch =
            questionnaireData.preferChristianTherapist !== 'Yes' ||
            matchesPreference(t.religion, 'christianity');
          const genderPref =
            questionnaireData.therapistGender === 'No preference' ? null : questionnaireData.therapistGender;
          const genderMatch = matchesPreference(t.gender, genderPref);
          const lgbtqiaMatch =
            questionnaireData.lgbtqia !== 'Yes, this is important to me' ||
            t.lgbtqiaAffirming == null ||
            t.lgbtqiaAffirming === true ||
            String(t.lgbtqiaAffirming).toLowerCase() === 'true';
          return typeMatch && religionMatch && genderMatch && lgbtqiaMatch;
        });

        const scored = filtered.map((t) => ({
          ...t,
          score: calculateRelevanceScore(t, questionnaireData),
        }));
        scored.sort((a, b) => b.score - a.score);
        setTherapists(scored);
      } catch (e) {
        console.error('Error fetching therapists:', e);
        setTherapists([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [location.state, questionnaireData]);

  const choose = async (t) => {
    try {
      const coupleId = coupleProfile?.id || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);

      if (coupleId && coupleProfile) {
        const proposal = coupleProfile.therapistProposal;
        if (proposal?.status === 'pending' && proposal.proposedBy !== myPartnerKey) {
          await confirmCoupleTherapist(coupleId, true);
          navigate('/dashboard', { replace: true });
          return;
        }
        await proposeCoupleTherapist(coupleId, t.id, t.name || t.displayName);
        alert('Your partner will be asked to confirm this therapist before assignment is final.');
        navigate('/couple/dashboard', { state: { coupleId }, replace: true });
        return;
      }

      // Individual therapy: carry the chosen therapist to payment so the client is
      // charged that therapist's own session rate. The assignment is written once
      // payment completes, not here — picking someone is not the same as booking.
      navigate('/payment', {
        state: {
          therapist: {
            id: t.id,
            name: t.name || t.fullName || t.displayName || 'Therapist',
            specialization: t.specialization || t.therapyType || '',
            sessionRate: therapistRate(t),
            photoURL: resolveFileUrl(t.photoURL) || null,
          },
        },
      });
    } catch (error) {
      console.error('Error assigning therapist:', error);
      alert('There was an error assigning your therapist. Please try again.');
    }
  };

  const pendingProposal =
    coupleProfile?.therapistProposal?.status === 'pending' ? coupleProfile.therapistProposal : null;
  const awaitingMyConfirm = pendingProposal && pendingProposal.proposedBy !== myPartnerKey;

  if (coupleBlocked) {
  return (
      <div className="match-container">
        <h1 className="page-title">Therapist selection locked</h1>
        <p className="subtitle">
          Complete both partners intake, consent, and couple payment before browsing therapists.
        </p>
        <button
          type="button"
          className="select-button"
          onClick={() => navigate('/couple/dashboard', { state: { coupleId: coupleProfile?.id } })}
        >
          View couple status
        </button>
      </div>
    );
  }

  return (
    <div className="match-container">
      <h1 className="page-title">
        {coupleProfile ? 'Choose your couple therapist' : 'Choose your therapist'}
      </h1>
      <p className="subtitle">
        {awaitingMyConfirm
          ? `Your partner proposed ${pendingProposal.therapistName}. Confirm below.`
          : coupleProfile
            ? 'One therapist for both — your partner must confirm your selection'
            : 'We matched a few options based on your preferences.'}
      </p>

      {/* Same escape hatch medical patients get when they skip doctor booking:
          go to the dashboard now and pick a therapist from the CTA there.
          Couples can't skip — their flow needs both partners on one therapist. */}
      {!coupleProfile ? (
        <button
          type="button"
          className="skip-link"
          onClick={() => navigate('/dashboard', { replace: true })}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: '#4f46e5', fontWeight: 600, fontSize: '0.875rem',
            textDecoration: 'underline', marginBottom: '1.25rem',
          }}
        >
          Skip for now — I'll choose a therapist later
        </button>
      ) : null}

      {coupleProfile && !availabilityOverlap ? (
        <div className="no-matches-card" style={{ marginBottom: '1rem' }}>
          No overlapping availability detected. Consider updating availability in intake or choose the closest match.
        </div>
      ) : null}

      {awaitingMyConfirm ? (
        <button
          type="button"
          className="select-button"
          style={{ marginBottom: '1.5rem' }}
          onClick={() =>
            choose({ id: pendingProposal.therapistId, name: pendingProposal.therapistName })
          }
        >
          Confirm {pendingProposal.therapistName}
        </button>
      ) : null}

      {loading ? (
        <div className="loading-card">Loading matches…</div>
      ) : therapists.length ? (
        <div className="card-grid">
          {therapists.map((t) => (
            <div key={t.id} className="therapist-card">
              <div className="therapist-avatar">{t.photoURL ? <img alt="" src={resolveFileUrl(t.photoURL)} /> : '🧑‍⚕️'}</div>
              <div className="therapist-info">
                <div className="therapist-name">{t.name || t.fullName || t.displayName || 'Therapist'}</div>
                <div className="therapist-details">
                  {t.therapyType || t.type || t.specialization || 'Therapist'} •{' '}
                  {t.yearsExperience ? `${t.yearsExperience} yrs` : 'Experience N/A'}
                </div>
                <div className="therapist-specialties">
                  {(Array.isArray(t.specialties) ? t.specialties : [t.specialties]).filter(Boolean).join(', ')}
                </div>
                <div className="therapist-rate">
                  {therapistRate(t) != null ? (
                    <PriceTag
                      quote={quotes[t.id || t.uid]}
                      baseAmount={therapistRate(t)}
                      suffix=" / session"
                      size="sm"
                    />
                  ) : 'Rate not published'}
                </div>
                {t.score ? <div className="therapist-score">Match: {Math.round(t.score)}%</div> : null}
              </div>
              <div>
                <button type="button" className="select-button" onClick={() => choose(t)}>
                  {awaitingMyConfirm ? 'Select' : coupleProfile ? 'Propose' : 'Select'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-matches-card">No exact matches yet. We'll assign the best available therapist shortly.</div>
      )}
    </div>
  );
}
