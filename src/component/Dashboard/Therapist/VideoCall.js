import React from 'react';

export default function TherapistVideoCall() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Video Call</h1>
      <p className="subtitle">Conduct live therapy sessions</p>
      
      <div className="video-container">
        <div className="video-placeholder">
          <div className="video-icon">📹</div>
          <h3>Video Session</h3>
          <p>Start or join a video call with your client</p>
          <div className="session-tools">
            <button className="btn primary">Start Call</button>
            <button className="btn">Session Timer</button>
            <button className="btn">Take Notes</button>
          </div>
        </div>
      </div>
    </div>
  );
}
