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
import { auth, db, storage } from '../../Auth/firebaseConfig';
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
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import './Settings.css';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

export default function TherapistSettings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({});
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const currentUser = auth.currentUser;

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
      const imageRef = ref(storage, `therapist-profiles/${currentUser.uid}/${selectedImage.name}`);
      const snapshot = await uploadBytes(imageRef, selectedImage);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      return '';
    }
  };

  // Save profile
  const handleSaveProfile = async () => {
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
        [type]: type === 'clinical' ? clinicalForm : 
                type === 'notifications' ? notificationForm : 
                systemForm,
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

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'system', label: 'System', icon: SettingsIcon },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'compliance', label: 'Compliance', icon: CheckCircle }
  ];

  return (
    <div className="settings-dashboard">
      <div className="settings-header">
        <h1 className="page-title">Settings & Configuration</h1>
        <p className="subtitle">Manage your profile, clinical settings, and system preferences</p>
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
                  <label>Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter your email"
                  />
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

          {/* System Tab */}
          {activeTab === 'system' && (
        <div className="settings-section">
              <h2>System Configuration</h2>
              
              <div className="form-grid">
                <div className="form-group">
                  <label>Theme</label>
                  <select
                    value={systemForm.theme}
                    onChange={(e) => setSystemForm(prev => ({ ...prev, theme: e.target.value }))}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Language</label>
                  <select
                    value={systemForm.language}
                    onChange={(e) => setSystemForm(prev => ({ ...prev, language: e.target.value }))}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Timezone</label>
                  <select
                    value={systemForm.timezone}
                    onChange={(e) => setSystemForm(prev => ({ ...prev, timezone: e.target.value }))}
                  >
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                  </select>
                </div>
          <div className="form-group">
                  <label>Date Format</label>
                  <select
                    value={systemForm.dateFormat}
                    onChange={(e) => setSystemForm(prev => ({ ...prev, dateFormat: e.target.value }))}
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>

              <div className="system-options">
                <div className="system-item">
                  <div className="system-info">
                    <Database size={20} />
                    <div>
                      <h4>Auto-save</h4>
                      <p>Automatically save changes</p>
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={systemForm.autoSave}
                      onChange={(e) => setSystemForm(prev => ({ ...prev, autoSave: e.target.checked }))}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="system-item">
                  <div className="system-info">
                    <Cloud size={20} />
                    <div>
                      <h4>Cloud Backup</h4>
                      <p>Automatic data backup</p>
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={systemForm.backupFrequency !== 'never'}
                      onChange={(e) => setSystemForm(prev => ({ 
                        ...prev, 
                        backupFrequency: e.target.checked ? 'daily' : 'never'
                      }))}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <button 
                className="btn-primary"
                onClick={() => handleSaveSettings('system')}
                disabled={isLoading}
              >
                <Save size={16} />
                {isLoading ? 'Saving...' : 'Save System Settings'}
              </button>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="settings-section">
              <h2>Security Settings</h2>
              
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

          {/* Compliance Tab */}
          {activeTab === 'compliance' && (
            <div className="settings-section">
              <h2>Compliance & Privacy</h2>
              
              <div className="compliance-options">
                <div className="compliance-item">
                  <div className="compliance-info">
                    <Shield size={20} />
                    <div>
                      <h4>HIPAA Compliance</h4>
                      <p>Ensure all data handling meets HIPAA requirements</p>
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={systemForm.hipaaCompliance}
                      onChange={(e) => setSystemForm(prev => ({ ...prev, hipaaCompliance: e.target.checked }))}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="compliance-item">
                  <div className="compliance-info">
                    <FileCheck size={20} />
                    <div>
                      <h4>Data Retention</h4>
                      <p>How long to keep client records</p>
                    </div>
                  </div>
                  <select
                    value={systemForm.dataRetention}
                    onChange={(e) => setSystemForm(prev => ({ ...prev, dataRetention: e.target.value }))}
                  >
                    <option value="3years">3 years</option>
                    <option value="5years">5 years</option>
                    <option value="7years">7 years</option>
                    <option value="indefinite">Indefinite</option>
            </select>
          </div>
              </div>

              <div className="compliance-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowPrivacyModal(true)}
                >
                  <FileText size={16} />
                  View Privacy Policy
                </button>
                <button 
                  className="btn-secondary"
                  onClick={() => setShowComplianceModal(true)}
                >
                  <CheckCircle size={16} />
                  Compliance Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="modal-overlay" onClick={() => setShowPrivacyModal(false)}>
          <div className="compliance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Privacy Policy</h2>
              <button className="close-button" onClick={() => setShowPrivacyModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-content">
              <div className="privacy-policy-content">
                <h3>Data Protection & Privacy</h3>
                <p>This telehealth platform is designed with HIPAA compliance and patient privacy as our top priorities.</p>
                
                <h4>Information We Collect</h4>
                <ul>
                  <li>Personal health information (PHI) as provided by clients</li>
                  <li>Session notes and treatment records</li>
                  <li>Communication logs between therapists and clients</li>
                  <li>Appointment scheduling and attendance records</li>
                </ul>

                <h4>How We Protect Your Data</h4>
                <ul>
                  <li>End-to-end encryption for all communications</li>
                  <li>Secure cloud storage with HIPAA-compliant infrastructure</li>
                  <li>Regular security audits and penetration testing</li>
                  <li>Access controls and audit logging</li>
                  <li>Data backup and disaster recovery procedures</li>
                </ul>

                <h4>Your Rights</h4>
                <ul>
                  <li>Access to your personal health information</li>
                  <li>Request corrections to your records</li>
                  <li>Request data portability</li>
                  <li>Request deletion of your data (subject to legal requirements)</li>
                  <li>File complaints regarding data handling</li>
                </ul>

                <h4>Compliance Standards</h4>
                <p>We maintain compliance with:</p>
                <ul>
                  <li>HIPAA (Health Insurance Portability and Accountability Act)</li>
                  <li>HITECH Act requirements</li>
                  <li>State privacy laws and regulations</li>
                  <li>Professional ethics standards for mental health providers</li>
                </ul>

                <div className="compliance-footer">
                  <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
                  <p><strong>Contact:</strong> privacy@telehealthplatform.com</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compliance Report Modal */}
      {showComplianceModal && (
        <div className="modal-overlay" onClick={() => setShowComplianceModal(false)}>
          <div className="compliance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Compliance Report</h2>
              <button className="close-button" onClick={() => setShowComplianceModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-content">
              <div className="compliance-report-content">
                <h3>System Compliance Status</h3>
                
                <div className="compliance-status">
                  <div className="status-item">
                    <CheckCircle size={20} className="status-icon success" />
                    <div>
                      <h4>HIPAA Compliance</h4>
                      <p>All systems meet HIPAA requirements for healthcare data protection</p>
                      <span className="status-badge success">Compliant</span>
                    </div>
                  </div>

                  <div className="status-item">
                    <CheckCircle size={20} className="status-icon success" />
                    <div>
                      <h4>Data Encryption</h4>
                      <p>All data is encrypted in transit and at rest using industry-standard protocols</p>
                      <span className="status-badge success">Active</span>
                    </div>
                  </div>

                  <div className="status-item">
                    <CheckCircle size={20} className="status-icon success" />
                    <div>
                      <h4>Access Controls</h4>
                      <p>Multi-factor authentication and role-based access controls are implemented</p>
                      <span className="status-badge success">Enabled</span>
                    </div>
                  </div>

                  <div className="status-item">
                    <CheckCircle size={20} className="status-icon success" />
                    <div>
                      <h4>Audit Logging</h4>
                      <p>All system activities are logged and monitored for security compliance</p>
                      <span className="status-badge success">Active</span>
                    </div>
                  </div>

                  <div className="status-item">
                    <CheckCircle size={20} className="status-icon success" />
                    <div>
                      <h4>Data Backup</h4>
                      <p>Regular automated backups ensure data availability and recovery</p>
                      <span className="status-badge success">Scheduled</span>
                    </div>
                  </div>
                </div>

                <div className="compliance-metrics">
                  <h4>Security Metrics</h4>
                  <div className="metrics-grid">
                    <div className="metric-item">
                      <span className="metric-label">Security Score</span>
                      <span className="metric-value">98%</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Uptime</span>
                      <span className="metric-value">99.9%</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Last Audit</span>
                      <span className="metric-value">{new Date().toLocaleDateString()}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Next Review</span>
                      <span className="metric-value">{new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="compliance-actions">
                  <button className="btn-primary">
                    <Download size={16} />
                    Download Full Report
                  </button>
                  <button className="btn-secondary">
                    <FileText size={16} />
                    View Audit Logs
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
