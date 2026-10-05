import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { steps, phq9Questions } from './steps';
import './Questionnaire.css';
import { db } from '../../services/firestoreShim';
import { collection, addDoc } from '../../services/firestoreShim';
import {
  buildTeenClientRecord,
  loadJson,
  mergeTeenIntoQuestionnaireData,
  TEEN_STORAGE_KEYS,
} from '../../utils/teenTherapyStorage';
import {
  buildIndividualConsentRecord,
  INDIVIDUAL_CONSENT_STEP,
  needsIndividualQuestionnaireConsent,
} from '../../utils/individualTherapyConfig';
import { nessaHubPolicyUrl, NESSA_HUB_POLICY_LINKS } from '../../constants/nessaHubPolicies';
import {
  getQuestionnaireAgeOptions,
  validateQuestionnaireAge,
} from '../../utils/therapyAgeValidation';
import { updateFlow as updateMedPsychFlow } from '../../utils/medpsychFlow';

const storageKey = 'th.onboard';

const getInitial = () => {
  try {
    const fromStorage = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return mergeTeenIntoQuestionnaireData(fromStorage || {});
  } catch {
    return {};
  }
};

// Resolve the client's display name from the intake answers. Falls back to the
// consent step's electronic signature (the only name the visitor actually types)
// before the generic "Client" placeholder.
const questionnaireDisplayName = (d = {}) =>
  d.name
  || [d.firstName, d.lastName].filter(Boolean).join(' ')
  || String(d.consentSignature || '').trim()
  || 'Client';

export default function Questionnaire() {
  const navigate = useNavigate();

  /**
   * Psychology & Counseling reuses this questionnaire.
   *
   * That flow must not write anything before payment, so in this mode the
   * answers are cached into the medpsych flow and the user continues to
   * psychiatrist selection instead of account creation. Everything else — the
   * steps, validation, PHQ-9 scoring — is shared, so the two intakes cannot
   * drift apart.
   */
  const location = useLocation();
  const medpsychMode = new URLSearchParams(location.search).get('flow') === 'medpsych';
  const [data, setData] = useState(getInitial());
  const isTeen = data.therapyType === 'teen';
  const childInfo = data.childInfo || loadJson(TEEN_STORAGE_KEYS.child);
  const childName = [childInfo.firstName, childInfo.lastName].filter(Boolean).join(' ').trim();

  const [index, setIndex] = useState(() => {
    const initial = getInitial();
    if (initial.therapyType === 'teen' && !initial.parentInfo?.firstName) {
      return 0;
    }
    return initial.therapyType ? 1 : 0;
  });
  const [loading, setLoading] = useState(false);

  const activeSteps = useMemo(() => {
    // Psychology & Counseling already collected consent at its policy gate,
    // one tick per document with a timestamp, written to policy_acceptances_v2.
    // Appending the consent step here asked the same person for the same
    // agreements a second time — which reads as though the first set did not
    // register, and is worse than redundant on a consent screen.
    //
    // The standard therapy sign-up has no earlier gate, so it keeps this step.
    if (medpsychMode) return steps;

    if (needsIndividualQuestionnaireConsent(data.therapyType)) {
      return [...steps, INDIVIDUAL_CONSENT_STEP];
    }
    return steps;
  }, [data.therapyType, medpsychMode]);

  useEffect(() => {
    if (data.therapyType === 'teen' && !data.parentInfo?.firstName) {
      navigate('/teen/parent-guardian', { replace: true });
    }
  }, [data.therapyType, data.parentInfo, navigate]);

  const current = activeSteps[index];

  const save = (partial) => {
    const next = { ...data, ...partial };
    setData(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const nextStep = () => setIndex((i) => Math.min(i + 1, activeSteps.length - 1));
  const prevStep = () => setIndex((i) => Math.max(i - 1, 0));

  // Check if a specific field is complete
  const isFieldComplete = (field) => {
    // Skip conditional fields that aren't shown
    if (field.showIf) {
      const { field: conditionField, value: conditionValue } = field.showIf;
      if (data[conditionField] !== conditionValue) {
        return true; // Skip this field
      }
    }
    
          // Check if field has a value
      if (field.type === 'multiselect') {
        const value = data[field.name] || [];
        return value.length > 0;
      } else if (field.type === 'phq9') {
        const value = data[field.name] || {};
        return Object.keys(value).length === phq9Questions.length;
      } else if (field.type === 'phq9_single') {
        return data[field.name] !== undefined && data[field.name] !== '';
      } else if (field.type === 'consent_check') {
        return data[field.name] === true;
      } else if (field.type === 'signature') {
        return String(data[field.name] || '').trim() !== '';
      } else if (field.type === 'consent_footer') {
        return true;
      } else if (field.name === 'age') {
        if (!data.age) return false;
        return !validateQuestionnaireAge(data.therapyType, data.age);
      } else {
        return data[field.name] && data[field.name] !== '';
      }
  };

  // Check if all fields in current step are answered
  const isCurrentStepComplete = () => {
    const step = activeSteps[index];
    return step.fields.every(isFieldComplete);
  };

  const complete = async () => {
    setLoading(true);
    try {
      if (medpsychMode) {
        // Cache only. No account, no client record — the flow commits after
        // payment, in one transaction, exactly as the rest of it does.
        const phq9 = {};
        for (let i = 1; i <= 9; i += 1) {
          if (data[`phq9_${i}`] !== undefined) phq9[`phq9_${i}`] = data[`phq9_${i}`];
        }
        // Carry the therapy type through so the questionnaire, matching and
        // the committed account agree on it — and so the teen path's consent
        // details reach the commit. An under-18 account must never exist
        // without the consent that permits it.
        updateMedPsychFlow({
          intake: { ...data, phq9 },
          therapyType: data.therapyType || 'individual',
          step: 'therapist',
        });
        navigate('/medpsych/psychiatrists');
        return;
      }

      // Check if we're online
      if (!navigator.onLine) {
        throw new Error('You are currently offline. Please check your internet connection and try again.');
      }

      // Combine individual PHQ-9 answers into a single object
      const phq9Data = {};
      for (let i = 1; i <= 9; i++) {
        const fieldName = `phq9_${i}`;
        if (data[fieldName] !== undefined) {
          const questionIndex = i - 1;
          phq9Data[phq9Questions[questionIndex]] = data[fieldName];
        }
      }

      const merged = mergeTeenIntoQuestionnaireData(data);
      let clientData = {
        ...merged,
        phq9: phq9Data,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'active',
        // The questionnaire collects no name field — the only name the visitor types
        // is the consent step's electronic signature (full legal name). Prefer it so
        // the stored client record isn't literally named "Client".
        displayName: questionnaireDisplayName(merged),
        clientName: questionnaireDisplayName(merged),
      };

      if (merged.therapyType === 'teen') {
        clientData = buildTeenClientRecord(clientData);
      } else if (needsIndividualQuestionnaireConsent(merged.therapyType)) {
        clientData.individualConsent = buildIndividualConsentRecord(merged);
        clientData.consentComplete = true;
      }
      
      const docRef = await addDoc(collection(db, 'clients'), clientData);

      // Save the client document ID for later use — but ONLY when it is a real id.
      // Before signup there is no account yet, so the shim parks the answers in
      // `th.clientIntake` and returns the placeholder 'pending-intake'. Storing that
      // poisoned `th.clientId` for the whole session: ~40 screens read
      // `localStorage.getItem('th.clientId') || currentUser.uid`, so they all
      // requested /clients/pending-intake (400 "Invalid value for 'clientId'")
      // instead of the real profile — which is why the intake answers never showed
      // up on the client's Settings/Profile screens after signing in.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_RE.test(String(docRef.id))) localStorage.setItem('th.clientId', docRef.id);
      else localStorage.removeItem('th.clientId');
      
      // Navigate to signup, carrying the intake answers so the Full name field can
      // pre-fill from the consent signature (SignUp reads clientData.name /
      // .displayName). Without state the field rendered blank on web while mobile
      // pre-filled it — the two flows now behave the same.
      navigate('/signup', { state: { clientData: { ...clientData, id: docRef.id } } });
    } catch (error) {
      console.error('Error submitting questionnaire:', error);
      
      // Handle specific Firebase offline errors
      if (error.message.includes('offline') || error.message.includes('Failed to get document')) {
        alert('You are currently offline. Please check your internet connection and try again.');
      } else {
        alert('There was an error submitting your questionnaire. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-detect country via IP on first load if not set
  useEffect(() => {
    const hasCountry = data.country;
    if (hasCountry) return;
    (async () => {
      try {
        const resp = await fetch('https://ipapi.co/json/');
        const json = await resp.json();
        if (json && json.country_name) {
          save({ country: json.country_name });
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="questionnaire-container">
      {/* Progress Bar */}
      <div className="progress-container">
        <div className="progress-header">
          <h3 className="progress-title">{isTeen ? 'Getting to know your teen' : 'Getting to know you'}</h3>
          <span className="progress-text">{index + 1} of {activeSteps.length}</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${((index + 1) / activeSteps.length) * 100}%` }}
          ></div>
        </div>
        <div className="progress-steps">
          {activeSteps.map((step, i) => (
            <div 
              key={step.key} 
              className={`progress-step ${i < index ? 'completed' : i === index ? 'active' : ''}`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Question Card */}
      <div className="question-card">
        {isTeen && childName ? (
          <div className="teen-banner">
            Questionnaire for <strong>{childName}</strong> — answers should reflect your teen&apos;s needs and preferences.
          </div>
        ) : null}
        <div className="question-header">
          <h2 className="question-title">{current.title}</h2>
          <p className="question-description">
            {isTeen ? (
              <>
                Help us match your child to the right therapist.
                <br />
                These questions help us find a licensed therapist suited to your teen&apos;s needs. A parent or guardian may assist with answers where helpful.
              </>
            ) : current.key === 'consent' ? (
              <>
                Please review and accept the following before we create your account.
                <br />
                Use the arrow on each row to read the full policy on our policies site.
              </>
            ) : (
              <>
                Help us match you to the right therapist
                <br />
                It&apos;s important to have a therapist who you can establish a personal connection with. The following questions are designed to match you to a licensed therapist based on your therapy needs and personal preferences.
              </>
            )}
          </p>
        </div>
        
        <div className="question-content">
          {current.fields.map((f) => (
            <Field 
              key={f.name || f.type} 
              field={f} 
              value={data} 
              onChange={save}
              isComplete={isFieldComplete(f)}
            />
          ))}
        </div>

        <div className="question-actions">
          <button className="btn" onClick={prevStep} disabled={index === 0}>Back</button>
          {index < activeSteps.length - 1 ? (
            <button 
              className="btn primary" 
              onClick={nextStep} 
              disabled={!isCurrentStepComplete()}
            >
              Next
            </button>
          ) : (
            <button className="btn primary" onClick={complete} disabled={loading || !isCurrentStepComplete()}>
              {loading ? 'Submitting...' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ field, value, onChange, isComplete }) {
  const set = (k, v) => onChange({ ...value, [k]: v });

  // Handle conditional fields
  if (field.showIf) {
    const { field: conditionField, value: conditionValue } = field.showIf;
    if (value[conditionField] !== conditionValue) {
      return null; // Don't show this field
    }
  }

  if (field.type === 'chips') {
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.label}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <div className="options">
          {field.options.map((opt) => {
            const selected = value[field.name] === opt;
            return (
              <button
                key={opt}
                type="button"
                className={`chip ${selected ? 'selected' : ''}`}
                onClick={() => set(field.name, opt)}
              >{opt}</button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === 'multiselect') {
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.label}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <div className="options">
          {(field.options || []).map((opt) => {
            const list = value[field.name] || [];
            const selected = list.includes(opt);
            const toggle = () => {
              const next = selected ? list.filter((x) => x !== opt) : [...list, opt];
              set(field.name, next);
            };
            return (
              <button key={opt} type="button" className={`chip ${selected ? 'selected' : ''}`} onClick={toggle}>{opt}</button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.label}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <input className="input" type="number" min="0" value={value[field.name] ?? ''} onChange={(e) => set(field.name, Number(e.target.value))} />
      </div>
    );
  }

  if (field.type === 'text') {
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.label}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <input className="input" value={value[field.name] ?? ''} onChange={(e) => set(field.name, e.target.value)} />
      </div>
    );
  }

  if (field.type === 'select') {
    const isAgeField = field.name === 'age';
    const selectOptions = isAgeField
      ? getQuestionnaireAgeOptions(value.therapyType)
      : field.options;
    const ageError =
      isAgeField && value.age ? validateQuestionnaireAge(value.therapyType, value.age) : null;
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.label}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <select className="select" value={value[field.name] ?? ''} onChange={(e) => set(field.name, e.target.value)}>
          <option value="" disabled>Select…</option>
          {selectOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {ageError ? <p className="field-error">{ageError}</p> : null}
        {isAgeField && !ageError ? (
          <p className="hint">
            {value.therapyType === 'teen'
              ? 'Teen therapy is for ages 13–17.'
              : 'You must be 18 or older for this program.'}
          </p>
        ) : null}
      </div>
    );
  }

  if (field.type === 'country') {
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.label}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <select className="select" value={value.country || ''} onChange={(e) => set('country', e.target.value)}>
          <option value="" disabled>Select your country</option>
          <option value="United States">United States</option>
          <option value="Canada">Canada</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="Australia">Australia</option>
          <option value="Germany">Germany</option>
          <option value="France">France</option>
          <option value="South Africa">South Africa</option>
          <option value="Nigeria">Nigeria</option>
          <option value="Ghana">Ghana</option>
          <option value="Kenya">Kenya</option>
          <option value="India">India</option>
          <option value="China">China</option>
          <option value="Japan">Japan</option>
          <option value="Brazil">Brazil</option>
          <option value="Mexico">Mexico</option>
          <option value="Argentina">Argentina</option>
          <option value="Chile">Chile</option>
          <option value="Colombia">Colombia</option>
          <option value="Peru">Peru</option>
          <option value="Venezuela">Venezuela</option>
          <option value="Ecuador">Ecuador</option>
          <option value="Bolivia">Bolivia</option>
          <option value="Paraguay">Paraguay</option>
          <option value="Uruguay">Uruguay</option>
          <option value="Guyana">Guyana</option>
          <option value="Suriname">Suriname</option>
          <option value="French Guiana">French Guiana</option>
          <option value="Falkland Islands">Falkland Islands</option>
          <option value="South Georgia">South Georgia</option>
          <option value="Other">Other</option>
        </select>
        <div className="hint">Auto-detected from your network. You can change if incorrect.</div>
      </div>
    );
  }

  if (field.type === 'consent_check') {
    const policyHref = field.policySlug ? nessaHubPolicyUrl(field.policySlug) : null;
    return (
      <div key={field.name} className="questionnaire-consent-row">
        <label className="questionnaire-consent-main">
          <input
            type="checkbox"
            checked={!!value[field.name]}
            onChange={(e) => set(field.name, e.target.checked)}
          />
          <span>
            <strong>{field.label}</strong>
            {field.description ? <small>{field.description}</small> : null}
          </span>
        </label>
        {policyHref ? (
          <a
            className="questionnaire-consent-link"
            href={policyHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Read full ${field.label} policy`}
            title="Read full policy"
          >
            →
          </a>
        ) : null}
      </div>
    );
  }

  if (field.type === 'signature') {
    const date = new Date().toISOString().split('T')[0];
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.label}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <input
          className="input"
          value={value[field.name] ?? ''}
          onChange={(e) => set(field.name, e.target.value)}
          placeholder="Type your full legal name"
        />
        <p className="hint">Date: {date}</p>
      </div>
    );
  }

  if (field.type === 'consent_footer') {
    return (
      <div className="questionnaire-consent-note">
        <strong>Important</strong>
        <p>
          By proceeding, you agree to our{' '}
          <a href={NESSA_HUB_POLICY_LINKS.terms} target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href={NESSA_HUB_POLICY_LINKS.privacy} target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    );
  }

  if (field.type === 'phq9_single') {
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.question}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <p className="hint">Over the last 2 weeks, how often have you been bothered by this problem?</p>
        <div className="options">
          {[
            { value: 0, label: 'Not at all' },
            { value: 1, label: 'Several days' },
            { value: 2, label: 'More than half the days' },
            { value: 3, label: 'Nearly every day' }
          ].map((option) => {
            const selected = value[field.name] === option.value;
            const setAnswer = () => {
              onChange({ [field.name]: option.value });
            };
            return (
              <button 
                key={option.value} 
                type="button" 
                className={`chip ${selected ? 'selected' : ''}`} 
                onClick={setAnswer}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === 'phq9') {
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          PHQ-9 Depression Assessment (last 2 weeks)
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <p className="hint">Over the last 2 weeks, how often have you been bothered by any of the following problems?</p>
        {phq9Questions.map((question, i) => (
          <div key={i} className="phq9-question">
            <div className="question-text">{question}</div>
            <div className="options">
              {[
                { value: 0, label: 'Not at all' },
                { value: 1, label: 'Several days' },
                { value: 2, label: 'More than half the days' },
                { value: 3, label: 'Nearly every day' }
              ].map((option) => {
                const currentAnswers = value.phq9 || {};
                const selected = currentAnswers[question] === option.value;
                const setAnswer = () => {
                  const next = { ...currentAnswers };
                  next[question] = option.value;
                  onChange({ phq9: next });
                };
                return (
                  <button 
                    key={option.value} 
                    type="button" 
                    className={`chip ${selected ? 'selected' : ''}`} 
                    onClick={setAnswer}
                  >
                    {option.value} - {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <div>Unknown field type: {field.type}</div>;
}




