import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Payment.css';
import TherapistSelectionModal from '../Match/TherapistSelectionModal';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import {
  loadCouple,
  isPaymentAllowed,
  markCouplePaymentComplete,
} from '../../services/coupleTherapyService';

const storageKey = 'th.onboard';

export default function Payment() {
  const navigate = useNavigate();
  const location = useLocation();
  const isCouple = location.state?.therapyType === 'couples' || !!location.state?.coupleId;
  const coupleIdParam = location.state?.coupleId;

  const data = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  }, []);

  const [plan, setPlan] = useState('standard');
  const [pay, setPay] = useState({ card: '', expiry: '', cvc: '' });
  const [showTherapistSelection, setShowTherapistSelection] = useState(false);
  const [checking, setChecking] = useState(isCouple);
  const [blocked, setBlocked] = useState(false);

  const prices = {
    basic: 70,
    standard: 85,
    premium: 100,
  };

  useEffect(() => {
    if (!isCouple) return;
    (async () => {
      const id = coupleIdParam || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
      if (!id) {
        setChecking(false);
        return;
      }
      const couple = await loadCouple(id);
      if (!isPaymentAllowed(couple)) {
        setBlocked(true);
        navigate('/couple/dashboard', { state: { coupleId: id }, replace: true });
        return;
      }
      if (couple?.paymentComplete) {
        navigate('/match-therapist', { state: { coupleId: id, therapyType: 'couples' }, replace: true });
        return;
      }
      setChecking(false);
    })();
  }, [isCouple, coupleIdParam, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    localStorage.setItem(
      'th.subscription',
      JSON.stringify({
        plan,
        price: prices[plan],
        activatedAt: new Date().toISOString(),
      }),
    );

    if (isCouple) {
      const coupleId = coupleIdParam || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
      try {
        await markCouplePaymentComplete(coupleId, plan);
        navigate('/match-therapist', { state: { coupleId, therapyType: 'couples' }, replace: true });
      } catch (err) {
        alert(err.message || 'Could not record payment.');
      }
      return;
    }

    setShowTherapistSelection(true);
  };

  if (checking) {
    return (
      <div className="payment-container">
        <p className="payment-subtitle">Checking couple status…</p>
      </div>
    );
  }

  if (blocked) return null;

  if (showTherapistSelection && !isCouple) {
    return <TherapistSelectionModal />;
  }

  return (
    <div className="payment-container">
      <h1 className="payment-title">{isCouple ? 'Couple therapy plan' : 'Choose your plan'}</h1>
      <p className="payment-subtitle">
        {isCouple
          ? 'One subscription covers both partners. Billed monthly — cancel anytime.'
          : 'Weekly subscription billed monthly. Cancel anytime.'}
      </p>

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
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button type="button" className="pricing-button">
              Select Plan
            </button>
          </div>
        ))}
      </div>

      <div className="payment-form">
        <h3>Payment details</h3>
        <form onSubmit={submit}>
          <div className="form-group full-width">
            <div className="form-label">Card number</div>
            <input
              className="form-input"
              placeholder="4242 4242 4242 4242"
              value={pay.card}
              onChange={(e) => setPay({ ...pay, card: e.target.value })}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <div className="form-label">Expiry</div>
              <input
                className="form-input"
                placeholder="MM/YY"
                value={pay.expiry}
                onChange={(e) => setPay({ ...pay, expiry: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <div className="form-label">CVC</div>
              <input
                className="form-input"
                placeholder="123"
                value={pay.cvc}
                onChange={(e) => setPay({ ...pay, cvc: e.target.value })}
                required
              />
            </div>
          </div>
          <button type="submit" className="pay-button">
            {isCouple ? 'Complete couple payment' : 'Activate subscription'}
          </button>
        </form>
      </div>
    </div>
  );
}
