// import React, { useState, useEffect } from 'react';
// import { collection, query, where, getDocs, addDoc, orderBy, onSnapshot, Timestamp, doc, getDoc } from '../../services/firestoreShim';
// import { db, functions, httpsCallable, auth } from '../../services/firestoreShim';
// import { Phone, Calendar, Clock, User } from 'lucide-react';
// import { onAuthStateChanged } from '../../services/authShim';
// import './VideoCall.css';

// const VideoCall = ({ user }) => {
//   const [assignedPerson, setAssignedPerson] = useState(null);
//   const [scheduledCalls, setScheduledCalls] = useState([]);
//   const [showScheduleForm, setShowScheduleForm] = useState(false);
//   const [scheduleForm, setScheduleForm] = useState({
//     date: '',
//     time: '',
//     duration: '30',
//     notes: ''
//   });
//   const [isLoadingCalls, setIsLoadingCalls] = useState(false);
//   const [incomingCall, setIncomingCall] = useState(null);
//   const [authUser, setAuthUser] = useState(null);

//   useEffect(() => {
//     // Listen for authentication state changes
//     const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
//       if (user) {
//         setAuthUser(user);
//         console.log('Authenticated user:', user.uid);
//       } else {
//         setAuthUser(null);
//         console.log('No authenticated user');
//       }
//     });

//     return () => unsubscribeAuth();
//   }, []);

//   useEffect(() => {
//     if (user && authUser) {
//       loadAssignedPerson();
//       loadScheduledCalls();
      
//       // Listen for incoming call notifications (for clients)
//       if (user.role === 'client') {
//         const unsubscribe = onSnapshot(
//           query(
//             collection(db, 'callNotifications'),
//             where('targetId', '==', user.uid),
//             where('status', '==', 'incoming')
//           ),
//           (snapshot) => {
//             snapshot.docChanges().forEach((change) => {
//               if (change.type === 'added') {
//                 const notification = { id: change.doc.id, ...change.doc.data() };
//                 setIncomingCall(notification);
                
//                 // Auto-remove notification after 5 minutes
//                 setTimeout(() => {
//                   setIncomingCall(null);
//                 }, 5 * 60 * 1000);
//               }
//             });
//           }
//         );
        
//         return () => unsubscribe();
//       }
//     }
//   }, [user, authUser]);

//   const loadAssignedPerson = async () => {
//     try {
//       if (user.role === 'client') {
//         // For clients: get assigned therapist
//         const therapistQuery = query(
//           collection(db, 'therapists'),
//           where('clients', 'array-contains', user.uid)
//         );
//         const therapistSnapshot = await getDocs(therapistQuery);
        
//         if (!therapistSnapshot.empty) {
//           const therapistDoc = therapistSnapshot.docs[0];
//           const therapistData = therapistDoc.data();
          
//           // Get therapist auth info
//           const authQuery = query(
//             collection(db, 'auth'),
//             where('uid', '==', therapistDoc.id)
//           );
//           const authSnapshot = await getDocs(authQuery);
          
//           if (!authSnapshot.empty) {
//             const authData = authSnapshot.docs[0].data();
//             setAssignedPerson({
//               id: therapistDoc.id,
//               ...therapistData,
//               ...authData
//             });
//           }
//         }
//       } else if (user.role === 'therapist' || user.role === 'admin') {
//         // For therapists: get assigned clients - using exact same logic as Clients.js
//         const therapistClientsCol = collection(db, 'therapists', user.uid, 'clients');
//         const clientsSnapshot = await getDocs(therapistClientsCol);
        
//         const clientsData = [];
//         for (const clientDoc of clientsSnapshot.docs) {
//           const clientData = clientDoc.data();
          
//           try {
//             const clientDocRef = doc(db, 'clients', clientData.clientId);
//             const clientDocSnapshot = await getDoc(clientDocRef);
//             if (clientDocSnapshot.exists()) {
//               const clientInfo = clientDocSnapshot.data();
              
//               // Fetch client profile data from auth collection using clientId
//               let authData = {};
//               try {
//                 // Use the clientId from the clients collection to find the auth document
//                 const authQuery = collection(db, 'auth');
//                 const authSnapshot = await getDocs(query(authQuery, where('clientId', '==', clientData.clientId)));
                
//                 if (!authSnapshot.empty) {
//                   authData = authSnapshot.docs[0].data();
//                   console.log('Auth data found:', authData);
//                 } else {
//                   // Fallback: try to find by uid if clientId doesn't work
//                   const authDoc = await getDoc(doc(db, 'auth', clientData.clientId));
//                   if (authDoc.exists()) {
//                     authData = authDoc.data();
//                     console.log('Auth data found by uid:', authData);
//                   }
//                 }
//               } catch (authError) {
//                 console.log('Error fetching auth data for client:', clientData.clientId, authError);
//               }
              
//               // Create a display name from available fields
//               let displayName = 'Client';
              
//               // Priority: auth.name > email > gender+age
//               if (authData.name) {
//                 displayName = authData.name;
//               } else if (authData.email) {
//                 displayName = authData.email.split('@')[0];
//               } else if (clientInfo.email) {
//                 displayName = clientInfo.email.split('@')[0];
//               } else if (clientInfo.gender && clientInfo.age) {
//                 displayName = `${clientInfo.gender === 'man' ? 'Male' : clientInfo.gender === 'woman' ? 'Female' : 'Person'} (${clientInfo.age})`;
//               } else if (clientInfo.gender) {
//                 displayName = `${clientInfo.gender === 'man' ? 'Male' : clientInfo.gender === 'woman' ? 'Female' : 'Person'} Client`;
//               } else if (clientInfo.age) {
//                 displayName = `Client (${clientInfo.age})`;
//               }
              
//               // Log client data for debugging
//               console.log('Client data:', clientInfo);
//               console.log('Auth data:', authData);
//               console.log('Generated display name:', displayName);
              
//               // Add display name to client data and merge auth data
//               const enhancedClientData = {
//                 id: clientData.clientId,
//                 ...clientInfo,
//                 ...authData, // Merge auth data (including name, email, etc.)
//                 displayName: displayName,
//                 clientEmail: authData.email || clientInfo.email,
//                 clientName: authData.name
//               };
              
//               clientsData.push(enhancedClientData);
//             }
//           } catch (error) {
//             console.error('Error fetching client:', error);
//           }
//         }
        
//         // Sort clients by display name
//         clientsData.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
//         setAssignedPerson(clientsData);
//       }
//     } catch (error) {
//       console.error('Error loading assigned person:', error);
//     }
//   };

//   const loadScheduledCalls = async () => {
//     try {
//       setIsLoadingCalls(true);
      
//       let callsQuery;
//       if (user.role === 'client') {
//         callsQuery = query(
//           collection(db, 'scheduledCalls'),
//           where('clientId', '==', user.uid)
//         );
//       } else if (user.role === 'therapist' || user.role === 'admin') {
//         callsQuery = query(
//           collection(db, 'scheduledCalls'),
//           where('therapistId', '==', user.uid)
//         );
//       }
      
//       if (callsQuery) {
//         const snapshot = await getDocs(callsQuery);
//         const calls = snapshot.docs.map(doc => ({
//           id: doc.id,
//           ...doc.data()
//         }));
        
//         // Sort by scheduled time
//         calls.sort((a, b) => a.scheduledTime?.toDate() - b.scheduledTime?.toDate());
//         setScheduledCalls(calls);
//       }
//     } catch (error) {
//       console.error('Error loading scheduled calls:', error);
//     } finally {
//       setIsLoadingCalls(false);
//     }
//   };

//   const startInstantCall = async (targetPerson) => {
//     try {
//       if (!authUser) {
//         alert('You must be logged in to make calls');
//         return;
//       }

//       console.log('Starting instant call with:', targetPerson);
      
//       const roomName = `instant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
//       const participantName = user.name || user.displayName || user.email;
      
//       console.log('Room name:', roomName);
//       console.log('Participant name:', participantName);
      
//       // Create a notification for the client about the incoming call
//       if (user.role === 'therapist' || user.role === 'admin') {
//         try {
//           await addDoc(collection(db, 'callNotifications'), {
//             roomName,
//             callerId: user.uid,
//             callerName: participantName,
//             callerRole: user.role,
//             targetId: targetPerson.id,
//             targetName: targetPerson.displayName || targetPerson.name,
//             targetRole: 'client',
//             callType: 'instant',
//             status: 'incoming',
//             createdAt: Timestamp.now(),
//             expiresAt: Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)) // 5 minutes
//           });
//           console.log('Call notification created for client');
//         } catch (error) {
//           console.error('Failed to create call notification:', error);
//           // Continue with the call even if notification fails
//         }
//       }
      
//       const generateToken = httpsCallable(functions, 'generateTwilioToken');
      
//       const result = await generateToken({
//         roomName,
//         participantName,
//         participantRole: user.role
//       });
      
//       console.log('Token generated successfully');
      
//       // Open video call in new window/tab
//       const callUrl = `${window.location.origin}/video-call/${roomName}/${encodeURIComponent(participantName)}`;
//       const newWindow = window.open(callUrl, '_blank', 'width=1400,height=900,scrollbars=no,resizable=yes');
      
//       if (newWindow) {
//         // Store call info in localStorage for the new window
//         localStorage.setItem('videoCallInfo', JSON.stringify({
//           roomName,
//           participantName,
//           token: result.token,
//           targetPerson
//         }));
        
//         // Close the current video call interface
//         // You can add a message here like "Call opened in new window"
//       } else {
//         // Fallback: open in same window if popup blocked
//         console.log('Popup blocked, opening in same window');
//         window.location.href = callUrl;
//       }
      
//     } catch (error) {
//       console.error('Error starting call:', error);
//       alert('Failed to start call: ' + error.message);
//     }
//   };

//   const scheduleCall = async (targetPerson) => {
//     try {
//       const scheduledTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      
//       await addDoc(collection(db, 'scheduledCalls'), {
//         roomName: `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
//         therapistId: user.role === 'therapist' || user.role === 'admin' ? user.uid : targetPerson.id,
//         clientId: user.role === 'client' ? user.uid : targetPerson.id,
//         scheduledTime: Timestamp.fromDate(scheduledTime),
//         duration: parseInt(scheduleForm.duration),
//         notes: scheduleForm.notes,
//         status: 'scheduled',
//         createdAt: Timestamp.now(),
//         createdBy: user.uid
//       });
      
//       alert('Call scheduled successfully!');
//       setShowScheduleForm(false);
//       setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
      
//       // Refresh scheduled calls
//       setTimeout(() => {
//         loadScheduledCalls();
//       }, 1000);
      
//     } catch (error) {
//       console.error('Error scheduling call:', error);
//       alert('Failed to schedule call: ' + error.message);
//     }
//   };

//   const joinScheduledCall = async (call) => {
//     try {
//       if (!authUser) {
//         alert('You must be logged in to join calls');
//         return;
//       }

//       const participantName = user.name || user.displayName || user.email;
      
//       const generateToken = httpsCallable(functions, 'generateTwilioToken');
      
//       const result = await generateToken({
//         roomName: call.roomName,
//         participantName,
//         participantRole: user.role
//       });
      
//       // Open video call in new window
//       const callUrl = `${window.location.origin}/video-call/${roomName}/${encodeURIComponent(participantName)}`;
//       const newWindow = window.open(callUrl, '_blank', 'width=1400,height=900,scrollbars=no,resizable=yes');
      
//       if (newWindow) {
//         localStorage.setItem('videoCallInfo', JSON.stringify({
//           roomName: call.roomName,
//           participantName,
//           token: result.token,
//           targetPerson: null
//         }));
//       } else {
//         window.location.href = callUrl;
//       }
      
//     } catch (error) {
//       console.error('Error joining scheduled call:', error);
//       alert('Failed to join call: ' + error.message);
//     }
//   };

//   const isCallTimeReached = (scheduledTime) => {
//     const now = new Date();
//     const scheduled = scheduledTime.toDate();
//     const timeDiff = scheduled.getTime() - now.getTime();
//     return timeDiff <= 5 * 60 * 1000 && timeDiff >= -30 * 60 * 1000; // 5 min before to 30 min after
//   };

//   const getCallTarget = () => {
//     if (user.role === 'client') {
//       return assignedPerson;
//     } else if (user.role === 'therapist' || user.role === 'admin') {
//       return Array.isArray(assignedPerson) ? assignedPerson[0] : assignedPerson;
//     }
//     return null;
//   };

//   if (!user) {
//     return <div>Loading...</div>;
//   }

//   if (!authUser) {
//     return <div>Please log in to access video calls...</div>;
//   }

//   return (
//     <div className="video-call-dashboard">
//       {/* Incoming Call Notification */}
//       {incomingCall && (
//         <div className="incoming-call-notification">
//           <div className="notification-content">
//             <div className="notification-icon">
//               <Phone size={24} />
//             </div>
//             <div className="notification-text">
//               <h3>Incoming Call</h3>
//               <p>{incomingCall.callerName} is calling you</p>
//             </div>
//             <div className="notification-actions">
//               <button 
//                 className="btn-accept"
//                 onClick={() => {
//                   startInstantCall({ id: incomingCall.callerId, name: incomingCall.callerName });
//                   setIncomingCall(null);
//                 }}
//               >
//                 Accept
//               </button>
//               <button 
//                 className="btn-decline"
//                 onClick={() => setIncomingCall(null)}
//               >
//                 Decline
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Assigned Person Section */}
//       <div className="assigned-person-section">
//         <h2>
//           {user.role === 'client' ? 'Your Therapist' : 'Your Clients'}
//         </h2>
        
      
//         {user.role === 'client' && assignedPerson ? (
//           <div className="person-card">
//             <div className="person-info">
//               <div className="person-avatar">
//                 <User size={50} />
//               </div>
//               <div className="person-details">
//                 <h3 style={{color: 'white'}}>{assignedPerson.displayName || assignedPerson.name || assignedPerson.email}</h3>
//                 <p>Assigned Therapist</p>
//               </div>
//             </div>
//             <div className="person-actions">
//               <button 
//                 className="btn-call-now"
//                 onClick={() => startInstantCall(assignedPerson)}
//               >
//                 <Phone size={16} />
//                 Call Now
//               </button>
//               <button 
//                 className="btn-schedule"
//                 onClick={() => setShowScheduleForm(true)}
//               >
//                 <Calendar size={16} />
//                 Schedule
//               </button>
//             </div>
//           </div>
//         ) : (user.role === 'therapist' || user.role === 'admin') && Array.isArray(assignedPerson) && assignedPerson.length > 0 ? (
//           <div className="clients-grid">
//             {assignedPerson.map((client) => (
//               <div key={client.id} className="person-card">
//                 <div className="person-info">
//                   <div className="person-avatar">
//                     <User size={32} />
//                   </div>
//                   <div className="person-details">
//                     <h3>{client.displayName || client.clientName || client.name || client.email || `Client ${client.id}`}</h3>
//                     <p>Assigned Client</p>
//                   </div>
//                 </div>
//                 <div className="person-actions">
//                   <button 
//                     className="btn-call-now"
//                     onClick={() => startInstantCall(client)}
//                   >
//                     <Phone size={16} />
//                     Call Now
//                   </button>
//                   <button 
//                     className="btn-schedule"
//                     onClick={() => setShowScheduleForm(true)}
//                   >
//                     <Calendar size={16} />
//                     Schedule
//                   </button>
//                 </div>
//               </div>
//             ))}
//           </div>
//         ) : (
//           <div className="empty-state">
//             <p>No {user.role === 'client' ? 'therapist' : 'clients'} assigned yet.</p>
//           </div>
//         )}
//       </div>

//       {/* Scheduled Calls Section */}
//       <div className="scheduled-calls-section">
//         <div className="section-header">
//           <h2>Upcoming Calls</h2>
//           <button 
//             className="btn-refresh"
//             onClick={loadScheduledCalls}
//             disabled={isLoadingCalls}
//           >
//             Refresh
//           </button>
//         </div>
        
//         {isLoadingCalls ? (
//           <div className="loading-state">
//             <div className="spinner"></div>
//             <p>Loading scheduled calls...</p>
//           </div>
//         ) : scheduledCalls.length > 0 ? (
//           <div className="calls-grid">
//             {scheduledCalls.map((call) => (
//               <div key={call.id} className="call-card">
//                 <div className="call-info">
//                   <h3>Call with {user.role === 'client' ? 'Therapist' : 'Client'}</h3>
//                   <p>
//                     <Clock size={16} />
//                     {call.scheduledTime?.toDate().toLocaleString()}
//                   </p>
//                   <p>Duration: {call.duration} minutes</p>
//                   {call.notes && <p>Notes: {call.notes}</p>}
//                   <p>Room: {call.roomName}</p>
//                 </div>
//                 <div className="call-actions">
//                   {isCallTimeReached(call.scheduledTime) && (
//                     <button 
//                       className="btn-join-call"
//                       onClick={() => joinScheduledCall(call)}
//                     >
//                       <Phone size={16} />
//                       Join Call
//                     </button>
//                   )}
//                 </div>
//               </div>
//             ))}
//           </div>
//         ) : (
//           <div className="empty-state">
//             <p>No scheduled calls yet.</p>
//           </div>
//         )}
//       </div>

//       {/* Schedule Call Modal */}
//       {showScheduleForm && (
//         <div className="modal-overlay" onClick={() => setShowScheduleForm(false)}>
//           <div className="modal" onClick={(e) => e.stopPropagation()}>
//             <h3>Schedule Call</h3>
//             <form onSubmit={(e) => {
//               e.preventDefault();
//               const targetPerson = user.role === 'client' ? assignedPerson : (Array.isArray(assignedPerson) ? assignedPerson[0] : assignedPerson);
//               if (targetPerson) {
//                 scheduleCall(targetPerson);
//               }
//             }}>
//               <div className="form-group">
//                 <label>Date:</label>
//                 <input
//                   type="date"
//                   value={scheduleForm.date}
//                   onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
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
//                 </select>
//               </div>
//               <div className="form-group">
//                 <label>Notes:</label>
//                 <textarea
//                   value={scheduleForm.notes}
//                   onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
//                   placeholder="Optional notes about the call"
//                 />
//               </div>
//               <div className="form-actions">
//                 <button type="submit" className="btn-primary">Schedule Call</button>
//                 <button 
//                   type="button" 
//                   className="btn-secondary"
//                   onClick={() => setShowScheduleForm(false)}
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

// export default VideoCall;


import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, orderBy, onSnapshot, Timestamp, doc, getDoc, updateDoc, deleteDoc } from '../../services/firestoreShim';
// `functions` / `httpsCallable` dropped — the only thing they were used for here
// was the token callable, which now goes through twilioVideoService directly.
import { db, auth } from '../../services/firestoreShim';
import { generateVideoToken, roomNameForCall } from '../../services/twilioVideoService';
import { Phone, Calendar, Clock, User, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { onAuthStateChanged } from '../../services/authShim';
import './VideoCall.css';

// Call Logging System
const logCallActivity = async (activityData) => {
  try {
    const logEntry = {
      ...activityData,
      timestamp: Timestamp.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: sessionStorage.getItem('sessionId') || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    await addDoc(collection(db, 'callLogs'), logEntry);
    console.log('Call activity logged:', activityData.activity);
  } catch (error) {
    console.error('Failed to log call activity:', error);
  }
};

// Generate session ID if not exists
if (!sessionStorage.getItem('sessionId')) {
  sessionStorage.setItem('sessionId', `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
}

const VideoCall = ({ user }) => {
  const [assignedPerson, setAssignedPerson] = useState(null);
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    duration: '30',
    notes: ''
  });
  const [isLoadingCalls, setIsLoadingCalls] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [editingCall, setEditingCall] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(null);

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user);
        console.log('Authenticated user:', user.uid);
      } else {
        setAuthUser(null);
        console.log('No authenticated user');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (user && authUser) {
      loadAssignedPerson();
      loadScheduledCalls();
      
      // Listen for incoming call notifications (for clients)
      if (user.role === 'client') {
        const unsubscribe = onSnapshot(
          query(
            collection(db, 'callNotifications'),
            where('targetId', '==', user.uid),
            where('status', '==', 'incoming')
          ),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const notification = { id: change.doc.id, ...change.doc.data() };
                setIncomingCall(notification);
                
                // Auto-remove notification after 5 minutes
                setTimeout(() => {
                  setIncomingCall(null);
                  // Update notification status to expired
                  updateDoc(doc(db, 'callNotifications', notification.id), {
                    status: 'expired'
                  }).catch(console.error);
                }, 5 * 60 * 1000);
              }
            });
          }
        );
        
        return () => unsubscribe();
      }
    }
  }, [user, authUser]);

  const loadAssignedPerson = async () => {
    try {
      if (user.role === 'client') {
        // For clients: get assigned therapist
        const therapistQuery = query(
          collection(db, 'therapists'),
          where('clients', 'array-contains', user.uid)
        );
        const therapistSnapshot = await getDocs(therapistQuery);
        
        if (!therapistSnapshot.empty) {
          const therapistDoc = therapistSnapshot.docs[0];
          const therapistData = therapistDoc.data();
          
          // Get therapist auth info
          const authQuery = query(
            collection(db, 'auth'),
            where('uid', '==', therapistDoc.id)
          );
          const authSnapshot = await getDocs(authQuery);
          
          if (!authSnapshot.empty) {
            const authData = authSnapshot.docs[0].data();
            setAssignedPerson({
              id: therapistDoc.id,
              ...therapistData,
              ...authData
            });
          }
        }
      } else if (user.role === 'therapist' || user.role === 'admin') {
        // For therapists: get assigned clients
        const therapistClientsCol = collection(db, 'therapists', user.uid, 'clients');
        const clientsSnapshot = await getDocs(therapistClientsCol);
        
        console.log(`🎥 VideoCall - Found ${clientsSnapshot.docs.length} clients in subcollection for therapist ${user.uid}`);
        console.log('🎥 VideoCall - Client documents:', clientsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const clientsData = [];
        for (const clientDoc of clientsSnapshot.docs) {
          const clientData = clientDoc.data();
          
          try {
            const clientDocRef = doc(db, 'clients', clientData.clientId);
            const clientDocSnapshot = await getDoc(clientDocRef);
            if (clientDocSnapshot.exists()) {
              const clientInfo = clientDocSnapshot.data();
              
              // Fetch client profile data from auth collection
              let authData = {};
              try {
                const authQuery = collection(db, 'auth');
                const authSnapshot = await getDocs(query(authQuery, where('clientId', '==', clientData.clientId)));
                
                if (!authSnapshot.empty) {
                  authData = authSnapshot.docs[0].data();
                } else {
                  // Fallback: try to find by uid
                  const authDoc = await getDoc(doc(db, 'auth', clientData.clientId));
                  if (authDoc.exists()) {
                    authData = authDoc.data();
                  }
                }
              } catch (authError) {
                console.log('Error fetching auth data for client:', clientData.clientId, authError);
              }
              
              // Create a display name from available fields
              let displayName = 'Client';
              if (authData.name) {
                displayName = authData.name;
              } else if (authData.email) {
                displayName = authData.email.split('@')[0];
              } else if (clientInfo.email) {
                displayName = clientInfo.email.split('@')[0];
              } else if (clientInfo.gender && clientInfo.age) {
                displayName = `${clientInfo.gender === 'man' ? 'Male' : clientInfo.gender === 'woman' ? 'Female' : 'Person'} (${clientInfo.age})`;
              }
              
              const enhancedClientData = {
                id: clientData.clientId,
                ...clientInfo,
                ...authData,
                displayName: displayName,
                clientEmail: authData.email || clientInfo.email,
                clientName: authData.name
              };
              
              clientsData.push(enhancedClientData);
            }
          } catch (error) {
            console.error('Error fetching client:', error);
          }
        }
        
        clientsData.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        setAssignedPerson(clientsData);
      }
    } catch (error) {
      console.error('Error loading assigned person:', error);
    }
  };

  const loadScheduledCalls = async () => {
    try {
      setIsLoadingCalls(true);
      
      let callsQuery;
      if (user.role === 'client') {
        callsQuery = query(
          collection(db, 'scheduledCalls'),
          where('clientId', '==', user.uid),
          orderBy('scheduledTime', 'asc')
        );
      } else if (user.role === 'therapist' || user.role === 'admin') {
        callsQuery = query(
          collection(db, 'scheduledCalls'),
          where('therapistId', '==', user.uid),
          orderBy('scheduledTime', 'asc')
        );
      }
      
      if (callsQuery) {
        const snapshot = await getDocs(callsQuery);
        const calls = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Filter out past calls that can't be joined anymore (more than 30 minutes past)
        const now = new Date();
        const filteredCalls = calls.filter(call => {
          const scheduledTime = call.scheduledTime?.toDate();
          if (!scheduledTime) return false;
          
          const timeDiff = scheduledTime.getTime() - now.getTime();
          // Keep calls that are not more than 30 minutes past
          return timeDiff >= -30 * 60 * 1000;
        });
        
        setScheduledCalls(filteredCalls);
      }
    } catch (error) {
      console.error('Error loading scheduled calls:', error);
      // If orderBy fails, try without it
      try {
        let fallbackQuery;
        if (user.role === 'client') {
          fallbackQuery = query(
            collection(db, 'scheduledCalls'),
            where('clientId', '==', user.uid)
          );
        } else if (user.role === 'therapist' || user.role === 'admin') {
          fallbackQuery = query(
            collection(db, 'scheduledCalls'),
            where('therapistId', '==', user.uid)
          );
        }
        
        if (fallbackQuery) {
          const snapshot = await getDocs(fallbackQuery);
          const calls = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Filter out past calls and sort manually
          const now = new Date();
          const filteredCalls = calls.filter(call => {
            const scheduledTime = call.scheduledTime?.toDate();
            if (!scheduledTime) return false;
            
            const timeDiff = scheduledTime.getTime() - now.getTime();
            return timeDiff >= -30 * 60 * 1000;
          });
          
          filteredCalls.sort((a, b) => {
            const aTime = a.scheduledTime?.toDate() || new Date(0);
            const bTime = b.scheduledTime?.toDate() || new Date(0);
            return aTime - bTime;
          });
          
          setScheduledCalls(filteredCalls);
        }
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
      }
    } finally {
      setIsLoadingCalls(false);
    }
  };

  const ensureUserAuthenticated = async () => {
    if (!authUser) {
      throw new Error('No authenticated user found. Please log in again.');
    }

    try {
      const token = await authUser.getIdToken(true);
      console.log('User token refreshed successfully');
      return token;
    } catch (error) {
      console.error('Failed to get user token:', error);
      throw new Error('Authentication token is invalid. Please log in again.');
    }
  };

  const startInstantCall = async (targetPerson) => {
    if (isStartingCall) {
      console.log('Call already in progress, ignoring duplicate request');
      return;
    }

    try {
      setIsStartingCall(true);
      console.log('Starting instant call with:', targetPerson);

      // Ensure user is authenticated
      await ensureUserAuthenticated();

      const roomName = `instant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const participantName = user.name || user.displayName || user.email || `User-${user.uid.substr(0, 8)}`;
      
      console.log('Room name:', roomName);
      console.log('Participant name:', participantName);
      
      // Create notification for target person
      if (user.role === 'therapist' || user.role === 'admin') {
        try {
          await addDoc(collection(db, 'callNotifications'), {
            roomName,
            callerId: user.uid,
            callerName: participantName,
            callerRole: user.role,
            targetId: targetPerson.id,
            targetName: targetPerson.displayName || targetPerson.name,
            targetRole: 'client',
            callType: 'instant',
            status: 'incoming',
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000))
          });
          console.log('Call notification created');
        } catch (error) {
          console.error('Failed to create call notification:', error);
        }
      }
      
      console.log('Generating Twilio token...');

      // Token comes from our own backend now. This used to be a Firebase Cloud
      // Function ('generateTwilioToken') that no longer exists — the app is off
      // Firebase — so every web call was asking a dead endpoint for a token.
      // Identity must be the authenticated user's id — TwilioIdentityPolicy
      // rejects a display name with 400 "identity must match authenticated user".
      const identity = authUser?.uid || user?.uid;

      const result = await generateVideoToken({ roomName, participantName: identity });
      
      console.log('Token generated successfully');
      
      // Open video call
      const callUrl = `${window.location.origin}/video-call/${roomName}/${encodeURIComponent(participantName)}`;
      
      // Store call info for the video page
      const callInfo = {
        roomName,
        participantName,
        identity,
        displayNames: { [identity]: participantName },
        token: result.token,
        targetPerson,
        callType: 'instant'
      };
      
      localStorage.setItem('videoCallInfo', JSON.stringify(callInfo));
      
      // Try to open in new window, fallback to same window
      const newWindow = window.open(callUrl, '_blank', 'width=1400,height=900,scrollbars=no,resizable=yes');
      
      if (!newWindow) {
        console.log('Popup blocked, opening in same window');
        window.location.href = callUrl;
      } else {
        console.log('Call opened in new window');
        // Focus the new window
        newWindow.focus();
      }
      
    } catch (error) {
      console.error('Error starting call:', error);
      
      let errorMessage = 'Failed to start call. ';
      if (error.code === 'unauthenticated') {
        errorMessage += 'Please log out and log back in.';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please try again.';
      }
      
      alert(errorMessage);
    } finally {
      setIsStartingCall(false);
    }
  };

  const acceptIncomingCall = async (notification) => {
    try {
      console.log('Accepting incoming call:', notification);
      
      await ensureUserAuthenticated();

      const participantName = user.name || user.displayName || user.email || `User-${user.uid.substr(0, 8)}`;
      
      // Token for the existing room — see the note above; this was the second
      // caller of the removed Firebase function.
      const identity = authUser?.uid || user?.uid; // see note on identity above

      const result = await generateVideoToken({
        roomName: notification.roomName,
        participantName: identity,
      });
      
      // Update notification status
      await updateDoc(doc(db, 'callNotifications', notification.id), {
        status: 'accepted'
      });
      
      // Open video call
      const callUrl = `${window.location.origin}/video-call/${notification.roomName}/${encodeURIComponent(participantName)}`;
      
      const callInfo = {
        roomName: notification.roomName,
        participantName,
        identity,
        displayNames: { [identity]: participantName },
        token: result.token,
        targetPerson: { id: notification.callerId, name: notification.callerName },
        callType: 'incoming'
      };
      
      localStorage.setItem('videoCallInfo', JSON.stringify(callInfo));
      
      const newWindow = window.open(callUrl, '_blank', 'width=1400,height=900,scrollbars=no,resizable=yes');
      
      if (!newWindow) {
        window.location.href = callUrl;
      } else {
        newWindow.focus();
      }
      
      setIncomingCall(null);
      
    } catch (error) {
      console.error('Error accepting call:', error);
      alert('Failed to accept call: ' + error.message);
    }
  };

  const declineIncomingCall = async (notification) => {
    try {
      // Update notification status
      await updateDoc(doc(db, 'callNotifications', notification.id), {
        status: 'declined'
      });
      
      setIncomingCall(null);
      console.log('Call declined');
      
    } catch (error) {
      console.error('Error declining call:', error);
      setIncomingCall(null);
    }
  };

  const scheduleCall = async (targetPerson) => {
    try {
      await ensureUserAuthenticated();

      const scheduledTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      
      // Validate date is in the future
      if (scheduledTime <= new Date()) {
        alert('Please select a future date and time');
        return;
      }
      
      const roomName = `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      await addDoc(collection(db, 'scheduledCalls'), {
        roomName,
        therapistId: user.role === 'therapist' || user.role === 'admin' ? user.uid : targetPerson.id,
        clientId: user.role === 'client' ? user.uid : targetPerson.id,
        therapistName: user.role === 'therapist' || user.role === 'admin' ? 
          (user.name || user.displayName || user.email) : 
          (targetPerson.displayName || targetPerson.name),
        clientName: user.role === 'client' ? 
          (user.name || user.displayName || user.email) : 
          (targetPerson.displayName || targetPerson.name),
        scheduledTime: Timestamp.fromDate(scheduledTime),
        duration: parseInt(scheduleForm.duration),
        notes: scheduleForm.notes,
        status: 'scheduled',
        createdAt: Timestamp.now(),
        createdBy: user.uid
      });
      
      alert('Call scheduled successfully!');
      setShowScheduleForm(false);
      setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
      
      // Refresh scheduled calls
      setTimeout(() => {
        loadScheduledCalls();
      }, 1000);
      
    } catch (error) {
      console.error('Error scheduling call:', error);
      alert('Failed to schedule call: ' + error.message);
    }
  };

  const updateScheduledCall = async () => {
    try {
      await ensureUserAuthenticated();

      const scheduledTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      
      // Validate date is in the future
      if (scheduledTime <= new Date()) {
        alert('Please select a future date and time');
        return;
      }
      
      await updateDoc(doc(db, 'scheduledCalls', editingCall.id), {
        scheduledTime: Timestamp.fromDate(scheduledTime),
        duration: parseInt(scheduleForm.duration),
        notes: scheduleForm.notes,
        updatedAt: Timestamp.now(),
        updatedBy: user.uid
      });
      
      alert('Call updated successfully!');
      setShowScheduleForm(false);
      setEditingCall(null);
      setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
      
      // Refresh scheduled calls
      setTimeout(() => {
        loadScheduledCalls();
      }, 1000);
      
    } catch (error) {
      console.error('Error updating call:', error);
      alert('Failed to update call: ' + error.message);
    }
  };

  const deleteScheduledCall = async (callId) => {
    if (!window.confirm('Are you sure you want to delete this scheduled call?')) {
      return;
    }

    try {
      await ensureUserAuthenticated();
      
      await deleteDoc(doc(db, 'scheduledCalls', callId));
      
      alert('Call deleted successfully!');
      setDropdownOpen(null);
      
      // Refresh scheduled calls
      setTimeout(() => {
        loadScheduledCalls();
      }, 1000);
      
    } catch (error) {
      console.error('Error deleting call:', error);
      alert('Failed to delete call: ' + error.message);
    }
  };

  const startEditCall = (call) => {
    const scheduledDate = call.scheduledTime?.toDate();
    if (scheduledDate) {
      const dateStr = scheduledDate.toISOString().split('T')[0];
      const timeStr = scheduledDate.toTimeString().slice(0, 5);
      
      setScheduleForm({
        date: dateStr,
        time: timeStr,
        duration: call.duration?.toString() || '30',
        notes: call.notes || ''
      });
    }
    
    setEditingCall(call);
    setShowScheduleForm(true);
    setDropdownOpen(null);
  };

  const joinScheduledCall = async (call) => {
    try {
      console.log('Joining scheduled call:', call);

      await ensureUserAuthenticated();

      const participantName = user.name || user.displayName || user.email || `User-${user.uid.substr(0, 8)}`;
      
      // Same replacement as the other two callers — the Firebase function this
      // used is gone.
      const roomName = roomNameForCall(call);
      if (!roomName) throw new Error('This session has no room yet.');

      // Identity must be the authenticated user's id; see TwilioIdentityPolicy.
      const identity = authUser?.uid || user?.uid;
      if (!identity) throw new Error('Your session expired. Please log in again.');

      const result = await generateVideoToken({
        roomName,
        participantName: identity,
      });
      
      // Update call status
      try {
        await updateDoc(doc(db, 'scheduledCalls', call.id), {
          status: 'in_progress',
          joinedAt: Timestamp.now()
        });
      } catch (updateError) {
        console.error('Failed to update call status:', updateError);
        // Continue anyway
      }
      
      // Open video call
      // `call.roomName` is null on every scheduled call, which opened the room at
      // /video-call/null/… — it only worked because the page falls back to the
      // stored call info. Use the derived name so the URL is valid on its own.
      const callUrl = `${window.location.origin}/video-call/${roomName}/${encodeURIComponent(participantName)}`;
      
      const callInfo = {
        roomName,
        participantName,
        identity,
        displayNames: { [identity]: participantName },
        token: result.token,
        // Without a name here the client's video tile just read "Participant".
        targetPerson: call.clientName || call.clientDisplayName || null,
        callType: 'scheduled',
        scheduledCall: call
      };
      
      localStorage.setItem('videoCallInfo', JSON.stringify(callInfo));
      
      const newWindow = window.open(callUrl, '_blank', 'width=1400,height=900,scrollbars=no,resizable=yes');
      
      if (!newWindow) {
        window.location.href = callUrl;
      } else {
        newWindow.focus();
      }
      
    } catch (error) {
      console.error('Error joining scheduled call:', error);
      let errorMessage = 'Failed to join call. ';
      if (error.code === 'unauthenticated') {
        errorMessage += 'Please log out and log back in.';
      } else if (error.message) {
        errorMessage += error.message;
      }
      alert(errorMessage);
    }
  };

  const isCallTimeReached = (scheduledTime) => {
    const now = new Date();
    const scheduled = scheduledTime.toDate();
    const timeDiff = scheduled.getTime() - now.getTime();
    // Allow joining 5 minutes before and up to 30 minutes after scheduled time
    return timeDiff <= 5 * 60 * 1000 && timeDiff >= -30 * 60 * 1000;
  };

  const getTimeUntilCall = (scheduledTime) => {
    const now = new Date();
    const scheduled = scheduledTime.toDate();
    const timeDiff = scheduled.getTime() - now.getTime();
    
    if (timeDiff <= 0) {
      return 'Now';
    } else if (timeDiff < 60 * 1000) {
      return 'Less than 1 minute';
    } else if (timeDiff < 60 * 60 * 1000) {
      const minutes = Math.floor(timeDiff / (60 * 1000));
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    } else {
      const hours = Math.floor(timeDiff / (60 * 60 * 1000));
      const minutes = Math.floor((timeDiff % (60 * 60 * 1000)) / (60 * 1000));
      return `${hours}h ${minutes}m`;
    }
  };

  // Check if call can be edited/deleted (not started and user is therapist/creator)
  const canManageCall = (call) => {
    const now = new Date();
    const scheduled = call.scheduledTime?.toDate();
    if (!scheduled) return false;
    
    // Only allow management if the call hasn't started yet
    const timeDiff = scheduled.getTime() - now.getTime();
    const hasNotStarted = timeDiff > -5 * 60 * 1000; // More than 5 minutes before start time
    
    // Allow therapists to manage their calls, or the creator of the call
    const isTherapistCall = (user.role === 'therapist' || user.role === 'admin') && call.therapistId === user.uid;
    const isCreator = call.createdBy === user.uid;
    
    return hasNotStarted && (isTherapistCall || isCreator);
  };

  if (!user) {
    return <div className="loading-state">Loading user data...</div>;
  }

  if (!authUser) {
    return (
      <div className="auth-required">
        <h3>Authentication Required</h3>
        <p>Please log in to access video calls...</p>
        <button onClick={() => window.location.reload()}>Refresh Page</button>
      </div>
    );
  }

  return (
    <div className="video-call-dashboard">
      {/* Incoming Call Notification */}
      {incomingCall && (
        <div className="incoming-call-notification">
          <div className="notification-content">
            <div className="notification-icon">
              <Phone size={24} />
            </div>
            <div className="notification-text">
              <h3>Incoming Call</h3>
              <p>{incomingCall.callerName} is calling you</p>
              <small>Call Type: {incomingCall.callType}</small>
            </div>
            <div className="notification-actions">
              <button 
                className="btn-accept"
                onClick={() => acceptIncomingCall(incomingCall)}
              >
                Accept
              </button>
              <button 
                className="btn-decline"
                onClick={() => declineIncomingCall(incomingCall)}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assigned Person Section */}
      <div className="assigned-person-section">
        <h2 style={{color:'salmon'}}>
          {user.role === 'client' ? 'Your Therapist' : 'Your Clients'}
        </h2>
        
        {user.role === 'client' && assignedPerson ? (
          <div className="person-card">
            <div className="person-info">
              <div className="person-avatar">
                <User size={50} />
              </div>
              <div className="person-details">
                <h3 style={{color: 'white'}}>
                  {assignedPerson.displayName || assignedPerson.name || assignedPerson.email}
                </h3>
                <p>Assigned Therapist</p>
              </div>
            </div>
            <div className="person-actions">
              <button 
                className="btn-call-now"
                onClick={() => startInstantCall(assignedPerson)}
                disabled={!authUser || isStartingCall}
              >
                <Phone size={16} />
                {isStartingCall ? 'Starting...' : 'Call Now'}
              </button>
              <button 
                className="btn-schedule"
                onClick={() => {
                  setEditingCall(null);
                  setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
                  setShowScheduleForm(true);
                }}
                disabled={!authUser}
              >
                <Calendar size={16} />
                Schedule
              </button>
            </div>
          </div>
        ) : (user.role === 'therapist' || user.role === 'admin') && Array.isArray(assignedPerson) && assignedPerson.length > 0 ? (
          <div className="clients-grid">
            {assignedPerson.map((client) => (
              <div key={client.id} className="person-card">
                <div className="person-info">
                  <div className="person-avatar">
                    <User size={32} />
                  </div>
                  <div className="person-details">
                    <h3 style={{color:'white', fontSize:'1.9rem'}}>
                      {client.displayName || client.clientName || client.name || client.email || `Client ${client.id}`}
                    </h3>
                    {/* <p>Assigned Client</p> */}
                  </div>
                </div>
                <div className="person-actions">
                  <button 
                    className="btn-call-now"
                    onClick={() => startInstantCall(client)}
                    disabled={!authUser || isStartingCall}
                  >
                    <Phone size={16} />
                    {isStartingCall ? 'Starting...' : 'Call Now'}
                  </button>
                  <button 
                    className="btn-schedule"
                    onClick={() => {
                      setEditingCall(null);
                      setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
                      setShowScheduleForm(true);
                    }}
                    disabled={!authUser}
                  >
                    <Calendar size={16} />
                    Schedule
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No {user.role === 'client' ? 'therapist' : 'clients'} assigned yet.</p>
          </div>
        )}
      </div>

      {/* Scheduled Calls Section */}
      <div className="scheduled-calls-section">
        <div className="section-header">
          <h2>Upcoming Calls</h2>
          <button 
            className="btn-refresh"
            onClick={loadScheduledCalls}
            disabled={isLoadingCalls || !authUser}
          >
            {isLoadingCalls ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        {isLoadingCalls ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading scheduled calls...</p>
          </div>
        ) : scheduledCalls.length > 0 ? (
          <div className="calls-grid">
            {scheduledCalls.map((call) => {
              const canJoin = isCallTimeReached(call.scheduledTime);
              const timeUntil = getTimeUntilCall(call.scheduledTime);
              const canManage = canManageCall(call);
              
              return (
                <div key={call.id} className={`call-card ${canJoin ? 'can-join' : ''}`}>
                  <div className="call-info">
                    <div className="call-header">
                      <h3 style={{color:'salmon'}}>
                        Call with {user.role === 'client' ? call.therapistName : call.clientName}
                      </h3>
                      {canManage && (
                        <div className="call-menu">
                          <button 
                            className="menu-trigger"
                            onClick={() => setDropdownOpen(dropdownOpen === call.id ? null : call.id)}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {dropdownOpen === call.id && (
                            <div className="dropdown-menu">
                              <button 
                                className="dropdown-item"
                                onClick={() => startEditCall(call)}
                              >
                                <Edit size={14} />
                                Edit Schedule
                              </button>
                              <button 
                                className="dropdown-item delete"
                                onClick={() => deleteScheduledCall(call.id)}
                              >
                                <Trash2 size={14} />
                                Delete Schedule
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <p>
                      <Clock size={16} />
                      {call.scheduledTime?.toDate().toLocaleString()}
                    </p>
                    <p>Duration: {call.duration} minutes</p>
                    {call.notes && <p>Notes: {call.notes}</p>}
                    <p className="time-until">
                      {canJoin ? 'Ready to join!' : `Starts in: ${timeUntil}`}
                    </p>
                    <p className="call-status">Status: {call.status}</p>
                  </div>
                  <div className="call-actions">
                    {canJoin ? (
                      <button 
                        className="btn-join-call"
                        onClick={() => joinScheduledCall(call)}
                        disabled={!authUser}
                      >
                        <Phone size={16} />
                        Join Call
                      </button>
                    ) : (
                      <div className="call-countdown">
                        <small>Available {timeUntil === 'Now' ? 'now' : `in ${timeUntil}`}</small>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p>No scheduled calls yet.</p>
          </div>
        )}
      </div>

      {/* Schedule Call Modal */}
      {showScheduleForm && (
        <div className="modal-overlay" onClick={() => {
          setShowScheduleForm(false);
          setEditingCall(null);
          setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingCall ? 'Edit Scheduled Call' : 'Schedule Call'}</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (editingCall) {
                updateScheduledCall();
              } else {
                const targetPerson = user.role === 'client' ? 
                  assignedPerson : 
                  (Array.isArray(assignedPerson) ? assignedPerson[0] : assignedPerson);
                if (targetPerson) {
                  scheduleCall(targetPerson);
                }
              }
            }}>
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
                <button type="submit" className="btn-primary" disabled={!authUser}>
                  {editingCall ? 'Update Call' : 'Schedule Call'}
                </button>
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => {
                    setShowScheduleForm(false);
                    setEditingCall(null);
                    setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
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

export default VideoCall;