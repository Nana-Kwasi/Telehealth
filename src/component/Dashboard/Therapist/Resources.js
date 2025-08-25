import React from 'react';

export default function TherapistResources() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Resources & Training</h1>
      <p className="subtitle">Access therapist guidelines and training materials</p>
      
      <div className="resources-grid">
        <div className="resource-card">
          <h3>Therapist Guidelines</h3>
          <p>Best practices and professional standards</p>
        </div>
        <div className="resource-card">
          <h3>Training Materials</h3>
          <p>Continuing education and skill development</p>
        </div>
        <div className="resource-card">
          <h3>Community Forum</h3>
          <p>Connect with other therapists</p>
        </div>
      </div>
    </div>
  );
}
