import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, User, BookOpen, Clock, TrendingUp, Activity, Target, Bell } from 'lucide-react';
import './Home.css';
import { auth, db } from '../../Auth/firebaseConfig';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  onSnapshot,
  doc,
  getDoc
} from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function ClientHome() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clientData, setClientData] = useState({});
  const [therapistData, setTherapistData] = useState(null);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [progressScore, setProgressScore] = useState(0);
  const [goalsAchieved, setGoalsAchieved] = useState(0);
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
  
  const currentUser = auth.currentUser;

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
        
        // Get client ID from localStorage or auth
        const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
        console.log('📋 Home: Client ID:', clientId);
        
        // Fetch client profile data
        console.log('📖 Home: Fetching client document from clients collection...');
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        
        if (clientDoc.exists()) {
          const clientProfile = clientDoc.data();
          console.log('✅ Home: Client document found:', clientProfile);
          console.log('🔗 Home: Assigned therapist field:', clientProfile.assignedTherapist);
          setClientData(clientProfile);
          
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
            console.log('❌ Home: No assigned therapist field in client data');
          }
        } else {
          console.log('❌ Home: Client document not found for ID:', clientId);
        }

        // Fetch therapy notes for this client from the subcollection
        const therapyNotesQuery = query(
          collection(db, 'clients', clientId, 'therapyNotes'),
          orderBy('sessionDate', 'desc')
        );
        const therapyNotesSnapshot = await getDocs(therapyNotesQuery);
        const notes = therapyNotesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTherapyNotes(notes);

        // Calculate sessions completed from scheduleCalls
        const completedSessionsQuery = query(
          collection(db, 'scheduleCalls'),
          where('clientId', '==', clientId),
          where('status', '==', 'completed')
        );
        const completedSessionsSnapshot = await getDocs(completedSessionsQuery);
        setSessionsCompleted(completedSessionsSnapshot.docs.length);

        // Calculate progress score from therapy notes
        const progressScore = calculateProgressScore(notes);
        setProgressScore(progressScore);

        // Calculate goals achieved from therapy notes
        let achievedGoalsCount = 0;
        notes.forEach(note => {
          if (note.goalsReviewed && typeof note.goalsReviewed === 'string') {
            // Count checkmarks (✔️) in the goalsReviewed string
            const checkmarks = (note.goalsReviewed.match(/✔️/g) || []).length;
            achievedGoalsCount += checkmarks;
          }
        });
        setGoalsAchieved(achievedGoalsCount);

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

        // Generate recent activities
        const activities = generateRecentActivities(notes, activityChartData);
        setRecentActivities(activities);

        // Fetch next session
        const nextSessionQuery = query(
          collection(db, 'scheduleCalls'),
          where('clientId', '==', clientId)
        );
        const nextSessionSnapshot = await getDocs(nextSessionQuery);
        if (!nextSessionSnapshot.empty) {
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
  }, [currentUser]);

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
        collection(db, 'scheduleCalls'),
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
  const generateRecentActivities = (notes, activityData) => {
    const activities = [];

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

    // Add recent messages (simulated)
    activities.push({
      type: 'message',
      text: 'Received message from therapist',
      time: '1 day ago',
      icon: '💬'
    });

    // Add resource activities
    activities.push({
      type: 'resource',
      text: 'Completed breathing exercise',
      time: '2 days ago',
      icon: '🧘'
    });

    return activities.slice(0, 4);
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

  // Generate progress data from therapy notes
  const generateProgressMetrics = () => {
    if (therapyNotes.length === 0) {
      return [
        { label: 'Mood Improvement', value: 0, color: 'bg-green-500' },
        { label: 'Stress Management', value: 0, color: 'bg-blue-500' },
        { label: 'Sleep Quality', value: 0, color: 'bg-yellow-500' },
        { label: 'Goal Achievement', value: 0, color: 'bg-purple-500' }
      ];
    }

    // Calculate metrics from therapy notes
    const moodImprovement = calculateMoodImprovement(therapyNotes);
    const stressManagement = calculateStressManagement(therapyNotes);
    const sleepQuality = calculateSleepQuality(therapyNotes);
    const goalAchievement = calculateGoalAchievement(therapyNotes);

    return [
      { label: 'Mood Improvement', value: moodImprovement, color: 'bg-green-500' },
      { label: 'Stress Management', value: stressManagement, color: 'bg-blue-500' },
      { label: 'Sleep Quality', value: sleepQuality, color: 'bg-yellow-500' },
      { label: 'Goal Achievement', value: goalAchievement, color: 'bg-purple-500' }
    ];
  };

  // Calculate mood improvement from client data
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
      const avgMoodRating = notes.reduce((sum, note) => sum + (note.moodRating || 5), 0) / notes.length;
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
      {/* Header with Live Time and Notifications */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="welcome-section">
            <h1 className="welcome-title">Welcome back!</h1>
            <p className="welcome-subtitle">
              Ready to continue your therapy journey with {therapistName}?
            </p>
          </div>
          <div className="time-section">
            <div className="current-time">{formatTime(currentTime)}</div>
            <div className="current-date">{formatDate(currentTime)}</div>
            <div className="notification-icon" onClick={() => {/* Handle notification click */}}>
              <Bell size={24} />
              {unreadCount > 0 && (
                <span className="notification-badge">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon bg-blue-100">
              <Calendar className="text-blue-600" size={24} />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{sessionsCompleted}</h3>
              <p className="stat-label">Sessions Completed</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-green-100">
              <TrendingUp className="text-green-600" size={24} />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{progressScore}%</h3>
              <p className="stat-label">Progress Score</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-purple-100">
              <Target className="text-purple-600" size={24} />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{goalsAchieved}</h3>
              <p className="stat-label">Goals Achieved</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-orange-100">
              <Activity className="text-orange-600" size={24} />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{daysActive}</h3>
              <p className="stat-label">Days Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        <div className="charts-grid">
          {/* Therapy Progress Graph */}
          <div className="chart-card">
            <h3 className="chart-title">Therapy Progress</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={progressData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Progress']} />
                  <Line 
                    type="monotone" 
                    dataKey="progress" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Client Activities Graph */}
          <div className="chart-card">
            <h3 className="chart-title">Your Activities</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="messages" fill="#10B981" name="Messages" />
                  <Bar dataKey="sessions" fill="#3B82F6" name="Sessions" />
                  <Bar dataKey="exercises" fill="#F59E0B" name="Exercises" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

  

      {/* Progress & Activities */}
      <div className="progress-section">
        <div className="progress-grid">
          {/* Progress Tracking */}
          <div className="progress-card">
            <h3 className="card-title">Your Progress</h3>
            <div className="progress-items">
              {progressMetrics.map((item, index) => (
                <div key={index} className="progress-item">
                  <div className="progress-header">
                    <span className="progress-label">{item.label}</span>
                    <span className="progress-percentage">{item.value}%</span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill ${item.color}`}
                      style={{ width: `${item.value}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activities */}
          <div className="activities-card">
            <h3 className="card-title">Recent Activities</h3>
            <div className="activities-list">
              {recentActivities.map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-icon">{activity.icon}</div>
                  <div className="activity-content">
                    <p className="activity-text">{activity.text}</p>
                    <span className="activity-time">{activity.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Therapy Progress Summary */}
      <div className="therapy-progress">
        <h2 className="section-title">Your Therapy Progress</h2>
        <div className="progress-summary">
          <div className="progress-item">
            <span className="progress-label">Therapy Type:</span>
            <span className="progress-value">{clientData.therapyType || 'Individual'}</span>
          </div>
          <div className="progress-item">
            <span className="progress-label">Sessions Completed:</span>
            <span className="progress-value">{sessionsCompleted}</span>
          </div>
          <div className="progress-item">
            <span className="progress-label">Current Goal:</span>
            <span className="progress-value">{currentGoal}</span>
          </div>
          <div className="progress-item">
            <span className="progress-label">Next Session:</span>
            <span className="progress-value">
              {nextSession ? 
                `${new Date(nextSession.scheduledTime?.toDate ? nextSession.scheduledTime.toDate() : nextSession.scheduledTime).toLocaleDateString()} at ${new Date(nextSession.scheduledTime?.toDate ? nextSession.scheduledTime.toDate() : nextSession.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 
                'No upcoming sessions'
              }
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


