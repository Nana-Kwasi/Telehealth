import React from 'react';

export default function ClientSupport() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Feedback & Support</h1>
      <p className="subtitle">Rate your sessions and get help when you need it</p>
      
      <div className="support-container">
        <div className="support-card">
          <h3>Rate Your Session</h3>
          <p>Share your experience with your therapist</p>
          <div className="rating-stars">
            ⭐⭐⭐⭐⭐
          </div>
          <button className="btn primary">Submit Rating</button>
        </div>
        
        <div className="support-card">
          <h3>Contact Support</h3>
          <p>Get help with technical issues or questions</p>
          <button className="btn">Contact Us</button>
        </div>
        
        <div className="support-card">
          <h3>FAQ</h3>
          <p>Find answers to common questions</p>
          <button className="btn">View FAQs</button>
        </div>
      </div>
    </div>
  );
}
