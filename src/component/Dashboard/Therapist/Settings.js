import React from 'react';

export default function TherapistSettings() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Settings & Profile</h1>
      <p className="subtitle">Update your credentials, bio, and availability</p>
      
      <div className="settings-container">
        <div className="settings-section">
          <h3>Professional Information</h3>
          <div className="form-group">
            <label>Name</label>
            <input type="text" className="form-input" placeholder="Your name" />
          </div>
          <div className="form-group">
            <label>Specialization</label>
            <input type="text" className="form-input" placeholder="Your specialization" />
          </div>
          <div className="form-group">
            <label>Bio</label>
            <textarea className="form-textarea" placeholder="Tell clients about yourself"></textarea>
          </div>
          <button className="btn primary">Save Changes</button>
        </div>
        
        <div className="settings-section">
          <h3>Availability</h3>
          <div className="form-group">
            <label>Working Hours</label>
            <select className="form-select">
              <option>9 AM - 5 PM</option>
              <option>10 AM - 6 PM</option>
              <option>Flexible</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
