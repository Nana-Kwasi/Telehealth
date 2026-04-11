import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../Auth/firebaseConfig';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  MessageSquare, 
  X,
  CheckCircle,
  AlertCircle,
  Edit,
  Flag,
  RefreshCw,
  Star,
  MapPin,
  Mail,
  Award,
  BookOpen,
  Languages
} from 'lucide-react';
import './VideoCall.css';

const ClientVideoCall = ({ profile }) => {
  const navigate = useNavigate();
  const [clientProfile, setClientProfile] = useState(profile);
  const [therapistData, setTherapistData] = useState(null);
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    duration: '30',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showTherapistCalendar, setShowTherapistCalendar] = useState(false);
  const [therapistBusyDates, setTherapistBusyDates] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  
  // New state for modals and functionality
  const [showTherapistModal, setShowTherapistModal] = useState(false);
  const [showRequestTherapistModal, setShowRequestTherapistModal] = useState(false);
  const [showReportTherapistModal, setShowReportTherapistModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [showReviewRatingModal, setShowReviewRatingModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [requestForm, setRequestForm] = useState({
    reason: '',
    preferredTherapistType: '',
    additionalNotes: ''
  });
  const [reportForm, setReportForm] = useState({
    incidentType: '',
    description: '',
    severity: 'medium',
    additionalDetails: ''
  });
  const [editScheduleForm, setEditScheduleForm] = useState({
    date: '',
    time: '',
    duration: '30',
    notes: ''
  });
  const [reviewRatingForm, setReviewRatingForm] = useState({
    title: '',
    comment: '',
    rating: 0,
    sessionId: '',
    isAnonymous: false
  });
  const [incidentId, setIncidentId] = useState('');
  const [hasAssignedTherapist, setHasAssignedTherapist] = useState(false);
  const [assignedTherapistName, setAssignedTherapistName] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!auth.currentUser) {
          console.log('❌ No authenticated user');
          return;
        }

        console.log('🔍 Starting data fetch for user:', auth.currentUser.uid);

        // Get client ID from localStorage or auth
        const clientId = localStorage.getItem('th.clientId') || auth.currentUser.uid;
        console.log('📋 Client ID:', clientId);
        
        // Fetch client profile data
        console.log('📖 Fetching client document from clients collection...');
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        
        if (clientDoc.exists()) {
          const clientData = clientDoc.data();
          console.log('✅ Client document found:', clientData);
          console.log('🔗 Assigned therapist field:', clientData.assignedTherapist);
          
          // Create a profile object with the role set to 'client'
          const clientProfile = {
            id: clientDoc.id,
            uid: auth.currentUser.uid,
            role: 'client',
            name: clientData.name || clientData.displayName || auth.currentUser.displayName,
            email: clientData.email || auth.currentUser.email,
            ...clientData
          };
          
          setClientProfile(clientProfile);
          console.log('👤 Client profile set:', clientProfile);

          // Get assigned provider ID — support multiple field names
          const assignedId = clientData.assignedTherapist || clientData.assignedTherapistId || clientData.assignedDoctor || clientData.assignedDoctorId || '';
          const assignedName = clientData.assignedTherapistName || clientData.assignedDoctorName || '';

          // Track whether client has an assigned provider (even if doc lookup fails later)
          if (assignedId) {
            setHasAssignedTherapist(true);
            setAssignedTherapistName(assignedName);
          }

          // Fetch assigned provider data — try all possible collections
          if (assignedId) {
            const collections = ['therapists', 'therapistt', 'doctors'];
            let found = false;
            for (const col of collections) {
              try {
                const snap = await getDoc(doc(db, col, assignedId));
                if (snap.exists()) {
                  setTherapistData({ id: snap.id, ...snap.data() });
                  found = true;
                  break;
                }
              } catch (_) {}
            }
            if (!found) {
              console.log('Provider not found in any collection for ID:', assignedId);
            }
          } else {
            console.log('❌ No assigned therapist field in client data');
          }

          // Fetch scheduled calls for this client
          console.log('📅 Fetching scheduled calls...');
          const callsQuery = query(
            collection(db, 'scheduledCalls'),
            where('clientId', '==', clientId)
          );
          const callsSnapshot = await getDocs(callsQuery);
          const calls = callsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          console.log('📅 Scheduled calls found:', calls.length);
          setScheduledCalls(calls);
        } else {
          console.log('❌ Client document not found for ID:', clientId);
          // Fallback to auth user data
          setClientProfile({
            id: auth.currentUser.uid,
            uid: auth.currentUser.uid,
            role: 'client',
            name: auth.currentUser.displayName || 'Client',
            email: auth.currentUser.email
          });
        }
      } catch (error) {
        console.error('❌ Error fetching data:', error);
        console.error('Error details:', error.message);
        console.error('Error code:', error.code);
        setMessage({ type: 'error', text: 'Error loading data. Please try again.' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('=== SCHEDULE SUBMISSION STARTED ===');
    console.log('Form data:', scheduleForm);
    console.log('Therapist data:', therapistData);
    
    if (!scheduleForm.date || !scheduleForm.time) {
      console.log('Validation failed: Missing required fields');
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    if (!therapistData) {
      console.log('Validation failed: No therapist assigned');
      setMessage({ type: 'error', text: 'No therapist assigned. Please contact support.' });
      return;
    }

    setIsSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const dateTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      console.log('Created dateTime:', dateTime);
      
      // Check if the selected time is in the future
      if (dateTime <= new Date()) {
        console.log('Validation failed: Date is in the past');
        setMessage({ type: 'error', text: 'Please select a future date and time' });
        setIsSubmitting(false);
        return;
      }

      // Check therapist availability
      console.log('Checking therapist availability...');
      const isAvailable = await checkTherapistAvailability(therapistData.id, scheduleForm.date);
      console.log('Availability check result:', isAvailable);
      
      if (!isAvailable) {
        console.log('Validation failed: Therapist not available');
        setMessage({ 
          type: 'error', 
          text: '❌ Therapist is busy on the selected date. Please click "View Therapist Calendar" to see available dates and choose a different time.' 
        });
        setIsSubmitting(false);
        return;
      }

      const callData = {
        therapistId: therapistData.id,
        therapistName: therapistData.name,
        clientId: clientProfile.id,
        clientName: clientProfile.name,
        scheduledTime: dateTime,
        duration: parseInt(scheduleForm.duration),
        notes: scheduleForm.notes || '',
        status: 'pending', // Client requests are pending approval
        createdAt: serverTimestamp(),
        createdBy: 'client'
      };

      console.log('Preparing to submit call data:', callData);
      console.log('Adding document to scheduledCalls collection...');
      
      const docRef = await addDoc(collection(db, 'scheduledCalls'), callData);
      console.log('✅ Call scheduled successfully with ID:', docRef.id);
      
      setMessage({ type: 'success', text: 'Session request submitted successfully! Your therapist will review and confirm.' });
      setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
      setShowScheduleForm(false);
      
      // Refresh scheduled calls
      const callsQuery = query(
        collection(db, 'scheduledCalls'),
        where('clientId', '==', clientProfile.id)
      );
      const callsSnapshot = await getDocs(callsQuery);
      const calls = callsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => {
        const timeA = a.scheduledTime?.toDate ? a.scheduledTime.toDate() : new Date(a.scheduledTime);
        const timeB = b.scheduledTime?.toDate ? b.scheduledTime.toDate() : new Date(b.scheduledTime);
        return timeB - timeA; // desc order
      });
      setScheduledCalls(calls);
      
    } catch (error) {
      console.error('❌ ERROR SCHEDULING CALL:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      setMessage({ type: 'error', text: `Error scheduling session: ${error.message}. Please try again.` });
    } finally {
      console.log('=== SCHEDULE SUBMISSION COMPLETED ===');
      setIsSubmitting(false);
    }
  };

  const formatSessionTime = (scheduledTime) => {
    const date = scheduledTime.toDate ? scheduledTime.toDate() : new Date(scheduledTime);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: 'numeric',
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const formatSessionTimeString = (scheduledTime) => {
    const date = scheduledTime.toDate ? scheduledTime.toDate() : new Date(scheduledTime);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true 
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'scheduled':
        return <CheckCircle className="text-green-500" size={16} />;
      case 'pending':
        return <Clock className="text-yellow-500" size={16} />;
      case 'cancelled':
        return <X className="text-red-500" size={16} />;
      case 'completed':
        return <CheckCircle className="text-blue-500" size={16} />;
      default:
        return <AlertCircle className="text-gray-500" size={16} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleMessageClick = () => {
    navigate('/dashboard/messages');
  };

  // Generate short incident ID
  const generateIncidentId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Check if session can be edited (within 24 hours)
  const canEditSession = (sessionTime) => {
    const now = new Date();
    const sessionDate = sessionTime?.toDate ? sessionTime.toDate() : new Date(sessionTime);
    const hoursDiff = (sessionDate - now) / (1000 * 60 * 60);
    return hoursDiff <= 24 && hoursDiff > 0;
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

  // Handle therapist name click
  const handleTherapistClick = () => {
    if (therapistData?.id) {
      navigate(`/dashboard/therapist/${therapistData.id}`);
    }
  };

  // Handle request new therapist
  const handleRequestTherapist = () => {
    setShowTherapistModal(false);
    setShowRequestTherapistModal(true);
  };

  // Handle report therapist
  const handleReportTherapist = () => {
    setShowTherapistModal(false);
    setShowReportTherapistModal(true);
  };

  // Handle review and rating
  const handleReviewRating = () => {
    setShowTherapistModal(false);
    setShowReviewRatingModal(true);
  };

  // Handle edit session
  const handleEditSession = (session) => {
    if (!canEditSession(session.scheduledTime)) {
      setMessage({ type: 'error', text: 'This session cannot be edited. Only sessions within 24 hours can be modified.' });
      return;
    }
    
    const sessionTime = session.scheduledTime?.toDate ? session.scheduledTime.toDate() : new Date(session.scheduledTime);
    setEditScheduleForm({
      date: sessionTime.toISOString().split('T')[0],
      time: sessionTime.toTimeString().slice(0, 5),
      duration: session.duration.toString(),
      notes: session.notes || ''
    });
    setSelectedSession(session);
    setShowEditScheduleModal(true);
  };

  // Submit request for new therapist
  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const requestData = {
        clientId: clientProfile.id,
        clientName: clientProfile.name,
        assignedTherapistId: therapistData.id,
        assignedTherapistName: therapistData.name,
        reason: requestForm.reason,
        preferredTherapistType: requestForm.preferredTherapistType,
        additionalNotes: requestForm.additionalNotes,
        status: 'pending',
        createdAt: serverTimestamp(),
        type: 'therapist_request'
      };

      await addDoc(collection(db, 'therapistRequests'), requestData);
      
      setMessage({ type: 'success', text: 'Therapist request submitted successfully! We will review your request and get back to you.' });
      setShowRequestTherapistModal(false);
      setRequestForm({ reason: '', preferredTherapistType: '', additionalNotes: '' });
      
    } catch (error) {
      console.error('Error submitting request:', error);
      setMessage({ type: 'error', text: 'Error submitting request. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit report about therapist
  const handleReportSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const incidentId = generateIncidentId();
      setIncidentId(incidentId);
      
      const reportData = {
        incidentId,
        clientId: clientProfile.id,
        clientName: clientProfile.name,
        assignedTherapistId: therapistData.id,
        assignedTherapistName: therapistData.name,
        incidentType: reportForm.incidentType,
        description: reportForm.description,
        severity: reportForm.severity,
        additionalDetails: reportForm.additionalDetails,
        status: 'submitted', // submitted -> seen -> processing -> completed
        createdAt: serverTimestamp(),
        type: 'therapist_report'
      };

      await addDoc(collection(db, 'therapistReports'), reportData);
      
      setMessage({ type: 'success', text: `Report submitted successfully! Your incident ID is: ${incidentId}. Status: Submitted. Admin will review and update the status (Submitted → Seen → Processing → Completed).` });
      setShowReportTherapistModal(false);
      setReportForm({ incidentType: '', description: '', severity: 'medium', additionalDetails: '' });
      
    } catch (error) {
      console.error('Error submitting report:', error);
      setMessage({ type: 'error', text: 'Error submitting report. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update session
  const handleUpdateSession = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const dateTime = new Date(`${editScheduleForm.date}T${editScheduleForm.time}`);
      
      if (dateTime <= new Date()) {
        setMessage({ type: 'error', text: 'Please select a future date and time' });
        setIsSubmitting(false);
        return;
      }

      await updateDoc(doc(db, 'scheduledCalls', selectedSession.id), {
        scheduledTime: dateTime,
        duration: parseInt(editScheduleForm.duration),
        notes: editScheduleForm.notes,
        updatedAt: serverTimestamp()
      });
      
      setMessage({ type: 'success', text: 'Session updated successfully!' });
      setShowEditScheduleModal(false);
      setSelectedSession(null);
      
      // Refresh scheduled calls
      const callsQuery = query(
        collection(db, 'scheduledCalls'),
        where('clientId', '==', clientProfile.id)
      );
      const callsSnapshot = await getDocs(callsQuery);
      const calls = callsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => {
        const timeA = a.scheduledTime?.toDate ? a.scheduledTime.toDate() : new Date(a.scheduledTime);
        const timeB = b.scheduledTime?.toDate ? b.scheduledTime.toDate() : new Date(b.scheduledTime);
        return timeB - timeA;
      });
      setScheduledCalls(calls);
      
    } catch (error) {
      console.error('Error updating session:', error);
      setMessage({ type: 'error', text: 'Error updating session. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit review and rating
  const handleReviewRatingSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Submit review if title and comment are provided
      if (reviewRatingForm.title && reviewRatingForm.comment) {
        const reviewData = {
          clientId: clientProfile.id,
          clientName: clientProfile.name,
          therapistId: therapistData.id,
          therapistName: therapistData.name,
          title: reviewRatingForm.title,
          comment: reviewRatingForm.comment,
          sessionId: reviewRatingForm.sessionId || null,
          isAnonymous: reviewRatingForm.isAnonymous,
          status: 'published',
          createdAt: serverTimestamp(),
          type: 'therapist_review'
        };

        await addDoc(collection(db, 'therapistReviews'), reviewData);
      }

      // Submit rating if rating is provided
      if (reviewRatingForm.rating > 0) {
        const ratingData = {
          clientId: clientProfile.id,
          clientName: clientProfile.name,
          therapistId: therapistData.id,
          therapistName: therapistData.name,
          rating: reviewRatingForm.rating,
          feedback: reviewRatingForm.comment || '',
          sessionId: reviewRatingForm.sessionId || null,
          createdAt: serverTimestamp(),
          type: 'therapist_rating'
        };

        await addDoc(collection(db, 'therapistRatings'), ratingData);
      }
      
      let successMessage = 'Feedback submitted successfully!';
      if (reviewRatingForm.rating > 0) {
        successMessage += ` You rated ${therapistData.name} ${reviewRatingForm.rating} star${reviewRatingForm.rating !== 1 ? 's' : ''}.`;
      }
      if (reviewRatingForm.title && reviewRatingForm.comment) {
        successMessage += ' Thank you for your review.';
      }
      
      setMessage({ type: 'success', text: successMessage });
      setShowReviewRatingModal(false);
      setReviewRatingForm({ title: '', comment: '', rating: 0, sessionId: '', isAnonymous: false });
      
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setMessage({ type: 'error', text: 'Error submitting feedback. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle star rating click
  const handleStarClick = (rating) => {
    setReviewRatingForm({ ...reviewRatingForm, rating });
  };

  if (isLoading) {
    return (
      <div className="video-call-lo">
        <div className="loading-spinner"></div>
        <p>Loading </p>
      </div>
    );
  }

  return (
    <div className="client-video-call">
      <div className="video-call-header">
        <h1>Video Call Scheduling</h1>
        <p>Connect with your therapist and manage your sessions</p>
      </div>

      {/* Message Display */}
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Therapist Information Card */}
      {therapistData ? (
        <div className="therapist-card">
          <div className="therapist-info">
            <div className="therapist-avatar">
              <User size={32} />
            </div>
            <div className="therapist-details">
              <h3 
                className="therapist-name-clickable"
                onClick={handleTherapistClick}
                style={{ cursor: 'pointer', color: '#3b82f6' }}
              >
                {therapistData.name}
              </h3>
              <p className="therapist-title">{therapistData.type || 'Therapist'}</p>
              <p className="therapist-specialties">
                {therapistData.specialties?.join(', ') || 'Mental Health Specialist'}
              </p>
              <p className="therapist-experience">
                {therapistData.yearsExperience ? `${therapistData.yearsExperience} years experience` : 'Experienced Professional'}
              </p>
            </div>
          </div>
          <div className="therapist-actions">
            <button 
              className="btn-secondary"
              onClick={handleMessageClick}
            >
              <MessageSquare size={16} />
              Message
            </button>
            <button 
              className="btn-primary"
              onClick={() => setShowScheduleForm(true)}
            >
              <Calendar size={16} />
              Schedule Call
            </button>
          </div>
        </div>
      ) : hasAssignedTherapist ? (
        <div className="therapist-card">
          <div className="therapist-info">
            <div className="therapist-avatar">
              <User size={32} />
            </div>
            <div className="therapist-details">
              <h3 className="therapist-name-clickable">{assignedTherapistName || 'Your Therapist'}</h3>
              <p className="therapist-title">Assigned Therapist</p>
              <p className="therapist-specialties">Loading therapist details...</p>
            </div>
          </div>
          <div className="therapist-actions">
            <button className="btn-secondary" onClick={handleMessageClick}>
              <MessageSquare size={16} />
              Message
            </button>
            <button className="btn-primary" onClick={() => setShowScheduleForm(true)}>
              <Calendar size={16} />
              Schedule Call
            </button>
          </div>
        </div>
      ) : (
        <div className="no-therapist-warning">
          <AlertCircle size={24} />
          <div>
            <h3>No Therapist Assigned</h3>
            <p>You don't have an assigned therapist yet. Please contact support to get matched with a therapist.</p>
          </div>
        </div>
      )}

      {/* Scheduled Sessions */}
      <div className="sessions-section">
        <div className="section-header">
          <h2>Your Sessions</h2>
        </div>

        {scheduledCalls.length > 0 ? (
          <div className="sessions-table-container">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Date & Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {scheduledCalls.map((session) => {
                  const timeInfo = formatSessionTimeString(session.scheduledTime);
                  const sessionDate = session.scheduledTime?.toDate?.() || session.scheduledTime;
                  const isUpcoming = sessionDate > new Date();
                  const canEdit = isUpcoming && (sessionDate - new Date()) <= (24 * 60 * 60 * 1000); // 24 hours
                  
                  return (
                    <tr key={session.id} className="sessions-table-row">
                      <td className="sessions-session-info">
                        <div className="sessions-session-title">
                          Session with {session.therapistName}
                        </div>
                        <div className="sessions-session-type">
                          Individual Therapy
                        </div>
                      </td>
                      <td className="sessions-datetime">
                        <div className="sessions-date">
                          {timeInfo.date}
                        </div>
                        <div className="sessions-time">
                          {timeInfo.time}
                        </div>
                      </td>
                      <td className="sessions-duration">
                        <div className="sessions-duration-info">
                          <Clock size={16} />
                          {session.duration} minutes
                        </div>
                      </td>
                      <td className="sessions-status">
                        <span className={`sessions-status-badge sessions-status-${session.status}`}>
                          {getStatusIcon(session.status)}
                          {session.status?.toUpperCase() || 'PENDING'}
                        </span>
                        {session.status === 'pending' && (
                          <div className="sessions-confirmation">
                            Awaiting therapist confirmation
                          </div>
                        )}
                      </td>
                      <td className="sessions-notes">
                        {session.notes ? (
                          <div className="sessions-notes-content">
                            {session.notes}
                          </div>
                        ) : (
                          <span className="sessions-no-notes">No notes</span>
                        )}
                      </td>
                      <td className="sessions-actions">
                        {session.status === 'scheduled' && (
                          <button className="sessions-join-button">
                            <Phone size={16} />
                            Join
                          </button>
                        )}
                        {canEdit && (
                          <button 
                            className="sessions-edit-button"
                            onClick={() => handleEditSession(session)}
                          >
                            <Edit size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-sessions">
            <Calendar size={48} />
            <h3>No Sessions Scheduled</h3>
            <p>You don't have any sessions scheduled yet.</p>
          </div>
        )}
      </div>

      {/* Schedule Session Modal */}
      {showScheduleForm && (
        <div className="modal-overlay" onClick={() => {
          setShowScheduleForm(false);
          setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
          setMessage({ type: '', text: '' });
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Schedule Call</h3>
              <button 
                className="close-btn"
                onClick={() => {
                  setShowScheduleForm(false);
                  setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
                  setMessage({ type: '', text: '' });
                }}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleScheduleSubmit}>
              {/* Message Display in Schedule Modal */}
              {message.text && (
                <div className={`modal-message ${message.type}`}>
                  {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span>{message.text}</span>
                </div>
              )}
              
              <div className="form-group">
                <label>Date *</label>
                <div className="date-input-container">
                  <input
                    type="date"
                    value={scheduleForm.date}
                    onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                  <button
                    type="button"
                    className="view-calendar-btn"
                    onClick={handleViewTherapistCalendar}
                    disabled={!therapistData}
                    title="Check which dates your therapist is available (red = busy, green = available)"
                  >
                    <Calendar size={16} />
                    View Therapist Calendar
                  </button>
                </div>
              </div>
              
              <div className="form-group">
                <label>Time *</label>
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm({...scheduleForm, time: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Duration (minutes)</label>
                <select
                  value={scheduleForm.duration}
                  onChange={(e) => setScheduleForm({...scheduleForm, duration: e.target.value})}
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Notes (Optional)</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
                  placeholder="Any specific topics or concerns you'd like to discuss..."
                  rows={3}
                />
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
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
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Schedule Call'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Therapist Details Modal */}
      {showTherapistModal && therapistData && (
        <div className="modal-overlay" onClick={() => setShowTherapistModal(false)}>
          <div className="modal therapist-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Therapist Details</h3>
              <button className="close-btn" onClick={() => setShowTherapistModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="therapist-details-content">
              <div className="therapist-photo-section">
                {therapistData.photoURL ? (
                  <img 
                    src={therapistData.photoURL} 
                    alt={therapistData.name}
                    className="therapist-photo"
                  />
                ) : (
                  <div className="therapist-photo-placeholder">
                    <User size={48} />
                  </div>
                )}
                <h2>{therapistData.name}</h2>
                <p className="therapist-role">{therapistData.type || 'Therapist'}</p>
              </div>

              <div className="therapist-info-grid">
                <div className="info-item">
                  <Mail size={16} />
                  <span>{therapistData.email}</span>
                </div>
                
                {therapistData.phone && (
                  <div className="info-item">
                    <Phone size={16} />
                    <span>{therapistData.phone}</span>
                  </div>
                )}

                {therapistData.practiceAddress && (
                  <div className="info-item">
                    <MapPin size={16} />
                    <span>{therapistData.practiceAddress}</span>
                  </div>
                )}

                <div className="info-item">
                  <Award size={16} />
                  <span>{therapistData.yearsExperience ? `${therapistData.yearsExperience} years experience` : 'Experienced Professional'}</span>
                </div>

                {therapistData.specialties && (
                  <div className="info-item">
                    <Star size={16} />
                    <span>{Array.isArray(therapistData.specialties) ? therapistData.specialties.join(', ') : therapistData.specialties}</span>
                  </div>
                )}

                {therapistData.languagesSpoken && (
                  <div className="info-item">
                    <Languages size={16} />
                    <span>{therapistData.languagesSpoken}</span>
                  </div>
                )}

                {therapistData.licenseNumber && (
                  <div className="info-item">
                    <BookOpen size={16} />
                    <span>License: {therapistData.licenseNumber}</span>
                  </div>
                )}
              </div>

              {therapistData.bio && (
                <div className="therapist-bio">
                  <h4>About</h4>
                  <p>{therapistData.bio}</p>
                </div>
              )}

              <div className="therapist-actions">
                <button 
                  className="btn-primary"
                  onClick={handleReviewRating}
                >
                  <Star size={16} />
                  Rate & Review
                </button>
                <button 
                  className="btn-secondary"
                  onClick={handleRequestTherapist}
                >
                  <RefreshCw size={16} />
                  Request New Therapist
                </button>
                <button 
                  className="btn-danger"
                  onClick={handleReportTherapist}
                >
                  <Flag size={16} />
                  Report This Therapist
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request New Therapist Modal */}
      {showRequestTherapistModal && (
        <div className="modal-overlay" onClick={() => setShowRequestTherapistModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Request New Therapist</h3>
              <button className="close-btn" onClick={() => setShowRequestTherapistModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleRequestSubmit}>
              <div className="form-group">
                <label>Reason for Request *</label>
                <select
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm({...requestForm, reason: e.target.value})}
                  required
                >
                  <option value="">Select a reason</option>
                  <option value="personality_mismatch">Personality mismatch</option>
                  <option value="communication_issues">Communication issues</option>
                  <option value="scheduling_conflicts">Scheduling conflicts</option>
                  <option value="therapeutic_approach">Different therapeutic approach needed</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Preferred Therapist Type</label>
                <select
                  value={requestForm.preferredTherapistType}
                  onChange={(e) => setRequestForm({...requestForm, preferredTherapistType: e.target.value})}
                >
                  <option value="">No preference</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="any">Any gender</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Additional Notes</label>
                <textarea
                  value={requestForm.additionalNotes}
                  onChange={(e) => setRequestForm({...requestForm, additionalNotes: e.target.value})}
                  placeholder="Please provide any additional information that might help us match you with a better therapist..."
                  rows={4}
                />
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setShowRequestTherapistModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Therapist Modal */}
      {showReportTherapistModal && (
        <div className="modal-overlay" onClick={() => setShowReportTherapistModal(false)}>
          <div className="modal report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Report Therapist</h3>
              <button className="close-btn" onClick={() => setShowReportTherapistModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            {/* Warning Card */}
            <div className="warning-card">
              <AlertCircle size={24} />
              <div>
                <h4>Important Notice</h4>
                <p>Please ensure your report is accurate and truthful. False reports may result in account suspension or termination. All reports are taken seriously and will be investigated thoroughly.</p>
              </div>
            </div>
            
            <form onSubmit={handleReportSubmit}>
              <div className="form-group">
                <label>Incident Type *</label>
                <select
                  value={reportForm.incidentType}
                  onChange={(e) => setReportForm({...reportForm, incidentType: e.target.value})}
                  required
                >
                  <option value="">Select incident type</option>
                  <option value="unprofessional_behavior">Unprofessional behavior</option>
                  <option value="inappropriate_conduct">Inappropriate conduct</option>
                  <option value="privacy_violation">Privacy violation</option>
                  <option value="scheduling_issues">Scheduling issues</option>
                  <option value="communication_problems">Communication problems</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={reportForm.description}
                  onChange={(e) => setReportForm({...reportForm, description: e.target.value})}
                  placeholder="Please provide a detailed description of the incident..."
                  rows={4}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Severity Level</label>
                <select
                  value={reportForm.severity}
                  onChange={(e) => setReportForm({...reportForm, severity: e.target.value})}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Additional Details</label>
                <textarea
                  value={reportForm.additionalDetails}
                  onChange={(e) => setReportForm({...reportForm, additionalDetails: e.target.value})}
                  placeholder="Any additional information that might be helpful..."
                  rows={3}
                />
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setShowReportTherapistModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-danger"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Schedule Modal */}
      {showEditScheduleModal && selectedSession && (
        <div className="modal-overlay" onClick={() => setShowEditScheduleModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Session</h3>
              <button className="close-btn" onClick={() => setShowEditScheduleModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleUpdateSession}>
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={editScheduleForm.date}
                  onChange={(e) => setEditScheduleForm({...editScheduleForm, date: e.target.value})}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Time *</label>
                <input
                  type="time"
                  value={editScheduleForm.time}
                  onChange={(e) => setEditScheduleForm({...editScheduleForm, time: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Duration (minutes)</label>
                <select
                  value={editScheduleForm.duration}
                  onChange={(e) => setEditScheduleForm({...editScheduleForm, duration: e.target.value})}
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={editScheduleForm.notes}
                  onChange={(e) => setEditScheduleForm({...editScheduleForm, notes: e.target.value})}
                  placeholder="Any notes about this session..."
                  rows={3}
                />
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setShowEditScheduleModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Updating...' : 'Update Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review & Rating Modal */}
      {showReviewRatingModal && (
        <div className="modal-overlay" onClick={() => setShowReviewRatingModal(false)}>
          <div className="modal review-rating-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rate & Review Your Therapist</h3>
              <button className="close-btn" onClick={() => setShowReviewRatingModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleReviewRatingSubmit}>
              {/* Rating Section */}
              <div className="rating-section">
                <label>Your Rating</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star ${star <= reviewRatingForm.rating ? 'filled' : ''}`}
                      onClick={() => handleStarClick(star)}
                    >
                      <Star size={32} />
                    </button>
                  ))}
                </div>
                <p className="rating-text">
                  {reviewRatingForm.rating === 0 && "Click to rate (optional)"}
                  {reviewRatingForm.rating === 1 && "Poor"}
                  {reviewRatingForm.rating === 2 && "Fair"}
                  {reviewRatingForm.rating === 3 && "Good"}
                  {reviewRatingForm.rating === 4 && "Very Good"}
                  {reviewRatingForm.rating === 5 && "Excellent"}
                </p>
              </div>
              
              {/* Review Section */}
              <div className="form-group">
                <label>Review Title</label>
                <input
                  type="text"
                  value={reviewRatingForm.title}
                  onChange={(e) => setReviewRatingForm({...reviewRatingForm, title: e.target.value})}
                  placeholder="Give your review a title (optional)..."
                />
              </div>
              
              <div className="form-group">
                <label>Your Review/Comment</label>
                <textarea
                  value={reviewRatingForm.comment}
                  onChange={(e) => setReviewRatingForm({...reviewRatingForm, comment: e.target.value})}
                  placeholder="Share your experience with this therapist (optional)..."
                  rows={6}
                />
              </div>
              
              <div className="form-group">
                <label>Related Session (Optional)</label>
                <select
                  value={reviewRatingForm.sessionId}
                  onChange={(e) => setReviewRatingForm({...reviewRatingForm, sessionId: e.target.value})}
                >
                  <option value="">Select a session (optional)</option>
                  {scheduledCalls.map(session => (
                    <option key={session.id} value={session.id}>
                      {formatSessionTimeString(session.scheduledTime)} - {session.status}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={reviewRatingForm.isAnonymous}
                    onChange={(e) => setReviewRatingForm({...reviewRatingForm, isAnonymous: e.target.checked})}
                  />
                  <span>Submit anonymously</span>
                </label>
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setShowReviewRatingModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isSubmitting || (!reviewRatingForm.title && !reviewRatingForm.comment && reviewRatingForm.rating === 0)}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Therapist Calendar Modal */}
      {showTherapistCalendar && (
        <div className="videocall-modal-overlay" onClick={() => setShowTherapistCalendar(false)}>
          <div className="videocall-modal videocall-therapist-calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="videocall-modal-header">
              <h3>Therapist Availability Calendar</h3>
              <button 
                className="videocall-close-btn"
                onClick={() => setShowTherapistCalendar(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="videocall-therapist-calendar-content">
              {isLoadingAvailability ? (
                <div className="videocall-loading-container">
                  <div className="videocall-spinner"></div>
                  <p>Loading therapist availability...</p>
                </div>
              ) : (
                <div className="videocall-therapist-calendar">
                  <div className="videocall-calendar-legend">
                    <div className="videocall-legend-item">
                      <div className="videocall-legend-color videocall-available"></div>
                      <span>Available</span>
                    </div>
                    <div className="videocall-legend-item">
                      <div className="videocall-legend-color videocall-busy"></div>
                      <span>Busy</span>
                    </div>
                  </div>
                  
                  <div className="videocall-calendar-grid">
                    {Array.from({ length: 30 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() + i);
                      const dateString = date.toISOString().split('T')[0];
                      const isBusy = therapistBusyDates.includes(dateString);
                      const isPast = date < new Date();
                      
                      return (
                        <div 
                          key={i} 
                          className={`videocall-calendar-day ${isBusy ? 'videocall-busy' : 'videocall-available'} ${isPast ? 'videocall-past' : ''}`}
                        >
                          <div className="videocall-day-number">{date.getDate()}</div>
                          <div className="videocall-day-name">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                          {isBusy && <div className="videocall-busy-indicator">Busy</div>}
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="videocall-calendar-note">
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
};

export default ClientVideoCall;
