import React from 'react';
import { nessaHubPolicyUrl } from '../../constants/nessaHubPolicies';
import ChipSelect from './ChipSelect';
import DateField from './DateField';
import './CoupleTherapyIntake.css';

function shouldShowField(field, form) {
  if (field.name === 'previousCoupleOutcome' && form.previousCoupleCounselling !== 'Yes') {
    return false;
  }
  if (field.name === 'treatmentObjectivesOther') {
    const selected = form.treatmentObjectives || [];
    return Array.isArray(selected) && selected.some((v) => /other/i.test(v));
  }
  if (field.name === 'infidelityWho' && form.infidelity === 'No') {
    return false;
  }
  return true;
}

function fieldConfig(field, form, section) {
  if (section?.id === 'personal' && field.name === 'email' && form.email) {
    return { ...field, readOnly: true };
  }
  return field;
}

export default function CoupleSectionForm({ section, form, errors, onChange }) {
  const set = (name, val) => onChange({ ...form, [name]: val });

  const renderField = (field) => {
    if (!shouldShowField(field, form)) return null;

    const f = fieldConfig(field, form, section);
    const err = errors[f.name];

    if (f.type === 'consent_check') {
      const policyHref = f.policySlug ? nessaHubPolicyUrl(f.policySlug) : null;
      return (
        <div key={f.name} className="teen-intake-consent-row">
          <label className="teen-intake-consent-main">
            <input
              type="checkbox"
              checked={!!form[f.name]}
              onChange={(e) => set(f.name, e.target.checked)}
            />
            <span>
              <strong>{f.label}</strong>
              {f.description ? <small>{f.description}</small> : null}
            </span>
          </label>
          {policyHref ? (
            <a
              className="teen-intake-consent-link"
              href={policyHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Read full ${f.label} policy`}
              title="Read full policy"
            >
              →
            </a>
          ) : null}
        </div>
      );
    }

    if (f.type === 'signature') {
      return (
        <div key={f.name} className="teen-intake-field">
          <label className="teen-intake-label" htmlFor={f.name}>
            {f.label}
            {f.required ? <span className="teen-intake-req"> *</span> : null}
          </label>
          <input
            id={f.name}
            className={`teen-intake-input${err ? ' teen-intake-input-error' : ''}`}
            value={String(form[f.name] ?? '')}
            onChange={(e) => set(f.name, e.target.value)}
            placeholder="Type your full legal name"
            autoComplete="name"
          />
          {err ? <p className="teen-field-error">{err}</p> : null}
        </div>
      );
    }

    if (f.type === 'birthdate') {
      return (
        <DateField
          key={f.name}
          field={f}
          form={form}
          errors={errors}
          onChange={onChange}
          showAge
        />
      );
    }

    if (f.type === 'date') {
      return (
        <DateField
          key={f.name}
          field={{ ...f, maxDate: 'today' }}
          form={form}
          errors={errors}
          onChange={onChange}
          showAge={false}
        />
      );
    }

    if (f.type === 'chips' || f.type === 'multiselect') {
      return (
        <div key={f.name} className="teen-intake-field">
          <label className="teen-intake-label">
            {f.label}
            {f.required ? <span className="teen-intake-req"> *</span> : null}
          </label>
          <ChipSelect
            options={f.options}
            value={form[f.name]}
            onChange={(v) => set(f.name, v)}
            multi={f.type === 'multiselect'}
          />
          {err ? <p className="teen-field-error">{err}</p> : null}
        </div>
      );
    }

    if (f.type === 'yesno') {
      return (
        <div key={f.name} className="teen-intake-field">
          <label className="teen-intake-label">{f.label}</label>
          <ChipSelect options={['Yes', 'No']} value={form[f.name]} onChange={(v) => set(f.name, v)} />
          {err ? <p className="teen-field-error">{err}</p> : null}
        </div>
      );
    }

    if (f.type === 'yesno_text') {
      const showText = form[f.name] === 'Yes';
      return (
        <div key={f.name} className="teen-intake-field">
          <label className="teen-intake-label">{f.label}</label>
          <ChipSelect options={['Yes', 'No']} value={form[f.name]} onChange={(v) => set(f.name, v)} />
          {showText && f.textKey ? (
            <textarea
              className="teen-intake-input teen-intake-textarea"
              value={form[f.textKey] || ''}
              onChange={(e) => set(f.textKey, e.target.value)}
              placeholder={f.textPlaceholder || 'Please describe'}
              rows={4}
            />
          ) : null}
          {err ? <p className="teen-field-error">{err}</p> : null}
        </div>
      );
    }

    if (f.type === 'scale') {
      const min = f.min ?? 1;
      const max = f.max ?? 10;
      const nums = Array.from({ length: max - min + 1 }, (_, i) => String(i + min));
      return (
        <div key={f.name} className="teen-intake-field">
          <label className="teen-intake-label">
            {f.label}
            {f.required ? <span className="teen-intake-req"> *</span> : null}
          </label>
          <ChipSelect
            options={nums}
            value={String(form[f.name] ?? '')}
            onChange={(v) => set(f.name, Number(v))}
          />
          {err ? <p className="teen-field-error">{err}</p> : null}
        </div>
      );
    }

    if (f.readOnly) {
      return (
        <div key={f.name} className="teen-intake-field">
          <label className="teen-intake-label">{f.label}</label>
          <p className="teen-intake-readonly">{form[f.name] || '—'}</p>
        </div>
      );
    }

    const isArea = f.type === 'textarea';
    const Input = isArea ? 'textarea' : 'input';
    return (
      <div key={f.name} className="teen-intake-field">
        <label className="teen-intake-label">
          {f.label}
          {f.required ? <span className="teen-intake-req"> *</span> : null}
        </label>
        <Input
          className={`teen-intake-input${isArea ? ' teen-intake-textarea' : ''}${err ? ' teen-intake-input-error' : ''}`}
          value={String(form[f.name] ?? '')}
          onChange={(e) =>
            set(f.name, f.type === 'number' ? e.target.value.replace(/\D/g, '') : e.target.value)
          }
          placeholder={f.placeholder}
          type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : 'text'}
          rows={isArea ? 4 : undefined}
          readOnly={f.readOnly || undefined}
        />
        {err ? <p className="teen-field-error">{err}</p> : null}
      </div>
    );
  };

  return (
    <div className="couple-section-form">
      <h2 className="teen-intake-section-title">{section.title}</h2>
      {section.subtitle ? <p className="teen-intake-section-sub">{section.subtitle}</p> : null}
      {section.policySlug ? (
        <p className="teen-intake-section-sub">
          <a
            className="couple-policy-read-link"
            href={nessaHubPolicyUrl(section.policySlug)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read confidential screening policy →
          </a>
        </p>
      ) : null}
      {section.therapistOnly ? (
        <div className="couple-private-banner">Therapist-only — not shared with your partner</div>
      ) : null}
      {section.fields.map(renderField)}
    </div>
  );
}
