import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../../services/firestoreShim';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  query, where, updateDoc, arrayUnion, serverTimestamp,
} from '../../services/firestoreShim';
import './DoctorProfilePage.css';
import { savePendingBooking } from '../../utils/pendingDoctorBooking';
import { payForBooking } from '../../services/paystack';

function getInitials(name) {
  if (!name) return 'Dr';
  const parts = name.trim().split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function getConsultTypes(types) {
  if (!types) return [];
  if (Array.isArray(types)) return types;
  if (typeof types === 'object') return Object.entries(types).filter(([, v]) => v).map(([k]) => k);
  return [];
}

function StarRow({ rating }) {
  return (
    <span className="dp-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < Math.round(rating) ? 'dp-star filled' : 'dp-star'}>★</span>
      ))}
    </span>
  );
}

export default function DoctorProfilePage({ session }) {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [doctor, setDoctor] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('about');
  const [consultType, setConsultType] = useState('video');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [reason, setReason] = useState('');
  const [bookingState, setBookingState] = useState({ status: null, error: '' });

  useEffect(() => { loadData(); }, [doctorId]);

  // Auto-fill pending booking after return from signup
  useEffect(() => {
    if (searchParams.get('pending') !== '1') return;
    if (!session?.role || !doctor) return;
    const pending = JSON.parse(localStorage.getItem('th.pendingBooking') || 'null');
    if (pending?.doctorId === doctorId) {
      setSelectedDate(pending.date || '');
      setSelectedSlot(pending.time || '');
      setConsultType(pending.consultationType || 'video');
      setReason(pending.reason || '');
      setActiveTab('book');
      localStorage.removeItem('th.pendingBooking');
    }
  }, [doctor, session, searchParams]);

  const generateDefaultSlots = () => {
    const result = [];
    const d = new Date();
    d.setDate(d.getDate() + 1); // start from tomorrow
    let count = 0;
    while (count < 7) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) { // Mon–Fri only
        const dateStr = d.toISOString().split('T')[0];
        const times = [];
        for (let h = 9; h < 17; h++) {
          times.push(`${String(h).padStart(2, '0')}:00`);
          times.push(`${String(h).padStart(2, '0')}:30`);
        }
        result.push({ id: `default-${dateStr}`, date: dateStr, slots: times, booked: [], isDefault: true });
        count++;
      }
      d.setDate(d.getDate() + 1);
    }
    return result;
  };

  const loadData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [doctorSnap, availSnap, reviewsSnap] = await Promise.all([
        getDoc(doc(db, 'doctors', doctorId)),
        getDocs(query(collection(db, 'doctorAvailability'), where('doctorId', '==', doctorId))),
        getDocs(query(collection(db, 'doctorReviews'), where('doctorId', '==', doctorId))),
      ]);

      if (doctorSnap.exists()) {
        const d = { id: doctorSnap.id, ...doctorSnap.data() };
        setDoctor(d);
        const types = getConsultTypes(d.consultationTypes);
        if (types.length > 0) setConsultType(types[0]);
      }

      const slots = availSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));

      // If doctor hasn't set up availability, generate default Mon–Fri 9am–5pm slots
      setAvailability(slots.length > 0 ? slots : generateDefaultSlots());

      const rv = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      rv.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReviews(rv);
    } catch (err) {
      console.error('Error loading doctor:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSlotsForDate = (date) => {
    const avail = availability.find(a => a.date === date);
    if (!avail) return [];
    return (avail.slots || []).filter(s => !(avail.booked || []).includes(s));
  };

  const handleBook = async () => {
    // Auth check FIRST — redirect to signup immediately without requiring date/time
    if (!session?.role) {
      savePendingBooking({
        doctorId,
        doctorName: doctor.name,
        doctorSpecialization: doctor.specialization || '',
        date: selectedDate,
        time: selectedSlot,
        consultationType: consultType,
        reason,
      });
      navigate('/signup');
      return;
    }

    if (!selectedDate || !selectedSlot) {
      setBookingState({ status: 'error', error: 'Please select a date and time slot.' });
      return;
    }

    setBookingState({ status: 'loading', error: '' });
    try {
      const availDoc = availability.find(a => a.date === selectedDate);

      const clientId = session.profile.id;
      const clientName = session.profile.name || session.profile.displayName || 'Patient';

      // Booking a doctor from their public profile charged nothing at all.
      const fee = Number(doctor?.consultationFee ?? 0);
      const paid = await payForBooking({
        email: session.profile?.email,
        amount: fee,
        purpose: 'medical',
        metadata: { doctorId, patientId: clientId },
      });

      if (!paid.ok) {
        setBookingState({ status: 'error', error: paid.reason || 'Payment was not completed.' });
        return;
      }

      await addDoc(collection(db, 'doctorAppointments'), {
        paymentReference: paid.reference,
        consultationFee: paid.amount,
        doctorId,
        doctorName: doctor.name,
        doctorSpecialization: doctor.specialization || '',
        clientId,
        clientName,
        date: selectedDate,
        time: selectedSlot,
        consultationType: consultType,
        reason: reason || '',
        status: 'pending',
        sourceSlot: availDoc?.isDefault ? 'auto-generated' : 'configured',
        createdAt: serverTimestamp(),
      });

      // Register patient in doctor's subcollection immediately (not waiting for confirmation)
      await setDoc(doc(db, 'doctors', doctorId, 'patients', clientId), {
        patientId: clientId,
        name: clientName,
        email: session.profile.email || '',
        addedAt: serverTimestamp(),
      }, { merge: true });

      // Mark slot as booked (only for real Firestore availability docs)
      if (availDoc && !availDoc.isDefault) {
        await updateDoc(doc(db, 'doctorAvailability', availDoc.id), {
          booked: arrayUnion(selectedSlot),
        });
      }
      setAvailability(prev => prev.map(a =>
        a.date === selectedDate ? { ...a, booked: [...(a.booked || []), selectedSlot] } : a
      ));

      setBookingState({ status: 'confirmed', error: '' });
    } catch (err) {
      console.error('Booking error:', err);
      setBookingState({ status: 'error', error: 'Booking failed. Please try again.' });
    }
  };

  const shortDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dayName = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  if (loading) {
    return (
      <div className="dp-loading-screen">
        <div className="dp-spinner" />
        <p>Loading profile…</p>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="dp-not-found">
        <h2>Doctor not found</h2>
        <button className="dp-back-link" onClick={() => navigate('/doctors')}>← Back to search</button>
      </div>
    );
  }

  const consultTypes = getConsultTypes(doctor.consultationTypes);
  const langs = Array.isArray(doctor.languages)
    ? doctor.languages
    : (doctor.languages || '').split(',').map(l => l.trim()).filter(Boolean);
  const rating = doctor.averageRating || 0;

  return (
    <div className="dp-page">

      {/* Breadcrumb */}
      <div className="dp-breadcrumb">
        <button className="dp-back-link" onClick={() => navigate('/doctors')}>← Find a Doctor</button>
        <span className="dp-bc-sep">/</span>
        <span className="dp-bc-current">Dr. {doctor.name}</span>
      </div>

      <div className="dp-layout">

        {/* ── Left: Profile ── */}
        <div className="dp-left">

          {/* Header card */}
          <div className="dp-header-card">
            <div className="dp-avatar-wrap">
              {(doctor.profileImageUrl || doctor.profileImage) ? (
                <img src={doctor.profileImageUrl || doctor.profileImage} alt={doctor.name} className="dp-avatar-img" />
              ) : (
                <span className="dp-avatar-initials">{getInitials(doctor.name)}</span>
              )}
            </div>
            <div className="dp-header-info">
              <div className="dp-name-row">
                <h1 className="dp-name">Dr. {doctor.name}</h1>
                <span className="dp-verified-badge">✓ Verified</span>
              </div>
              <p className="dp-specialty">{doctor.specialization || 'General Practice'}</p>
              <div className="dp-rating-row">
                <StarRow rating={rating} />
                <span className="dp-rating-num">{rating > 0 ? rating.toFixed(1) : 'New'}</span>
                <span className="dp-rating-count">({doctor.totalReviews || 0} reviews)</span>
              </div>
              <div className="dp-tag-row">
                {doctor.experience && <span className="dp-tag">{doctor.experience} yrs experience</span>}
                {langs.slice(0, 2).map(l => <span key={l} className="dp-tag lang">{l}</span>)}
                {consultTypes.map(t => (
                  <span key={t} className={`dp-tag type-${t}`}>
                    {t === 'video' ? '📹' : t === 'audio' ? '📞' : '💬'} {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="dp-tab-bar">
            {['about', 'reviews'].map(tab => (
              <button
                key={tab}
                className={`dp-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'about' ? 'About' : `Reviews (${reviews.length})`}
              </button>
            ))}
          </div>

          {/* About */}
          {activeTab === 'about' && (
            <div className="dp-about">
              {doctor.bio && (
                <div className="dp-section">
                  <h3 className="dp-section-title">About Dr. {doctor.name.split(' ')[0]}</h3>
                  <p className="dp-bio">{doctor.bio}</p>
                </div>
              )}

              <div className="dp-section">
                <h3 className="dp-section-title">Profile Details</h3>
                <div className="dp-details-grid">
                  {doctor.education && (
                    <div className="dp-detail-row">
                      <span className="dp-detail-icon">🎓</span>
                      <div>
                        <div className="dp-detail-label">Education</div>
                        <div className="dp-detail-value">{doctor.education}</div>
                      </div>
                    </div>
                  )}
                  {langs.length > 0 && (
                    <div className="dp-detail-row">
                      <span className="dp-detail-icon">🌐</span>
                      <div>
                        <div className="dp-detail-label">Languages</div>
                        <div className="dp-detail-value">{langs.join(', ')}</div>
                      </div>
                    </div>
                  )}
                  {doctor.licenseNumber && (
                    <div className="dp-detail-row">
                      <span className="dp-detail-icon">📋</span>
                      <div>
                        <div className="dp-detail-label">License No.</div>
                        <div className="dp-detail-value">{doctor.licenseNumber}</div>
                      </div>
                    </div>
                  )}
                  <div className="dp-detail-row">
                    <span className="dp-detail-icon">💵</span>
                    <div>
                      <div className="dp-detail-label">Consultation Fee</div>
                      <div className="dp-detail-value">
                        {doctor.consultationFee ? `$${doctor.consultationFee} per session` : 'Free'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {consultTypes.length > 0 && (
                <div className="dp-section">
                  <h3 className="dp-section-title">Services Offered</h3>
                  <div className="dp-services">
                    {consultTypes.map(t => (
                      <div key={t} className="dp-service-row">
                        <span className="dp-service-icon">{t === 'video' ? '📹' : t === 'audio' ? '📞' : '💬'}</span>
                        <span>{t === 'video' ? 'Video Consultation' : t === 'audio' ? 'Audio Call' : 'Chat Consultation'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reviews */}
          {activeTab === 'reviews' && (
            <div className="dp-reviews">
              {reviews.length === 0 ? (
                <div className="dp-empty-reviews">
                  <p>No reviews yet. Be the first to leave one after your consultation.</p>
                </div>
              ) : reviews.map(r => (
                <div key={r.id} className="dp-review-card">
                  <div className="dp-review-header">
                    <div className="dp-reviewer-avatar">{r.clientName?.[0]?.toUpperCase() || 'P'}</div>
                    <div>
                      <div className="dp-reviewer-name">{r.clientName || 'Patient'}</div>
                      <StarRow rating={r.rating || 0} />
                    </div>
                  </div>
                  {r.comment && <p className="dp-review-text">{r.comment}</p>}
                  {r.doctorReply && (
                    <div className="dp-reply-box">
                      <span className="dp-reply-label">Dr. {doctor.name.split(' ')[0]} replied:</span>
                      <p>{r.doctorReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Booking Widget ── */}
        <div className="dp-right">
          <div className="dp-booking-card">
            {bookingState.status === 'confirmed' ? (
              <div className="dp-confirmed">
                <div className="dp-confirmed-check">✓</div>
                <h3>Appointment Requested!</h3>
                <p>Dr. {doctor.name.split(' ')[0]} will confirm your appointment shortly. You'll receive a notification.</p>
                <button className="dp-cta-btn" onClick={() => navigate(session?.role ? '/dashboard' : '/signup')}>
                  {session?.role ? 'Go to Dashboard' : 'Create Account'}
                </button>
                <button className="dp-secondary-btn" onClick={() => setBookingState({ status: null, error: '' })}>
                  Book another slot
                </button>
              </div>
            ) : (
              <>
                <h3 className="dp-booking-title">Book an Appointment</h3>
                <p className="dp-booking-fee">
                  {doctor.consultationFee ? `$${doctor.consultationFee} / session` : 'Free consultation'}
                </p>

                {/* Consult Type */}
                {consultTypes.length > 0 && (
                  <div className="dp-book-field">
                    <label className="dp-book-label">Consultation Type</label>
                    <div className="dp-consult-row">
                      {consultTypes.map(t => (
                        <button
                          key={t}
                          className={`dp-consult-btn ${consultType === t ? 'selected' : ''}`}
                          onClick={() => setConsultType(t)}
                        >
                          <span>{t === 'video' ? '📹' : t === 'audio' ? '📞' : '💬'}</span>
                          <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Date */}
                <div className="dp-book-field">
                  <label className="dp-book-label">Select Date</label>
                  {availability.length === 0 ? (
                    <p className="dp-no-avail">No available slots at this time. Please check back later.</p>
                  ) : (
                    <div className="dp-date-row">
                      {availability.map(a => {
                        const free = (a.slots || []).filter(s => !(a.booked || []).includes(s));
                        if (free.length === 0) return null;
                        return (
                          <button
                            key={a.id}
                            className={`dp-date-chip ${selectedDate === a.date ? 'selected' : ''}`}
                            onClick={() => { setSelectedDate(a.date); setSelectedSlot(''); }}
                          >
                            <span className="dp-date-chip-date">{shortDate(a.date)}</span>
                            <span className="dp-date-chip-day">{dayName(a.date)}</span>
                            <span className="dp-date-chip-count">{free.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Time slots */}
                {selectedDate && getSlotsForDate(selectedDate).length > 0 && (
                  <div className="dp-book-field">
                    <label className="dp-book-label">Select Time</label>
                    <div className="dp-time-grid">
                      {getSlotsForDate(selectedDate).map(slot => (
                        <button
                          key={slot}
                          className={`dp-time-chip ${selectedSlot === slot ? 'selected' : ''}`}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reason */}
                <div className="dp-book-field">
                  <label className="dp-book-label">
                    Reason for visit <span className="dp-optional">(optional)</span>
                  </label>
                  <textarea
                    className="dp-reason-input"
                    placeholder="Briefly describe your symptoms or reason for this appointment…"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                  />
                </div>

                {bookingState.error && (
                  <div className="dp-booking-error">{bookingState.error}</div>
                )}

                <button
                  className="dp-cta-btn"
                  onClick={handleBook}
                  disabled={bookingState.status === 'loading'}
                >
                  {bookingState.status === 'loading' ? 'Booking…' :
                   !session?.role ? '🔒 Sign up to Book' : 'Confirm Appointment'}
                </button>

                {!session?.role && (
                  <p className="dp-signin-note">
                    Already have an account?{' '}
                    <button className="dp-signin-link" onClick={() => navigate('/login')}>Sign in</button>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
