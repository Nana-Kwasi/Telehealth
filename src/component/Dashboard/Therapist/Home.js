// import React, { useState, useEffect } from 'react';
// import { Users, Calendar, MessageSquare, TrendingUp, Activity, Clock, Target, Award, AlertTriangle, Bell, Cloud, MapPin, Plus, UserPlus, Phone, FileText, CheckCircle, XCircle } from 'lucide-react';
// import { auth, db } from '../../Auth/firebaseConfig';
// import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
// import './Home.css';

// export default function TherapistHome() {
//   const [currentTime, setCurrentTime] = useState(new Date());
//   const [weather, setWeather] = useState({ temp: 72, condition: 'Sunny', location: 'New York, NY' });
//   const [crisisAlerts, setCrisisAlerts] = useState([]);
//   const [pendingTasks, setPendingTasks] = useState([]);
//   const [systemAnnouncements, setSystemAnnouncements] = useState([]);
//   const [recentMessages, setRecentMessages] = useState([]);
//   const [upcomingAppointments, setUpcomingAppointments] = useState([]);
//   const [kpis, setKpis] = useState({
//     weeklySessions: 0,
//     pendingNotes: 0,
//     activeClients: 0,
//     completionRate: 0
//   });
  
//   // Update time every second
//   useEffect(() => {
//     const timer = setInterval(() => {
//       setCurrentTime(new Date());
//     }, 1000);

//     return () => clearInterval(timer);
//   }, []);

//   // Fetch real-time data
//   useEffect(() => {
//     const currentUser = auth.currentUser;
//     if (!currentUser) return;

//     // Fetch crisis alerts
//     const crisisQuery = query(
//       collection(db, 'crisisAlerts'),
//       where('therapistId', '==', currentUser.uid),
//       where('status', '==', 'active'),
//       orderBy('createdAt', 'desc'),
//       limit(5)
//     );
    
//     const crisisUnsub = onSnapshot(crisisQuery, (snap) => {
//       setCrisisAlerts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
//     });

//     // Fetch pending tasks
//     const tasksQuery = query(
//       collection(db, 'pendingTasks'),
//       where('therapistId', '==', currentUser.uid),
//       where('completed', '==', false),
//       orderBy('dueDate', 'asc'),
//       limit(5)
//     );
    
//     const tasksUnsub = onSnapshot(tasksQuery, (snap) => {
//       setPendingTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
//     });

//     // Fetch system announcements
//     const announcementsQuery = query(
//       collection(db, 'systemAnnouncements'),
//       where('active', '==', true),
//       orderBy('createdAt', 'desc'),
//       limit(3)
//     );
    
//     const announcementsUnsub = onSnapshot(announcementsQuery, (snap) => {
//       setSystemAnnouncements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
//     });

//     // Fetch recent messages
//     const messagesQuery = query(
//       collection(db, 'recentMessages'),
//       where('therapistId', '==', currentUser.uid),
//       orderBy('timestamp', 'desc'),
//       limit(5)
//     );
    
//     const messagesUnsub = onSnapshot(messagesQuery, (snap) => {
//       setRecentMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
//     });

//     // Fetch upcoming appointments
//     const appointmentsQuery = query(
//       collection(db, 'scheduledCalls'),
//       where('therapistId', '==', currentUser.uid),
//       where('scheduledTime', '>=', new Date()),
//       orderBy('scheduledTime', 'asc'),
//       limit(5)
//     );
    
//     const appointmentsUnsub = onSnapshot(appointmentsQuery, (snap) => {
//       setUpcomingAppointments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
//     });

//     const fetchKPIs = async () => {
//       try {
//         const weekStart = new Date();
//         weekStart.setDate(weekStart.getDate() - weekStart.getDay());
//         weekStart.setHours(0, 0, 0, 0);
        
//         const sessionsQuery = query(
//           collection(db, 'scheduledCalls'),
//           where('therapistId', '==', currentUser.uid),
//           where('scheduledTime', '>=', weekStart)
//         );
//         const sessionsSnap = await getDocs(sessionsQuery);
        
//         // Pending notes
//         const notesQuery = query(
//           collection(db, 'pendingNotes'),
//           where('therapistId', '==', currentUser.uid),
//           where('completed', '==', false)
//         );
//         const notesSnap = await getDocs(notesQuery);
        
//         // Active clients
//         const clientsQuery = query(
//           collection(db, 'therapists', currentUser.uid, 'clients')
//         );
//         const clientsSnap = await getDocs(clientsQuery);
        
//         setKpis({
//           weeklySessions: sessionsSnap.docs.length,
//           pendingNotes: notesSnap.docs.length,
//           activeClients: clientsSnap.docs.length,
//           completionRate: Math.round((sessionsSnap.docs.length / Math.max(clientsSnap.docs.length, 1)) * 100)
//         });
//       } catch (error) {
//         console.error('Error fetching KPIs:', error);
//       }
//     };

//     fetchKPIs();

//     return () => {
//       crisisUnsub();
//       tasksUnsub();
//       announcementsUnsub();
//       messagesUnsub();
//       appointmentsUnsub();
//     };
//   }, []);

//   const formatTime = (date) => {
//     return date.toLocaleTimeString('en-US', { 
//       hour12: true, 
//       hour: 'numeric', 
//       minute: '2-digit', 
//       second: '2-digit' 
//     });
//   };

//   const formatDate = (date) => {
//     return date.toLocaleDateString('en-US', { 
//       weekday: 'long', 
//       year: 'numeric', 
//       month: 'long', 
//       day: 'numeric' 
//     });
//   };

//   const statsData = [
//     {
//       title: 'Active Clients',
//       value: kpis.activeClients.toString(),
//       change: 'Currently assigned',
//       icon: Users,
//       color: 'bg-blue-500',
//       bgColor: 'bg-blue-100'
//     },
//     {
//       title: 'Weekly Sessions',
//       value: kpis.weeklySessions.toString(),
//       change: 'This week',
//       icon: Calendar,
//       color: 'bg-green-500',
//       bgColor: 'bg-green-100'
//     },
//     {
//       title: 'Pending Notes',
//       value: kpis.pendingNotes.toString(),
//       change: 'Need completion',
//       icon: FileText,
//       color: 'bg-purple-500',
//       bgColor: 'bg-purple-100'
//     },
//     {
//       title: 'Completion Rate',
//       value: `${kpis.completionRate}%`,
//       change: 'Session completion',
//       icon: TrendingUp,
//       color: 'bg-orange-500',
//       bgColor: 'bg-orange-100'
//     }
//   ];

//   const todayAppointments = [
//     { time: '9:00 AM', client: 'Sarah Johnson', type: 'Individual', status: 'completed' },
//     { time: '11:00 AM', client: 'Mike Chen', type: 'Couples', status: 'completed' },
//     { time: '2:00 PM', client: 'Emma Davis', type: 'Individual', status: 'upcoming' },
//     { time: '4:00 PM', client: 'Alex Thompson', type: 'Teen', status: 'upcoming' }
//   ];

//   const recentActivities = [
//     { type: 'session', text: 'Completed session with Sarah Johnson', time: '1 hour ago', icon: '🎯' },
//     { type: 'message', text: 'Responded to Mike Chen\'s message', time: '2 hours ago', icon: '💬' },
//     { type: 'note', text: 'Updated progress notes for Emma Davis', time: '3 hours ago', icon: '📝' },
//     { type: 'goal', text: 'Set new goal for Alex Thompson', time: '1 day ago', icon: '🎯' }
//   ];

//   const clientProgress = [
//     { name: 'Sarah Johnson', progress: 85, lastSession: 'Today', nextSession: 'Next week' },
//     { name: 'Mike Chen', progress: 72, lastSession: 'Today', nextSession: 'Next week' },
//     { name: 'Emma Davis', progress: 65, lastSession: '2 days ago', nextSession: 'Today' },
//     { name: 'Alex Thompson', progress: 45, lastSession: '3 days ago', nextSession: 'Today' }
//   ];

//   return (
//     <div className="dashboard-home">
//       {/* Header with Live Time */}
//       <div className="dashboard-header">
//         <div className="header-content">
//           <div className="welcome-section">
//             <h1 className="welcome-title">Welcome back, Therapist!</h1>
//             <p className="welcome-subtitle">
//               Here's what's happening with your clients today
//             </p>
//           </div>
//           <div className="time-section">
//             <div className="current-time">{formatTime(currentTime)}</div>
//             <div className="current-date">{formatDate(currentTime)}</div>
//           </div>
//         </div>
//       </div>

//       {/* Quick Stats */}
//       <div className="stats-section">
//         <div className="stats-grid">
//           {statsData.map((stat, index) => (
//             <div key={index} className="stat-card">
//               <div className={`stat-icon ${stat.bgColor}`}>
//                 <stat.icon className={stat.color.replace('bg-', 'text-')} size={24} />
//               </div>
//               <div className="stat-content">
//                 <h3 className="stat-value">{stat.value}</h3>
//                 <p className="stat-label">{stat.title}</p>
//                 <span className="stat-change">{stat.change}</span>
//               </div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Today's Schedule & Recent Activities */}
//       <div className="schedule-section">
//         <div className="schedule-grid">
//           {/* Today's Appointments */}
//           <div className="schedule-card">
//             <h3 className="card-title">Today's Schedule</h3>
//             <div className="appointments-list">
//               {todayAppointments.map((appointment, index) => (
//                 <div key={index} className={`appointment-item ${appointment.status}`}>
//                   <div className="appointment-time">{appointment.time}</div>
//                   <div className="appointment-content">
//                     <h4 className="appointment-client">{appointment.client}</h4>
//                     <p className="appointment-type">{appointment.type}</p>
//                   </div>
//                   <div className={`appointment-status ${appointment.status}`}>
//                     {appointment.status === 'completed' ? '✓' : '⏰'}
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>

//           {/* Recent Activities */}
//           <div className="activities-card">
//             <h3 className="card-title">Recent Activities</h3>
//             <div className="activities-list">
//               {recentActivities.map((activity, index) => (
//                 <div key={index} className="activity-item">
//                   <div className="activity-icon">{activity.icon}</div>
//                   <div className="activity-content">
//                     <p className="activity-text">{activity.text}</p>
//                     <span className="activity-time">{activity.time}</span>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Client Progress Overview */}
//       <div className="progress-section">
//         <h2 className="section-title">Client Progress Overview</h2>
//         <div className="progress-grid">
//           {clientProgress.map((client, index) => (
//             <div key={index} className="client-progress-card">
//               <div className="client-header">
//                 <h4 className="client-name">{client.name}</h4>
//                 <span className="progress-percentage">{client.progress}%</span>
//               </div>
//               <div className="progress-bar">
//                 <div 
//                   className="progress-fill bg-green-500"
//                   style={{ width: `${client.progress}%` }}
//                 ></div>
//               </div>
//               <div className="client-sessions">
//                 <span className="last-session">Last: {client.lastSession}</span>
//                 <span className="next-session">Next: {client.nextSession}</span>
//               </div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Quick Actions */}
//       <div className="quick-actions">
//         <h2 className="section-title">Quick Actions</h2>
//         <div className="actions-grid">
//           <div className="action-card">
//             <div className="action-icon bg-blue-100">
//               <MessageSquare className="text-blue-600" size={24} />
//             </div>
//             <h3>Check Messages</h3>
//             <p>5 unread messages from clients</p>
//           </div>
//           <div className="action-card">
//             <div className="action-icon bg-green-100">
//               <Calendar className="text-green-600" size={24} />
//             </div>
//             <h3>View Schedule</h3>
//             <p>3 appointments today</p>
//           </div>
//           <div className="action-card">
//             <div className="action-icon bg-purple-100">
//               <Users className="text-purple-600" size={24} />
//             </div>
//             <h3>Client List</h3>
//             <p>8 active clients</p>
//           </div>
//           <div className="action-card">
//             <div className="action-icon bg-orange-100">
//               <Award className="text-orange-600" size={24} />
//             </div>
//             <h3>Progress Notes</h3>
//             <p>Update client progress</p>
//           </div>
//         </div>
//       </div>

//       {/* Crisis Alerts & Priority Notifications */}
//       {crisisAlerts.length > 0 && (
//         <div className="crisis-alerts-section">
//           <h2 className="section-title">
//             <AlertTriangle className="text-red-500" size={24} />
//             Crisis Alerts
//           </h2>
//           <div className="alerts-grid">
//             {crisisAlerts.map((alert) => (
//               <div key={alert.id} className="alert-card urgent">
//                 <div className="alert-header">
//                   <AlertTriangle size={20} />
//                   <span className="alert-priority">HIGH PRIORITY</span>
//                 </div>
//                 <h4 className="alert-title">{alert.title}</h4>
//                 <p className="alert-message">{alert.message}</p>
//                 <div className="alert-meta">
//                   <span className="alert-client">Client: {alert.clientName}</span>
//                   <span className="alert-time">{new Date(alert.createdAt).toLocaleString()}</span>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       {/* Pending Tasks & Documentation Alerts */}
//       {pendingTasks.length > 0 && (
//         <div className="pending-tasks-section">
//           <h2 className="section-title">
//             <CheckCircle className="text-yellow-500" size={24} />
//             Pending Tasks & Documentation
//           </h2>
//           <div className="tasks-list">
//             {pendingTasks.map((task) => (
//               <div key={task.id} className="task-item">
//                 <div className="task-icon">
//                   {task.type === 'note' ? <FileText size={20} /> : <CheckCircle size={20} />}
//                 </div>
//                 <div className="task-content">
//                   <h4 className="task-title">{task.title}</h4>
//                   <p className="task-description">{task.description}</p>
//                   <div className="task-meta">
//                     <span className="task-due">Due: {new Date(task.dueDate).toLocaleDateString()}</span>
//                     <span className="task-priority">{task.priority}</span>
//                   </div>
//                 </div>
//                 <div className="task-actions">
//                   <button className="btn-primary small">Complete</button>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       {/* System Announcements & Updates */}
//       {systemAnnouncements.length > 0 && (
//         <div className="announcements-section">
//           <h2 className="section-title">
//             <Bell className="text-blue-500" size={24} />
//             System Announcements
//           </h2>
//           <div className="announcements-list">
//             {systemAnnouncements.map((announcement) => (
//               <div key={announcement.id} className="announcement-card">
//                 <div className="announcement-header">
//                   <h4 className="announcement-title">{announcement.title}</h4>
//                   <span className="announcement-date">{new Date(announcement.createdAt).toLocaleDateString()}</span>
//                 </div>
//                 <p className="announcement-content">{announcement.content}</p>
//                 {announcement.important && (
//                   <div className="announcement-badge">Important</div>
//                 )}
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       {/* Weather & Location Info */}
//       <div className="weather-section">
//         <h2 className="section-title">
//           <Cloud className="text-blue-500" size={24} />
//           Weather & Location
//         </h2>
//         <div className="weather-card">
//           <div className="weather-info">
//             <div className="weather-main">
//               <Cloud size={32} className="weather-icon" />
//               <div className="weather-details">
//                 <div className="weather-temp">{weather.temp}°F</div>
//                 <div className="weather-condition">{weather.condition}</div>
//               </div>
//             </div>
//             <div className="weather-location">
//               <MapPin size={16} />
//               <span>{weather.location}</span>
//             </div>
//           </div>
//           <div className="weather-note">
//             <p>Perfect weather for home visits today!</p>
//           </div>
//         </div>
//       </div>

//       {/* Recent Messages Preview */}
//       {recentMessages.length > 0 && (
//         <div className="recent-messages-section">
//           <h2 className="section-title">
//             <MessageSquare className="text-green-500" size={24} />
//             Recent Messages
//           </h2>
//           <div className="messages-preview">
//             {recentMessages.map((message) => (
//               <div key={message.id} className="message-preview-item">
//                 <div className="message-sender">{message.senderName}</div>
//                 <div className="message-preview">{message.preview}</div>
//                 <div className="message-time">{new Date(message.timestamp).toLocaleTimeString()}</div>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       {/* Calendar Preview - Next 3-5 Appointments */}
//       {upcomingAppointments.length > 0 && (
//         <div className="calendar-preview-section">
//           <h2 className="section-title">
//             <Calendar className="text-purple-500" size={24} />
//             Upcoming Appointments
//           </h2>
//           <div className="calendar-preview">
//             {upcomingAppointments.slice(0, 5).map((appointment) => (
//               <div key={appointment.id} className="appointment-preview-item">
//                 <div className="appointment-time">
//                   {new Date(appointment.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
//                 </div>
//                 <div className="appointment-details">
//                   <div className="appointment-client">{appointment.clientName}</div>
//                   <div className="appointment-type">{appointment.sessionType}</div>
//                 </div>
//                 <div className="appointment-status upcoming">Upcoming</div>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }





import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, MessageSquare, TrendingUp, Activity, Clock, Target, Award, AlertTriangle, Bell, Cloud, MapPin, Plus, UserPlus, Phone, FileText, CheckCircle, XCircle, BarChart3, LineChart, TrendingDown, Heart, Video, StickyNote, User, DollarSign } from 'lucide-react';
import { auth, db } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart as RechartsLineChart, Line, AreaChart, Area, ComposedChart, PieChart, Pie, Cell, Legend } from 'recharts';
import './Home.css';

// Function to calculate therapy progress based on therapy note data
const calculateTherapyProgress = (therapyNotes) => {
  if (!therapyNotes || therapyNotes.length === 0) {
    return { overallProgress: 0, moodScore: 0, progressScore: 0, ratingScore: 0 };
  }

  // Base progress: 5% per completed session (max 50% from sessions alone)
  const baseProgress = Math.min(50, therapyNotes.length * 5);

  // Mood/Emotional State scoring (0-1 multiplier) - Affects quality multiplier
  const moodMultipliers = {
    'Depressed': 0.2,    // Very low multiplier
    'Sad': 0.3,          // Low multiplier
    'Anxious': 0.4,      // Below average multiplier
    'Stressed': 0.5,     // Below average multiplier
    'Angry': 0.4,        // Below average multiplier
    'Neutral': 0.7,      // Average multiplier
    'Calm': 0.9,         // Good multiplier
    'Hopeful': 0.95,     // Very good multiplier
    'Optimistic': 1.0,   // Excellent multiplier
    'Excited': 1.0       // Outstanding multiplier
  };

  // Progress Assessment scoring (0-1 multiplier) - Affects quality multiplier
  const progressMultipliers = {
    'Worsened': 0.1,              // Very low multiplier
    'Slight Decline': 0.3,        // Low multiplier
    'No Change': 0.5,             // Below average multiplier
    'Slight Improvement': 0.8,    // Average multiplier
    'Improved': 1.0,              // Good multiplier
    'Significantly Improved': 1.2 // Excellent multiplier (can exceed 1.0)
  };

  // Calculate average multipliers
  let totalMoodMultiplier = 0;
  let totalProgressMultiplier = 0;
  let totalRatingScore = 0;
  let validNotes = 0;

  therapyNotes.forEach(note => {
    // Mood/Emotional State multiplier
    if (note.mood && moodMultipliers[note.mood] !== undefined) {
      totalMoodMultiplier += moodMultipliers[note.mood];
      validNotes++;
    }

    // Progress Assessment multiplier
    if (note.progressAssessment && progressMultipliers[note.progressAssessment] !== undefined) {
      totalProgressMultiplier += progressMultipliers[note.progressAssessment];
    }

    // Mood/Progress Rating score (1-10 scale, convert to 0-1 multiplier)
    if (note.moodRating && note.moodRating >= 1 && note.moodRating <= 10) {
      totalRatingScore += (note.moodRating / 10);
    }
  });

  // Calculate averages
  const avgMoodMultiplier = validNotes > 0 ? totalMoodMultiplier / validNotes : 0.5;
  const avgProgressMultiplier = validNotes > 0 ? totalProgressMultiplier / validNotes : 0.5;
  const avgRatingMultiplier = validNotes > 0 ? totalRatingScore / validNotes : 0.5;

  // Quality multiplier: 40% mood, 40% progress assessment, 20% mood rating
  const qualityMultiplier = Math.max(0.1, Math.min(1.5, 
    (avgMoodMultiplier * 0.4) + 
    (avgProgressMultiplier * 0.4) + 
    (avgRatingMultiplier * 0.2)
  ));

  // Time-based bonus: Additional 1% per month of therapy (max 20%)
  const monthsInTherapy = therapyNotes.length / 4; // Assuming 1 session per week
  const timeBonus = Math.min(20, monthsInTherapy * 1);

  // Consistency bonus: Reward sustained positive trends
  let consistencyBonus = 0;
  if (therapyNotes.length >= 3) {
    const recentNotes = therapyNotes.slice(-3); // Last 3 sessions
    const positiveCount = recentNotes.filter(note => 
      (note.mood && ['Calm', 'Hopeful', 'Optimistic', 'Excited'].includes(note.mood)) ||
      (note.progressAssessment && ['Improved', 'Significantly Improved'].includes(note.progressAssessment)) ||
      (note.moodRating && note.moodRating >= 7)
    ).length;
    consistencyBonus = (positiveCount / 3) * 10; // Up to 10% bonus
  }

  // Final calculation: Base progress + time bonus + consistency bonus, all multiplied by quality
  const rawProgress = baseProgress + timeBonus + consistencyBonus;
  const finalProgress = Math.round(rawProgress * qualityMultiplier);

  // Ensure progress is between 0 and 100
  const cappedProgress = Math.max(0, Math.min(100, finalProgress));

  return {
    overallProgress: cappedProgress,
    moodScore: Math.round(avgMoodMultiplier * 100),
    progressScore: Math.round(avgProgressMultiplier * 100),
    ratingScore: Math.round(avgRatingMultiplier * 100),
    totalNotes: therapyNotes.length,
    validNotes: validNotes,
    baseProgress: baseProgress,
    timeBonus: timeBonus,
    consistencyBonus: consistencyBonus,
    qualityMultiplier: qualityMultiplier
  };
};

export default function TherapistHome() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather, setWeather] = useState({ temp: 72, condition: 'Sunny', location: 'New York, NY' });
  const [crisisAlerts, setCrisisAlerts] = useState([]);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [systemAnnouncements, setSystemAnnouncements] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [therapyBooks, setTherapyBooks] = useState([]);
  const [therapistResources, setTherapistResources] = useState([]);
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [clientNotes, setClientNotes] = useState([]);
  const [authUsers, setAuthUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Chart data states - will be populated with real data
  const [chartData, setChartData] = useState({
    monthlySessions: [],
    clientAgeDistribution: [],
    sessionTypes: [],
    messageTypes: [],
    clientDemographics: [],
    therapyTypes: [],
    weeklyProgress: [],
    clientProgress: [],
    appointmentStatus: [],
    messageActivity: []
  });
  
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Calendar state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const [kpis, setKpis] = useState({
    weeklySessions: 0,
    pendingNotes: 0,
    activeClients: 0,
    completionRate: 0,
    totalResources: 0,
    totalNotes: 0,
    totalBooks: 0,
    monthlySessions: 0,
    averageMoodRating: 0,
    completedSessions: 0,
    totalMessages: 0
  });
  
  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch comprehensive data using correct collection names
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setIsDataLoaded(false);
      return;
    }

    let isMounted = true; // Prevent state updates if component unmounts

    const fetchAllData = async () => {
      try {
        console.log('Fetching data for user:', currentUser.uid);
        setIsDataLoaded(false);
        
        // Fetch all data collections using simple queries (no complex indexes needed)
        const [
          clientsSnap,
          scheduledCallsSnap,
          therapistChatsSnap,
          clientChatsSnap,
          therapistsSnap,
          videoCallsSnap
        ] = await Promise.all([
          getDocs(collection(db, 'clients')), // Get all clients, filter in code
          getDocs(collection(db, 'scheduledCalls')), // Get all calls, filter in code
          getDocs(collection(db, 'therapist_chats')), // Get all chats, filter in code
          getDocs(collection(db, 'clients_chats')), // Get all chats, filter in code
          getDocs(collection(db, 'therapists')), // Get all therapists, filter in code
          getDocs(collection(db, 'videoCalls')) // Get all video calls, filter in code
        ]);

        // Filter data for current user - using the correct method for therapist-client assignments
        // First get assigned client IDs from the therapist's subcollection
        const therapistClientsCol = collection(db, 'therapists', currentUser.uid, 'clients');
        const therapistClientsSnap = await getDocs(therapistClientsCol);
        const assignedClientIds = therapistClientsSnap.docs.map(doc => doc.data().clientId);
        
        console.log('🔍 Assigned client IDs from subcollection:', assignedClientIds);
        
        // Then filter clients based on these IDs
        const allClients = clientsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(client => assignedClientIds.includes(client.id));
        
        console.log('👥 Clients found in main collection:', allClients.map(c => ({ 
          id: c.id, 
          name: c.name, 
          displayName: c.displayName, 
          clientName: c.clientName, 
          email: c.email 
        })));
        
        // Filter scheduled calls - check both therapistId and createdBy fields
        const allScheduledCalls = scheduledCallsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(call => 
            call.therapistId === currentUser.uid || 
            call.createdBy === currentUser.uid ||
            (call.assignedTherapistId && call.assignedTherapistId === currentUser.uid)
          );

        console.log('📅 Raw scheduled calls data:', scheduledCallsSnap.docs.length, 'total calls');
        console.log('📅 Sample scheduled call:', scheduledCallsSnap.docs[0]?.data());
        console.log('📅 All scheduled calls for debugging:', scheduledCallsSnap.docs.map(doc => ({
          id: doc.id,
          data: doc.data(),
          scheduledTime: doc.data().scheduledTime,
          clientName: doc.data().clientName,
          clientId: doc.data().clientId,
          therapistId: doc.data().therapistId,
          createdBy: doc.data().createdBy
        })));
        console.log('📅 Filtered scheduled calls for user:', allScheduledCalls.length);
        console.log('📅 Sample filtered call:', allScheduledCalls[0]);
        
        // Messages are stored in subcollections, so we need to fetch them differently
        // For now, we'll get messages from the assigned clients' chat subcollections
        const allTherapistChats = [];
        const allClientChats = [];
        
        // Fetch messages from each assigned client's chat subcollection
        for (const clientId of assignedClientIds) {
          try {
            // Fetch from client_chats/{clientId}/messages - BOTH directions (client to therapist AND therapist to client)
            const clientMessagesRef = collection(db, 'client_chats', clientId, 'messages');
            const clientMessagesSnap = await getDocs(clientMessagesRef);
            const clientMessages = clientMessagesSnap.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter(msg => msg.from === currentUser.uid || msg.to === currentUser.uid);
            allClientChats.push(...clientMessages);
            
            // Fetch from therapist_chats/{therapistId}/messages - BOTH directions (therapist to client AND client to therapist)
            const therapistMessagesRef = collection(db, 'therapist_chats', currentUser.uid, 'messages');
            const therapistMessagesSnap = await getDocs(therapistMessagesRef);
            const therapistMessages = therapistMessagesSnap.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter(msg => msg.to === clientId || msg.from === clientId);
            allTherapistChats.push(...therapistMessages);
          } catch (error) {
            console.error(`Error fetching messages for client ${clientId}:`, error);
          }
        }
        
        // Fetch therapist-to-therapist messages from therapist_chats collection
        try {
          const therapistChatsRef = collection(db, 'therapist_chats');
          const therapistChatsSnap = await getDocs(therapistChatsRef);
          const therapistToTherapistMessages = therapistChatsSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(chat => chat.from === currentUser.uid || chat.to === currentUser.uid);
          allTherapistChats.push(...therapistToTherapistMessages);
        } catch (error) {
          console.error('Error fetching therapist-to-therapist messages:', error);
        }
        
        // Filter video calls - check multiple possible fields
        const allVideoCalls = videoCallsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(call => 
            call.uid === currentUser.uid ||
            call.therapistId === currentUser.uid ||
            call.createdBy === currentUser.uid
          );

        // Log current user and sample data to understand the structure
        console.log('🔍 Current user ID for filtering:', currentUser.uid);
        console.log('📊 Total scheduled calls in collection:', scheduledCallsSnap.docs.length);
        console.log('📊 Total therapist chats in collection:', therapistChatsSnap.docs.length);
        console.log('📊 Total client chats in collection:', clientChatsSnap.docs.length);
        console.log('📊 Total video calls in collection:', videoCallsSnap.docs.length);
        
        console.log('📊 Sample scheduled calls data:', scheduledCallsSnap.docs.slice(0, 2).map(doc => ({ id: doc.id, ...doc.data() })));
        console.log('📊 Sample therapist chats data:', therapistChatsSnap.docs.slice(0, 2).map(doc => ({ id: doc.id, ...doc.data() })));
        console.log('📊 Sample client chats data:', clientChatsSnap.docs.slice(0, 2).map(doc => ({ id: doc.id, ...doc.data() })));
        console.log('📊 Sample video calls data:', videoCallsSnap.docs.slice(0, 2).map(doc => ({ id: doc.id, ...doc.data() })));
        console.log('🔍 Video calls filtering check - looking for user ID:', currentUser.uid);
        console.log('📊 All video calls field analysis:', videoCallsSnap.docs.slice(0, 5).map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            fields: Object.keys(data),
            uid: data.uid,
            therapistId: data.therapistId,
            createdBy: data.createdBy,
            clientId: data.clientId
          };
        }));

        console.log('📊 Messages fetched from subcollections:', {
          therapistChats: allTherapistChats.length,
          clientChats: allClientChats.length,
          totalMessages: allTherapistChats.length + allClientChats.length
        });

        console.log('Filtered data for user:', {
          clients: allClients.length,
          scheduledCalls: allScheduledCalls.length,
          therapistChats: allTherapistChats.length,
          clientChats: allClientChats.length,
          videoCalls: allVideoCalls.length
        });

        // Set basic data
        setAllClients(allClients);
        setScheduledCalls(allScheduledCalls);
        setRecentMessages([
          ...allTherapistChats.slice(0, 5),
          ...allClientChats.slice(0, 5)
        ]);
        setUpcomingAppointments(allScheduledCalls.filter(call => {
          const callDate = call.scheduledTime?.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
          return callDate >= new Date();
        }).slice(0, 5));

        // Fetch therapy notes for each client to calculate progress based on therapy note data
        const clientsWithProgress = await Promise.all(allClients.map(async (client) => {
          try {
            // Fetch therapy notes for this client
            const notesRef = collection(db, 'clients', client.id, 'therapyNotes');
            const notesSnapshot = await getDocs(notesRef);
            const therapyNotes = notesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));

            // Calculate progress based on therapy note data (Mood/Emotional State, Mood/Progress Rating, Progress Assessment)
            let progressPercentage = 0;
            let statusDisplay = client.status || 'active';
            
            if (therapyNotes.length === 0) {
              // No therapy notes yet
              progressPercentage = 0;
            } else {
              // Calculate progress based on therapy note data
              const progressData = calculateTherapyProgress(therapyNotes);
              progressPercentage = progressData.overallProgress;
            }
            
            // Apply status-based caps
            if (client.status === 'discharged') {
              // Discharged clients can reach 100%
              progressPercentage = Math.min(100, progressPercentage);
            } else {
              // Active, on hold, and inactive clients max at 95%
              progressPercentage = Math.min(95, progressPercentage);
            }
            
            // Set status display
            if (client.status === 'on_hold') {
              statusDisplay = 'On Hold';
            } else if (client.status === 'inactive') {
              statusDisplay = 'Inactive';
            }

            // Count sessions (therapy notes + scheduled calls for this client)
            const clientScheduledCalls = allScheduledCalls.filter(call => 
              call.clientId === client.id || call.clientName === (client.displayName || client.clientName || client.name)
            );
            const sessionCount = therapyNotes.length + clientScheduledCalls.length;

            console.log(`📊 Client ${client.displayName || client.clientName || client.name} (${client.id}):`, {
              status: client.status,
              statusDisplay: statusDisplay,
              therapyNotes: therapyNotes.length,
              scheduledCalls: clientScheduledCalls.length,
              totalSessions: sessionCount,
              progressPercentage: progressPercentage,
              therapyProgress: therapyNotes.length > 0 ? calculateTherapyProgress(therapyNotes) : null
            });

            return {
              ...client,
              sessions: sessionCount,
              progress: progressPercentage,
              statusDisplay: statusDisplay,
              therapyNotes: therapyNotes
            };
          } catch (error) {
            console.error(`Error fetching data for client ${client.id}:`, error);
            return {
              ...client,
              sessions: 0,
              progress: 0,
              therapyNotes: []
            };
          }
        }));

        console.log('🎯 Clients with progress data:', clientsWithProgress.map(c => ({
          name: c.name,
          sessions: c.sessions,
          progress: c.progress
        })));

        // Process chart data with filtered data
        processChartData({
          clients: clientsWithProgress,
          scheduledCalls: allScheduledCalls,
          therapistChats: allTherapistChats,
          clientChats: allClientChats,
          videoCalls: allVideoCalls
        });

        // Calculate KPIs using filtered data
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        const monthlyStart = new Date();
        monthlyStart.setDate(1);
        monthlyStart.setHours(0, 0, 0, 0);

        const weeklySessions = allScheduledCalls.filter(call => {
          const callDate = call.scheduledTime?.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
          return callDate >= weekStart;
        }).length;

        const monthlySessions = allScheduledCalls.filter(call => {
          const callDate = call.scheduledTime?.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
          return callDate >= monthlyStart;
        }).length;

        const completedSessions = allScheduledCalls.filter(call => call.status === 'completed').length;
        
        const totalMessages = allTherapistChats.length + allClientChats.length;
        
        // Calculate total sessions from therapy notes
        const totalSessions = clientsWithProgress.reduce((sum, client) => sum + (client.sessions || 0), 0);
        
        // Calculate average progress (completion rate)
        const averageProgress = clientsWithProgress.length > 0 
          ? Math.round(clientsWithProgress.reduce((sum, client) => sum + (client.progress || 0), 0) / clientsWithProgress.length)
          : 0;

        // Calculate total sessions (all scheduled calls + therapy notes)
        const totalSessionsCount = allScheduledCalls.length + totalSessions;

        console.log('📊 KPI Calculations:', {
          totalSessionsCount,
          averageProgress,
          totalSessions,
          totalMessages: allTherapistChats.length + allClientChats.length
        });

        if (isMounted) {
        setKpis({
            weeklySessions: totalSessionsCount,
            pendingNotes: 0, // No pending notes collection
            activeClients: clientsWithProgress.length,
            completionRate: averageProgress, // Use average progress of all clients
            totalResources: 0, // No resources collection
            totalNotes: 0, // No notes collection
            totalBooks: 0, // No books collection
            monthlySessions: monthlySessions,
            averageMoodRating: averageProgress, // Use average progress as mood rating
            completedSessions: completedSessions,
            totalMessages: allTherapistChats.length + allClientChats.length,
            totalSessions: totalSessions
          });
          
          // Generate notifications from the fetched data
          const newNotifications = generateNotifications(
            allScheduledCalls, 
            allTherapistChats, 
            allClientChats, 
            clientNotes, 
            allClients
          );
          setNotifications(newNotifications);
          setUnreadCount(newNotifications.filter(n => n.unread).length);
          
          setIsDataLoaded(true);
        }

      } catch (error) {
        console.error('Error fetching data:', error);
        if (isMounted) {
          setIsDataLoaded(true); // Still show data even if there's an error
        }
      }
    };

    fetchAllData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Process chart data with memoization to prevent re-processing
  const processChartData = (data) => {
    const { clients, scheduledCalls, therapistChats, clientChats, videoCalls } = data;
    
    console.log('Processing chart data:', { 
      clients: clients.length, 
      scheduledCalls: scheduledCalls.length, 
      therapistChats: therapistChats.length,
      clientChats: clientChats.length,
      videoCalls: videoCalls.length
    });
    
    // Monthly sessions data using real client session data
    const monthlySessions = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      let monthSessions = 0;
      
      // Count from scheduled calls
      monthSessions += scheduledCalls.filter(call => {
        const callDate = call.scheduledTime?.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime || call.date);
        return callDate.getMonth() === date.getMonth() && callDate.getFullYear() === date.getFullYear();
      }).length;
      
      // Count from therapy notes for all clients
      (clients || []).forEach(client => {
        if (client.therapyNotes) {
          monthSessions += client.therapyNotes.filter(note => {
            const noteDate = new Date(note.sessionDate);
            return noteDate.getMonth() === date.getMonth() && noteDate.getFullYear() === date.getFullYear();
          }).length;
        }
      });
      
      monthlySessions.push({ month: monthName, sessions: monthSessions });
    }

    // Client gender distribution (like the attached image)
    const genderGroups = {};
    (clients || []).forEach(client => {
      if (client && client.gender) {
        const gender = client.gender.toLowerCase();
        // Map gender values to match the image format
        let genderKey = '';
        if (gender === 'male' || gender === 'man') {
          genderKey = 'Male';
        } else if (gender === 'female' || gender === 'woman') {
          genderKey = 'Female';
        } else if (gender === 'non-binary' || gender === 'nonbinary') {
          genderKey = 'I do not identify as either male or female';
        } else {
          genderKey = 'No answer';
        }
        
        genderGroups[genderKey] = (genderGroups[genderKey] || 0) + 1;
      }
    });

    // Client age distribution (like the second attached image)
    const ageGroups = {};
    (clients || []).forEach(client => {
      if (client && client.age) {
        const age = parseInt(client.age);
        let ageGroup = '';
        
        if (age >= 20 && age <= 30) {
          ageGroup = '20-30';
        } else if (age >= 31 && age <= 40) {
          ageGroup = '31-40';
        } else if (age >= 41 && age <= 49) {
          ageGroup = '41-49';
        } else if (age >= 50) {
          ageGroup = '50 and above';
        } else {
          ageGroup = 'Under 20';
        }
        
        ageGroups[ageGroup] = (ageGroups[ageGroup] || 0) + 1;
      }
    });

    // Add fallback data for age groups if no real data
    if (Object.keys(ageGroups).length === 0) {
      ageGroups['20-30'] = 15;
      ageGroups['31-40'] = 20;
      ageGroups['41-49'] = 8;
      ageGroups['50 and above'] = 5;
    }

    // Add fallback data for gender groups if no real data
    if (Object.keys(genderGroups).length === 0) {
      genderGroups['Male'] = 25;
      genderGroups['Female'] = 20;
      genderGroups['I do not identify as either male or female'] = 2;
      genderGroups['No answer'] = 3;
    }

    // Session types using real data from scheduled calls
    const sessionTypes = {};
    
    // Count from scheduled calls - use actual callType values
    (scheduledCalls || []).forEach(call => {
      if (call && call.callType) {
        const type = call.callType; // Use actual callType from scheduledCalls
        sessionTypes[type] = (sessionTypes[type] || 0) + 1;
      }
    });
    
    // Count from therapy notes (individual therapy sessions)
    (clients || []).forEach(client => {
      if (client.therapyNotes) {
        sessionTypes['Individual'] = (sessionTypes['Individual'] || 0) + client.therapyNotes.length;
      }
    });

    // Message types distribution
    const messageTypes = { 'text': 0, 'image': 0, 'file': 0, 'audio': 0, 'video': 0 };
    [...(therapistChats || []), ...(clientChats || [])].forEach(message => {
      if (message) {
        const type = message.type || 'text';
        messageTypes[type] = (messageTypes[type] || 0) + 1;
      }
    });
    
    // Add fallback data only if no real data
    if (Object.values(messageTypes).every(count => count === 0)) {
      messageTypes['text'] = 45;
      messageTypes['image'] = 8;
      messageTypes['file'] = 3;
      messageTypes['audio'] = 2;
      messageTypes['video'] = 1;
    }

    // Client demographics (gender distribution)
    const clientDemographics = {};
    (clients || []).forEach(client => {
      if (client) {
        const gender = client.gender || 'Unknown';
        clientDemographics[gender] = (clientDemographics[gender] || 0) + 1;
      }
    });
    
    // Add fallback data only if no real data
    if (Object.keys(clientDemographics).length === 0) {
      clientDemographics['woman'] = 15;
      clientDemographics['man'] = 12;
      clientDemographics['non-binary'] = 3;
      clientDemographics['prefer not to say'] = 2;
    }

    // Client therapy types
    const therapyTypes = {};
    (clients || []).forEach(client => {
      if (client && client.therapyTypes && Array.isArray(client.therapyTypes)) {
        client.therapyTypes.forEach(type => {
          if (type) {
            therapyTypes[type] = (therapyTypes[type] || 0) + 1;
          }
        });
      }
    });
    
    // Add fallback data only if no real data
    if (Object.keys(therapyTypes).length === 0) {
      therapyTypes['Anxiety therapy'] = 12;
      therapyTypes['Grief therapy'] = 8;
      therapyTypes['Group therapy'] = 6;
      therapyTypes['Individual therapy'] = 15;
      therapyTypes['Couples therapy'] = 4;
    }

    // Weekly progress (last 8 weeks)
    const weeklyProgress = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i * 7));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const weekSessions = (scheduledCalls || []).filter(call => {
        if (!call) return false;
        const callDate = call.scheduledTime?.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
        return callDate >= weekStart && callDate <= weekEnd;
      }).length;
      
      const weekCompleted = (scheduledCalls || []).filter(call => {
        if (!call) return false;
        const callDate = call.scheduledTime?.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
        return callDate >= weekStart && callDate <= weekEnd && call.status === 'completed';
      }).length;
      
      weeklyProgress.push({ 
        week: `Week ${8-i}`, 
        sessions: weekSessions || Math.floor(Math.random() * 15) + 5,
        completed: weekCompleted || Math.floor(Math.random() * 10) + 3
      });
    }

    // Appointment status using videoCalls data
    const appointmentStatus = {};
    (videoCalls || []).forEach(call => {
      if (call) {
        // Map participantRole to status categories
        let status = 'completed'; // Default to completed since these are actual video calls that happened
        if (call.participantRole === 'admin') {
          status = 'admin_call';
        } else if (call.participantRole === 'therapist') {
          status = 'therapist_call';
        } else if (call.participantRole === 'client') {
          status = 'client_call';
        }
        appointmentStatus[status] = (appointmentStatus[status] || 0) + 1;
      }
    });

    // Message activity by day of week
    const messageActivity = { 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0 };
    [...(therapistChats || []), ...(clientChats || [])].forEach(message => {
      if (message && message.createdAt) {
        const date = message.createdAt.toDate ? message.createdAt.toDate() : new Date(message.createdAt);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        messageActivity[dayName] = (messageActivity[dayName] || 0) + 1;
      }
    });
    
    // Add fallback data only if no real data
    if (Object.values(messageActivity).every(count => count === 0)) {
      messageActivity['Monday'] = 8;
      messageActivity['Tuesday'] = 12;
      messageActivity['Wednesday'] = 10;
      messageActivity['Thursday'] = 15;
      messageActivity['Friday'] = 18;
      messageActivity['Saturday'] = 5;
      messageActivity['Sunday'] = 3;
    }

    const chartDataToSet = {
      monthlySessions,
      genderDistribution: Object.entries(genderGroups).map(([gender, count]) => ({ 
        name: gender, 
        value: count,
        percentage: ((count / (clients?.length || 1)) * 100).toFixed(1)
      })),
      ageDistribution: Object.entries(ageGroups).map(([ageGroup, count]) => ({ 
        name: ageGroup, 
        value: count,
        percentage: ((count / (clients?.length || 1)) * 100).toFixed(1)
      })),
      sessionTypes: Object.entries(sessionTypes).map(([type, count]) => ({ type, count })),
      messageTypes: Object.entries(messageTypes).map(([type, count]) => ({ type, count })),
      clientDemographics: Object.entries(clientDemographics).map(([gender, count]) => ({ gender, count })),
      therapyTypes: Object.entries(therapyTypes).map(([type, count]) => ({ type, count })),
      clientProgress: (clients && clients.length > 0) ? clients.map(client => ({
        name: client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown',
        progress: client?.progress || 0,
        sessions: client?.sessions || 0,
        status: client?.statusDisplay || client?.status || 'active'
      })) : [
        { name: 'Client A', progress: 85, sessions: 12, status: 'active' },
        { name: 'Client B', progress: 72, sessions: 8, status: 'active' },
        { name: 'Client C', progress: 90, sessions: 15, status: 'discharged' },
        { name: 'Client D', progress: 65, sessions: 6, status: 'On Hold' },
        { name: 'Client E', progress: 78, sessions: 10, status: 'inactive' }
      ],
      appointmentStatus: Object.entries(appointmentStatus).map(([status, count]) => ({ status, count })),
      messageActivity: Object.entries(messageActivity).map(([day, count]) => ({ day, count }))
    };
    
    // Log final chart data once for debugging
    console.log('📊 Final chart data for pie charts:');
    console.log('📊 Raw genderGroups:', genderGroups);
    console.log('📊 genderDistribution:', chartDataToSet.genderDistribution);
    console.log('📊 Raw ageGroups:', ageGroups);
    console.log('📊 ageDistribution:', chartDataToSet.ageDistribution);
    
    setChartData(chartDataToSet);
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

  // Get greeting based on time
  const getGreeting = (date) => {
    const hour = date.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'session':
        return <Video size={16} />;
      case 'message':
        return <MessageSquare size={16} />;
      case 'note':
        return <StickyNote size={16} />;
      case 'client':
        return <Users size={16} />;
      case 'system':
        return <Activity size={16} />;
      default:
        return <Bell size={16} />;
    }
  };

  // Generate real notifications from data
  const generateNotifications = (scheduledCallsData, therapistChatsData, clientChatsData, clientNotesData, allClientsData) => {
    const now = new Date();
    const notifications = [];

    // Recent scheduled calls (upcoming sessions) - only show if within next 2 hours
    const upcomingSessions = scheduledCallsData.filter(call => {
      if (!call.scheduledTime) return false;
      const callTime = call.scheduledTime.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
      const timeDiff = callTime.getTime() - now.getTime();
      return timeDiff > 0 && timeDiff <= 2 * 60 * 60 * 1000; // Next 2 hours only
    });

    upcomingSessions.forEach((call, index) => {
      const callTime = call.scheduledTime.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
      const timeDiff = callTime.getTime() - now.getTime();
      const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      
      let timeText = '';
      if (hoursUntil > 0) {
        timeText = `${hoursUntil} hour${hoursUntil > 1 ? 's' : ''} from now`;
      } else {
        timeText = `${minutesUntil} minute${minutesUntil > 1 ? 's' : ''} from now`;
      }

      notifications.push({
        id: `session-${call.id || index}`,
        title: 'Upcoming Session',
        message: `Session with ${call.clientName || 'Client'} at ${callTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        time: timeText,
        type: 'session',
        unread: true,
        timestamp: callTime
      });
    });

    // Enhanced message notifications - show all recent messages from clients
    const recentMessages = [...(therapistChatsData || []), ...(clientChatsData || [])]
      .filter(msg => {
        if (!msg.createdAt) return false;
        const msgTime = msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
        const timeDiff = now.getTime() - msgTime.getTime();
        return timeDiff <= 24 * 60 * 60 * 1000; // Last 24 hours
      })
      .sort((a, b) => {
        const timeA = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const timeB = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return timeB.getTime() - timeA.getTime();
      })
      .slice(0, 5);

    recentMessages.forEach((msg, index) => {
      const msgTime = msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
      const timeDiff = now.getTime() - msgTime.getTime();
      const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutesAgo = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      
      let timeText = '';
      if (hoursAgo > 0) {
        timeText = `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;
      } else {
        timeText = `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`;
      }

      // Determine if message is from client to therapist
      const isFromClient = msg.from !== auth.currentUser?.uid;
      const senderName = msg.fromName || (isFromClient ? 'Client' : 'You');

      notifications.push({
        id: `message-${msg.id || index}`,
        title: isFromClient ? 'New Message from Client' : 'Message Sent',
        message: `${senderName}: ${msg.content?.substring(0, 50)}${msg.content?.length > 50 ? '...' : ''}`,
        time: timeText,
        type: 'message',
        unread: isFromClient, // Only mark as unread if from client
        timestamp: msgTime
      });
    });

    // New client notifications - check for recently assigned clients
    const recentClients = allClientsData.filter(client => {
      if (!client.assignedAt) return false;
      const assignedTime = new Date(client.assignedAt);
      const timeDiff = now.getTime() - assignedTime.getTime();
      return timeDiff <= 7 * 24 * 60 * 60 * 1000; // Last 7 days
    });

    recentClients.forEach((client, index) => {
      const assignedTime = new Date(client.assignedAt);
      const timeDiff = now.getTime() - assignedTime.getTime();
      const daysAgo = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hoursAgo = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      let timeText = '';
      if (daysAgo > 0) {
        timeText = `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`;
      } else {
        timeText = `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;
      }

      notifications.push({
        id: `new-client-${client.id || index}`,
        title: 'New Client Assigned',
        message: `${client.displayName || client.clientName || client.name || 'New Client'} has been assigned to you`,
        time: timeText,
        type: 'client',
        unread: true,
        timestamp: assignedTime
      });
    });

    // Recent therapy notes (only very recent ones - last 2 hours)
    const recentNotes = clientNotesData.filter(note => {
      if (!note.sessionDate) return false;
      const noteTime = note.sessionDate.toDate ? note.sessionDate.toDate() : new Date(note.sessionDate);
      const timeDiff = now.getTime() - noteTime.getTime();
      return timeDiff <= 2 * 60 * 60 * 1000; // Last 2 hours only
    }).slice(0, 2);

    recentNotes.forEach((note, index) => {
      const noteTime = note.sessionDate.toDate ? note.sessionDate.toDate() : new Date(note.sessionDate);
      const timeDiff = now.getTime() - noteTime.getTime();
      const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutesAgo = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      
      let timeText = '';
      if (hoursAgo > 0) {
        timeText = `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;
      } else {
        timeText = `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`;
      }
      
      notifications.push({
        id: `note-${note.id || index}`,
        title: 'Therapy Note Added',
        message: `New therapy note for ${note.clientName || 'Client'} - ${note.mood || 'Mood'} assessment`,
        time: timeText,
        type: 'note',
        unread: true,
        timestamp: noteTime
      });
    });

    // Only add system notifications if there are no recent activities
    if (notifications.length === 0) {
      if (allClientsData.length > 0) {
        notifications.push({
          id: 'system-clients',
          title: 'No Recent Activity',
          message: `You have ${allClientsData.length} active client${allClientsData.length > 1 ? 's' : ''} in your care`,
          time: 'Just now',
          type: 'system',
          unread: false,
          timestamp: now
        });
      }
    }

    // Sort by timestamp (most recent first)
    return notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  const statsData = [
    {
      title: 'Active Clients',
      value: (kpis.activeClients || 0).toString(),
      change: 'Currently assigned',
      icon: Users,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'All Sessions',
      value: (kpis.weeklySessions || 0).toString(),
      change: 'Total sessions',
      icon: Calendar,
      color: 'bg-green-500',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Total Messages',
      value: (kpis.totalMessages || 0).toString(),
      change: 'All conversations',
      icon: MessageSquare,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Completion Rate',
      value: `${kpis.completionRate || 0}%`,
      change: 'Session completion',
      icon: TrendingUp,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-100'
    }
  ];


  // Generate appointments from scheduledCalls data (within 2 weeks of current date)
  const todayAppointments = React.useMemo(() => {
    console.log('🔍 Processing appointments, scheduledCalls length:', scheduledCalls?.length || 0);
    console.log('🔍 Available clients for mapping:', allClients?.map(c => ({ id: c.id, name: c.name, displayName: c.displayName })) || []);
    
    if (!scheduledCalls || scheduledCalls.length === 0) {
      console.log('❌ No scheduled calls data available');
      return [];
    }

    const now = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(now.getDate() - 14);
    const twoWeeksFromNow = new Date();
    twoWeeksFromNow.setDate(now.getDate() + 14);

    console.log('📅 Date range:', {
      now: now.toISOString(),
      twoWeeksAgo: twoWeeksAgo.toISOString(),
      twoWeeksFromNow: twoWeeksFromNow.toISOString()
    });

    const filteredCalls = scheduledCalls.filter(call => {
      // Better date parsing with error handling
      let callDate;
      try {
        if (call.scheduledTime?.toDate) {
          callDate = call.scheduledTime.toDate();
        } else if (call.scheduledTime) {
          callDate = new Date(call.scheduledTime);
        } else {
          console.warn('📅 No scheduledTime found for call:', call.id);
          return false;
        }
        
        // Check if date is valid
        if (isNaN(callDate.getTime())) {
          console.warn('📅 Invalid date for call:', call.id, call.scheduledTime);
          return false;
        }
      } catch (error) {
        console.warn('📅 Error parsing date for call:', call.id, error);
        return false;
      }
      
      const isInRange = callDate >= twoWeeksAgo && callDate <= twoWeeksFromNow;
      
      console.log('📅 Checking call:', {
        id: call.id,
        scheduledTime: call.scheduledTime,
        callDate: callDate.toISOString(),
        isInRange,
        clientName: call.clientName,
        clientId: call.clientId,
        createdBy: call.createdBy,
        therapistId: call.therapistId
      });
      
      return isInRange;
    });

    console.log('📅 Filtered calls count:', filteredCalls.length);

    return filteredCalls
      .sort((a, b) => {
        const dateA = a.scheduledTime?.toDate ? a.scheduledTime.toDate() : new Date(a.scheduledTime);
        const dateB = b.scheduledTime?.toDate ? b.scheduledTime.toDate() : new Date(b.scheduledTime);
        return dateA - dateB;
      })
      .slice(0, 8) // Limit to 8 appointments
      .map(call => {
        const callDate = call.scheduledTime?.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
        const isToday = callDate.toDateString() === now.toDateString();
        const isPast = callDate < now;
        
        // Better client name resolution
        let clientName = 'Unknown Client';
        if (call.clientName) {
          clientName = call.clientName;
        } else if (call.clientId) {
          // Try to find client by ID
          const foundClient = allClients?.find(client => client.id === call.clientId);
          if (foundClient) {
            clientName = foundClient.name || foundClient.displayName || foundClient.email || call.clientId;
          } else {
            clientName = call.clientId; // Show the ID if we can't find the client
          }
        }
        
        return {
          time: callDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          }),
          client: clientName,
          type: call.callType || call.sessionType || 'Individual',
          status: isPast ? 'completed' : (isToday ? 'upcoming' : 'scheduled'),
          date: callDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          })
        };
      });
  }, [scheduledCalls, allClients]);

  // Generate recent activities from message data
  const recentActivities = React.useMemo(() => {
    if (!recentMessages || recentMessages.length === 0) {
      return [];
    }

    // Sort messages by timestamp (most recent first)
    const sortedMessages = [...recentMessages].sort((a, b) => {
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || a.timestamp);
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.timestamp);
      return timeB - timeA;
    });

    return sortedMessages
      .slice(0, 6) // Limit to 6 recent activities
      .map(message => {
        const messageTime = message.createdAt?.toDate ? message.createdAt.toDate() : new Date(message.createdAt || message.timestamp);
        const timeDiff = Date.now() - messageTime.getTime();
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        
        let timeAgo;
        if (hours < 1) {
          timeAgo = 'Just now';
        } else if (hours < 24) {
          timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else {
          timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
        }

        // Determine if it's from therapist or client
        const isFromTherapist = message.from === auth.currentUser?.uid;
        const senderName = message.senderName || message.fromName || (isFromTherapist ? 'You' : 'Client');
        
        // Determine message type and icon
        let icon = '💬';
        let activityText = '';
        
        if (message.type === 'image') {
          icon = '📷';
          activityText = isFromTherapist ? `Sent image to ${senderName}` : `Received image from ${senderName}`;
        } else if (message.type === 'file') {
          icon = '📎';
          activityText = isFromTherapist ? `Sent file to ${senderName}` : `Received file from ${senderName}`;
        } else if (message.type === 'audio') {
          icon = '🎵';
          activityText = isFromTherapist ? `Sent voice message to ${senderName}` : `Received voice message from ${senderName}`;
        } else if (message.type === 'video') {
          icon = '🎥';
          activityText = isFromTherapist ? `Sent video to ${senderName}` : `Received video from ${senderName}`;
        } else {
          // Text message
          const messagePreview = message.message || message.text || message.content || '';
          const truncatedMessage = messagePreview.length > 50 ? messagePreview.substring(0, 50) + '...' : messagePreview;
          activityText = isFromTherapist ? `Sent message to ${senderName}: "${truncatedMessage}"` : `Received message from ${senderName}: "${truncatedMessage}"`;
        }

        return {
          type: 'message',
          text: activityText,
          time: timeAgo,
          icon: icon
        };
      });
  }, [recentMessages]);

  const clientProgress = [
    { name: 'Sarah Johnson', progress: 85, lastSession: 'Today', nextSession: 'Next week' },
    { name: 'Mike Chen', progress: 72, lastSession: 'Today', nextSession: 'Next week' },
    { name: 'Emma Davis', progress: 65, lastSession: '2 days ago', nextSession: 'Today' },
    { name: 'Alex Thompson', progress: 45, lastSession: '3 days ago', nextSession: 'Today' }
  ];

  // Calendar helpers
  const apptsByDate = React.useMemo(() => {
    const map = {};
    (scheduledCalls || []).forEach(call => {
      let d;
      try {
        d = call.scheduledTime?.toDate ? call.scheduledTime.toDate() : new Date(call.scheduledTime);
        if (isNaN(d.getTime())) return;
      } catch { return; }
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push({ client: call.clientName || 'Client', status: call.status || 'scheduled' });
    });
    return map;
  }, [scheduledCalls]);

  const calCells = () => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  };

  const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];


  return (
    <div className="dashboard-home">
      {/* Enhanced Header with Time, Greeting, and Notifications */}
      <div className="enhanced-header">
        <div className="header-content">
          <div className="greeting-section">
            <h1 className="greeting">{getGreeting(currentTime)}</h1>
            <div className="time-display">
              <div className="current-time">{formatTime(currentTime)}</div>
              <div className="current-date">{formatDate(currentTime)}</div>
            </div>
          </div>
          <div className="notification-icon" onClick={() => {
            navigate('/dashboard/notifications');
          }}>
            <Bell size={24} />
            {unreadCount > 0 && (
              <span className="notification-badge">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="stats-section">
        <div className="stats-grid">
          {statsData.map((stat, index) => (
            <div key={index} className="stat-card">
              <div className={`stat-icon ${stat.bgColor}`}>
                <stat.icon className={stat.color.replace('bg-', 'text-')} size={24} />
              </div>
              <div className="stat-content">
                <h3 className="stat-value">{stat.value}</h3>
                <p className="stat-label">{stat.title}</p>
                <span className="stat-change">{stat.change}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3-column row: Activities | Calendar | Schedules ── */}
      <div className="schedule-section">
        <div className="schedule-grid-three">

          {/* Recent Activities */}
          <div className="activities-card">
            <h3 className="card-title">Recent Activities</h3>
            <div className="activities-list">
              {recentActivities.length === 0 ? (
                <div className="no-activities"><p>No recent activities</p></div>
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

          {/* Live Calendar */}
          <div className="schedule-card cal-card">
            <div className="cal-header">
              <button className="cal-nav-btn" onClick={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                else setCalMonth(m => m - 1);
              }}>‹</button>
              <span className="cal-month-label">{CAL_MONTHS[calMonth]} {calYear}</span>
              <button className="cal-nav-btn" onClick={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                else setCalMonth(m => m + 1);
              }}>›</button>
            </div>
            <div className="cal-grid">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} className="cal-day-label">{d}</div>
              ))}
              {calCells().map((day, i) => {
                if (!day) return <div key={`e-${i}`} className="cal-cell empty" />;
                const key = `${calYear}-${calMonth}-${day}`;
                const appts = apptsByDate[key] || [];
                const isToday = day === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();
                return (
                  <div key={key} className={`cal-cell${isToday ? ' today' : ''}${appts.length ? ' has-appt' : ''}`}>
                    <span className="cal-day-num">{day}</span>
                    {appts.length > 0 && (
                      <span className="cal-appt-dot" title={appts.map(a => a.client).join(', ')}>
                        {appts.length > 1 ? appts.length : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="cal-legend">
              <span className="cal-legend-dot" />
              <span className="cal-legend-text">Appointment</span>
            </div>
          </div>

          {/* Recent Schedules */}
          <div className="schedule-card">
            <h3 className="card-title">Recent Schedules</h3>
            <div className="appointments-list">
              {todayAppointments.length === 0 ? (
                <div className="no-appointments"><p>No appointments in the last 2 weeks</p></div>
              ) : (
                todayAppointments.map((appointment, index) => (
                  <div key={index} className={`appointment-item ${appointment.status}`}>
                    <div className="appointment-time">
                      <div className="time">{appointment.time}</div>
                      <div className="date">{appointment.date}</div>
                    </div>
                    <div className="appointment-content">
                      <h4 className="appointment-client">{appointment.client}</h4>
                      <p className="appointment-type">{appointment.type}</p>
                    </div>
                    <div className={`appointment-status ${appointment.status}`}>
                      {appointment.status === 'completed' ? '✓' : appointment.status === 'upcoming' ? '⏰' : '📅'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Client Progress Overview — before charts ── */}
      <div className="progress-section">
        <h2 className="section-title">Client Progress Overview</h2>
        <div className="progress-grid">
          {(chartData.clientProgress || []).map((client, index) => (
            <div key={index} className="client-progress-card">
              <div className="client-header">
                <h4 className="client-name">{client.name}</h4>
                <span className="progress-percentage">{client.progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill bg-green-500" style={{ width: `${client.progress}%` }} />
              </div>
              <div className="client-sessions">
                <span className="last-session">Sessions: {client.sessions}</span>
                <span className="next-session">Status: {client.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Charts (unique th-home- prefixed classes, no global conflict) ── */}
      <div className="th-home-charts-grid">
        <div className="th-home-chart-card">
          <div className="th-home-chart-header">
            <h3 className="th-home-chart-title">Monthly Sessions Trend</h3>
            <BarChart3 size={18} color="#3B82F6" />
          </div>
          <div style={{ width: '100%', height: 220, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.monthlySessions || []} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} />
                <Tooltip formatter={(value) => [value, 'Sessions']} />
                <Bar dataKey="sessions" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="th-home-chart-card">
          <div className="th-home-chart-header">
            <h3 className="th-home-chart-title">Message Types Distribution</h3>
            <MessageSquare size={18} color="#f59e0b" />
          </div>
          <div style={{ width: '100%', height: 220, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.messageTypes || []} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} />
                <Tooltip formatter={(value) => [value, 'Messages']} />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="th-home-chart-card">
          <div className="th-home-chart-header">
            <h3 className="th-home-chart-title">Therapy Types Distribution</h3>
            <Heart size={18} color="#ef4444" />
          </div>
          <div style={{ width: '100%', height: 220, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.therapyTypes || []} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} />
                <Tooltip formatter={(value) => [value, 'Clients']} />
                <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    
     

      {/* Crisis Alerts & Priority Notifications */}
      {crisisAlerts.length > 0 && (
        <div className="crisis-alerts-section">
          <h2 className="section-title">
            <AlertTriangle className="text-red-500" size={24} />
            Crisis Alerts
          </h2>
          <div className="alerts-grid">
            {crisisAlerts.map((alert) => (
              <div key={alert.id} className="alert-card urgent">
                <div className="alert-header">
                  <AlertTriangle size={20} />
                  <span className="alert-priority">HIGH PRIORITY</span>
                </div>
                <h4 className="alert-title">{alert.title}</h4>
                <p className="alert-message">{alert.message}</p>
                <div className="alert-meta">
                  <span className="alert-client">Client: {alert.clientName}</span>
                  <span className="alert-time">{new Date(alert.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Tasks & Documentation Alerts */}
      {pendingTasks.length > 0 && (
        <div className="pending-tasks-section">
          <h2 className="section-title">
            <CheckCircle className="text-yellow-500" size={24} />
            Pending Tasks & Documentation
          </h2>
          <div className="tasks-list">
            {pendingTasks.map((task) => (
              <div key={task.id} className="task-item">
                <div className="task-icon">
                  {task.type === 'note' ? <FileText size={20} /> : <CheckCircle size={20} />}
                </div>
                <div className="task-content">
                  <h4 className="task-title">{task.title}</h4>
                  <p className="task-description">{task.description}</p>
                  <div className="task-meta">
                    <span className="task-due">Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                    <span className="task-priority">{task.priority}</span>
                  </div>
                </div>
                <div className="task-actions">
                  <button className="btn-primary small">Complete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Announcements & Updates */}
      {systemAnnouncements.length > 0 && (
        <div className="announcements-section">
          <h2 className="section-title">
            <Bell className="text-blue-500" size={24} />
            System Announcements
          </h2>
          <div className="announcements-list">
            {systemAnnouncements.map((announcement) => (
              <div key={announcement.id} className="announcement-card">
                <div className="announcement-header">
                  <h4 className="announcement-title">{announcement.title}</h4>
                  <span className="announcement-date">{new Date(announcement.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="announcement-content">{announcement.content}</p>
                {announcement.important && (
                  <div className="announcement-badge">Important</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
     

      <>
        
        {/* {recentMessages.length > 0 && (
        <div className="recent-messages-section">
          <h2 className="section-title">
            <MessageSquare className="text-green-500" size={24} />
            Recent Messages
          </h2>
          <div className="messages-preview">
            {recentMessages.map((message) => (
              <div key={message.id} className="message-preview-item">
                <div className="message-sender">{message.senderName}</div>
                <div className="message-preview">{message.preview}</div>
                <div className="message-time">{new Date(message.timestamp).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      )} */}

      {/* Calendar Preview - Next 3-5 Appointments */}
      {upcomingAppointments.length > 0 && (
        <div className="calendar-preview-section">
          <h2 className="section-title">
            <Calendar className="text-purple-500" size={24} />
            Upcoming Appointments
          </h2>
          <div className="calendar-preview">
            {upcomingAppointments.slice(0, 5).map((appointment) => {
              // Better date parsing with error handling
              let appointmentTime = 'Invalid Date';
              try {
                const appointmentDate = appointment.scheduledTime?.toDate ? 
                  appointment.scheduledTime.toDate() : 
                  new Date(appointment.scheduledTime);
                
                if (!isNaN(appointmentDate.getTime())) {
                  appointmentTime = appointmentDate.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  });
                }
              } catch (error) {
                console.warn('Error parsing appointment time:', error);
              }

              // Better client name resolution
              let clientName = appointment.clientName || 'Unknown Client';
              if (!appointment.clientName && appointment.clientId) {
                const foundClient = allClients?.find(client => client.id === appointment.clientId);
                if (foundClient) {
                  clientName = foundClient.name || foundClient.displayName || foundClient.email || appointment.clientId;
                } else {
                  clientName = appointment.clientId;
                }
              }

              return (
              <div key={appointment.id} className="appointment-preview-item">
                <div className="appointment-time">
                    {appointmentTime}
                </div>
                <div className="appointment-details">
                    <div className="appointment-client">{clientName}</div>
                    <div className="appointment-type">{appointment.sessionType || appointment.callType || 'Individual'}</div>
                </div>
                <div className="appointment-status upcoming">Upcoming</div>
              </div>
              );
            })}
          </div>
        </div>
      )}

     

{/* Comprehensive Charts Section */}
<div className="charts-section">
  {/* <h2 className="section-title">Analytics & Insights</h2> */}
  
  {!isDataLoaded ? (
    <div className="loading-charts">
      <div className="loading-spinner"></div>
      <p>Loading charts...</p>
    </div>
  ) : (
    <>
      {/* Second Row - 3 Charts */}
      <div className="th-home-charts-grid">
        <div className="th-home-chart-card">
          <div className="th-home-chart-header">
            <h3 className="th-home-chart-title">Gender Distribution</h3>
            <Users size={18} color="#4f46e5" />
          </div>
          <div style={{ width: '100%', height: 220, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.genderDistribution || []}
                  isAnimationActive={false}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  outerRadius={70}
                  dataKey="value"
                >
                  {chartData.genderDistribution?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#4f46e5', '#10B981', '#F59E0B', '#EF4444'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name, props) => [`${value} (${props.payload.percentage}%)`, 'Count']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="th-home-chart-card">
          <div className="th-home-chart-header">
            <h3 className="th-home-chart-title">Age Distribution</h3>
            <Calendar size={18} color="#10b981" />
          </div>
          <div style={{ width: '100%', height: 220, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.ageDistribution || []}
                  isAnimationActive={false}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  outerRadius={70}
                  dataKey="value"
                >
                  {chartData.ageDistribution?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#F59E0B', '#4f46e5', '#EF4444', '#10B981'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name, props) => [`${value} (${props.payload.percentage}%)`, 'Count']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="th-home-chart-card">
          <div className="th-home-chart-header">
            <h3 className="th-home-chart-title">Client Progress Chart</h3>
            <TrendingUp size={18} color="#10b981" />
          </div>
          <div style={{ width: '100%', height: 220, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.clientProgress || []} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} />
                <Tooltip formatter={(value, name) => [value, name === 'progress' ? 'Progress %' : 'Sessions']} />
                <Bar dataKey="progress" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Progress %" />
                <Bar dataKey="sessions" fill="#10B981" radius={[4, 4, 0, 0]} name="Sessions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </>
  )}

      {/* Notification Modal */}
      {showNotificationModal && (
        <div className="notification-modal-overlay" onClick={() => setShowNotificationModal(false)}>
          <div className="notification-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notification-header">
              <h3>Notifications</h3>
              <button 
                className="close-btn"
                onClick={() => setShowNotificationModal(false)}
              >
                ×
              </button>
            </div>
            <div className="notification-list">
              {notifications.length === 0 ? (
                <div className="no-notifications">
                  <Bell size={48} />
                  <p>No notifications</p>
                </div>
              ) : (
                notifications.map(notification => (
                  <div 
                    key={notification.id} 
                    className={`notification-item ${notification.unread ? 'unread' : ''}`}
                  >
                    <div className="notification-icon-small">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="notification-content">
                      <h4 className="notification-title">{notification.title}</h4>
                      <p className="notification-message">{notification.message}</p>
                      <span className="notification-time">{notification.time}</span>
                    </div>
                    {notification.unread && <div className="unread-indicator"></div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
  )}
</div>
      </>
    </div>
  );
}
