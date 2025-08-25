import React from 'react';

export default function TherapistNotes() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Progress Tracking & Notes</h1>
      <p className="subtitle">Record session notes and track client progress</p>
      
      <div className="notes-container">
        <div className="notes-header">
          <h3>Session Notes</h3>
          <button className="btn primary">Add New Note</button>
        </div>
        
        <div className="notes-list">
          <div className="note-item">
            <div className="note-header">
              <h4>Session with Client Name</h4>
              <span className="note-date">March 15, 2024</span>
            </div>
            <p>Client showed improvement in managing anxiety. Practiced breathing exercises...</p>
            <div className="note-actions">
              <button className="btn">Edit</button>
              <button className="btn">View Full</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


