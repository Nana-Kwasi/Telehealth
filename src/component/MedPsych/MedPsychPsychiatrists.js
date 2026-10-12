import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/apiClient';
import { getFlow, updateFlow } from '../../utils/medpsychFlow';
import { therapistFee, formatFee } from '../../utils/therapistFee';
import { resolveFileUrl } from '../../utils/fileUrl';
import '../../styles/zencare.css';
import './MedPsych.css';
import Paged from '../Common/Paged';

/**
 * Choose a psychiatrist for the second-opinion consultation.
 *
 * Reads the same public therapist list the therapy matching flow uses, so a
 * psychiatrist added for one is available to the other with no extra
 * administration. The choice goes into the cached flow, not the database — the
 * user does not exist yet at this point.
 */
export default function MedPsychPsychiatrists() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const flow = getFlow();

  // Guard: arriving here directly, without having accepted the policies, would
  // let someone skip the consent gate entirely.
  useEffect(() => {
    if (!flow.details?.email) navigate('/medpsych', { replace: true });
  }, [flow.details, navigate]);

  useEffect(() => {
    (async () => {
      const data = await api('/api/v1/therapists', { authenticated: false }).catch(() => []);
      setList(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
  }, []);

  const choose = (t) => {
    updateFlow({
      step: 'booking',
      therapist: {
        id: t.id || t.uid,
        name: t.name || t.fullName || 'Psychiatrist',
        specialization: t.specialization || t.specialty || 'Psychiatry',
        photoURL: resolveFileUrl(t.photoURL) || null,
        // No invented default. An unpriced psychiatrist used to fall back to
        // 80 and charge that, which is a made-up price for a real payment.
        rate: therapistFee(t),
      },
    });
    navigate('/medpsych/booking');
  };

  // Both services pick a clinician here, but they are not the same clinician.
  // Second Opinion is reviewed by a specialist; Psychology & Counseling is
  // ongoing talking therapy with a therapist. Calling everyone "psychiatrist"
  // was left over from when this module was only the second-opinion product.
  const isSecondOpinion = (getFlow().serviceType || 'medpsych') === 'second_opinion';
  const noun = isSecondOpinion ? 'specialist' : 'therapist';
  const nounPlural = isSecondOpinion ? 'specialists' : 'therapists';

  return (
    <div className="zc zc-shell zc-hero-ground mp-pick">
      <div className="zc-container">
        <div className="mp-pick-head">
          <span className="zc-badge">Step 2 of 3</span>
          <h1 className="zc-display" style={{ fontSize: 'clamp(1.9rem,3.6vw,3rem)', marginTop: '1rem' }}>
            Choose your <em>{noun}</em>.
          </h1>
          <p className="zc-body" style={{ maxWidth: '58ch', marginTop: '0.75rem' }}>
            {isSecondOpinion
              ? 'Each of these clinicians can review the diagnosis, treatment or medication you are already receiving, and give you an independent opinion.'
              : 'Each of these clinicians offers ongoing talking therapy. Pick whoever feels like the right fit — you can change later.'}
          </p>
        </div>

        {loading ? (
          <p className="mp-empty">Loading {nounPlural}…</p>
        ) : list.length === 0 ? (
          <div className="zc-card mp-empty">
            <p className="zc-body">No {nounPlural} are available to book right now.</p>
            <p className="zc-meta" style={{ marginTop: '0.5rem' }}>
              Please try again shortly — nothing you have entered has been lost.
            </p>
          </div>
        ) : (
          <div className="mp-pick-grid">
            <Paged items={list}>{(list) => list.map((t) => {
              const id = t.id || t.uid;
              const name = t.name || t.fullName || (isSecondOpinion ? 'Specialist' : 'Therapist');
              const selected = flow.therapist?.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`zc-card mp-doc${selected ? ' zc-card--selected' : ''}`}
                  onClick={() => choose(t)}
                >
                  <div className="mp-doc-top">
                    {t.photoURL ? (
                      <img className="mp-doc-avatar" src={resolveFileUrl(t.photoURL)} alt="" />
                    ) : (
                      <span className="mp-doc-avatar">{name.charAt(0).toUpperCase()}</span>
                    )}
                    <div>
                      <p className="mp-doc-name">{name}</p>
                      <p className="mp-doc-spec">{t.specialization || t.specialty || 'Psychiatry'}</p>
                    </div>
                  </div>

                  <p className="mp-doc-body">
                    {t.bio || t.about
                      || 'Reviews medication and diagnoses for people already under treatment elsewhere.'}
                  </p>

                  <div className="mp-doc-foot">
                    <span className="mp-doc-rate">
                      {formatFee(t)}
                      <span className="zc-meta" style={{ marginLeft: 4 }}>/ consultation</span>
                    </span>
                    <span className="mp-doc-pick">{selected ? 'Selected' : 'Select'}</span>
                  </div>
                </button>
              );
            })}</Paged>
          </div>
        )}
      </div>
    </div>
  );
}
