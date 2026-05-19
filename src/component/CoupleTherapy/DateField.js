import React from 'react';
import { calculateAgeFromDob } from '../../services/coupleTherapyService';

function toInputDateValue(val) {
  if (!val) return '';
  const s = String(val).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

const todayIso = () => new Date().toISOString().split('T')[0];

export default function DateField({ field, form, errors, onChange, showAge }) {
  const err = errors[field.name];
  const value = toInputDateValue(form[field.name]);
  const max = field.maxDate === 'today' || field.maxDate === undefined ? todayIso() : field.maxDate;
  const min = field.minDate || (showAge ? '1900-01-01' : undefined);

  const handleChange = (e) => {
    const nextVal = e.target.value;
    if (showAge) {
      onChange({
        ...form,
        [field.name]: nextVal,
        age: calculateAgeFromDob(nextVal),
      });
    } else {
      onChange({ ...form, [field.name]: nextVal });
    }
  };

  return (
    <div className="teen-intake-field">
      <label className="teen-intake-label" htmlFor={field.name}>
        {field.label}
        {field.required ? <span className="teen-intake-req"> *</span> : null}
      </label>
      <input
        id={field.name}
        type="date"
        className={`teen-intake-input teen-intake-date${err ? ' teen-intake-input-error' : ''}`}
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
      />
      {showAge && form.age ? <p className="teen-intake-hint">Age: {form.age}</p> : null}
      {err ? <p className="teen-field-error">{err}</p> : null}
    </div>
  );
}
