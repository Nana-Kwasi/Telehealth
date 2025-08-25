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
  CheckCircle
} from 'lucide-react';
import './UserModal.css';

export default function UserModal({ user, mode, onClose, isAdmin }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user.name || '',
    email: user.email || '',
    type: user.type || '',
    role: user.role || '',
    bio: user.bio || '',
    specialties: user.specialties || [],
    licenseNumber: user.licenseNumber || '',
    yearsExperience: user.yearsExperience || 0
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
      <div className="modal-content user-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-content">
            <h2>{mode === 'manage' ? 'Manage User' : 'User Profile'}</h2>
            <p>{user.name}</p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          {/* User Avatar and Basic Info */}
          <div className="user-profile-section">
            <div className="user-avatar-large">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.name} />
              ) : (
                <div className="avatar-placeholder-large">{user.name.charAt(0)}</div>
              )}
            </div>
            <div className="user-basic-info">
              <h3>{user.name}</h3>
              <p className="user-role">{user.role || 'Therapist'}</p>
              <p className="user-type">{user.type || 'Professional'}</p>
            </div>
          </div>

          {/* User Details Form */}
          <div className="user-details-form">
            <div className="form-section">
              <h4>Personal Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>
                    <User size={16} />
                    Full Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="form-input"
                    />
                  ) : (
                    <p className="form-value">{user.name}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>
                    <Mail size={16} />
                    Email
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="form-input"
                    />
                  ) : (
                    <p className="form-value">{user.email}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>
                    <Calendar size={16} />
                    Member Since
                  </label>
                  <p className="form-value">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>

                <div className="form-group">
                  <label>
                    <Shield size={16} />
                    Role
                  </label>
                  {isEditing ? (
                    <select
                      value={editForm.role}
                      onChange={(e) => handleInputChange('role', e.target.value)}
                      className="form-input"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <p className="form-value">{user.role || 'User'}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Professional Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Professional Type</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.type}
                      onChange={(e) => handleInputChange('type', e.target.value)}
                      className="form-input"
                    />
                  ) : (
                    <p className="form-value">{user.type || 'N/A'}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>License Number</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.licenseNumber}
                      onChange={(e) => handleInputChange('licenseNumber', e.target.value)}
                      className="form-input"
                    />
                  ) : (
                    <p className="form-value">{user.licenseNumber || 'N/A'}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>Years of Experience</label>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editForm.yearsExperience}
                      onChange={(e) => handleInputChange('yearsExperience', parseInt(e.target.value))}
                      className="form-input"
                    />
                  ) : (
                    <p className="form-value">{user.yearsExperience || 0} years</p>
                  )}
                </div>

                <div className="form-group full-width">
                  <label>Bio</label>
                  {isEditing ? (
                    <textarea
                      value={editForm.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      className="form-textarea"
                      rows="3"
                    />
                  ) : (
                    <p className="form-value">{user.bio || 'No bio available'}</p>
                  )}
                </div>
              </div>
            </div>

            {user.specialties && user.specialties.length > 0 && (
              <div className="form-section">
                <h4>Specialties</h4>
                <div className="specialties-list">
                  {user.specialties.map((specialty, index) => (
                    <span key={index} className="specialty-tag">
                      {specialty}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {mode === 'manage' && isAdmin ? (
            <div className="admin-actions">
              {isEditing ? (
                <>
                  <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleSave}>
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={handleEdit}>
                    <Edit size={16} />
                    Edit User
                  </button>
                  <button className="btn btn-warning" onClick={handleSuspend}>
                    <AlertTriangle size={16} />
                    Suspend Account
                  </button>
                  <button className="btn btn-danger" onClick={handleDelete}>
                    <Trash2 size={16} />
                    Delete User
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="viewer-actions">
              <button className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
