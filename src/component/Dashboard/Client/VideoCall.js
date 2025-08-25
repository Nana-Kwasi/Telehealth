import React from 'react';

export default function ClientVideoCall() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Video Call</h1>
      <p className="subtitle">Connect with your therapist</p>
      
      <div className="video-container">
        <div className="video-placeholder">
          <div className="video-icon">📹</div>
          <h3>Video Session</h3>
          <p>Start or join a video call with your therapist</p>
          <button className="btn primary">Start Call</button>
        </div>
      </div>
    </div>
  );
}
