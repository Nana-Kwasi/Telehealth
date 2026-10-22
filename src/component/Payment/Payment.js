import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Payment.css';
import TherapistSelectionModal from '../Match/TherapistSelectionModal';
import PriceTag from '../Common/PriceTag';
import CheckoutBreakdown from '../Common/CheckoutBreakdown';
import { quotePrice } from '../../services/pricing';
import { auth } from '../../services/firestoreShim';
import { api, getStoredUserId } from '../../services/apiClient';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import { payForBooking } from '../../services/paystack';
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
  // Individual therapy now picks a therapist BEFORE paying, so the amount due is
  // that therapist's own session rate rather than a fixed subscription tier.
  const selectedTherapist = location.state?.therapist || null;
  const therapistFee = Number(selectedTherapist?.sessionRate) || null;

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
  // The server's answer to "what does this cost this person right now".
  // Null until it lands; the card shows the undiscounted fee meanwhile, which
  // is the safe direction — nobody is charged more than they were shown.
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    if (!therapistFee) { setQuote(null); return undefined; }
    let live = true;
    quotePrice({
      serviceType: 'therapy',
      baseAmount: therapistFee,
      providerId: selectedTherapist?.id || null,
    }).then((q) => { if (live) setQuote(q); });
    return () => { live = false; };
  }, [therapistFee, selectedTherapist]);

  // What is actually charged. Reads the SERVER's final amount, never a number
  // this component worked out — a price the payment endpoint has not agreed to
  // is a price it will refuse.
  const amountDue = quote?.discounted ? Number(quote.finalAmount) : therapistFee;

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
        plan: selectedTherapist ? 'per-session' : plan,
        price: amountDue ?? prices[plan],
        // Kept so a refund can find which offer applied.
        promotionId: quote?.discounted ? quote.promotionId : null,
        listPrice: therapistFee ?? prices[plan],
        therapistId: selectedTherapist?.id || null,
        therapistName: selectedTherapist?.name || null,
        activatedAt: new Date().toISOString(),
      }),
    );

    if (isCouple) {
      const coupleId = coupleIdParam || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
      try {
        // Take the payment first; the server only unlocks the couple after it
        // verifies this exact Paystack reference for the plan's price.
        const paid = await payForBooking({
          email: auth.currentUser?.email,
          amount: prices[plan],
          purpose: 'couple_therapy',
          metadata: { coupleId, plan },
        });
        if (!paid.ok) { alert(paid.reason || 'The payment did not go through.'); return; }
        await markCouplePaymentComplete(coupleId, plan, paid.reference);
        navigate('/match-therapist', { state: { coupleId, therapyType: 'couples' }, replace: true });
      } catch (err) {
        alert(err.message || 'Could not record payment.');
      }
      return;
    }

    // Therapist already chosen → record the assignment now that payment is done.
    //
    // This must hit /client-select-therapist. The previous version wrote
    // assignedTherapistId onto the client doc and then setDoc'd
    // therapists/{id}/clients/{clientId} — but the shim no-ops subcollection
    // writes and nothing maps that field into therapist_client_assignments_v2,
    // so the therapist never actually gained the client. (/assignments is the
    // therapist-side endpoint and 403s for a client.)
    //
    // clientId must be the authenticated user id — the endpoint guards
    // requireSelfOrAdmin(clientId), and `th.clientId` is a different namespace.
    if (selectedTherapist?.id) {
      try {
        const clientId = getStoredUserId() || auth.currentUser?.uid;
        if (clientId) {
          await api('/api/v1/therapy-management/client-select-therapist', {
            method: 'POST',
            body: { clientId, therapistId: selectedTherapist.id },
          });
        }
        navigate('/dashboard', { replace: true });
      } catch (err) {
        alert(err.message || 'Payment recorded, but we could not assign your therapist.');
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
      <h1 className="payment-title">
        {selectedTherapist ? 'Confirm and pay' : isCouple ? 'Couple therapy plan' : 'Choose your plan'}
      </h1>
      <p className="payment-subtitle">
        {selectedTherapist
          ? `You are booking ${selectedTherapist.name}. This is their session rate.`
          : isCouple
            ? 'One subscription covers both partners. Billed monthly — cancel anytime.'
            : 'Weekly subscription billed monthly. Cancel anytime.'}
      </p>

      {/* Therapist-first flow: show who was chosen and what they charge, instead of
          the generic subscription tiers. */}
      {selectedTherapist ? (
        <div className="pricing-card featured therapist-charge-card">
          <div className="pricing-name">{selectedTherapist.name}</div>
          {selectedTherapist.specialization ? (
            <div className="pricing-features"><span>{selectedTherapist.specialization}</span></div>
          ) : null}
          <div className="pricing-price">
            <PriceTag quote={quote} baseAmount={therapistFee} size="lg" />
          </div>
          <CheckoutBreakdown amount={amountDue} purpose="therapy_session" />
          <div className="pricing-features">
            <span>{therapistFee != null ? 'per session' : 'This therapist has not published a rate yet.'}</span>
          </div>
          {quote?.discounted ? (
            <div className="pricing-features" style={{ marginTop: '0.35rem' }}>
              <span style={{ color: '#166534', fontWeight: 700 }}>
                {quote.promotionName} — you save GHS {Number(quote.discountAmount).toFixed(2)}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
      <div className="pricing-grid">
        {[
          { key: 'basic', title: 'Basic', price: prices.basic, features: ['Messaging', 'Monthly live session'] },
          { key: 'standard', title: 'Standard', price: prices.standard, features: ['Messaging', 'Bi-weekly live sessions'] },
          { key: 'premium', title: 'Premium', price: prices.premium, features: ['Messaging', 'Weekly live sessions'] },
        ].map((p) => (
          <div key={p.key} className={`pricing-card ${plan === p.key ? 'featured' : ''}`} onClick={() => setPlan(p.key)}>
            <div className="pricing-name">{p.title}</div>
            <div className="pricing-price">GHS {p.price}</div>
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
      )}

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
