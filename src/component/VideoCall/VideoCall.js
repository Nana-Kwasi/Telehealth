// import React, { useState, useEffect } from 'react';
// import { collection, query, where, getDocs, addDoc, orderBy, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore';
// import { db, functions, httpsCallable, auth } from '../Auth/firebaseConfig';
// import { Phone, Calendar, Clock, User } from 'lucide-react';
// import { onAuthStateChanged } from 'firebase/auth';
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
//           token: result.data.token,
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
//       const callUrl = `${window.location.origin}/video-call/${call.roomName}/${encodeURIComponent(participantName)}`;
//       const newWindow = window.open(callUrl, '_blank', 'width=1400,height=900,scrollbars=no,resizable=yes');
      
//       if (newWindow) {
//         localStorage.setItem('videoCallInfo', JSON.stringify({
//           roomName: call.roomName,
//           participantName,
//           token: result.data.token,
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
import { collection, query, where, getDocs, addDoc, orderBy, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db, functions, httpsCallable, auth } from '../Auth/firebaseConfig';
import { Phone, Calendar, Clock, User } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import './VideoCall.css';

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

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user);
        console.log('Authenticated user:', user.uid);
        console.log('Auth user token exists:', !!user.accessToken);
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
        // For therapists: get assigned clients - using exact same logic as Clients.js
        const therapistClientsCol = collection(db, 'therapists', user.uid, 'clients');
        const clientsSnapshot = await getDocs(therapistClientsCol);
        
        const clientsData = [];
        for (const clientDoc of clientsSnapshot.docs) {
          const clientData = clientDoc.data();
          
          try {
            const clientDocRef = doc(db, 'clients', clientData.clientId);
            const clientDocSnapshot = await getDoc(clientDocRef);
            if (clientDocSnapshot.exists()) {
              const clientInfo = clientDocSnapshot.data();
              
              // Fetch client profile data from auth collection using clientId
              let authData = {};
              try {
                // Use the clientId from the clients collection to find the auth document
                const authQuery = collection(db, 'auth');
                const authSnapshot = await getDocs(query(authQuery, where('clientId', '==', clientData.clientId)));
                
                if (!authSnapshot.empty) {
                  authData = authSnapshot.docs[0].data();
                  console.log('Auth data found:', authData);
                } else {
                  // Fallback: try to find by uid if clientId doesn't work
                  const authDoc = await getDoc(doc(db, 'auth', clientData.clientId));
                  if (authDoc.exists()) {
                    authData = authDoc.data();
                    console.log('Auth data found by uid:', authData);
                  }
                }
              } catch (authError) {
                console.log('Error fetching auth data for client:', clientData.clientId, authError);
              }
              
              // Create a display name from available fields
              let displayName = 'Client';
              
              // Priority: auth.name > email > gender+age
              if (authData.name) {
                displayName = authData.name;
              } else if (authData.email) {
                displayName = authData.email.split('@')[0];
              } else if (clientInfo.email) {
                displayName = clientInfo.email.split('@')[0];
              } else if (clientInfo.gender && clientInfo.age) {
                displayName = `${clientInfo.gender === 'man' ? 'Male' : clientInfo.gender === 'woman' ? 'Female' : 'Person'} (${clientInfo.age})`;
              } else if (clientInfo.gender) {
                displayName = `${clientInfo.gender === 'man' ? 'Male' : clientInfo.gender === 'woman' ? 'Female' : 'Person'} Client`;
              } else if (clientInfo.age) {
                displayName = `Client (${clientInfo.age})`;
              }
              
              // Log client data for debugging
              console.log('Client data:', clientInfo);
              console.log('Auth data:', authData);
              console.log('Generated display name:', displayName);
              
              // Add display name to client data and merge auth data
              const enhancedClientData = {
                id: clientData.clientId,
                ...clientInfo,
                ...authData, // Merge auth data (including name, email, etc.)
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
        
        // Sort clients by display name
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
          where('clientId', '==', user.uid)
        );
      } else if (user.role === 'therapist' || user.role === 'admin') {
        callsQuery = query(
          collection(db, 'scheduledCalls'),
          where('therapistId', '==', user.uid)
        );
      }
      
      if (callsQuery) {
        const snapshot = await getDocs(callsQuery);
        const calls = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sort by scheduled time
        calls.sort((a, b) => a.scheduledTime?.toDate() - b.scheduledTime?.toDate());
        setScheduledCalls(calls);
      }
    } catch (error) {
      console.error('Error loading scheduled calls:', error);
    } finally {
      setIsLoadingCalls(false);
    }
  };

  const ensureUserAuthenticated = async () => {
    if (!authUser) {
      throw new Error('No authenticated user found');
    }

    // Check if the user's token is still valid
    try {
      const token = await authUser.getIdToken(true); // Force refresh
      console.log('User token refreshed successfully');
      return token;
    } catch (error) {
      console.error('Failed to get user token:', error);
      throw new Error('Authentication token is invalid');
    }
  };

  const startInstantCall = async (targetPerson) => {
    try {
      console.log('Starting instant call with:', targetPerson);
      console.log('Current authUser:', authUser);
      console.log('Firebase auth current user:', auth.currentUser);

      // Ensure user is authenticated and get fresh token
      const freshToken = await ensureUserAuthenticated();
      console.log('Fresh token acquired, length:', freshToken?.length || 0);

      // CRITICAL: Wait a moment to ensure auth context is fully set
      await new Promise(resolve => setTimeout(resolve, 500));

      const roomName = `instant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const participantName = user.name || user.displayName || user.email || `User-${user.uid.substr(0, 8)}`;
      
      console.log('Room name:', roomName);
      console.log('Participant name:', participantName);
      
      // Create a notification for the client about the incoming call
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
            expiresAt: Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)) // 5 minutes
          });
          console.log('Call notification created for client');
        } catch (error) {
          console.error('Failed to create call notification:', error);
          // Continue with the call even if notification fails
        }
      }
      
      console.log('Calling generateTwilioToken function...');
      console.log('Current auth state:', {
        currentUser: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified
      });
      
      // CRITICAL: Check if user is actually authenticated
      if (!auth.currentUser) {
        throw new Error('No current user in Firebase Auth');
      }
      
      // Get the current user's ID token to verify authentication
      const idToken = await auth.currentUser.getIdToken(true);
      console.log('ID Token exists:', !!idToken, 'Length:', idToken?.length || 0);
      
      // Make sure we're using the authenticated functions instance
      const generateToken = httpsCallable(functions, 'generateTwilioToken');
      
      // Call the function with detailed logging
      console.log('Making function call with data:', {
        roomName,
        participantName,
        participantRole: user.role
      });
      
      console.log('About to call generateToken function...');
      console.log('Functions instance:', functions);
      console.log('Functions app:', functions.app);
      console.log('Functions region:', functions.region);
      console.log('httpsCallable imported:', !!httpsCallable);
      
      const result = await generateToken({
        roomName,
        participantName,
        participantRole: user.role
      });
      
      console.log('Token generated successfully:', result.data);
      
      // Open video call in new window/tab
      const callUrl = `${window.location.origin}/video-call/${roomName}/${encodeURIComponent(participantName)}`;
      const newWindow = window.open(callUrl, '_blank', 'width=1400,height=900,scrollbars=no,resizable=yes');
      
      if (newWindow) {
        // Store call info in localStorage for the new window
        localStorage.setItem('videoCallInfo', JSON.stringify({
          roomName,
          participantName,
          token: result.data.token,
          targetPerson
        }));
        
        console.log('Call opened in new window');
      } else {
        // Fallback: open in same window if popup blocked
        console.log('Popup blocked, opening in same window');
        window.location.href = callUrl;
      }
      
    } catch (error) {
      console.error('Error starting call:', error);
      console.error('Error details:', error.code, error.message);
      
      let errorMessage = 'Failed to start call';
      if (error.code === 'unauthenticated') {
        errorMessage = 'Authentication error. Please try logging out and back in.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    }
  };

  const scheduleCall = async (targetPerson) => {
    try {
      // Ensure user is authenticated
      await ensureUserAuthenticated();

      const scheduledTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      
      await addDoc(collection(db, 'scheduledCalls'), {
        roomName: `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        therapistId: user.role === 'therapist' || user.role === 'admin' ? user.uid : targetPerson.id,
        clientId: user.role === 'client' ? user.uid : targetPerson.id,
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

  const joinScheduledCall = async (call) => {
    try {
      console.log('Joining scheduled call:', call);

      // Ensure user is authenticated
      await ensureUserAuthenticated();

      const participantName = user.name || user.displayName || user.email;
      
      const generateToken = httpsCallable(functions, 'generateTwilioToken');
      
      const result = await generateToken({
        roomName: call.roomName,
        participantName,
        participantRole: user.role
      });
      
      // Open video call in new window
      const callUrl = `${window.location.origin}/video-call/${call.roomName}/${encodeURIComponent(participantName)}`;
      const newWindow = window.open(callUrl, '_blank', 'width=1400,height=900,scrollbars=no,resizable=yes');
      
      if (newWindow) {
        localStorage.setItem('videoCallInfo', JSON.stringify({
          roomName: call.roomName,
          participantName,
          token: result.data.token,
          targetPerson: null
        }));
      } else {
        window.location.href = callUrl;
      }
      
    } catch (error) {
      console.error('Error joining scheduled call:', error);
      let errorMessage = 'Failed to join call';
      if (error.code === 'unauthenticated') {
        errorMessage = 'Authentication error. Please try logging out and back in.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      alert(errorMessage);
    }
  };

  const isCallTimeReached = (scheduledTime) => {
    const now = new Date();
    const scheduled = scheduledTime.toDate();
    const timeDiff = scheduled.getTime() - now.getTime();
    return timeDiff <= 5 * 60 * 1000 && timeDiff >= -30 * 60 * 1000; // 5 min before to 30 min after
  };

  const getCallTarget = () => {
    if (user.role === 'client') {
      return assignedPerson;
    } else if (user.role === 'therapist' || user.role === 'admin') {
      return Array.isArray(assignedPerson) ? assignedPerson[0] : assignedPerson;
    }
    return null;
  };

  if (!user) {
    return <div>Loading...</div>;
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
            </div>
            <div className="notification-actions">
              <button 
                className="btn-accept"
                onClick={() => {
                  startInstantCall({ id: incomingCall.callerId, name: incomingCall.callerName });
                  setIncomingCall(null);
                }}
              >
                Accept
              </button>
              <button 
                className="btn-decline"
                onClick={() => setIncomingCall(null)}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Info */}
      <div style={{ fontSize: '12px', color: '#666', margin: '10px 0' }}>
        Auth Status: {authUser ? 'Authenticated' : 'Not Authenticated'} | 
        User ID: {authUser?.uid || 'None'} | 
        Email: {authUser?.email || 'None'}
      </div>

      {/* Assigned Person Section */}
      <div className="assigned-person-section">
        <h2>
          {user.role === 'client' ? 'Your Therapist' : 'Your Clients'}
        </h2>
        
      
        {user.role === 'client' && assignedPerson ? (
          <div className="person-card">
            <div className="person-info">
              <div className="person-avatar">
                <User size={50} />
              </div>
              <div className="person-details">
                <h3 style={{color: 'white'}}>{assignedPerson.displayName || assignedPerson.name || assignedPerson.email}</h3>
                <p>Assigned Therapist</p>
              </div>
            </div>
            <div className="person-actions">
              <button 
                className="btn-call-now"
                onClick={() => startInstantCall(assignedPerson)}
                disabled={!authUser}
              >
                <Phone size={16} />
                Call Now
              </button>
              <button 
                className="btn-schedule"
                onClick={() => setShowScheduleForm(true)}
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
                    <h3>{client.displayName || client.clientName || client.name || client.email || `Client ${client.id}`}</h3>
                    <p>Assigned Client</p>
                  </div>
                </div>
                <div className="person-actions">
                  <button 
                    className="btn-call-now"
                    onClick={() => startInstantCall(client)}
                    disabled={!authUser}
                  >
                    <Phone size={16} />
                    Call Now
                  </button>
                  <button 
                    className="btn-schedule"
                    onClick={() => setShowScheduleForm(true)}
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
            Refresh
          </button>
        </div>
        
        {isLoadingCalls ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading scheduled calls...</p>
          </div>
        ) : scheduledCalls.length > 0 ? (
          <div className="calls-grid">
            {scheduledCalls.map((call) => (
              <div key={call.id} className="call-card">
                <div className="call-info">
                  <h3>Call with {user.role === 'client' ? 'Therapist' : 'Client'}</h3>
                  <p>
                    <Clock size={16} />
                    {call.scheduledTime?.toDate().toLocaleString()}
                  </p>
                  <p>Duration: {call.duration} minutes</p>
                  {call.notes && <p>Notes: {call.notes}</p>}
                  <p>Room: {call.roomName}</p>
                </div>
                <div className="call-actions">
                  {isCallTimeReached(call.scheduledTime) && (
                    <button 
                      className="btn-join-call"
                      onClick={() => joinScheduledCall(call)}
                      disabled={!authUser}
                    >
                      <Phone size={16} />
                      Join Call
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No scheduled calls yet.</p>
          </div>
        )}
      </div>

      {/* Schedule Call Modal */}
      {showScheduleForm && (
        <div className="modal-overlay" onClick={() => setShowScheduleForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Schedule Call</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const targetPerson = user.role === 'client' ? assignedPerson : (Array.isArray(assignedPerson) ? assignedPerson[0] : assignedPerson);
              if (targetPerson) {
                scheduleCall(targetPerson);
              }
            }}>
              <div className="form-group">
                <label>Date:</label>
                <input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
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
                </select>
              </div>
              <div className="form-group">
                <label>Notes:</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
                  placeholder="Optional notes about the call"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={!authUser}>
                  Schedule Call
                </button>
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setShowScheduleForm(false)}
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