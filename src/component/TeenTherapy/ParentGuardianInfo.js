import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAddressAutofill from '../../hooks/useAddressAutofill';
import { saveJson, TEEN_STORAGE_KEYS } from '../../utils/teenTherapyStorage';
import { beginTherapySession } from '../../utils/patientSessionIntent';
import TeenIntakeLayout from './TeenIntakeLayout';
import ChipSelect from './ChipSelect';
import './TeenTherapyIntake.css';

const RELATIONSHIPS = ['Parent', 'Legal Guardian', 'Foster Parent', 'Grandparent', 'Other'];

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  relationship: '',
  address: '',
  country: '',
  city: '',
  area: '',
  region: '',
  street: '',
  ghanaDigitalAddress: '',
  state: '',
  zipCode: '',
  latitude: null,
  longitude: null,
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
};

export default function ParentGuardianInfo() {
  const navigate = useNavigate();
  useEffect(() => {
    beginTherapySession('therapy');
  }, []);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Please enter a valid email address';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    else if (!/^[\d\s\-()]+$/.test(form.phone)) e.phone = 'Please enter a valid phone number';
    if (!form.relationship) e.relationship = 'Relationship is required';
    if (!form.address.trim()) e.address = 'Address is required';
    if (!form.city.trim()) e.city = 'City is required';
    if (!form.state.trim()) e.state = 'State is required';
    if (!form.zipCode.trim()) e.zipCode = 'Zip code is required';
    if (!form.emergencyContactName.trim()) e.emergencyContactName = 'Emergency contact name is required';
    if (!form.emergencyContactPhone.trim()) e.emergencyContactPhone = 'Emergency contact phone is required';
    if (!form.emergencyContactRelationship.trim()) {
      e.emergencyContactRelationship = 'Emergency contact relationship is required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    saveJson(TEEN_STORAGE_KEYS.parent, form);
    navigate('/teen/child');
  };

  const onLocate = () => {
    detectAddress((loc) => {
      setForm((prev) => ({
        ...prev,
        address: prev.address || loc.street || loc.address || '',
        country: prev.country || loc.countryCode || '',
        city: prev.city || loc.city || '',
        area: prev.area || loc.area || '',
        region: prev.region || loc.region || '',
        street: prev.street || loc.street || '',
        state: prev.state || loc.region || '',
        latitude: loc.latitude ?? prev.latitude ?? null,
        longitude: loc.longitude ?? prev.longitude ?? null,
      }));
    });
  };

  const field = (name, label, opts = {}) => (
    <div className="teen-field" key={name}>
      <label>
        {label}
        {opts.required ? <span className="req"> *</span> : null}
      </label>
      <input
        type={opts.type || 'text'}
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
        placeholder={opts.placeholder}
        className={errors[name] ? 'error' : ''}
        maxLength={opts.maxLength}
      />
      {errors[name] ? <p className="teen-field-error">{errors[name]}</p> : null}
    </div>
  );

  return (
    <TeenIntakeLayout
      step={1}
      title="Parent/Guardian Information"
      subtitle="We need some information about you to register your child for therapy services."
    >
      <form onSubmit={onSubmit}>
        <section className="teen-intake-card">
          <h2>Personal Information</h2>
          <div className="teen-form-row">
            {field('firstName', 'First Name', { required: true, placeholder: 'First name' })}
            {field('lastName', 'Last Name', { required: true, placeholder: 'Last name' })}
          </div>
          {field('email', 'Email', { required: true, type: 'email', placeholder: 'you@email.com' })}
          {field('phone', 'Phone Number', { required: true, placeholder: '(555) 123-4567' })}
          <div className="teen-field">
            <label>
              Relationship to Child <span className="req">*</span>
            </label>
            <ChipSelect
              options={RELATIONSHIPS}
              value={form.relationship}
              onChange={(v) => set('relationship', v)}
              error={errors.relationship}
            />
          </div>
        </section>

        <section className="teen-intake-card">
          <h2>Address</h2>
          <button type="button" className="teen-loc-btn" onClick={onLocate} disabled={locating}>
            {locating ? 'Detecting location…' : 'Use current location'}
          </button>
          {locationMsg ? <p className="teen-field-hint">{locationMsg}</p> : null}
          {field('address', 'Street Address', { required: true, placeholder: 'Street address' })}
          <div className="teen-form-row">
            {field('country', 'Country', { placeholder: 'e.g. GH' })}
            {field('area', 'Area / Locality', { placeholder: 'Area' })}
          </div>
          <div className="teen-form-row">
            {field('region', 'Region / State', { placeholder: 'Region' })}
            {field('street', 'Street', { placeholder: 'Street' })}
          </div>
          {field('ghanaDigitalAddress', 'Ghana Digital Address (optional)', { placeholder: 'e.g. GA-123-4567' })}
          <div className="teen-form-row">
            {field('city', 'City', { required: true, placeholder: 'City' })}
            {field('state', 'State', { required: true, placeholder: 'State' })}
          </div>
          {field('zipCode', 'Zip Code', { required: true, placeholder: '12345', maxLength: 10 })}
        </section>

        <section className="teen-intake-card">
          <h2>Emergency Contact</h2>
          <p className="section-hint">Please provide an emergency contact (other than yourself)</p>
          {field('emergencyContactName', 'Emergency Contact Name', { required: true })}
          {field('emergencyContactPhone', 'Emergency Contact Phone', { required: true })}
          {field('emergencyContactRelationship', 'Relationship', {
            required: true,
            placeholder: 'e.g., Spouse, Sibling, Friend',
          })}
        </section>

        <div className="teen-actions">
          <button type="submit" className="btn primary">
            Continue to Child Information
          </button>
        </div>
      </form>
    </TeenIntakeLayout>
  );
}
