import React from 'react';

export default function TherapistClients() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Client List & Profiles</h1>
      <p className="subtitle">Manage your assigned clients</p>
      
      <div className="clients-container">
        <div className="clients-header">
          <h3>Assigned Clients</h3>
          <button className="btn primary">Add New Client</button>
        </div>
        
        <div className="clients-list">
          <div className="client-item">
            <div className="client-avatar">C</div>
            <div className="client-info">
              <h4>Client Name</h4>
              <p>Individual Therapy • Last session: 2 days ago</p>
            </div>
            <button className="btn">View Profile</button>
          </div>
        </div>
      </div>
    </div>
  );
}
