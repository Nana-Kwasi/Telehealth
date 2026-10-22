import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import { careCatalog } from '../../../services/careTransfers';
import { UserPlus, Save, Upload } from 'lucide-react';
import { db } from '../../../services/firestoreShim';
import { doc, setDoc, serverTimestamp } from '../../../services/firestoreShim';
import { initializeApp, getApps } from '../../../services/authShim';
import { getAuth, createUserWithEmailAndPassword } from '../../../services/authShim';
import { getStorage, ref, uploadBytes, getDownloadURL } from '../../../services/firestoreShim';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

// Secondary Firebase app — creates accounts WITHOUT signing out the current admin session
const _firebaseConfig = {
  apiKey: "AIzaSyDHQSUvAww2Z0MMnNJcLyfiEDRgZB_aSpI",
  authDomain: "teleehealth.firebaseapp.com",
  projectId: "teleehealth",
  storageBucket: "teleehealth.firebasestorage.app",
  messagingSenderId: "304333934237",
  appId: "1:304333934237:web:c0a08969be0671d72d0e74"
};
const secondaryApp = getApps().find(a => a.name === 'secondary') || initializeApp(_firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

/** The server's doctor onboarding rules (ProviderProfileRules), checked before anything is created. */
export function validateDoctorForm(f, catalog) {
  const p = [];
  const need = (v, label) => { if (!v || !String(v).trim()) p.push(`${label} is required`); };
  need(f.name, 'Full name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) p.push('A valid email is required');
  if (!f.password || f.password.length < 6) p.push('Password must be at least 6 characters');
  if (String(f.phone || '').replace(/\D/g, '').length < 9) p.push('A valid phone number is required');
  if (!f.gender) p.push('Gender is required');
  if (!f.city && !f.location) p.push('City is required');
  if (catalog ? !catalog.doctorSpecialties.includes(f.specialization) : !f.specialization) p.push('Choose a specialization from the list');
  const years = Number(f.experience);
  if (f.experience === '' || !Number.isFinite(years) || years < 0 || years > 70) p.push('Years of experience must be between 0 and 70');
  need(f.licenseNumber, 'License number');
  need(f.licensingAuthority, 'Licensing authority');
  if (!(Number(f.consultationFee) >= 1)) p.push('Consultation fee must be at least 1');
  need(f.languages, 'Languages');
  if (!Object.values(f.consultationTypes || {}).some(Boolean)) p.push('Choose at least one consultation type');
  need(f.education, 'Education');
  need(f.qualifications, 'Qualifications');
  need(f.bio, 'Bio');
  return p;
}

export default function OnboardDoctor({ profile }) {
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const [catalog, setCatalog] = useState(null);
  // Opened from an approved provider application: pre-fill from it, and record
  // the new account on the application once created.
  const application = useLocation().state?.application || null;
  useEffect(() => { careCatalog().then(setCatalog).catch(() => setCatalog(null)); }, []);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '',
    specialization: '', licenseNumber: '', licensingAuthority: '',
    experience: '', consultationFee: '', location: '', country: '', city: '', area: '', region: '', street: '', latitude: null, longitude: null, ghanaDigitalAddress: '',
    bio: '', gender: '', languages: '',
    consultationTypes: { video: true, chat: false, inPerson: false },
    education: '', qualifications: '',
  });

  useEffect(() => {
    if (!application || application.type !== 'DOCTOR') return;
    const d = application.details || {};
    setForm((f) => ({
      ...f,
      name: d.fullName || f.name,
      email: application.email || f.email,
      phone: application.phone || f.phone,
      specialization: d.specialty || f.specialization,
      licenseNumber: d.mdcNumber || f.licenseNumber,
      licensingAuthority: 'Medical and Dental Council',
      experience: d.yearsExperience || f.experience,
      consultationFee: d.proposedFee || f.consultationFee,
      gender: d.gender || f.gender,
      languages: Array.isArray(d.languages) ? d.languages.join(', ') : f.languages,
      consultationTypes: {
        video: (d.consultationTypes || []).includes('Video') || (d.consultationTypes || []).includes('Audio'),
        chat: (d.consultationTypes || []).includes('Chat'),
        inPerson: (d.consultationTypes || []).includes('In person'),
      },
      city: d.city || f.city,
      region: d.region || f.region,
      street: d.address || f.street,
      location: [d.address, d.city].filter(Boolean).join(', ') || f.location,
      ghanaDigitalAddress: d.digitalAddress || f.ghanaDigitalAddress,
      qualifications: d.specialistCertification || f.qualifications,
      bio: d.bio || f.bio,
    }));
  }, [application]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckbox = (key) => {
    setForm(prev => ({
      ...prev,
      consultationTypes: { ...prev.consultationTypes, [key]: !prev.consultationTypes[key] },
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    // The server refuses an incomplete doctor profile (patients are matched and
    // transfers reassigned from these fields). Check first: the login is
    // created before the profile, so a refused profile would leave a bare login.
    const issues = validateDoctorForm(form, catalog);
    if (issues.length) {
      setErrorMsg(issues);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      // Create Firebase Auth account using secondary app — admin stays signed in
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password, form.name.trim());
      const uid = userCred.user.uid;

      // Upload profile image if provided
      let profileImageUrl = '';
      if (profileImage) {
        const storage = getStorage();
        const imageRef = ref(storage, `doctors/${uid}/profile.jpg`);
        await uploadBytes(imageRef, profileImage);
        profileImageUrl = await getDownloadURL(imageRef);
      }

      // Create doctor document
      const doctorData = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        specialization: form.specialization.trim(),
        licenseNumber: form.licenseNumber.trim(),
        licensingAuthority: form.licensingAuthority.trim(),
        experience: form.experience ? Number(form.experience) : 0,
        consultationFee: form.consultationFee ? Number(form.consultationFee) : 0,
        location: form.location.trim(),
        country: form.country || null,
        city: form.city || null,
        area: form.area || null,
        region: form.region || null,
        street: form.street || null,
        ghanaDigitalAddress: form.ghanaDigitalAddress || null,
        latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
        longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        geo: {
          country: form.country || null,
          city: form.city || null,
          area: form.area || null,
          region: form.region || null,
          street: form.street || null,
          latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
          longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        },
        bio: form.bio.trim(),
        gender: form.gender,
        languages: form.languages.split(',').map(l => l.trim()).filter(Boolean),
        consultationTypes: form.consultationTypes,
        education: form.education.trim(),
        qualifications: form.qualifications.trim(),
        profileImageUrl: profileImageUrl,
        profileImage: profileImageUrl,
        role: 'doctor',
        verified: true,
        rating: 0,
        reviewCount: 0,
        createdAt: serverTimestamp(),
        onboardedBy: profile?.id || 'admin',
      };

      await setDoc(doc(db, 'doctors', uid), doctorData);

      // Reset form
      setForm({
        name: '', email: '', phone: '', password: '',
        specialization: '', licenseNumber: '', licensingAuthority: '',
        experience: '', consultationFee: '', location: '', country: '', city: '', area: '', region: '', street: '', latitude: null, longitude: null, ghanaDigitalAddress: '',
        bio: '', gender: '', languages: '',
        consultationTypes: { video: true, chat: false, inPerson: false },
        education: '', qualifications: '',
      });
      setProfileImage(null);
      setImagePreview(null);
      setSuccessMsg(`Dr. ${doctorData.name} has been successfully onboarded!`);
      if (application?.id) {
        // Close the application: the applicant is emailed that their account is ready.
        api(`/api/v1/admin/applications/${application.id}/account-created`, { method: 'POST', body: { userId: uid, email: form.email.trim() } })
          .then(() => setSuccessMsg(`Dr. ${doctorData.name} has been onboarded and application ${application.code} is closed.`))
          .catch((e) => setErrorMsg(`Account created, but the application could not be updated: ${e.message}. Record it from Provider Applications.`));
      }
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (error) {
      console.error('Error onboarding doctor:', error);
      if (error.code === 'auth/email-already-in-use') {
        setErrorMsg('This email is already registered.');
      } else {
        setErrorMsg('Error creating doctor account: ' + error.message);
      }
    } finally {
      setSaving(false);
      // Re-authenticate as admin if needed (the createUser call signs in the new user)
      // In production, use Admin SDK via Cloud Functions instead
    }
  };

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Onboard Medical Doctor</h1>
        <p>Register a new doctor on the platform</p>
      </div>

      {successMsg && (
        <div style={{
          background: '#dcfce7', color: '#166534', padding: '0.75rem 1rem',
          borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500,
        }}>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{
          background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem',
          borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500,
        }} role="alert">
          {Array.isArray(errorMsg) ? (
            <>
              Please complete the profile before onboarding:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{errorMsg.map((m) => <li key={m}>{m}</li>)}</ul>
            </>
          ) : errorMsg}
        </div>
      )}

      {/* Basic Information */}
      <div className="doctor-card">
        <h3>Basic Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="doctor-form-group">
            <label>Full Name *</label>
            <input className="doctor-form-input" placeholder="Dr. John Smith" value={form.name}
              onChange={e => handleChange('name', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Email *</label>
            <input className="doctor-form-input" type="email" placeholder="doctor@example.com" value={form.email}
              onChange={e => handleChange('email', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Password *</label>
            <input className="doctor-form-input" type="password" placeholder="Minimum 6 characters" value={form.password}
              onChange={e => handleChange('password', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Phone *</label>
            <input className="doctor-form-input" placeholder="+1 (555) 000-0000" value={form.phone}
              onChange={e => handleChange('phone', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Gender *</label>
            <select className="doctor-form-select" value={form.gender}
              onChange={e => handleChange('gender', e.target.value)}>
              <option value="">Select</option>
              {(catalog?.genders || ['Female', 'Male', 'Non-binary']).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="doctor-form-group">
            <label>Location</label>
            <input className="doctor-form-input" placeholder="City, State" value={form.location}
              onChange={e => handleChange('location', e.target.value)} />
            <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => detectAddress((loc) => {
                handleChange('location', loc.address || [loc.city, loc.country].filter(Boolean).join(', '));
                handleChange('country', loc.countryCode || form.country);
                handleChange('city', loc.city || form.city);
                handleChange('area', loc.area || form.area);
                handleChange('region', loc.region || form.region);
                handleChange('street', loc.street || form.street);
                handleChange('latitude', loc.latitude ?? form.latitude);
                handleChange('longitude', loc.longitude ?? form.longitude);
              })}>{locating ? 'Detecting…' : 'Use current location'}</button>
              {locationMsg ? <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{locationMsg}</span> : null}
            </div>
          </div>
          <div className="doctor-form-group">
            <label>City *</label>
            <input className="doctor-form-input" placeholder="e.g. Accra" value={form.city}
              onChange={e => handleChange('city', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Area / Locality</label>
            <input className="doctor-form-input" placeholder="e.g. East Legon" value={form.area}
              onChange={e => handleChange('area', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Region / State</label>
            <input className="doctor-form-input" placeholder="e.g. Greater Accra" value={form.region}
              onChange={e => handleChange('region', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Street</label>
            <input className="doctor-form-input" placeholder="e.g. Liberation Road" value={form.street}
              onChange={e => handleChange('street', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Latitude</label>
            <input className="doctor-form-input" placeholder="Auto-detected" value={form.latitude ?? ''}
              onChange={e => handleChange('latitude', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Longitude</label>
            <input className="doctor-form-input" placeholder="Auto-detected" value={form.longitude ?? ''}
              onChange={e => handleChange('longitude', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Ghana Digital Address (optional)</label>
            <input className="doctor-form-input" placeholder="e.g. GA-123-4567" value={form.ghanaDigitalAddress}
              onChange={e => handleChange('ghanaDigitalAddress', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Professional Details */}
      <div className="doctor-card">
        <h3>Professional Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="doctor-form-group">
            <label>Specialization *</label>
            <select className="doctor-form-select" value={form.specialization}
              onChange={e => handleChange('specialization', e.target.value)}>
              <option value="">Select specialization</option>
              {(catalog?.doctorSpecialties || []).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="doctor-form-group">
            <label>Years of Experience *</label>
            <input className="doctor-form-input" type="number" min="0" value={form.experience}
              onChange={e => handleChange('experience', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>License Number *</label>
            <input className="doctor-form-input" placeholder="Medical license number" value={form.licenseNumber}
              onChange={e => handleChange('licenseNumber', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Licensing Authority *</label>
            <input className="doctor-form-input" placeholder="e.g., State Medical Board" value={form.licensingAuthority}
              onChange={e => handleChange('licensingAuthority', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Consultation Fee (GHS) *</label>
            <input className="doctor-form-input" type="number" min="0" value={form.consultationFee}
              onChange={e => handleChange('consultationFee', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Languages (comma-separated) *</label>
            <input className="doctor-form-input" placeholder="English, Spanish" value={form.languages}
              onChange={e => handleChange('languages', e.target.value)} />
          </div>
        </div>

        <div className="doctor-form-group">
          <label>Consultation Types *</label>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
            {[['video', 'Video Call'], ['chat', 'Chat'], ['inPerson', 'In-Person']].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.consultationTypes[key] || false} onChange={() => handleCheckbox(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Education & Bio */}
      <div className="doctor-card">
        <h3>Education & Background</h3>
        <div className="doctor-form-group">
          <label>Education *</label>
          <input className="doctor-form-input" placeholder="e.g., MD from Harvard Medical School" value={form.education}
            onChange={e => handleChange('education', e.target.value)} />
        </div>
        <div className="doctor-form-group">
          <label>Qualifications / Certifications *</label>
          <input className="doctor-form-input" placeholder="e.g., Board Certified, FACC" value={form.qualifications}
            onChange={e => handleChange('qualifications', e.target.value)} />
        </div>
        <div className="doctor-form-group">
          <label>Bio *</label>
          <textarea className="doctor-form-textarea" rows={4} placeholder="Doctor's professional bio..."
            value={form.bio} onChange={e => handleChange('bio', e.target.value)} />
        </div>
      </div>

      {/* Profile Image */}
      <div className="doctor-card">
        <h3>Profile Image</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {imagePreview ? (
            <img src={imagePreview} alt="Preview" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: '50%', background: '#e8f1fb',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e6bb8',
            }}>
              <UserPlus size={28} />
            </div>
          )}
          <label className="doctor-btn doctor-btn-outline" style={{ cursor: 'pointer' }}>
            <Upload size={16} /> Upload Photo
            <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
        <button className="doctor-btn doctor-btn-primary" onClick={handleSubmit} disabled={saving}
          style={{ padding: '0.85rem 2rem', fontSize: '0.9rem' }}>
          <Save size={18} /> {saving ? 'Creating Account...' : 'Create Doctor Account'}
        </button>
      </div>
    </div>
  );
}
