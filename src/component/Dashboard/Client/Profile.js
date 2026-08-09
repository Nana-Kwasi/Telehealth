import React, { useEffect, useState } from 'react';
import { auth, db } from '../../../services/firestoreShim';
import './Profile.css';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc
} from '../../../services/firestoreShim';
import { 
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from '../../../services/authShim';
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
  Camera,
  Edit,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

export default function ClientProfile() {
  const [profile, setProfile] = useState(null);
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
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const currentUser = auth.currentUser;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!currentUser) return;
        
        setIsLoading(true);
        
        // Get client ID
        const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
        
        const profileDoc = await getDoc(doc(db, 'clients', clientId));
        if (profileDoc.exists()) {
          const profileData = profileDoc.data();
          setProfile({ 
            id: profileDoc.id, 
            ...profileData,
            // Ensure we have auth user data as fallback
            email: profileData.email || currentUser.email,
            name: profileData.name || profileData.displayName || currentUser.displayName || '',
            phone: profileData.phone || '',
            address: profileData.address || '',
            country: profileData.country || profileData.locationMeta?.country || '',
            city: profileData.city || profileData.locationMeta?.city || '',
            area: profileData.area || profileData.locationMeta?.area || '',
            region: profileData.region || profileData.locationMeta?.region || '',
            street: profileData.street || profileData.locationMeta?.street || '',
            ghanaDigitalAddress: profileData.ghanaDigitalAddress || '',
            latitude: profileData.latitude ?? profileData.locationMeta?.latitude ?? null,
            longitude: profileData.longitude ?? profileData.locationMeta?.longitude ?? null,
            dateOfBirth: profileData.dateOfBirth || '',
            emergencyContact: profileData.emergencyContact || '',
            preferences: profileData.preferences || {}
          });
        } else {
          // Create initial profile if doesn't exist
          const initialProfile = {
            id: clientId,
            email: currentUser.email,
            name: currentUser.displayName || '',
            phone: '',
            address: '',
            country: '',
            city: '',
            area: '',
            region: '',
            street: '',
            ghanaDigitalAddress: '',
            latitude: null,
            longitude: null,
            dateOfBirth: '',
            emergencyContact: '',
            preferences: {
              communication: 'email',
              notifications: true,
              reminders: true,
              privacy: 'standard'
            },
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          await setDoc(doc(db, 'clients', clientId), initialProfile);
          setProfile(initialProfile);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [currentUser]);

  const handleSave = async () => {
    if (!profile || !currentUser) return;
    
    try {
    setSaving(true);
      setPasswordError('');
      setSuccessMessage('');
      
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      
      // Update profile data
      const updateData = {
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
        country: profile.country || null,
        city: profile.city || null,
        area: profile.area || null,
        region: profile.region || null,
        street: profile.street || null,
        ghanaDigitalAddress: profile.ghanaDigitalAddress || null,
        latitude: Number.isFinite(Number(profile.latitude)) ? Number(profile.latitude) : null,
        longitude: Number.isFinite(Number(profile.longitude)) ? Number(profile.longitude) : null,
        locationMeta: {
          country: profile.country || null,
          city: profile.city || null,
          area: profile.area || null,
          region: profile.region || null,
          street: profile.street || null,
          latitude: Number.isFinite(Number(profile.latitude)) ? Number(profile.latitude) : null,
          longitude: Number.isFinite(Number(profile.longitude)) ? Number(profile.longitude) : null,
        },
        dateOfBirth: profile.dateOfBirth,
        emergencyContact: profile.emergencyContact,
        preferences: profile.preferences,
        updatedAt: new Date()
      };
      
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
      
      // Validate passwords
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setPasswordError('New passwords do not match');
        return;
      }
      
      if (passwordForm.newPassword.length < 6) {
        setPasswordError('New password must be at least 6 characters');
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
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
      
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setPasswordError('New password is too weak');
      } else {
        setPasswordError('Failed to change password: ' + error.message);
      }
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleInputChange = (field, value) => {
    setProfile(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePreferenceChange = (field, value) => {
    setProfile(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [field]: value
      }
    }));
  };

  if (isLoading) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner"></div>
        <p>Loading your profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-error">
        <AlertCircle size={48} />
        <p>Failed to load profile. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="client-profile">
      <div className="profile-header">
      <h1 className="page-title">Profile & Settings</h1>
        <div className="profile-actions">
          <button 
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="success-message">
          <CheckCircle size={20} />
          <span>{successMessage}</span>
        </div>
      )}
      
      {passwordError && (
        <div className="error-message">
          <AlertCircle size={20} />
          <span>{passwordError}</span>
        </div>
      )}

      <div className="profile-content">
        {/* Personal Information */}
        <div className="profile-section">
          <h2 className="section-title">
            <User size={24} />
            Personal Information
          </h2>
          <div className="profile-form">
            <div className="form-row">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  value={profile.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={profile.email || ''}
                  disabled
                  className="disabled-input"
                />
                <small>Email cannot be changed. Contact support if needed.</small>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={profile.phone || ''}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="Enter your phone number"
                />
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <input
                  type="date"
                  value={profile.dateOfBirth || ''}
                  onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label>Address</label>
              <textarea
                value={profile.address || ''}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Enter your address"
                rows={3}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => detectAddress((loc) => {
                    setProfile(prev => ({
                      ...prev,
                      address: loc.address || prev.address || '',
                      country: loc.countryCode || prev.country || '',
                      city: loc.city || prev.city || '',
                      area: loc.area || prev.area || '',
                      region: loc.region || prev.region || '',
                      street: loc.street || prev.street || '',
                      latitude: loc.latitude ?? prev.latitude ?? null,
                      longitude: loc.longitude ?? prev.longitude ?? null,
                    }));
                  })}
                  disabled={locating}
                >
                  {locating ? 'Detecting…' : 'Use current location'}
                </button>
                {locationMsg ? <small>{locationMsg}</small> : null}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Country</label>
                <input type="text" value={profile.country || ''} onChange={(e) => handleInputChange('country', e.target.value)} placeholder="e.g. GH" />
              </div>
              <div className="form-group">
                <label>City</label>
                <input type="text" value={profile.city || ''} onChange={(e) => handleInputChange('city', e.target.value)} placeholder="e.g. Accra" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Area / Locality</label>
                <input type="text" value={profile.area || ''} onChange={(e) => handleInputChange('area', e.target.value)} placeholder="e.g. East Legon" />
              </div>
              <div className="form-group">
                <label>Region / State</label>
                <input type="text" value={profile.region || ''} onChange={(e) => handleInputChange('region', e.target.value)} placeholder="e.g. Greater Accra" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Street</label>
                <input type="text" value={profile.street || ''} onChange={(e) => handleInputChange('street', e.target.value)} placeholder="e.g. Liberation Road" />
              </div>
              <div className="form-group">
                <label>Ghana Digital Address (optional)</label>
                <input type="text" value={profile.ghanaDigitalAddress || ''} onChange={(e) => handleInputChange('ghanaDigitalAddress', e.target.value)} placeholder="e.g. GA-123-4567" />
              </div>
            </div>
            
            <div className="form-group">
              <label>Emergency Contact</label>
              <input
                type="text"
                value={profile.emergencyContact || ''}
                onChange={(e) => handleInputChange('emergencyContact', e.target.value)}
                placeholder="Name and phone number of emergency contact"
              />
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="profile-section">
          <h2 className="section-title">
            <Shield size={24} />
            Preferences & Settings
          </h2>
          <div className="preferences-form">
            <div className="form-group">
              <label>Preferred Communication Method</label>
              <select
                value={profile.preferences?.communication || 'email'}
                onChange={(e) => handlePreferenceChange('communication', e.target.value)}
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="sms">SMS</option>
                <option value="app">In-App Notifications</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Privacy Level</label>
              <select
                value={profile.preferences?.privacy || 'standard'}
                onChange={(e) => handlePreferenceChange('privacy', e.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="enhanced">Enhanced</option>
                <option value="maximum">Maximum</option>
              </select>
            </div>
            
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={profile.preferences?.notifications || false}
                  onChange={(e) => handlePreferenceChange('notifications', e.target.checked)}
                />
                <span>Receive email notifications</span>
              </label>
              
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={profile.preferences?.reminders || false}
                  onChange={(e) => handlePreferenceChange('reminders', e.target.checked)}
                />
                <span>Receive session reminders</span>
              </label>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="profile-section">
          <h2 className="section-title">
            <Shield size={24} />
            Security
          </h2>
          <div className="security-actions">
            <button 
              className="btn-secondary"
              onClick={() => setShowPasswordForm(!showPasswordForm)}
            >
              <Edit size={20} />
              Change Password
            </button>
          </div>
          
          {showPasswordForm && (
            <form onSubmit={handlePasswordChange} className="password-form">
              <div className="form-group">
                <label>Current Password</label>
                <div className="password-input">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                    placeholder="Enter current password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('current')}
                    className="password-toggle"
                  >
                    {showPasswords.current ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              
              <div className="form-group">
                <label>New Password</label>
                <div className="password-input">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                    placeholder="Enter new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('new')}
                    className="password-toggle"
                  >
                    {showPasswords.new ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              
              <div className="form-group">
                <label>Confirm New Password</label>
                <div className="password-input">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                    placeholder="Confirm new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('confirm')}
                    className="password-toggle"
                  >
                    {showPasswords.confirm ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  Update Password
                </button>
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    setPasswordError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}


