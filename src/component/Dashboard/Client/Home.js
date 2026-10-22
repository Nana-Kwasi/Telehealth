import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Calendar, User, BookOpen, Clock, TrendingUp, Activity, Target, Bell, ChevronLeft, ChevronRight, Cloud, CloudRain, Search, AlertTriangle, Phone, X, Video, Heart, CreditCard, Plus, Pill } from 'lucide-react';
import './Home.css';
import { fetchAssignedTherapist } from '../../../utils/clientTherapistAssignment';
import { buildProgressMetrics, overallProgressScore } from '../../../utils/clientDashboardMetrics';
import { auth, db } from '../../../services/firestoreShim';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  serverTimestamp
} from '../../../services/firestoreShim';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../../utils/locationProfile';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import ClinicianStatus from '../../Common/ClinicianStatus';
import WeatherCard from '../../Common/WeatherCard';
import TodaysMedsCard from '../../Common/TodaysMedsCard';
import { api, getStoredUserId } from '../../../services/apiClient';
import patientHero from '../../../assets/patient-hero.jpg';
import { subscribeLocationUpdate, applyLocationPatch } from '../../../utils/locationBus';
import { resolveFileUrl } from '../../../utils/fileUrl';

import FaqSection from '../../Common/FaqSection';
import TransferConsentCard from '../../Common/TransferConsentCard';
// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

export default function ClientHome({ profile }) {
  const navigate = useNavigate();

  // Psychiatry: the medical patient home's Prescriptions card and shortcuts.
  const [isPsychiatry, setIsPsychiatry] = useState(false);
  const [rxList, setRxList] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await api('/api/v1/medpsych/me').catch(() => null);
      const psych = String(me?.careTrack || '').toLowerCase() === 'psychiatry';
      if (cancelled) return;
      setIsPsychiatry(psych);
      if (!psych) return;
      const uid = getStoredUserId();
      const rows = uid ? await api(`/api/v1/medical/prescriptions/patient/${uid}`).catch(() => []) : [];
      if (!cancelled) setRxList((rows || []).filter(r => r.status !== 'completed').slice(0, 3));
    })();
    return () => { cancelled = true; };
  }, []);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [clientData, setClientData] = useState({});
  const [locationProfile, setLocationProfile] = useState(null);
  // A location saved in Settings (or captured by the silent gate) has to reach
  // the card and the weather here without a reload.
  useEffect(
    () => subscribeLocationUpdate(patch => setLocationProfile(p => applyLocationPatch(p || profile, patch))),
    [profile],
  );
  const [therapistData, setTherapistData] = useState(null);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [progressScore, setProgressScore] = useState(null);
  const [goalsAchieved, setGoalsAchieved] = useState(0);
  const [goalsTotal, setGoalsTotal] = useState(0);
  const [clientGoals, setClientGoals] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [daysActive, setDaysActive] = useState(0);
  const [therapyNotes, setTherapyNotes] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [progressData, setProgressData] = useState([]);
  const [activityData, setActivityData] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextSession, setNextSession] = useState(null);
  const [currentGoal, setCurrentGoal] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Mood tracking state
  const [moodData, setMoodData] = useState({
    mood: '',
    moodValue: 5,
    journalEntry: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [moodHistory, setMoodHistory] = useState([]);
  const [isSubmittingMood, setIsSubmittingMood] = useState(false);
  // Review material starts collapsed — see the disclosure below.
  const [showProgress, setShowProgress] = useState(false);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [moodAnswers, setMoodAnswers] = useState({});
  const [moodChartData, setMoodChartData] = useState([]);
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Notification system state
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [notificationQueue, setNotificationQueue] = useState([]);
  const [lastSeenTimestamps, setLastSeenTimestamps] = useState({
    worksheets: null,
    notes: null,
    resources: null
  });
  const [newContentCounts, setNewContentCounts] = useState({
    worksheets: 0,
    notes: 0,
    resources: 0
  });
  
  const currentUser = auth.currentUser;

  // Calendar functions
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getLastDaysOfPrevMonth = (date) => {
    const firstDay = getFirstDayOfMonth(date);
    const lastMonth = new Date(date.getFullYear(), date.getMonth() - 1, 0);
    const days = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push(lastMonth.getDate() - i);
    }
    return days;
  };

  const getFirstDaysOfNextMonth = (date) => {
    const daysInMonth = getDaysInMonth(date);
    const firstDay = getFirstDayOfMonth(date);
    const totalCells = Math.ceil((daysInMonth + firstDay) / 7) * 7;
    const remainingDays = totalCells - (daysInMonth + firstDay);
    const days = [];
    for (let i = 1; i <= remainingDays; i++) {
      days.push(i);
    }
    return days;
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date) => {
    return selectedDate.getDate() === date.getDate() && 
           selectedDate.getMonth() === date.getMonth() && 
           selectedDate.getFullYear() === date.getFullYear();
  };

  // Chart.js data preparation functions
  const prepareProgressChartData = (progressData) => {
    return {
      labels: progressData.map(item => item.week),
      datasets: [
        {
          label: 'Progress %',
          data: progressData.map(item => item.progress),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3B82F6',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
        }
      ]
    };
  };

  const prepareActivityChartData = (activityData) => {
    return {
      labels: activityData.map(item => item.day),
      datasets: [
        {
          label: 'Messages',
          data: activityData.map(item => item.messages),
          backgroundColor: '#10B981',
          borderColor: '#10B981',
          borderWidth: 1,
        },
        {
          label: 'Sessions',
          data: activityData.map(item => item.sessions),
          backgroundColor: '#3B82F6',
          borderColor: '#3B82F6',
          borderWidth: 1,
        },
        {
          label: 'Exercises',
          data: activityData.map(item => item.exercises),
          backgroundColor: '#F59E0B',
          borderColor: '#F59E0B',
          borderWidth: 1,
        }
      ]
    };
  };

  // Mood Distribution renders the client's OWN mood check-ins, bucketed by
  // intensity (Very Low … Very High). It used to read `note.mood` off the therapy
  // notes — a field those notes never carry — so the pie was empty for every
  // client even when they had logged moods. `moodChartData` is the same source the
  // Daily Mood Progress donut beside it already uses, which is why that donut
  // showed a value while this chart showed nothing.
  const prepareMoodPieChartData = (buckets) => {
    const data = Array.isArray(buckets) ? buckets.filter(b => b && b.count > 0) : [];
    return {
      labels: data.map(b => b.category),
      datasets: [
        {
          data: data.map(b => b.count),
          backgroundColor: data.map(b => b.color || '#6B7280'),
          borderColor: '#ffffff',
          borderWidth: 2,
        }
      ]
    };
  };

  const prepareProgressDoughnutData = (progressScore) => {
    return {
      labels: ['Completed', 'Remaining'],
      datasets: [
        {
          data: [progressScore, 100 - progressScore],
          backgroundColor: ['#10B981', '#E5E7EB'],
          borderColor: ['#10B981', '#E5E7EB'],
          borderWidth: 0,
          cutout: '70%',
        }
      ]
    };
  };

  // Chart.js options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: '500'
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        padding: 12,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          font: {
            size: 11,
            weight: '500'
          },
          color: '#6B7280'
        }
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 11,
            weight: '500'
          },
          color: '#6B7280'
        }
      }
    }
  };

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: '500'
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        padding: 12,
      }
    }
  };

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch client data and calculate metrics
  useEffect(() => {
    if (!currentUser) return;

    const fetchClientData = async () => {
      try {
        setIsLoading(true);
        console.log('🔍 Home: Starting data fetch for user:', currentUser.uid);
        
        // Get client ID from multiple sources
        let clientId = localStorage.getItem('th.clientId');
        
        // If not in localStorage, check auth collection
        if (!clientId) {
          const authDoc = await getDoc(doc(db, 'auth', currentUser.uid));
          if (authDoc.exists() && authDoc.data().clientId) {
            clientId = authDoc.data().clientId;
            localStorage.setItem('th.clientId', clientId);
          }
        }
        
        // Fallback to uid if still no clientId
        if (!clientId) {
          clientId = currentUser.uid;
        }
        
        console.log('📋 Home: Client ID:', clientId);
        
        // Fetch client profile data
        console.log('📖 Home: Fetching client document from clients collection...');
        let clientDoc = await getDoc(doc(db, 'clients', clientId));
        
        // If not found with clientId, try with uid
        if (!clientDoc.exists() && clientId !== currentUser.uid) {
          console.log('📖 Home: Trying with auth UID...');
          clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
          if (clientDoc.exists()) {
            clientId = currentUser.uid;
            localStorage.setItem('th.clientId', clientId);
          }
        }
        
        if (clientDoc.exists()) {
          const clientProfile = clientDoc.data();
          console.log('✅ Home: Client document found:', clientProfile);
          console.log('🔗 Home: Assigned therapist field:', clientProfile.assignedTherapist);
          setClientData(clientProfile);
          const authLoc = await fetchAuthLocationProfile(currentUser.uid);
          setLocationProfile(mergeLocationProfile(profile, authLoc, clientProfile));

          // Fetch assigned therapist
          if (clientProfile.assignedTherapist) {
            console.log('👨‍⚕️ Home: Fetching therapist data for ID:', clientProfile.assignedTherapist);
            
            // Try therapistt collection first
            const therapistDoc = await getDoc(doc(db, 'therapistt', clientProfile.assignedTherapist));
            if (therapistDoc.exists()) {
              const therapistData = { id: therapistDoc.id, ...therapistDoc.data() };
              console.log('✅ Home: Therapist found in therapistt collection:', therapistData);
              setTherapistData(therapistData);
            } else {
              console.log('❌ Home: Therapist not found in therapistt collection, trying therapists collection...');
              
              // Try therapists collection as fallback
              const therapistDoc2 = await getDoc(doc(db, 'therapists', clientProfile.assignedTherapist));
              if (therapistDoc2.exists()) {
                const therapistData = { id: therapistDoc2.id, ...therapistDoc2.data() };
                console.log('✅ Home: Therapist found in therapists collection:', therapistData);
                setTherapistData(therapistData);
              } else {
                console.log('❌ Home: Therapist not found in therapists collection either');
                
                // Let's also check what therapists exist
                console.log('🔍 Home: Checking what therapists exist...');
                const allTherapistsQuery = query(collection(db, 'therapistt'));
                const allTherapistsSnapshot = await getDocs(allTherapistsQuery);
                console.log('📋 Home: Therapists in therapistt collection:', allTherapistsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
                
                const allTherapistsQuery2 = query(collection(db, 'therapists'));
                const allTherapistsSnapshot2 = await getDocs(allTherapistsQuery2);
                console.log('📋 Home: Therapists in therapists collection:', allTherapistsSnapshot2.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
              }
            }
          } else {
            // `assignedTherapist` is a Firestore-era field the REST backend never
            // writes, so it is empty even for a client who has picked and paid for
            // a therapist. Fall back to the assignments table, which is the real
            // record — otherwise the dashboard keeps offering "Find a Therapist"
            // to someone who already has one.
            const assigned = await fetchAssignedTherapist(clientId);
            if (assigned) setTherapistData(assigned);
          }
        } else {
          console.log('❌ Home: Client document not found for ID:', clientId);
          // Create a minimal client data object from auth data
          const authDoc = await getDoc(doc(db, 'auth', currentUser.uid));
          if (authDoc.exists()) {
            const authData = authDoc.data();
            const fallbackClient = {
              clientName: authData.name || profile?.name || 'Client',
              displayName: authData.name || profile?.name || 'Client',
              email: authData.email || profile?.email,
              status: authData.status || 'active',
              ...authData,
            };
            setClientData(fallbackClient);
            setLocationProfile(mergeLocationProfile(profile, authData, fallbackClient));
            console.log('✅ Home: Using auth data as fallback');
          }
          // A missing client document says nothing about whether a therapist was
          // chosen — that lives in the assignments table. Check it here too, or
          // this branch always shows the "Find a Therapist" prompt.
          const assigned = await fetchAssignedTherapist(currentUser.uid);
          if (assigned) setTherapistData(assigned);
        }

        // Fetch therapy notes for this client from the subcollection
        let therapyNotesSnapshot;
        try {
          const therapyNotesQuery = query(
            collection(db, 'clients', clientId, 'therapyNotes'),
            orderBy('sessionDate', 'desc')
          );
          therapyNotesSnapshot = await getDocs(therapyNotesQuery);
        } catch (error) {
          console.warn('Error fetching therapy notes from subcollection, trying main collection:', error);
          // Fallback to main therapyNotes collection
          try {
            const therapyNotesQuery = query(
              collection(db, 'therapyNotes'),
              where('clientId', '==', clientId),
              orderBy('sessionDate', 'desc')
            );
            therapyNotesSnapshot = await getDocs(therapyNotesQuery);
          } catch (err) {
            console.error('Error fetching therapy notes:', err);
            therapyNotesSnapshot = { docs: [] };
          }
        }
        const notes = (therapyNotesSnapshot && therapyNotesSnapshot.docs ? therapyNotesSnapshot.docs : []).map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTherapyNotes(notes);

        // Calculate sessions completed from scheduledCalls
        let completedSessionsSnapshot;
        try {
          const completedSessionsQuery = query(
            collection(db, 'scheduledCalls'),
            where('clientId', '==', clientId),
            where('status', '==', 'completed')
          );
          completedSessionsSnapshot = await getDocs(completedSessionsQuery);
        } catch (error) {
          console.warn('Error fetching completed sessions:', error);
          completedSessionsSnapshot = { docs: [] };
        }
        setSessionsCompleted(completedSessionsSnapshot ? completedSessionsSnapshot.docs.length : 0);

        // All scheduled calls (not just completed) — the attendance ratio needs the
        // denominator too.
        try {
          const allSessionsSnap = await getDocs(
            query(collection(db, 'scheduledCalls'), where('clientId', '==', clientId)),
          );
          setAllSessions(allSessionsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (sessErr) {
          console.warn('All sessions:', sessErr?.message);
          setAllSessions([]);
        }

        // Progress Score is now the mean of the dashboard metrics that actually
        // have data (see utils/clientDashboardMetrics.js). It used to be scored from
        // mood/progressAssessment fields that clinical notes do not carry, so web
        // showed 0% while mobile's unrelated formula showed 3% for the same client.

        // Goals come from the therapist's goal list (therapist_client_goals_v2),
        // which has a real status and a 0-100 progress value.
        //
        // This used to count ✔️ EMOJI characters inside `note.goalsReviewed` — a
        // field that does not exist on a therapy note — so the tile was incapable
        // of ever showing anything but 0, for every client on the platform.
        try {
          const goalsSnap = await getDocs(collection(db, 'clients', clientId, 'goals'));
          const goals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const achieved = goals.filter(g =>
            String(g.status || '').toLowerCase() === 'completed' || Number(g.progress) >= 100
          ).length;
          setGoalsAchieved(achieved);
          setGoalsTotal(goals.length);
          setClientGoals(goals);
        } catch (goalsErr) {
          console.warn('Error fetching goals:', goalsErr?.message);
          setGoalsAchieved(0);
          setGoalsTotal(0);
        }

        // Get current goal from latest therapy note
        if (notes.length > 0) {
          const latestNote = notes[0];
          if (latestNote.goalsReviewed && typeof latestNote.goalsReviewed === 'string') {
            // Find unachieved goals (those with ❌ or no checkmark)
            const goals = latestNote.goalsReviewed.split(/✔️|❌/);
            const unachievedGoals = goals.filter(goal => 
              goal.trim() && !goal.includes('✔️') && !goal.includes('❌')
            );
            if (unachievedGoals.length > 0) {
              setCurrentGoal(unachievedGoals[0].trim());
            } else {
              setCurrentGoal('All goals achieved!');
            }
          } else {
            setCurrentGoal('No current goal');
          }
        } else {
          setCurrentGoal('No current goal');
        }

        // Calculate days active from login logs
        const loginLogsQuery = query(
          collection(db, 'loginLogs'),
          where('userId', '==', currentUser.uid)
        );
        const loginLogsSnapshot = await getDocs(loginLogsQuery);
        const uniqueDays = new Set();
        loginLogsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.timestamp) {
            const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
            uniqueDays.add(date.toDateString());
          }
        });
        setDaysActive(uniqueDays.size);

        // Generate progress data for charts
        const progressChartData = generateProgressChartData(notes);
        setProgressData(progressChartData);

        // Generate activity data
        const activityChartData = await generateActivityData(clientId);
        setActivityData(activityChartData);

        // Booked sessions are the client's most visible action, but recent
        // activity was built only from notes and mood — so scheduling a call
        // changed nothing on this screen.
        let clientCalls = [];
        try {
          const callsSnap = await getDocs(query(
            collection(db, 'scheduledCalls'),
            where('clientId', '==', clientId),
          ));
          clientCalls = callsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (error) {
          console.warn('Error fetching scheduled calls for activity:', error);
        }

        // Generate recent activities
        const activities = generateRecentActivities(notes, activityChartData, clientCalls);
        setRecentActivities(activities);

        // Fetch next session
        let nextSessionSnapshot;
        try {
          const nextSessionQuery = query(
            collection(db, 'scheduledCalls'),
            where('clientId', '==', clientId),
            where('status', '==', 'scheduled')
          );
          nextSessionSnapshot = await getDocs(nextSessionQuery);
        } catch (error) {
          console.warn('Error fetching next session:', error);
          nextSessionSnapshot = { docs: [], empty: true };
        }
        if (nextSessionSnapshot && !nextSessionSnapshot.empty) {
          // Filter for future sessions and sort by scheduledTime in JavaScript
          const now = new Date();
          const sessions = nextSessionSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })).filter(session => {
            const sessionTime = session.scheduledTime?.toDate ? session.scheduledTime.toDate() : new Date(session.scheduledTime);
            return sessionTime >= now;
          }).sort((a, b) => {
            const timeA = a.scheduledTime?.toDate ? a.scheduledTime.toDate() : new Date(a.scheduledTime);
            const timeB = b.scheduledTime?.toDate ? b.scheduledTime.toDate() : new Date(b.scheduledTime);
            return timeA - timeB;
          });
          
          if (sessions.length > 0) {
            setNextSession(sessions[0]);
          }
        }

        // Fetch notifications
        await fetchNotifications(clientId);

      } catch (error) {
        console.error('Error fetching client data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClientData();
    fetchMoodHistory();
    
    // Load last seen timestamps
    loadLastSeenTimestamps();
    
    // Check if should show mood modal
    if (shouldShowMoodModal()) {
      setShowMoodModal(true);
    }
  }, [currentUser]);

  // Check for new content when component mounts and user is loaded
  useEffect(() => {
    if (currentUser && !isLoading && clientData) {
      // Use the clientId from clientData or fallback
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      checkForNewContent(clientId);
    }
  }, [currentUser, isLoading, clientData]);

  // Calculate progress score from client data (PHQ-9 scores, etc.)
  const calculateProgressScoreFromClientData = (clientData) => {
    if (!clientData) return 0;

    let score = 0;
    let factors = 0;

    // Calculate PHQ-9 score (lower is better, so we invert it)
    if (clientData.phq9) {
      const phq9Values = Object.values(clientData.phq9).filter(val => typeof val === 'number');
      if (phq9Values.length > 0) {
        const phq9Total = phq9Values.reduce((sum, val) => sum + val, 0);
        const phq9Score = Math.max(0, 100 - (phq9Total * 10)); // Convert to 0-100 scale
        score += phq9Score * 0.4;
        factors += 0.4;
      }
    }

    // Physical health score
    const healthScores = {
      'Poor': 20,
      'Fair': 40,
      'Good': 70,
      'Very Good': 85,
      'Excellent': 95
    };
    if (clientData.physicalHealth && healthScores[clientData.physicalHealth]) {
      score += healthScores[clientData.physicalHealth] * 0.2;
      factors += 0.2;
    }

    // Sleep quality score
    const sleepScores = {
      'Poor': 20,
      'Fair': 40,
      'Good': 70,
      'Very Good': 85,
      'Excellent': 95
    };
    if (clientData.sleep && sleepScores[clientData.sleep]) {
      score += sleepScores[clientData.sleep] * 0.2;
      factors += 0.2;
    }

    // Exercise frequency score
    const exerciseScores = {
      'Never': 10,
      'Rarely': 25,
      '1-2 times per week': 50,
      '2-3 times per week': 70,
      '3-4 times per week': 85,
      'Daily': 95
    };
    if (clientData.exercise && exerciseScores[clientData.exercise]) {
      score += exerciseScores[clientData.exercise] * 0.2;
      factors += 0.2;
    }

    return factors > 0 ? Math.round(score / factors) : 50; // Default to 50 if no data
  };

  // Calculate progress score from therapy notes (for future use)
  const calculateProgressScore = (notes) => {
    if (notes.length === 0) return 0;

    const moodScores = {
      'Depressed': 15, 'Sad': 25, 'Anxious': 35, 'Stressed': 45, 'Angry': 40,
      'Neutral': 60, 'Calm': 80, 'Hopeful': 85, 'Optimistic': 90, 'Excited': 95
    };

    const progressAssessmentScores = {
      'Worsened': 10, 'Slight Decline': 25, 'No Change': 40,
      'Slight Improvement': 60, 'Improved': 80, 'Significantly Improved': 95
    };

    let totalScore = 0;
    let validNotes = 0;

    notes.forEach(note => {
      let noteScore = 0;
      let factors = 0;

      // Use mood and moodRating
      if (note.mood && moodScores[note.mood] !== undefined) {
        noteScore += moodScores[note.mood] * 0.5; // Higher weight for mood
        factors++;
      } else if (note.moodRating !== undefined) {
        noteScore += (note.moodRating * 10) * 0.5; // Scale 1-10 to 10-100
        factors++;
      }

      // Use progressAssessment
      if (note.progressAssessment && progressAssessmentScores[note.progressAssessment] !== undefined) {
        noteScore += progressAssessmentScores[note.progressAssessment] * 0.5; // Higher weight for assessment
        factors++;
      }

      if (factors > 0) {
        totalScore += noteScore / factors;
        validNotes++;
      }
    });

    return validNotes > 0 ? Math.round(totalScore / validNotes) : 0;
  };

  // Generate progress chart data
  const generateProgressChartData = (notes) => {
    const last12Weeks = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - (i * 7));
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekNotes = notes.filter(note => {
        const noteDate = new Date(note.sessionDate);
        return noteDate >= weekStart && noteDate <= weekEnd;
      });

      const weekProgress = weekNotes.length > 0 ? 
        calculateProgressScore(weekNotes) : 0;

      last12Weeks.push({
        week: `Week ${12 - i}`,
        progress: weekProgress,
        sessions: weekNotes.length
      });
    }

    return last12Weeks;
  };

  // Generate activity data
  const generateActivityData = async (clientId) => {
    const activities = [];
    
    try {
      // Get message activity
      const messagesQuery = query(
        collection(db, 'client_chats', clientId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const messagesSnapshot = await getDocs(messagesQuery);
      const messages = messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        type: 'message'
      }));

      // Get video call activity
      const callsQuery = query(
        collection(db, 'scheduledCalls'),
        where('clientId', '==', clientId)
      );
      const callsSnapshot = await getDocs(callsQuery);
      const calls = callsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        type: 'session'
      })).sort((a, b) => {
        const timeA = a.scheduledTime?.toDate ? a.scheduledTime.toDate() : new Date(a.scheduledTime);
        const timeB = b.scheduledTime?.toDate ? b.scheduledTime.toDate() : new Date(b.scheduledTime);
        return timeB - timeA; // desc order
      }).slice(0, 20); // limit to 20

      // Combine and sort activities
      const allActivities = [...messages, ...calls].sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.scheduledTime);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.scheduledTime);
        return timeB - timeA;
      });

      // Group by day for chart
      const dailyActivity = {};
      allActivities.forEach(activity => {
        const date = activity.createdAt?.toDate ? 
          activity.createdAt.toDate() : 
          new Date(activity.scheduledTime);
        const dayKey = date.toDateString();
        
        if (!dailyActivity[dayKey]) {
          dailyActivity[dayKey] = { messages: 0, sessions: 0, exercises: 0 };
        }
        
        if (activity.type === 'message') {
          dailyActivity[dayKey].messages++;
        } else if (activity.type === 'session') {
          dailyActivity[dayKey].sessions++;
        }
      });

      // Convert to chart data (last 7 days)
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toDateString();
        const dayData = dailyActivity[dayKey] || { messages: 0, sessions: 0, exercises: 0 };
        
        activities.push({
          day: date.toLocaleDateString('en-US', { weekday: 'short' }),
          messages: dayData.messages,
          sessions: dayData.sessions,
          exercises: dayData.exercises
        });
      }

    } catch (error) {
      console.error('Error generating activity data:', error);
    }

    return activities;
  };

  // Generate recent activities
  const generateRecentActivities = (notes, activityData, scheduledCalls = []) => {
    const activities = [];

    // Sessions the client booked or had confirmed.
    (scheduledCalls || []).slice(0, 5).forEach((call) => {
      const raw = call.scheduledTime;
      const when = raw?.toDate?.() || (raw ? new Date(raw) : null);
      if (!when || Number.isNaN(when.getTime())) return;
      const status = String(call.status || '').toLowerCase();
      activities.push({
        type: 'session',
        text: status === 'pending'
          ? 'Requested a session with your therapist'
          : status === 'declined'
            ? 'A session request was declined'
            : `Session scheduled for ${when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        time: getTimeAgo(call.createdAt?.toDate?.() || new Date(call.createdAt || when)),
        sortAt: when.getTime(),
        icon: '📅',
      });
    });

    // Add recent therapy sessions
    notes.slice(0, 3).forEach(note => {
      const sessionDate = new Date(note.sessionDate);
      const timeAgo = getTimeAgo(sessionDate);
      
      activities.push({
        type: 'session',
        text: `Completed therapy session`,
        time: timeAgo,
        icon: '🎯'
      });
    });

    // Real activity only. These two entries used to be pushed unconditionally —
    // literally labelled "simulated" — so a brand-new client was told they had
    // received a message and completed a breathing exercise that never happened.
    // Anything shown here now comes from data the client actually generated.
    (moodHistory || []).slice(0, 3).forEach((m) => {
      const when = m.createdAt?.toDate?.() || (m.createdAt ? new Date(m.createdAt) : null);
      activities.push({
        type: 'mood',
        text: `Logged a check-in${m.mood ? ` — feeling ${String(m.mood).toLowerCase()}` : ''}`,
        time: when ? getTimeAgo(when) : 'Recently',
        icon: '🧘',
      });
    });

    if (nextSession) {
      const when = nextSession.scheduledTime?.toDate?.()
        || (nextSession.scheduledTime ? new Date(nextSession.scheduledTime) : null);
      activities.push({
        type: 'session',
        text: `Session scheduled with ${nextSession.therapistName || 'your therapist'}`,
        time: when ? when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Upcoming',
        icon: '📅',
      });
    }

    return activities.slice(0, 5);
  };

  // Get time ago string
  const getTimeAgo = (date) => {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  // Fetch notifications
  const fetchNotifications = async (clientId) => {
    try {
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('clientId', '==', clientId)
      );
      const notificationsSnapshot = await getDocs(notificationsQuery);
      const notificationsData = notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return timeB - timeA; // desc order
      }).slice(0, 10); // limit to 10
      
      setNotifications(notificationsData);
      setUnreadCount(notificationsData.filter(n => n.unread).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: 'numeric', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const therapistName = therapistData?.name || clientData?.assignedTherapistName || 'Your therapist';

  const dashboardCards = [
    {
      title: 'Messages',
      description: 'Chat with your therapist',
      icon: MessageSquare,
      color: 'bg-blue-500',
      value: `${unreadCount} unread`,
      trend: unreadCount > 0 ? `+${unreadCount} new` : 'No new messages'
    },
    {
      title: 'Schedule',
      description: 'Book and manage sessions',
      icon: Calendar,
      color: 'bg-green-500',
      value: nextSession ? 
        `Next: ${new Date(nextSession.scheduledTime?.toDate ? nextSession.scheduledTime.toDate() : nextSession.scheduledTime).toLocaleDateString()}` : 
        'No upcoming sessions',
      trend: nextSession ? 'Scheduled' : 'Schedule one'
    },
    {
      title: 'Profile',
      description: 'Update your preferences',
      icon: User,
      color: 'bg-purple-500',
      value: `${progressScore}% complete`,
      trend: progressScore > 0 ? `+${Math.floor(progressScore / 10)}% this week` : 'Start your journey'
    },
    {
      title: 'Resources',
      description: 'Self-help tools and articles',
      icon: BookOpen,
      color: 'bg-orange-500',
      value: 'Available',
      trend: 'Access anytime'
    }
  ];

  // Progress bars, built from data somebody actually recorded. The previous
  // version scored these by keyword-matching the free text of therapy notes, so a
  // note that never used the word "stress" scored 100% stress management and a
  // client with no ratings landed on a hard-coded 40% sleep quality. See
  // utils/clientDashboardMetrics.js for the full account.
  const generateProgressMetrics = () =>
    buildProgressMetrics({
      moodEntries: moodHistory,
      notes: therapyNotes,
      goals: clientGoals,
      sessions: allSessions,
    });

  const calculateMoodImprovementFromClientData = (clientData) => {
    if (!clientData) return 0;
    
    // Use PHQ-9 scores to determine mood improvement
    if (clientData.phq9) {
      const phq9Values = Object.values(clientData.phq9).filter(val => typeof val === 'number');
      if (phq9Values.length > 0) {
        const phq9Total = phq9Values.reduce((sum, val) => sum + val, 0);
        // Lower PHQ-9 scores indicate better mood
        return Math.max(0, 100 - (phq9Total * 8));
      }
    }
    
    // Fallback based on depression/anxiety levels
    const depressionScores = {
      'Never': 90,
      'Rarely': 70,
      'Sometimes': 50,
      'Often': 30,
      'Always': 10
    };
    
    const anxietyScores = {
      'Never': 90,
      'Rarely': 70,
      'Sometimes': 50,
      'Often': 30,
      'Always': 10
    };
    
    const depressionScore = depressionScores[clientData.depression] || 50;
    const anxietyScore = anxietyScores[clientData.anxiety] || 50;
    
    return Math.round((depressionScore + anxietyScore) / 2);
  };

  const calculateMoodImprovement = (notes) => {
    if (notes.length < 2) return 0; // Need at least 2 notes to show improvement
    
    const moodScores = {
      'Depressed': 10, 'Sad': 20, 'Anxious': 30, 'Stressed': 40, 'Angry': 35,
      'Neutral': 50, 'Calm': 70, 'Hopeful': 80, 'Optimistic': 90, 'Excited': 95
    };
    
    // Compare latest mood with earlier mood to show improvement
    const latestNote = notes[0];
    const earlierNote = notes[notes.length - 1];
    
    const latestMoodScore = moodScores[latestNote.mood] || (latestNote.moodRating * 10) || 50;
    const earlierMoodScore = moodScores[earlierNote.mood] || (earlierNote.moodRating * 10) || 50;
    
    // Calculate percentage improvement
    if (earlierMoodScore === 0) return latestMoodScore > 0 ? 100 : 0;
    const improvement = ((latestMoodScore - earlierMoodScore) / earlierMoodScore) * 100;
    
    return Math.round(Math.max(0, Math.min(100, 50 + improvement / 2))); // Scale to 0-100, 50 as baseline
  };

  // Calculate stress management from client data
  const calculateStressManagementFromClientData = (clientData) => {
    if (!clientData) return 0;
    
    // Use anxiety and stress levels
    const anxietyScores = {
      'Never': 90,
      'Rarely': 70,
      'Sometimes': 50,
      'Often': 30,
      'Always': 10
    };
    
    const anxietyScore = anxietyScores[clientData.anxiety] || 50;
    
    // Factor in support system
    const supportScores = {
      'Very supportive': 20,
      'Somewhat supportive': 40,
      'Not very supportive': 60,
      'Not supportive at all': 80
    };
    
    const supportScore = supportScores[clientData.supportSystem] || 50;
    
    // Factor in crisis support
    const crisisSupportScore = clientData.crisisSupport === 'Yes, multiple people' ? 20 : 
                              clientData.crisisSupport === 'Yes, one person' ? 40 : 60;
    
    return Math.round((anxietyScore + supportScore + crisisSupportScore) / 3);
  };

  const calculateStressManagement = (notes) => {
    if (notes.length === 0) return 0;
    
    const stressKeywords = ['stress', 'anxiety', 'worried', 'overwhelmed', 'tense'];
    const calmKeywords = ['calm', 'relaxed', 'peaceful', 'coping', 'mindfulness'];
    
    const recentNotes = notes.slice(0, 5); // Look at recent notes for current state
    
    let totalStressScore = 0;
    recentNotes.forEach(note => {
      const content = `${note.behavioralObservations || ''} ${note.sessionFocus || ''} ${note.clientResponse || ''}`.toLowerCase();
      let noteStressScore = 0;
      
      stressKeywords.forEach(keyword => {
        if (content.includes(keyword)) noteStressScore += 20;
      });
      calmKeywords.forEach(keyword => {
        if (content.includes(keyword)) noteStressScore -= 10;
      });
      
      totalStressScore += Math.max(0, noteStressScore); // Ensure non-negative
    });
    
    // Scale to 0-100, where higher is better stress management
    return Math.round(Math.max(0, 100 - Math.min(100, totalStressScore / recentNotes.length)));
  };

  // Calculate sleep quality from client data
  const calculateSleepQualityFromClientData = (clientData) => {
    if (!clientData) return 0;
    
    const sleepScores = {
      'Poor': 20,
      'Fair': 40,
      'Good': 70,
      'Very Good': 85,
      'Excellent': 95
    };
    
    return sleepScores[clientData.sleep] || 50;
  };

  const calculateSleepQuality = (notes) => {
    if (notes.length === 0) return 0;
    
    // Look for sleep-related content in therapy notes
    const sleepKeywords = ['sleep', 'insomnia', 'rest', 'tired', 'fatigue', 'bedtime'];
    const goodSleepKeywords = ['well-rested', 'good sleep', 'slept well', 'rested'];
    
    let sleepScore = 50; // Default baseline
    let sleepMentions = 0;
    
    notes.forEach(note => {
      const content = `${note.sessionFocus || ''} ${note.homework || ''} ${note.nextSessionFocus || ''}`.toLowerCase();
      
      sleepKeywords.forEach(keyword => {
        if (content.includes(keyword)) {
          sleepMentions++;
          if (goodSleepKeywords.some(good => content.includes(good))) {
            sleepScore += 10; // Positive sleep mention
          } else {
            sleepScore -= 5; // Negative sleep mention
          }
        }
      });
    });
    
    // If no sleep mentions, use mood rating as proxy
    if (sleepMentions === 0) {
      // Unrated notes are missing data, not a mid-scale 5 — averaging a
      // fabricated 5 in made a client with no ratings look 'average'.
      const ratedNotes = notes.filter((note) => Number.isFinite(Number(note.moodRating)));
      const avgMoodRating = ratedNotes.length
        ? ratedNotes.reduce((sum, note) => sum + Number(note.moodRating), 0) / ratedNotes.length
        : null;
      sleepScore = Math.round(40 + (avgMoodRating * 5)); // Scale 1-10 to 40-90
    }
    
    return Math.max(0, Math.min(100, sleepScore));
  };

  // Calculate goal achievement from client data
  const calculateGoalAchievementFromClientData = (clientData) => {
    if (!clientData) return 0;
    
    // Since we don't have therapy notes yet, we'll use a placeholder
    // This would typically be calculated from actual therapy session data
    const therapyGoals = clientData.therapyGoals || [];
    if (therapyGoals.length === 0) return 0;
    
    // For now, return a placeholder based on how long they've been in therapy
    const startDate = new Date(clientData.startedAt);
    const daysInTherapy = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
    const weeksInTherapy = Math.floor(daysInTherapy / 7);
    
    // Assume 10% progress per week, capped at 80%
    return Math.min(80, weeksInTherapy * 10);
  };

  const calculateGoalAchievement = (notes) => {
    if (notes.length === 0) return 0;
    
    let totalGoals = 0;
    let achievedGoals = 0;
    
    notes.forEach(note => {
      if (note.goalsReviewed && typeof note.goalsReviewed === 'string') {
        // Count total goals by splitting on checkmarks and crosses
        const goals = note.goalsReviewed.split(/✔️|❌/);
        totalGoals += Math.max(0, goals.length - 1); // Number of goals is one less than split parts
        
        // Count achieved goals (those with ✔️)
        const checkmarks = (note.goalsReviewed.match(/✔️/g) || []).length;
        achievedGoals += checkmarks;
      }
    });
    
    return totalGoals > 0 ? Math.round((achievedGoals / totalGoals) * 100) : 0;
  };

  const progressMetrics = generateProgressMetrics();

  // Keep the headline KPI in step with the bars beneath it — same inputs, so the
  // two can never disagree.
  useEffect(() => {
    setProgressScore(overallProgressScore(progressMetrics));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodHistory, therapyNotes, clientGoals, allSessions]);

  // Mood tracking functions
  const moodEmojis = [
    { emoji: '😢', label: 'Very Sad', value: 1 },
    { emoji: '😔', label: 'Sad', value: 2 },
    { emoji: '😐', label: 'Neutral', value: 3 },
    { emoji: '😌', label: 'Calm', value: 4 },
    { emoji: '😊', label: 'Good', value: 5 },
    { emoji: '😄', label: 'Happy', value: 6 },
    { emoji: '🤗', label: 'Very Happy', value: 7 },
    { emoji: '😰', label: 'Anxious', value: 8 },
    { emoji: '😴', label: 'Tired', value: 9 },
    { emoji: '😤', label: 'Frustrated', value: 10 }
  ];

  const moodQuestions = [
    {
      id: 'mood',
      question: 'How are you feeling today?',
      type: 'emoji',
      options: moodEmojis
    },
    {
      id: 'moodScale',
      question: 'Rate your overall mood on a scale of 1-10',
      type: 'slider',
      min: 1,
      max: 10
    },
    {
      id: 'journal',
      question: 'What\'s on your mind today?',
      type: 'textarea',
      placeholder: 'Share your thoughts, feelings, or anything that happened today...'
    },
    {
      id: 'gratitude',
      question: 'What went well today?',
      type: 'textarea',
      placeholder: 'Write about something positive that happened today...'
    },
    {
      id: 'challenges',
      question: 'Any challenges you faced?',
      type: 'textarea',
      placeholder: 'Describe any difficulties or challenges you encountered...'
    }
  ];

  const handleMoodSelect = (mood) => {
    setMoodData(prev => ({
      ...prev,
      mood: mood.emoji,
      moodValue: mood.value
    }));
  };

  const handleJournalChange = (e) => {
    setMoodData(prev => ({
      ...prev,
      journalEntry: e.target.value
    }));
  };

  const handleMoodSubmit = async () => {
    if (!moodData.mood || !moodData.journalEntry.trim()) {
      alert('Please select a mood and write a journal entry.');
      return;
    }

    setIsSubmittingMood(true);
    try {
      const moodEntry = {
        clientId: currentUser.uid,
        clientName: profile?.name || 'Client',
        assignedTherapistId: clientData.assignedTherapist || '',
        assignedTherapistName: therapistData?.name || 'Therapist',
        mood: moodData.mood,
        moodValue: moodData.moodValue,
        journalEntry: moodData.journalEntry,
        date: moodData.date,
        timestamp: new Date(),
        createdAt: new Date()
      };

      await addDoc(collection(db, 'Client daily mood tracking'), moodEntry);
      
      // Update local state
      setMoodHistory(prev => [moodEntry, ...prev]);
      
      // Reset form
      setMoodData({
        mood: '',
        moodValue: 5,
        journalEntry: '',
        date: new Date().toISOString().split('T')[0]
      });
      
      alert('Mood check-in submitted successfully!');
    } catch (error) {
      console.error('Error submitting mood check-in:', error);
      alert('Error submitting mood check-in. Please try again.');
    } finally {
      setIsSubmittingMood(false);
    }
  };

  const fetchMoodHistory = async () => {
    try {
      const q = query(
        collection(db, 'Client daily mood tracking'),
        where('clientId', '==', currentUser.uid),
        limit(30)
      );
      const querySnapshot = await getDocs(q);
      const history = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort by timestamp locally to avoid index requirement
      const sortedHistory = history.sort((a, b) => {
        const timestampA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const timestampB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return timestampB - timestampA;
      });
      
      setMoodHistory(sortedHistory);
      
      // Process mood data for chart
      processMoodDataForChart(sortedHistory);
    } catch (error) {
      console.error('Error fetching mood history:', error);
    }
  };

  const processMoodDataForChart = (moodData) => {
    if (!moodData || moodData.length === 0) {
      setMoodChartData([]);
      return;
    }

    // Group mood values into categories
    const moodCategories = {
      'Very Low': { min: 1, max: 2, color: '#FF6B6B', count: 0 },
      'Low': { min: 3, max: 4, color: '#FFA726', count: 0 },
      'Moderate': { min: 5, max: 6, color: '#66BB6A', count: 0 },
      'High': { min: 7, max: 8, color: '#42A5F5', count: 0 },
      'Very High': { min: 9, max: 10, color: '#AB47BC', count: 0 }
    };

    // Count mood values in each category
    moodData.forEach(entry => {
      const moodValue = Number(entry.moodValue) || null;
      Object.keys(moodCategories).forEach(category => {
        const range = moodCategories[category];
        if (moodValue >= range.min && moodValue <= range.max) {
          range.count++;
        }
      });
    });

    // Calculate percentages and create chart data
    const totalEntries = moodData.length;
    const chartData = Object.keys(moodCategories).map(category => {
      const range = moodCategories[category];
      const percentage = totalEntries > 0 ? Math.round((range.count / totalEntries) * 100) : 0;
      return {
        category,
        count: range.count,
        percentage,
        color: range.color
      };
    }).filter(item => item.count > 0); // Only include categories with data

    setMoodChartData(chartData);
  };

  // Check if 48 hours have passed since last mood check
  const shouldShowMoodModal = () => {
    const lastCheck = localStorage.getItem('lastMoodCheck');
    if (!lastCheck) return true;
    
    const lastCheckDate = new Date(lastCheck);
    const now = new Date();
    const hoursDiff = (now - lastCheckDate) / (1000 * 60 * 60);
    
    return hoursDiff >= 48;
  };

  // Modal functions
  const handleAnswerChange = (questionId, value) => {
    setMoodAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < moodQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      handleSubmitMoodCheck();
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSubmitMoodCheck = async () => {
    setIsSubmittingMood(true);
    try {
      const moodEntry = {
        clientId: currentUser.uid,
        clientName: profile?.name || 'Client',
        assignedTherapistId: clientData.assignedTherapist || '',
        assignedTherapistName: therapistData?.name || 'Therapist',
        mood: moodAnswers.mood || '',
        moodValue: moodAnswers.moodScale || 5,
        journalEntry: moodAnswers.journal || '',
        gratitude: moodAnswers.gratitude || '',
        challenges: moodAnswers.challenges || '',
        date: new Date().toISOString().split('T')[0],
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'Client daily mood tracking'), moodEntry);
      
      // Update local state
      setMoodHistory(prev => [moodEntry, ...prev]);
      
      // Update chart data
      processMoodDataForChart([moodEntry, ...moodHistory]);
      
      // Save last check time
      localStorage.setItem('lastMoodCheck', new Date().toISOString());
      
      // Close modal and reset
      setShowMoodModal(false);
      setCurrentQuestionIndex(0);
      setMoodAnswers({});
      
      alert('Mood check-in submitted successfully!');
    } catch (error) {
      console.error('Error submitting mood check-in:', error);
      alert('Error submitting mood check-in. Please try again.');
    } finally {
      setIsSubmittingMood(false);
    }
  };

  const handleSkipMoodCheck = () => {
    setShowMoodModal(false);
    setCurrentQuestionIndex(0);
    setMoodAnswers({});
    // Save last check time even if skipped
    localStorage.setItem('lastMoodCheck', new Date().toISOString());
  };

  // Notification system functions
  const loadLastSeenTimestamps = () => {
    const saved = localStorage.getItem('th.lastSeenTimestamps');
    if (saved) {
      try {
        setLastSeenTimestamps(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading last seen timestamps:', error);
      }
    }
  };

  const saveLastSeenTimestamps = (timestamps) => {
    localStorage.setItem('th.lastSeenTimestamps', JSON.stringify(timestamps));
    setLastSeenTimestamps(timestamps);
  };

  const checkForNewContent = async (clientId) => {
    try {
      const newContent = {
        worksheets: [],
        notes: [],
        resources: []
      };

      // Check for new worksheets
      let worksheetsSnapshot;
      try {
        const worksheetsQuery = query(
          collection(db, 'worksheets'),
          where('assignedTo', 'array-contains', clientId),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        worksheetsSnapshot = await getDocs(worksheetsQuery);
      } catch (error) {
        // If index error, try without orderBy
        console.warn('Worksheets query index error, trying without orderBy:', error);
        try {
          const worksheetsQuery = query(
            collection(db, 'worksheets'),
            where('assignedTo', 'array-contains', clientId),
            limit(10)
          );
          worksheetsSnapshot = await getDocs(worksheetsQuery);
        } catch (err) {
          console.error('Error fetching worksheets:', err);
          worksheetsSnapshot = { docs: [] };
        }
      }
      const worksheets = worksheetsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const lastSeenWorksheets = lastSeenTimestamps.worksheets;
      if (lastSeenWorksheets) {
        newContent.worksheets = worksheets.filter(worksheet => {
          const createdAt = worksheet.createdAt?.toDate?.() || new Date(worksheet.createdAt);
          return createdAt > new Date(lastSeenWorksheets);
        });
      } else {
        // First time - only show recent worksheets (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        newContent.worksheets = worksheets.filter(worksheet => {
          const createdAt = worksheet.createdAt?.toDate?.() || new Date(worksheet.createdAt);
          return createdAt > sevenDaysAgo;
        });
      }

      // Check for new notes
      let notesSnapshot;
      try {
        const notesQuery = query(
          collection(db, 'notes'),
          where('clientId', '==', clientId),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        notesSnapshot = await getDocs(notesQuery);
      } catch (error) {
        // If index error, try without orderBy
        console.warn('Notes query index error, trying without orderBy:', error);
        try {
          const notesQuery = query(
            collection(db, 'notes'),
            where('clientId', '==', clientId),
            limit(10)
          );
          notesSnapshot = await getDocs(notesQuery);
        } catch (err) {
          console.error('Error fetching notes:', err);
          notesSnapshot = { docs: [] };
        }
      }
      const notes = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const lastSeenNotes = lastSeenTimestamps.notes;
      if (lastSeenNotes) {
        newContent.notes = notes.filter(note => {
          const createdAt = note.createdAt?.toDate?.() || new Date(note.createdAt);
          return createdAt > new Date(lastSeenNotes);
        });
      } else {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        newContent.notes = notes.filter(note => {
          const createdAt = note.createdAt?.toDate?.() || new Date(note.createdAt);
          return createdAt > sevenDaysAgo;
        });
      }

      // Check for new resources
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      const clientData = clientDoc.exists() ? clientDoc.data() : {};
      const therapyType = clientData.therapyType || 'individual';

      // Check for new resources
      let resourcesSnapshot;
      try {
        const resourcesQuery = query(
          collection(db, 'therapistResources'),
          where('targetAudience', 'in', ['all', therapyType]),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        resourcesSnapshot = await getDocs(resourcesQuery);
      } catch (error) {
        // If index error, try without orderBy
        console.warn('Resources query index error, trying without orderBy:', error);
        try {
          const resourcesQuery = query(
            collection(db, 'therapistResources'),
            where('targetAudience', 'in', ['all', therapyType]),
            limit(10)
          );
          resourcesSnapshot = await getDocs(resourcesQuery);
        } catch (err) {
          console.error('Error fetching resources:', err);
          resourcesSnapshot = { docs: [] };
        }
      }
      const resources = resourcesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const lastSeenResources = lastSeenTimestamps.resources;
      if (lastSeenResources) {
        newContent.resources = resources.filter(resource => {
          const createdAt = resource.createdAt?.toDate?.() || new Date(resource.createdAt);
          return createdAt > new Date(lastSeenResources);
        });
      } else {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        newContent.resources = resources.filter(resource => {
          const createdAt = resource.createdAt?.toDate?.() || new Date(resource.createdAt);
          return createdAt > sevenDaysAgo;
        });
      }

      // Update counts
      setNewContentCounts({
        worksheets: newContent.worksheets.length,
        notes: newContent.notes.length,
        resources: newContent.resources.length
      });

      // Create notification queue
      const notifications = [];
      
      newContent.worksheets.forEach(worksheet => {
        notifications.push({
          id: `worksheet-${worksheet.id}`,
          type: 'worksheet',
          title: worksheet.title,
          description: worksheet.description || 'A new worksheet has been assigned to you.',
          date: worksheet.createdAt?.toDate?.() || new Date(worksheet.createdAt),
          itemId: worksheet.id,
          icon: '📋'
        });
      });

      newContent.notes.forEach(note => {
        notifications.push({
          id: `note-${note.id}`,
          type: 'note',
          title: note.title || note.noteType || 'New Note',
          description: 'Your therapist has added a new note for you.',
          date: note.createdAt?.toDate?.() || new Date(note.createdAt),
          itemId: note.id,
          icon: '📝'
        });
      });

      newContent.resources.forEach(resource => {
        notifications.push({
          id: `resource-${resource.id}`,
          type: 'resource',
          title: resource.title,
          description: resource.description || 'A new resource has been shared with you.',
          date: resource.createdAt?.toDate?.() || new Date(resource.createdAt),
          itemId: resource.id,
          icon: '📚'
        });
      });

      // Sort by date (newest first)
      notifications.sort((a, b) => new Date(b.date) - new Date(a.date));

      if (notifications.length > 0) {
        const seen = readSeenIds();
        const unseen = notifications.filter((n) => !seen.has(n.id) && !isSnoozed(n.id));
        setNotificationQueue(unseen);
        showNextNotification(unseen);
      }

    } catch (error) {
      console.error('Error checking for new content:', error);
    }
  };

  // Notifications already shown. Kept in localStorage so a given item pops up
  // exactly once — previously nothing recorded a dismissal, so every reload
  // re-detected the same item as "new" and the popup came back forever.
  const SEEN_KEY = 'th.seenNotificationIds';
  const readSeenIds = () => {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
    catch { return new Set(); }
  };
  // "Remind me later" — hidden for a day, then eligible again.
  const SNOOZE_KEY = 'th.snoozedNotifications';
  const SNOOZE_MS = 24 * 60 * 60 * 1000;
  const readSnoozed = () => {
    try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); }
    catch { return {}; }
  };
  const snoozeNotification = (id) => {
    if (!id) return;
    const map = readSnoozed();
    map[id] = Date.now() + SNOOZE_MS;
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
  };
  const isSnoozed = (id) => {
    const until = readSnoozed()[id];
    return typeof until === 'number' && Date.now() < until;
  };

  const markNotificationSeen = (id) => {
    if (!id) return;
    const seen = readSeenIds();
    seen.add(id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* ignore */ }
  };

  // Pass the queue explicitly: calling this straight after setNotificationQueue
  // read the OLD state (React hasn't re-rendered yet), so it showed nothing or a
  // stale item.
  const showNextNotification = (queue = notificationQueue) => {
    const seen = readSeenIds();
    const next = (queue || []).find((n) => !seen.has(n.id) && !isSnoozed(n.id));
    if (!next) return;
    setCurrentNotification(next);
    setShowNotificationPopup(true);
  };

  const handleViewNow = () => {
    if (!currentNotification) return;
    const { type, itemId, id } = currentNotification;

    const newTimestamps = { ...lastSeenTimestamps };
    newTimestamps[type + 's'] = new Date().toISOString();
    saveLastSeenTimestamps(newTimestamps);
    markNotificationSeen(id);

    const updatedQueue = notificationQueue.filter(n => n.id !== id);
    setNotificationQueue(updatedQueue);
    setShowNotificationPopup(false);
    setCurrentNotification(null);

    // Actually go to the item. This was a `// TODO` that only console.logged, so
    // the button closed the popup and did nothing else.
    if (type === 'worksheet' && itemId) navigate(`/dashboard/resources/worksheet/${itemId}`);
    else if (type === 'note' && itemId) navigate(`/dashboard/resources/note/${itemId}`);
    else navigate('/dashboard/resources');
  };

  const handleRemindLater = () => {
    if (!currentNotification) return;
    // Snooze for a day rather than for ever: the button says "later", but it also
    // must not re-fire on every reload, which is what made the popup feel stuck.
    snoozeNotification(currentNotification.id);

    const updatedQueue = notificationQueue.filter(n => n.id !== currentNotification.id);
    setNotificationQueue(updatedQueue);
    setShowNotificationPopup(false);
    setCurrentNotification(null);

    if (updatedQueue.length > 0) {
      setTimeout(() => showNextNotification(updatedQueue), 600);
    }
  };

  const handleDismissNotification = () => {
    // Closing with X counts as seen — otherwise the same item returns on reload.
    if (currentNotification) markNotificationSeen(currentNotification.id);
    const updatedQueue = notificationQueue.filter(n => n.id !== currentNotification?.id);
    setNotificationQueue(updatedQueue);
    setShowNotificationPopup(false);
    setCurrentNotification(null);
  };

  if (isLoading) {
    return (
      <div className="dashboard-home">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-home">
      {/* A transfer to another therapist waiting for this client's consent. */}
      <TransferConsentCard kind="THERAPY" />
      {clientData?.coupleId ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/couple/dashboard', { state: { coupleId: clientData.coupleId } })}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/couple/dashboard', { state: { coupleId: clientData.coupleId } })}
          style={{
            margin: '0 0 1rem',
            padding: '1rem 1.25rem',
            borderRadius: 12,
            background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)',
            border: '1px solid #6ee7b7',
            cursor: 'pointer',
          }}
        >
          <strong style={{ color: '#065f46' }}>Couple therapy</strong>
          <p style={{ margin: '0.35rem 0 0', color: '#047857', fontSize: '0.9rem' }}>
            View shared couple status, payment, and therapist matching →
          </p>
        </div>
      ) : null}

      {/* No therapist yet → let them pick one from here, the same way a medical
          patient who skipped doctor booking gets a "Find a Doctor" CTA on their
          dashboard. Without this, a client who finished the questionnaire but
          skipped therapist selection had no route back to it. */}
      {!isLoading && !therapistData && !clientData?.assignedTherapist && !clientData?.coupleId && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem', flexWrap: 'wrap',
          margin: '0 0 1rem', padding: '1rem 1.25rem', borderRadius: 12,
          background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', border: '1px solid #a5b4fc',
        }}>
          <div>
            <strong style={{ color: '#3730a3' }}>You haven't chosen a therapist yet</strong>
            <p style={{ margin: '0.35rem 0 0', color: '#4338ca', fontSize: '0.9rem' }}>
              Browse therapists, see their session rates, and book the one that fits you.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/match-therapist')}
            style={{
              padding: '0.6rem 1.1rem', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: '0.875rem',
              whiteSpace: 'nowrap',
            }}
          >
            Find a Therapist
          </button>
        </div>
      )}

      {/* ── Welcome hero ──────────────────────────────────────────────────
          Was a full-width location card followed by a thin greeting strip with
          two unlabelled icon buttons. Now one card carrying the greeting, where
          you are, what it is like there, who your therapist is, and the two
          things a client actually does from here. ── */}
      <section className="ch-hero">
        <div className="ch-hero-main">
          <div className="ch-hero-id">
            <div className="ch-hero-avatar">
              {profile?.photoURL
                ? <img src={resolveFileUrl(profile.photoURL)} alt="" />
                : (profile?.name?.charAt(0).toUpperCase() || 'C')}
            </div>
            <div className="ch-hero-who">
              <p className="ch-hero-date">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <h1 className="ch-hero-greet">
                Good {currentTime.getHours() < 12 ? 'morning' : currentTime.getHours() < 17 ? 'afternoon' : 'evening'},{' '}
                <span className="ch-hero-name">{profile?.name?.split(' ')[0] || 'there'}</span>
              </h1>
            </div>
          </div>

        </div>

        {/* Decorative, last in the DOM and hidden from assistive tech. */}
        <img className="ch-hero-art" src={patientHero} alt="" aria-hidden="true" />
      </section>

      {/* ── Where you are, and the one thing we ask of you ──────────────
          Location and weather were inside the greeting card, which left no
          room for either. The check-in button was there too, competing with
          the greeting for the same line. All three get their own row. ── */}
      <div className="ch-meta-row">
        <div className="ch-meta-card">
          <LocationSummaryCard
            compact
            profile={locationProfile || mergeLocationProfile(profile, clientData)}
            onEdit={() => navigate('/dashboard/settings')}
          />
        </div>
        <div className="ch-meta-card">
          <WeatherCard profile={locationProfile || mergeLocationProfile(profile, clientData)} compact />
        </div>
        {/* The therapist lives in this row now, not over the hero image. */}
        {therapistData ? (
          <div className="ch-meta-card ch-therapist-card">
            <span className="ch-therapist-avatar">
              {therapistData.photoURL
                ? <img src={resolveFileUrl(therapistData.photoURL)} alt="" />
                : (therapistData.name || 'T').charAt(0).toUpperCase()}
            </span>
            <span className="ch-therapist-who">
              <em>Your therapist</em>
              <strong>{therapistData.name || 'Assigned'}</strong>
              {/* Their own declared availability; nothing when never set. */}
              <ClinicianStatus status={therapistData} />
            </span>
            <button type="button" className="ch-therapist-msg" onClick={() => navigate('/dashboard/messages')}>
              Message
            </button>
          </div>
        ) : null}
        {/* Check-in: a small round button (white, red cross) instead of a big banner. */}
        <div className="ch-checkin-wrap">
          <button
            type="button"
            className="ch-checkin-round"
            onClick={() => setShowMoodModal(true)}
            aria-label="Log how you feel — a quick check-in your therapist can see"
            title="Log how you feel"
          >
            <Plus size={30} strokeWidth={3} aria-hidden="true" />
          </button>
          <span className="ch-checkin-caption">Log mood</span>
        </div>
      </div>

      {/* Medication reminders set in My Care, with today's doses. */}
      <TodaysMedsCard accent="#5046bd" />

      {/* Psychiatry: copied from the medical patient home (Recent Prescriptions + shortcuts). */}
      {isPsychiatry && (
        <div className="mp-card">
          <div className="mp-card-header">
            <h3>Prescriptions</h3>
            <button className="mp-card-link" onClick={() => navigate('/dashboard/prescriptions')}>View all</button>
          </div>
          {rxList.length === 0 ? (
            <div className="mp-empty-small"><Pill size={32} /><p>No prescriptions yet</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {rxList.map(rx => (
                <div key={rx.id} className="mp-rx-row">
                  <div className="mp-rx-icon"><Pill size={16} /></div>
                  <div className="mp-rx-info">
                    <p className="mp-rx-name">{rx.medication || rx.medications?.[0]?.name || 'Medication'}</p>
                    <p className="mp-rx-meta">{rx.dosage || ''}{rx.medications?.[0]?.frequency ? ' · ' + rx.medications[0].frequency : ''}</p>
                    <p className="mp-rx-doctor">{rx.doctorName || 'Your psychiatrist'}</p>
                  </div>
                  <span className="mp-rx-badge">Active</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="mp-card-link" onClick={() => navigate('/dashboard/prescriptions')}>Prescriptions</button>
            <button className="mp-card-link" onClick={() => navigate('/dashboard/epharmacy')}>E-Pharmacy</button>
            <button className="mp-card-link" onClick={() => navigate('/dashboard/timeline')}>Health Timeline</button>
          </div>
        </div>
      )}

      {/* ── Today band ───────────────────────────────────────────────────────
          Replaces the full-width red alarm bar. That banner shouted at every
          client on every visit regardless of state, and pushed the actually
          useful information below the fold. This band leads with what today
          holds, keeps the daily check-in one click away, and still puts crisis
          support in reach — calm, not alarming. */}
      <div className="today-band">
        {/* Next session */}
        <div className="today-card today-next">
          <div className="today-card-head">
            <span className="today-eyebrow">Next session</span>
            <Calendar size={16} />
          </div>
          {nextSession ? (() => {
            const d = nextSession.scheduledTime?.toDate
              ? nextSession.scheduledTime.toDate()
              : new Date(nextSession.scheduledTime);
            const valid = d instanceof Date && !Number.isNaN(d.getTime());
            return (
              <>
                <p className="today-headline">
                  {valid ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Scheduled'}
                </p>
                <p className="today-sub">
                  {valid ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  {therapistData?.name ? ` · ${therapistData.name}` : ''}
                </p>
                <button className="today-cta today-cta-primary" onClick={() => navigate('/dashboard/video')}>
                  <Video size={15} /> Join session
                </button>
              </>
            );
          })() : (
            <>
              <p className="today-headline">Nothing booked</p>
              <p className="today-sub">Pick a time that suits you</p>
              <button className="today-cta today-cta-primary" onClick={() => navigate('/dashboard/schedule')}>
                <Calendar size={15} /> Book a session
              </button>
            </>
          )}
        </div>

        {/* Daily check-in */}
        <div className="today-card today-checkin">
          <div className="today-card-head">
            <span className="today-eyebrow">Daily check-in</span>
            <Activity size={16} />
          </div>
          <p className="today-headline">How are you today?</p>
          <p className="today-sub">
            {moodHistory?.length
              ? `${moodHistory.length} check-in${moodHistory.length > 1 ? 's' : ''} logged so far`
              : 'Takes about a minute'}
          </p>
          <button className="today-cta today-cta-mood" onClick={() => setShowMoodModal(true)}>
            <TrendingUp size={15} /> Log how you feel
          </button>
        </div>

        {/* Support */}
        <div className="today-card today-support">
          <div className="today-card-head">
            <span className="today-eyebrow">Support</span>
            <AlertTriangle size={16} />
          </div>
          <p className="today-headline">Need help now?</p>
          <p className="today-sub">Ghana crisis lines, available 24/7</p>
          <div className="today-support-actions">
            <button className="today-cta today-cta-danger" onClick={() => setShowEmergencyModal(true)}>
              <Phone size={15} /> Get help
            </button>
            <button className="today-cta today-cta-ghost" onClick={() => navigate('/dashboard/messages')}>
              <MessageSquare size={15} /> Message
            </button>
          </div>
        </div>
      </div>

      {/* Emergency Modal */}
      {showEmergencyModal && (
        <div className="emergency-modal-overlay" onClick={() => setShowEmergencyModal(false)}>
          <div className="emergency-modal" onClick={e => e.stopPropagation()}>
            <div className="emergency-modal-header">
              <AlertTriangle size={28} color="#dc2626" />
              <h2>Crisis & Emergency Support</h2>
              <button className="emergency-modal-close" onClick={() => setShowEmergencyModal(false)}>
                <X size={24} />
              </button>
            </div>
            <p className="emergency-modal-intro">You are not alone. Reach out immediately:</p>
            <div className="emergency-hotlines">
              {/* Ghana national crisis and emergency lines. The previous list was
                  US-only (988 / 741741 / 911), which is unreachable from Ghana. */}
              <a className="hotline-card" href="tel:112">
                <div className="hotline-icon">🚨</div>
                <div>
                  <div className="hotline-name">National Emergency — 112</div>
                  <div className="hotline-desc">Police, ambulance & fire · 24/7 toll-free</div>
                </div>
              </a>
              <a className="hotline-card" href="tel:+233509405480">
                <div className="hotline-icon">📞</div>
                <div>
                  <div className="hotline-name">Mental Health Authority Helpline</div>
                  <div className="hotline-desc">0509 405 480 · 24/7 crisis counselling</div>
                </div>
              </a>
              <a className="hotline-card" href="tel:+233244846701">
                <div className="hotline-icon">💚</div>
                <div>
                  <div className="hotline-name">Suicide Prevention (Ghana)</div>
                  <div className="hotline-desc">0244 846 701 · trained volunteers</div>
                </div>
              </a>
              <a className="hotline-card" href="tel:193">
                <div className="hotline-icon">🚑</div>
                <div>
                  <div className="hotline-name">National Ambulance — 193</div>
                  <div className="hotline-desc">Ambulance dispatch, nationwide</div>
                </div>
              </a>
              <a className="hotline-card" href="tel:+233302666987">
                <div className="hotline-icon">🏥</div>
                <div>
                  <div className="hotline-name">Accra Psychiatric Hospital</div>
                  <div className="hotline-desc">030 266 6987 · emergency psychiatric care</div>
                </div>
              </a>
            </div>
            <div className="emergency-modal-footer">
              <button className="emergency-message-therapist" onClick={() => { setShowEmergencyModal(false); navigate('/dashboard/messages'); }}>
                <MessageSquare size={16} />
                Message My Therapist
              </button>
              <button className="emergency-close-btn" onClick={() => setShowEmergencyModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Sessions Completed', value: sessionsCompleted, icon: '✅', color: '#10b981', bg: '#f0fdf4' },
          { label: 'Progress Score', value: typeof progressScore === 'number' ? `${progressScore}%` : '—', icon: '📈', color: '#6366f1', bg: '#f0f7ff' },
          { label: 'Goals Achieved', value: goalsTotal > 0 ? `${goalsAchieved}/${goalsTotal}` : '0', icon: '🎯', color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Days Active', value: daysActive, icon: '🗓️', color: '#8b5cf6', bg: '#f5f3ff' },
          { label: 'Next Session', value: nextSession
              ? (() => { const d = nextSession.scheduledTime?.toDate ? nextSession.scheduledTime.toDate() : new Date(nextSession.scheduledTime); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })()
              : 'None', icon: '📅', color: '#0ea5e9', bg: '#f0f9ff' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: '14px', padding: '1.1rem',
            border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', gap: '0.85rem'
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '10px',
              background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', flexShrink: 0
            }}>{kpi.icon}</div>
            <div>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</p>
              <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions — the dashboard had no direct route to the things a client
          actually opens every visit; everything went through the left nav. */}
      {/* Circle buttons, one colour each — the same language as the clinician
          and patient dashboards. Every icon/circle pair is measured; the
          lowest here is gold at 5.37:1. */}
      <div className="ch-quick">
        {[
          { label: 'Book a session', icon: Calendar,      to: '/dashboard/schedule',  tone: 'green' },
          { label: 'Message',        icon: MessageSquare, to: '/dashboard/messages',  tone: 'sky' },
          { label: 'Video call',     icon: Video,         to: '/dashboard/video',     tone: 'violet' },
          { label: 'Resources',      icon: BookOpen,      to: '/dashboard/resources', tone: 'gold' },
          { label: 'My care',        icon: Heart,         to: '/dashboard/my-care',   tone: 'rose' },
          { label: 'Billing',        icon: CreditCard,    to: '/dashboard/billing',   tone: 'blue' },
        ].map(({ label, icon: Icon, to, tone }) => (
          <button key={label} type="button" className="ch-quick-btn"
                  onClick={() => navigate(to)} title={label}>
            <span className={`ch-quick-circle ch-circle-${tone}`}><Icon size={19} /></span>
            <span className="ch-quick-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Progress, activity and charts, always rendered.
          They used to sit behind a "Show your progress, activity and charts"
          disclosure, which meant a client had to click before seeing any of
          the work they had put in. */}
      {/* Progress and Activities Cards */}
      <div className="progress-activities-section">
        <div className="progress-activities-row">
          {/* Your Progress Card */}
          <div className="progress-card">
            <h3 className="card-title">Your Progress</h3>
            <div className="progress-items">
              {progressMetrics.map((item) => {
                // `null` means nothing has been recorded for this metric. Show that
                // plainly — a 0% bar reads as "you scored zero", which is a
                // different and wrong claim.
                const hasValue = typeof item.value === 'number';
                return (
                  <div key={item.key} className="progress-item">
                    <div className="progress-header">
                      <span className="progress-label">{item.label}</span>
                      <span className="progress-percentage">{hasValue ? `${item.value}%` : '—'}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill bg-green-500"
                        style={{ width: `${hasValue ? item.value : 0}%` }}
                      ></div>
                    </div>
                    {/* Name the source, so the number is auditable from the UI. */}
                    <p className="progress-detail">{item.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activities Card */}
          <div className="activities-card">
            <h3 className="card-title">Recent Activities</h3>
            <div className="activities-list">
              {recentActivities.length === 0 ? (
                <div className="dashboard-empty">
                  <span className="dashboard-empty-icon">🌱</span>
                  <p className="dashboard-empty-title">Nothing here yet</p>
                  <p className="dashboard-empty-hint">
                    Your check-ins, sessions and notes will appear here as you go.
                  </p>
                </div>
              ) : (
                recentActivities.map((activity, index) => (
                  <div key={index} className="activity-item">
                    <div className="activity-icon">{activity.icon}</div>
                    <div className="activity-content">
                      <p className="activity-text">{activity.text}</p>
                      <span className="activity-time">{activity.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Calendar — moved up to share the row with Recent Activities */}
        <div className="calendar-widget">
          <div className="calendar-header">
            <h2 className="calendar-title">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="calendar-nav">
              <button 
                className="nav-btn" 
                onClick={() => navigateMonth(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                className="nav-btn" 
                onClick={() => navigateMonth(1)}
              >
                <ChevronRight size={20} />
              </button>
          </div>
          </div>
          
          {/* This block has been called the weather widget all along while
              showing nothing but a clock. It now carries the real conditions
              at the client's saved location, and follows it when it changes. */}
          <div className="weather-widget">
            <div className="weather-info">
              <div className="weather-time">{formatTime(currentTime)}</div>
            </div>
            <WeatherCard profile={locationProfile || mergeLocationProfile(profile, clientData)} compact />
          </div>

          <div className="calendar-grid">
            <div className="calendar-weekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="weekday">{day}</div>
              ))}
            </div>
            
            <div className="calendar-days">
              {getLastDaysOfPrevMonth(currentDate).map((day, index) => (
                <div key={`prev-${day}`} className="calendar-day prev-month">
                  {day}
                </div>
              ))}
              
              {Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => i + 1).map(day => {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                return (
                  <button
                    key={day}
                    className={`calendar-day ${isToday(date) ? 'today' : ''} ${isSelected(date) ? 'selected' : ''}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    {day}
                  </button>
                );
              })}
              
              {getFirstDaysOfNextMonth(currentDate).map((day, index) => (
                <div key={`next-${day}`} className="calendar-day next-month">
                  {day}
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>


      {/* Charts Section */}
      <div className="charts-section">
        <div className="charts-grid">
          {/* Donuts moved here so every graph sits on one row */}
          {/* Overall Progress Chart */}
          <div className="chart-card">
            <h3 className="chart-title">Overall Progress</h3>
            <div className="chart-container">
              <Doughnut 
                data={prepareProgressDoughnutData(progressScore)} 
                options={{
                  ...pieChartOptions,
                  plugins: {
                    ...pieChartOptions.plugins,
                    legend: {
                      display: false
                    }
                  }
                }}
              />
              <div className="progress-center-text">
                <span className="progress-percentage">{progressScore}%</span>
                <span className="progress-label">Complete</span>
              </div>
            </div>
          </div>

          {/* Mood Progress Chart */}
          <div className="chart-card">
            <h3 className="chart-title">Daily Mood Progress</h3>
            <div className="chart-container">
              <Doughnut
                data={{
                  labels: moodChartData.map(item => item.category),
                  datasets: [{
                    data: moodChartData.map(item => item.percentage),
                    backgroundColor: moodChartData.map(item => item.color),
                    borderWidth: 0,
                    cutout: '70%'
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const item = moodChartData[context.dataIndex];
                          return `${item.category}: ${item.percentage}% (${item.count} entries)`;
                        }
                      }
                    }
                  }
                }}
              />
              <div className="progress-center-text">
                <span className="progress-percentage">
                  {Math.round(moodChartData.reduce((sum, item) => sum + (item.percentage * (item.category === 'Very Low' ? 1.5 : item.category === 'Low' ? 3.5 : item.category === 'Moderate' ? 5.5 : item.category === 'High' ? 7.5 : 9.5)), 0) / moodChartData.reduce((sum, item) => sum + item.percentage, 0)) || 0}%
            </span>
                <span className="progress-label">Avg.</span>
          </div>
        </div>
      </div>
          {/* Therapy Progress Line Chart */}
          <div className="chart-card">
            <h3 className="chart-title">Therapy Progress</h3>
            <div className="chart-container">
              <Line 
                data={prepareProgressChartData(progressData)} 
                options={{
                  ...chartOptions,
                  scales: {
                    ...chartOptions.scales,
                    y: {
                      ...chartOptions.scales.y,
                      max: 100,
                      ticks: {
                        ...chartOptions.scales.y.ticks,
                        callback: function(value) {
                          return value + '%';
                        }
                      }
                    }
                  }
                }}
              />
          </div>
          </div>

          {/* Activities Bar Chart */}
          <div className="chart-card">
            <h3 className="chart-title">Your Activities</h3>
            <div className="chart-container">
              <Bar 
                data={prepareActivityChartData(activityData)} 
                options={chartOptions}
              />
          </div>
          </div>

          {/* Mood Distribution Pie Chart */}
          <div className="chart-card">
            <h3 className="chart-title">Mood Distribution</h3>
            <div className="chart-container">
              {moodChartData.length > 0 ? (
                <Pie data={prepareMoodPieChartData(moodChartData)} options={pieChartOptions} />
              ) : (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
                  No mood check-ins yet — log one to see your distribution.
                </p>
              )}
            </div>
          </div>

        </div>
      </div>



      {/* Mood Check-in Modal */}
      {showMoodModal && (
        <div className="mood-modal-overlay">
          <div className="mood-modal">
            <div className="mood-modal-header">
              <h2 className="mood-modal-title">Daily Check-in</h2>
              <p className="mood-modal-subtitle">Let's take a moment to reflect on your day</p>
            </div>
            
            <div className="mood-modal-content">
              <div className="question-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${((currentQuestionIndex + 1) / moodQuestions.length) * 100}%` }}
                  ></div>
                </div>
                <span className="progress-text">
                  {currentQuestionIndex + 1} of {moodQuestions.length}
            </span>
          </div>
              
              <div className="question-container">
                <h3 className="question-title">
                  {moodQuestions[currentQuestionIndex].question}
                </h3>
                
                {moodQuestions[currentQuestionIndex].type === 'emoji' && (
                  <div className="mood-emoji-grid">
                    {moodQuestions[currentQuestionIndex].options.map((mood, index) => (
                      <button
                        key={index}
                        className={`mood-emoji-btn ${moodAnswers.mood === mood.emoji ? 'selected' : ''}`}
                        onClick={() => handleAnswerChange('mood', mood.emoji)}
                        title={mood.label}
                      >
                        <span className="mood-emoji">{mood.emoji}</span>
                      </button>
                    ))}
        </div>
                )}
                
                {moodQuestions[currentQuestionIndex].type === 'slider' && (
                  <div className="mood-slider-container">
                    <div className="slider-value">
                      {moodAnswers.moodScale || 5}/10
      </div>
                    <input
                      type="range"
                      min={moodQuestions[currentQuestionIndex].min}
                      max={moodQuestions[currentQuestionIndex].max}
                      value={moodAnswers.moodScale || 5}
                      onChange={(e) => handleAnswerChange('moodScale', parseInt(e.target.value))}
                      className="mood-slider"
                    />
                  </div>
                )}
                
                {moodQuestions[currentQuestionIndex].type === 'textarea' && (
                  <textarea
                    value={moodAnswers[moodQuestions[currentQuestionIndex].id] || ''}
                    onChange={(e) => handleAnswerChange(moodQuestions[currentQuestionIndex].id, e.target.value)}
                    placeholder={moodQuestions[currentQuestionIndex].placeholder}
                    className="mood-textarea"
                    rows="4"
                  />
                )}
              </div>
            </div>
            
            <div className="mood-modal-footer">
              <button
                onClick={handleSkipMoodCheck}
                className="mood-skip-btn"
              >
                Skip for now
              </button>
              
              <div className="mood-nav-buttons">
                {currentQuestionIndex > 0 && (
                  <button
                    onClick={handlePreviousQuestion}
                    className="mood-prev-btn"
                  >
                    Previous
                  </button>
                )}
                
                <button
                  onClick={handleNextQuestion}
                  disabled={isSubmittingMood}
                  className="mood-next-btn"
                >
                  {isSubmittingMood ? 'Submitting...' : 
                   currentQuestionIndex === moodQuestions.length - 1 ? 'Submit' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Content Notification Popup */}
      {showNotificationPopup && currentNotification && (
        <div className="notification-popup-overlay">
          <div className="notification-popup">
            <div className="notification-popup-header">
              <div className="notification-icon-large">
                {currentNotification.icon}
              </div>
              <div className="notification-close" onClick={handleDismissNotification}>
                ×
              </div>
            </div>
            
            <div className="notification-popup-content">
              <h3 className="notification-title">
                New {currentNotification.type.charAt(0).toUpperCase() + currentNotification.type.slice(1)} Available
              </h3>
              <h4 className="notification-item-title">
                {currentNotification.title}
              </h4>
              <p className="notification-description">
                {currentNotification.description}
              </p>
              <div className="notification-date">
                {new Date(currentNotification.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
            
            <div className="notification-popup-footer">
              <button
                onClick={handleRemindLater}
                className="notification-btn remind-btn"
              >
                Remind Me Later
              </button>
              <button
                onClick={handleViewNow}
                className="notification-btn view-btn"
              >
                View Now
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Shared FAQ (backend /api/v1/faq) — same answers as the website and the app. */}
      <FaqSection compact audience="client" title="Questions & answers" />
    </div>
  );
}


