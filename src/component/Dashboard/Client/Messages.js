import React from 'react';

export default function ClientMessages() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Messages</h1>
      <p className="subtitle">Chat with your therapist</p>
      
      <div className="messages-container">
        <div className="chat-placeholder">
          <div className="chat-icon">💬</div>
          <h3>Start a conversation</h3>
          <p>Your messages with your therapist will appear here</p>
          <button className="btn primary">Send Message</button>
        </div>
      </div>
    </div>
  );
}


