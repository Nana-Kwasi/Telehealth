import React, { useState } from 'react';
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

export default function OnboardDoctor({ profile }) {
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '',
    specialization: '', licenseNumber: '', licensingAuthority: '',
    experience: '', consultationFee: '', location: '', country: '', city: '', area: '', region: '', street: '', latitude: null, longitude: null, ghanaDigitalAddress: '',
    bio: '', gender: '', languages: '',
    consultationTypes: { video: true, chat: false, inPerson: false },
    education: '', qualifications: '',
  });

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
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.specialization.trim()) {
      setErrorMsg('Please fill in all required fields: Name, Email, Password, and Specialization.');
      return;
    }
    if (form.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      // Create Firebase Auth account using secondary app — admin stays signed in
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
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
      <div className="doctor-page-header" style={{ background: 'linear-gradient(135deg, #1e6bb8 0%, #155a9c 100%)' }}>
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
        }}>
          {errorMsg}
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
            <label>Phone</label>
            <input className="doctor-form-input" placeholder="+1 (555) 000-0000" value={form.phone}
              onChange={e => handleChange('phone', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Gender</label>
            <select className="doctor-form-select" value={form.gender}
              onChange={e => handleChange('gender', e.target.value)}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
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
            <label>City</label>
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
              {['General Practice', 'Cardiology', 'Dermatology', 'Endocrinology', 'Gastroenterology',
                'Neurology', 'Oncology', 'Orthopedics', 'Pediatrics', 'Psychiatry', 'Pulmonology',
                'Radiology', 'Surgery', 'Urology', 'Other'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="doctor-form-group">
            <label>Years of Experience</label>
            <input className="doctor-form-input" type="number" min="0" value={form.experience}
              onChange={e => handleChange('experience', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>License Number</label>
            <input className="doctor-form-input" placeholder="Medical license number" value={form.licenseNumber}
              onChange={e => handleChange('licenseNumber', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Licensing Authority</label>
            <input className="doctor-form-input" placeholder="e.g., State Medical Board" value={form.licensingAuthority}
              onChange={e => handleChange('licensingAuthority', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Consultation Fee ($)</label>
            <input className="doctor-form-input" type="number" min="0" value={form.consultationFee}
              onChange={e => handleChange('consultationFee', e.target.value)} />
          </div>
          <div className="doctor-form-group">
            <label>Languages (comma-separated)</label>
            <input className="doctor-form-input" placeholder="English, Spanish" value={form.languages}
              onChange={e => handleChange('languages', e.target.value)} />
          </div>
        </div>

        <div className="doctor-form-group">
          <label>Consultation Types</label>
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
          <label>Education</label>
          <input className="doctor-form-input" placeholder="e.g., MD from Harvard Medical School" value={form.education}
            onChange={e => handleChange('education', e.target.value)} />
        </div>
        <div className="doctor-form-group">
          <label>Qualifications / Certifications</label>
          <input className="doctor-form-input" placeholder="e.g., Board Certified, FACC" value={form.qualifications}
            onChange={e => handleChange('qualifications', e.target.value)} />
        </div>
        <div className="doctor-form-group">
          <label>Bio</label>
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
