import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../Auth/firebaseConfig';
import './MatchTherapist.css';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import {
  loadCouple,
  canBrowseTherapists,
  getCoupleMatchedTherapists,
  proposeCoupleTherapist,
  confirmCoupleTherapist,
} from '../../services/coupleTherapyService';

export default function MatchTherapist() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [therapists, setTherapists] = useState([]);
  const [coupleProfile, setCoupleProfile] = useState(null);
  const [coupleBlocked, setCoupleBlocked] = useState(false);
  const [availabilityOverlap, setAvailabilityOverlap] = useState(true);
  const [myPartnerKey, setMyPartnerKey] = useState(null);

  const questionnaireData = (() => {
    try {
      return JSON.parse(localStorage.getItem('th.onboard') || '{}');
    } catch {
      return {};
    }
  })();

  const clientId = localStorage.getItem('th.clientId');

  const calculateRelevanceScore = (therapist, data) => {
    let score = 50;
    if (therapist.role === 'admin') score += 25;
    else if (therapist.role === 'therapist') score += 15;
    if (therapist.type && data.therapyType) {
      if (therapist.type.toLowerCase().includes(data.therapyType)) score += 10;
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

        const filtered = all.filter((t) => {
          const typeMatch =
            !questionnaireData.therapyType ||
            (t.type || '').toLowerCase().includes(questionnaireData.therapyType);
          const christianPref = questionnaireData.preferChristianTherapist === 'Yes';
          const religionMatch = !christianPref || (t.religion || '').toLowerCase() === 'christianity';
          const genderPref = questionnaireData.therapistGender;
          const genderMatch =
            !genderPref || genderPref === 'No preference' || (t.gender || '').toLowerCase() === genderPref.toLowerCase();
          const lgbtqiaPref = questionnaireData.lgbtqia;
          const lgbtqiaMatch =
            !lgbtqiaPref || lgbtqiaPref === 'No preference' || t.lgbtqiaAffirming === true;
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

      const u = auth.currentUser;
      if (u && clientId) {
        await setDoc(
          doc(db, 'clients', clientId),
          {
            assignedTherapistId: t.id,
            assignedTherapistName: t.name,
            assignedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        await setDoc(doc(db, 'therapists', t.id, 'clients', clientId), {
          clientId,
          assignedAt: new Date().toISOString(),
        });
      }
      navigate('/dashboard');
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
              <div className="therapist-avatar">{t.photoURL ? <img alt="" src={t.photoURL} /> : '🧑‍⚕️'}</div>
              <div className="therapist-info">
                <div className="therapist-name">{t.name}</div>
                <div className="therapist-details">
                  {t.type} • {t.yearsExperience ? `${t.yearsExperience} yrs` : 'Experience N/A'}
                </div>
                <div className="therapist-specialties">{(t.specialties || []).join(', ')}</div>
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
