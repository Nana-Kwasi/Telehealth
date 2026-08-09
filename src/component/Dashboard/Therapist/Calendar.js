import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock, 
  User, 
  Phone, 
  FileText, 
  Target, 
  Heart, 
  Brain, 
  Users, 
  TrendingUp, 
  BookOpen, 
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Plus
} from 'lucide-react';
// Enhanced chart imports for System Overview Report
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, 
  Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, 
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ScatterChart, Scatter, ComposedChart,
  Sector, Treemap, TreeMap
} from 'recharts';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  Timestamp, 
  getDocs, 
  getDoc, 
  doc,
  addDoc,
  updateDoc
} from '../../../services/firestoreShim';
import ActionButton from '../../Common/ActionButton';
import { calculateClientProgress } from '../../../utils/clientProgress';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { db, auth } from '../../../services/firestoreShim';
import './Calendar.css';

// Scheduled times come back from the REST API as ISO strings, but this screen was
// written against Firestore Timestamps and called `scheduledTime?.toDate()`. On a
// string that is not a function: the calendar's day filter silently matched
// nothing (so no session ever appeared) and the report/table rows threw outright.
// Accept every shape — Timestamp, Date, ISO string, epoch seconds.
const asDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const TherapistCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [respondingCallId, setRespondingCallId] = useState(null);
  const [therapyNotes, setTherapyNotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [activeTab, setActiveTab] = useState('calendar');
  // Sessions on the day the therapist clicked, shown in a detail dialog.
  const [dayDetail, setDayDetail] = useState(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    duration: '30',
    notes: ''
  });
  const [selectedClient, setSelectedClient] = useState(null);
  const [reportDateRange, setReportDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [reportData, setReportData] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportType, setReportType] = useState('client-progress');
  const [userRole, setUserRole] = useState(null);


  useEffect(() => {
    if (auth.currentUser) {
      loadScheduledCalls();
      loadTherapyNotes();
      loadClients();
      loadUserRole();
    }
  }, [auth.currentUser]);

  const loadUserRole = async () => {
    try {
      const therapistDoc = await getDoc(doc(db, 'therapists', auth.currentUser.uid));
      if (therapistDoc.exists()) {
        const therapistData = therapistDoc.data();
        setUserRole(therapistData.role || 'therapist');
      }
    } catch (error) {
      console.error('Error loading user role:', error);
      setUserRole('therapist');
    }
  };

  const loadScheduledCalls = async () => {
    try {
      const callsQuery = query(
        collection(db, 'scheduledCalls'),
        where('therapistId', '==', auth.currentUser.uid),
        orderBy('scheduledTime', 'asc')
      );
      const snapshot = await getDocs(callsQuery);
      const calls = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setScheduledCalls(calls);
    } catch (error) {
      console.error('Error loading scheduled calls:', error);
    }
  };

  // A client's booking arrives as `pending` and needs an answer; a declined one
  // stays readable to the client but must not sit on the therapist's calendar.
  const isPendingRequest = (call) => String(call?.status || '').toLowerCase() === 'pending';
  const pendingRequests = scheduledCalls.filter(isPendingRequest);
  const confirmedCalls = scheduledCalls.filter(
    (c) => !isPendingRequest(c) && String(c.status || '').toLowerCase() !== 'declined'
  );

  const respondToRequest = async (call, accept) => {
    setRespondingCallId(call.id);
    try {
      await updateDoc(doc(db, 'scheduledCalls', call.id), {
        status: accept ? 'scheduled' : 'declined',
        updatedBy: auth.currentUser.uid,
      });
      // Re-read so the accepted session moves straight onto the grid.
      await loadScheduledCalls();
    } catch (error) {
      console.error('Error responding to session request:', error);
      alert('Could not update the request. Please try again.');
    } finally {
      setRespondingCallId(null);
    }
  };

  const loadTherapyNotes = async () => {
    try {
      const clientsRef = collection(db, 'therapists', auth.currentUser.uid, 'clients');
      const clientsSnapshot = await getDocs(clientsRef);
      const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
      
      const allNotes = [];
      for (const clientId of clientIds) {
        try {
          const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
          const notesSnapshot = await getDocs(notesRef);
          
          // Get client info for the note
          const client = clients.find(c => c.id === clientId);
          const clientName = client ? (client.displayName || client.clientName || client.email || `Client ${clientId}`) : `Client ${clientId}`;
          const clientEmail = client ? (client.clientEmail || client.email) : '';
          
          const notes = notesSnapshot.docs.map(doc => ({
            id: doc.id,
            clientId,
            clientName,
            clientEmail: client ? (client.clientEmail || client.email) : '',
            ...doc.data()
          }));
          allNotes.push(...notes);
        } catch (error) {
          console.error('Error fetching therapy notes for client:', clientId, error);
        }
      }
      
      allNotes.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
      setTherapyNotes(allNotes);
    } catch (error) {
      console.error('Error loading therapy notes:', error);
    }
  };

  const loadClients = async () => {
    try {
      const clientsRef = collection(db, 'therapists', auth.currentUser.uid, 'clients');
      const clientsSnapshot = await getDocs(clientsRef);
      const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
      
      const clientsData = [];
      for (const clientId of clientIds) {
        try {
          const clientDoc = await getDoc(doc(db, 'clients', clientId));
          if (clientDoc.exists()) {
            const clientData = clientDoc.data();
            let authData = {};
            
            try {
              const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
              const authSnapshot = await getDocs(authQuery);
              
              if (!authSnapshot.empty) {
                authData = authSnapshot.docs[0].data();
              } else {
                const authDoc = await getDoc(doc(db, 'auth', clientId));
                if (authDoc.exists()) {
                  authData = authDoc.data();
                }
              }
            } catch (authError) {
              console.log('Error fetching auth data for client:', clientId, authError);
            }
            
            let displayName = 'Client';
            if (authData.name) {
              displayName = authData.name;
            } else if (authData.email) {
              displayName = authData.email.split('@')[0];
            } else if (clientData.email) {
              displayName = clientData.email.split('@')[0];
            } else if (clientData.gender && clientData.age) {
              displayName = `${clientData.gender === 'man' ? 'Male' : clientData.gender === 'woman' ? 'Female' : 'Person'} (${clientData.age})`;
            }
            
            const enhancedClientData = {
              id: clientId,
              ...clientData,
              ...authData,
              displayName: displayName
            };
            
            clientsData.push(enhancedClientData);
          }
        } catch (error) {
          console.error('Error fetching client data:', error);
        }
      }
      
      clientsData.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      setClients(clientsData);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  // Calendar navigation
  const goToPreviousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Calendar logic
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days = [];
    
    for (let i = startingDay - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, lastDay.getDate() - i));
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push(new Date(year, month + 1, i));
    }
    
    return days;
  };

  const getCallsForDate = (date) => {
    return confirmedCalls.filter(call => {
      const callDate = asDate(call.scheduledTime);
      if (!callDate) return false;
      return callDate.toDateString() === date.toDateString();
    });
  };

  const isToday = (date) => {
    return date.toDateString() === new Date().toDateString();
  };

  const isSelected = (date) => {
    return selectedDate && date.toDateString() === selectedDate.toDateString();
  };

  const isCurrentMonth = (date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  const calendarDays = getDaysInMonth(currentDate);
  const selectedDateCalls = getCallsForDate(selectedDate);

  // Helper functions for therapy notes
  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.displayName : 'Unknown Client';
  };

  const getMoodEmoji = (rating) => {
    if (rating >= 8) return '😊';
    if (rating >= 6) return '🙂';
    if (rating >= 4) return '😐';
    if (rating >= 2) return '😕';
    return '😢';
  };

  const getInterventionColor = (intervention) => {
    const colors = {
      'CBT': '#3B82F6',
      'DBT': '#8B5CF6',
      'EMDR': '#EF4444',
      'Mindfulness': '#10B981',
      'Exposure Therapy': '#F59E0B',
      'Psychodynamic': '#EC4899'
    };
    return colors[intervention] || '#6B7280';
  };

  // Schedule call function
  const scheduleCall = async (client) => {
    if (!scheduleForm.date || !scheduleForm.time) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const dateTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      const scheduledTime = Timestamp.fromDate(dateTime);
      
      const callData = {
        therapistId: auth.currentUser.uid,
        clientId: client.id,
        clientName: client.displayName,
        scheduledTime,
        duration: parseInt(scheduleForm.duration),
        notes: scheduleForm.notes || '',
        status: 'scheduled',
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, 'scheduledCalls'), callData);
      
      setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
      setSelectedClient(null);
      setShowScheduleForm(false);
      
      alert('Call scheduled successfully!');
      
      setTimeout(() => {
        loadScheduledCalls();
      }, 1000);
    } catch (error) {
      console.error('Error scheduling call:', error);
      alert('Failed to schedule call: ' + error.message);
    }
  };

  // A therapist with no assigned clients has nobody to schedule with — the form's
  // client picker would be empty and every submit would fail. Block it up front.
  const canSchedule = clients.length > 0;

  // Clicking a day shows what's booked; clicking an empty future day starts a
  // booking on that date instead of only highlighting it.
  const handleDayClick = (date, callsForDate) => {
    setSelectedDate(date);
    if (callsForDate.length > 0) { setDayDetail({ date, calls: callsForDate }); return; }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (date < startOfToday) return;
    if (!canSchedule) {
      alert('You can schedule sessions once a client has been assigned to you.');
      return;
    }
    setScheduleForm({
      date: date.toISOString().split('T')[0],
      time: '',
      duration: '30',
      notes: '',
    });
    setShowScheduleForm(true);
  };

  const openScheduleForm = () => {
    if (!canSchedule) {
      alert('You can schedule sessions once a client has been assigned to you.');
      return;
    }
    setScheduleForm({
      date: selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      time: '',
      duration: '30',
      notes: ''
    });
    setShowScheduleForm(true);
  };

  // Report generation functions
  const generateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const startDate = new Date(reportDateRange.startDate);
      const endDate = new Date(reportDateRange.endDate);
      
      let report;
      switch (reportType) {
        case 'client-progress':
          report = await generateClientProgressReport(startDate, endDate);
          break;
        case 'therapy-notes':
          report = await generateTherapyNotesReport(startDate, endDate);
          break;
        case 'scheduled-calls':
          report = await generateScheduledCallsReport(startDate, endDate);
          break;
        case 'all-therapy-notes':
          if (userRole === 'admin') {
            report = await generateAllTherapyNotesReport(startDate, endDate);
          } else {
            throw new Error('Access denied: Admin role required');
          }
          break;
        case 'all-scheduled-calls':
          if (userRole === 'admin') {
            report = await generateAllScheduledCallsReport(startDate, endDate);
          } else {
            throw new Error('Access denied: Admin role required');
          }
          break;
        case 'all-therapists':
          if (userRole === 'admin') {
            report = await generateAllTherapistsReport(startDate, endDate);
          } else {
            throw new Error('Access denied: Admin role required');
          }
          break;
        case 'all-clients':
          if (userRole === 'admin') {
            report = await generateAllClientsReport(startDate, endDate);
          } else {
            throw new Error('Access denied: Admin role required');
          }
          break;
        case 'system-overview':
          if (userRole === 'admin') {
            report = await generateSystemOverviewReport(startDate, endDate);
          } else {
            throw new Error('Access denied: Admin role required');
          }
          break;
        default:
          report = await generateClientProgressReport(startDate, endDate);
      }
      
      setReportData(report);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Client Progress Report
  const generateClientProgressReport = async (startDate, endDate) => {
    const therapistId = auth.currentUser.uid;
    const clientsRef = collection(db, 'therapists', therapistId, 'clients');
    const clientsSnapshot = await getDocs(clientsRef);
    const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
    
    const clientProgress = [];
    let totalSessions = 0;
    let totalProgress = 0;
    
    for (const clientId of clientIds) {
      const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
      const notesSnapshot = await getDocs(notesRef);
      const notes = notesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(note => {
          const noteDate = new Date(note.sessionDate);
          return noteDate >= startDate && noteDate <= endDate;
        });
      
      const sessions = notes.length;
      // Change from baseline across the client's readings — not the average mood
      // level, and not a 5-per-missing-rating default that manufactured 50%.
      const progress = calculateClientProgress([], notes)?.percent ?? null;
      
      totalSessions += sessions;
      totalProgress += progress;
      
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      const clientData = clientDoc.exists() ? clientDoc.data() : {};
      
      // Get client profile image and name from auth collection
      let clientImage = null;
      let authData = {};
      
      try {
        const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
        const authSnapshot = await getDocs(authQuery);
        
        if (!authSnapshot.empty) {
          authData = authSnapshot.docs[0].data();
        } else {
          const authDoc = await getDoc(doc(db, 'auth', clientId));
          if (authDoc.exists()) {
            authData = authDoc.data();
          }
        }
      } catch (error) {
        console.log('Error fetching client auth data:', error);
      }
      
      clientImage = authData.profileImage || authData.photoURL;
      
      // Use the same logic as loadClients for consistent naming
      let displayName = 'Client';
      if (authData.name) {
        displayName = authData.name;
      } else if (authData.email) {
        displayName = authData.email.split('@')[0];
      } else if (clientData.email) {
        displayName = clientData.email.split('@')[0];
      } else if (clientData.gender && clientData.age) {
        let genderText = 'Person';
        if (clientData.gender === 'man') {
          genderText = 'Male';
        } else if (clientData.gender === 'woman') {
          genderText = 'Female';
        }
        displayName = `${genderText} (${clientData.age})`;
      } else {
        displayName = `Client ${clientId.slice(0, 8)}`;
      }
      
      clientProgress.push({
        id: clientId,
        name: displayName,
        email: authData.email || clientData.email,
        clientImage: clientImage,
        totalSessions: sessions,
        progress,
        lastSession: sessions > 0 ? new Date(notes[notes.length - 1].sessionDate).toLocaleDateString() : 'N/A'
      });
    }
    
    const assignedClients = clientIds.length;
    const averageProgress = assignedClients > 0 ? Math.round(totalProgress / assignedClients) : 0;
    
    return {
      type: 'Client Progress Report',
      assignedClients,
      totalSessions,
      averageProgress,
      clientProgress,
      dateRange: { startDate, endDate }
    };
  };

  // Therapy Notes Report
  const generateTherapyNotesReport = async (startDate, endDate) => {
    const therapistId = auth.currentUser.uid;
    const clientsRef = collection(db, 'therapists', therapistId, 'clients');
    const clientsSnapshot = await getDocs(clientsRef);
    const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
    
    const allNotes = [];
    let totalNotes = 0;
    let totalMoodRating = 0;
    
    for (const clientId of clientIds) {
      const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
      const notesSnapshot = await getDocs(notesRef);
      const notes = notesSnapshot.docs
        .map(doc => ({ id: doc.id, clientId, ...doc.data() }))
        .filter(note => {
          const noteDate = new Date(note.sessionDate);
          return noteDate >= startDate && noteDate <= endDate;
        });
      
      totalNotes += notes.length;
      // Only rated notes contribute; an unrated note is missing data, not a 5.
      totalMoodRating += notes.reduce((sum, note) => sum + (Number(note.moodRating) || 0), 0);
      
      for (const note of notes) {
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        const clientData = clientDoc.exists() ? clientDoc.data() : {};
        
        // Get client name using the same logic as loadClients
        let authData = {};
        try {
          const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
          const authSnapshot = await getDocs(authQuery);
          
          if (!authSnapshot.empty) {
            authData = authSnapshot.docs[0].data();
          } else {
            const authDoc = await getDoc(doc(db, 'auth', clientId));
            if (authDoc.exists()) {
              authData = authDoc.data();
            }
          }
        } catch (error) {
          console.log('Error fetching client auth data:', error);
        }
        
        // Use the same naming logic as loadClients
        let displayName = 'Client';
        if (authData.name) {
          displayName = authData.name;
        } else if (authData.email) {
          displayName = authData.email.split('@')[0];
        } else if (clientData.email) {
          displayName = clientData.email.split('@')[0];
        } else if (clientData.gender && clientData.age) {
          let genderText = 'Person';
          if (clientData.gender === 'man') {
            genderText = 'Male';
          } else if (clientData.gender === 'woman') {
            genderText = 'Female';
          }
          displayName = `${genderText} (${clientData.age})`;
        } else {
          displayName = `Client ${clientId.slice(0, 8)}`;
        }
        
        // Get current therapist name
        const currentTherapistDoc = await getDoc(doc(db, 'therapists', therapistId));
        const currentTherapistData = currentTherapistDoc.exists() ? currentTherapistDoc.data() : {};
        const therapistName = currentTherapistData.name || currentTherapistData.email || 'Unknown Therapist';
        
        // A single session's mood is a reading, not progress, and `|| 5` invented
        // a 50% score whenever the rating was missing. Report the reading itself.
        const moodReading = Number(note.moodRating);
        const progressPercentage = Number.isFinite(moodReading) ? Math.round((moodReading / 10) * 100) : null;
        
        allNotes.push({
          id: note.id,
          clientName: displayName,
          sessionDate: new Date(note.sessionDate).toLocaleDateString(),
          sessionFocus: note.sessionFocus || 'N/A',
          moodRating: Number(note.moodRating) || null,
          interventionsUsed: note.interventionsUsed || 'N/A',
          progressAssessment: note.progressAssessment || 'N/A',
          progressPercentage: progressPercentage,
          therapistName: therapistName
        });
      }
    }
    
    const averageMoodRating = totalNotes > 0 ? Math.round((totalMoodRating / totalNotes) * 10) / 10 : 0;
    
    return {
      type: 'My Therapy Notes Report',
      totalNotes,
      averageMoodRating,
      notes: allNotes.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)),
      dateRange: { startDate, endDate }
    };
  };

  // All Therapy Notes Report (Admin only)
  const generateAllTherapyNotesReport = async (startDate, endDate) => {
    if (userRole !== 'admin') {
      throw new Error('Access denied: Admin role required');
    }

    const allNotes = [];
    let totalNotes = 0;
    let totalMoodRating = 0;
    
    // Get all clients from all therapists
    const allTherapistsSnapshot = await getDocs(collection(db, 'therapists'));
    
    for (const therapistDoc of allTherapistsSnapshot.docs) {
      const therapistData = therapistDoc.data();
      const therapistId = therapistDoc.id;
      
      // Get clients assigned to this therapist
      const clientsRef = collection(db, 'therapists', therapistId, 'clients');
      const clientsSnapshot = await getDocs(clientsRef);
      const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
      
      for (const clientId of clientIds) {
        const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
        const notesSnapshot = await getDocs(notesRef);
        const notes = notesSnapshot.docs
          .map(doc => ({ id: doc.id, clientId, therapistId, ...doc.data() }))
          .filter(note => {
            const noteDate = new Date(note.sessionDate);
            return noteDate >= startDate && noteDate <= endDate;
          });
        
        totalNotes += notes.length;
        // Only rated notes contribute; an unrated note is missing data, not a 5.
      totalMoodRating += notes.reduce((sum, note) => sum + (Number(note.moodRating) || 0), 0);
        
        for (const note of notes) {
          const clientDoc = await getDoc(doc(db, 'clients', clientId));
          const clientData = clientDoc.exists() ? clientDoc.data() : {};
          
          // Get client name using the same logic
          let authData = {};
          try {
            const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
            const authSnapshot = await getDocs(authQuery);
            
            if (!authSnapshot.empty) {
              authData = authSnapshot.docs[0].data();
            } else {
              const authDoc = await getDoc(doc(db, 'auth', clientId));
              if (authDoc.exists()) {
                authData = authDoc.data();
              }
            }
          } catch (error) {
            console.log('Error fetching client auth data:', error);
          }
          
          // Use the same naming logic
          let displayName = 'Client';
          if (authData.name) {
            displayName = authData.name;
          } else if (authData.email) {
            displayName = authData.email.split('@')[0];
          } else if (clientData.email) {
            displayName = clientData.email.split('@')[0];
          } else if (clientData.gender && clientData.age) {
            let genderText = 'Person';
            if (clientData.gender === 'man') {
              genderText = 'Male';
            } else if (clientData.gender === 'woman') {
              genderText = 'Female';
            }
            displayName = `${genderText} (${clientData.age})`;
          } else {
            displayName = `Client ${clientId.slice(0, 8)}`;
          }
          
          // Get therapist name
          const therapistName = therapistData.name || therapistData.email || 'Unknown Therapist';
          
          // See above — a reading, not progress, and never a fabricated default.
          const moodReading = Number(note.moodRating);
          const progressPercentage = Number.isFinite(moodReading) ? Math.round((moodReading / 10) * 100) : null;
          
          allNotes.push({
            id: note.id,
            clientName: displayName,
            sessionDate: new Date(note.sessionDate).toLocaleDateString(),
            sessionFocus: note.sessionFocus || 'N/A',
            moodRating: Number(note.moodRating) || null,
            interventionsUsed: note.interventionsUsed || 'N/A',
            progressAssessment: note.progressAssessment || 'N/A',
            progressPercentage: progressPercentage,
            therapistName: therapistName
          });
        }
      }
    }
    
    const averageMoodRating = totalNotes > 0 ? Math.round((totalMoodRating / totalNotes) * 10) / 10 : 0;
    
    return {
      type: 'All Therapy Notes Report',
      totalNotes,
      averageMoodRating,
      notes: allNotes.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)),
      dateRange: { startDate, endDate }
    };
  };

  // Scheduled Calls Report (User-specific)
  const generateScheduledCallsReport = async (startDate, endDate) => {
    const therapistId = auth.currentUser.uid;
    const callsQuery = query(
      collection(db, 'scheduledCalls'),
      where('therapistId', '==', therapistId),
      where('scheduledTime', '>=', Timestamp.fromDate(startDate)),
      where('scheduledTime', '<=', Timestamp.fromDate(endDate))
    );
    const callsSnapshot = await getDocs(callsQuery);
    const calls = callsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const totalCalls = calls.length;
    const completedCalls = calls.filter(call => call.status === 'completed').length;
    const pendingCalls = calls.filter(call => call.status === 'scheduled').length;
    
    return {
      type: 'My Scheduled Calls Report',
      totalCalls,
      completedCalls,
      pendingCalls,
      calls: calls.sort((a, b) => asDate(a.scheduledTime) - asDate(b.scheduledTime)),
      dateRange: { startDate, endDate }
    };
  };

  // All Scheduled Calls Report (Admin only)
  const generateAllScheduledCallsReport = async (startDate, endDate) => {
    if (userRole !== 'admin') {
      throw new Error('Access denied: Admin role required');
    }

    const callsQuery = query(
      collection(db, 'scheduledCalls'),
      where('scheduledTime', '>=', Timestamp.fromDate(startDate)),
      where('scheduledTime', '<=', Timestamp.fromDate(endDate))
    );
    const callsSnapshot = await getDocs(callsQuery);
    const calls = callsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get client and therapist names for each call
    const enhancedCalls = [];
    for (const call of calls) {
      let clientName = 'Unknown Client';
      let therapistName = 'Unknown Therapist';
      let scheduledBy = 'Unknown';
      
      try {
        // Get client name using comprehensive logic
        if (call.clientId) {
          const clientDoc = await getDoc(doc(db, 'clients', call.clientId));
          if (clientDoc.exists()) {
            const clientData = clientDoc.data();
            
            // Get client name from auth collection first
            let authData = {};
            try {
              const authQuery = query(collection(db, 'auth'), where('clientId', '==', call.clientId));
              const authSnapshot = await getDocs(authQuery);
              
              if (!authSnapshot.empty) {
                authData = authSnapshot.docs[0].data();
              } else {
                const authDoc = await getDoc(doc(db, 'auth', call.clientId));
                if (authDoc.exists()) {
                  authData = authDoc.data();
                }
              }
            } catch (error) {
              console.log('Error fetching client auth data:', error);
            }
            
            // Use the same comprehensive naming logic as other functions
            if (authData.name) {
              clientName = authData.name;
            } else if (authData.email) {
              clientName = authData.email.split('@')[0];
            } else if (clientData.name) {
              clientName = clientData.name;
            } else if (clientData.email) {
              clientName = clientData.email.split('@')[0];
            } else if (clientData.gender && clientData.age) {
              let genderText = 'Person';
              if (clientData.gender === 'man') {
                genderText = 'Male';
              } else if (clientData.gender === 'woman') {
                genderText = 'Female';
              }
              clientName = `${genderText} (${clientData.age})`;
            } else {
              clientName = `Client ${call.clientId.slice(0, 8)}`;
            }
          }
        }
        
        // Get therapist name
        if (call.therapistId) {
          const therapistDoc = await getDoc(doc(db, 'therapists', call.therapistId));
          if (therapistDoc.exists()) {
            const therapistData = therapistDoc.data();
            therapistName = therapistData.name || therapistData.email || 'Unknown Therapist';
          }
        }
        
        // Determine who scheduled the call and get their name
        let scheduledByName = 'Unknown';
        let scheduledByRole = 'Unknown';
        
        if (call.scheduledBy === 'client' || call.scheduledBy === 'therapist') {
          scheduledByRole = call.scheduledBy === 'client' ? 'Client' : 'Therapist';
          
          // Get the actual name of who scheduled the call
          if (call.scheduledBy === 'client' && call.clientId) {
            // Get client name from auth collection
            try {
              const clientAuthQuery = query(collection(db, 'auth'), where('clientId', '==', call.clientId));
              const clientAuthSnapshot = await getDocs(clientAuthQuery);
              
              if (!clientAuthSnapshot.empty) {
                const clientAuthData = clientAuthSnapshot.docs[0].data();
                scheduledByName = clientAuthData.name || clientAuthData.email?.split('@')[0] || 'Unknown Client';
              } else {
                // Fallback to client document
                const clientDoc = await getDoc(doc(db, 'clients', call.clientId));
                if (clientDoc.exists()) {
                  const clientData = clientDoc.data();
                  scheduledByName = clientData.name || clientData.email?.split('@')[0] || 'Unknown Client';
                }
              }
            } catch (error) {
              console.log('Error fetching client auth data for scheduledBy:', error);
              scheduledByName = 'Unknown Client';
            }
          } else if (call.scheduledBy === 'therapist' && call.therapistId) {
            // Get therapist name
            try {
              const therapistDoc = await getDoc(doc(db, 'therapists', call.therapistId));
              if (therapistDoc.exists()) {
                const therapistData = therapistDoc.data();
                scheduledByName = therapistData.name || therapistData.email?.split('@')[0] || 'Unknown Therapist';
              }
            } catch (error) {
              console.log('Error fetching therapist data for scheduledBy:', error);
              scheduledByName = 'Unknown Therapist';
            }
          }
        } else if (call.scheduledBy) {
          // If scheduledBy has a custom value, use it
          scheduledByName = call.scheduledBy;
          scheduledByRole = 'Custom';
        } else {
          // If no scheduledBy field, try to determine from context
          if (call.clientId && call.therapistId) {
            // Default assumption: therapist scheduled it
            scheduledByRole = 'Therapist';
            try {
              const therapistDoc = await getDoc(doc(db, 'therapists', call.therapistId));
              if (therapistDoc.exists()) {
                const therapistData = therapistDoc.data();
                scheduledByName = therapistData.name || therapistData.email?.split('@')[0] || 'Unknown Therapist';
              }
            } catch (error) {
              console.log('Error fetching therapist data for default scheduledBy:', error);
              scheduledByName = 'Unknown Therapist';
            }
          } else {
            scheduledByName = 'Unknown';
            scheduledByRole = 'Unknown';
          }
        }
        
        // Format the scheduledBy field as "Name (Role)"
        scheduledBy = `${scheduledByName} (${scheduledByRole})`;
        
      } catch (error) {
        console.log('Error fetching client/therapist data:', error);
      }
      
      enhancedCalls.push({
        ...call,
        clientName,
        therapistName,
        scheduledBy
      });
    }
    
    const totalCalls = enhancedCalls.length;
    const completedCalls = enhancedCalls.filter(call => call.status === 'completed').length;
    const pendingCalls = enhancedCalls.filter(call => call.status === 'scheduled').length;
    
    return {
      type: 'All Scheduled Calls Report',
      totalCalls,
      completedCalls,
      pendingCalls,
      calls: enhancedCalls.sort((a, b) => asDate(a.scheduledTime) - asDate(b.scheduledTime)),
      dateRange: { startDate, endDate }
    };
  };

  // Admin Reports
  const generateAllTherapistsReport = async (startDate, endDate) => {
    const therapistsSnapshot = await getDocs(collection(db, 'therapists'));
    const therapists = [];
    
    for (const therapistDoc of therapistsSnapshot.docs) {
      const therapistData = therapistDoc.data();
      const therapistId = therapistDoc.id;
      
      const clientsRef = collection(db, 'therapists', therapistId, 'clients');
      const clientsSnapshot = await getDocs(clientsRef);
      const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
      
      let totalSessions = 0;
      let totalProgress = 0;
      
      for (const clientId of clientIds) {
        const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
        const notesSnapshot = await getDocs(notesRef);
        const notes = notesSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(note => {
            const noteDate = new Date(note.sessionDate);
            return noteDate >= startDate && noteDate <= endDate;
          });
        
        totalSessions += notes.length;
        totalProgress += notes.reduce((sum, note) => sum + (Number(note.moodRating) || 0), 0);
      }
      
      const averageProgress = totalSessions > 0 ? Math.round((totalProgress / totalSessions) * 10) : 0;
      
      // Get therapist profile image and name if available
      let therapistImage = null;
      let therapistName = therapistData.name || therapistData.email || 'Unknown Therapist';
      
      try {
        const authQuery = query(collection(db, 'auth'), where('uid', '==', therapistId));
        const authSnapshot = await getDocs(authQuery);
        if (!authSnapshot.empty) {
          const authData = authSnapshot.docs[0].data();
          therapistImage = authData.profileImage || authData.photoURL;
          therapistName = authData.name || authData.email?.split('@')[0] || therapistData.name || therapistData.email || 'Unknown Therapist';
        }
      } catch (error) {
        console.log('Error fetching therapist auth data:', error);
      }
      
      therapists.push({
        id: therapistId,
        name: therapistName,
        email: therapistData.email,
        role: therapistData.role || 'therapist',
        assignedClients: clientIds.length,
        totalSessions,
        averageProgress,
        therapistImage
      });
    }
    
    return {
      type: 'All Therapists Report',
      totalTherapists: therapists.length,
      therapists,
      dateRange: { startDate, endDate }
    };
  };

  const generateAllClientsReport = async (startDate, endDate) => {
    const clientsSnapshot = await getDocs(collection(db, 'clients'));
    const clients = [];
    
    for (const clientDoc of clientsSnapshot.docs) {
      const clientData = clientDoc.data();
      const clientId = clientDoc.id;
      
      // Find assigned therapist by checking therapists collection
      let assignedTherapist = 'Unassigned';
      let therapistId = null;
      
      // Check all therapists to see who has this client assigned
      const therapistsSnapshot = await getDocs(collection(db, 'therapists'));
      for (const therapistDoc of therapistsSnapshot.docs) {
        const therapistData = therapistDoc.data();
        const therapistClientsRef = collection(db, 'therapists', therapistDoc.id, 'clients');
        const therapistClientsSnapshot = await getDocs(therapistClientsRef);
        
        // Check if this client is assigned to this therapist
        const isAssigned = therapistClientsSnapshot.docs.some(doc => doc.data().clientId === clientId);
        if (isAssigned) {
          assignedTherapist = therapistData.name || therapistData.email || 'Unknown Therapist';
          therapistId = therapistDoc.id;
          break;
        }
      }
      
      // Get client's sessions and progress
      const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
      const notesSnapshot = await getDocs(notesRef);
      const notes = notesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(note => {
          const noteDate = new Date(note.sessionDate);
          return noteDate >= startDate && noteDate <= endDate;
        });
      
      const totalSessions = notes.length;
      const progress = calculateClientProgress([], notes)?.percent ?? null;
      
      // Get client profile image if available
      let clientImage = null;
      try {
        const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
        const authSnapshot = await getDocs(authQuery);
        if (!authSnapshot.empty) {
          const authData = authSnapshot.docs[0].data();
          clientImage = authData.profileImage || authData.photoURL;
        }
      } catch (error) {
        console.log('Error fetching client image:', error);
      }
      
      // Get client name from auth collection
      let clientName = 'Unknown';
      let clientEmail = clientData.email;
      
      try {
        const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
        const authSnapshot = await getDocs(authQuery);
        if (!authSnapshot.empty) {
          const authData = authSnapshot.docs[0].data();
          clientName = authData.name || authData.email?.split('@')[0] || 'Unknown';
          clientEmail = authData.email || clientData.email;
        } else {
          // Fallback: try to find by uid if clientId doesn't work
          const authDoc = await getDoc(doc(db, 'auth', clientId));
          if (authDoc.exists()) {
            const authData = authDoc.data();
            clientName = authData.name || authData.email?.split('@')[0] || 'Unknown';
            clientEmail = authData.email || clientData.email;
          }
        }
      } catch (error) {
        console.log('Error fetching client auth data:', error);
        // Use fallback names
        if (clientData.email) {
          clientName = clientData.email.split('@')[0];
        } else if (clientData.gender && clientData.age) {
          clientName = `${clientData.gender === 'man' ? 'Male' : clientData.gender === 'woman' ? 'Female' : 'Person'} (${clientData.age})`;
        }
      }
      
      clients.push({
        id: clientId,
        name: clientName,
        email: clientEmail,
        assignedTherapist,
        therapistId,
        totalSessions,
        progress,
        lastSession: totalSessions > 0 ? new Date(notes[notes.length - 1].sessionDate).toLocaleDateString() : 'N/A',
        clientImage
      });
    }
    
    return {
      type: 'All Clients Report',
      totalClients: clients.length,
      clients,
      dateRange: { startDate, endDate }
    };
  };

  const generateSystemOverviewReport = async (startDate, endDate) => {
    const therapistsSnapshot = await getDocs(collection(db, 'therapists'));
    const clientsSnapshot = await getDocs(collection(db, 'clients'));
    const scheduledCallsSnapshot = await getDocs(collection(db, 'scheduledCalls'));
    
    // Enhanced data collection for comprehensive analysis
    let totalSessions = 0;
    let totalProgress = 0;
    let totalMoodRating = 0;
    let totalDuration = 0;
    let totalCalls = 0;
    let completedCalls = 0;
    let cancelledCalls = 0;
    
    // Data structures for charts
    const monthlyData = {};
    const weeklyData = {};
    const therapistPerformance = [];
    const therapistEfficiencyData = [];
    const clientProgressData = [];
    const clientRetentionData = [];
    const interventionStats = {};
    const sessionTypeData = {};
    const moodTrends = [];
    const callStatusData = [];
    const sessionDurationData = [];
    const ageGroupData = {};
    const genderDistribution = {};
    
    // Process therapists data with enhanced metrics
    for (const therapistDoc of therapistsSnapshot.docs) {
      const therapistData = therapistDoc.data();
      const therapistId = therapistDoc.id;
      
      // Get therapist's assigned clients using the same logic as loadClients
      let assignedClients = [];
      try {
        const therapistClientsRef = collection(db, 'therapists', therapistId, 'clients');
        const therapistClientsSnapshot = await getDocs(therapistClientsRef);
        const clientIds = therapistClientsSnapshot.docs.map(doc => doc.data().clientId);
        
        for (const clientId of clientIds) {
          try {
            const clientDoc = await getDoc(doc(db, 'clients', clientId));
            if (clientDoc.exists()) {
              const clientData = clientDoc.data();
              let authData = {};
              
              try {
                const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
                const authSnapshot = await getDocs(authQuery);
                
                if (!authSnapshot.empty) {
                  authData = authSnapshot.docs[0].data();
                } else {
                  const authDoc = await getDoc(doc(db, 'auth', clientId));
                  if (authDoc.exists()) {
                    authData = authDoc.data();
                  }
                }
              } catch (authError) {
                console.log('Error fetching auth data for client:', clientId, authError);
              }
              
              let displayName = 'Client';
              if (authData.name) {
                displayName = authData.name;
              } else if (authData.email) {
                displayName = authData.email.split('@')[0];
              } else if (clientData.email) {
                displayName = clientData.email.split('@')[0];
              } else if (clientData.gender && clientData.age) {
                displayName = `${clientData.gender === 'man' ? 'Male' : clientData.gender === 'woman' ? 'Female' : 'Person'} (${clientData.age})`;
              }
              
              assignedClients.push({
                id: clientId,
                ...clientData,
                ...authData,
                displayName: displayName
              });
            }
          } catch (error) {
            console.error('Error fetching client data:', error);
          }
        }
      } catch (error) {
        console.error('Error fetching therapist clients:', error);
      }
      
      // Get therapist's sessions and detailed metrics
      let therapistSessions = 0;
      let therapistProgress = 0;
      let totalSessionDuration = 0;
      let totalMoodRating = 0;
      let sessionCount = 0;
      const therapistSessionTypes = {};
      const therapistInterventions = {};
      
      for (const clientDoc of assignedClients) {
        const clientId = clientDoc.id;
        const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
        const notesSnapshot = await getDocs(notesRef);
        const notes = notesSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(note => {
            const noteDate = new Date(note.sessionDate);
            return noteDate >= startDate && noteDate <= endDate;
          });
        
        therapistSessions += notes.length;
        
        // Process each session for detailed metrics
        notes.forEach(note => {
          const moodRating = Number(note.moodRating) || null;
          const sessionDuration = note.sessionDuration || 60;
          const sessionFocus = note.sessionFocus || 'General';
          const interventions = note.interventionsUsed || 'None';
          
          therapistProgress += moodRating;
          totalSessionDuration += sessionDuration;
          totalMoodRating += moodRating;
          sessionCount++;
          
          // Track session types
          therapistSessionTypes[sessionFocus] = (therapistSessionTypes[sessionFocus] || 0) + 1;
          
          // Track interventions
          therapistInterventions[interventions] = (therapistInterventions[interventions] || 0) + 1;
        });
      }
      
      // Enhanced therapist performance data with real metrics
      const therapistWorkload = {
        name: therapistData.name || therapistData.email || 'Unknown',
        sessions: therapistSessions,
        // No per-client reading series is in scope here, and an average mood
        // level is not progress — so this row reports volume, not outcome.
        progress: null,
        clients: assignedClients.length,
        avgSessionsPerClient: assignedClients.length > 0 ? Math.round(therapistSessions / assignedClients.length) : 0,
        avgSessionDuration: sessionCount > 0 ? Math.round(totalSessionDuration / sessionCount) : 0,
        avgMoodRating: sessionCount > 0 ? Math.round((totalMoodRating / sessionCount) * 10) / 10 : 0,
        efficiency: assignedClients.length > 0 ? Math.round((therapistSessions / assignedClients.length) * (totalMoodRating / Math.max(sessionCount, 1))) : 0,
        sessionTypes: therapistSessionTypes,
        interventions: therapistInterventions
      };
      
      therapistPerformance.push(therapistWorkload);
      therapistEfficiencyData.push(therapistWorkload);
    }
    
    // Ensure we have at least some data for charts
    if (therapistPerformance.length === 0) {
      therapistPerformance.push({
        name: 'Sample Therapist',
        sessions: 0,
        progress: 0,
        clients: 0,
        avgSessionsPerClient: 0,
        avgSessionDuration: 0,
        avgMoodRating: 0,
        efficiency: 0
      });
      therapistEfficiencyData.push({
        name: 'Sample Therapist',
        sessions: 0,
        progress: 0,
        clients: 0,
        avgSessionsPerClient: 0,
        avgSessionDuration: 0,
        avgMoodRating: 0,
        efficiency: 0
      });
    }
    
    // Process clients and sessions data with proper demographics
    for (const clientDoc of clientsSnapshot.docs) {
      const clientData = clientDoc.data();
      const clientId = clientDoc.id;
      
      // Get client profile data from auth collection for demographics
      let authData = {};
      try {
        const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
        const authSnapshot = await getDocs(authQuery);
        if (!authSnapshot.empty) {
          authData = authSnapshot.docs[0].data();
        } else {
          const authDoc = await getDoc(doc(db, 'auth', clientId));
          if (authDoc.exists()) {
            authData = authDoc.data();
          }
        }
      } catch (error) {
        console.log('Error fetching client auth data:', error);
      }
      
      // Enhanced client demographics with real data from both sources
      const age = authData.age || clientData.age;
      const gender = authData.gender || clientData.gender;
      
      if (age) {
        const ageGroup = Math.floor(age / 10) * 10;
        ageGroupData[ageGroup] = (ageGroupData[ageGroup] || 0) + 1;
      }
      
      if (gender) {
        genderDistribution[gender] = (genderDistribution[gender] || 0) + 1;
      }
      
      // Get client's therapy notes
      const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
      const notesSnapshot = await getDocs(notesRef);
      const notes = notesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(note => {
          const noteDate = new Date(note.sessionDate);
          return noteDate >= startDate && noteDate <= endDate;
        });
      
      totalSessions += notes.length;
      
      // Process each session
      notes.forEach(note => {
        const sessionDate = new Date(note.sessionDate);
        const monthKey = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}`;
        const weekKey = `${sessionDate.getFullYear()}-W${Math.ceil((sessionDate.getDate() + new Date(sessionDate.getFullYear(), sessionDate.getMonth(), 1).getDay()) / 7)}`;
        
        // Enhanced monthly data aggregation with comprehensive metrics
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            month: monthKey,
            sessions: 0,
            progress: 0,
            moodRating: 0,
            duration: 0,
            uniqueClients: new Set(),
            sessionTypes: {},
            avgMoodRating: 0,
            totalMoodRating: 0,
            avgSessionDuration: 0,
            totalSessionDuration: 0
          };
        }
        monthlyData[monthKey].sessions += 1;
        monthlyData[monthKey].progress += (Number(note.moodRating) || 0);
        monthlyData[monthKey].moodRating += (Number(note.moodRating) || 0);
        monthlyData[monthKey].duration += note.sessionDuration || 60;
        monthlyData[monthKey].uniqueClients.add(clientId);
        monthlyData[monthKey].totalMoodRating += (Number(note.moodRating) || 0);
        monthlyData[monthKey].totalSessionDuration += note.sessionDuration || 60;
        
        // Track session types per month
        const sessionType = note.sessionFocus || 'General';
        monthlyData[monthKey].sessionTypes[sessionType] = (monthlyData[monthKey].sessionTypes[sessionType] || 0) + 1;
        
        // Weekly data aggregation
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = {
            week: weekKey,
            sessions: 0,
            totalMood: 0,
            avgMood: 0
          };
        }
        weeklyData[weekKey].sessions += 1;
        weeklyData[weekKey].totalMood += (Number(note.moodRating) || 0);
        weeklyData[weekKey].avgMood = Math.round((weeklyData[weekKey].totalMood / weeklyData[weekKey].sessions) * 10);
        
        // Session type categorization (using existing sessionType variable)
        sessionTypeData[sessionType] = (sessionTypeData[sessionType] || 0) + 1;
        
        // Enhanced mood trends with comprehensive data
        moodTrends.push({
          date: sessionDate.getTime(), // Convert to timestamp for scatter chart
          mood: (Number(note.moodRating) || 0),
          client: authData.name || clientData.name || clientData.email || 'Unknown',
          sessionType: note.sessionFocus || 'General',
          sessionDuration: note.sessionDuration || 60,
          interventions: note.interventionsUsed || 'None',
          month: monthKey,
          week: weekKey
        });
        
        // Enhanced session duration data with comprehensive metrics
        sessionDurationData.push({
          duration: note.sessionDuration || 60,
          date: sessionDate.getTime(),
          client: authData.name || clientData.name || clientData.email || 'Unknown',
          sessionType: note.sessionFocus || 'General',
          moodRating: Number(note.moodRating) || null,
          month: monthKey,
          week: weekKey
        });
        
        // Intervention statistics
        if (note.interventionsUsed) {
          interventionStats[note.interventionsUsed] = (interventionStats[note.interventionsUsed] || 0) + 1;
        }
        
        totalProgress += (Number(note.moodRating) || 0);
        totalMoodRating += (Number(note.moodRating) || 0);
        totalDuration += note.sessionDuration || 60;
      });
      
      // Client retention analysis
      if (notes.length > 0) {
        const firstSession = new Date(notes[0].sessionDate);
        const lastSession = new Date(notes[notes.length - 1].sessionDate);
        const retentionDays = Math.ceil((lastSession - firstSession) / (1000 * 1000 * 60 * 60 * 24));
        
        clientRetentionData.push({
          clientId,
          name: authData.name || clientData.name || clientData.email || 'Unknown',
          sessions: notes.length,
          retentionDays,
          avgMood: Math.round((notes.reduce((sum, note) => sum + ((Number(note.moodRating) || 0)), 0) / notes.length) * 10)
        });
      }
      
      // Client progress data
      if (notes.length > 0) {
        clientProgressData.push({
          name: authData.name || clientData.name || clientData.email || 'Unknown',
          sessions: notes.length,
          progress: calculateClientProgress([], notes)?.percent ?? null,
          lastSession: notes[notes.length - 1]?.sessionDate
        });
      }
    }
    
    // Process scheduled calls data
    const calls = scheduledCallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    totalCalls = calls.length;
    
    calls.forEach(call => {
      const callDate = new Date(asDate(call.scheduledTime));
      if (callDate >= startDate && callDate <= endDate) {
        if (call.status === 'completed') completedCalls++;
        if (call.status === 'cancelled') cancelledCalls++;
        
        callStatusData.push({
          status: call.status || 'scheduled',
          date: callDate,
          duration: call.duration || 30
        });
      }
    });
    
    // Enhanced chart data conversion with comprehensive metrics
    const monthlyChartData = Object.values(monthlyData).map(item => ({
      month: item.month,
      sessions: item.sessions,
      progress: item.progress ?? null,
      moodRating: Math.round(item.moodRating / item.sessions),
      duration: Math.round(item.duration / item.sessions),
      uniqueClients: item.uniqueClients.size,
      avgMoodRating: Math.round((item.totalMoodRating / item.sessions) * 10) / 10,
      avgSessionDuration: Math.round(item.totalSessionDuration / item.sessions),
      sessionTypes: Object.keys(item.sessionTypes).length
    }));
    
    const interventionChartData = Object.entries(interventionStats).map(([name, count]) => ({
      name,
      value: count
    }));
    
    // Declare totalClients early so it's available for chart data processing
    const totalTherapists = therapistsSnapshot.docs.length;
    const totalClients = clientsSnapshot.docs.length;
    
    // Ensure we have age data even if empty
    if (Object.keys(ageGroupData).length === 0) {
      ageGroupData[20] = 1; // Default age group
    }
    
    const ageGroupChartData = Object.entries(ageGroupData).map(([age, count]) => ({
      age: `${age}-${age + 9}`,
      count,
      percentage: Math.round((count / Math.max(totalClients, 1)) * 100),
      range: `${age}-${age + 9} years`
    }));
    
    // Ensure we have gender data even if empty
    if (Object.keys(genderDistribution).length === 0) {
      genderDistribution['unknown'] = 1;
    }
    
    const genderChartData = Object.entries(genderDistribution).map(([gender, count]) => ({
      gender: gender === 'man' ? 'Male' : gender === 'woman' ? 'Female' : gender === 'non-binary' ? 'Non-Binary' : gender === 'unknown' ? 'Not Specified' : 'Other',
      count,
      percentage: Math.round((count / Math.max(totalClients, 1)) * 100)
    }));
    const averageProgress = totalSessions > 0 ? Math.round((totalProgress / totalSessions) * 10) : 0;
    const averageMoodRating = totalSessions > 0 ? Math.round((totalMoodRating / totalSessions) * 10) / 10 : 0;
    const averageSessionDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
    const pendingCalls = totalCalls - completedCalls - cancelledCalls;
    
    // Enhanced chart data conversion
    const weeklyChartData = Object.values(weeklyData).map(item => ({
      week: item.week,
      sessions: item.sessions,
      avgMood: item.avgMood
    }));
    
    const sessionTypeChartData = Object.entries(sessionTypeData).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / totalSessions) * 100)
    }));
    
    // Enhanced session duration data with categories
    const sessionDurationCategories = {
      'Short (15-30 min)': 0,
      'Standard (30-60 min)': 0,
      'Extended (60-90 min)': 0,
      'Long (90+ min)': 0
    };
    
    // Process session duration data to ensure we have data to show
    if (sessionDurationData.length > 0) {
      sessionDurationData.forEach(session => {
        if (session.duration <= 30) {
          sessionDurationCategories['Short (15-30 min)']++;
        } else if (session.duration <= 60) {
          sessionDurationCategories['Standard (30-60 min)']++;
        } else if (session.duration <= 90) {
          sessionDurationCategories['Extended (60-90 min)']++;
        } else {
          sessionDurationCategories['Long (90+ min)']++;
        }
      });
    } else {
      // If no session data, create sample data for demonstration
      sessionDurationCategories['Standard (30-60 min)'] = 1;
    }
    
    const sessionDurationChartData = Object.entries(sessionDurationCategories).map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / Math.max(totalSessions, 1)) * 100)
    }));
    
    const clientRetentionChartData = clientRetentionData
      .sort((a, b) => b.retentionDays - a.retentionDays)
      .slice(0, 10); // Top 10 clients by retention
    
    const therapistEfficiencyChartData = therapistEfficiencyData
      .sort((a, b) => b.efficiency - a.efficiency)
      .map(therapist => ({
        name: therapist.name,
        efficiency: therapist.efficiency,
        sessions: therapist.sessions,
        clients: therapist.clients,
        avgSessionDuration: therapist.avgSessionDuration,
        avgMoodRating: therapist.avgMoodRating
      }));
    
    // Debug logging to see what data is being generated
    console.log('System Overview Report Data:', {
      totalTherapists,
      totalClients,
      totalSessions,
      therapistPerformance,
      therapistEfficiencyChartData,
      sessionDurationChartData,
      ageGroupChartData,
      genderChartData
    });
    
    return {
      type: 'System Overview Report',
      totalTherapists,
      totalClients,
      totalSessions,
      averageProgress,
      averageMoodRating,
      averageSessionDuration,
      totalCalls,
      completedCalls,
      pendingCalls,
      cancelledCalls,
      dateRange: { startDate, endDate },
      // Enhanced Chart data
      monthlyChartData,
      weeklyChartData,
      therapistPerformance,
      therapistEfficiencyData: therapistEfficiencyChartData,
      clientProgressData,
      clientRetentionChartData,
      interventionChartData,
      sessionTypeChartData,
      moodTrends,
      callStatusData,
      sessionDurationData,
      sessionDurationChartData,
      ageGroupChartData,
      genderChartData
    };
  };

  // Generate chart data for progress visualization (removed - no longer needed for reports)
  const generateChartData = (reportData) => {
    // Charts have been removed from reports - this function is kept for compatibility but returns null
    return null;
  };

  // Download PDF report
  const downloadPDFReport = async () => {
    if (!reportData) return;
    
    try {
      // Create professional PDF report
      const pdf = new jsPDF();
      
      // Simple, professional header
      const headerHeight = 35;
      
      // Clean header background
      pdf.setFillColor(51, 51, 51); // Dark gray - professional
      pdf.rect(0, 0, 210, headerHeight, 'F');
      
      // Company title
      pdf.setFontSize(22);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont(undefined, 'bold');
      pdf.text('NESSA HUB THERAPY CENTER', 105, 20, { align: 'center' });
      
      // Report subtitle
      pdf.setFontSize(14);
      pdf.setTextColor(200, 200, 200);
      pdf.setFont(undefined, 'normal');
      pdf.text('Professional Report', 105, 30, { align: 'center' });
      
      // Report details section - clean and simple
      let yPosition = headerHeight + 15;
      
      pdf.setFontSize(14);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, 'bold');
      pdf.text('Report Information', 20, yPosition);
      yPosition += 12;
      
      pdf.setFontSize(10);
      pdf.setTextColor(68, 68, 68);
      pdf.setFont(undefined, 'normal');
      
      // Simple layout
      pdf.text(`Type: ${reportData.type}`, 20, yPosition);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 120, yPosition);
      yPosition += 8;
      pdf.text(`Date Range: ${new Date(reportDateRange.startDate).toLocaleDateString()} - ${new Date(reportDateRange.endDate).toLocaleDateString()}`, 20, yPosition);
      pdf.text(`Generated by: ${auth.currentUser?.displayName || auth.currentUser?.email}`, 120, yPosition);
      
      yPosition += 20;
      
      // Summary section - clean
      pdf.setFontSize(14);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, 'bold');
      pdf.text('Summary Statistics', 20, yPosition);
      yPosition += 12;
      
      pdf.setFontSize(10);
      pdf.setTextColor(68, 68, 68);
      pdf.setFont(undefined, 'normal');
      
      // Add summary data based on report type (emojis removed to prevent encoding issues)
      switch (reportData.type) {
        case 'Client Progress Report':
        case 'My Client Progress Report':
          pdf.text(`Total Clients: ${reportData.assignedClients}`, 20, yPosition);
          pdf.text(`Total Sessions: ${reportData.totalSessions}`, 120, yPosition);
          yPosition += 8;
          pdf.text(`Average Progress: ${reportData.averageProgress}%`, 20, yPosition);
          yPosition += 15;
          break;
          
        case 'Therapy Notes Report':
        case 'My Therapy Notes Report':
        case 'All Therapy Notes Report':
          pdf.text(`Total Notes: ${reportData.totalNotes}`, 20, yPosition);
          pdf.text(`Average Mood Rating: ${reportData.averageMoodRating}/10`, 120, yPosition);
          yPosition += 15;
          break;
          
        case 'Scheduled Calls Report':
        case 'My Scheduled Calls Report':
        case 'All Scheduled Calls Report':
          pdf.text(`Total Calls: ${reportData.totalCalls}`, 20, yPosition);
          pdf.text(`Completed: ${reportData.completedCalls}`, 120, yPosition);
          yPosition += 8;
          pdf.text(`Pending: ${reportData.pendingCalls}`, 20, yPosition);
          yPosition += 15;
          break;
          
        case 'All Therapists Report':
          pdf.text(`Total Therapists: ${reportData.totalTherapists}`, 20, yPosition);
          yPosition += 15;
          break;
          
        case 'All Clients Report':
          pdf.text(`Total Clients: ${reportData.totalClients}`, 20, yPosition);
          yPosition += 15;
          break;
          
        case 'System Overview Report':
          pdf.text(`Total Therapists: ${reportData.totalTherapists}`, 20, yPosition);
          pdf.text(`Total Clients: ${reportData.totalClients}`, 120, yPosition);
          yPosition += 8;
          pdf.text(`Total Sessions: ${reportData.totalSessions}`, 20, yPosition);
          pdf.text(`Average Progress: ${reportData.averageProgress}%`, 120, yPosition);
          yPosition += 15;
          break;
      }
      

      

      

      // Charts removed from PDF reports for cleaner output
      
      // Add detailed data table with improved styling
      pdf.setFontSize(16);
      pdf.setTextColor(30, 41, 59);
      pdf.text('Detailed Data Table', 20, yPosition);
      yPosition += 15;
      
      // Generate table data based on report type
      let tableData = [];
      let tableHeaders = [];
      
      switch (reportData.type) {
        case 'Client Progress Report':
          tableHeaders = ['Client Name', 'Sessions', 'Progress (%)', 'Last Session'];
          tableData = reportData.clientProgress.map(client => [
            client.name || client.email || 'Unknown',
            client.totalSessions.toString(),
            client.progress.toString(),
            client.lastSession || 'N/A'
          ]);
          break;
          
        case 'Therapy Notes Report':
        case 'My Therapy Notes Report':
        case 'All Therapy Notes Report':
          tableHeaders = ['Client Name', 'Date', 'Focus', 'Mood Rating', 'Interventions', 'Progress (%)', 'Therapist'];
          tableData = reportData.notes.map(note => [
            note.clientName || `Client ${note.clientId}`,
            note.sessionDate || 'N/A',
            note.sessionFocus || 'N/A',
            `${note.moodRating || 0}/10`,
            note.interventionsUsed || 'N/A',
            `${note.progressPercentage || 0}%`,
            note.therapistName || 'Unknown'
          ]);
          break;
          
        case 'Scheduled Calls Report':
        case 'My Scheduled Calls Report':
        case 'All Scheduled Calls Report':
          if (reportData.type === 'All Scheduled Calls Report') {
            tableHeaders = ['Client Name', 'Date', 'Time', 'Duration', 'Status', 'Therapist', 'Scheduled By'];
            tableData = reportData.calls.map(call => [
              call.clientName || 'Unknown',
              asDate(call.scheduledTime)?.toLocaleDateString() || 'N/A',
              asDate(call.scheduledTime)?.toLocaleTimeString() || 'N/A',
              `${call.duration || 0} min`,
              call.status || 'N/A',
              call.therapistName || 'Unknown',
              call.scheduledBy || 'Unknown'
            ]);
          } else {
            tableHeaders = ['Client Name', 'Date', 'Time', 'Duration', 'Status'];
            tableData = reportData.calls.map(call => [
              call.clientName || 'Unknown',
              asDate(call.scheduledTime)?.toLocaleDateString() || 'N/A',
              asDate(call.scheduledTime)?.toLocaleTimeString() || 'N/A',
              `${call.duration || 0} min`,
              call.status || 'N/A'
            ]);
          }
          break;
          
        case 'All Therapists Report':
          tableHeaders = ['Therapist Name', 'Role', 'Clients', 'Sessions', 'Progress (%)'];
          tableData = reportData.therapists.map(therapist => [
            therapist.name || therapist.email || 'Unknown',
            therapist.role || 'N/A',
            therapist.assignedClients.toString(),
            therapist.totalSessions.toString(),
            therapist.averageProgress.toString()
          ]);
          break;
          
        case 'All Clients Report':
          tableHeaders = ['Client Name', 'Assigned Therapist', 'Sessions', 'Progress (%)', 'Last Session'];
          tableData = reportData.clients.map(client => [
            client.name || client.email || 'Unknown',
            client.assignedTherapist || 'Unassigned',
            client.totalSessions.toString(),
            client.progress.toString(),
            client.lastSession || 'N/A'
          ]);
          break;
      }
      
      // Add table to PDF with clean, professional styling
      if (tableData.length > 0) {
        // Simple table section header
        pdf.setFontSize(14);
        pdf.setTextColor(51, 51, 51);
        pdf.setFont(undefined, 'bold');
        pdf.text('Detailed Data Table', 20, yPosition);
        yPosition += 15;
        
        pdf.autoTable({
          head: [tableHeaders],
          body: tableData,
          startY: yPosition,
          theme: 'grid',
          styles: {
            fontSize: 9,
            cellPadding: 4,
            headStyles: {
              fillColor: [51, 51, 51], // Dark gray - professional
              textColor: 255,
              fontStyle: 'bold',
              halign: 'center',
              fontSize: 10
            },
            alternateRowStyles: {
              fillColor: [245, 245, 245] // Light gray
            },
            bodyStyles: {
              textColor: 51,
              halign: 'left',
              fontSize: 9
            }
          },
          columnStyles: (() => {
            // Dynamic column styles based on table structure
            const styles = {};
            if (reportData.type === 'All Scheduled Calls Report') {
              // 7 columns: Client, Date, Time, Duration, Status, Therapist, Scheduled By
              styles[0] = { cellWidth: 30, halign: 'left' };     // Client Name
              styles[1] = { cellWidth: 18, halign: 'center' };   // Date
              styles[2] = { cellWidth: 18, halign: 'center' };   // Time
              styles[3] = { cellWidth: 20, halign: 'center' };   // Duration
              styles[4] = { cellWidth: 20, halign: 'center' };   // Status
              styles[5] = { cellWidth: 25, halign: 'center' };   // Therapist
              styles[6] = { cellWidth: 25, halign: 'center' };   // Scheduled By
            } else if (reportData.type === 'All Therapy Notes Report' || reportData.type === 'My Therapy Notes Report' || reportData.type === 'Therapy Notes Report') {
              // 7 columns: Client, Date, Focus, Mood Rating, Interventions, Progress (%), Therapist
              styles[0] = { cellWidth: 30, halign: 'left' };     // Client Name
              styles[1] = { cellWidth: 18, halign: 'center' };   // Date
              styles[2] = { cellWidth: 35, halign: 'left' };     // Focus
              styles[3] = { cellWidth: 20, halign: 'center' };   // Mood Rating
              styles[4] = { cellWidth: 25, halign: 'center' };   // Interventions
              styles[5] = { cellWidth: 20, halign: 'center' };   // Progress (%)
              styles[6] = { cellWidth: 25, halign: 'center' };   // Therapist
            } else if (reportData.type === 'Scheduled Calls Report' || reportData.type === 'My Scheduled Calls Report') {
              // 6 columns: Client, Date, Time, Duration, Status, Notes
              styles[0] = { cellWidth: 30, halign: 'left' };     // Client Name
              styles[1] = { cellWidth: 20, halign: 'center' };   // Date
              styles[2] = { cellWidth: 20, halign: 'center' };   // Time
              styles[3] = { cellWidth: 20, halign: 'center' };   // Duration
              styles[4] = { cellWidth: 20, halign: 'center' };   // Status
              styles[5] = { cellWidth: 30, halign: 'left' };     // Notes
            } else {
              // Default styles for other reports
              styles[0] = { cellWidth: 35, halign: 'left' };     // First column
              styles[1] = { cellWidth: 20, halign: 'center' };   // Second column
              styles[2] = { cellWidth: 20, halign: 'center' };   // Third column
              styles[3] = { cellWidth: 20, halign: 'center' };   // Fourth column
              styles[4] = { cellWidth: 20, halign: 'center' };   // Fifth column
            }
            return styles;
          })(),
          margin: { top: 5, right: 10, bottom: 5, left: 10 }
        });
        
        // Get the final Y position after the table
        yPosition = pdf.lastAutoTable.finalY + 10;
      } else {
        // No data to display
        pdf.setFontSize(12);
        pdf.setTextColor(156, 163, 175);
        pdf.text('No data available for the selected date range', 20, yPosition);
        yPosition += 20;
      }
      
      // Add simple, professional footer
      const pageCount = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        
        // Simple footer background
        pdf.setFillColor(51, 51, 51); // Dark gray - professional
        pdf.rect(0, pdf.internal.pageSize.height - 20, 210, 20, 'F');
        
        // Footer content
        pdf.setFontSize(10);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont(undefined, 'bold');
        pdf.text(`Page ${i} of ${pageCount}`, 105, pdf.internal.pageSize.height - 10, { align: 'center' });
        
        // Company info
        pdf.setFontSize(9);
        pdf.setTextColor(200, 200, 200);
        pdf.setFont(undefined, 'normal');
        pdf.text('NessaHub Therapy Center - Professional Reports', 105, pdf.internal.pageSize.height - 15, { align: 'center' });
      }
      
      // Save the PDF with better filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${reportData.type.replace(/\s+/g, '_')}_${timestamp}.pdf`;
      pdf.save(filename);
      
      alert('Professional PDF report downloaded successfully! 📊');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF report: ' + error.message);
    }
  };

  // Generate report text
  const generateReportText = () => {
    const startDate = new Date(reportDateRange.startDate).toLocaleDateString();
    const endDate = new Date(reportDateRange.endDate).toLocaleDateString();
    
    let reportText = `THERAPY REPORT\n`;
    reportText += `Generated on: ${new Date().toLocaleDateString()}\n`;
    reportText += `Date Range: ${startDate} to ${endDate}\n`;
    reportText += `Generated by: ${auth.currentUser?.displayName || auth.currentUser?.email}\n`;
    reportText += `Report Type: ${reportData.type}\n\n`;
    
    switch (reportData.type) {
      case 'Client Progress Report':
        reportText += `CLIENT PROGRESS REPORT\n`;
        reportText += `Assigned Clients: ${reportData.assignedClients}\n`;
        reportText += `Total Sessions: ${reportData.totalSessions}\n`;
        reportText += `Average Progress: ${reportData.averageProgress}%\n\n`;
        
        reportText += `CLIENT DETAILS:\n`;
        reportData.clientProgress.forEach(client => {
          reportText += `- ${client.name || client.email}\n`;
          reportText += `  Total Sessions: ${client.totalSessions}\n`;
          reportText += `  Progress: ${client.progress}%\n`;
          reportText += `  Last Session: ${client.lastSession}\n\n`;
        });
        break;
        
      case 'Therapy Notes Report':
        reportText += `THERAPY NOTES REPORT\n`;
        reportText += `Total Notes: ${reportData.totalNotes}\n`;
        reportText += `Average Mood Rating: ${reportData.averageMoodRating}/10\n\n`;
        
        reportText += `NOTES DETAILS:\n`;
        reportData.notes.forEach(note => {
          reportText += `- Client: ${note.clientName}\n`;
          reportText += `  Date: ${note.sessionDate}\n`;
          reportText += `  Focus: ${note.sessionFocus}\n`;
          reportText += `  Mood Rating: ${note.moodRating}/10\n`;
          reportText += `  Interventions: ${note.interventionsUsed}\n`;
          reportText += `  Progress: ${note.progressAssessment}\n\n`;
        });
        break;
        
      case 'Scheduled Calls Report':
        reportText += `SCHEDULED CALLS REPORT\n`;
        reportText += `Total Calls: ${reportData.totalCalls}\n`;
        reportText += `Completed: ${reportData.completedCalls}\n`;
        reportText += `Pending: ${reportData.pendingCalls}\n\n`;
        
        reportText += `CALL DETAILS:\n`;
        reportData.calls.forEach(call => {
          reportText += `- Client: ${call.clientName || 'Unknown'}\n`;
          reportText += `  Date: ${asDate(call.scheduledTime)?.toLocaleDateString()}\n`;
          reportText += `  Time: ${asDate(call.scheduledTime)?.toLocaleTimeString()}\n`;
          reportText += `  Duration: ${call.duration} min\n`;
          reportText += `  Status: ${call.status}\n\n`;
        });
        break;
        
      case 'All Therapists Report':
        reportText += `ALL THERAPISTS REPORT\n`;
        reportText += `Total Therapists: ${reportData.totalTherapists}\n\n`;
        
        reportText += `THERAPIST DETAILS:\n`;
        reportData.therapists.forEach(therapist => {
          reportText += `- ${therapist.name || therapist.email}\n`;
          reportText += `  Role: ${therapist.role}\n`;
          reportText += `  Assigned Clients: ${therapist.assignedClients}\n`;
          reportText += `  Total Sessions: ${therapist.totalSessions}\n`;
          reportText += `  Average Progress: ${therapist.averageProgress}%\n\n`;
        });
        break;
        
      case 'All Clients Report':
        reportText += `ALL CLIENTS REPORT\n`;
        reportText += `Total Clients: ${reportData.totalClients}\n\n`;
        
        reportText += `CLIENT DETAILS:\n`;
        reportData.clients.forEach(client => {
          reportText += `- ${client.name || client.email}\n`;
          reportText += `  Assigned Therapist: ${client.assignedTherapist}\n`;
          reportText += `  Total Sessions: ${client.totalSessions}\n`;
          reportText += `  Progress: ${client.progress}%\n`;
          reportText += `  Last Session: ${client.lastSession}\n\n`;
        });
        break;
        
      case 'System Overview Report':
        reportText += `SYSTEM OVERVIEW REPORT\n`;
        reportText += `Total Therapists: ${reportData.totalTherapists}\n`;
        reportText += `Total Clients: ${reportData.totalClients}\n`;
        reportText += `Total Sessions: ${reportData.totalSessions}\n`;
        reportText += `Average Progress: ${reportData.averageProgress}%\n\n`;
        break;
    }
    
    return reportText;
  };

  return (
    <div className="therapist-calendar-container">
      <div className="therapist-calendar-header">
        <h2>Therapist Calendar & Reports</h2>
        <div className="therapist-calendar-navigation">
          <button onClick={goToPreviousMonth} className="nav-btn">
            <ChevronLeft size={20} />
          </button>
          <h3>
            {currentDate.toLocaleDateString('en-US', { 
              month: 'long', 
              year: 'numeric' 
            })}
          </h3>
          <button onClick={goToNextMonth} className="nav-btn">
            <ChevronRight size={20} />
          </button>
          <button onClick={goToToday} className="today-btn">
            Today
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <CalendarIcon size={20} />
          Calendar
        </button>
        <button 
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <FileText size={20} />
          Reports
        </button>
      </div>

      {activeTab === 'calendar' ? (
        <>
          {/* Sessions a client booked. They are requests, not appointments, until
              the therapist answers — so they sit above the grid rather than being
              buried in a day cell. */}
          {pendingRequests.length > 0 && (
            <div className="tc-requests">
              <h3 className="tc-requests-title">
                Session requests ({pendingRequests.length})
              </h3>
              {pendingRequests.map((call) => (
                <div key={call.id} className="tc-request">
                  <div className="tc-request-info">
                    <strong>{call.clientName || 'Client'}</strong>
                    <span className="tc-request-when">
                      {asDate(call.scheduledTime)?.toLocaleString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                      {' · '}{call.durationMinutes || 30} min
                    </span>
                    {call.notes && <span className="tc-request-notes">{call.notes}</span>}
                  </div>
                  <div className="tc-request-actions">
                    {/* ActionButton drives its own spinner off the returned
                        promise; `disabled` only stops the sibling being clicked
                        while the other request is in flight. */}
                    <ActionButton
                      variant="secondary"
                      disabled={respondingCallId === call.id}
                      onClick={() => respondToRequest(call, false)}
                    >
                      Decline
                    </ActionButton>
                    <ActionButton
                      disabled={respondingCallId === call.id}
                      onClick={() => respondToRequest(call, true)}
                    >
                      Accept
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="calendar-main">
            <div className="therapist-calendar-grid">
              {/* Day headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="day-header">
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map((date, index) => {
                const callsForDate = getCallsForDate(date);
                const hasCalls = callsForDate.length > 0;
                
                return (
                  <div
                    key={index}
                    className={`therapist-calendar-day ${isToday(date) ? 'today' : ''} ${isSelected(date) ? 'selected' : ''} ${!isCurrentMonth(date) ? 'other-month' : ''}`}
                    onClick={() => handleDayClick(date, callsForDate)}
                  >
                    <span className="day-number">{date.getDate()}</span>
                    {hasCalls && (
                      <div className="appointments-container">
                        {callsForDate.map((call, callIndex) => (
                          <div key={call.id || callIndex} className="appointment-card">
                            <div className="appointment-content">
                              <div className="appointment-title">
                                Appointment with {call.clientName || 'Client'}
                              </div>
                              <div className="appointment-time">
                                {asDate(call.scheduledTime)?.toLocaleTimeString('en-US', { 
                                  hour: '2-digit', 
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </div>
                            </div>
                            <div className="appointment-avatar">
                              <User size={12} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                      {dayDetail.calls.length === 1 ? '1 session' : `${dayDetail.calls.length} sessions`}
                    </p>
                  </div>
                  <button className="tc-detail-close" onClick={() => setDayDetail(null)}>&times;</button>
                </div>

                <div className="tc-detail-body">
                  {dayDetail.calls.map((call, i) => (
                    <div key={call.id || i} className="tc-detail-card">
                      <div className="tc-detail-row">
                        <Clock size={16} />
                        <span className="tc-detail-time">{call.scheduledTime?.toDate?.().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) || '—'}</span>
                        {call.channel && <span className="tc-detail-chip">{call.channel}</span>}
                      </div>
                      <div className="tc-detail-row">
                        <User size={16} />
                        <span>{call.clientName || 'Client'}</span>
                      </div>
                      {call.duration || call.durationMinutes ? (
                        <div className="tc-detail-row">
                          <Clock size={16} />
                          <span>{call.duration || call.durationMinutes} minutes</span>
                        </div>
                      ) : null}
                      {call.status && (
                        <div className="tc-detail-row">
                          <FileText size={16} />
                          <span className="tc-detail-status">{call.status}</span>
                        </div>
                      )}
                      {call.notes && <p className="tc-detail-notes">{call.notes}</p>}
                    </div>
                  ))}
                </div>

                <div className="tc-detail-actions">
                  <button className="tc-detail-secondary" onClick={() => setDayDetail(null)}>Close</button>
                  {canSchedule && (
                    <button
                      className="tc-detail-primary"
                      onClick={() => {
                        const d = dayDetail.date;
                        setDayDetail(null);
                        handleDayClick(d, []);
                      }}
                    >
                      <Plus size={15} /> Add session
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Floating Action Button for Schedule Call */}
          <button
            className="schedule-fab"
            onClick={openScheduleForm}
            disabled={!canSchedule}
            title={canSchedule ? 'Schedule a call' : 'No clients assigned yet'}
            style={!canSchedule ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            <Plus size={24} />
          </button>

          <div className="therapy-notes-section">
            <h4>Therapy Notes & Progress</h4>
            {therapyNotes.length > 0 ? (
              <div className="notes-grid">
                {therapyNotes.slice(0, 6).map((note, index) => (
                  <div key={note.id} className="therapy-note-card" style={{ borderLeftColor: getInterventionColor(note.interventionsUsed) }}>
                    <div className="note-header">
                      <div className="note-client">
                        <User size={16} />
                        {getClientName(note.clientId)}
                      </div>
                      <div className="note-date">
                        <CalendarIcon size={14} />
                        {new Date(note.sessionDate).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <div className="note-session">
                      <div className="session-number">
                        <FileText size={16} />
                        {note.sessionNumber}
                      </div>
                      <div className="session-time">
                        <Clock size={14} />
                        {note.sessionTime}
                      </div>
                    </div>
                    
                    <div className="note-mood">
                      <div className="mood-rating">
                        <span className="mood-emoji">{getMoodEmoji(note.moodRating)}</span>
                        <span className="rating-text">Rating: {note.moodRating}/10</span>
                      </div>
                      <div className="mood-state">
                        <Heart size={14} />
                        {note.mood}
                      </div>
                    </div>
                    
                    <div className="note-focus">
                      <h5>Session Focus</h5>
                      <p>{note.sessionFocus}</p>
                    </div>
                    
                    <div className="note-intervention">
                      <div className="intervention-badge" style={{ backgroundColor: getInterventionColor(note.interventionsUsed) }}>
                        {note.interventionsUsed}
                      </div>
                    </div>
                    
                    <div className="note-progress">
                      <div className="progress-badge">
                        <TrendingUp size={14} />
                        {note.progressAssessment}
                      </div>
                    </div>
                    
                    {note.behavioralObservations && (
                      <div className="note-additional">
                        <h6>Behavioral Observations</h6>
                        <p>{note.behavioralObservations}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-notes">
                <p>No therapy notes available yet.</p>
                <p>Start adding notes from your client sessions to see them here.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="reports-section">
          <div className="reports-header">
            <h3>Generate Reports</h3>
            
            {/* Report Type Selection */}
            <div className="report-type-selector">
              <label>Report Type:</label>
              <select 
                value={reportType} 
                onChange={(e) => setReportType(e.target.value)}
                className="report-type-dropdown"
              >
                <option value="client-progress">My Client Progress Report</option>
                <option value="therapy-notes">My Therapy Notes Report</option>
                <option value="scheduled-calls">My Scheduled Calls Report</option>
                <option 
                  value="all-therapy-notes" 
                  disabled={userRole !== 'admin'}
                  className={userRole !== 'admin' ? 'disabled-option' : ''}
                >
                  All Therapy Notes Report {userRole !== 'admin' ? '(Admin Only)' : ''}
                </option>
                <option 
                  value="all-scheduled-calls" 
                  disabled={userRole !== 'admin'}
                  className={userRole !== 'admin' ? 'disabled-option' : ''}
                >
                  All Scheduled Calls Report {userRole !== 'admin' ? '(Admin Only)' : ''}
                </option>
                <option 
                  value="all-therapists" 
                  disabled={userRole !== 'admin'}
                  className={userRole !== 'admin' ? 'disabled-option' : ''}
                >
                  All Therapists Report {userRole !== 'admin' ? '(Admin Only)' : ''}
                </option>
                <option 
                  value="all-clients" 
                  disabled={userRole !== 'admin'}
                  className={userRole !== 'admin' ? 'disabled-option' : ''}
                >
                  All Clients Report {userRole !== 'admin' ? '(Admin Only)' : ''}
                </option>
                <option 
                  value="system-overview" 
                  disabled={userRole !== 'admin'}
                  className={userRole !== 'admin' ? 'disabled-option' : ''}
                >
                  System Overview Report {userRole !== 'admin' ? '(Admin Only)' : ''}
                </option>
              </select>
            </div>
            

            
            <div className="date-range-selector">
              <div className="date-input">
                <label>Start Date:</label>
                <input
                  type="date"
                  value={reportDateRange.startDate}
                  onChange={(e) => setReportDateRange({...reportDateRange, startDate: e.target.value})}
                />
              </div>
              <div className="date-input">
                <label>End Date:</label>
                <input
                  type="date"
                  value={reportDateRange.endDate}
                  onChange={(e) => setReportDateRange({...reportDateRange, endDate: e.target.value})}
                />
              </div>
              <button 
                className="generate-report-btn"
                onClick={generateReport}
                disabled={isGeneratingReport}
              >
                {isGeneratingReport ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>

          {reportData && (
            <div className="report-content">
              <div className="report-summary">
                <h4>{reportData.type}</h4>
                <div className="summary-grid">
                  {(reportData.type === 'Client Progress Report' || reportData.type === 'My Client Progress Report') && (
                    <>
                      <div className="summary-card">
                        <h5>Assigned Clients</h5>
                        <span className="summary-number">{reportData.assignedClients}</span>
                      </div>
                      <div className="summary-card">
                        <h5>Total Sessions</h5>
                        <span className="summary-number">{reportData.totalSessions}</span>
                      </div>
                      <div className="summary-card">
                        <h5>Average Progress</h5>
                        <span className="summary-number">{reportData.averageProgress}%</span>
                      </div>
                    </>
                  )}
                  
                  {(reportData.type === 'Therapy Notes Report' || reportData.type === 'My Therapy Notes Report' || reportData.type === 'All Therapy Notes Report') && (
                    <>
                      <div className="summary-card">
                        <h5>Total Notes</h5>
                        <span className="summary-number">{reportData.totalNotes}</span>
                      </div>
                      <div className="summary-card">
                        <h5>Average Mood Rating</h5>
                        <span className="summary-number">{reportData.averageMoodRating}/10</span>
                      </div>
                    </>
                  )}
                  
                  {(reportData.type === 'Scheduled Calls Report' || reportData.type === 'My Scheduled Calls Report' || reportData.type === 'All Scheduled Calls Report') && (
                    <>
                      <div className="summary-card">
                        <h5>Total Calls</h5>
                        <span className="summary-number">{reportData.totalCalls}</span>
                      </div>
                      <div className="summary-card">
                        <h5>Completed</h5>
                        <span className="summary-number">{reportData.completedCalls}</span>
                      </div>
                      <div className="summary-card">
                        <h5>Pending</h5>
                        <span className="summary-number">{reportData.pendingCalls}</span>
                      </div>
                    </>
                  )}
                  
                  {reportData.type === 'All Therapists Report' && (
                    <>
                      <div className="summary-card">
                        <h5>Total Therapists</h5>
                        <span className="summary-number">{reportData.totalTherapists}</span>
                      </div>
                    </>
                  )}
                  
                  {reportData.type === 'All Clients Report' && (
                    <>
                      <div className="summary-card">
                        <h5>Total Clients</h5>
                        <span className="summary-number">{reportData.totalClients}</span>
                      </div>
                    </>
                  )}
                  
                  {reportData.type === 'System Overview Report' && (
                    <>
                      <div className="summary-card">
                        <h5>Total Therapists</h5>
                        <span className="summary-number">{reportData.totalTherapists}</span>
                      </div>
                      <div className="summary-card">
                        <h5>Total Clients</h5>
                        <span className="summary-number">{reportData.totalClients}</span>
                      </div>
                      <div className="summary-card">
                        <h5>Total Sessions</h5>
                        <span className="summary-number">{reportData.totalSessions}</span>
                      </div>
                      <div className="summary-card">
                        <h5>Average Progress</h5>
                        <span className="summary-number">{reportData.averageProgress}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="report-actions">
                {reportData.type !== 'System Overview Report' && (
                <button 
                  className="download-pdf-btn"
                  onClick={downloadPDFReport}
                  disabled={!reportData}
                >
                  <FileText size={16} />
                  Download Report
                </button>
                )}
              </div>

              {/* Enhanced System Overview Report with Comprehensive Charts */}
              {reportData.type === 'System Overview Report' && (
                <div className="system-overview-charts">
                  <h4>System Analytics Dashboard</h4>
                  
                  {/* Row 1: Monthly Trends, Therapist Performance, Client Demographics */}
                  <div className="charts-row">
                    {/* Monthly Trends - Composed Chart */}
                    <div className="chart-item">
                      <h5>Monthly Session Trends</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <ComposedChart data={reportData.monthlyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis yAxisId="left" />
                          <YAxis yAxisId="right" orientation="right" />
                          <Tooltip />
                          <Legend />
                          <Line yAxisId="left" type="monotone" dataKey="sessions" stroke="#8884d8" strokeWidth={2} name="Sessions" />
                          <Area yAxisId="right" type="monotone" dataKey="progress" fill="#82ca9d" fillOpacity={0.3} stroke="#82ca9d" name="Progress %" />
                          <Bar yAxisId="left" dataKey="duration" fill="#ffc658" name="Avg Duration (min)" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Therapist Performance - Bar Chart */}
                    <div className="chart-item">
                      <h5>Therapist Performance</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={reportData.therapistPerformance}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="sessions" fill="#8884d8" name="Sessions" />
                          <Bar dataKey="clients" fill="#82ca9d" name="Clients" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Client Demographics - Age Groups */}
                    <div className="chart-item">
                      <h5>Client Age Distribution</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={reportData.ageGroupChartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ age, percentage }) => `${age} (${percentage}%)`}
                            outerRadius={60}
                            fill="#8884d8"
                            dataKey="count"
                          >
                            {reportData.ageGroupChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B', '#4ECDC4'][index % 7]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Row 2: Mood Trends, Session Duration, Call Status */}
                  <div className="charts-row">
                    {/* Mood Trends - Enhanced Scatter Chart */}
                    <div className="chart-item">
                      <h5>Client Mood Trends</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" dataKey="date" name="Date" />
                          <YAxis dataKey="mood" name="Mood Rating" domain={[0, 10]} />
                          <Tooltip 
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="custom-tooltip">
                                    <p>Client: {data.client}</p>
                                    <p>Mood: {data.mood}/10</p>
                                    <p>Session Type: {data.sessionType}</p>
                                    <p>Duration: {data.sessionDuration} min</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Scatter name="Mood Rating" data={reportData.moodTrends} fill="#8884d8" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Session Duration - Bar Chart with Categories */}
                    <div className="chart-item">
                      <h5>Session Duration Distribution</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={reportData.sessionDurationChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="category" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#8884d8" name="Sessions" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Call Status - Donut Chart */}
                    <div className="chart-item">
                      <h5>Call Status Distribution</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Completed', value: reportData.completedCalls, fill: '#82ca9d' },
                              { name: 'Pending', value: reportData.pendingCalls, fill: '#ffc658' },
                              { name: 'Cancelled', value: reportData.cancelledCalls, fill: '#ff8042' }
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={80}
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            dataKey="value"
                          />
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Row 3: Interventions, Client Progress, Gender Distribution */}
                  <div className="charts-row">
                    {/* Interventions - Horizontal Bar Chart */}
                    <div className="chart-item">
                      <h5>Most Used Interventions</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={reportData.interventionChartData} layout="horizontal">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={80} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Client Progress - Radar Chart */}
                    <div className="chart-item">
                      <h5>Client Progress Overview</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <RadarChart data={reportData.clientProgressData.slice(0, 5)}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="name" />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} />
                          <Radar name="Progress" dataKey="progress" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                          <Tooltip />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Gender Distribution - Pie Chart */}
                    <div className="chart-item">
                      <h5>Gender Distribution</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={reportData.genderChartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ gender, percentage }) => `${gender} (${percentage}%)`}
                            outerRadius={60}
                            fill="#82ca9d"
                            dataKey="count"
                          >
                            {reportData.genderChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#FF6B6B'][index % 5]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Row 4: Weekly Trends, Session Types, Client Retention */}
                  <div className="charts-row">
                    {/* Weekly Trends - Line Chart */}
                    <div className="chart-item">
                      <h5>Weekly Session Trends</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={reportData.weeklyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="week" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="sessions" stroke="#8884d8" strokeWidth={2} name="Sessions" />
                          <Line type="monotone" dataKey="avgMood" stroke="#82ca9d" strokeWidth={2} name="Avg Mood" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Session Types - Stacked Bar Chart */}
                    <div className="chart-item">
                      <h5>Session Focus Areas</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={reportData.sessionTypeChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="type" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="count" fill="#8884d8" name="Sessions" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Client Retention - Stacked Bar Chart */}
                    <div className="chart-item">
                      <h5>Client Retention Analysis</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={reportData.clientRetentionChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="retentionDays" fill="#8884d8" name="Retention Days" />
                          <Bar dataKey="sessions" fill="#82ca9d" name="Total Sessions" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Row 5: Therapist Efficiency, Monthly Comparison, Summary Table */}
                  <div className="charts-row">
                    {/* Therapist Efficiency - Composed Chart */}
                    <div className="chart-item">
                      <h5>Therapist Efficiency</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <ComposedChart data={reportData.therapistEfficiencyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis yAxisId="left" />
                          <YAxis yAxisId="right" orientation="right" />
                          <Tooltip />
                          <Legend />
                          <Bar yAxisId="left" dataKey="efficiency" fill="#8884d8" name="Efficiency Score" />
                          <Line yAxisId="right" type="monotone" dataKey="avgSessionDuration" stroke="#82ca9d" strokeWidth={2} name="Avg Duration (min)" />
                          <Line yAxisId="right" type="monotone" dataKey="avgMoodRating" stroke="#ffc658" strokeWidth={2} name="Avg Mood Rating" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Monthly Comparison - Grouped Bar Chart */}
                    <div className="chart-item">
                      <h5>Monthly Metrics Comparison</h5>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={reportData.monthlyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="sessions" fill="#8884d8" name="Sessions" />
                          <Bar dataKey="uniqueClients" fill="#82ca9d" name="Unique Clients" />
                          <Bar dataKey="avgMoodRating" fill="#ffc658" name="Avg Mood Rating" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Summary Statistics Table */}
                    <div className="chart-item">
                      <h5>System Summary</h5>
                      <div className="summary-stats">
                        <table className="summary-table">
                          <tbody>
                            <tr>
                              <td>Total Therapists:</td>
                              <td>{reportData.totalTherapists}</td>
                            </tr>
                            <tr>
                              <td>Total Clients:</td>
                              <td>{reportData.totalClients}</td>
                            </tr>
                            <tr>
                              <td>Total Sessions:</td>
                              <td>{reportData.totalSessions}</td>
                            </tr>
                            <tr>
                              <td>Avg Progress:</td>
                              <td>{reportData.averageProgress}%</td>
                            </tr>
                            <tr>
                              <td>Total Calls:</td>
                              <td>{reportData.totalCalls}</td>
                            </tr>
                            <tr>
                              <td>Completion Rate:</td>
                              <td>{reportData.totalCalls > 0 ? Math.round((reportData.completedCalls / reportData.totalCalls) * 100) : 0}%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts have been removed from reports for cleaner PDF downloads */}

              <div className="detailed-report">
                <h4>Detailed Report</h4>
                
                {/* Client Progress Report Table */}
                {(reportData.type === 'Client Progress Report' || reportData.type === 'My Client Progress Report') && (
                  <div className="report-table-container">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Total Sessions</th>
                          <th>Progress (%)</th>
                          <th>Last Session</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.clientProgress.map(client => (
                          <tr key={client.id}>
                            <td>
                              <div className="client-info">
                                {client.clientImage && (
                                  <img src={client.clientImage} alt={client.name} className="client-avatar" />
                                )}
                                <span>{client.name || client.email || `Client ${client.id.slice(0, 8)}`}</span>
                              </div>
                            </td>
                            <td>{client.totalSessions}</td>
                            <td>
                              <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${client.progress}%` }}></div>
                                <span>{client.progress}%</span>
                              </div>
                              <div className="progress-rate">
                                <small>Rate: {client.progress >= 80 ? 'Excellent' : client.progress >= 60 ? 'Good' : client.progress >= 40 ? 'Fair' : 'Needs Improvement'}</small>
                              </div>
                            </td>
                            <td>{client.lastSession}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Therapy Notes Report Table */}
                {(reportData.type === 'Therapy Notes Report' || reportData.type === 'My Therapy Notes Report' || reportData.type === 'All Therapy Notes Report') && (
                  <div className="report-table-container">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Date</th>
                          <th>Focus</th>
                          <th>Mood Rating</th>
                          <th>Interventions</th>
                          <th>Progress (%)</th>
                          <th>Therapist</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.notes.map(note => (
                          <tr key={note.id}>
                            <td>{note.clientName}</td>
                            <td>{note.sessionDate}</td>
                            <td>{note.sessionFocus}</td>
                            <td>
                              <span className="mood-rating">{note.moodRating}/10</span>
                            </td>
                            <td>{note.interventionsUsed}</td>
                            <td>
                              <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${note.progressPercentage}%` }}></div>
                                <span>{note.progressPercentage}%</span>
                              </div>
                            </td>
                            <td>{note.therapistName || 'Unknown'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Scheduled Calls Report Table */}
                {(reportData.type === 'Scheduled Calls Report' || reportData.type === 'My Scheduled Calls Report' || reportData.type === 'All Scheduled Calls Report') && (
                  <div className="report-table-container">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Duration</th>
                          <th>Status</th>
                          {reportData.type === 'All Scheduled Calls Report' && <th>Therapist</th>}
                          {reportData.type === 'All Scheduled Calls Report' && <th>Scheduled By</th>}
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.calls.map(call => (
                          <tr key={call.id}>
                            <td>{call.clientName || 'Unknown Client'}</td>
                            <td>{asDate(call.scheduledTime)?.toLocaleDateString()}</td>
                            <td>{asDate(call.scheduledTime)?.toLocaleTimeString()}</td>
                            <td>{call.duration} min</td>
                            <td>
                              <span className={`status-badge status-${call.status}`}>
                                {call.status}
                              </span>
                            </td>
                            {reportData.type === 'All Scheduled Calls Report' && <td>{call.therapistName || 'Unknown'}</td>}
                            {reportData.type === 'All Scheduled Calls Report' && <td>{call.scheduledBy || 'Unknown'}</td>}
                            <td>{call.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* All Therapists Report Table */}
                {reportData.type === 'All Therapists Report' && (
                  <div className="report-table-container">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Therapist</th>
                          <th>Role</th>
                          <th>Assigned Clients</th>
                          <th>Total Sessions</th>
                          <th>Average Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.therapists.map(therapist => (
                          <tr key={therapist.id}>
                            <td>
                              <div className="therapist-info">
                                {therapist.therapistImage && (
                                  <img src={therapist.therapistImage} alt={therapist.name} className="therapist-avatar" />
                                )}
                                <span>{therapist.name || therapist.email}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`role-badge role-${therapist.role}`}>
                                {therapist.role}
                              </span>
                            </td>
                            <td>{therapist.assignedClients}</td>
                            <td>{therapist.totalSessions}</td>
                            <td>
                              <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${therapist.averageProgress}%` }}></div>
                                <span>{therapist.averageProgress}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* All Clients Report Table */}
                {reportData.type === 'All Clients Report' && (
                  <div className="report-table-container">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Assigned Therapist</th>
                          <th>Total Sessions</th>
                          <th>Progress</th>
                          <th>Last Session</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.clients.map(client => (
                          <tr key={client.id}>
                            <td>
                              <div className="client-info">
                                {client.clientImage && (
                                  <img src={client.clientImage} alt={client.name} className="client-avatar" />
                                )}
                                <span>{client.name || client.email}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`therapist-assignment ${client.assignedTherapist === 'Unassigned' ? 'unassigned' : 'assigned'}`}>
                                {client.assignedTherapist}
                              </span>
                            </td>
                            <td>{client.totalSessions}</td>
                            <td>
                              <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${client.progress}%` }}></div>
                                <span>{client.progress}%</span>
                              </div>
                              <div className="progress-rate">
                                <small>Rate: {client.progress >= 80 ? 'Excellent' : client.progress >= 40 ? 'Good' : client.progress >= 20 ? 'Fair' : 'Needs Improvement'}</small>
                              </div>
                            </td>
                            <td>{client.lastSession}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schedule Call Modal */}
      {showScheduleForm && (
        <div className="modal-overlay" onClick={() => {
          setShowScheduleForm(false);
          setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
          setSelectedClient(null);
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Schedule Call</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (selectedClient) {
                scheduleCall(selectedClient);
              } else {
                alert('Please select a client first');
              }
            }}>
              <div className="form-group">
                <label>Select Client:</label>
                <select
                  value={selectedClient?.id || ''}
                  onChange={(e) => {
                    const client = clients.find(c => c.id === e.target.value);
                    setSelectedClient(client);
                  }}
                  required
                >
                  <option value="">Choose a client...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.displayName}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Date:</label>
                <input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Time:</label>
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm({...scheduleForm, time: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Duration (minutes):</label>
                <select
                  value={scheduleForm.duration}
                  onChange={(e) => setScheduleForm({...scheduleForm, duration: e.target.value})}
                >
                  <option value="15">15</option>
                  <option value="30">30</option>
                  <option value="45">45</option>
                  <option value="60">60</option>
                  <option value="90">90</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Notes:</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
                  placeholder="Optional notes about the call"
                  rows={3}
                />
              </div>
              
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  Schedule Call
                </button>
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => {
                    setShowScheduleForm(false);
                    setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
                    setSelectedClient(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TherapistCalendar;







// import React, { useState, useEffect } from 'react';
// import { 
//   Calendar as CalendarIcon, 
//   Clock, 
//   User, 
//   Phone, 
//   FileText, 
//   Target, 
//   Heart, 
//   Brain, 
//   Users, 
//   TrendingUp, 
//   BookOpen, 
//   MessageSquare,
//   ChevronLeft,
//   ChevronRight
// } from 'lucide-react';
// // Chart imports removed - no longer needed for reports
// import { 
//   collection, 
//   query, 
//   where, 
//   orderBy, 
//   Timestamp, 
//   getDocs, 
//   getDoc, 
//   doc, 
//   addDoc 
// } from '../../../services/firestoreShim';
// import jsPDF from 'jspdf';
// import 'jspdf-autotable';
// import { db, auth } from '../../../services/firestoreShim';
// import './Calendar.css';

// const TherapistCalendar = () => {
//   const [currentDate, setCurrentDate] = useState(new Date());
//   const [selectedDate, setSelectedDate] = useState(new Date());
//   const [scheduledCalls, setScheduledCalls] = useState([]);
//   const [therapyNotes, setTherapyNotes] = useState([]);
//   const [clients, setClients] = useState([]);
//   const [activeTab, setActiveTab] = useState('calendar');
//   const [showScheduleForm, setShowScheduleForm] = useState(false);
//   const [scheduleForm, setScheduleForm] = useState({
//     date: '',
//     time: '',
//     duration: '30',
//     notes: ''
//   });
//   const [selectedClient, setSelectedClient] = useState(null);
//   const [reportDateRange, setReportDateRange] = useState({
//     startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
//     endDate: new Date().toISOString().split('T')[0]
//   });
//   const [reportData, setReportData] = useState(null);
//   const [isGeneratingReport, setIsGeneratingReport] = useState(false);
//   const [reportType, setReportType] = useState('client-progress');
//   const [userRole, setUserRole] = useState(null);


//   useEffect(() => {
//     if (auth.currentUser) {
//       loadScheduledCalls();
//       loadTherapyNotes();
//       loadClients();
//       loadUserRole();
//     }
//   }, [auth.currentUser]);

//   const loadUserRole = async () => {
//     try {
//       const therapistDoc = await getDoc(doc(db, 'therapists', auth.currentUser.uid));
//       if (therapistDoc.exists()) {
//         const therapistData = therapistDoc.data();
//         setUserRole(therapistData.role || 'therapist');
//       }
//     } catch (error) {
//       console.error('Error loading user role:', error);
//       setUserRole('therapist');
//     }
//   };

//   const loadScheduledCalls = async () => {
//     try {
//       const callsQuery = query(
//         collection(db, 'scheduledCalls'),
//         where('therapistId', '==', auth.currentUser.uid),
//         orderBy('scheduledTime', 'asc')
//       );
//       const snapshot = await getDocs(callsQuery);
//       const calls = snapshot.docs.map(doc => ({
//         id: doc.id,
//         ...doc.data()
//       }));
//       setScheduledCalls(calls);
//     } catch (error) {
//       console.error('Error loading scheduled calls:', error);
//     }
//   };

//   const loadTherapyNotes = async () => {
//     try {
//       const clientsRef = collection(db, 'therapists', auth.currentUser.uid, 'clients');
//       const clientsSnapshot = await getDocs(clientsRef);
//       const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
      
//       const allNotes = [];
//       for (const clientId of clientIds) {
//         try {
//           const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
//           const notesSnapshot = await getDocs(notesRef);
          
//           // Get client info for the note
//           const client = clients.find(c => c.id === clientId);
//           const clientName = client ? (client.displayName || client.clientName || client.email || `Client ${clientId}`) : `Client ${clientId}`;
//           const clientEmail = client ? (client.clientEmail || client.email) : '';
          
//           const notes = notesSnapshot.docs.map(doc => ({
//             id: doc.id,
//             clientId,
//             clientName,
//             clientEmail: client ? (client.clientEmail || client.email) : '',
//             ...doc.data()
//           }));
//           allNotes.push(...notes);
//         } catch (error) {
//           console.error('Error fetching therapy notes for client:', clientId, error);
//         }
//       }
      
//       allNotes.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
//       setTherapyNotes(allNotes);
//     } catch (error) {
//       console.error('Error loading therapy notes:', error);
//     }
//   };

//   const loadClients = async () => {
//     try {
//       const clientsRef = collection(db, 'therapists', auth.currentUser.uid, 'clients');
//       const clientsSnapshot = await getDocs(clientsRef);
//       const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
      
//       const clientsData = [];
//       for (const clientId of clientIds) {
//         try {
//           const clientDoc = await getDoc(doc(db, 'clients', clientId));
//           if (clientDoc.exists()) {
//             const clientData = clientDoc.data();
//             let authData = {};
            
//             try {
//               const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
//               const authSnapshot = await getDocs(authQuery);
              
//               if (!authSnapshot.empty) {
//                 authData = authSnapshot.docs[0].data();
//               } else {
//                 const authDoc = await getDoc(doc(db, 'auth', clientId));
//                 if (authDoc.exists()) {
//                   authData = authDoc.data();
//                 }
//               }
//             } catch (authError) {
//               console.log('Error fetching auth data for client:', clientId, authError);
//             }
            
//             let displayName = 'Client';
//             if (authData.name) {
//               displayName = authData.name;
//             } else if (authData.email) {
//               displayName = authData.email.split('@')[0];
//             } else if (clientData.email) {
//               displayName = clientData.email.split('@')[0];
//             } else if (clientData.gender && clientData.age) {
//               displayName = `${clientData.gender === 'man' ? 'Male' : clientData.gender === 'woman' ? 'Female' : 'Person'} (${clientData.age})`;
//             }
            
//             const enhancedClientData = {
//               id: clientId,
//               ...clientData,
//               ...authData,
//               displayName: displayName
//             };
            
//             clientsData.push(enhancedClientData);
//           }
//         } catch (error) {
//           console.error('Error fetching client data:', error);
//         }
//       }
      
//       clientsData.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
//       setClients(clientsData);
//     } catch (error) {
//       console.error('Error loading clients:', error);
//     }
//   };

//   // Calendar navigation
//   const goToPreviousMonth = () => {
//     setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
//   };

//   const goToNextMonth = () => {
//     setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
//   };

//   const goToToday = () => {
//     const today = new Date();
//     setCurrentDate(today);
//     setSelectedDate(today);
//   };

//   // Calendar logic
//   const getDaysInMonth = (date) => {
//     const year = date.getFullYear();
//     const month = date.getMonth();
//     const firstDay = new Date(year, month, 1);
//     const lastDay = new Date(year, month + 1, 0);
//     const daysInMonth = lastDay.getDate();
//     const startingDay = firstDay.getDay();
    
//     const days = [];
    
//     for (let i = startingDay - 1; i >= 0; i--) {
//       days.push(new Date(year, month - 1, lastDay.getDate() - i));
//     }
    
//     for (let i = 1; i <= daysInMonth; i++) {
//       days.push(new Date(year, month, i));
//     }
    
//     const remainingDays = 42 - days.length;
//     for (let i = 1; i <= remainingDays; i++) {
//       days.push(new Date(year, month + 1, i));
//     }
    
//     return days;
//   };

//   const getCallsForDate = (date) => {
//     return scheduledCalls.filter(call => {
//       const callDate = call.scheduledTime?.toDate();
//       if (!callDate) return false;
//       return callDate.toDateString() === date.toDateString();
//     });
//   };

//   const isToday = (date) => {
//     return date.toDateString() === new Date().toDateString();
//   };

//   const isSelected = (date) => {
//     return selectedDate && date.toDateString() === selectedDate.toDateString();
//   };

//   const isCurrentMonth = (date) => {
//     return date.getMonth() === currentDate.getMonth();
//   };

//   const calendarDays = getDaysInMonth(currentDate);
//   const selectedDateCalls = getCallsForDate(selectedDate);

//   // Helper functions for therapy notes
//   const getClientName = (clientId) => {
//     const client = clients.find(c => c.id === clientId);
//     return client ? client.displayName : 'Unknown Client';
//   };

//   const getMoodEmoji = (rating) => {
//     if (rating >= 8) return '😊';
//     if (rating >= 6) return '🙂';
//     if (rating >= 4) return '😐';
//     if (rating >= 2) return '😕';
//     return '😢';
//   };

//   const getInterventionColor = (intervention) => {
//     const colors = {
//       'CBT': '#3B82F6',
//       'DBT': '#8B5CF6',
//       'EMDR': '#EF4444',
//       'Mindfulness': '#10B981',
//       'Exposure Therapy': '#F59E0B',
//       'Psychodynamic': '#EC4899'
//     };
//     return colors[intervention] || '#6B7280';
//   };

//   // Schedule call function
//   const scheduleCall = async (client) => {
//     if (!scheduleForm.date || !scheduleForm.time) {
//       alert('Please fill in all required fields');
//       return;
//     }

//     try {
//       const dateTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
//       const scheduledTime = Timestamp.fromDate(dateTime);
      
//       const callData = {
//         therapistId: auth.currentUser.uid,
//         clientId: client.id,
//         clientName: client.displayName,
//         scheduledTime,
//         duration: parseInt(scheduleForm.duration),
//         notes: scheduleForm.notes || '',
//         status: 'scheduled',
//         createdAt: Timestamp.now()
//       };

//       await addDoc(collection(db, 'scheduledCalls'), callData);
      
//       setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
//       setSelectedClient(null);
//       setShowScheduleForm(false);
      
//       alert('Call scheduled successfully!');
      
//       setTimeout(() => {
//         loadScheduledCalls();
//       }, 1000);
//     } catch (error) {
//       console.error('Error scheduling call:', error);
//       alert('Failed to schedule call: ' + error.message);
//     }
//   };

//   const openScheduleForm = () => {
//     setScheduleForm({
//       date: selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
//       time: '',
//       duration: '30',
//       notes: ''
//     });
//     setShowScheduleForm(true);
//   };

//   // Report generation functions
//   const generateReport = async () => {
//     setIsGeneratingReport(true);
//     try {
//       const startDate = new Date(reportDateRange.startDate);
//       const endDate = new Date(reportDateRange.endDate);
      
//       let report;
//       switch (reportType) {
//         case 'client-progress':
//           report = await generateClientProgressReport(startDate, endDate);
//           break;
//         case 'therapy-notes':
//           report = await generateTherapyNotesReport(startDate, endDate);
//           break;
//         case 'scheduled-calls':
//           report = await generateScheduledCallsReport(startDate, endDate);
//           break;
//         case 'all-therapy-notes':
//           if (userRole === 'admin') {
//             report = await generateAllTherapyNotesReport(startDate, endDate);
//           } else {
//             throw new Error('Access denied: Admin role required');
//           }
//           break;
//         case 'all-scheduled-calls':
//           if (userRole === 'admin') {
//             report = await generateAllScheduledCallsReport(startDate, endDate);
//           } else {
//             throw new Error('Access denied: Admin role required');
//           }
//           break;
//         case 'all-therapists':
//           if (userRole === 'admin') {
//             report = await generateAllTherapistsReport(startDate, endDate);
//           } else {
//             throw new Error('Access denied: Admin role required');
//           }
//           break;
//         case 'all-clients':
//           if (userRole === 'admin') {
//             report = await generateAllClientsReport(startDate, endDate);
//           } else {
//             throw new Error('Access denied: Admin role required');
//           }
//           break;
//         case 'system-overview':
//           if (userRole === 'admin') {
//             report = await generateSystemOverviewReport(startDate, endDate);
//           } else {
//             throw new Error('Access denied: Admin role required');
//           }
//           break;
//         default:
//           report = await generateClientProgressReport(startDate, endDate);
//       }
      
//       setReportData(report);
//     } catch (error) {
//       console.error('Error generating report:', error);
//       alert('Failed to generate report: ' + error.message);
//     } finally {
//       setIsGeneratingReport(false);
//     }
//   };

//   // Client Progress Report
//   const generateClientProgressReport = async (startDate, endDate) => {
//     const therapistId = auth.currentUser.uid;
//     const clientsRef = collection(db, 'therapists', therapistId, 'clients');
//     const clientsSnapshot = await getDocs(clientsRef);
//     const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
    
//     const clientProgress = [];
//     let totalSessions = 0;
//     let totalProgress = 0;
    
//     for (const clientId of clientIds) {
//       const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
//       const notesSnapshot = await getDocs(notesRef);
//       const notes = notesSnapshot.docs
//         .map(doc => ({ id: doc.id, ...doc.data() }))
//         .filter(note => {
//           const noteDate = new Date(note.sessionDate);
//           return noteDate >= startDate && noteDate <= endDate;
//         });
      
//       const sessions = notes.length;
//       const progress = sessions > 0 ? 
//         Math.round((notes.reduce((sum, note) => sum + (note.moodRating || 5), 0) / sessions) * 10) : 0;
      
//       totalSessions += sessions;
//       totalProgress += progress;
      
//       const clientDoc = await getDoc(doc(db, 'clients', clientId));
//       const clientData = clientDoc.exists() ? clientDoc.data() : {};
      
//       // Get client profile image and name from auth collection
//       let clientImage = null;
//       let authData = {};
      
//       try {
//         const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
//         const authSnapshot = await getDocs(authQuery);
        
//         if (!authSnapshot.empty) {
//           authData = authSnapshot.docs[0].data();
//         } else {
//           const authDoc = await getDoc(doc(db, 'auth', clientId));
//           if (authDoc.exists()) {
//             authData = authDoc.data();
//           }
//         }
//       } catch (error) {
//         console.log('Error fetching client auth data:', error);
//       }
      
//       clientImage = authData.profileImage || authData.photoURL;
      
//       // Use the same logic as loadClients for consistent naming
//       let displayName = 'Client';
//       if (authData.name) {
//         displayName = authData.name;
//       } else if (authData.email) {
//         displayName = authData.email.split('@')[0];
//       } else if (clientData.email) {
//         displayName = clientData.email.split('@')[0];
//       } else if (clientData.gender && clientData.age) {
//         let genderText = 'Person';
//         if (clientData.gender === 'man') {
//           genderText = 'Male';
//         } else if (clientData.gender === 'woman') {
//           genderText = 'Female';
//         }
//         displayName = `${genderText} (${clientData.age})`;
//       } else {
//         displayName = `Client ${clientId.slice(0, 8)}`;
//       }
      
//       clientProgress.push({
//         id: clientId,
//         name: displayName,
//         email: authData.email || clientData.email,
//         clientImage: clientImage,
//         totalSessions: sessions,
//         progress,
//         lastSession: sessions > 0 ? new Date(notes[notes.length - 1].sessionDate).toLocaleDateString() : 'N/A'
//       });
//     }
    
//     const assignedClients = clientIds.length;
//     const averageProgress = assignedClients > 0 ? Math.round(totalProgress / assignedClients) : 0;
    
//     return {
//       type: 'Client Progress Report',
//       assignedClients,
//       totalSessions,
//       averageProgress,
//       clientProgress,
//       dateRange: { startDate, endDate }
//     };
//   };

//   // Therapy Notes Report
//   const generateTherapyNotesReport = async (startDate, endDate) => {
//     const therapistId = auth.currentUser.uid;
//     const clientsRef = collection(db, 'therapists', therapistId, 'clients');
//     const clientsSnapshot = await getDocs(clientsRef);
//     const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
    
//     const allNotes = [];
//     let totalNotes = 0;
//     let totalMoodRating = 0;
    
//     for (const clientId of clientIds) {
//       const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
//       const notesSnapshot = await getDocs(notesRef);
//       const notes = notesSnapshot.docs
//         .map(doc => ({ id: doc.id, clientId, ...doc.data() }))
//         .filter(note => {
//           const noteDate = new Date(note.sessionDate);
//           return noteDate >= startDate && noteDate <= endDate;
//         });
      
//       totalNotes += notes.length;
//       // Only rated notes contribute; an unrated note is missing data, not a 5.
//      totalMoodRating += notes.reduce((sum, note) => sum + (Number(note.moodRating) || 0), 0);
      
//       for (const note of notes) {
//         const clientDoc = await getDoc(doc(db, 'clients', clientId));
//         const clientData = clientDoc.exists() ? clientDoc.data() : {};
        
//         // Get client name using the same logic as loadClients
//         let authData = {};
//         try {
//           const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
//           const authSnapshot = await getDocs(authQuery);
          
//           if (!authSnapshot.empty) {
//             authData = authSnapshot.docs[0].data();
//           } else {
//             const authDoc = await getDoc(doc(db, 'auth', clientId));
//             if (authDoc.exists()) {
//               authData = authDoc.data();
//             }
//           }
//         } catch (error) {
//           console.log('Error fetching client auth data:', error);
//         }
        
//         // Use the same naming logic as loadClients
//         let displayName = 'Client';
//         if (authData.name) {
//           displayName = authData.name;
//         } else if (authData.email) {
//           displayName = authData.email.split('@')[0];
//         } else if (clientData.email) {
//           displayName = clientData.email.split('@')[0];
//         } else if (clientData.gender && clientData.age) {
//           let genderText = 'Person';
//           if (clientData.gender === 'man') {
//             genderText = 'Male';
//           } else if (clientData.gender === 'woman') {
//             genderText = 'Female';
//           }
//           displayName = `${genderText} (${clientData.age})`;
//         } else {
//           displayName = `Client ${clientId.slice(0, 8)}`;
//         }
        
//         // Get current therapist name
//         const currentTherapistDoc = await getDoc(doc(db, 'therapists', therapistId));
//         const currentTherapistData = currentTherapistDoc.exists() ? currentTherapistDoc.data() : {};
//         const therapistName = currentTherapistData.name || currentTherapistData.email || 'Unknown Therapist';
        
//         // Calculate progress percentage based on mood rating (1-10 scale)
//         const progressPercentage = Math.round(((note.moodRating || 5) / 10) * 100);
        
//         allNotes.push({
//           id: note.id,
//           clientName: displayName,
//           sessionDate: new Date(note.sessionDate).toLocaleDateString(),
//           sessionFocus: note.sessionFocus || 'N/A',
//           moodRating: Number(note.moodRating) || null,
//           interventionsUsed: note.interventionsUsed || 'N/A',
//           progressAssessment: note.progressAssessment || 'N/A',
//           progressPercentage: progressPercentage,
//           therapistName: therapistName
//         });
//       }
//     }
    
//     const averageMoodRating = totalNotes > 0 ? Math.round((totalMoodRating / totalNotes) * 10) / 10 : 0;
    
//     return {
//       type: 'My Therapy Notes Report',
//       totalNotes,
//       averageMoodRating,
//       notes: allNotes.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)),
//       dateRange: { startDate, endDate }
//     };
//   };

//   // All Therapy Notes Report (Admin only)
//   const generateAllTherapyNotesReport = async (startDate, endDate) => {
//     if (userRole !== 'admin') {
//       throw new Error('Access denied: Admin role required');
//     }

//     const allNotes = [];
//     let totalNotes = 0;
//     let totalMoodRating = 0;
    
//     // Get all clients from all therapists
//     const allTherapistsSnapshot = await getDocs(collection(db, 'therapists'));
    
//     for (const therapistDoc of allTherapistsSnapshot.docs) {
//       const therapistData = therapistDoc.data();
//       const therapistId = therapistDoc.id;
      
//       // Get clients assigned to this therapist
//       const clientsRef = collection(db, 'therapists', therapistId, 'clients');
//       const clientsSnapshot = await getDocs(clientsRef);
//       const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
      
//       for (const clientId of clientIds) {
//         const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
//         const notesSnapshot = await getDocs(notesRef);
//         const notes = notesSnapshot.docs
//           .map(doc => ({ id: doc.id, clientId, therapistId, ...doc.data() }))
//           .filter(note => {
//             const noteDate = new Date(note.sessionDate);
//             return noteDate >= startDate && noteDate <= endDate;
//           });
        
//         totalNotes += notes.length;
//         // Only rated notes contribute; an unrated note is missing data, not a 5.
//      totalMoodRating += notes.reduce((sum, note) => sum + (Number(note.moodRating) || 0), 0);
        
//         for (const note of notes) {
//           const clientDoc = await getDoc(doc(db, 'clients', clientId));
//           const clientData = clientDoc.exists() ? clientDoc.data() : {};
          
//           // Get client name using the same logic
//           let authData = {};
//           try {
//             const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
//             const authSnapshot = await getDocs(authQuery);
            
//             if (!authSnapshot.empty) {
//               authData = authSnapshot.docs[0].data();
//             } else {
//               const authDoc = await getDoc(doc(db, 'auth', clientId));
//               if (authDoc.exists()) {
//                 authData = authDoc.data();
//               }
//             }
//           } catch (error) {
//             console.log('Error fetching client auth data:', error);
//           }
          
//           // Use the same naming logic
//           let displayName = 'Client';
//           if (authData.name) {
//             displayName = authData.name;
//           } else if (authData.email) {
//             displayName = authData.email.split('@')[0];
//           } else if (clientData.email) {
//             displayName = clientData.email.split('@')[0];
//           } else if (clientData.gender && clientData.age) {
//             let genderText = 'Person';
//             if (clientData.gender === 'man') {
//               genderText = 'Male';
//             } else if (clientData.gender === 'woman') {
//               genderText = 'Female';
//             }
//             displayName = `${genderText} (${clientData.age})`;
//           } else {
//             displayName = `Client ${clientId.slice(0, 8)}`;
//           }
          
//           // Get therapist name
//           const therapistName = therapistData.name || therapistData.email || 'Unknown Therapist';
          
//           // Calculate progress percentage based on mood rating (1-10 scale)
//           const progressPercentage = Math.round(((note.moodRating || 5) / 10) * 100);
          
//           allNotes.push({
//             id: note.id,
//             clientName: displayName,
//             sessionDate: new Date(note.sessionDate).toLocaleDateString(),
//             sessionFocus: note.sessionFocus || 'N/A',
//             moodRating: Number(note.moodRating) || null,
//             interventionsUsed: note.interventionsUsed || 'N/A',
//             progressAssessment: note.progressAssessment || 'N/A',
//             progressPercentage: progressPercentage,
//             therapistName: therapistName
//           });
//         }
//       }
//     }
    
//     const averageMoodRating = totalNotes > 0 ? Math.round((totalMoodRating / totalNotes) * 10) / 10 : 0;
    
//     return {
//       type: 'All Therapy Notes Report',
//       totalNotes,
//       averageMoodRating,
//       notes: allNotes.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)),
//       dateRange: { startDate, endDate }
//     };
//   };

//   // Scheduled Calls Report (User-specific)
//   const generateScheduledCallsReport = async (startDate, endDate) => {
//     const therapistId = auth.currentUser.uid;
//     const callsQuery = query(
//       collection(db, 'scheduledCalls'),
//       where('therapistId', '==', therapistId),
//       where('scheduledTime', '>=', Timestamp.fromDate(startDate)),
//       where('scheduledTime', '<=', Timestamp.fromDate(endDate))
//     );
//     const callsSnapshot = await getDocs(callsQuery);
//     const calls = callsSnapshot.docs.map(doc => ({
//       id: doc.id,
//       ...doc.data()
//     }));
    
//     const totalCalls = calls.length;
//     const completedCalls = calls.filter(call => call.status === 'completed').length;
//     const pendingCalls = calls.filter(call => call.status === 'scheduled').length;
    
//     return {
//       type: 'My Scheduled Calls Report',
//       totalCalls,
//       completedCalls,
//       pendingCalls,
//       calls: calls.sort((a, b) => a.scheduledTime?.toDate() - b.scheduledTime?.toDate()),
//       dateRange: { startDate, endDate }
//     };
//   };

//   // All Scheduled Calls Report (Admin only)
//   const generateAllScheduledCallsReport = async (startDate, endDate) => {
//     if (userRole !== 'admin') {
//       throw new Error('Access denied: Admin role required');
//     }

//     const callsQuery = query(
//       collection(db, 'scheduledCalls'),
//       where('scheduledTime', '>=', Timestamp.fromDate(startDate)),
//       where('scheduledTime', '<=', Timestamp.fromDate(endDate))
//     );
//     const callsSnapshot = await getDocs(callsQuery);
//     const calls = callsSnapshot.docs.map(doc => ({
//       id: doc.id,
//       ...doc.data()
//     }));
    
//     // Get client and therapist names for each call
//     const enhancedCalls = [];
//     for (const call of calls) {
//       let clientName = 'Unknown Client';
//       let therapistName = 'Unknown Therapist';
//       let scheduledBy = 'Unknown';
      
//       try {
//         // Get client name using comprehensive logic
//         if (call.clientId) {
//           const clientDoc = await getDoc(doc(db, 'clients', call.clientId));
//           if (clientDoc.exists()) {
//             const clientData = clientDoc.data();
            
//             // Get client name from auth collection first
//             let authData = {};
//             try {
//               const authQuery = query(collection(db, 'auth'), where('clientId', '==', call.clientId));
//               const authSnapshot = await getDocs(authQuery);
              
//               if (!authSnapshot.empty) {
//                 authData = authSnapshot.docs[0].data();
//               } else {
//                 const authDoc = await getDoc(doc(db, 'auth', call.clientId));
//                 if (authDoc.exists()) {
//                   authData = authDoc.data();
//                 }
//               }
//             } catch (error) {
//               console.log('Error fetching client auth data:', error);
//             }
            
//             // Use the same comprehensive naming logic as other functions
//             if (authData.name) {
//               clientName = authData.name;
//             } else if (authData.email) {
//               clientName = authData.email.split('@')[0];
//             } else if (clientData.name) {
//               clientName = clientData.name;
//             } else if (clientData.email) {
//               clientName = clientData.email.split('@')[0];
//             } else if (clientData.gender && clientData.age) {
//               let genderText = 'Person';
//               if (clientData.gender === 'man') {
//                 genderText = 'Male';
//               } else if (clientData.gender === 'woman') {
//                 genderText = 'Female';
//               }
//               clientName = `${genderText} (${clientData.age})`;
//             } else {
//               clientName = `Client ${call.clientId.slice(0, 8)}`;
//             }
//           }
//         }
        
//         // Get therapist name
//         if (call.therapistId) {
//           const therapistDoc = await getDoc(doc(db, 'therapists', call.therapistId));
//           if (therapistDoc.exists()) {
//             const therapistData = therapistDoc.data();
//             therapistName = therapistData.name || therapistData.email || 'Unknown Therapist';
//           }
//         }
        
//         // Determine who scheduled the call and get their name
//         let scheduledByName = 'Unknown';
//         let scheduledByRole = 'Unknown';
        
//         if (call.scheduledBy === 'client' || call.scheduledBy === 'therapist') {
//           scheduledByRole = call.scheduledBy === 'client' ? 'Client' : 'Therapist';
          
//           // Get the actual name of who scheduled the call
//           if (call.scheduledBy === 'client' && call.clientId) {
//             // Get client name from auth collection
//             try {
//               const clientAuthQuery = query(collection(db, 'auth'), where('clientId', '==', call.clientId));
//               const clientAuthSnapshot = await getDocs(clientAuthQuery);
              
//               if (!clientAuthSnapshot.empty) {
//                 const clientAuthData = clientAuthSnapshot.docs[0].data();
//                 scheduledByName = clientAuthData.name || clientAuthData.email?.split('@')[0] || 'Unknown Client';
//               } else {
//                 // Fallback to client document
//                 const clientDoc = await getDoc(doc(db, 'clients', call.clientId));
//                 if (clientDoc.exists()) {
//                   const clientData = clientDoc.data();
//                   scheduledByName = clientData.name || clientData.email?.split('@')[0] || 'Unknown Client';
//                 }
//               }
//             } catch (error) {
//               console.log('Error fetching client auth data for scheduledBy:', error);
//               scheduledByName = 'Unknown Client';
//             }
//           } else if (call.scheduledBy === 'therapist' && call.therapistId) {
//             // Get therapist name
//             try {
//               const therapistDoc = await getDoc(doc(db, 'therapists', call.therapistId));
//               if (therapistDoc.exists()) {
//                 const therapistData = therapistDoc.data();
//                 scheduledByName = therapistData.name || therapistData.email?.split('@')[0] || 'Unknown Therapist';
//               }
//             } catch (error) {
//               console.log('Error fetching therapist data for scheduledBy:', error);
//               scheduledByName = 'Unknown Therapist';
//             }
//           }
//         } else if (call.scheduledBy) {
//           // If scheduledBy has a custom value, use it
//           scheduledByName = call.scheduledBy;
//           scheduledByRole = 'Custom';
//         } else {
//           // If no scheduledBy field, try to determine from context
//           if (call.clientId && call.therapistId) {
//             // Default assumption: therapist scheduled it
//             scheduledByRole = 'Therapist';
//             try {
//               const therapistDoc = await getDoc(doc(db, 'therapists', call.therapistId));
//               if (therapistDoc.exists()) {
//                 const therapistData = therapistDoc.data();
//                 scheduledByName = therapistData.name || therapistData.email?.split('@')[0] || 'Unknown Therapist';
//               }
//             } catch (error) {
//               console.log('Error fetching therapist data for default scheduledBy:', error);
//               scheduledByName = 'Unknown Therapist';
//             }
//           } else {
//             scheduledByName = 'Unknown';
//             scheduledByRole = 'Unknown';
//           }
//         }
        
//         // Format the scheduledBy field as "Name (Role)"
//         scheduledBy = `${scheduledByName} (${scheduledByRole})`;
        
//       } catch (error) {
//         console.log('Error fetching client/therapist data:', error);
//       }
      
//       enhancedCalls.push({
//         ...call,
//         clientName,
//         therapistName,
//         scheduledBy
//       });
//     }
    
//     const totalCalls = enhancedCalls.length;
//     const completedCalls = enhancedCalls.filter(call => call.status === 'completed').length;
//     const pendingCalls = enhancedCalls.filter(call => call.status === 'scheduled').length;
    
//     return {
//       type: 'All Scheduled Calls Report',
//       totalCalls,
//       completedCalls,
//       pendingCalls,
//       calls: enhancedCalls.sort((a, b) => a.scheduledTime?.toDate() - b.scheduledTime?.toDate()),
//       dateRange: { startDate, endDate }
//     };
//   };

//   // Admin Reports
//   const generateAllTherapistsReport = async (startDate, endDate) => {
//     const therapistsSnapshot = await getDocs(collection(db, 'therapists'));
//     const therapists = [];
    
//     for (const therapistDoc of therapistsSnapshot.docs) {
//       const therapistData = therapistDoc.data();
//       const therapistId = therapistDoc.id;
      
//       const clientsRef = collection(db, 'therapists', therapistId, 'clients');
//       const clientsSnapshot = await getDocs(clientsRef);
//       const clientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
      
//       let totalSessions = 0;
//       let totalProgress = 0;
      
//       for (const clientId of clientIds) {
//         const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
//         const notesSnapshot = await getDocs(notesRef);
//         const notes = notesSnapshot.docs
//           .map(doc => ({ id: doc.id, ...doc.data() }))
//           .filter(note => {
//             const noteDate = new Date(note.sessionDate);
//             return noteDate >= startDate && noteDate <= endDate;
//           });
        
//         totalSessions += notes.length;
//         totalProgress += notes.reduce((sum, note) => sum + (Number(note.moodRating) || 0), 0);
//       }
      
//       const averageProgress = totalSessions > 0 ? Math.round((totalProgress / totalSessions) * 10) : 0;
      
//       // Get therapist profile image and name if available
//       let therapistImage = null;
//       let therapistName = therapistData.name || therapistData.email || 'Unknown Therapist';
      
//       try {
//         const authQuery = query(collection(db, 'auth'), where('uid', '==', therapistId));
//         const authSnapshot = await getDocs(authQuery);
//         if (!authSnapshot.empty) {
//           const authData = authSnapshot.docs[0].data();
//           therapistImage = authData.profileImage || authData.photoURL;
//           therapistName = authData.name || authData.email?.split('@')[0] || therapistData.name || therapistData.email || 'Unknown Therapist';
//         }
//       } catch (error) {
//         console.log('Error fetching therapist auth data:', error);
//       }
      
//       therapists.push({
//         id: therapistId,
//         name: therapistName,
//         email: therapistData.email,
//         role: therapistData.role || 'therapist',
//         assignedClients: clientIds.length,
//         totalSessions,
//         averageProgress,
//         therapistImage
//       });
//     }
    
//     return {
//       type: 'All Therapists Report',
//       totalTherapists: therapists.length,
//       therapists,
//       dateRange: { startDate, endDate }
//     };
//   };

//   const generateAllClientsReport = async (startDate, endDate) => {
//     const clientsSnapshot = await getDocs(collection(db, 'clients'));
//     const clients = [];
    
//     for (const clientDoc of clientsSnapshot.docs) {
//       const clientData = clientDoc.data();
//       const clientId = clientDoc.id;
      
//       // Find assigned therapist by checking therapists collection
//       let assignedTherapist = 'Unassigned';
//       let therapistId = null;
      
//       // Check all therapists to see who has this client assigned
//       const therapistsSnapshot = await getDocs(collection(db, 'therapists'));
//       for (const therapistDoc of therapistsSnapshot.docs) {
//         const therapistData = therapistDoc.data();
//         const therapistClientsRef = collection(db, 'therapists', therapistDoc.id, 'clients');
//         const therapistClientsSnapshot = await getDocs(therapistClientsRef);
        
//         // Check if this client is assigned to this therapist
//         const isAssigned = therapistClientsSnapshot.docs.some(doc => doc.data().clientId === clientId);
//         if (isAssigned) {
//           assignedTherapist = therapistData.name || therapistData.email || 'Unknown Therapist';
//           therapistId = therapistDoc.id;
//           break;
//         }
//       }
      
//       // Get client's sessions and progress
//       const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
//       const notesSnapshot = await getDocs(notesRef);
//       const notes = notesSnapshot.docs
//         .map(doc => ({ id: doc.id, ...doc.data() }))
//         .filter(note => {
//           const noteDate = new Date(note.sessionDate);
//           return noteDate >= startDate && noteDate <= endDate;
//         });
      
//       const totalSessions = notes.length;
//       const progress = totalSessions > 0 ? 
//         Math.round((notes.reduce((sum, note) => sum + (note.moodRating || 5), 0) / totalSessions) * 10) : 0;
      
//       // Get client profile image if available
//       let clientImage = null;
//       try {
//         const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
//         const authSnapshot = await getDocs(authQuery);
//         if (!authSnapshot.empty) {
//           const authData = authSnapshot.docs[0].data();
//           clientImage = authData.profileImage || authData.photoURL;
//         }
//       } catch (error) {
//         console.log('Error fetching client image:', error);
//       }
      
//       // Get client name from auth collection
//       let clientName = 'Unknown';
//       let clientEmail = clientData.email;
      
//       try {
//         const authQuery = query(collection(db, 'auth'), where('clientId', '==', clientId));
//         const authSnapshot = await getDocs(authQuery);
//         if (!authSnapshot.empty) {
//           const authData = authSnapshot.docs[0].data();
//           clientName = authData.name || authData.email?.split('@')[0] || 'Unknown';
//           clientEmail = authData.email || clientData.email;
//         } else {
//           // Fallback: try to find by uid if clientId doesn't work
//           const authDoc = await getDoc(doc(db, 'auth', clientId));
//           if (authDoc.exists()) {
//             const authData = authDoc.data();
//             clientName = authData.name || authData.email?.split('@')[0] || 'Unknown';
//             clientEmail = authData.email || clientData.email;
//           }
//         }
//       } catch (error) {
//         console.log('Error fetching client auth data:', error);
//         // Use fallback names
//         if (clientData.email) {
//           clientName = clientData.email.split('@')[0];
//         } else if (clientData.gender && clientData.age) {
//           clientName = `${clientData.gender === 'man' ? 'Male' : clientData.gender === 'woman' ? 'Female' : 'Person'} (${clientData.age})`;
//         }
//       }
      
//       clients.push({
//         id: clientId,
//         name: clientName,
//         email: clientEmail,
//         assignedTherapist,
//         therapistId,
//         totalSessions,
//         progress,
//         lastSession: totalSessions > 0 ? new Date(notes[notes.length - 1].sessionDate).toLocaleDateString() : 'N/A',
//         clientImage
//       });
//     }
    
//     return {
//       type: 'All Clients Report',
//       totalClients: clients.length,
//       clients,
//       dateRange: { startDate, endDate }
//     };
//   };

//   const generateSystemOverviewReport = async (startDate, endDate) => {
//     const therapistsSnapshot = await getDocs(collection(db, 'therapists'));
//     const clientsSnapshot = await getDocs(collection(db, 'clients'));
//     const scheduledCallsSnapshot = await getDocs(collection(db, 'scheduledCalls'));
    
//     // Enhanced data collection for comprehensive analysis
//     let totalSessions = 0;
//     let totalProgress = 0;
//     let totalMoodRating = 0;
//     let totalDuration = 0;
//     let totalCalls = 0;
//     let completedCalls = 0;
//     let cancelledCalls = 0;
    
//     // Data structures for charts
//     const monthlyData = {};
//     const therapistPerformance = [];
//     const clientProgressData = [];
//     const interventionStats = {};
//     const moodTrends = [];
//     const callStatusData = [];
//     const sessionDurationData = [];
//     const ageGroupData = {};
//     const genderDistribution = {};
    
//     // Process therapists data
//     for (const therapistDoc of therapistsSnapshot.docs) {
//       const therapistData = therapistDoc.data();
//       const therapistId = therapistDoc.id;
      
//       // Get therapist's assigned clients
//       const assignedClients = clientsSnapshot.docs.filter(clientDoc => 
//         clientDoc.data().assignedTherapist === therapistId
//       );
      
//       // Get therapist's sessions
//       let therapistSessions = 0;
//       let therapistProgress = 0;
      
//       for (const clientDoc of assignedClients) {
//         const clientId = clientDoc.id;
//         const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
//         const notesSnapshot = await getDocs(notesRef);
//         const notes = notesSnapshot.docs
//           .map(doc => ({ id: doc.id, ...doc.data() }))
//           .filter(note => {
//             const noteDate = new Date(note.sessionDate);
//             return noteDate >= startDate && noteDate <= endDate;
//           });
        
//         therapistSessions += notes.length;
//         therapistProgress += notes.reduce((sum, note) => sum + (note.moodRating || 5), 0);
//       }
      
//       therapistPerformance.push({
//         name: therapistData.name || therapistData.email || 'Unknown',
//         sessions: therapistSessions,
//         progress: therapistSessions > 0 ? Math.round((therapistProgress / therapistSessions) * 10) : 0,
//         clients: assignedClients.length
//       });
//     }
    
//     // Process clients and sessions data
//     for (const clientDoc of clientsSnapshot.docs) {
//       const clientData = clientDoc.data();
//       const clientId = clientDoc.id;
      
//       // Client demographics
//       if (clientData.age) {
//         const ageGroup = Math.floor(clientData.age / 10) * 10;
//         ageGroupData[ageGroup] = (ageGroupData[ageGroup] || 0) + 1;
//       }
      
//       if (clientData.gender) {
//         genderDistribution[clientData.gender] = (genderDistribution[clientData.gender] || 0) + 1;
//       }
      
//       // Get client's therapy notes
//       const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
//       const notesSnapshot = await getDocs(notesRef);
//       const notes = notesSnapshot.docs
//         .map(doc => ({ id: doc.id, ...doc.data() }))
//         .filter(note => {
//           const noteDate = new Date(note.sessionDate);
//           return noteDate >= startDate && noteDate <= endDate;
//         });
      
//       totalSessions += notes.length;
      
//       // Process each session
//       notes.forEach(note => {
//         const sessionDate = new Date(note.sessionDate);
//         const monthKey = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}`;
        
//         // Monthly data aggregation
//         if (!monthlyData[monthKey]) {
//           monthlyData[monthKey] = {
//             month: monthKey,
//             sessions: 0,
//             progress: 0,
//             moodRating: 0,
//             duration: 0
//           };
//         }
//         monthlyData[monthKey].sessions += 1;
//         monthlyData[monthKey].progress += note.moodRating || 5;
//         monthlyData[monthKey].moodRating += note.moodRating || 5;
//         monthlyData[monthKey].duration += note.sessionDuration || 60;
        
//         // Mood trends
//         moodTrends.push({
//           date: sessionDate,
//           mood: note.moodRating || 5,
//           client: clientData.name || clientData.email || 'Unknown'
//         });
        
//         // Session duration data
//         sessionDurationData.push({
//           duration: note.sessionDuration || 60,
//           date: sessionDate,
//           client: clientData.name || clientData.email || 'Unknown'
//         });
        
//         // Intervention statistics
//         if (note.interventionsUsed) {
//           interventionStats[note.interventionsUsed] = (interventionStats[note.interventionsUsed] || 0) + 1;
//         }
        
//         totalProgress += note.moodRating || 5;
//         totalMoodRating += note.moodRating || 5;
//         totalDuration += note.sessionDuration || 60;
//       });
      
//       // Client progress data
//       if (notes.length > 0) {
//         const avgMood = notes.reduce((sum, note) => sum + (note.moodRating || 5), 0) / notes.length;
//         clientProgressData.push({
//           name: clientData.name || clientData.email || 'Unknown',
//           sessions: notes.length,
//           progress: calculateClientProgress([], clientNotes)?.percent ?? null,
//           lastSession: notes[notes.length - 1]?.sessionDate
//         });
//       }
//     }
    
//     // Process scheduled calls data
//     const calls = scheduledCallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//     totalCalls = calls.length;
    
//     calls.forEach(call => {
//       const callDate = new Date(call.scheduledTime?.toDate());
//       if (callDate >= startDate && callDate <= endDate) {
//         if (call.status === 'completed') completedCalls++;
//         if (call.status === 'cancelled') cancelledCalls++;
        
//         callStatusData.push({
//           status: call.status || 'scheduled',
//           date: callDate,
//           duration: call.duration || 30
//         });
//       }
//     });
    
//     // Convert data structures to chart-ready format
//     const monthlyChartData = Object.values(monthlyData).map(item => ({
//       month: item.month,
//       sessions: item.sessions,
//       progress: item.progress ?? null,
//       moodRating: Math.round(item.moodRating / item.sessions),
//       duration: Math.round(item.duration / item.sessions)
//     }));
    
//     const interventionChartData = Object.entries(interventionStats).map(([name, count]) => ({
//       name,
//       value: count
//     }));
    
//     const ageGroupChartData = Object.entries(ageGroupData).map(([age, count]) => ({
//       age: `${age}-${age + 9}`,
//       count
//     }));
    
//     const genderChartData = Object.entries(genderDistribution).map(([gender, count]) => ({
//       gender: gender === 'man' ? 'Male' : gender === 'woman' ? 'Female' : 'Other',
//       count
//     }));
    
//     const totalTherapists = therapistsSnapshot.docs.length;
//     const totalClients = clientsSnapshot.docs.length;
//     const averageProgress = totalSessions > 0 ? Math.round((totalProgress / totalSessions) * 10) : 0;
//     const averageMoodRating = totalSessions > 0 ? Math.round((totalMoodRating / totalSessions) * 10) / 10 : 0;
//     const averageSessionDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
//     const pendingCalls = totalCalls - completedCalls - cancelledCalls;
    
//     return {
//       type: 'System Overview Report',
//       totalTherapists,
//       totalClients,
//       totalSessions,
//       averageProgress,
//       averageMoodRating,
//       averageSessionDuration,
//       totalCalls,
//       completedCalls,
//       pendingCalls,
//       cancelledCalls,
//       dateRange: { startDate, endDate },
//       // Chart data
//       monthlyChartData,
//       therapistPerformance,
//       clientProgressData,
//       interventionChartData,
//       moodTrends,
//       callStatusData,
//       sessionDurationData,
//       ageGroupChartData,
//       genderChartData
//     };
//   };

//   // Generate chart data for progress visualization (removed - no longer needed for reports)
//   const generateChartData = (reportData) => {
//     // Charts have been removed from reports - this function is kept for compatibility but returns null
//     return null;
//   };

//   // Download PDF report
//   const downloadPDFReport = async () => {
//     if (!reportData) return;
    
//     try {
//       // Create professional PDF report
//       const pdf = new jsPDF();
      
//       // Simple, professional header
//       const headerHeight = 35;
      
//       // Clean header background
//       pdf.setFillColor(51, 51, 51); // Dark gray - professional
//       pdf.rect(0, 0, 210, headerHeight, 'F');
      
//       // Company title
//       pdf.setFontSize(22);
//       pdf.setTextColor(255, 255, 255);
//       pdf.setFont(undefined, 'bold');
//       pdf.text('NESSA HUB THERAPY CENTER', 105, 20, { align: 'center' });
      
//       // Report subtitle
//       pdf.setFontSize(14);
//       pdf.setTextColor(200, 200, 200);
//       pdf.setFont(undefined, 'normal');
//       pdf.text('Professional Report', 105, 30, { align: 'center' });
      
//       // Report details section - clean and simple
//       let yPosition = headerHeight + 15;
      
//       pdf.setFontSize(14);
//       pdf.setTextColor(51, 51, 51);
//       pdf.setFont(undefined, 'bold');
//       pdf.text('Report Information', 20, yPosition);
//       yPosition += 12;
      
//       pdf.setFontSize(10);
//       pdf.setTextColor(68, 68, 68);
//       pdf.setFont(undefined, 'normal');
      
//       // Simple layout
//       pdf.text(`Type: ${reportData.type}`, 20, yPosition);
//       pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 120, yPosition);
//       yPosition += 8;
//       pdf.text(`Date Range: ${new Date(reportDateRange.startDate).toLocaleDateString()} - ${new Date(reportDateRange.endDate).toLocaleDateString()}`, 20, yPosition);
//       pdf.text(`Generated by: ${auth.currentUser?.displayName || auth.currentUser?.email}`, 120, yPosition);
      
//       yPosition += 20;
      
//       // Summary section - clean
//       pdf.setFontSize(14);
//       pdf.setTextColor(51, 51, 51);
//       pdf.setFont(undefined, 'bold');
//       pdf.text('Summary Statistics', 20, yPosition);
//       yPosition += 12;
      
//       pdf.setFontSize(10);
//       pdf.setTextColor(68, 68, 68);
//       pdf.setFont(undefined, 'normal');
      
//       // Add summary data based on report type (emojis removed to prevent encoding issues)
//       switch (reportData.type) {
//         case 'Client Progress Report':
//         case 'My Client Progress Report':
//           pdf.text(`Total Clients: ${reportData.assignedClients}`, 20, yPosition);
//           pdf.text(`Total Sessions: ${reportData.totalSessions}`, 120, yPosition);
//           yPosition += 8;
//           pdf.text(`Average Progress: ${reportData.averageProgress}%`, 20, yPosition);
//           yPosition += 15;
//           break;
          
//         case 'Therapy Notes Report':
//         case 'My Therapy Notes Report':
//         case 'All Therapy Notes Report':
//           pdf.text(`Total Notes: ${reportData.totalNotes}`, 20, yPosition);
//           pdf.text(`Average Mood Rating: ${reportData.averageMoodRating}/10`, 120, yPosition);
//           yPosition += 15;
//           break;
          
//         case 'Scheduled Calls Report':
//         case 'My Scheduled Calls Report':
//         case 'All Scheduled Calls Report':
//           pdf.text(`Total Calls: ${reportData.totalCalls}`, 20, yPosition);
//           pdf.text(`Completed: ${reportData.completedCalls}`, 120, yPosition);
//           yPosition += 8;
//           pdf.text(`Pending: ${reportData.pendingCalls}`, 20, yPosition);
//           yPosition += 15;
//           break;
          
//         case 'All Therapists Report':
//           pdf.text(`Total Therapists: ${reportData.totalTherapists}`, 20, yPosition);
//           yPosition += 15;
//           break;
          
//         case 'All Clients Report':
//           pdf.text(`Total Clients: ${reportData.totalClients}`, 20, yPosition);
//           yPosition += 15;
//           break;
          
//         case 'System Overview Report':
//           pdf.text(`Total Therapists: ${reportData.totalTherapists}`, 20, yPosition);
//           pdf.text(`Total Clients: ${reportData.totalClients}`, 120, yPosition);
//           yPosition += 8;
//           pdf.text(`Total Sessions: ${reportData.totalSessions}`, 20, yPosition);
//           pdf.text(`Average Progress: ${reportData.averageProgress}%`, 120, yPosition);
//           yPosition += 15;
//           break;
//       }
      

      

      

//       // Charts removed from PDF reports for cleaner output
      
//       // Add detailed data table with improved styling
//       pdf.setFontSize(16);
//       pdf.setTextColor(30, 41, 59);
//       pdf.text('Detailed Data Table', 20, yPosition);
//       yPosition += 15;
      
//       // Generate table data based on report type
//       let tableData = [];
//       let tableHeaders = [];
      
//       switch (reportData.type) {
//         case 'Client Progress Report':
//           tableHeaders = ['Client Name', 'Sessions', 'Progress (%)', 'Last Session'];
//           tableData = reportData.clientProgress.map(client => [
//             client.name || client.email || 'Unknown',
//             client.totalSessions.toString(),
//             client.progress.toString(),
//             client.lastSession || 'N/A'
//           ]);
//           break;
          
//         case 'Therapy Notes Report':
//         case 'My Therapy Notes Report':
//         case 'All Therapy Notes Report':
//           tableHeaders = ['Client Name', 'Date', 'Focus', 'Mood Rating', 'Interventions', 'Progress (%)', 'Therapist'];
//           tableData = reportData.notes.map(note => [
//             note.clientName || `Client ${note.clientId}`,
//             note.sessionDate || 'N/A',
//             note.sessionFocus || 'N/A',
//             `${note.moodRating || 0}/10`,
//             note.interventionsUsed || 'N/A',
//             `${note.progressPercentage || 0}%`,
//             note.therapistName || 'Unknown'
//           ]);
//           break;
          
//         case 'Scheduled Calls Report':
//         case 'My Scheduled Calls Report':
//         case 'All Scheduled Calls Report':
//           if (reportData.type === 'All Scheduled Calls Report') {
//             tableHeaders = ['Client Name', 'Date', 'Time', 'Duration', 'Status', 'Therapist', 'Scheduled By'];
//             tableData = reportData.calls.map(call => [
//               call.clientName || 'Unknown',
//               call.scheduledTime?.toDate().toLocaleDateString() || 'N/A',
//               call.scheduledTime?.toDate().toLocaleTimeString() || 'N/A',
//               `${call.duration || 0} min`,
//               call.status || 'N/A',
//               call.therapistName || 'Unknown',
//               call.scheduledBy || 'Unknown'
//             ]);
//           } else {
//             tableHeaders = ['Client Name', 'Date', 'Time', 'Duration', 'Status'];
//             tableData = reportData.calls.map(call => [
//               call.clientName || 'Unknown',
//               call.scheduledTime?.toDate().toLocaleDateString() || 'N/A',
//               call.scheduledTime?.toDate().toLocaleTimeString() || 'N/A',
//               `${call.duration || 0} min`,
//               call.status || 'N/A'
//             ]);
//           }
//           break;
          
//         case 'All Therapists Report':
//           tableHeaders = ['Therapist Name', 'Role', 'Clients', 'Sessions', 'Progress (%)'];
//           tableData = reportData.therapists.map(therapist => [
//             therapist.name || therapist.email || 'Unknown',
//             therapist.role || 'N/A',
//             therapist.assignedClients.toString(),
//             therapist.totalSessions.toString(),
//             therapist.averageProgress.toString()
//           ]);
//           break;
          
//         case 'All Clients Report':
//           tableHeaders = ['Client Name', 'Assigned Therapist', 'Sessions', 'Progress (%)', 'Last Session'];
//           tableData = reportData.clients.map(client => [
//             client.name || client.email || 'Unknown',
//             client.assignedTherapist || 'Unassigned',
//             client.totalSessions.toString(),
//             client.progress.toString(),
//             client.lastSession || 'N/A'
//           ]);
//           break;
//       }
      
//       // Add table to PDF with clean, professional styling
//       if (tableData.length > 0) {
//         // Simple table section header
//         pdf.setFontSize(14);
//         pdf.setTextColor(51, 51, 51);
//         pdf.setFont(undefined, 'bold');
//         pdf.text('Detailed Data Table', 20, yPosition);
//         yPosition += 15;
        
//         pdf.autoTable({
//           head: [tableHeaders],
//           body: tableData,
//           startY: yPosition,
//           theme: 'grid',
//           styles: {
//             fontSize: 9,
//             cellPadding: 4,
//             headStyles: {
//               fillColor: [51, 51, 51], // Dark gray - professional
//               textColor: 255,
//               fontStyle: 'bold',
//               halign: 'center',
//               fontSize: 10
//             },
//             alternateRowStyles: {
//               fillColor: [245, 245, 245] // Light gray
//             },
//             bodyStyles: {
//               textColor: 51,
//               halign: 'left',
//               fontSize: 9
//             }
//           },
//           columnStyles: (() => {
//             // Dynamic column styles based on table structure
//             const styles = {};
//             if (reportData.type === 'All Scheduled Calls Report') {
//               // 7 columns: Client, Date, Time, Duration, Status, Therapist, Scheduled By
//               styles[0] = { cellWidth: 30, halign: 'left' };     // Client Name
//               styles[1] = { cellWidth: 18, halign: 'center' };   // Date
//               styles[2] = { cellWidth: 18, halign: 'center' };   // Time
//               styles[3] = { cellWidth: 20, halign: 'center' };   // Duration
//               styles[4] = { cellWidth: 20, halign: 'center' };   // Status
//               styles[5] = { cellWidth: 25, halign: 'center' };   // Therapist
//               styles[6] = { cellWidth: 25, halign: 'center' };   // Scheduled By
//             } else if (reportData.type === 'All Therapy Notes Report' || reportData.type === 'My Therapy Notes Report' || reportData.type === 'Therapy Notes Report') {
//               // 7 columns: Client, Date, Focus, Mood Rating, Interventions, Progress (%), Therapist
//               styles[0] = { cellWidth: 30, halign: 'left' };     // Client Name
//               styles[1] = { cellWidth: 18, halign: 'center' };   // Date
//               styles[2] = { cellWidth: 35, halign: 'left' };     // Focus
//               styles[3] = { cellWidth: 20, halign: 'center' };   // Mood Rating
//               styles[4] = { cellWidth: 25, halign: 'center' };   // Interventions
//               styles[5] = { cellWidth: 20, halign: 'center' };   // Progress (%)
//               styles[6] = { cellWidth: 25, halign: 'center' };   // Therapist
//             } else if (reportData.type === 'Scheduled Calls Report' || reportData.type === 'My Scheduled Calls Report') {
//               // 6 columns: Client, Date, Time, Duration, Status, Notes
//               styles[0] = { cellWidth: 30, halign: 'left' };     // Client Name
//               styles[1] = { cellWidth: 20, halign: 'center' };   // Date
//               styles[2] = { cellWidth: 20, halign: 'center' };   // Time
//               styles[3] = { cellWidth: 20, halign: 'center' };   // Duration
//               styles[4] = { cellWidth: 20, halign: 'center' };   // Status
//               styles[5] = { cellWidth: 30, halign: 'left' };     // Notes
//             } else {
//               // Default styles for other reports
//               styles[0] = { cellWidth: 35, halign: 'left' };     // First column
//               styles[1] = { cellWidth: 20, halign: 'center' };   // Second column
//               styles[2] = { cellWidth: 20, halign: 'center' };   // Third column
//               styles[3] = { cellWidth: 20, halign: 'center' };   // Fourth column
//               styles[4] = { cellWidth: 20, halign: 'center' };   // Fifth column
//             }
//             return styles;
//           })(),
//           margin: { top: 5, right: 10, bottom: 5, left: 10 }
//         });
        
//         // Get the final Y position after the table
//         yPosition = pdf.lastAutoTable.finalY + 10;
//       } else {
//         // No data to display
//         pdf.setFontSize(12);
//         pdf.setTextColor(156, 163, 175);
//         pdf.text('No data available for the selected date range', 20, yPosition);
//         yPosition += 20;
//       }
      
//       // Add simple, professional footer
//       const pageCount = pdf.internal.getNumberOfPages();
//       for (let i = 1; i <= pageCount; i++) {
//         pdf.setPage(i);
        
//         // Simple footer background
//         pdf.setFillColor(51, 51, 51); // Dark gray - professional
//         pdf.rect(0, pdf.internal.pageSize.height - 20, 210, 20, 'F');
        
//         // Footer content
//         pdf.setFontSize(10);
//         pdf.setTextColor(255, 255, 255);
//         pdf.setFont(undefined, 'bold');
//         pdf.text(`Page ${i} of ${pageCount}`, 105, pdf.internal.pageSize.height - 10, { align: 'center' });
        
//         // Company info
//         pdf.setFontSize(9);
//         pdf.setTextColor(200, 200, 200);
//         pdf.setFont(undefined, 'normal');
//         pdf.text('NessaHub Therapy Center - Professional Reports', 105, pdf.internal.pageSize.height - 15, { align: 'center' });
//       }
      
//       // Save the PDF with better filename
//       const timestamp = new Date().toISOString().split('T')[0];
//       const filename = `${reportData.type.replace(/\s+/g, '_')}_${timestamp}.pdf`;
//       pdf.save(filename);
      
//       alert('Professional PDF report downloaded successfully! 📊');
//     } catch (error) {
//       console.error('Error generating PDF:', error);
//       alert('Failed to generate PDF report: ' + error.message);
//     }
//   };

//   // Generate report text
//   const generateReportText = () => {
//     const startDate = new Date(reportDateRange.startDate).toLocaleDateString();
//     const endDate = new Date(reportDateRange.endDate).toLocaleDateString();
    
//     let reportText = `THERAPY REPORT\n`;
//     reportText += `Generated on: ${new Date().toLocaleDateString()}\n`;
//     reportText += `Date Range: ${startDate} to ${endDate}\n`;
//     reportText += `Generated by: ${auth.currentUser?.displayName || auth.currentUser?.email}\n`;
//     reportText += `Report Type: ${reportData.type}\n\n`;
    
//     switch (reportData.type) {
//       case 'Client Progress Report':
//         reportText += `CLIENT PROGRESS REPORT\n`;
//         reportText += `Assigned Clients: ${reportData.assignedClients}\n`;
//         reportText += `Total Sessions: ${reportData.totalSessions}\n`;
//         reportText += `Average Progress: ${reportData.averageProgress}%\n\n`;
        
//         reportText += `CLIENT DETAILS:\n`;
//         reportData.clientProgress.forEach(client => {
//           reportText += `- ${client.name || client.email}\n`;
//           reportText += `  Total Sessions: ${client.totalSessions}\n`;
//           reportText += `  Progress: ${client.progress}%\n`;
//           reportText += `  Last Session: ${client.lastSession}\n\n`;
//         });
//         break;
        
//       case 'Therapy Notes Report':
//         reportText += `THERAPY NOTES REPORT\n`;
//         reportText += `Total Notes: ${reportData.totalNotes}\n`;
//         reportText += `Average Mood Rating: ${reportData.averageMoodRating}/10\n\n`;
        
//         reportText += `NOTES DETAILS:\n`;
//         reportData.notes.forEach(note => {
//           reportText += `- Client: ${note.clientName}\n`;
//           reportText += `  Date: ${note.sessionDate}\n`;
//           reportText += `  Focus: ${note.sessionFocus}\n`;
//           reportText += `  Mood Rating: ${note.moodRating}/10\n`;
//           reportText += `  Interventions: ${note.interventionsUsed}\n`;
//           reportText += `  Progress: ${note.progressAssessment}\n\n`;
//         });
//         break;
        
//       case 'Scheduled Calls Report':
//         reportText += `SCHEDULED CALLS REPORT\n`;
//         reportText += `Total Calls: ${reportData.totalCalls}\n`;
//         reportText += `Completed: ${reportData.completedCalls}\n`;
//         reportText += `Pending: ${reportData.pendingCalls}\n\n`;
        
//         reportText += `CALL DETAILS:\n`;
//         reportData.calls.forEach(call => {
//           reportText += `- Client: ${call.clientName || 'Unknown'}\n`;
//           reportText += `  Date: ${call.scheduledTime?.toDate().toLocaleDateString()}\n`;
//           reportText += `  Time: ${call.scheduledTime?.toDate().toLocaleTimeString()}\n`;
//           reportText += `  Duration: ${call.duration} min\n`;
//           reportText += `  Status: ${call.status}\n\n`;
//         });
//         break;
        
//       case 'All Therapists Report':
//         reportText += `ALL THERAPISTS REPORT\n`;
//         reportText += `Total Therapists: ${reportData.totalTherapists}\n\n`;
        
//         reportText += `THERAPIST DETAILS:\n`;
//         reportData.therapists.forEach(therapist => {
//           reportText += `- ${therapist.name || therapist.email}\n`;
//           reportText += `  Role: ${therapist.role}\n`;
//           reportText += `  Assigned Clients: ${therapist.assignedClients}\n`;
//           reportText += `  Total Sessions: ${therapist.totalSessions}\n`;
//           reportText += `  Average Progress: ${therapist.averageProgress}%\n\n`;
//         });
//         break;
        
//       case 'All Clients Report':
//         reportText += `ALL CLIENTS REPORT\n`;
//         reportText += `Total Clients: ${reportData.totalClients}\n\n`;
        
//         reportText += `CLIENT DETAILS:\n`;
//         reportData.clients.forEach(client => {
//           reportText += `- ${client.name || client.email}\n`;
//           reportText += `  Assigned Therapist: ${client.assignedTherapist}\n`;
//           reportText += `  Total Sessions: ${client.totalSessions}\n`;
//           reportText += `  Progress: ${client.progress}%\n`;
//           reportText += `  Last Session: ${client.lastSession}\n\n`;
//         });
//         break;
        
//       case 'System Overview Report':
//         reportText += `SYSTEM OVERVIEW REPORT\n`;
//         reportText += `Total Therapists: ${reportData.totalTherapists}\n`;
//         reportText += `Total Clients: ${reportData.totalClients}\n`;
//         reportText += `Total Sessions: ${reportData.totalSessions}\n`;
//         reportText += `Average Progress: ${reportData.averageProgress}%\n\n`;
//         break;
//     }
    
//     return reportText;
//   };

//   return (
//     <div className="therapist-calendar-container">
//       <div className="therapist-calendar-header">
//         <h2>Therapist Calendar & Reports</h2>
//         <div className="therapist-calendar-navigation">
//           <button onClick={goToPreviousMonth} className="nav-btn">
//             <ChevronLeft size={20} />
//           </button>
//           <h3>
//             {currentDate.toLocaleDateString('en-US', { 
//               month: 'long', 
//               year: 'numeric' 
//             })}
//           </h3>
//           <button onClick={goToNextMonth} className="nav-btn">
//             <ChevronRight size={20} />
//           </button>
//           <button onClick={goToToday} className="today-btn">
//             Today
//           </button>
//         </div>
//       </div>

//       {/* Tab Navigation */}
//       <div className="tab-navigation">
//         <button 
//           className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
//           onClick={() => setActiveTab('calendar')}
//         >
//           <CalendarIcon size={20} />
//           Calendar
//         </button>
//         <button 
//           className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
//           onClick={() => setActiveTab('reports')}
//         >
//           <FileText size={20} />
//           Reports
//         </button>
//       </div>

//       {activeTab === 'calendar' ? (
//         <>
//           <div className="calendar-main">
//             <div className="therapist-calendar-grid">
//               {/* Day headers */}
//               {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
//                 <div key={day} className="day-header">
//                   {day}
//                 </div>
//               ))}

//               {/* Calendar days */}
//               {calendarDays.map((date, index) => {
//                 const callsForDate = getCallsForDate(date);
//                 const hasCalls = callsForDate.length > 0;
                
//                 return (
//                   <div
//                     key={index}
//                     className={`therapist-calendar-day ${isToday(date) ? 'today' : ''} ${isSelected(date) ? 'selected' : ''} ${!isCurrentMonth(date) ? 'other-month' : ''}`}
//                     onClick={() => setSelectedDate(date)}
//                   >
//                     <span className="day-number">{date.getDate()}</span>
//                     {hasCalls && (
//                       <div className="call-indicator">
//                         <span className="call-count">{callsForDate.length}</span>
//                       </div>
//                     )}
//                   </div>
//                 );
//               })}
//             </div>

//             <div className="calendar-sidebar">
//               <div className="selected-date-info">
//                 <h3>
//                   {selectedDate ? selectedDate.toLocaleDateString('en-US', { 
//                     weekday: 'long', 
//                     year: 'numeric', 
//                     month: 'long', 
//                     day: 'numeric' 
//                   }) : 'Select a date'}
//                 </h3>
                
//                 {selectedDateCalls.length > 0 ? (
//                   <div className="scheduled-calls">
//                     <h4>Scheduled Calls ({selectedDateCalls.length})</h4>
//                     {selectedDateCalls.map(call => (
//                       <div key={call.id} className="call-card">
//                         <div className="call-time">
//                           <Clock size={16} />
//                           {call.scheduledTime?.toDate().toLocaleTimeString('en-US', { 
//                             hour: '2-digit', 
//                             minute: '2-digit' 
//                           })}
//                         </div>
//                         <div className="call-client">
//                           <User size={16} />
//                           {call.clientName || 'Client'}
//                         </div>
//                         <div className="call-duration">
//                           Duration: {call.duration || 30} min
//                         </div>
//                         {call.notes && (
//                           <div className="call-notes">{call.notes}</div>
//                         )}
//                         {(() => {
//                           const now = new Date();
//                           const callDate = call.scheduledTime?.toDate();
//                           const isDatePassed = callDate && callDate < now;
                          
//                           if (isDatePassed) {
//                             return (
//                               <div className="call-expired">
//                                 <span className="expired-text">Call Date Passed</span>
//                                 <small className="expired-time">
//                                   {callDate.toLocaleDateString()} at {callDate.toLocaleTimeString()}
//                                 </small>
//                               </div>
//                             );
//                           } else {
//                             return (
//                               <button className="join-call-btn">
//                                 <Phone size={16} />
//                                 Join Call
//                               </button>
//                             );
//                           }
//                         })()}
//                       </div>
//                     ))}
//                   </div>
//                 ) : (
//                   <div className="no-calls">
//                     <p>No scheduled calls for this date</p>
//                     <button className="schedule-call-btn" onClick={openScheduleForm}>
//                       <CalendarIcon size={16} />
//                       Schedule Call
//                     </button>
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>

//           <div className="therapy-notes-section">
//             <h4>Therapy Notes & Progress</h4>
//             {therapyNotes.length > 0 ? (
//               <div className="notes-grid">
//                 {therapyNotes.slice(0, 6).map((note, index) => (
//                   <div key={note.id} className="therapy-note-card" style={{ borderLeftColor: getInterventionColor(note.interventionsUsed) }}>
//                     <div className="note-header">
//                       <div className="note-client">
//                         <User size={16} />
//                         {getClientName(note.clientId)}
//                       </div>
//                       <div className="note-date">
//                         <CalendarIcon size={14} />
//                         {new Date(note.sessionDate).toLocaleDateString()}
//                       </div>
//                     </div>
                    
//                     <div className="note-session">
//                       <div className="session-number">
//                         <FileText size={16} />
//                         {note.sessionNumber}
//                       </div>
//                       <div className="session-time">
//                         <Clock size={14} />
//                         {note.sessionTime}
//                       </div>
//                     </div>
                    
//                     <div className="note-mood">
//                       <div className="mood-rating">
//                         <span className="mood-emoji">{getMoodEmoji(note.moodRating)}</span>
//                         <span className="rating-text">Rating: {note.moodRating}/10</span>
//                       </div>
//                       <div className="mood-state">
//                         <Heart size={14} />
//                         {note.mood}
//                       </div>
//                     </div>
                    
//                     <div className="note-focus">
//                       <h5>Session Focus</h5>
//                       <p>{note.sessionFocus}</p>
//                     </div>
                    
//                     <div className="note-intervention">
//                       <div className="intervention-badge" style={{ backgroundColor: getInterventionColor(note.interventionsUsed) }}>
//                         {note.interventionsUsed}
//                       </div>
//                     </div>
                    
//                     <div className="note-progress">
//                       <div className="progress-badge">
//                         <TrendingUp size={14} />
//                         {note.progressAssessment}
//                       </div>
//                     </div>
                    
//                     {note.behavioralObservations && (
//                       <div className="note-additional">
//                         <h6>Behavioral Observations</h6>
//                         <p>{note.behavioralObservations}</p>
//                       </div>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             ) : (
//               <div className="no-notes">
//                 <p>No therapy notes available yet.</p>
//                 <p>Start adding notes from your client sessions to see them here.</p>
//               </div>
//             )}
//           </div>
//         </>
//       ) : (
//         <div className="reports-section">
//           <div className="reports-header">
//             <h3>Generate Reports</h3>
            
//             {/* Report Type Selection */}
//             <div className="report-type-selector">
//               <label>Report Type:</label>
//               <select 
//                 value={reportType} 
//                 onChange={(e) => setReportType(e.target.value)}
//                 className="report-type-dropdown"
//               >
//                 <option value="client-progress">My Client Progress Report</option>
//                 <option value="therapy-notes">My Therapy Notes Report</option>
//                 <option value="scheduled-calls">My Scheduled Calls Report</option>
//                 <option 
//                   value="all-therapy-notes" 
//                   disabled={userRole !== 'admin'}
//                   className={userRole !== 'admin' ? 'disabled-option' : ''}
//                 >
//                   All Therapy Notes Report {userRole !== 'admin' ? '(Admin Only)' : ''}
//                 </option>
//                 <option 
//                   value="all-scheduled-calls" 
//                   disabled={userRole !== 'admin'}
//                   className={userRole !== 'admin' ? 'disabled-option' : ''}
//                 >
//                   All Scheduled Calls Report {userRole !== 'admin' ? '(Admin Only)' : ''}
//                 </option>
//                 <option 
//                   value="all-therapists" 
//                   disabled={userRole !== 'admin'}
//                   className={userRole !== 'admin' ? 'disabled-option' : ''}
//                 >
//                   All Therapists Report {userRole !== 'admin' ? '(Admin Only)' : ''}
//                 </option>
//                 <option 
//                   value="all-clients" 
//                   disabled={userRole !== 'admin'}
//                   className={userRole !== 'admin' ? 'disabled-option' : ''}
//                 >
//                   All Clients Report {userRole !== 'admin' ? '(Admin Only)' : ''}
//                 </option>
//                 <option 
//                   value="system-overview" 
//                   disabled={userRole !== 'admin'}
//                   className={userRole !== 'admin' ? 'disabled-option' : ''}
//                 >
//                   System Overview Report {userRole !== 'admin' ? '(Admin Only)' : ''}
//                 </option>
//               </select>
//             </div>
            

            
//             <div className="date-range-selector">
//               <div className="date-input">
//                 <label>Start Date:</label>
//                 <input
//                   type="date"
//                   value={reportDateRange.startDate}
//                   onChange={(e) => setReportDateRange({...reportDateRange, startDate: e.target.value})}
//                 />
//               </div>
//               <div className="date-input">
//                 <label>End Date:</label>
//                 <input
//                   type="date"
//                   value={reportDateRange.endDate}
//                   onChange={(e) => setReportDateRange({...reportDateRange, endDate: e.target.value})}
//                 />
//               </div>
//               <button 
//                 className="generate-report-btn"
//                 onClick={generateReport}
//                 disabled={isGeneratingReport}
//               >
//                 {isGeneratingReport ? 'Generating...' : 'Generate Report'}
//               </button>
//             </div>
//           </div>

//           {reportData && (
//             <div className="report-content">
//               <div className="report-summary">
//                 <h4>{reportData.type}</h4>
//                 <div className="summary-grid">
//                   {(reportData.type === 'Client Progress Report' || reportData.type === 'My Client Progress Report') && (
//                     <>
//                       <div className="summary-card">
//                         <h5>Assigned Clients</h5>
//                         <span className="summary-number">{reportData.assignedClients}</span>
//                       </div>
//                       <div className="summary-card">
//                         <h5>Total Sessions</h5>
//                         <span className="summary-number">{reportData.totalSessions}</span>
//                       </div>
//                       <div className="summary-card">
//                         <h5>Average Progress</h5>
//                         <span className="summary-number">{reportData.averageProgress}%</span>
//                       </div>
//                     </>
//                   )}
                  
//                   {(reportData.type === 'Therapy Notes Report' || reportData.type === 'My Therapy Notes Report' || reportData.type === 'All Therapy Notes Report') && (
//                     <>
//                       <div className="summary-card">
//                         <h5>Total Notes</h5>
//                         <span className="summary-number">{reportData.totalNotes}</span>
//                       </div>
//                       <div className="summary-card">
//                         <h5>Average Mood Rating</h5>
//                         <span className="summary-number">{reportData.averageMoodRating}/10</span>
//                       </div>
//                     </>
//                   )}
                  
//                   {(reportData.type === 'Scheduled Calls Report' || reportData.type === 'My Scheduled Calls Report' || reportData.type === 'All Scheduled Calls Report') && (
//                     <>
//                       <div className="summary-card">
//                         <h5>Total Calls</h5>
//                         <span className="summary-number">{reportData.totalCalls}</span>
//                       </div>
//                       <div className="summary-card">
//                         <h5>Completed</h5>
//                         <span className="summary-number">{reportData.completedCalls}</span>
//                       </div>
//                       <div className="summary-card">
//                         <h5>Pending</h5>
//                         <span className="summary-number">{reportData.pendingCalls}</span>
//                       </div>
//                     </>
//                   )}
                  
//                   {reportData.type === 'All Therapists Report' && (
//                     <>
//                       <div className="summary-card">
//                         <h5>Total Therapists</h5>
//                         <span className="summary-number">{reportData.totalTherapists}</span>
//                       </div>
//                     </>
//                   )}
                  
//                   {reportData.type === 'All Clients Report' && (
//                     <>
//                       <div className="summary-card">
//                         <h5>Total Clients</h5>
//                         <span className="summary-number">{reportData.totalClients}</span>
//                       </div>
//                     </>
//                   )}
                  
//                   {reportData.type === 'System Overview Report' && (
//                     <>
//                       <div className="summary-card">
//                         <h5>Total Therapists</h5>
//                         <span className="summary-number">{reportData.totalTherapists}</span>
//                       </div>
//                       <div className="summary-card">
//                         <h5>Total Clients</h5>
//                         <span className="summary-number">{reportData.totalClients}</span>
//                       </div>
//                       <div className="summary-card">
//                         <h5>Total Sessions</h5>
//                         <span className="summary-number">{reportData.totalSessions}</span>
//                       </div>
//                       <div className="summary-card">
//                         <h5>Average Progress</h5>
//                         <span className="summary-number">{reportData.averageProgress}%</span>
//                       </div>
//                     </>
//                   )}
//                 </div>
//               </div>

//               <div className="report-actions">
//                 <button 
//                   className="download-pdf-btn"
//                   onClick={downloadPDFReport}
//                   disabled={!reportData}
//                 >
//                   <FileText size={16} />
//                   Download Report
//                 </button>
//               </div>

//               {/* Charts have been removed from reports for cleaner PDF downloads */}

//               <div className="detailed-report">
//                 <h4>Detailed Report</h4>
                
//                 {/* Client Progress Report Table */}
//                 {(reportData.type === 'Client Progress Report' || reportData.type === 'My Client Progress Report') && (
//                   <div className="report-table-container">
//                     <table className="report-table">
//                       <thead>
//                         <tr>
//                           <th>Client</th>
//                           <th>Total Sessions</th>
//                           <th>Progress (%)</th>
//                           <th>Last Session</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {reportData.clientProgress.map(client => (
//                           <tr key={client.id}>
//                             <td>
//                               <div className="client-info">
//                                 {client.clientImage && (
//                                   <img src={client.clientImage} alt={client.name} className="client-avatar" />
//                                 )}
//                                 <span>{client.name || client.email || `Client ${client.id.slice(0, 8)}`}</span>
//                               </div>
//                             </td>
//                             <td>{client.totalSessions}</td>
//                             <td>
//                               <div className="progress-bar">
//                                 <div className="progress-fill" style={{ width: `${client.progress}%` }}></div>
//                                 <span>{client.progress}%</span>
//                               </div>
//                               <div className="progress-rate">
//                                 <small>Rate: {client.progress >= 80 ? 'Excellent' : client.progress >= 60 ? 'Good' : client.progress >= 40 ? 'Fair' : 'Needs Improvement'}</small>
//                               </div>
//                             </td>
//                             <td>{client.lastSession}</td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 )}
                
//                 {/* Therapy Notes Report Table */}
//                 {(reportData.type === 'Therapy Notes Report' || reportData.type === 'My Therapy Notes Report' || reportData.type === 'All Therapy Notes Report') && (
//                   <div className="report-table-container">
//                     <table className="report-table">
//                       <thead>
//                         <tr>
//                           <th>Client</th>
//                           <th>Date</th>
//                           <th>Focus</th>
//                           <th>Mood Rating</th>
//                           <th>Interventions</th>
//                           <th>Progress (%)</th>
//                           <th>Therapist</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {reportData.notes.map(note => (
//                           <tr key={note.id}>
//                             <td>{note.clientName}</td>
//                             <td>{note.sessionDate}</td>
//                             <td>{note.sessionFocus}</td>
//                             <td>
//                               <span className="mood-rating">{note.moodRating}/10</span>
//                             </td>
//                             <td>{note.interventionsUsed}</td>
//                             <td>
//                               <div className="progress-bar">
//                                 <div className="progress-fill" style={{ width: `${note.progressPercentage}%` }}></div>
//                                 <span>{note.progressPercentage}%</span>
//                               </div>
//                             </td>
//                             <td>{note.therapistName || 'Unknown'}</td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 )}
                
//                 {/* Scheduled Calls Report Table */}
//                 {(reportData.type === 'Scheduled Calls Report' || reportData.type === 'My Scheduled Calls Report' || reportData.type === 'All Scheduled Calls Report') && (
//                   <div className="report-table-container">
//                     <table className="report-table">
//                       <thead>
//                         <tr>
//                           <th>Client</th>
//                           <th>Date</th>
//                           <th>Time</th>
//                           <th>Duration</th>
//                           <th>Status</th>
//                           {reportData.type === 'All Scheduled Calls Report' && <th>Therapist</th>}
//                           {reportData.type === 'All Scheduled Calls Report' && <th>Scheduled By</th>}
//                           <th>Notes</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {reportData.calls.map(call => (
//                           <tr key={call.id}>
//                             <td>{call.clientName || 'Unknown Client'}</td>
//                             <td>{call.scheduledTime?.toDate().toLocaleDateString()}</td>
//                             <td>{call.scheduledTime?.toDate().toLocaleTimeString()}</td>
//                             <td>{call.duration} min</td>
//                             <td>
//                               <span className={`status-badge status-${call.status}`}>
//                                 {call.status}
//                               </span>
//                             </td>
//                             {reportData.type === 'All Scheduled Calls Report' && <td>{call.therapistName || 'Unknown'}</td>}
//                             {reportData.type === 'All Scheduled Calls Report' && <td>{call.scheduledBy || 'Unknown'}</td>}
//                             <td>{call.notes || '-'}</td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 )}
                
//                 {/* All Therapists Report Table */}
//                 {reportData.type === 'All Therapists Report' && (
//                   <div className="report-table-container">
//                     <table className="report-table">
//                       <thead>
//                         <tr>
//                           <th>Therapist</th>
//                           <th>Role</th>
//                           <th>Assigned Clients</th>
//                           <th>Total Sessions</th>
//                           <th>Average Progress</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {reportData.therapists.map(therapist => (
//                           <tr key={therapist.id}>
//                             <td>
//                               <div className="therapist-info">
//                                 {therapist.therapistImage && (
//                                   <img src={therapist.therapistImage} alt={therapist.name} className="therapist-avatar" />
//                                 )}
//                                 <span>{therapist.name || therapist.email}</span>
//                               </div>
//                             </td>
//                             <td>
//                               <span className={`role-badge role-${therapist.role}`}>
//                                 {therapist.role}
//                               </span>
//                             </td>
//                             <td>{therapist.assignedClients}</td>
//                             <td>{therapist.totalSessions}</td>
//                             <td>
//                               <div className="progress-bar">
//                                 <div className="progress-fill" style={{ width: `${therapist.averageProgress}%` }}></div>
//                                 <span>{therapist.averageProgress}%</span>
//                               </div>
//                             </td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 )}
                
//                 {/* All Clients Report Table */}
//                 {reportData.type === 'All Clients Report' && (
//                   <div className="report-table-container">
//                     <table className="report-table">
//                       <thead>
//                         <tr>
//                           <th>Client</th>
//                           <th>Assigned Therapist</th>
//                           <th>Total Sessions</th>
//                           <th>Progress</th>
//                           <th>Last Session</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {reportData.clients.map(client => (
//                           <tr key={client.id}>
//                             <td>
//                               <div className="client-info">
//                                 {client.clientImage && (
//                                   <img src={client.clientImage} alt={client.name} className="client-avatar" />
//                                 )}
//                                 <span>{client.name || client.email}</span>
//                               </div>
//                             </td>
//                             <td>
//                               <span className={`therapist-assignment ${client.assignedTherapist === 'Unassigned' ? 'unassigned' : 'assigned'}`}>
//                                 {client.assignedTherapist}
//                               </span>
//                             </td>
//                             <td>{client.totalSessions}</td>
//                             <td>
//                               <div className="progress-bar">
//                                 <div className="progress-fill" style={{ width: `${client.progress}%` }}></div>
//                                 <span>{client.progress}%</span>
//                               </div>
//                               <div className="progress-rate">
//                                 <small>Rate: {client.progress >= 80 ? 'Excellent' : client.progress >= 40 ? 'Good' : client.progress >= 20 ? 'Fair' : 'Needs Improvement'}</small>
//                               </div>
//                             </td>
//                             <td>{client.lastSession}</td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 )}
//               </div>
//             </div>
//           )}
//         </div>
//       )}

//       {/* Schedule Call Modal */}
//       {showScheduleForm && (
//         <div className="modal-overlay" onClick={() => {
//           setShowScheduleForm(false);
//           setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
//           setSelectedClient(null);
//         }}>
//           <div className="modal" onClick={(e) => e.stopPropagation()}>
//             <h3>Schedule Call</h3>
//             <form onSubmit={(e) => {
//               e.preventDefault();
//               if (selectedClient) {
//                 scheduleCall(selectedClient);
//               } else {
//                 alert('Please select a client first');
//               }
//             }}>
//               <div className="form-group">
//                 <label>Select Client:</label>
//                 <select
//                   value={selectedClient?.id || ''}
//                   onChange={(e) => {
//                     const client = clients.find(c => c.id === e.target.value);
//                     setSelectedClient(client);
//                   }}
//                   required
//                 >
//                   <option value="">Choose a client...</option>
//                   {clients.map(client => (
//                     <option key={client.id} value={client.id}>
//                       {client.displayName}
//                     </option>
//                   ))}
//                 </select>
//               </div>
              
//               <div className="form-group">
//                 <label>Date:</label>
//                 <input
//                   type="date"
//                   value={scheduleForm.date}
//                   onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
//                   min={new Date().toISOString().split('T')[0]}
//                   required
//                 />
//               </div>
              
//               <div className="form-group">
//                 <label>Time:</label>
//                 <input
//                   type="time"
//                   value={scheduleForm.time}
//                   onChange={(e) => setScheduleForm({...scheduleForm, time: e.target.value})}
//                   required
//                 />
//               </div>
              
//               <div className="form-group">
//                 <label>Duration (minutes):</label>
//                 <select
//                   value={scheduleForm.duration}
//                   onChange={(e) => setScheduleForm({...scheduleForm, duration: e.target.value})}
//                 >
//                   <option value="15">15</option>
//                   <option value="30">30</option>
//                   <option value="45">45</option>
//                   <option value="60">60</option>
//                   <option value="90">90</option>
//                 </select>
//               </div>
              
//               <div className="form-group">
//                 <label>Notes:</label>
//                 <textarea
//                   value={scheduleForm.notes}
//                   onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
//                   placeholder="Optional notes about the call"
//                   rows={3}
//                 />
//               </div>
              
//               <div className="form-actions">
//                 <button type="submit" className="btn-primary">
//                   Schedule Call
//                 </button>
//                 <button 
//                   type="button" 
//                   className="btn-secondary"
//                   onClick={() => {
//                     setShowScheduleForm(false);
//                     setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
//                     setSelectedClient(null);
//                   }}
//                 >
//                   Cancel
//                 </button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default TherapistCalendar;
