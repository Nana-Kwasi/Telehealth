import React, { useState } from 'react';
import { 
  X, 
  Edit, 
  Trash2, 
  User, 
  Mail, 
  Calendar, 
  Shield,
  AlertTriangle,
  CheckCircle,
  Phone,
  GraduationCap,
  MapPin,
  Clock,
  DollarSign,
  Languages,
  Users,
  FileText,
  Award,
  Building
} from 'lucide-react';
import './UserModal.css';
import { resolveFileUrl } from '../../../utils/fileUrl';

export default function UserModal({ user, mode, onClose, isAdmin }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    type: user.type || '',
    role: user.role || '',
    bio: user.bio || '',
    specialties: user.specialties || [],
    licenseNumber: user.licenseNumber || '',
    licensingAuthority: user.licensingAuthority || '',
    licenseIssueDate: user.licenseIssueDate || '',
    licenseExpiryDate: user.licenseExpiryDate || '',
    yearsExperience: user.yearsExperience || 0,
    languagesSpoken: user.languagesSpoken || [],
    ageGroupsServed: user.ageGroupsServed || [],
    practiceName: user.practiceName || '',
    practiceAddress: user.practiceAddress || '',
    consultationMode: user.consultationMode || '',
    availability: user.availability || '',
    sessionDuration: user.sessionDuration || 60,
    consultationFee: user.consultationFee || 0,
    education: user.education || '',
    workExperience: user.workExperience || '',
    therapyApproaches: user.therapyApproaches || []
  });

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      // Here you would update the user in Firestore
      console.log('Saving user data:', editForm);
      setIsEditing(false);
      // In real app: await updateDoc(doc(db, 'therapists', user.id), editForm);
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${user.name}? This action cannot be undone.`)) {
      try {
        // Here you would delete the user from Firestore
        console.log('Deleting user:', user.id);
        onClose();
        // In real app: await deleteDoc(doc(db, 'therapists', user.id));
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  const handleSuspend = async () => {
    if (window.confirm(`Are you sure you want to suspend ${user.name}?`)) {
      try {
        // Here you would update the user status in Firestore
        console.log('Suspending user:', user.id);
        // In real app: await updateDoc(doc(db, 'therapists', user.id), { status: 'suspended' });
      } catch (error) {
        console.error('Error suspending user:', error);
      }
    }
  };

  const handleInputChange = (field, value) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="user-management-modal" onClick={(e) => e.stopPropagation()}>
        <div className="user-modal-header">
          <div className="user-modal-header-content">
            <h2>{mode === 'manage' ? 'Manage User' : 'User Profile'}</h2>
            <p>{user.name}</p>
          </div>
          <button className="user-modal-close-button" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="user-modal-body">
          {/* User Avatar and Basic Info */}
          <div className="user-profile-info-section">
            <div className="user-profile-avatar-large">
              {user.photoURL ? (
                <img src={resolveFileUrl(user.photoURL)} alt={user.name} />
              ) : (
                <div className="user-profile-avatar-placeholder">{user.name.charAt(0)}</div>
              )}
            </div>
            <div className="user-profile-basic-info">
              <h3>{user.name}</h3>
              <p className="user-profile-role">{user.role || 'Therapist'}</p>
              <p className="user-profile-type">{user.type || 'Professional'}</p>
              <p className="user-profile-experience">{user.yearsExperience || 0} years experience</p>
            </div>
          </div>

          {/* User Details Form */}
          <div className="user-details-form-container">
            {/* Account Information */}
            <div className="user-form-section">
              <h4>📝 Account Information</h4>
              <div className="user-form-grid">
                <div className="user-form-group">
                  <label>
                    <User size={16} />
                    Full Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.name}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>
                    <Mail size={16} />
                    Email
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.email}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>
                    <Phone size={16} />
                    Phone Number
                  </label>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.phone || 'N/A'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>
                    <Shield size={16} />
                    Role
                  </label>
                  {isEditing ? (
                    <select
                      value={editForm.role}
                      onChange={(e) => handleInputChange('role', e.target.value)}
                      className="user-form-input"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <p className="user-form-value">{user.role || 'User'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>
                    <Calendar size={16} />
                    Member Since
                  </label>
                  <p className="user-form-value">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Professional Credentials */}
            <div className="user-form-section">
              <h4>🎓 Professional Credentials</h4>
              <div className="user-form-grid">
                <div className="user-form-group">
                  <label>Professional Type</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.type}
                      onChange={(e) => handleInputChange('type', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.type || 'N/A'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>License Number</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.licenseNumber}
                      onChange={(e) => handleInputChange('licenseNumber', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.licenseNumber || 'N/A'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>Licensing Authority</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.licensingAuthority}
                      onChange={(e) => handleInputChange('licensingAuthority', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.licensingAuthority || 'N/A'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>License Issue Date</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editForm.licenseIssueDate}
                      onChange={(e) => handleInputChange('licenseIssueDate', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.licenseIssueDate || 'N/A'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>License Expiry Date</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editForm.licenseExpiryDate}
                      onChange={(e) => handleInputChange('licenseExpiryDate', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.licenseExpiryDate || 'N/A'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>Years of Experience</label>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editForm.yearsExperience}
                      onChange={(e) => handleInputChange('yearsExperience', parseInt(e.target.value))}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.yearsExperience || 0} years</p>
                  )}
                </div>

                <div className="form-group full-width">
                  <label>Specialization(s) / Areas of Focus</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={Array.isArray(editForm.specialties) ? editForm.specialties.join(', ') : editForm.specialties}
                      onChange={(e) => handleInputChange('specialties', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      className="user-form-input"
                      placeholder="e.g., Anxiety, Depression, PTSD"
                    />
                  ) : (
                    <p className="user-form-value">
                      {Array.isArray(user.specialties) ? user.specialties.join(', ') : user.specialties || 'N/A'}
                    </p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>
                    <Languages size={16} />
                    Languages Spoken
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={Array.isArray(editForm.languagesSpoken) ? editForm.languagesSpoken.join(', ') : editForm.languagesSpoken}
                      onChange={(e) => handleInputChange('languagesSpoken', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      className="user-form-input"
                      placeholder="e.g., English, Spanish, French"
                    />
                  ) : (
                    <p className="user-form-value">
                      {Array.isArray(user.languagesSpoken) ? user.languagesSpoken.join(', ') : user.languagesSpoken || 'N/A'}
                    </p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>
                    <Users size={16} />
                    Age Groups Served
                  </label>
                  {isEditing ? (
                    <div className="user-checkbox-group">
                      {['Children', 'Adolescents', 'Adults', 'Elderly'].map(ageGroup => (
                        <label key={ageGroup} className="user-checkbox-label">
                          <input
                            type="checkbox"
                            checked={editForm.ageGroupsServed.includes(ageGroup)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleInputChange('ageGroupsServed', [...editForm.ageGroupsServed, ageGroup]);
                              } else {
                                handleInputChange('ageGroupsServed', editForm.ageGroupsServed.filter(ag => ag !== ageGroup));
                              }
                            }}
                          />
                          {ageGroup}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="user-form-value">
                      {Array.isArray(user.ageGroupsServed) && user.ageGroupsServed.length > 0 
                        ? user.ageGroupsServed.join(', ') 
                        : 'N/A'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Practice Details */}
            <div className="user-form-section">
              <h4>🏥 Practice Details</h4>
              <div className="user-form-grid">
                <div className="user-form-group">
                  <label>
                    <Building size={16} />
                    Practice / Clinic Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.practiceName}
                      onChange={(e) => handleInputChange('practiceName', e.target.value)}
                      className="user-form-input"
                    />
                  ) : (
                    <p className="user-form-value">{user.practiceName || 'N/A'}</p>
                  )}
                </div>

                <div className="form-group full-width">
                  <label>
                    <MapPin size={16} />
                    Practice Address
                  </label>
                  {isEditing ? (
                    <textarea
                      value={editForm.practiceAddress}
                      onChange={(e) => handleInputChange('practiceAddress', e.target.value)}
                      className="user-form-textarea"
                      rows="2"
                    />
                  ) : (
                    <p className="user-form-value">{user.practiceAddress || 'N/A'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>Consultation Mode</label>
                  {isEditing ? (
                    <select
                      value={editForm.consultationMode}
                      onChange={(e) => handleInputChange('consultationMode', e.target.value)}
                      className="user-form-input"
                    >
                      <option value="">Select mode</option>
                      <option value="In-person">In-person</option>
                      <option value="Online">Online</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  ) : (
                    <p className="user-form-value">{user.consultationMode || 'N/A'}</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>
                    <Clock size={16} />
                    Session Duration
                  </label>
                  {isEditing ? (
                    <select
                      value={editForm.sessionDuration}
                      onChange={(e) => handleInputChange('sessionDuration', parseInt(e.target.value))}
                      className="user-form-input"
                    >
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">60 minutes</option>
                      <option value="90">90 minutes</option>
                    </select>
                  ) : (
                    <p className="user-form-value">{user.sessionDuration || 60} minutes</p>
                  )}
                </div>

                <div className="user-form-group">
                  <label>
                    <DollarSign size={16} />
                    Consultation Fee
                  </label>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editForm.consultationFee}
                      onChange={(e) => handleInputChange('consultationFee', parseFloat(e.target.value))}
                      className="user-form-input"
                      step="0.01"
                    />
                  ) : (
                    <p className="user-form-value">${user.consultationFee || 0}</p>
                  )}
                </div>

                <div className="form-group full-width">
                  <label>Availability</label>
                  {isEditing ? (
                    <textarea
                      value={editForm.availability}
                      onChange={(e) => handleInputChange('availability', e.target.value)}
                      className="user-form-textarea"
                      rows="2"
                      placeholder="e.g., Monday-Friday: 9AM-5PM"
                    />
                  ) : (
                    <p className="user-form-value">{user.availability || 'N/A'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Background & Bio */}
            <div className="user-form-section">
              <h4>📚 Background & Bio</h4>
              <div className="user-form-grid">
                <div className="form-group full-width">
                  <label>Short Biography</label>
                  {isEditing ? (
                    <textarea
                      value={editForm.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      className="user-form-textarea"
                      rows="3"
                    />
                  ) : (
                    <p className="user-form-value">{user.bio || 'No bio available'}</p>
                  )}
                </div>

                <div className="form-group full-width">
                  <label>
                    <GraduationCap size={16} />
                    Education
                  </label>
                  {isEditing ? (
                    <textarea
                      value={editForm.education}
                      onChange={(e) => handleInputChange('education', e.target.value)}
                      className="user-form-textarea"
                      rows="2"
                      placeholder="Degree, Institution, Year"
                    />
                  ) : (
                    <p className="user-form-value">{user.education || 'N/A'}</p>
                  )}
              </div>

                <div className="form-group full-width">
                  <label>
                    <FileText size={16} />
                    Previous Work Experience
                  </label>
                  {isEditing ? (
                    <textarea
                      value={editForm.workExperience}
                      onChange={(e) => handleInputChange('workExperience', e.target.value)}
                      className="user-form-textarea"
                      rows="2"
                    />
                  ) : (
                    <p className="user-form-value">{user.workExperience || 'N/A'}</p>
                  )}
            </div>

                <div className="form-group full-width">
                  <label>
                    <Award size={16} />
                    Therapy Approaches / Modalities
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={Array.isArray(editForm.therapyApproaches) ? editForm.therapyApproaches.join(', ') : editForm.therapyApproaches}
                      onChange={(e) => handleInputChange('therapyApproaches', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      className="user-form-input"
                      placeholder="e.g., CBT, DBT, EMDR"
                    />
                  ) : (
                    <p className="user-form-value">
                      {Array.isArray(user.therapyApproaches) ? user.therapyApproaches.join(', ') : user.therapyApproaches || 'N/A'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="user-modal-footer">
          {mode === 'manage' && isAdmin ? (
            <div className="user-admin-actions">
              {isEditing ? (
                <>
                  <button className="user-modal-btn user-modal-btn-secondary" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                  <button className="user-modal-btn user-modal-btn-primary" onClick={handleSave}>
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button className="user-modal-btn user-modal-btn-secondary" onClick={handleEdit}>
                    <Edit size={16} />
                    Edit User
                  </button>
                  <button className="user-modal-btn user-modal-btn-warning" onClick={handleSuspend}>
                    <AlertTriangle size={16} />
                    Suspend Account
                  </button>
                  <button className="user-modal-btn user-modal-btn-danger" onClick={handleDelete}>
                    <Trash2 size={16} />
                    Delete User
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="user-viewer-actions">
              <button className="user-modal-btn user-modal-btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
