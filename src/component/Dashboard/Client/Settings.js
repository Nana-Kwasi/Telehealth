import React, { useEffect, useState } from 'react';
import { auth, db, storage } from '../../../services/firestoreShim';
import './Settings.css';
import { uploadAvatar } from '../../../utils/profileImage';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc
} from '../../../services/firestoreShim';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser
} from '../../../services/authShim';
import { ref, uploadBytes, getDownloadURL } from '../../../services/firestoreShim';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Save,
  Eye,
  EyeOff,
  Settings as SettingsIcon,
  Bell,
  Lock,
  Heart,
  Brain,
  Activity,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Edit,
  Globe,
  Moon,
  Sun,
  Trash2,
  Camera
} from 'lucide-react';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

export default function ClientSettings() {
  const [clientData, setClientData] = useState(null);
  const [authData, setAuthData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [passwordError, setPasswordError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('basic');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const currentUser = auth.currentUser;

  // Fetch client data and auth data
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!currentUser) return;
        
        setIsLoading(true);
        
        // Get client ID - try multiple sources
        const storedClientId = localStorage.getItem('th.clientId');
        const clientId = storedClientId || currentUser.uid;
        console.log('Stored client ID:', storedClientId);
        console.log('Current user UID:', currentUser.uid);
        console.log('Using client ID:', clientId);
        
        // Fetch both auth and client data
        const [clientDoc, authDoc] = await Promise.all([
          getDoc(doc(db, 'clients', clientId)),
          getDoc(doc(db, 'auth', currentUser.uid))
        ]);
        
        console.log('Client document exists:', clientDoc.exists());
        console.log('Auth document exists:', authDoc.exists());
        
        let clientProfile = {};
        let authProfile = {};
        
        // Get client profile data
        if (clientDoc.exists()) {
          clientProfile = clientDoc.data();
        console.log('=== CLIENT PROFILE DATA ===');
        console.log('Full client profile:', clientProfile);
        console.log('Client name:', clientProfile.name);
        console.log('Client gender:', clientProfile.gender);
        console.log('Client age:', clientProfile.age);
        console.log('Client country:', clientProfile.country);
        console.log('Client email:', clientProfile.email);
        console.log('All client keys:', Object.keys(clientProfile));
        console.log('Has gender field:', 'gender' in clientProfile);
        console.log('Has age field:', 'age' in clientProfile);
        console.log('Gender value:', clientProfile.gender);
        console.log('Age value:', clientProfile.age);
        } else {
          console.log('❌ Client document not found for ID:', clientId);
        }
        
        // Get auth profile data
        if (authDoc.exists()) {
          authProfile = authDoc.data();
          console.log('=== AUTH PROFILE DATA ===');
          console.log('Full auth profile:', authProfile);
          console.log('Auth name:', authProfile.name);
          console.log('Auth email:', authProfile.email);
          console.log('Auth role:', authProfile.role);
          console.log('All auth keys:', Object.keys(authProfile));
        } else {
          console.log('❌ Auth document not found');
        }
        
        // Merge data from both collections
        // Priority: client data overrides auth data for detailed info
        console.log('=== MERGING DATA ===');
        console.log('Client profile name:', clientProfile.name);
        console.log('Auth profile name:', authProfile.name);
        console.log('Current user displayName:', currentUser.displayName);
        
        const mergedData = {
          // Basic info from auth collection
          uid: authProfile.uid || currentUser.uid,
          role: authProfile.role || 'client',
          status: authProfile.status || 'active',
          createdAt: authProfile.createdAt,
          
          // Detailed profile from clients collection (takes priority)
          id: clientDoc.exists() ? clientDoc.id : clientId,
          name: clientProfile.name || authProfile.name || currentUser.displayName || '',
          email: clientProfile.email || authProfile.email || currentUser.email || '',
          phone: clientProfile.phone || '',
          
          // All other client-specific data
          ...clientProfile
        };
        
        console.log('=== FINAL MERGED DATA ===');
        console.log('Full merged data:', mergedData);
        console.log('Final name:', mergedData.name);
        console.log('Final gender:', mergedData.gender);
        console.log('Final age:', mergedData.age);
        console.log('Final country:', mergedData.country);
        console.log('Final email:', mergedData.email);
        console.log('All merged keys:', Object.keys(mergedData));
        
        // Check for alternative field names
        console.log('=== CHECKING ALTERNATIVE FIELDS ===');
        console.log('Looking for gender alternatives...');
        console.log('clientProfile.gender:', clientProfile.gender);
        console.log('clientProfile.sex:', clientProfile.sex);
        console.log('clientProfile.genderIdentity:', clientProfile.genderIdentity);
        console.log('Looking for age alternatives...');
        console.log('clientProfile.age:', clientProfile.age);
        console.log('clientProfile.dateOfBirth:', clientProfile.dateOfBirth);
        console.log('clientProfile.birthDate:', clientProfile.birthDate);
        console.log('clientProfile.birthday:', clientProfile.birthday);
        
        console.log('=== SETTING STATE ===');
        console.log('Setting clientData to:', mergedData);
        console.log('Setting authData to:', authProfile);
        
        setClientData(mergedData);
        setAuthData(authProfile);
        
        console.log('=== STATE SET COMPLETE ===');
        
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  // Log state changes
  useEffect(() => {
    console.log('=== STATE CHANGED ===');
    console.log('clientData updated:', clientData);
    console.log('authData updated:', authData);
  }, [clientData, authData]);

  const handleSave = async () => {
    if (!clientData || !currentUser) return;
    
    try {
      setSaving(true);
      setPasswordError('');
      setSuccessMessage('');
      
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      
      // Update client data
      const updateData = {
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone || '',
        country: clientData.country || '',
        city: clientData.city || '',
        area: clientData.area || '',
        region: clientData.region || '',
        street: clientData.street || '',
        ghanaDigitalAddress: clientData.ghanaDigitalAddress || '',
        latitude: Number.isFinite(Number(clientData.latitude)) ? Number(clientData.latitude) : null,
        longitude: Number.isFinite(Number(clientData.longitude)) ? Number(clientData.longitude) : null,
        locationMeta: {
          country: clientData.country || '',
          city: clientData.city || '',
          area: clientData.area || '',
          region: clientData.region || '',
          street: clientData.street || '',
          latitude: Number.isFinite(Number(clientData.latitude)) ? Number(clientData.latitude) : null,
          longitude: Number.isFinite(Number(clientData.longitude)) ? Number(clientData.longitude) : null,
        },
        lastModified: new Date(),
        modifiedBy: currentUser.uid
      };

      // Only add gender and age if they have values (to avoid overwriting existing data)
      if (clientData.gender && clientData.gender.trim() !== '') {
        updateData.gender = clientData.gender;
      }
      if (clientData.age && clientData.age.trim() !== '') {
        updateData.age = clientData.age;
      }
      
      await updateDoc(doc(db, 'clients', clientId), updateData);
      
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error) {
      console.error('Error saving profile:', error);
      setPasswordError('Failed to save profile: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    
    try {
      setPasswordError('');
      setSuccessMessage('');
      
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setPasswordError('New passwords do not match');
        return;
      }
      
      if (passwordForm.newPassword.length < 6) {
        setPasswordError('Password must be at least 6 characters');
        return;
      }
      
      // Reauthenticate user
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        passwordForm.currentPassword
      );
      
      await reauthenticateWithCredential(currentUser, credential);
      
      // Update password
      await updatePassword(currentUser, passwordForm.newPassword);
      
      setSuccessMessage('Password updated successfully!');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowPasswordForm(false);
      
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error) {
      console.error('Error updating password:', error);
      if (error.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setPasswordError('Password is too weak');
      } else {
        setPasswordError('Failed to update password: ' + error.message);
      }
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not provided';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getPHQ9Score = () => {
    if (!clientData?.phq9) return 'Not assessed';
    const scores = Object.values(clientData.phq9).filter(score => typeof score === 'number');
    const total = scores.reduce((sum, score) => sum + score, 0);
    return `${total}/27 (${total <= 4 ? 'Minimal' : total <= 9 ? 'Mild' : total <= 14 ? 'Moderate' : total <= 19 ? 'Moderately Severe' : 'Severe'})`;
  };

  const handleProfilePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    setUploadingPhoto(true);
    try {
      // Was a Firebase Storage upload followed by a PATCH of `photoURL` — this
      // app no longer runs on Firebase, and the picture is now kept on the user
      // record so every avatar in the dashboard resolves from one place.
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      const downloadURL = await uploadAvatar(file, clientId);
      setClientData(prev => ({ ...prev, photoURL: downloadURL, avatarUrl: downloadURL }));
      setSuccessMessage('Profile photo updated!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setPasswordError('Failed to upload photo: ' + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSavePreferences = async (updates) => {
    if (!currentUser) return;
    try {
      setSaving(true);
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      await updateDoc(doc(db, 'clients', clientId), updates);
      setClientData(prev => ({ ...prev, ...updates }));
      setSuccessMessage('Preferences saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setPasswordError('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || !deletePassword) return;
    setDeletingAccount(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, deletePassword);
      await reauthenticateWithCredential(currentUser, credential);
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      await deleteDoc(doc(db, 'clients', clientId));
      await deleteDoc(doc(db, 'auth', currentUser.uid));
      await deleteUser(currentUser);
      window.location.href = '/';
    } catch (err) {
      setPasswordError(err.code === 'auth/wrong-password' ? 'Incorrect password' : 'Failed to delete: ' + err.message);
    } finally {
      setDeletingAccount(false);
    }
  };

  if (isLoading) {
    return (
      <div className="settings-loading">
        <div className="settings-spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">
          <SettingsIcon size={28} />
          Settings & Profile
        </h1>
        <p className="settings-subtitle">Manage your account and preferences</p>
      </div>
      
      <div className="settings-container">
        {/* Navigation Sidebar */}
        <div className="settings-nav">
          <button 
            className={`settings-nav-item ${activeSection === 'basic' ? 'active' : ''}`}
            onClick={() => setActiveSection('basic')}
          >
            <User size={20} />
            Basic Information
          </button>
          <button 
            className={`settings-nav-item ${activeSection === 'therapy' ? 'active' : ''}`}
            onClick={() => setActiveSection('therapy')}
          >
            <Heart size={20} />
            Therapy Details
          </button>
          <button 
            className={`settings-nav-item ${activeSection === 'health' ? 'active' : ''}`}
            onClick={() => setActiveSection('health')}
          >
            <Activity size={20} />
            Health Information
          </button>
          <button 
            className={`settings-nav-item ${activeSection === 'security' ? 'active' : ''}`}
            onClick={() => setActiveSection('security')}
          >
            <Lock size={20} />
            Security
          </button>
          <button
            className={`settings-nav-item ${activeSection === 'preferences' ? 'active' : ''}`}
            onClick={() => setActiveSection('preferences')}
          >
            <Bell size={20} />
            Preferences
          </button>
          <button
            className={`settings-nav-item ${activeSection === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveSection('privacy')}
          >
            <Shield size={20} />
            Privacy
          </button>
          <button
            className={`settings-nav-item settings-nav-danger ${activeSection === 'account' ? 'active' : ''}`}
            onClick={() => setActiveSection('account')}
          >
            <Trash2 size={20} />
            Account
          </button>
        </div>

        {/* Content Area */}
        <div className="settings-content">
          {/* Success/Error Messages */}
          {successMessage && (
            <div className="settings-message settings-message-success">
              <CheckCircle size={20} />
              {successMessage}
            </div>
          )}
          
          {passwordError && (
            <div className="settings-message settings-message-error">
              <AlertCircle size={20} />
              {passwordError}
            </div>
          )}

         
          {/* Basic Information Section */}
          {activeSection === 'basic' && (
            <div className="settings-section">
              <div className="settings-section-header">
                <h2>Basic Information</h2>
                <p>Your personal details and contact information</p>
              </div>

              {/* Profile Photo */}
              <div className="settings-photo-upload">
                <div className="settings-photo-avatar">
                  {clientData?.photoURL ? (
                    <img src={clientData.photoURL} alt="Profile" className="settings-photo-img" />
                  ) : (
                    <span className="settings-photo-initials">
                      {clientData?.name ? clientData.name.charAt(0).toUpperCase() : 'C'}
                    </span>
                  )}
                  <label className="settings-photo-overlay" htmlFor="profile-photo-input">
                    <Camera size={18} />
                    {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
                  </label>
                  <input id="profile-photo-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfilePhotoUpload} />
                </div>
              </div>

              <div className="settings-form">
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      value={clientData?.name || ''}
                      onChange={(e) => setClientData({...clientData, name: e.target.value})}
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div className="settings-form-group">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      value={clientData?.email || ''}
                      onChange={(e) => setClientData({...clientData, email: e.target.value})}
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      value={clientData?.phone || ''}
                      onChange={(e) => setClientData({...clientData, phone: e.target.value})}
                      placeholder="Enter your phone number"
                    />
                  </div>
                  <div className="settings-form-group">
                    <label>Country</label>
                    <input
                      type="text"
                      value={clientData?.country || ''}
                      onChange={(e) => setClientData({ ...clientData, country: e.target.value })}
                      placeholder="e.g. GH"
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '0.75rem', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="settings-btn-secondary"
                    onClick={() => detectAddress((loc) => {
                      setClientData({
                        ...clientData,
                        country: loc.countryCode || clientData?.country || '',
                        city: loc.city || clientData?.city || '',
                        area: loc.area || clientData?.area || '',
                        region: loc.region || clientData?.region || '',
                        street: loc.street || clientData?.street || '',
                        latitude: loc.latitude ?? clientData?.latitude ?? null,
                        longitude: loc.longitude ?? clientData?.longitude ?? null,
                      });
                    })}
                    disabled={locating}
                  >
                    {locating ? 'Detecting…' : 'Use current location'}
                  </button>
                  {locationMsg ? <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{locationMsg}</span> : null}
                </div>
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label>City</label>
                    <input type="text" value={clientData?.city || ''} onChange={(e) => setClientData({...clientData, city: e.target.value})} placeholder="e.g. Accra" />
                  </div>
                  <div className="settings-form-group">
                    <label>Area / Locality</label>
                    <input type="text" value={clientData?.area || ''} onChange={(e) => setClientData({...clientData, area: e.target.value})} placeholder="e.g. East Legon" />
                  </div>
                </div>
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label>Region / State</label>
                    <input type="text" value={clientData?.region || ''} onChange={(e) => setClientData({...clientData, region: e.target.value})} placeholder="e.g. Greater Accra" />
                  </div>
                  <div className="settings-form-group">
                    <label>Street</label>
                    <input type="text" value={clientData?.street || ''} onChange={(e) => setClientData({...clientData, street: e.target.value})} placeholder="e.g. Liberation Road" />
                  </div>
                </div>
                <div className="settings-form-group">
                  <label>Ghana Digital Address (optional)</label>
                  <input type="text" value={clientData?.ghanaDigitalAddress || ''} onChange={(e) => setClientData({...clientData, ghanaDigitalAddress: e.target.value})} placeholder="e.g. GA-123-4567" />
                </div>

                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label>Gender</label>
                    {clientData?.gender ? (
                      <input
                        type="text"
                        value={clientData.gender}
                        readOnly
                        className="readonly"
                      />
                    ) : (
                      <select
                        value={clientData?.gender || ''}
                        onChange={(e) => setClientData({...clientData, gender: e.target.value})}
                      >
                        <option value="">Select gender</option>
                        <option value="man">Man</option>
                        <option value="woman">Woman</option>
                        <option value="non-binary">Non-binary</option>
                        <option value="transgender">Transgender</option>
                        <option value="genderqueer">Genderqueer</option>
                        <option value="agender">Agender</option>
                        <option value="other">Other</option>
                        <option value="prefer-not-to-say">Prefer not to say</option>
                      </select>
                    )}
                  </div>
                  <div className="settings-form-group">
                    <label>Age</label>
                    {clientData?.age ? (
                      <input
                        type="text"
                        value={`${clientData.age} years old`}
                        readOnly
                        className="readonly"
                      />
                    ) : (
                      <input
                        type="number"
                        value={clientData?.age || ''}
                        onChange={(e) => setClientData({...clientData, age: e.target.value})}
                        placeholder="Enter your age"
                        min="1"
                        max="120"
                      />
                    )}
                  </div>
                </div>

                <div className="settings-form-actions">
                  <button 
                    className="settings-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Therapy Details Section */}
          {activeSection === 'therapy' && (
            <div className="settings-section">
              <div className="settings-section-header">
                <h2>Therapy Details</h2>
                <p>Your therapy preferences and goals</p>
              </div>
              
              <div className="settings-info-grid">
                <div className="settings-info-card">
                  <h4>Therapy Type</h4>
                  <p>{clientData?.therapyType || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Session Frequency</h4>
                  <p>{clientData?.sessionFrequency || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Session Structure</h4>
                  <p>{clientData?.sessionStructure || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Communication Preference</h4>
                  <p>{clientData?.communicationPreference || 'Not specified'}</p>
                </div>
              </div>

              <div className="settings-info-section">
                <h4>Therapy Goals</h4>
                <div className="settings-tags">
                  {clientData?.therapyGoals?.map((goal, index) => (
                    <span key={index} className="settings-tag">{goal}</span>
                  )) || <span className="settings-tag-empty">No goals specified</span>}
                </div>
              </div>

              <div className="settings-info-section">
                <h4>Reasons for Therapy</h4>
                <div className="settings-tags">
                  {clientData?.reasonsForTherapy?.map((reason, index) => (
                    <span key={index} className="settings-tag">{reason}</span>
                  )) || <span className="settings-tag-empty">No reasons specified</span>}
                </div>
              </div>

              <div className="settings-info-section">
                <h4>Therapy Types Interested In</h4>
                <div className="settings-tags">
                  {clientData?.therapyTypes?.map((type, index) => (
                    <span key={index} className="settings-tag">{type}</span>
                  )) || <span className="settings-tag-empty">No types specified</span>}
                </div>
              </div>
            </div>
          )}

          {/* Health Information Section */}
          {activeSection === 'health' && (
            <div className="settings-section">
              <div className="settings-section-header">
                <h2>Health Information</h2>
                <p>Your mental and physical health details</p>
              </div>
              
              <div className="settings-info-grid">
                <div className="settings-info-card">
                  <h4>PHQ-9 Score</h4>
                  <p>{getPHQ9Score()}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Anxiety Level</h4>
                  <p>{clientData?.anxiety || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Depression Level</h4>
                  <p>{clientData?.depression || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Physical Health</h4>
                  <p>{clientData?.physicalHealth || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Sleep Quality</h4>
                  <p>{clientData?.sleep || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Exercise Frequency</h4>
                  <p>{clientData?.exercise || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Eating Habits</h4>
                  <p>{clientData?.eatingHabits || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Current Medication</h4>
                  <p>{clientData?.currentMedication || 'Not specified'}</p>
                </div>
              </div>

              <div className="settings-info-section">
                <h4>Demographics</h4>
                <div className="settings-tags">
                  {clientData?.demographics?.map((demo, index) => (
                    <span key={index} className="settings-tag">{demo}</span>
                  )) || <span className="settings-tag-empty">No demographics specified</span>}
                </div>
              </div>
            </div>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
        <div className="settings-section">
              <div className="settings-section-header">
                <h2>Security</h2>
                <p>Manage your password and account security</p>
              </div>
              
              <div className="settings-security">
                <div className="settings-security-item">
                  <div className="settings-security-info">
                    <h4>Password</h4>
                    <p>Last updated: {formatDate(clientData?.lastModified)}</p>
                  </div>
                  <button 
                    className="settings-btn-secondary"
                    onClick={() => setShowPasswordForm(!showPasswordForm)}
                  >
                    Change Password
                  </button>
                </div>

                {showPasswordForm && (
                  <div className="settings-password-form">
                    <form onSubmit={handlePasswordChange}>
                      <div className="settings-form-group">
                        <label>Current Password *</label>
                        <div className="settings-password-input">
                          <input
                            type={showPasswords.current ? 'text' : 'password'}
                            value={passwordForm.currentPassword}
                            onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                            placeholder="Enter current password"
                            required
                          />
                          <button
                            type="button"
                            className="settings-password-toggle"
                            onClick={() => togglePasswordVisibility('current')}
                          >
                            {showPasswords.current ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                        </div>
                      </div>

                      <div className="settings-form-group">
                        <label>New Password *</label>
                        <div className="settings-password-input">
                          <input
                            type={showPasswords.new ? 'text' : 'password'}
                            value={passwordForm.newPassword}
                            onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                            placeholder="Enter new password"
                            required
                          />
                          <button
                            type="button"
                            className="settings-password-toggle"
                            onClick={() => togglePasswordVisibility('new')}
                          >
                            {showPasswords.new ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                        </div>
          </div>

                      <div className="settings-form-group">
                        <label>Confirm New Password *</label>
                        <div className="settings-password-input">
                          <input
                            type={showPasswords.confirm ? 'text' : 'password'}
                            value={passwordForm.confirmPassword}
                            onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                            placeholder="Confirm new password"
                            required
                          />
                          <button
                            type="button"
                            className="settings-password-toggle"
                            onClick={() => togglePasswordVisibility('confirm')}
                          >
                            {showPasswords.confirm ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
          </div>
        </div>
        
                      <div className="settings-form-actions">
                        <button 
                          type="button"
                          className="settings-btn-secondary"
                          onClick={() => {
                            setShowPasswordForm(false);
                            setPasswordForm({currentPassword: '', newPassword: '', confirmPassword: ''});
                            setPasswordError('');
                          }}
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit"
                          className="settings-btn-primary"
                        >
                          Update Password
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preferences Section */}
          {activeSection === 'preferences' && (
        <div className="settings-section">
              <div className="settings-section-header">
                <h2>Preferences</h2>
                <p>Customize your experience and notification settings</p>
              </div>
              
              <div className="settings-info-grid">
                <div className="settings-info-card">
                  <h4>Available Times</h4>
                  <p>{clientData?.availableTimes?.[0] || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Preferred Therapist Gender</h4>
                  <p>{clientData?.therapistGender || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Therapist Style</h4>
                  <p>{clientData?.therapistStyle || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Religion</h4>
                  <p>{clientData?.religionType || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Christian Denomination</h4>
                  <p>{clientData?.christianDenomination || 'Not specified'}</p>
                </div>
                
                <div className="settings-info-card">
                  <h4>Prefer Christian Therapist</h4>
                  <p>{clientData?.preferChristianTherapist || 'Not specified'}</p>
                </div>
              </div>

              <div className="settings-info-section">
                <h4>Therapist Expectations</h4>
                <div className="settings-tags">
                  {clientData?.therapistExpectations?.map((expectation, index) => (
                    <span key={index} className="settings-tag">{expectation}</span>
                  )) || <span className="settings-tag-empty">No expectations specified</span>}
                </div>
              </div>

              <div className="settings-form">
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label><Globe size={16} /> Language</label>
                    <select
                      value={clientData?.language || 'en'}
                      onChange={(e) => setClientData({ ...clientData, language: e.target.value })}
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="pt">Portuguese</option>
                      <option value="zh">Chinese</option>
                      <option value="ar">Arabic</option>
                      <option value="hi">Hindi</option>
                    </select>
                  </div>
                </div>
                <div className="settings-form-actions">
                  <button className="settings-btn-primary" onClick={() => handleSavePreferences({ language: clientData?.language || 'en' })} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Language'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Privacy Section */}
          {activeSection === 'privacy' && (
            <div className="settings-section">
              <div className="settings-section-header">
                <h2>Privacy & Data</h2>
                <p>Control your profile visibility and data sharing</p>
              </div>

              <div className="settings-form">
                <div className="settings-form-group">
                  <label>Profile Visibility</label>
                  <select
                    value={clientData?.profileVisibility || 'therapist-only'}
                    onChange={(e) => setClientData({ ...clientData, profileVisibility: e.target.value })}
                  >
                    <option value="therapist-only">Therapist Only (Recommended)</option>
                    <option value="private">Private — Only me</option>
                    <option value="public">Public</option>
                  </select>
                  <small className="settings-field-hint">Controls who can view your profile information</small>
                </div>

                <div className="settings-toggle-row">
                  <div className="settings-toggle-info">
                    <label>Share progress data with therapist</label>
                    <small>Allow your therapist to view mood check-ins and progress metrics</small>
                  </div>
                  <input
                    type="checkbox"
                    className="settings-toggle"
                    checked={clientData?.shareProgressWithTherapist !== false}
                    onChange={(e) => setClientData({ ...clientData, shareProgressWithTherapist: e.target.checked })}
                  />
                </div>

                <div className="settings-form-actions">
                  <button className="settings-btn-primary" onClick={() => handleSavePreferences({
                    profileVisibility: clientData?.profileVisibility || 'therapist-only',
                    shareProgressWithTherapist: clientData?.shareProgressWithTherapist !== false,
                  })} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Privacy Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Account Section */}
          {activeSection === 'account' && (
            <div className="settings-section">
              <div className="settings-section-header">
                <h2>Account</h2>
                <p>Manage or permanently delete your account</p>
              </div>

              {!showDeleteConfirm ? (
                <div className="settings-danger-zone">
                  <div className="settings-danger-info">
                    <AlertTriangle size={22} color="#dc2626" />
                    <div>
                      <h4>Delete Account</h4>
                      <p>This permanently deletes your account and all associated data. This action cannot be undone.</p>
                    </div>
                  </div>
                  <button className="settings-btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                    <Trash2 size={16} />
                    Delete My Account
                  </button>
                </div>
              ) : (
                <div className="settings-delete-confirm">
                  <p className="settings-delete-warning">Enter your password to confirm account deletion:</p>
                  <div className="settings-form-group">
                    <label>Current Password</label>
                    <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Enter your password" />
                  </div>
                  <div className="settings-form-actions">
                    <button className="settings-btn-secondary" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}>
                      Cancel
                    </button>
                    <button className="settings-btn-danger" onClick={handleDeleteAccount} disabled={deletingAccount || !deletePassword}>
                      {deletingAccount ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}