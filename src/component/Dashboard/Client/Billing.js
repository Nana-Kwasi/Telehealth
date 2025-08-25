import React from 'react';

export default function ClientBilling() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Billing & Subscription</h1>
      <p className="subtitle">Manage your payment and subscription details</p>
      
      <div className="billing-container">
        <div className="billing-card">
          <h3>Current Plan</h3>
          <p>Standard Plan - $85/week</p>
          <button className="btn">Change Plan</button>
        </div>
        
        <div className="billing-card">
          <h3>Payment Method</h3>
          <p>Visa ending in 4242</p>
          <button className="btn">Update Payment</button>
        </div>
        
        <div className="billing-card">
          <h3>Billing History</h3>
          <p>View your transaction history</p>
          <button className="btn">View History</button>
        </div>
      </div>
    </div>
  );
}
