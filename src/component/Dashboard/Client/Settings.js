import React from 'react';

export default function ClientSettings() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Settings & Profile</h1>
      <p className="subtitle">Update your personal information and preferences</p>
      
      <div className="settings-container">
        <div className="settings-section">
          <h3>Personal Information</h3>
          <div className="form-group">
            <label>Name</label>
            <input type="text" className="form-input" placeholder="Your name" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" className="form-input" placeholder="your@email.com" />
          </div>
          <button className="btn primary">Save Changes</button>
        </div>
        
        <div className="settings-section">
          <h3>Notification Preferences</h3>
          <div className="form-group">
            <label>
              <input type="checkbox" /> Email notifications
            </label>
          </div>
          <div className="form-group">
            <label>
              <input type="checkbox" /> SMS notifications
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
