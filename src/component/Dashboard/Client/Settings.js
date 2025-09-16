import React, { useEffect, useState } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import './Settings.css';
import { 
  doc, 
  getDoc, 
  updateDoc
} from 'firebase/firestore';
import { 
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
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
  Sun
} from 'lucide-react';

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
                      value={clientData?.country || 'Not specified'}
                      readOnly
                      className="readonly"
                    />
                  </div>
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
          </div>
          )}
        </div>
      </div>
    </div>
  );
}