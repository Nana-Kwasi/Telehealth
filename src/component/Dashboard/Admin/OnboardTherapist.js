import React, { useState, useRef, useEffect } from 'react';
import { db, auth, storage } from '../../../services/firestoreShim';
import { initializeApp, getApps } from '../../../services/authShim';
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from '../../../services/authShim';
import { collection, doc, setDoc } from '../../../services/firestoreShim';
import { ref, uploadBytes, getDownloadURL } from '../../../services/firestoreShim';
import { UserPlus, Upload, X, Plus, RefreshCw } from 'lucide-react';
import './OnboardTherapist.css';
import useAddressAutofill from '../../../hooks/useAddressAutofill';
import { generateTemporaryPassword } from '../../../utils/temporaryPassword';
import { careCatalog } from '../../../services/careTransfers';
import { useLocation } from 'react-router-dom';
import { api } from '../../../services/apiClient';

const firebaseConfig = {
  apiKey: 'AIzaSyDHQSUvAww2Z0MMnNJcLyfiEDRgZB_aSpI',
  authDomain: 'teleehealth.firebaseapp.com',
  projectId: 'teleehealth',
  storageBucket: 'teleehealth.firebasestorage.app',
  messagingSenderId: '304333934237',
  appId: '1:304333934237:web:c0a08969be0671d72d0e74',
};

function getTherapistCreatorAuth() {
  const existing = getApps().find((a) => a.name === 'therapist-creator');
  const app = existing || initializeApp(firebaseConfig, 'therapist-creator');
  return getAuth(app);
}

const emptyForm = () => ({
    name: '',
    type: '',
    username: '',
    email: '',
    phone: '',
    password: generateTemporaryPassword(),
    role: 'user',
    specialties: '',
    // Matching fields: chosen from fixed lists, so clients can be matched on them.
    careFormats: [],
    focusAreas: [],
    gender: '',
    lgbtqiaAffirming: '',
    religion: '',
    licenseNumber: '',
    licensingAuthority: '',
    licenseIssueDate: '',
    licenseExpiryDate: '',
    licenseFile: null,
    yearsExperience: '',
    languagesSpoken: '',
    ageGroupsServed: [],
    practiceName: '',
    practiceAddress: '',
    country: '',
    city: '',
    area: '',
    region: '',
    street: '',
    ghanaDigitalAddress: '',
    latitude: null,
    longitude: null,
    consultationMode: '',
    availability: '',
    sessionDuration: '',
    consultationFee: '',
    bio: '',
    education: '',
    workExperience: '',
    therapyApproaches: '',
    photoURL: '',
});

/** The server's onboarding rules (ProviderProfileRules), run before anything is created. */
export function validateTherapistForm(f, catalog) {
  const p = [];
  const need = (v, label) => { if (!v || !String(v).trim()) p.push(`${label} is required`); };
  need(f.name, 'Full name');
  need(f.username, 'Username');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) p.push('A valid email is required');
  if (String(f.phone || '').replace(/\D/g, '').length < 9) p.push('A valid phone number is required');
  if (catalog && !catalog.therapistProfessionalTypes.includes(f.type)) p.push('Choose a professional type from the list');
  if (!f.careFormats.length) p.push('Choose at least one kind of client they see');
  if (!f.focusAreas.length) p.push('Choose at least one area of focus');
  if (!f.gender) p.push('Gender is required');
  if (!f.lgbtqiaAffirming) p.push('Say whether they are LGBTQ+ affirming');
  if (!f.ageGroupsServed.length) p.push('Choose the age groups they serve');
  if (f.careFormats.includes('teen') && !f.ageGroupsServed.includes('Adolescents')) p.push('A therapist who sees teens must serve the Adolescents age group');
  need(f.languagesSpoken, 'Languages spoken');
  need(f.licenseNumber, 'License / registration number');
  need(f.licensingAuthority, 'Licensing authority');
  need(f.licenseIssueDate, 'License issue date');
  need(f.licenseExpiryDate, 'License expiry date');
  if (f.licenseIssueDate && f.licenseExpiryDate && f.licenseExpiryDate <= f.licenseIssueDate) p.push('License expiry must be after the issue date');
  if (f.licenseExpiryDate && new Date(f.licenseExpiryDate) < new Date(new Date().toDateString())) p.push('The license has expired');
  const years = Number(f.yearsExperience);
  if (f.yearsExperience === '' || !Number.isFinite(years) || years < 0 || years > 70) p.push('Years of experience must be between 0 and 70');
  if (!['Online', 'In-person', 'Both'].includes(f.consultationMode)) p.push('Choose a consultation mode');
  need(f.availability, 'Availability');
  need(f.sessionDuration, 'Session duration');
  if (!(Number(f.consultationFee) >= 1)) p.push('Consultation fee must be at least 1');
  need(f.bio, 'Short biography');
  need(f.education, 'Education');
  need(f.workExperience, 'Previous work experience');
  need(f.therapyApproaches, 'Therapy approaches');
  return p;
}

export default function OnboardTherapist() {
  const [form, setForm] = useState(emptyForm);
  const [catalog, setCatalog] = useState(null);
  useEffect(() => { careCatalog().then(setCatalog).catch(() => setCatalog(null)); }, []);
  // Opened from an approved provider application: pre-fill from it, and record
  // the new account on the application once created.
  const application = useLocation().state?.application || null;
  useEffect(() => {
    if (!application || application.type !== 'THERAPIST' || !catalog) return;
    const d = application.details || {};
    const keysFor = (labels, options) => (labels || [])
      .map((l) => (options || []).find((o) => o.label === l)?.value).filter(Boolean);
    setForm((f) => ({
      ...f,
      name: d.fullName || f.name,
      type: d.professionalType || f.type,
      email: application.email || f.email,
      phone: application.phone || f.phone,
      careFormats: keysFor(d.careFormats, catalog.careFormats),
      focusAreas: keysFor(d.focusAreas, catalog.therapyFocus),
      gender: d.gender || f.gender,
      lgbtqiaAffirming: d.lgbtqAffirming === 'Yes' ? 'yes' : d.lgbtqAffirming === 'No' ? 'no' : f.lgbtqiaAffirming,
      licenseNumber: d.licenceNumber || f.licenseNumber,
      licensingAuthority: d.regulator === 'Other' ? (d.regulatorOther || '') : (d.regulator || f.licensingAuthority),
      licenseExpiryDate: d.licenceExpiry || f.licenseExpiryDate,
      yearsExperience: d.yearsExperience || f.yearsExperience,
      languagesSpoken: Array.isArray(d.languages) ? d.languages.join(', ') : f.languagesSpoken,
      ageGroupsServed: Array.isArray(d.ageGroups) ? d.ageGroups : f.ageGroupsServed,
      consultationFee: d.proposedFee || f.consultationFee,
      therapyApproaches: d.approaches || f.therapyApproaches,
      bio: d.bio || f.bio,
      city: d.city || f.city,
      region: d.region || f.region,
      street: d.address || f.street,
      ghanaDigitalAddress: d.digitalAddress || f.ghanaDigitalAddress,
    }));
  }, [application, catalog]);
  const [credentials, setCredentials] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [educationCertificates, setEducationCertificates] = useState([]);
  const [cvFile, setCvFile] = useState(null);
  const [cvPreview, setCvPreview] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();
  const fileInputRef = useRef(null);
  const educationFileInputRef = useRef(null);
  const cvFileInputRef = useRef(null);

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const regeneratePassword = () => onChange('password', generateTemporaryPassword());

  const copyCredentials = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  // Every field matching reads is required. The same rules run on the server;
  // they are checked here first because the login is created before the profile
  // is saved, and a rejected profile would leave a login with no profile.
  const problems = () => validateTherapistForm(form, catalog);
  const [showProblems, setShowProblems] = useState(false);

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }

      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview('');
    setForm(prev => ({ ...prev, photoURL: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEducationCertificateUpload = (event) => {
    const files = Array.from(event.target.files);
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/') && !file.type.includes('pdf')) {
        alert('Please select image or PDF files only');
        return false;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert('File size should be less than 10MB');
        return false;
      }
      return true;
    });

    setEducationCertificates(prev => [...prev, ...validFiles]);
    if (educationFileInputRef.current) {
      educationFileInputRef.current.value = '';
    }
  };

  const removeEducationCertificate = (index) => {
    setEducationCertificates(prev => prev.filter((_, i) => i !== index));
  };

  const handleCvUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (!file.type.includes('pdf') && !file.type.includes('doc') && !file.type.includes('docx')) {
        alert('Please select a PDF or Word document');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert('File size should be less than 10MB');
        return;
      }
      setCvFile(file);
      setCvPreview(file.name);
    }
  };

  const removeCv = () => {
    setCvFile(null);
    setCvPreview('');
    if (cvFileInputRef.current) {
      cvFileInputRef.current.value = '';
    }
  };

  const uploadImageToStorage = async (file, uid) => {
    const storageRef = ref(storage, `therapist-profiles/${uid}/${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const issues = problems();
    if (issues.length) {
      setShowProblems(true);
      setSubmitError(`Please complete the profile before onboarding: ${issues.length} item${issues.length === 1 ? '' : 's'} below.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);

    const tempPassword = form.password?.trim() || generateTemporaryPassword();

    try {
      // Secondary Auth app so the onboarding admin stays signed in
      const secAuth = getTherapistCreatorAuth();
      const cred = await createUserWithEmailAndPassword(secAuth, form.email.trim(), tempPassword, (form.name || '').trim());
      const uid = cred.user.uid;
      await fbSignOut(secAuth);
      
      let photoURL = '';
      
      // Upload image if selected
      if (selectedImage) {
        photoURL = await uploadImageToStorage(selectedImage, uid);
      }
      
      const payload = {
        uid,
        name: form.name,
        type: form.type,
        professionalType: form.type,
        careFormats: form.careFormats,
        // Older screens and the therapist list filter read `therapyType`.
        therapyType: form.careFormats,
        focusAreas: form.focusAreas,
        gender: form.gender,
        lgbtqiaAffirming: form.lgbtqiaAffirming === 'yes',
        religion: form.religion || null,
        username: form.username,
        email: form.email,
        phone: form.phone,
        role: form.role,
        // Display labels of the chosen focus areas, plus any extra the admin typed.
        specialties: [
          ...form.focusAreas.map((k) => (catalog?.therapyFocus || []).find((f) => f.value === k)?.label || k),
          ...form.specialties.split(',').map((s) => s.trim()).filter(Boolean),
        ],
        licenseNumber: form.licenseNumber,
        licensingAuthority: form.licensingAuthority,
        licenseIssueDate: form.licenseIssueDate,
        licenseExpiryDate: form.licenseExpiryDate,
        yearsExperience: Number(form.yearsExperience || 0),
        languagesSpoken: form.languagesSpoken.split(',').map((s) => s.trim()).filter(Boolean),
        ageGroupsServed: form.ageGroupsServed,
        practiceName: form.practiceName,
        practiceAddress: form.practiceAddress,
        country: form.country || null,
        city: form.city || null,
        area: form.area || null,
        region: form.region || null,
        street: form.street || null,
        ghanaDigitalAddress: form.ghanaDigitalAddress || null,
        latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
        longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        locationMeta: {
          country: form.country || null,
          city: form.city || null,
          area: form.area || null,
          region: form.region || null,
          street: form.street || null,
          latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
          longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        },
        consultationMode: form.consultationMode,
        availability: form.availability,
        sessionDuration: Number(form.sessionDuration || 60),
        consultationFee: Number(form.consultationFee || 0),
        bio: form.bio,
        education: form.education,
        workExperience: form.workExperience,
        therapyApproaches: form.therapyApproaches.split(',').map((s) => s.trim()).filter(Boolean),
        photoURL: photoURL,
        mustChangePassword: true,
        passwordResetIssuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || null,
      };

      await setDoc(doc(db, 'therapists', uid), payload);
      await setDoc(doc(collection(db, 'therapists_usernames'), form.username), { uid });

      if (application?.id) {
        // Close the application: the applicant is emailed that their account is ready.
        api(`/api/v1/admin/applications/${application.id}/account-created`, { method: 'POST', body: { userId: uid, email: form.email.trim() } })
          .catch((e) => setSubmitError(`Account created, but application ${application.code} could not be updated: ${e.message}. Record it from Provider Applications.`));
      }
      setCredentials({
        name: form.name.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        tempPassword,
        role: form.role,
      });
      setForm(emptyForm());
      setSelectedImage(null);
      setImagePreview('');
      setEducationCertificates([]);
      setCvFile(null);
      setCvPreview('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (educationFileInputRef.current) educationFileInputRef.current.value = '';
      if (cvFileInputRef.current) cvFileInputRef.current.value = '';
    } catch (error) {
      console.error('Error onboarding therapist:', error);
      if (error.code === 'auth/email-already-in-use') {
        setSubmitError('An account with this email already exists.');
      } else {
        setSubmitError(error.message || 'Failed to onboard therapist. Please try again.');
        // The login exists but the profile was refused: say so plainly.
        if (/incomplete/i.test(error.message || '')) {
          setSubmitError(`${error.message} The login for ${form.email} was created; complete the fields and submit again, or finish the profile from User Management.`);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboard-therapist">
      <div className="onboard-header">
        <h1 className="page-title">Onboard New Therapist</h1>
        <p className="subtitle">
          A temporary password is generated automatically. The therapist must change it on first login.
        </p>
      </div>

      {credentials ? (
        <div className="onboard-credentials-card">
          <h2 className="onboard-credentials-title">Therapist created: {credentials.name}</h2>
          <p className="onboard-credentials-hint">
            Share these credentials securely. They will be prompted to set a new password when they sign in.
          </p>
          <div className="onboard-credential-box">
            <p>Login credentials</p>
            <div className="onboard-credential-row">
              <span>Email</span>
              <strong>{credentials.email}</strong>
            </div>
            <div className="onboard-credential-row">
              <span>Username</span>
              <strong>{credentials.username}</strong>
            </div>
            <div className="onboard-credential-row">
              <span>Temporary password</span>
              <strong>{credentials.tempPassword}</strong>
            </div>
            <div className="onboard-credential-row">
              <span>Role</span>
              <strong>{credentials.role === 'admin' ? 'Admin therapist' : 'Therapist'}</strong>
            </div>
          </div>
          <div className="onboard-credentials-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                copyCredentials(
                  `Email: ${credentials.email}\nUsername: ${credentials.username}\nTemporary password: ${credentials.tempPassword}`,
                )
              }
            >
              Copy all
            </button>
            <button type="button" className="btn-primary" onClick={() => setCredentials(null)}>
              Onboard another
            </button>
          </div>
        </div>
      ) : (
      <form className="onboard-form" onSubmit={submit}>
        {submitError ? <div className="onboard-error-banner">{submitError}</div> : null}
        {showProblems && problems().length > 0 ? (
          <div className="onboard-error-banner" role="alert">
            <ul style={{ margin: 0, paddingLeft: 18 }}>{problems().map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ) : null}
        <div className="form-sections">
          {/* Basic Information */}
          <div className="form-section">
            <h3 style={{ color: 'white' }}>Basic Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="name">Full Name *</label>
                <input
                  id="name"
                  type="text"
                  className="form-input"
                  value={form.name}
                  onChange={(e) => onChange('name', e.target.value)}
                  required
                  placeholder="Enter full name"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="type">Professional Type *</label>
                <select
                  id="type"
                  className="form-select"
                  value={form.type}
                  onChange={(e) => onChange('type', e.target.value)}
                  required
                >
                  <option value="">Select professional type</option>
                  {(catalog?.therapistProfessionalTypes || []).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="username">Username *</label>
                <input
                  id="username"
                  type="text"
                  className="form-input"
                  value={form.username}
                  onChange={(e) => onChange('username', e.target.value)}
                  required
                  placeholder="Choose a username"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={(e) => onChange('email', e.target.value)}
                  required
                  placeholder="Enter email address"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="phone">Phone Number *</label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input"
                  value={form.phone}
                  onChange={(e) => onChange('phone', e.target.value)}
                  required
                  placeholder="Enter phone number"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password">Temporary password (auto-generated)</label>
                <div className="onboard-password-row">
                  <input
                    id="password"
                    type="text"
                    className="form-input onboard-password-input"
                    value={form.password}
                    readOnly
                    aria-readonly="true"
                  />
                  <button
                    type="button"
                    className="btn-secondary onboard-regen-btn"
                    onClick={regeneratePassword}
                    title="Generate new temporary password"
                  >
                    <RefreshCw size={16} />
                    Regenerate
                  </button>
                </div>
                <p className="onboard-field-hint">Therapist must change this password on first login.</p>
              </div>
              
              <div className="form-group">
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  className="form-select"
                  value={form.role}
                  onChange={(e) => onChange('role', e.target.value)}
                >
                  <option value="user">Therapist</option>
                  <option value="admin">Admin therapist</option>
                </select>
              </div>
            </div>
          </div>

          {/* Professional Credentials */}
          <div className="form-section">
            <h3 style={{ color: 'white' }}>Professional Credentials</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="licenseNumber">License / Registration Number *</label>
                <input
                  id="licenseNumber"
                  type="text"
                  className="form-input"
                  value={form.licenseNumber}
                  onChange={(e) => onChange('licenseNumber', e.target.value)}
                  required
                  placeholder="Enter license number"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="licensingAuthority">Licensing Authority / Board *</label>
                <input
                  id="licensingAuthority"
                  type="text"
                  className="form-input"
                  value={form.licensingAuthority}
                  onChange={(e) => onChange('licensingAuthority', e.target.value)}
                  required
                  placeholder="e.g., State Psychology Board"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="licenseIssueDate">License Issue Date *</label>
                <input
                  id="licenseIssueDate"
                  type="date"
                  className="form-input"
                  value={form.licenseIssueDate}
                  onChange={(e) => onChange('licenseIssueDate', e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="licenseExpiryDate">License Expiry Date *</label>
                <input
                  id="licenseExpiryDate"
                  type="date"
                  className="form-input"
                  value={form.licenseExpiryDate}
                  onChange={(e) => onChange('licenseExpiryDate', e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="yearsExperience">Years of Experience *</label>
                <input
                  id="yearsExperience"
                  type="number"
                  min="0"
                  className="form-input"
                  value={form.yearsExperience}
                  onChange={(e) => onChange('yearsExperience', e.target.value)}
                  required
                  placeholder="Number of years"
                />
              </div>
              
              <div className="form-group">
                <label>Kinds of clients they see *</label>
                <div className="checkbox-group">
                  {(catalog?.careFormats || []).map((f) => (
                    <label key={f.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.careFormats.includes(f.value)}
                        onChange={(e) => onChange('careFormats', e.target.checked
                          ? [...form.careFormats, f.value]
                          : form.careFormats.filter((x) => x !== f.value))}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
                <small style={{ color: '#94a3b8' }}>Clients only see therapists who serve the kind of therapy they chose.</small>
              </div>

              <div className="form-group">
                <label>Areas of focus *</label>
                <div className="checkbox-group">
                  {(catalog?.therapyFocus || []).map((f) => (
                    <label key={f.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.focusAreas.includes(f.value)}
                        onChange={(e) => onChange('focusAreas', e.target.checked
                          ? [...form.focusAreas, f.value]
                          : form.focusAreas.filter((x) => x !== f.value))}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
                <small style={{ color: '#94a3b8' }}>Matched against what the client says they need help with.</small>
              </div>

              <div className="form-group">
                <label htmlFor="specialties">Other specializations (optional)</label>
                <input
                  id="specialties"
                  type="text"
                  className="form-input"
                  value={form.specialties}
                  onChange={(e) => onChange('specialties', e.target.value)}
                  placeholder="Anything not in the list above, comma separated"
                />
              </div>

              <div className="form-group">
                <label htmlFor="gender">Gender *</label>
                <select id="gender" className="form-select" value={form.gender} onChange={(e) => onChange('gender', e.target.value)} required>
                  <option value="">Select gender</option>
                  {(catalog?.genders || []).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <small style={{ color: '#94a3b8' }}>Clients can ask for a therapist of a particular gender.</small>
              </div>

              <div className="form-group">
                <label htmlFor="lgbtqiaAffirming">LGBTQ+ affirming practice *</label>
                <select id="lgbtqiaAffirming" className="form-select" value={form.lgbtqiaAffirming} onChange={(e) => onChange('lgbtqiaAffirming', e.target.value)} required>
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="religion">Faith (optional)</label>
                <select id="religion" className="form-select" value={form.religion} onChange={(e) => onChange('religion', e.target.value)}>
                  <option value="">Prefer not to say</option>
                  {['Christianity', 'Islam', 'Judaism', 'Hinduism', 'Buddhism', 'Other'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <small style={{ color: '#94a3b8' }}>Used only when a client asks for a Christian therapist.</small>
              </div>
              
              <div className="form-group">
                <label htmlFor="languagesSpoken">Languages Spoken *</label>
                <input
                  id="languagesSpoken"
                  type="text"
                  className="form-input"
                  value={form.languagesSpoken}
                  onChange={(e) => onChange('languagesSpoken', e.target.value)}
                  required
                  placeholder="e.g., English, Spanish, French (comma separated)"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="ageGroupsServed">Age Groups Served *</label>
                <div className="checkbox-group">
                  {['Children', 'Adolescents', 'Adults', 'Elderly'].map(ageGroup => (
                    <label key={ageGroup} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.ageGroupsServed.includes(ageGroup)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onChange('ageGroupsServed', [...form.ageGroupsServed, ageGroup]);
                          } else {
                            onChange('ageGroupsServed', form.ageGroupsServed.filter(ag => ag !== ageGroup));
                          }
                        }}
                      />
                      {ageGroup}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Practice Details */}
          <div className="form-section">
            <h3 style={{ color: 'white' }}>Practice Details</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="practiceName">Practice / Clinic Name</label>
                <input
                  id="practiceName"
                  type="text"
                  className="form-input"
                  value={form.practiceName}
                  onChange={(e) => onChange('practiceName', e.target.value)}
                  placeholder="Enter practice or clinic name"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="practiceAddress">Practice Address / Location</label>
                <textarea
                  id="practiceAddress"
                  className="form-textarea"
                  value={form.practiceAddress}
                  onChange={(e) => onChange('practiceAddress', e.target.value)}
                  placeholder="Enter practice address"
                  rows={3}
                />
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => detectAddress((loc) => {
                      onChange('practiceAddress', loc.address || form.practiceAddress);
                      onChange('country', loc.countryCode || form.country);
                      onChange('city', loc.city || form.city);
                      onChange('area', loc.area || form.area);
                      onChange('region', loc.region || form.region);
                      onChange('street', loc.street || form.street);
                      onChange('latitude', loc.latitude ?? form.latitude);
                      onChange('longitude', loc.longitude ?? form.longitude);
                    })}
                  >
                    {locating ? 'Detecting…' : 'Use current location'}
                  </button>
                  {locationMsg ? <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{locationMsg}</span> : null}
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="city">City</label>
                <input id="city" type="text" className="form-input" value={form.city} onChange={(e) => onChange('city', e.target.value)} placeholder="e.g. Accra" />
              </div>
              <div className="form-group">
                <label htmlFor="area">Area / Locality</label>
                <input id="area" type="text" className="form-input" value={form.area} onChange={(e) => onChange('area', e.target.value)} placeholder="e.g. East Legon" />
              </div>
              <div className="form-group">
                <label htmlFor="region">Region / State</label>
                <input id="region" type="text" className="form-input" value={form.region} onChange={(e) => onChange('region', e.target.value)} placeholder="e.g. Greater Accra" />
              </div>
              <div className="form-group">
                <label htmlFor="street">Street</label>
                <input id="street" type="text" className="form-input" value={form.street} onChange={(e) => onChange('street', e.target.value)} placeholder="e.g. Liberation Road" />
              </div>
              <div className="form-group">
                <label htmlFor="ghanaDigitalAddress">Ghana Digital Address (optional)</label>
                <input id="ghanaDigitalAddress" type="text" className="form-input" value={form.ghanaDigitalAddress} onChange={(e) => onChange('ghanaDigitalAddress', e.target.value)} placeholder="e.g. GA-123-4567" />
              </div>
              
              <div className="form-group">
                <label htmlFor="consultationMode">Consultation Mode *</label>
                <select
                  id="consultationMode"
                  className="form-select"
                  value={form.consultationMode}
                  onChange={(e) => onChange('consultationMode', e.target.value)}
                  required
                >
                  <option value="">Select consultation mode</option>
                  <option value="Online">Online</option>
                  <option value="In-person">In-person</option>
                  <option value="Both">Both (online and in-person)</option>
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="availability">Availability (days and time slots) *</label>
                <textarea
                  id="availability"
                  className="form-textarea"
                  value={form.availability}
                  onChange={(e) => onChange('availability', e.target.value)}
                  required
                  placeholder="e.g., Monday-Friday: 9AM-5PM, Saturday: 10AM-2PM"
                  rows={3}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="sessionDuration">Session Duration *</label>
                <select
                  id="sessionDuration"
                  className="form-select"
                  value={form.sessionDuration}
                  onChange={(e) => onChange('sessionDuration', e.target.value)}
                  required
                >
                  <option value="">Select session duration</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="consultationFee">Consultation Fee / Rate *</label>
                <input
                  id="consultationFee"
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={form.consultationFee}
                  onChange={(e) => onChange('consultationFee', e.target.value)}
                  required
                  placeholder="Enter fee per session"
                />
              </div>
            </div>
          </div>

          {/* Profile Image */}
          <div className="form-section">
            <h3 style={{ color: 'white' }}>Profile Picture</h3>
            <div className="image-upload-container">
              {imagePreview ? (
                <div className="image-preview">
                  <img src={imagePreview} alt="Profile preview" />
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={removeImage}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={32} />
                  <p>Click to upload profile image</p>
                  <span>JPG, PNG, GIF up to 5MB</span>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Background & Bio */}
          <div className="form-section">
            <h3 style={{ color: 'white' }}>Background & Bio</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="bio">Short Biography / Introduction *</label>
                <textarea
                  id="bio"
                  className="form-textarea"
                  value={form.bio}
                  onChange={(e) => onChange('bio', e.target.value)}
                  required
                  placeholder="Tell clients about your background, approach, and expertise..."
                  rows={4}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="education">Education *</label>
                <textarea
                  id="education"
                  className="form-textarea"
                  value={form.education}
                  onChange={(e) => onChange('education', e.target.value)}
                  required
                  placeholder="Degree, Institution, Year (e.g., PhD in Psychology, University of California, 2015)"
                  rows={3}
                />
                <div className="file-upload-section">
                  <button
                    type="button"
                    className="upload-cert-btn"
                    onClick={() => educationFileInputRef.current?.click()}
                  >
                    <Plus size={16} />
                    Upload Certificates
                  </button>
                  <input
                    ref={educationFileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    onChange={handleEducationCertificateUpload}
                    style={{ display: 'none' }}
                  />
                  {educationCertificates.length > 0 && (
                    <div className="uploaded-files">
                      {educationCertificates.map((file, index) => (
                        <div key={index} className="uploaded-file-item">
                          <span className="file-name">{file.name}</span>
                          <button
                            type="button"
                            className="remove-file-btn"
                            onClick={() => removeEducationCertificate(index)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="workExperience">Previous Work Experience *</label>
                <textarea
                  id="workExperience"
                  className="form-textarea"
                  value={form.workExperience}
                  onChange={(e) => onChange('workExperience', e.target.value)}
                  required
                  placeholder="Describe your previous work experience in the field..."
                  rows={3}
                />
                <div className="file-upload-section">
                  <button
                    type="button"
                    className="upload-cv-btn"
                    onClick={() => cvFileInputRef.current?.click()}
                  >
                    <Upload size={16} />
                    Upload CV
                  </button>
                  <input
                    ref={cvFileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleCvUpload}
                    style={{ display: 'none' }}
                  />
                  {cvPreview && (
                    <div className="uploaded-files">
                      <div className="uploaded-file-item">
                        <span className="file-name">{cvPreview}</span>
                        <button
                          type="button"
                          className="remove-file-btn"
                          onClick={removeCv}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="therapyApproaches">Therapy Approaches / Modalities Used *</label>
                <textarea
                  id="therapyApproaches"
                  className="form-textarea"
                  value={form.therapyApproaches}
                  onChange={(e) => onChange('therapyApproaches', e.target.value)}
                  required
                  placeholder="e.g., CBT, DBT, EMDR, Psychodynamic, Humanistic (comma separated)"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => window.history.back()}>
            Cancel
          </button>
          <button 
            type="submit" 
            className={`btn-primary ${problems().length ? 'disabled' : ''}`} 
            disabled={saving}
          >
            {saving ? 'Onboarding...' : 'Onboard Therapist'}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}


