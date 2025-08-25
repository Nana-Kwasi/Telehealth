import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Payment.css';
import TherapistSelectionModal from '../Match/TherapistSelectionModal';

const storageKey = 'th.onboard';

export default function Payment() {
  const navigate = useNavigate();
  const data = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
  }, []);
  const [plan, setPlan] = useState('standard');
  const [pay, setPay] = useState({ card: '', expiry: '', cvc: '' });
  const [showTherapistSelection, setShowTherapistSelection] = useState(false);
  const prices = {
    basic: 70,
    standard: 85,
    premium: 100
  };

  const submit = (e) => {
    e.preventDefault();
    // Mock activation - in real app, this would process payment
    localStorage.setItem('th.subscription', JSON.stringify({ 
      plan, 
      price: prices[plan], 
      activatedAt: new Date().toISOString()
    }));
    
    // Show therapist selection modal instead of navigating
    setShowTherapistSelection(true);
  };

  if (showTherapistSelection) {
    return <TherapistSelectionModal />;
  }

  return (
    <div className="payment-container">
      <h1 className="payment-title">Choose your plan</h1>
      <p className="payment-subtitle">Weekly subscription billed monthly. Cancel anytime.</p>

      <div className="pricing-grid">
        {[
          { key: 'basic', title: 'Basic', price: prices.basic, features: ['Messaging', 'Monthly live session'] },
          { key: 'standard', title: 'Standard', price: prices.standard, features: ['Messaging', 'Bi-weekly live sessions'] },
          { key: 'premium', title: 'Premium', price: prices.premium, features: ['Messaging', 'Weekly live sessions'] },
        ].map((p) => (
          <div key={p.key} className={`pricing-card ${plan === p.key ? 'featured' : ''}`} onClick={() => setPlan(p.key)}>
            <div className="pricing-name">{p.title}</div>
            <div className="pricing-price">${p.price}</div>
            <div className="pricing-period">/week</div>
            <ul className="pricing-features">
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button className="pricing-button">Select Plan</button>
          </div>
        ))}
      </div>

      <div className="payment-form">
        <h3>Payment details</h3>
        <form onSubmit={submit}>
          <div className="form-group full-width">
            <div className="form-label">Card number</div>
            <input className="form-input" placeholder="4242 4242 4242 4242" value={pay.card} onChange={(e) => setPay({ ...pay, card: e.target.value })} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <div className="form-label">Expiry</div>
              <input className="form-input" placeholder="MM/YY" value={pay.expiry} onChange={(e) => setPay({ ...pay, expiry: e.target.value })} required />
            </div>
            <div className="form-group">
              <div className="form-label">CVC</div>
              <input className="form-input" placeholder="123" value={pay.cvc} onChange={(e) => setPay({ ...pay, cvc: e.target.value })} required />
            </div>
          </div>
          <button type="submit" className="pay-button">Activate subscription</button>
        </form>
      </div>
    </div>
  );
}


