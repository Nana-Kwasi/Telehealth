import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  saveJson,
  loadJson,
  TEEN_STORAGE_KEYS,
  calculateAgeFromDob,
  validateTeenAge,
} from '../../utils/teenTherapyStorage';
import TeenIntakeLayout from './TeenIntakeLayout';
import ChipSelect from './ChipSelect';
import './TeenTherapyIntake.css';

const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const GRADES = [
  'Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade',
  '6th Grade', '7th Grade', '8th Grade', '9th Grade', '10th Grade', '11th Grade', '12th Grade',
  'College', 'Not in school',
];
const PREV_THERAPY = ['Yes', 'No', 'Not sure'];

const EMPTY = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  age: '',
  gender: '',
  schoolName: '',
  grade: '',
  primaryLanguage: '',
  insuranceProvider: '',
  insuranceMemberId: '',
  medicalConditions: '',
  currentMedications: '',
  allergies: '',
  previousTherapy: '',
  reasonForTherapy: '',
};

export default function ChildInfo() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const parent = loadJson(TEEN_STORAGE_KEYS.parent);
    if (!parent.firstName) navigate('/teen/parent-guardian', { replace: true });
  }, [navigate]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: null }));
  };

  const onDobChange = (value) => {
    const age = calculateAgeFromDob(value);
    setForm((f) => ({ ...f, dateOfBirth: value, age }));
    const ageErr = value ? validateTeenAge(value) : null;
    setErrors((e) => {
      const next = { ...e };
      if (ageErr) next.dateOfBirth = ageErr;
      else delete next.dateOfBirth;
      return next;
    });
  };

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    const dobErr = validateTeenAge(form.dateOfBirth);
    if (dobErr) e.dateOfBirth = dobErr;
    if (!form.gender) e.gender = 'Gender is required';
    if (!form.schoolName.trim()) e.schoolName = 'School name is required';
    if (!form.grade) e.grade = 'Grade is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    saveJson(TEEN_STORAGE_KEYS.child, form);
    navigate('/teen/consent');
  };

  const field = (name, label, opts = {}) => (
    <div className="teen-field" key={name}>
      <label>
        {label}
        {opts.required ? <span className="req"> *</span> : null}
      </label>
      {opts.textarea ? (
        <textarea
          rows={opts.rows || 3}
          value={form[name]}
          onChange={(e) => set(name, e.target.value)}
          placeholder={opts.placeholder}
          className={errors[name] ? 'error' : ''}
        />
      ) : (
        <input
          type={opts.type || 'text'}
          value={form[name]}
          onChange={(e) => set(name, e.target.value)}
          placeholder={opts.placeholder}
          className={errors[name] ? 'error' : ''}
        />
      )}
      {errors[name] ? <p className="teen-field-error">{errors[name]}</p> : null}
    </div>
  );

  return (
    <TeenIntakeLayout
      step={2}
      title="Child/Teen Information"
      subtitle="Please provide information about your child who will be receiving therapy services."
    >
      <form onSubmit={onSubmit}>
        <section className="teen-intake-card">
          <h2>Basic Information</h2>
          <div className="teen-form-row">
            {field('firstName', 'First Name', { required: true, placeholder: 'First name' })}
            {field('lastName', 'Last Name', { required: true, placeholder: 'Last name' })}
          </div>
          <div className="teen-field">
            <label>
              Date of Birth <span className="req">*</span>
            </label>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => onDobChange(e.target.value)}
              className={errors.dateOfBirth ? 'error' : ''}
            />
            <p className="teen-field-hint">Child must be 13–18 years old for teen therapy.</p>
            {form.age ? <p className="teen-field-age">Age: {form.age} years old</p> : null}
            {errors.dateOfBirth ? <p className="teen-field-error">{errors.dateOfBirth}</p> : null}
          </div>
          <div className="teen-field">
            <label>
              Gender <span className="req">*</span>
            </label>
            <ChipSelect options={GENDERS} value={form.gender} onChange={(v) => set('gender', v)} error={errors.gender} />
          </div>
        </section>

        <section className="teen-intake-card">
          <h2>School Information</h2>
          {field('schoolName', 'School Name', { required: true, placeholder: 'School name' })}
          <div className="teen-field">
            <label>
              Grade <span className="req">*</span>
            </label>
            <ChipSelect options={GRADES} value={form.grade} onChange={(v) => set('grade', v)} error={errors.grade} />
          </div>
        </section>

        <section className="teen-intake-card">
          <h2>Health Information</h2>
          {field('primaryLanguage', 'Primary Language', { placeholder: 'e.g., English' })}
          {field('insuranceProvider', 'Insurance Provider', { placeholder: 'Optional' })}
          {field('insuranceMemberId', 'Insurance Member ID', { placeholder: 'Optional' })}
          {field('medicalConditions', 'Medical Conditions', { textarea: true, placeholder: 'Optional' })}
          {field('currentMedications', 'Current Medications', { textarea: true, placeholder: 'Optional' })}
          {field('allergies', 'Allergies', { placeholder: 'Optional' })}
        </section>

        <section className="teen-intake-card">
          <h2>Therapy Information</h2>
          <div className="teen-field">
            <label>Has your child received therapy before?</label>
            <ChipSelect
              options={PREV_THERAPY}
              value={form.previousTherapy}
              onChange={(v) => set('previousTherapy', v)}
            />
          </div>
          {field('reasonForTherapy', 'Reason for Seeking Therapy', {
            textarea: true,
            rows: 4,
            placeholder: 'Briefly describe why you are seeking therapy (optional)',
          })}
        </section>

        <div className="teen-actions">
          <button type="button" className="btn" onClick={() => navigate('/teen/parent-guardian')}>
            Back
          </button>
          <button type="submit" className="btn primary">
            Continue to Consent
          </button>
        </div>
      </form>
    </TeenIntakeLayout>
  );
}
