import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  User,
  Users,
  X,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { auth, db } from '../../../services/firestoreShim';
import { fetchAssignedTherapist } from '../../../utils/clientTherapistAssignment';
import {
  collection,
  query, 
  where, 
  getDocs,
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc,
  getDoc,
  serverTimestamp 
} from '../../../services/firestoreShim';
import './Schedule.css';

export default function ClientSchedule() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [clientData, setClientData] = useState(null);
  const [therapistData, setTherapistData] = useState(null);
  // Sessions on the clicked day, shown in a detail dialog.
  const [dayDetail, setDayDetail] = useState(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    duration: '30',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoadingTherapist, setIsLoadingTherapist] = useState(true);
  const [showTherapistCalendar, setShowTherapistCalendar] = useState(false);
  const [therapistBusyDates, setTherapistBusyDates] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);

  const currentUser = auth.currentUser;

  // Appointment types
  const appointmentTypes = {
    individual: { name: 'Individual Counselling', icon: User, color: '#3B82F6' },
    couple: { name: 'Couple Counselling', icon: Users, color: '#10B981' },
    teen: { name: 'Teen Counselling', icon: User, color: '#F59E0B' },
    family: { name: 'Family Counselling', icon: Users, color: '#8B5CF6' }
  };

  // Generate calendar days for current month
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days = [];
    const currentDate = new Date(startDate);
    
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return days;
  };

  // Get appointments for a specific date
  // Clicking a day shows its sessions; clicking a free future day starts booking
  // with the assigned therapist on that date.
  const handleDayClick = (day, dayAppointments) => {
    if (dayAppointments.length > 0) { setDayDetail({ date: day, appointments: dayAppointments }); return; }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (day < startOfToday) return;
    if (!therapistData) {
      alert('You need an assigned therapist before you can schedule a session.');
      return;
    }
    setScheduleForm((prev) => ({
      ...prev,
      date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
    }));
    setShowScheduleForm(true);
  };

  const getAppointmentsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(apt => {
      const aptDate = new Date(apt.scheduledTime?.toDate?.() || apt.scheduledTime);
      return aptDate.toISOString().split('T')[0] === dateStr;
    });
  };

  // Navigate months
  const navigateMonth = (direction) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };

  // Go to today
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  };

  // Check if date is today
  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if date is current month
  const isCurrentMonth = (date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  // Fetch client data and therapist info
  useEffect(() => {
    if (!currentUser) return;

    const fetchClientData = async () => {
      try {
        setIsLoadingTherapist(true);
        // Get client ID
        const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
        console.log('Client ID:', clientId);
        
        // Fetch client profile
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        if (clientDoc.exists()) {
          const clientProfile = clientDoc.data();
          console.log('Client Profile:', clientProfile);
          setClientData({ id: clientDoc.id, ...clientProfile });
          
          // Fetch assigned therapist
          if (clientProfile.assignedTherapist) {
            console.log('Assigned Therapist ID:', clientProfile.assignedTherapist);
            
            // Try therapistt collection first
            const therapistDoc = await getDoc(doc(db, 'therapistt', clientProfile.assignedTherapist));
            if (therapistDoc.exists()) {
              const therapistData = { id: therapistDoc.id, ...therapistDoc.data() };
              console.log('Therapist found in therapistt collection:', therapistData);
              setTherapistData(therapistData);
            } else {
              console.log('Therapist not found in therapistt collection, trying therapists collection...');
              // Fallback to therapists collection
              const therapistDocFallback = await getDoc(doc(db, 'therapists', clientProfile.assignedTherapist));
              if (therapistDocFallback.exists()) {
                const therapistData = { id: therapistDocFallback.id, ...therapistDocFallback.data() };
                console.log('Therapist found in therapists collection:', therapistData);
                setTherapistData(therapistData);
              } else {
                console.log('Therapist document not found in either collection');
              }
            }
          } else {
            // `assignedTherapist` is never written by the REST backend — the real
            // record is the assignments table. Without this fallback a client who
            // has a therapist still can't schedule with them.
            const assigned = await fetchAssignedTherapist(clientDoc.id);
            if (assigned) setTherapistData(assigned);
          }
        }
      } catch (error) {
        console.error('Error fetching client data:', error);
      } finally {
        setIsLoadingTherapist(false);
      }
    };

    fetchClientData();
  }, [currentUser]);

  // Fetch appointments
  useEffect(() => {
    if (!currentUser) return;

    const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
    
    const appointmentsQuery = query(
      collection(db, 'scheduledCalls'),
      where('clientId', '==', clientId)
    );

    const unsubscribe = onSnapshot(appointmentsQuery, (snapshot) => {
      const appointmentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort appointments by scheduled time (client-side)
      appointmentsData.sort((a, b) => {
        const timeA = a.scheduledTime?.toDate?.() || new Date(a.scheduledTime);
        const timeB = b.scheduledTime?.toDate?.() || new Date(b.scheduledTime);
        return timeA - timeB;
      });
      
      setAppointments(appointmentsData);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Format time for display
  const formatTime = (timestamp) => {
    const date = new Date(timestamp?.toDate?.() || timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle month navigation

  // Handle schedule form submission
  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    
    if (!scheduleForm.date || !scheduleForm.time) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    if (!therapistData) {
      setMessage({ type: 'error', text: 'No therapist assigned. Please contact support to get assigned to a therapist first.' });
      return;
    }

    setIsSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const dateTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      
      // Check if the selected time is in the future
      if (dateTime <= new Date()) {
        setMessage({ type: 'error', text: 'Please select a future date and time' });
        setIsSubmitting(false);
        return;
      }

      // Check therapist availability
      const isAvailable = await checkTherapistAvailability(therapistData.id, scheduleForm.date);
      if (!isAvailable) {
        setMessage({ 
          type: 'error', 
          text: '❌ Therapist is busy on the selected date. Please click "View Therapist Calendar" to see available dates and choose a different time.' 
        });
        setIsSubmitting(false);
        return;
      }

      const appointmentData = {
        therapistId: therapistData.id,
        therapistName: therapistData.name,
        clientId: clientData.id,
        clientName: clientData.name,
        scheduledTime: dateTime,
        duration: parseInt(scheduleForm.duration),
        notes: scheduleForm.notes || '',
        status: 'pending', // Client requests are pending approval
        createdAt: serverTimestamp(),
        // The requester's user id — `created_by` is a uuid column, so the literal
        // "client" 500'd. See the same fix in VideoCall.js.
        createdBy: clientData.id
      };

      await addDoc(collection(db, 'scheduledCalls'), appointmentData);
      
      setMessage({ type: 'success', text: 'Session request submitted successfully! Your therapist will review and confirm the appointment.' });
      setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
      setShowScheduleForm(false);
      
    } catch (error) {
      console.error('Error creating appointment:', error);
      setMessage({ type: 'error', text: 'Error creating appointment. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };


  // Check therapist availability for a specific date
  const checkTherapistAvailability = async (therapistId, selectedDate) => {
    try {
      console.log('Checking therapist availability for:', therapistId, 'on date:', selectedDate);
      
      // Get all scheduled calls for this therapist
      const therapistCallsQuery = query(
        collection(db, 'scheduledCalls'),
        where('therapistId', '==', therapistId)
      );

      const querySnapshot = await getDocs(therapistCallsQuery);
      console.log('Found therapist calls:', querySnapshot.size);
      
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Check if any calls exist on the selected date
      let hasConflict = false;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const scheduledTime = data.scheduledTime?.toDate?.() || data.scheduledTime;
        if (scheduledTime) {
          const callDate = new Date(scheduledTime);
          if (callDate >= startOfDay && callDate <= endOfDay) {
            hasConflict = true;
            console.log('Found conflict on date:', callDate);
          }
        }
      });

      console.log('Therapist availability result:', !hasConflict);
      return !hasConflict; // Returns true if therapist is available
    } catch (error) {
      console.error('Error checking therapist availability:', error);
      return false;
    }
  };

  // Fetch therapist busy dates for calendar view
  const fetchTherapistBusyDates = async (therapistId) => {
    try {
      setIsLoadingAvailability(true);
      const busyDates = new Set();
      
      // Get all scheduled calls for this therapist
      const therapistCallsQuery = query(
        collection(db, 'scheduledCalls'),
        where('therapistId', '==', therapistId)
      );

      const querySnapshot = await getDocs(therapistCallsQuery);
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const scheduledTime = data.scheduledTime?.toDate?.() || data.scheduledTime;
        if (scheduledTime) {
          const dateString = scheduledTime.toISOString().split('T')[0];
          busyDates.add(dateString);
        }
      });

      setTherapistBusyDates(Array.from(busyDates));
    } catch (error) {
      console.error('Error fetching therapist busy dates:', error);
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  // Open therapist calendar modal
  const handleViewTherapistCalendar = async () => {
    if (therapistData?.id) {
      await fetchTherapistBusyDates(therapistData.id);
      setShowTherapistCalendar(true);
    }
  };


  const calendarDays = generateCalendarDays();
  const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div className="client-schedule-container">
      {/* Header */}
      <div className="client-schedule-header">
        <div className="client-schedule-month-navigation">
          <button onClick={() => navigateMonth(-1)} className="client-schedule-nav-button">
            <ChevronLeft size={20} />
          </button>
          <h2 className="client-schedule-month-year">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={() => navigateMonth(1)} className="client-schedule-nav-button">
            <ChevronRight size={20} />
          </button>
        </div>
        <button onClick={goToToday} className="client-schedule-today-button">Today</button>
      </div>

      {/* Calendar Grid */}
      <div className="client-schedule-grid">
        {/* Week day headers */}
        <div className="client-schedule-weekday-headers">
          {weekDays.map(day => (
            <div key={day} className="client-schedule-weekday-header">{day}</div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="client-schedule-days">
          {calendarDays.map((day, index) => {
            const dayAppointments = getAppointmentsForDate(day);
            const isCurrentMonthDay = isCurrentMonth(day);
            const isTodayDay = isToday(day);
            
            return (
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => handleDayClick(day, dayAppointments)}
                onKeyDown={(e) => e.key === 'Enter' && handleDayClick(day, dayAppointments)}
                className={`client-schedule-day client-schedule-day-clickable ${!isCurrentMonthDay ? 'client-schedule-other-month' : ''} ${isTodayDay ? 'client-schedule-today' : ''}`}
              >
                <div className="client-schedule-day-number">{day.getDate()}</div>
                <div className="client-schedule-day-appointments">
                  {dayAppointments.map(appointment => {
                    const type = appointmentTypes[appointment.sessionType] || appointmentTypes.individual;
                    return (
                      <div 
                        key={appointment.id} 
                        className="client-schedule-appointment-card"
                        style={{ backgroundColor: type.color + '20', borderLeftColor: type.color }}
                      >
                        <div className="client-schedule-appointment-time">
                          {formatTime(appointment.scheduledTime)}
                        </div>
                        <div className="client-schedule-appointment-title">
                          Appointment with {appointment.therapistName || 'Therapist'}
                        </div>
                        <User size={12} className="client-schedule-appointment-icon" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail dialog — sessions booked on the clicked day. */}
      {dayDetail && (
        <div className="tc-detail-overlay" onClick={() => setDayDetail(null)}>
          <div className="tc-detail" onClick={(e) => e.stopPropagation()}>
            <div className="tc-detail-head">
              <div>
                <p className="tc-detail-date">
                  {dayDetail.date.toLocaleDateString(undefined, {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
                <p className="tc-detail-count">
                  {dayDetail.appointments.length === 1
                    ? '1 session'
                    : `${dayDetail.appointments.length} sessions`}
                </p>
              </div>
              <button className="tc-detail-close" onClick={() => setDayDetail(null)}>&times;</button>
            </div>

            <div className="tc-detail-body">
              {dayDetail.appointments.map((apt, i) => {
                const type = appointmentTypes[apt.sessionType] || appointmentTypes.individual;
                const TypeIcon = type.icon;
                return (
                  <div key={apt.id || i} className="tc-detail-card" style={{ borderLeftColor: type.color }}>
                    <div className="tc-detail-row">
                      <Calendar size={16} />
                      <span className="tc-detail-time">
                        {new Date(apt.scheduledTime?.toDate?.() || apt.scheduledTime)
                          .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className="tc-detail-chip" style={{ background: `${type.color}1A`, color: type.color }}>
                        {type.name}
                      </span>
                    </div>
                    <div className="tc-detail-row">
                      <TypeIcon size={16} />
                      <span>{apt.therapistName || therapistData?.name || 'Your therapist'}</span>
                    </div>
                    {apt.durationMinutes || apt.duration ? (
                      <div className="tc-detail-row">
                        <CheckCircle size={16} />
                        <span>{apt.durationMinutes || apt.duration} minutes</span>
                      </div>
                    ) : null}
                    {apt.status && (
                      <div className="tc-detail-row">
                        <AlertCircle size={16} />
                        <span className="tc-detail-status">{apt.status}</span>
                      </div>
                    )}
                    {apt.notes && <p className="tc-detail-notes">{apt.notes}</p>}
                  </div>
                );
              })}
            </div>

            <div className="tc-detail-actions">
              <button className="tc-detail-secondary" onClick={() => setDayDetail(null)}>Close</button>
              {therapistData && (
                <button
                  className="tc-detail-primary"
                  onClick={() => {
                    const d = dayDetail.date;
                    setDayDetail(null);
                    handleDayClick(d, []);
                  }}
                >
                  <Plus size={15} /> Book another
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      {/* No assigned therapist → nobody to schedule with. The modal submits
          against therapistData, so without one it can only fail. */}
      <button
        className="client-schedule-fab"
        onClick={() => {
          if (!therapistData) {
            alert('You need an assigned therapist before you can schedule a session.');
            return;
          }
          setShowScheduleForm(true);
        }}
        disabled={!therapistData}
        title={therapistData ? 'Schedule meeting with your therapist' : 'No therapist assigned yet'}
        style={!therapistData ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      >
        <Plus size={24} />
      </button>

      {/* Schedule Call Modal */}
      {showScheduleForm && (
        <div className="client-schedule-modal-overlay" onClick={() => {
          setShowScheduleForm(false);
          setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
          setMessage({ type: '', text: '' });
        }}>
          <div className="client-schedule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="client-schedule-modal-header">
              <h3>Schedule Call</h3>
              <button 
                className="client-schedule-close-btn"
                onClick={() => {
                  setShowScheduleForm(false);
                  setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
                  setMessage({ type: '', text: '' });
                }}
              >
                <X size={20} />
              </button>
            </div>
            
            {isLoadingTherapist && (
              <div className="client-schedule-loading">
                <div className="client-schedule-spinner"></div>
                <p>Loading therapist information...</p>
              </div>
            )}
            
            {!isLoadingTherapist && therapistData && (
              <div className="client-schedule-therapist-info">
                <div className="client-schedule-therapist-avatar">
                  {therapistData.photoURL ? (
                    <img src={therapistData.photoURL} alt={therapistData.name} />
                  ) : (
                    <User size={24} />
                  )}
                </div>
                <div className="client-schedule-therapist-details">
                  <h4>Schedule with {therapistData.name}</h4>
                  <p>{therapistData.type || 'Therapist'} • {therapistData.specialties?.[0] || 'Mental Health'}</p>
                </div>
              </div>
            )}
            
            {!isLoadingTherapist && !therapistData && (
              <div className="client-schedule-message client-schedule-message-error">
                <User size={20} />
                <div>
                  <strong>No therapist assigned</strong>
                  <p>Please contact support to get assigned to a therapist first.</p>
                </div>
              </div>
            )}
            
            {message.text && (
              <div className={`client-schedule-message client-schedule-message-${message.type}`}>
                {message.text}
              </div>
            )}
            
            <form onSubmit={handleScheduleSubmit}>
              {/* Message Display in Schedule Modal */}
              {message.text && (
                <div className={`client-schedule-modal-message ${message.type}`}>
                  {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span>{message.text}</span>
                </div>
              )}
              
              <div className="client-schedule-form-group">
                <label>Date *</label>
                <div className="client-schedule-date-input-container">
                  <input
                    type="date"
                    value={scheduleForm.date}
                    onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    required
                    disabled={!therapistData}
                  />
                  <button
                    type="button"
                    className="client-schedule-view-calendar-btn"
                    onClick={handleViewTherapistCalendar}
                    disabled={!therapistData}
                    title="Check which dates your therapist is available (red = busy, green = available)"
                  >
                    <Calendar size={16} />
                    View Therapist Calendar
                  </button>
                </div>
              </div>
              
              <div className="client-schedule-form-group">
                <label>Time *</label>
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm({...scheduleForm, time: e.target.value})}
                  required
                  disabled={!therapistData}
                />
              </div>
              
              <div className="client-schedule-form-group">
                <label>Duration (minutes)</label>
                <select
                  value={scheduleForm.duration}
                  onChange={(e) => setScheduleForm({...scheduleForm, duration: e.target.value})}
                  disabled={!therapistData}
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>
              
              <div className="client-schedule-form-group">
                <label>Notes (Optional)</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
                  placeholder="Any specific topics or concerns you'd like to discuss..."
                  rows={3}
                  disabled={!therapistData}
                />
              </div>
              
              <div className="client-schedule-form-actions">
                <button 
                  type="button" 
                  className="client-schedule-btn-secondary"
                  onClick={() => {
                    setShowScheduleForm(false);
                    setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
                    setMessage({ type: '', text: '' });
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="client-schedule-btn-primary"
                  disabled={isSubmitting || !therapistData}
                >
                  {isSubmitting ? 'Submitting...' : 'Schedule Call'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Therapist Calendar Modal */}
      {showTherapistCalendar && (
        <div className="client-schedule-modal-overlay" onClick={() => setShowTherapistCalendar(false)}>
          <div className="client-schedule-modal client-schedule-therapist-calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="client-schedule-modal-header">
              <h3>Therapist Availability Calendar</h3>
              <button 
                className="client-schedule-close-btn"
                onClick={() => setShowTherapistCalendar(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="client-schedule-therapist-calendar-content">
              {isLoadingAvailability ? (
                <div className="client-schedule-loading">
                  <div className="client-schedule-spinner"></div>
                  <p>Loading therapist availability...</p>
                </div>
              ) : (
                <div className="client-schedule-therapist-calendar">
                  <div className="client-schedule-calendar-legend">
                    <div className="client-schedule-legend-item">
                      <div className="client-schedule-legend-color client-schedule-available"></div>
                      <span>Available</span>
                    </div>
                    <div className="client-schedule-legend-item">
                      <div className="client-schedule-legend-color client-schedule-busy"></div>
                      <span>Busy</span>
                    </div>
                  </div>
                  
                  <div className="client-schedule-calendar-grid">
                    {Array.from({ length: 30 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() + i);
                      const dateString = date.toISOString().split('T')[0];
                      const isBusy = therapistBusyDates.includes(dateString);
                      const isPast = date < new Date();
                      
                      return (
                        <div 
                          key={i} 
                          className={`client-schedule-calendar-day ${isBusy ? 'client-schedule-busy' : 'client-schedule-available'} ${isPast ? 'client-schedule-past' : ''}`}
                        >
                          <div className="client-schedule-day-number">{date.getDate()}</div>
                          <div className="client-schedule-day-name">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                          {isBusy && <div className="client-schedule-busy-indicator">Busy</div>}
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="client-schedule-calendar-note">
                    <p><strong>📅 Therapist Availability Guide:</strong></p>
                    <p>• <span style={{color: '#ef4444', fontWeight: 'bold'}}>Red dates</span> = Therapist is busy (not available)</p>
                    <p>• <span style={{color: '#10b981', fontWeight: 'bold'}}>Green dates</span> = Therapist is available</p>
                    <p>• Choose a green date to schedule your session</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}