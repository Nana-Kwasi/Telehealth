import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  Settings,
  User,
  Video,
  Phone,
  Users,
  Filter
} from 'lucide-react';
import { auth, db } from '../../../services/firestoreShim';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  serverTimestamp,
  Timestamp
} from '../../../services/firestoreShim';
import './Schedule.css';
import { resolveFileUrl } from '../../../utils/fileUrl';

export default function TherapistSchedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('day'); // day, week, month
  const [appointments, setAppointments] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [selectedTherapists, setSelectedTherapists] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAppointment, setNewAppointment] = useState({
    clientId: '',
    clientName: '',
    type: 'individual',
    startTime: '',
    endTime: '',
    therapistId: '',
    notes: ''
  });
  const [clients, setClients] = useState([]);

  const currentUser = auth.currentUser;

  // Time slots for the day view
  const timeSlots = [
    '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', 
    '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', 
    '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'
  ];

  // Appointment types
  const appointmentTypes = {
    individual: { name: 'Individual Counselling', icon: User, color: '#3B82F6' },
    couple: { name: 'Couple Counselling', icon: Users, color: '#10B981' },
    teen: { name: 'Teen Counselling', icon: User, color: '#F59E0B' },
    family: { name: 'Family Counselling', icon: Users, color: '#8B5CF6' }
  };

  // Fetch appointments
  useEffect(() => {
    if (!currentUser) return;

    const appointmentsQuery = query(
      collection(db, 'scheduledCalls'),
      where('therapistId', '==', currentUser.uid),
      orderBy('scheduledTime', 'asc')
    );

    const unsubscribe = onSnapshot(appointmentsQuery, (snapshot) => {
      const appointmentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAppointments(appointmentsData);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Fetch therapists (for multi-therapist view)
  useEffect(() => {
    if (!currentUser) return;

    const therapistsQuery = query(collection(db, 'therapists'));
    const unsubscribe = onSnapshot(therapistsQuery, (snapshot) => {
      const therapistsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTherapists(therapistsData);
      // Add current user to selected therapists by default
      setSelectedTherapists([currentUser.uid]);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Fetch clients assigned to this therapist
  useEffect(() => {
    if (!currentUser) return;
    const loadClients = async () => {
      try {
        const ref = collection(db, 'therapists', currentUser.uid, 'clients');
        const snap = await getDocs(ref);
        const ids = snap.docs.map(d => d.data().clientId).filter(Boolean);
        const list = [];
        for (const id of ids) {
          try {
            const cSnap = await getDoc(doc(db, 'clients', id));
            if (cSnap.exists()) {
              const cd = cSnap.data();
              list.push({ id, name: cd.name || cd.displayName || cd.email || 'Client' });
            }
          } catch (_) {}
        }
        setClients(list);
      } catch (e) {
        console.error('Error loading clients for schedule:', e);
      }
    };
    loadClients();
  }, [currentUser]);

  // Get appointments for selected date
  const getAppointmentsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(apt => {
      const aptDate = new Date(apt.scheduledTime?.toDate?.() || apt.scheduledTime);
      return aptDate.toISOString().split('T')[0] === dateStr;
    });
  };

  // Get appointments for selected therapists
  const getAppointmentsForTherapists = (date) => {
    const dateAppointments = getAppointmentsForDate(date);
    return dateAppointments.filter(apt => selectedTherapists.includes(apt.therapistId));
  };

  // Format time for display
  const formatTime = (timestamp) => {
    const date = new Date(timestamp?.toDate?.() || timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get appointment position in time slot
  const getAppointmentPosition = (startTime, endTime) => {
    const start = new Date(startTime?.toDate?.() || startTime);
    const end = new Date(endTime?.toDate?.() || endTime);
    
    const startHour = start.getHours();
    const startMinute = start.getMinutes();
    const endHour = end.getHours();
    const endMinute = end.getMinutes();
    
    const startPosition = (startHour - 9) * 60 + startMinute;
    const endPosition = (endHour - 9) * 60 + endMinute;
    
    return {
      top: `${startPosition}px`,
      height: `${endPosition - startPosition}px`
    };
  };

  // Handle date navigation
  const navigateDate = (direction) => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + direction);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction * 7));
    } else if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
    }
    setSelectedDate(newDate);
  };

  // Handle therapist selection
  const toggleTherapist = (therapistId) => {
    setSelectedTherapists(prev => {
      if (prev.includes(therapistId)) {
        return prev.filter(id => id !== therapistId);
      } else {
        return [...prev, therapistId];
      }
    });
  };

  // Create new appointment
  const handleCreateAppointment = async () => {
    if (!newAppointment.startTime) {
      alert('Please provide a start time.');
      return;
    }
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const scheduledDate = new Date(`${dateStr}T${newAppointment.startTime}`);
      const appointmentData = {
        therapistId: currentUser.uid,
        therapistName: currentUser.displayName || 'Therapist',
        clientId: newAppointment.clientId || '',
        clientName: newAppointment.clientName || '',
        sessionType: newAppointment.type || 'individual',
        scheduledTime: Timestamp.fromDate(scheduledDate),
        duration: newAppointment.endTime
          ? Math.round((new Date(`${dateStr}T${newAppointment.endTime}`) - scheduledDate) / 60000)
          : 50,
        notes: newAppointment.notes || '',
        status: 'scheduled',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'scheduledCalls'), appointmentData);
      setShowAddModal(false);
      setNewAppointment({
        clientId: '',
        clientName: '',
        type: 'individual',
        startTime: '',
        endTime: '',
        therapistId: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error creating appointment:', error);
      alert('Error creating appointment. Please try again.');
    }
  };

  return (
    <div className="schedule-dashboard">
      {/* Header */}
      <div className="schedule-header">
        <div className="header-left">
          <h1>Schedule</h1>
          <p>Stay organized and on track with calendar</p>
        </div>
        <div className="header-right">
          <div className="search-bar">
            <Search size={20} />
            <input type="text" placeholder="Search" />
          </div>
          <div className="header-actions">
            <Bell size={20} className="notification-icon" />
            <Settings size={20} />
            <div className="user-avatar">
              <User size={20} />
            </div>
          </div>
        </div>
      </div>

      <div className="schedule-content">
        {/* Left Sidebar */}
        <div className="schedule-sidebar">
          <div className="sidebar-section">
            <h3>Doctors</h3>
            <p>Plan your schedule and review your colleagues' workload</p>
            
            <div className="therapist-list">
              {therapists.map(therapist => (
                <div key={therapist.id} className="therapist-item">
                  <div className="therapist-avatar">
                    {therapist.photoURL ? (
                      <img src={resolveFileUrl(therapist.photoURL)} alt={therapist.name} />
                    ) : (
                      <User size={20} />
                    )}
                  </div>
                  <div className="therapist-info">
                    <span className="therapist-name">
                      {therapist.name || therapist.displayName}
                      {therapist.id === currentUser.uid && ' (You)'}
                    </span>
                    <span className="therapist-role">
                      {therapist.specialties?.[0] || 'Therapist'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedTherapists.includes(therapist.id)}
                    onChange={() => toggleTherapist(therapist.id)}
                    className="therapist-checkbox"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Type of Consultation</h3>
            <div className="consultation-types">
              {Object.entries(appointmentTypes).map(([key, type]) => {
                const TypeIcon = type.icon;
                return (
                  <label key={key} className="consultation-type">
                    <input type="checkbox" defaultChecked />
                    <TypeIcon size={16} />
                    <span>{type.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Calendar Area */}
        <div className="calendar-main">
          <div className="calendar-header">
            <div className="calendar-title">
              <h2>Appointments</h2>
              <p>Stay organized and on track with calendar</p>
            </div>
            
            <div className="calendar-controls">
              <div className="date-navigation">
                <button onClick={() => navigateDate(-1)}>
                  <ChevronLeft size={20} />
                </button>
                <span className="current-date">
                  {selectedDate.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </span>
                <button onClick={() => navigateDate(1)}>
                  <ChevronRight size={20} />
                </button>
              </div>
              
              <button 
                className="add-appointment-btn"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={16} />
                Add new
              </button>
              
              <div className="view-toggles">
                <button 
                  className={viewMode === 'day' ? 'active' : ''}
                  onClick={() => setViewMode('day')}
                >
                  Day
                </button>
                <button 
                  className={viewMode === 'week' ? 'active' : ''}
                  onClick={() => setViewMode('week')}
                >
                  Week
                </button>
                <button 
                  className={viewMode === 'month' ? 'active' : ''}
                  onClick={() => setViewMode('month')}
                >
                  Month
                </button>
              </div>
            </div>
          </div>

          {/* Therapist Columns Header */}
          <div className="therapist-columns-header">
            {therapists
              .filter(therapist => selectedTherapists.includes(therapist.id))
              .map(therapist => (
                <div key={therapist.id} className="therapist-column-header">
                  <div className="therapist-avatar">
                    {therapist.photoURL ? (
                      <img src={resolveFileUrl(therapist.photoURL)} alt={therapist.name} />
                    ) : (
                      <User size={20} />
                    )}
                  </div>
                  <div className="therapist-info">
                    <span className="therapist-name">
                      {therapist.name || therapist.displayName}
                    </span>
                    <span className="therapist-role">
                      {therapist.specialties?.[0] || 'Therapist'}
                    </span>
                  </div>
                </div>
              ))}
          </div>

          {/* Calendar Grid */}
          <div className="calendar-grid">
            <div className="time-slots">
              {timeSlots.map(time => (
                <div key={time} className="time-slot">
                  {time}
                </div>
              ))}
            </div>
            
            <div className="appointments-area">
              {therapists
                .filter(therapist => selectedTherapists.includes(therapist.id))
                .map(therapist => (
                  <div key={therapist.id} className="therapist-column">
                    {getAppointmentsForTherapists(selectedDate)
                      .filter(apt => apt.therapistId === therapist.id)
                      .map(appointment => {
                        const type = appointmentTypes[appointment.type] || appointmentTypes.individual;
                        const TypeIcon = type.icon;
                        const position = getAppointmentPosition(appointment.scheduledTime, appointment.endTime);
                        
                        return (
                          <div
                            key={appointment.id}
                            className="appointment-card"
                            style={{
                              top: position.top,
                              height: position.height,
                              borderLeftColor: type.color
                            }}
                          >
                            <div className="appointment-content">
                              <div className="appointment-client">
                                {appointment.clientName || 'Unknown Client'}
                              </div>
                              <div className="appointment-type">
                                {type.name}
                              </div>
                              <div className="appointment-time">
                                {formatTime(appointment.scheduledTime)} - {formatTime(appointment.endTime)}
                              </div>
                            </div>
                            <div className="appointment-indicator" style={{ backgroundColor: type.color }} />
                          </div>
                        );
                      })}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Appointment Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Appointment</h2>
              <button className="close-button" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Select Client</label>
                <select
                  value={newAppointment.clientId}
                  onChange={(e) => {
                    const selected = clients.find(c => c.id === e.target.value);
                    setNewAppointment(prev => ({
                      ...prev,
                      clientId: e.target.value,
                      clientName: selected?.name || ''
                    }));
                  }}
                >
                  <option value="">-- Select a client --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {!newAppointment.clientId && (
                <div className="form-group">
                  <label>Or enter client name manually</label>
                  <input
                    type="text"
                    value={newAppointment.clientName}
                    onChange={(e) => setNewAppointment(prev => ({ ...prev, clientName: e.target.value }))}
                    placeholder="Client name"
                  />
                </div>
              )}
              <div className="form-group">
                <label>Type</label>
                <select
                  value={newAppointment.type}
                  onChange={(e) => setNewAppointment(prev => ({ ...prev, type: e.target.value }))}
                >
                  {Object.entries(appointmentTypes).map(([key, type]) => (
                    <option key={key} value={key}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <input
                    type="time"
                    value={newAppointment.startTime}
                    onChange={(e) => setNewAppointment(prev => ({ ...prev, startTime: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input
                    type="time"
                    value={newAppointment.endTime}
                    onChange={(e) => setNewAppointment(prev => ({ ...prev, endTime: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={newAppointment.notes}
                  onChange={(e) => setNewAppointment(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add any notes..."
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleCreateAppointment}>
                Create Appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

