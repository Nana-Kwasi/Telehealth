import React, { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Clock, 
  Shield, 
  Bell, 
  Palette, 
  Globe, 
  Eye, 
  Save, 
  Upload, 
  Download, 
  Settings as SettingsIcon,
  FileText,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  X,
  Plus,
  Edit,
  Trash2,
  EyeOff,
  Lock,
  Unlock,
  Database,
  Cloud,
  Smartphone,
  Monitor,
  Wifi,
  Zap,
  Award,
  Target,
  Users,
  MessageSquare,
  Video,
  BookOpen,
  DollarSign,
  FileCheck,
  ClipboardList,
  Star,
  Heart,
  Brain,
  Activity
} from 'lucide-react';
import {
  updateEmail,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  fetchSignInMethodsForEmail,
} from '../../../services/authShim';
import { auth, db, storage } from '../../../services/firestoreShim';
import { 
  collection, 
  doc, 
  getDoc, 
  updateDoc, 
  setDoc,
  onSnapshot,
  addDoc,
  deleteDoc,
  serverTimestamp 
} from '../../../services/firestoreShim';
import { ref, uploadBytes, getDownloadURL } from '../../../services/firestoreShim';
import './Settings.css';
import { uploadAvatar } from '../../../utils/profileImage';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

export default function TherapistSettings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({});
  // The form starts as all-empty strings and is only filled once the profile has
  // been read. Saving before that (or after a failed read) writes those blanks
  // over the stored profile — which is how a published session rate came back as
  // "Rate not published" on the client-facing therapist list.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');

  const currentUser = auth.currentUser;
  const loginEmail = currentUser?.email || '';

  // Form states
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    specialties: [],
    licenseNumber: '',
    yearsExperience: '',
    location: '',
    photoURL: '',
    country: '',
    city: '',
    area: '',
    region: '',
    street: '',
    ghanaDigitalAddress: '',
    latitude: null,
    longitude: null,
    availabilityStatus: 'available',
    sessionRate: '',
  });

  const [clinicalForm, setClinicalForm] = useState({
    appointmentTypes: [],
    sessionDurations: [],
    billingRates: {},
    insuranceAccepted: [],
    crisisProtocols: '',
    treatmentModalities: [],
    assessmentTools: [],
    noteTemplates: []
  });

  const [notificationForm, setNotificationForm] = useState({
    emailNotifications: true,
    smsNotifications: false,
    appointmentReminders: true,
    clientMessages: true,
    systemUpdates: true,
    crisisAlerts: true,
    reminderTime: '24'
  });

  const [systemForm, setSystemForm] = useState({
    theme: 'light',
    language: 'en',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    autoSave: true,
    backupFrequency: 'daily',
    dataRetention: '7years',
    hipaaCompliance: true,
    twoFactorAuth: false,
    sessionTimeout: '30'
  });

  // Fetch user profile and settings
  useEffect(() => {
    if (!currentUser) return;

    const fetchProfile = async () => {
      try {
        const profileDoc = await getDoc(doc(db, 'therapists', currentUser.uid));
        if (profileDoc.exists()) {
          const profileData = profileDoc.data();
          setProfileLoaded(true);
          setProfile(profileData);
          setProfileForm({
            name: profileData.name || '',
            email: profileData.email || currentUser.email || '',
            phone: profileData.phone || '',
            bio: profileData.bio || '',
            specialties: profileData.specialties || [],
            licenseNumber: profileData.licenseNumber || '',
            yearsExperience: profileData.yearsExperience || '',
            location: profileData.location || '',
            photoURL: profileData.photoURL || '',
            country: profileData.country || profileData.locationMeta?.country || '',
            city: profileData.city || profileData.locationMeta?.city || '',
            area: profileData.area || profileData.locationMeta?.area || '',
            region: profileData.region || profileData.locationMeta?.region || '',
            street: profileData.street || profileData.locationMeta?.street || '',
            ghanaDigitalAddress: profileData.ghanaDigitalAddress || '',
            latitude: profileData.latitude ?? profileData.locationMeta?.latitude ?? null,
            longitude: profileData.longitude ?? profileData.locationMeta?.longitude ?? null,
            availabilityStatus: profileData.availabilityStatus || 'available',
            sessionRate: profileData.sessionRate ?? '',
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      }
    };

    const fetchSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'therapistSettings', currentUser.uid));
        if (settingsDoc.exists()) {
          const settingsData = settingsDoc.data();
          setSettings(settingsData);
          setClinicalForm(settingsData.clinical || {});
          setNotificationForm(settingsData.notifications || {});
          setSystemForm(settingsData.system || {});
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    fetchProfile();
    fetchSettings();
  }, [currentUser]);

  useEffect(() => {
    if (!['profile', 'security', 'availability', 'notifications'].includes(activeTab)) setActiveTab('profile');
  }, [activeTab]);

  // Handle image upload
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }

    setSelectedImage(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const uploadImage = async () => {
    if (!selectedImage) return '';

    try {
      // Was a Firebase Storage upload; the app no longer runs on Firebase. The
      // picture is now saved on the user record — the therapist PATCH binds only
      // six fields and none is a photo, so sending `photoURL` there was silently
      // discarded and the image vanished on reload.
      return await uploadAvatar(selectedImage, currentUser?.uid);
    } catch (error) {
      console.error('Error uploading image:', error);
      // Surface it — returning '' quietly wiped the existing photo on save.
      throw error;
    }
  };

  const mapEmailChangeError = (err) => {
    const code = err?.code || '';
    console.error('saveLoginEmail:', code, err?.message, err);
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-login-credentials'
    ) {
      return 'Current password is incorrect.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'That email is already registered to another account. Pick a different email, or sign in with that account instead.';
    }
    if (code === 'auth/invalid-email') {
      return 'Enter a valid email address.';
    }
    if (code === 'auth/requires-recent-login') {
      return 'Session expired. Sign out, sign in again, then retry.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Email change is not allowed for this account. Contact support.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many attempts. Wait a few minutes and try again.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network error. Check your connection and try again.';
    }
    if (err?.message) {
      return err.message;
    }
    return 'Could not update email. Check your password and try again.';
  };

  const saveLoginEmail = async (e) => {
    e.preventDefault();
    setEmailErr('');
    setEmailMsg('');
    const next = newEmail.trim().toLowerCase();
    const cur = loginEmail?.trim().toLowerCase();
    if (!next || next === cur) {
      setEmailErr('Enter a new email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setEmailErr('Enter a valid email address.');
      return;
    }
    if (!emailPw) {
      setEmailErr('Enter your current password to confirm.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setEmailErr('You are not signed in. Please sign in again.');
      return;
    }

    const authEmail = (user.email || loginEmail || '').trim();
    if (!authEmail) {
      setEmailErr('This account has no login email in Authentication. Contact support.');
      return;
    }

    setEmailSaving(true);
    try {
      try {
        const existingMethods = await fetchSignInMethodsForEmail(auth, next);
        if (existingMethods?.length > 0) {
          setEmailErr(
            'That email is already registered to another account. Use a different email, or sign in with that account.',
          );
          return;
        }
      } catch (preflightErr) {
        console.warn('fetchSignInMethodsForEmail:', preflightErr);
      }

      const credential = EmailAuthProvider.credential(authEmail, emailPw);
      await reauthenticateWithCredential(user, credential);

      try {
        await updateEmail(user, next);
      } catch (updateErr) {
        if (
          updateErr?.code === 'auth/operation-not-allowed' ||
          updateErr?.code === 'auth/unverified-email'
        ) {
          await verifyBeforeUpdateEmail(user, next);
          setEmailMsg(
            `Verification link sent to ${next}. Open that email and confirm the change, then sign in again.`,
          );
          setEmailPw('');
          setNewEmail('');
          return;
        }
        throw updateErr;
      }

      await updateDoc(doc(db, 'therapists', user.uid), {
        email: next,
        updatedAt: serverTimestamp(),
      });
      setProfileForm((prev) => ({ ...prev, email: next }));
      setProfile((prev) => ({ ...prev, email: next }));
      setEmailMsg('Login email updated. Refreshing…');
      setEmailPw('');
      setNewEmail('');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setEmailErr(mapEmailChangeError(err));
    } finally {
      setEmailSaving(false);
    }
  };

  // Save profile
  const handleSaveProfile = async () => {
    if (!profileLoaded) {
      setSaveMessage('Still loading your profile — please wait before saving.');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }
    setIsLoading(true);
    setSaveMessage('Saving profile...');

    try {
      let photoURL = profileForm.photoURL;
      if (selectedImage) {
        setSaveMessage('Uploading image...');
        photoURL = await uploadImage();
      }

      const profileData = {
        ...profileForm,
        email: loginEmail || profileForm.email,
        latitude: Number.isFinite(Number(profileForm.latitude)) ? Number(profileForm.latitude) : null,
        longitude: Number.isFinite(Number(profileForm.longitude)) ? Number(profileForm.longitude) : null,
        locationMeta: {
          country: profileForm.country || null,
          city: profileForm.city || null,
          area: profileForm.area || null,
          region: profileForm.region || null,
          street: profileForm.street || null,
          latitude: Number.isFinite(Number(profileForm.latitude)) ? Number(profileForm.latitude) : null,
          longitude: Number.isFinite(Number(profileForm.longitude)) ? Number(profileForm.longitude) : null,
        },
        photoURL,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'therapists', currentUser.uid), profileData);
      setProfile({ ...profile, ...profileData });
      setSaveMessage('Profile saved successfully!');
      
      setTimeout(() => {
        setSaveMessage('');
        setSelectedImage(null);
        setImagePreview('');
      }, 2000);
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveMessage('Error saving profile. Please try again.');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Save settings
  const handleSaveSettings = async (type) => {
    setIsLoading(true);
    setSaveMessage(`Saving ${type} settings...`);

    try {
      const settingsData = {
        ...settings,
        [type]: type === 'clinical' ? clinicalForm : notificationForm,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'therapistSettings', currentUser.uid), settingsData, { merge: true });
      setSettings(settingsData);
      setSaveMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} settings saved successfully!`);
      
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      console.error(`Error saving ${type} settings:`, error);
      setSaveMessage(`Error saving ${type} settings. Please try again.`);
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Add specialty
  const addSpecialty = () => {
    const specialty = prompt('Enter specialty:');
    if (specialty && !profileForm.specialties.includes(specialty)) {
      setProfileForm(prev => ({
        ...prev,
        specialties: [...prev.specialties, specialty]
      }));
    }
  };

  // Remove specialty
  const removeSpecialty = (index) => {
    setProfileForm(prev => ({
      ...prev,
      specialties: prev.specialties.filter((_, i) => i !== index)
    }));
  };

  // Add appointment type
  const addAppointmentType = () => {
    const type = prompt('Enter appointment type:');
    if (type && !clinicalForm.appointmentTypes.includes(type)) {
      setClinicalForm(prev => ({
        ...prev,
        appointmentTypes: [...prev.appointmentTypes, type]
      }));
    }
  };

  // Remove appointment type
  const removeAppointmentType = (index) => {
    setClinicalForm(prev => ({
      ...prev,
      appointmentTypes: prev.appointmentTypes.filter((_, i) => i !== index)
    }));
  };

  // Kept in step with the mobile therapist Settings screen (Profile / Security /
  // Availability / Notifications) so both platforms expose the same sections in the
  // same order.
  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'availability', label: 'Availability', icon: Calendar },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  const AVAILABILITY_STATUSES = [
    { id: 'available', label: 'Available', color: '#22c55e' },
    { id: 'busy', label: 'Busy', color: '#ef4444' },
    { id: 'away', label: 'Away', color: '#f59e0b' },
    { id: 'offline', label: 'Offline', color: '#94a3b8' },
  ];

  return (
    <div className="settings-dashboard">
      <div className="settings-header">
        <h1 className="page-title">Settings & Configuration</h1>
        <p className="subtitle">Manage your profile, notifications, and security</p>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={`save-message ${saveMessage.includes('Error') ? 'error' : 'success'}`}>
          {saveMessage.includes('Error') ? <X size={16} /> : <CheckCircle size={16} />}
          {saveMessage}
        </div>
      )}
      
      <div className="settings-container">
        {/* Tab Navigation */}
        <div className="settings-nav">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <TabIcon size={20} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="settings-content">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
        <div className="settings-section">
              <h2>Professional Profile</h2>
              
              {/* Profile Image */}
              <div className="profile-image-section">
                <div className="image-upload">
                  {imagePreview || profileForm.photoURL ? (
                    <img 
                      src={imagePreview || profileForm.photoURL} 
                      alt="Profile" 
                      className="profile-image"
                    />
                  ) : (
                    <div className="profile-placeholder">
                      <User size={48} />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="image-input"
                    id="profile-image"
                  />
                  <label htmlFor="profile-image" className="upload-button">
                    <Upload size={16} />
                    Change Photo
                  </label>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="form-group">
                  <label>Login email</label>
                  <input
                    type="email"
                    value={loginEmail || profileForm.email}
                    readOnly
                    aria-readonly="true"
                    className="input-readonly"
                  />
                  <p className="form-hint">To change your sign-in email, use Security → Login email.</p>
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter your phone number"
                  />
                </div>
          <div className="form-group">
                  <label>Location</label>
                  <input
                    type="text"
                    value={profileForm.location}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="City, State"
                  />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => detectAddress((loc) => {
                        setProfileForm(prev => ({
                          ...prev,
                          location: loc.address || [loc.city, loc.country].filter(Boolean).join(', '),
                          country: loc.countryCode || prev.country,
                          city: loc.city || prev.city,
                          area: loc.area || prev.area,
                          region: loc.region || prev.region,
                          street: loc.street || prev.street,
                          latitude: loc.latitude ?? prev.latitude,
                          longitude: loc.longitude ?? prev.longitude,
                        }));
                      })}
                    >
                      {locating ? 'Detecting…' : 'Use current location'}
                    </button>
                    {locationMsg ? <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{locationMsg}</span> : null}
                  </div>
          </div>
          <div className="form-group">
            <label>City</label>
            <input type="text" value={profileForm.city || ''} onChange={(e) => setProfileForm(prev => ({ ...prev, city: e.target.value }))} placeholder="e.g. Accra" />
          </div>
          <div className="form-group">
            <label>Area / Locality</label>
            <input type="text" value={profileForm.area || ''} onChange={(e) => setProfileForm(prev => ({ ...prev, area: e.target.value }))} placeholder="e.g. East Legon" />
          </div>
          <div className="form-group">
            <label>Region / State</label>
            <input type="text" value={profileForm.region || ''} onChange={(e) => setProfileForm(prev => ({ ...prev, region: e.target.value }))} placeholder="e.g. Greater Accra" />
          </div>
          <div className="form-group">
            <label>Street</label>
            <input type="text" value={profileForm.street || ''} onChange={(e) => setProfileForm(prev => ({ ...prev, street: e.target.value }))} placeholder="e.g. Liberation Road" />
          </div>
          <div className="form-group">
            <label>Ghana Digital Address (optional)</label>
            <input type="text" value={profileForm.ghanaDigitalAddress || ''} onChange={(e) => setProfileForm(prev => ({ ...prev, ghanaDigitalAddress: e.target.value }))} placeholder="e.g. GA-123-4567" />
          </div>
          <div className="form-group">
                  <label>License Number</label>
                  <input
                    type="text"
                    value={profileForm.licenseNumber}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, licenseNumber: e.target.value }))}
                    placeholder="Enter your license number"
                  />
          </div>
          <div className="form-group">
                  <label>Years of Experience</label>
                  <input
                    type="number"
                    value={profileForm.yearsExperience}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, yearsExperience: e.target.value }))}
                    placeholder="Years of experience"
                  />
                </div>

                <div className="form-group">
                  <label>SESSION RATE (per session)</label>
                  {/* Clients are charged this when they pick you, so it has to live
                      on the therapist profile — nothing stored a therapist fee before. */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="user-form-input"
                    placeholder="e.g. 150.00"
                    value={profileForm.sessionRate}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, sessionRate: e.target.value }))}
                  />
                  <small>Shown to clients when they choose a therapist.</small>
                </div>
              </div>

              <div className="form-group">
                <label>Professional Bio</label>
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="Tell clients about your background, approach, and specialties"
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label>Specialties</label>
                <div className="specialties-container">
                  {profileForm.specialties.map((specialty, index) => (
                    <div key={index} className="specialty-tag">
                      <span>{specialty}</span>
                      <button 
                        type="button"
                        onClick={() => removeSpecialty(index)}
                        className="remove-specialty"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button 
                    type="button"
                    onClick={addSpecialty}
                    className="add-specialty"
                  >
                    <Plus size={16} />
                    Add Specialty
                  </button>
                </div>
              </div>

              <button 
                className="btn-primary"
                onClick={handleSaveProfile}
                disabled={isLoading}
              >
                <Save size={16} />
                {isLoading ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          )}


          {/* Availability Tab — mirrors the mobile Availability section */}
          {activeTab === 'availability' && (
            <div className="settings-section">
              <h2>Current Status</h2>
              <p className="section-hint">
                Clients and schedulers see this status on your profile.
              </p>

              <div className="availability-options">
                {AVAILABILITY_STATUSES.map(status => (
                  <button
                    key={status.id}
                    type="button"
                    className={`availability-option ${profileForm.availabilityStatus === status.id ? 'active' : ''}`}
                    onClick={() => setProfileForm(prev => ({ ...prev, availabilityStatus: status.id }))}
                  >
                    <span className="availability-dot" style={{ backgroundColor: status.color }} />
                    <span className="availability-label">{status.label}</span>
                    {profileForm.availabilityStatus === status.id && <CheckCircle size={18} />}
                  </button>
                ))}
              </div>

              <button
                className="btn-primary"
                onClick={handleSaveProfile}
                disabled={isLoading}
              >
                <Save size={16} />
                {isLoading ? 'Saving...' : 'Save Status'}
              </button>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="settings-section">
              <h2>Notification Preferences</h2>
              
              <div className="notification-options">
                <div className="notification-item">
                  <div className="notification-info">
                    <Bell size={20} />
                    <div>
                      <h4>Email Notifications</h4>
                      <p>Receive notifications via email</p>
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={notificationForm.emailNotifications}
                      onChange={(e) => setNotificationForm(prev => ({ ...prev, emailNotifications: e.target.checked }))}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-info">
                    <MessageSquare size={20} />
                    <div>
                      <h4>Client Messages</h4>
                      <p>Get notified when clients send messages</p>
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={notificationForm.clientMessages}
                      onChange={(e) => setNotificationForm(prev => ({ ...prev, clientMessages: e.target.checked }))}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-info">
                    <Calendar size={20} />
                    <div>
                      <h4>Appointment Reminders</h4>
                      <p>Reminders for upcoming appointments</p>
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={notificationForm.appointmentReminders}
                      onChange={(e) => setNotificationForm(prev => ({ ...prev, appointmentReminders: e.target.checked }))}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-info">
                    <AlertTriangle size={20} />
                    <div>
                      <h4>Crisis Alerts</h4>
                      <p>Immediate alerts for crisis situations</p>
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={notificationForm.crisisAlerts}
                      onChange={(e) => setNotificationForm(prev => ({ ...prev, crisisAlerts: e.target.checked }))}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
          </div>

              <div className="form-group">
                <label>Reminder Time (hours before appointment)</label>
                <select
                  value={notificationForm.reminderTime}
                  onChange={(e) => setNotificationForm(prev => ({ ...prev, reminderTime: e.target.value }))}
                >
                  <option value="1">1 hour</option>
                  <option value="2">2 hours</option>
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                </select>
        </div>
        
              <button 
                className="btn-primary"
                onClick={() => handleSaveSettings('notifications')}
                disabled={isLoading}
              >
                <Save size={16} />
                {isLoading ? 'Saving...' : 'Save Notification Settings'}
              </button>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="settings-section">
              <h2>Security Settings</h2>

              <div className="security-email-block">
                <h3>Login email</h3>
                <p className="form-hint">
                  Current: <strong>{loginEmail || '—'}</strong>. Changing this updates Firebase Authentication and your therapist profile.
                </p>
                {emailErr ? <div className="settings-alert settings-alert--err">{emailErr}</div> : null}
                {emailMsg ? <div className="settings-alert settings-alert--ok">{emailMsg}</div> : null}
                <form onSubmit={saveLoginEmail} className="security-email-form">
                  <div className="form-group">
                    <label>New login email</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="new.email@example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Current password</label>
                    <input
                      type="password"
                      value={emailPw}
                      onChange={(e) => setEmailPw(e.target.value)}
                      autoComplete="current-password"
                      placeholder="Confirm with your password"
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={emailSaving}>
                    {emailSaving ? 'Updating…' : 'Update login email'}
                  </button>
                </form>
              </div>

              <div className="security-options">
                <div className="security-item">
                  <div className="security-info">
                    <Lock size={20} />
                    <div>
                      <h4>Two-Factor Authentication</h4>
                      <p>Add an extra layer of security to your account</p>
                    </div>
                  </div>
                  <button 
                    className="btn-secondary"
                    onClick={() => setShowPasswordModal(true)}
                  >
                    {systemForm.twoFactorAuth ? 'Disable' : 'Enable'}
                  </button>
                </div>

                <div className="security-item">
                  <div className="security-info">
                    <Clock size={20} />
                    <div>
                      <h4>Session Timeout</h4>
                      <p>Automatically log out after inactivity</p>
                    </div>
                  </div>
                  <select
                    value={systemForm.sessionTimeout}
                    onChange={(e) => setSystemForm(prev => ({ ...prev, sessionTimeout: e.target.value }))}
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
              </div>

              <div className="security-actions">
                <button className="btn-secondary">
                  <Download size={16} />
                  Export Data
                </button>
                <button className="btn-secondary">
                  <Database size={16} />
                  Backup Settings
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
