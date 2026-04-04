import React, { useState, useEffect } from 'react';
import { Star, Search, MessageSquare } from 'lucide-react';
import { db } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, serverTimestamp } from 'firebase/firestore';

export default function DoctorReviews({ profile }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (profile?.id) loadReviews();
  }, [profile]);

  const loadReviews = async () => {
    try {
      const q = query(
        collection(db, 'doctorReviews'),
        where('doctorId', '==', profile.id),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Error loading reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (reviewId) => {
    if (!replyText.trim()) return;
    try {
      await updateDoc(doc(db, 'doctorReviews', reviewId), {
        doctorReply: replyText.trim(),
        doctorReplyDate: serverTimestamp(),
      });
      setReviews(prev =>
        prev.map(r => r.id === reviewId ? { ...r, doctorReply: replyText.trim() } : r)
      );
      setReplyingTo(null);
      setReplyText('');
    } catch (error) {
      console.error('Error submitting reply:', error);
    }
  };

  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} size={14} fill={i < rating ? '#f59e0b' : 'none'} color={i < rating ? '#f59e0b' : '#cbd5e1'} />
    ));
  };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '0.0';

  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    percent: reviews.length ? (reviews.filter(r => r.rating === star).length / reviews.length) * 100 : 0,
  }));

  const filtered = reviews.filter(r => {
    if (filter !== 'all' && r.rating !== Number(filter)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (r.clientName && r.clientName.toLowerCase().includes(q)) ||
             (r.comment && r.comment.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Patient Reviews</h1>
        <p>View feedback and respond to patient reviews</p>
      </div>

      {/* Rating Summary */}
      <div className="doctor-card">
        <h3>Rating Overview</h3>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '3rem', fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1 }}>{avgRating}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 2, margin: '0.5rem 0' }}>
              {renderStars(Math.round(Number(avgRating)))}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>{reviews.length} reviews</p>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            {ratingDistribution.map(({ star, count, percent }) => (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', width: 40 }}>{star} star</span>
                <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${percent}%`, height: '100%', background: '#f59e0b', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', width: 24, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['all', 'All'], ['5', '5 Stars'], ['4', '4 Stars'], ['3', '3 Stars'], ['2', '2 Stars'], ['1', '1 Star']].map(([key, label]) => (
          <button key={key}
            className={`doctor-btn doctor-btn-sm ${filter === key ? 'doctor-btn-primary' : 'doctor-btn-outline'}`}
            onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="doctor-search">
        <Search size={18} color="#94a3b8" />
        <input placeholder="Search reviews by patient or content..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <div className="doctor-card">
        <h3>Reviews ({filtered.length})</h3>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading reviews...</p>
        ) : filtered.length === 0 ? (
          <div className="doctor-empty-state">
            <Star size={40} />
            <h3>{searchQuery || filter !== 'all' ? 'No matching reviews' : 'No reviews yet'}</h3>
            <p>Patient reviews will appear here after consultations.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map(review => (
              <div key={review.id} style={{
                padding: '1rem 1.25rem', background: '#f8fafc', borderRadius: 10,
                borderLeft: `4px solid ${review.rating >= 4 ? '#10b981' : review.rating >= 3 ? '#f59e0b' : '#ef4444'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
                        {review.clientName || 'Patient'}
                      </span>
                      <div style={{ display: 'flex', gap: 1 }}>{renderStars(review.rating)}</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {review.date || (review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString() : '')}
                    </span>
                  </div>
                  {!review.doctorReply && (
                    <button className="doctor-btn doctor-btn-sm doctor-btn-outline"
                      onClick={() => { setReplyingTo(review.id); setReplyText(''); }}>
                      <MessageSquare size={12} /> Reply
                    </button>
                  )}
                </div>

                <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
                  {review.comment || 'No comment provided.'}
                </p>

                {/* Doctor Reply */}
                {review.doctorReply && (
                  <div style={{
                    marginTop: '0.75rem', padding: '0.75rem', background: '#e8f1fb',
                    borderRadius: 8, borderLeft: '3px solid #1e6bb8',
                  }}>
                    <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', fontWeight: 600, color: '#1e6bb8' }}>
                      Your Reply
                    </p>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e293b' }}>{review.doctorReply}</p>
                  </div>
                )}

                {/* Reply Form */}
                {replyingTo === review.id && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <input className="doctor-form-input" placeholder="Write a reply..."
                      value={replyText} onChange={e => setReplyText(e.target.value)}
                      style={{ flex: 1 }} />
                    <button className="doctor-btn doctor-btn-sm doctor-btn-primary"
                      onClick={() => handleReply(review.id)} disabled={!replyText.trim()}>
                      Send
                    </button>
                    <button className="doctor-btn doctor-btn-sm doctor-btn-outline"
                      onClick={() => setReplyingTo(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
