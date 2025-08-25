import React from 'react';

export default function ClientResources() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Resources & Self-Help</h1>
      <p className="subtitle">Tools and materials to support your therapy journey</p>
      
      <div className="resources-grid">
        <div className="resource-card">
          <h3>Articles</h3>
          <p>Read helpful articles about mental health and wellness</p>
        </div>
        <div className="resource-card">
          <h3>Exercises</h3>
          <p>Practice coping strategies and mindfulness exercises</p>
        </div>
        <div className="resource-card">
          <h3>Journaling</h3>
          <p>Track your thoughts and progress</p>
        </div>
      </div>
    </div>
  );
}
