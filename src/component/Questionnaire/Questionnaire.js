import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { steps, phq9Questions } from './steps';
import './Questionnaire.css';
import { db } from '../Auth/firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

const storageKey = 'th.onboard';

const getInitial = () => {
  try {
    const fromStorage = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return fromStorage || {};
  } catch { return {}; }
};

export default function Questionnaire() {
  const navigate = useNavigate();
  const [data, setData] = useState(getInitial());
  const [index, setIndex] = useState(() => {
    // If therapy type picked on home, start at step 2
    return data.therapyType ? 1 : 0;
  });
  const [loading, setLoading] = useState(false);

  const current = steps[index];

  const save = (partial) => {
    const next = { ...data, ...partial };
    setData(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const nextStep = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
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
      } else {
        return data[field.name] && data[field.name] !== '';
      }
  };

  // Check if all fields in current step are answered
  const isCurrentStepComplete = () => {
    const current = steps[index];
    return current.fields.every(isFieldComplete);
  };

  const complete = async () => {
    setLoading(true);
    try {
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

      // Submit questionnaire data to Firestore clients collection
      const clientData = {
        ...data,
        phq9: phq9Data, // Add the combined PHQ-9 data
        completedAt: new Date().toISOString(),
        status: 'pending', // Set to active so client can login
        displayName: data.name || data.firstName + ' ' + data.lastName || 'Client',
        clientName: data.name || data.firstName + ' ' + data.lastName || 'Client'
      };
      
      const docRef = await addDoc(collection(db, 'clients'), clientData);
      
      // Save the client document ID for later use
      localStorage.setItem('th.clientId', docRef.id);
      
      // Navigate to signup
      navigate('/signup');
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
          <h3 className="progress-title">Getting to know you</h3>
          <span className="progress-text">{index + 1} of {steps.length}</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          ></div>
        </div>
        <div className="progress-steps">
          {steps.map((step, i) => (
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
        <div className="question-header">
          <h2 className="question-title">{current.title}</h2>
          <p className="question-description">
            Help us match you to the right therapist<br />
            It's important to have a therapist who you can establish a personal connection with. The following questions are designed to match you to a licensed therapist based on your therapy needs and personal preferences.
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
          {index < steps.length - 1 ? (
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
    return (
      <div className={`field ${isComplete ? 'complete' : 'incomplete'}`}>
        <div className="label">
          {field.label}
          {isComplete && <span className="completion-indicator">✓</span>}
        </div>
        <select className="select" value={value[field.name] ?? ''} onChange={(e) => set(field.name, e.target.value)}>
          <option value="" disabled>Select…</option>
          {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
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




