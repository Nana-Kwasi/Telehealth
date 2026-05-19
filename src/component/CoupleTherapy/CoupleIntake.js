import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../Auth/firebaseConfig';
import { useNavigate, useLocation } from 'react-router-dom';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import CoupleSectionForm from './CoupleSectionForm';
import {
  loadSectionData,
  savePartnerSection,
  validateSection,
  markPartnerIntakeComplete,
  navigateAfterCoupleIntake,
  sectionsForPartner,
  ensureCoupleSession,
  findResumeSectionIndex,
  isCoupleIntakeDoneLocally,
  getAuthCoupleHints,
  enrichCoupleIntakePersonalSection,
  syncLocalCoupleDraftFromServer,
} from '../../services/coupleTherapyService';
import './CoupleTherapyIntake.css';

export default function CoupleIntake() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialCoupleId =
    location.state?.coupleId || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
  const initialRole =
    location.state?.partnerRole || localStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole) || 'partnerA';
  const [activeCoupleId, setActiveCoupleId] = useState(initialCoupleId);
  const [activePartnerKey, setActivePartnerKey] = useState(
    initialRole === 'partnerB' ? 'partnerB' : 'partnerA',
  );

  const sections = useMemo(() => sectionsForPartner(activePartnerKey), [activePartnerKey]);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState('');
  const leavingRef = useRef(false);

  const current = sections[sectionIndex];
  const progress = ((sectionIndex + 1) / sections.length) * 100;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setBootstrapError('');
      try {
        const authHints = await getAuthCoupleHints();
        const storedCoupleId =
          initialCoupleId ||
          localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId) ||
          authHints.coupleId;
        const claimAs =
          initialRole === 'partnerB' || authHints.partnerRole === 'partnerB' ? 'partnerB' : 'partnerA';
        let session = await ensureCoupleSession(storedCoupleId || undefined, { claimAs });
        if (!session.ok && storedCoupleId && session.reason !== 'no_couple_for_email') {
          await new Promise((r) => setTimeout(r, 400));
          session = await ensureCoupleSession(storedCoupleId, { claimAs });
        }
        if (!session.ok) {
          if (session.reason === 'no_couple_for_email' && !storedCoupleId) {
            leavingRef.current = true;
            navigate('/couple/initiation', { replace: true });
            return;
          }
          setBootstrapError(session.message || 'Could not verify your couple account.');
          return;
        }

        const resolvedCoupleId =
          session.coupleId || initialCoupleId || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
        if (!resolvedCoupleId) {
          setBootstrapError('Could not resolve your couple registration.');
          return;
        }

        const resolvedKey = session.partnerRole === 'partnerB' ? 'partnerB' : 'partnerA';
        setActiveCoupleId(resolvedCoupleId);
        setActivePartnerKey(resolvedKey);
        const partnerSections = sectionsForPartner(resolvedKey);

        if (session.intakeComplete || isCoupleIntakeDoneLocally()) {
          leavingRef.current = true;
          navigate(
            resolvedKey === 'partnerA' ? '/couple/waiting' : '/couple/dashboard',
            { state: { coupleId: resolvedCoupleId, inviteUrl: session.inviteUrl }, replace: true },
          );
          return;
        }

        await syncLocalCoupleDraftFromServer(resolvedCoupleId, resolvedKey);
        const resumeIdx = await findResumeSectionIndex(
          resolvedCoupleId,
          resolvedKey,
          partnerSections,
        );
        setSectionIndex(resumeIdx);
      } finally {
        if (!leavingRef.current) {
          setBootstrapped(true);
          setLoading(false);
        }
      }
    })();
  }, [initialCoupleId, sections, navigate]);

  useEffect(() => {
    if (!activeCoupleId || !bootstrapped || leavingRef.current) return;
    (async () => {
      setLoading(true);
      try {
        const section = sections[sectionIndex];
        let merged = { ...(await loadSectionData(activeCoupleId, activePartnerKey, section)) };
        if (section.id === 'personal') {
          merged = await enrichCoupleIntakePersonalSection(activeCoupleId, activePartnerKey, merged);
        }
        setForm(merged);
      } catch (e) {
        console.warn('Could not load section:', e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCoupleId, activePartnerKey, sectionIndex, sections, bootstrapped]);

  const persistSection = async () => {
    const section = sections[sectionIndex];
    const payload =
      section.id === 'consent'
        ? {
            ...form,
            signedAt: new Date().toISOString(),
            consentDate: new Date().toISOString().split('T')[0],
          }
        : form;
    await savePartnerSection(activeCoupleId, activePartnerKey, section.id, payload);
  };

  const onNext = async () => {
    const section = sections[sectionIndex];
    const v = validateSection(section, form);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      setFormError('Please complete required fields.');
      return;
    }

    if (section.id === 'consent') {
      const allConsent = section.fields.filter((f) => f.type === 'consent_check').every((f) => form[f.name]);
      if (!allConsent) {
        setFormError('Please accept all agreements.');
        return;
      }
    }

    setSaving(true);
    setFormError('');
    try {
      await persistSection();

      if (sectionIndex < sections.length - 1) {
        setSectionIndex((i) => i + 1);
        setErrors({});
        setFormError('');
        setLoading(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const completion = await markPartnerIntakeComplete(activeCoupleId, activePartnerKey);
      localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, activeCoupleId);
      localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, activePartnerKey);
      localStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'true');
      if (auth.currentUser?.uid) {
        await setDoc(
          doc(db, 'auth', auth.currentUser.uid),
          { coupleIntakeComplete: true, updatedAt: new Date().toISOString() },
          { merge: true },
        );
      }

      await navigateAfterCoupleIntake(navigate, activeCoupleId, activePartnerKey, completion);
    } catch (e) {
      console.error(e);
      const msg = e.message || 'Could not save. Please try again.';
      setFormError(
        /permission/i.test(msg)
          ? 'Could not save intake — your account may not be linked to this couple. Sign out, sign back in with the email used at registration, then try again.'
          : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  const onBack = async () => {
    if (sectionIndex === 0) {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/dashboard', { replace: true });
      }
      return;
    }
    try {
      await persistSection();
    } catch (e) {
      console.warn('Could not save draft on back:', e?.message);
    }
    setSectionIndex((i) => i - 1);
    setErrors({});
    setFormError('');
    setLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (bootstrapError) {
    return (
      <div className="teen-intake-page couple-link-error-page">
        <div className="couple-link-error-card">
          <h2 className="couple-link-error-title">Couple account not linked</h2>
          <p className="couple-link-error-message">{bootstrapError}</p>
          <div className="couple-link-error-actions">
            <button
              type="button"
              className="teen-intake-submit"
              onClick={() => {
                setBootstrapError('');
                setBootstrapped(false);
                window.location.reload();
              }}
            >
              Try again
            </button>
            <button type="button" className="couple-btn-ghost" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !Object.keys(form).length) {
    return <div className="teen-intake-page couple-centered">Loading intake…</div>;
  }

  return (
    <div className="teen-intake-page couple-intake-layout">
      <header className="teen-intake-header">
        <h1>Private intake</h1>
        <p>Your answers are confidential and not shared with your partner.</p>
      </header>

      <div className="couple-intake-progress couple-form-card" style={{ paddingBottom: '1rem' }}>
        <span>
          Section {sectionIndex + 1} of {sections.length}
        </span>
        <div className="couple-progress-bar">
          <div className="couple-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <CoupleSectionForm section={current} form={form} errors={errors} onChange={setForm} />

      {formError ? <p className="teen-intake-error">{formError}</p> : null}

      <div className="couple-intake-footer">
        <button type="button" className="couple-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" className="teen-intake-submit couple-btn-primary" onClick={onNext} disabled={saving}>
          {saving ? 'Saving…' : sectionIndex === sections.length - 1 ? 'Complete intake' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
