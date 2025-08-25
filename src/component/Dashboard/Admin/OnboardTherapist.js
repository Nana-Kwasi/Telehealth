import React, { useState, useRef } from 'react';
import { db, auth, storage } from '../../Auth/firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { UserPlus, Upload, X } from 'lucide-react';
import './OnboardTherapist.css';

export default function OnboardTherapist() {
  const [form, setForm] = useState({
    name: '',
    type: '',
    username: '',
    email: '',
    password: '',
    role: 'user',
    specialties: '',
    licenseNumber: '',
    yearsExperience: '',
    bio: '',
    photoURL: ''
  });
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef(null);

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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

  const uploadImageToStorage = async (file, uid) => {
    const storageRef = ref(storage, `therapist-profiles/${uid}/${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Create user account
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid = cred.user.uid;
      
      let photoURL = '';
      
      // Upload image if selected
      if (selectedImage) {
        photoURL = await uploadImageToStorage(selectedImage, uid);
      }
      
      const payload = {
        uid,
        name: form.name,
        type: form.type,
        username: form.username,
        email: form.email,
        role: form.role,
        specialties: form.specialties.split(',').map((s) => s.trim()).filter(Boolean),
        licenseNumber: form.licenseNumber,
        yearsExperience: Number(form.yearsExperience || 0),
        bio: form.bio,
        photoURL: photoURL,
        createdAt: new Date().toISOString()
      };
      
      // Save to Firestore
      await setDoc(doc(db, 'therapists', uid), payload);
      await setDoc(doc(collection(db, 'therapists_usernames'), form.username), { uid });
      
      alert('Therapist onboarded successfully!');
      
      // Reset form
      setForm({ 
        name: '', type: '', username: '', email: '', password: '', 
        role: 'user', specialties: '', licenseNumber: '', 
        yearsExperience: '', bio: '', photoURL: '' 
      });
      setSelectedImage(null);
      setImagePreview('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Error onboarding therapist:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboard-therapist">
      <div className="onboard-header">
        <h1 className="page-title">Onboard New Therapist</h1>
        <p className="subtitle">Add a new therapist to the platform</p>
      </div>

      <form className="onboard-form" onSubmit={submit}>
        <div className="form-sections">
          {/* Basic Information */}
          <div className="form-section">
            <h3>Basic Information</h3>
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
                <input
                  id="type"
                  type="text"
                  className="form-input"
                  value={form.type}
                  onChange={(e) => onChange('type', e.target.value)}
                  required
                  placeholder="e.g., Clinical Psychologist"
                />
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
                <label htmlFor="password">Password *</label>
                <input
                  id="password"
                  type="password"
                  className="form-input"
                  value={form.password}
                  onChange={(e) => onChange('password', e.target.value)}
                  required
                  placeholder="Create a password"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  className="form-select"
                  value={form.role}
                  onChange={(e) => onChange('role', e.target.value)}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>

          {/* Professional Details */}
          <div className="form-section">
            <h3>Professional Details</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="specialties">Specialties</label>
                <input
                  id="specialties"
                  type="text"
                  className="form-input"
                  value={form.specialties}
                  onChange={(e) => onChange('specialties', e.target.value)}
                  placeholder="e.g., Anxiety, Depression, PTSD (comma separated)"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="licenseNumber">License Number</label>
                <input
                  id="licenseNumber"
                  type="text"
                  className="form-input"
                  value={form.licenseNumber}
                  onChange={(e) => onChange('licenseNumber', e.target.value)}
                  placeholder="Enter license number"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="yearsExperience">Years of Experience</label>
                <input
                  id="yearsExperience"
                  type="number"
                  min="0"
                  className="form-input"
                  value={form.yearsExperience}
                  onChange={(e) => onChange('yearsExperience', e.target.value)}
                  placeholder="Number of years"
                />
              </div>
            </div>
          </div>

          {/* Profile Image */}
          <div className="form-section">
            <h3>Profile Image</h3>
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

          {/* Bio */}
          <div className="form-section">
            <h3>Professional Bio</h3>
            <div className="form-group">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                className="form-textarea"
                value={form.bio}
                onChange={(e) => onChange('bio', e.target.value)}
                placeholder="Tell clients about your background, approach, and expertise..."
                rows={4}
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => window.history.back()}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Onboarding...' : 'Onboard Therapist'}
          </button>
        </div>
      </form>
    </div>
  );
}


