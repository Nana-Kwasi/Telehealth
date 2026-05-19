import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { submitPatientFeedback } from '../../services/homeCareService';
import './HomeCare.css';

export default function HomeCareFeedback() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await submitPatientFeedback(bookingId, { rating, review: review.trim() });
      navigate(`/home-care/booking/${bookingId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hc-page">
      <p><Link to={`/home-care/booking/${bookingId}`}>← Back</Link></p>
      <h1>Rate your visit</h1>
      <form className="hc-form hc-card" onSubmit={submit}>
        <label>Rating</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className="hc-chip" onClick={() => setRating(n)}>{n <= rating ? '★' : '☆'}</button>
          ))}
        </div>
        <label>Review</label>
        <textarea rows={4} value={review} onChange={(e) => setReview(e.target.value)} />
        <button type="submit" className="hc-btn" disabled={saving}>{saving ? 'Saving…' : 'Submit'}</button>
      </form>
    </div>
  );
}
