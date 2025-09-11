import { auth, db } from './firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { ensureVanessaAdmin } from './adminSeed';

// Comprehensive user login logging system
async function logUserLoginData(userId, userRole, profile, success, errorMessage = null) {
  try {
    const sessionId = sessionStorage.getItem('sessionId') || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    if (!sessionStorage.getItem('sessionId')) {
      sessionStorage.setItem('sessionId', sessionId);
    }

    // Get device and browser information
    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      colorDepth: window.screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      url: window.location.href,
      referrer: document.referrer,
      sessionId: sessionId
    };

    // Get user profile data based on role
    let userProfileData = {};
    let assignments = [];
    let relatedData = {};

    if (success && profile) {
      userProfileData = {
        id: profile.id || userId,
        name: profile.name || profile.displayName || 'Unknown',
        email: profile.email || 'Unknown',
        role: userRole,
        ...profile
      };

      // Get role-specific data
      if (userRole === 'therapist' || userRole === 'admin') {
        try {
          console.log(`🔍 Fetching assigned clients for therapist: ${userId}`);
          
          // Get assigned clients
          const clientsQuery = query(collection(db, 'therapists', userId, 'clients'));
          const clientsSnapshot = await getDocs(clientsQuery);
          
          console.log(`📊 Found ${clientsSnapshot.docs.length} clients assigned to therapist ${userId}`);
          
          assignments = clientsSnapshot.docs.map(doc => {
            const clientData = {
              clientId: doc.data().clientId,
              assignedAt: doc.data().assignedAt,
              ...doc.data()
            };
            console.log(`👤 Client assigned:`, {
              clientId: clientData.clientId,
              assignedAt: clientData.assignedAt,
              documentId: doc.id
            });
            return clientData;
          });

          console.log(`📋 Complete client assignments for therapist ${userId}:`, assignments);

          // Get therapist-specific data
          const therapistDoc = await getDoc(doc(db, 'therapists', userId));
          if (therapistDoc.exists()) {
            relatedData.therapistProfile = therapistDoc.data();
            console.log(`👨‍⚕️ Therapist profile data:`, relatedData.therapistProfile);
          }
        } catch (error) {
          console.error('❌ Error fetching therapist data:', error);
        }
      } else if (userRole === 'client') {
        try {
          // Get client profile data
          const clientDoc = await getDoc(doc(db, 'clients', profile.clientId || userId));
          if (clientDoc.exists()) {
            relatedData.clientProfile = clientDoc.data();
          }

          // Get assigned therapist
          const therapistQuery = query(collection(db, 'therapists'), where('clients', 'array-contains', userId));
          const therapistSnapshot = await getDocs(therapistQuery);
          if (!therapistSnapshot.empty) {
            const therapistData = therapistSnapshot.docs[0].data();
            assignments = [{
              therapistId: therapistSnapshot.docs[0].id,
              assignedAt: therapistData.assignedAt,
              ...therapistData
            }];
          }
        } catch (error) {
          console.error('Error fetching client data:', error);
        }
      }

      // Get recent activity data
      try {
        console.log(`📞 Fetching recent calls for ${userRole}: ${userId}`);
        const recentCallsQuery = query(
          collection(db, 'scheduleCalls'),
          where(userRole === 'client' ? 'clientId' : 'therapistId', '==', userId)
        );
        const recentCallsSnapshot = await getDocs(recentCallsQuery);
        relatedData.recentCalls = recentCallsSnapshot.docs.slice(0, 5).map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log(`📞 Found ${relatedData.recentCalls.length} recent calls for ${userRole}:`, relatedData.recentCalls);
      } catch (error) {
        console.error('❌ Error fetching recent calls:', error);
      }

      // Get message activity - messages are in subcollections
      try {
        console.log(`💬 Fetching recent messages for ${userRole}: ${userId}`);
        
        if (userRole === 'therapist' || userRole === 'admin') {
          // For therapists, fetch from client_chats/{clientId}/messages - BOTH directions
          const allMessages = [];
          
          // Get assigned clients first
          const therapistClientsCol = collection(db, 'therapists', userId, 'clients');
          const clientsSnapshot = await getDocs(therapistClientsCol);
          const assignedClientIds = clientsSnapshot.docs.map(doc => doc.data().clientId);
          
          for (const clientId of assignedClientIds) {
            try {
              // Fetch from client_chats/{clientId}/messages - BOTH directions
              const clientMessagesRef = collection(db, 'client_chats', clientId, 'messages');
              const clientMessagesSnap = await getDocs(clientMessagesRef);
              const clientMessages = clientMessagesSnap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(msg => msg.from === userId || msg.to === userId);
              allMessages.push(...clientMessages);
              
              // Fetch from therapist_chats/{therapistId}/messages - BOTH directions
              const therapistMessagesRef = collection(db, 'therapist_chats', userId, 'messages');
              const therapistMessagesSnap = await getDocs(therapistMessagesRef);
              const therapistMessages = therapistMessagesSnap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(msg => msg.to === clientId || msg.from === clientId);
              allMessages.push(...therapistMessages);
            } catch (error) {
              console.error(`Error fetching messages for client ${clientId}:`, error);
            }
          }
          
          // Fetch therapist-to-therapist messages
          try {
            const therapistChatsRef = collection(db, 'therapist_chats');
            const therapistChatsSnap = await getDocs(therapistChatsRef);
            const therapistToTherapistMessages = therapistChatsSnap.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter(chat => chat.from === userId || chat.to === userId);
            allMessages.push(...therapistToTherapistMessages);
          } catch (error) {
            console.error('Error fetching therapist-to-therapist messages:', error);
          }
          
          relatedData.recentMessages = allMessages.slice(0, 10);
        } else {
          // For clients, fetch from client_chats/{clientId}/messages where to = clientId
          const clientMessagesRef = collection(db, 'client_chats', userId, 'messages');
          const messagesSnapshot = await getDocs(clientMessagesRef);
          relatedData.recentMessages = messagesSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(msg => msg.to === userId)
            .slice(0, 10);
        }
        
        console.log(`💬 Found ${relatedData.recentMessages.length} recent messages for ${userRole}:`, relatedData.recentMessages);
      } catch (error) {
        console.error('❌ Error fetching recent messages:', error);
      }
    }

    const comprehensiveLoginLog = {
      // Basic login info
      userId,
      userRole,
      success,
      errorMessage,
      timestamp: serverTimestamp(),
      
      // Device and session info
      deviceInfo,
      
      // User profile data
      userProfile: userProfileData,
      
      // Assignments and relationships
      assignments,
      
      // Related data
      relatedData,
      
      // Login metadata
      loginMetadata: {
        loginTime: new Date().toISOString(),
        sessionDuration: 0, // Will be updated on logout
        loginSource: 'web_app',
        authenticationMethod: 'email_password'
      }
    };

    await addDoc(collection(db, 'userLoginLogs'), comprehensiveLoginLog);
    console.log('✅ Comprehensive user login data logged for:', userId);
    
    // Summary log for therapist client assignments
    if (userRole === 'therapist' || userRole === 'admin') {
      console.log(`🎯 THERAPIST LOGIN SUMMARY:`);
      console.log(`   👨‍⚕️ Therapist ID: ${userId}`);
      console.log(`   👥 Total Clients Assigned: ${assignments.length}`);
      console.log(`   📋 Client List:`, assignments.map(client => ({
        clientId: client.clientId,
        assignedAt: client.assignedAt
      })));
      console.log(`   📞 Recent Calls: ${relatedData.recentCalls?.length || 0}`);
      console.log(`   💬 Recent Messages: ${relatedData.recentMessages?.length || 0}`);
    }
    
    // Store login time for session duration calculation
    if (success) {
      sessionStorage.setItem('loginTime', new Date().toISOString());
    }
    
    // Also create a simplified login log for backward compatibility
    const simpleLoginLog = {
      userId,
      userRole,
      success,
      errorMessage,
      timestamp: serverTimestamp(),
      ipAddress: 'System',
      userAgent: navigator.userAgent,
      sessionId: sessionId
    };
    await addDoc(collection(db, 'loginLogs'), simpleLoginLog);
    
  } catch (error) {
    console.error('Error creating comprehensive login log:', error);
  }
}

// Legacy function for backward compatibility
async function logLoginAttempt(userId, userRole, success, errorMessage = null) {
  return logUserLoginData(userId, userRole, null, success, errorMessage);
}

// Log user logout
export async function logUserLogout(userId, userRole, profile) {
  try {
    const sessionId = sessionStorage.getItem('sessionId');
    const loginTime = sessionStorage.getItem('loginTime');
    
    if (sessionId) {
      const logoutLog = {
        userId,
        userRole,
        profile: profile || {},
        sessionId,
        logoutTime: new Date().toISOString(),
        loginTime: loginTime || 'Unknown',
        sessionDuration: loginTime ? 
          Math.floor((new Date().getTime() - new Date(loginTime).getTime()) / 1000) : 0,
        timestamp: serverTimestamp(),
        logoutSource: 'web_app',
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          url: window.location.href
        }
      };

      await addDoc(collection(db, 'userLogoutLogs'), logoutLog);
      console.log('User logout logged for:', userId);
      
      // Clear session data
      sessionStorage.removeItem('sessionId');
      sessionStorage.removeItem('loginTime');
    }
  } catch (error) {
    console.error('Error logging user logout:', error);
  }
}

// Sign-in that accepts email OR username
export async function signInWithEmailOrUsername(identifier, password) {
  let userRole = null;
  let userId = null;
  
  try {
    // If identifier looks like an email, try email sign-in directly first
    const looksLikeEmail = /@/.test(identifier);
    if (looksLikeEmail) {
      try {
        const res = await signInWithEmailAndPassword(auth, identifier, password);
        const roleResult = await resolveRole(res.user.uid);
        userRole = roleResult.role;
        userId = res.user.uid;
        
        // Log successful login
        await logLoginAttempt(userId, userRole, true);
        
        return roleResult;
      } catch (e) {
        // Log failed login attempt
        await logLoginAttempt(identifier, 'unknown', false, e.message);
        // fallthrough to username scan
      }
    }
    
    // Search username in both collections
    const userDoc = await findUserByUsernameOrEmail(identifier);
    if (!userDoc) {
      // Seed Vanessa (first admin) on-demand
      if (identifier === 'nessa1' || identifier === 'franciskontoh4@gmail.com') {
        await ensureVanessaAdmin();
        const res = await signInWithEmailAndPassword(auth, 'franciskontoh4@gmail.com', password);
        const roleResult = await resolveRole(res.user.uid);
        userRole = roleResult.role;
        userId = res.user.uid;
        
        // Log successful login
        await logLoginAttempt(userId, userRole, true);
        
        return roleResult;
      }
      
      // Log failed login attempt
      await logLoginAttempt(identifier, 'unknown', false, 'User not found');
      throw new Error('User not found');
    }
    
    const { email } = userDoc;
    const res = await signInWithEmailAndPassword(auth, email, password);
    const roleResult = await resolveRole(res.user.uid);
    userRole = roleResult.role;
    userId = res.user.uid;
    
    // Log successful login with comprehensive data
    await logUserLoginData(userId, userRole, roleResult.profile, true);
    
    return roleResult;
  } catch (error) {
    // Log failed login attempt if not already logged
    if (!userRole) {
      await logLoginAttempt(identifier, 'unknown', false, error.message);
    }
    throw error;
  }
}

export async function resolveRole(uid) {
  console.log('Resolving role for UID:', uid);
  
  // Check therapists collection first
  const therapistRef = doc(db, 'therapists', uid);
  const therapistSnap = await getDoc(therapistRef);
  
  if (therapistSnap.exists()) {
    const therapistData = therapistSnap.data();
    console.log('Found therapist data:', therapistData);
    
    // Check if this is an admin user
    if (therapistData.role === 'admin') {
      return { 
        role: 'therapist', // Admin users get therapist dashboard
        profile: { 
          id: therapistSnap.id, 
          ...therapistData,
          role: 'admin'
        } 
      };
    }
    
    // Regular therapist
    return { 
      role: 'therapist', 
      profile: { 
        id: therapistSnap.id, 
        ...therapistData,
        role: therapistData.role || 'therapist'
      } 
    };
  }
  
  // Check auth collection for clients
  const authRef = doc(db, 'auth', uid);
  const authSnap = await getDoc(authRef);
  
  if (authSnap.exists()) {
    const authData = authSnap.data();
    console.log('Found auth data:', authData);
    
    // Check client status in both auth and clients collections
    let clientStatus = authData.status || 'active';
    
    // Also check clients collection for status
    if (authData.clientId) {
      try {
        const clientRef = doc(db, 'clients', authData.clientId);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          const clientData = clientSnap.data();
          clientStatus = clientData.status || clientStatus;
        }
      } catch (error) {
        console.log('Error checking clients collection:', error);
      }
    }
    
    // Check if client is not active
    if (clientStatus !== 'active') {
      let errorMessage = 'Your account is not active. Please contact your therapist or administrator for assistance.';
      
      switch (clientStatus) {
        case 'inactive':
          errorMessage = 'Your account has been deactivated. Please contact your therapist or administrator for assistance.';
          break;
        case 'discharged':
          errorMessage = 'Your account has been discharged. Please contact your therapist or administrator for assistance.';
          break;
        case 'on_hold':
          errorMessage = 'Your account is currently on hold. Please contact your therapist or administrator for assistance.';
          break;
        default:
          errorMessage = 'Your account is not active. Please contact your therapist or administrator for assistance.';
      }
      
      throw new Error(errorMessage);
    }
    
    return { 
      role: 'client', 
      profile: { 
        id: authSnap.id, 
        ...authData,
        status: clientStatus,
        role: 'client'
      } 
    };
  }
  
  console.log('No user data found, returning guest role');
  return { role: 'guest', profile: null };
}

export async function findUserByUsernameOrEmail(identifier) {
  // Check therapists collection first
  const tQ = query(collection(db, 'therapists'), where('username', '==', identifier));
  const tR = await getDocs(tQ);
  if (!tR.empty) return { id: tR.docs[0].id, ...tR.docs[0].data() };
  
  // Check therapists by email
  const tQE = query(collection(db, 'therapists'), where('email', '==', identifier));
  const tRE = await getDocs(tQE);
  if (!tRE.empty) return { id: tRE.docs[0].id, ...tRE.docs[0].data() };
  
  // Check auth collection for clients
  const cQ = query(collection(db, 'auth'), where('username', '==', identifier));
  const cR = await getDocs(cQ);
  if (!cR.empty) return { id: cR.docs[0].id, ...cR.docs[0].data() };
  
  const cQE = query(collection(db, 'auth'), where('email', '==', identifier));
  const cRE = await getDocs(cQE);
  if (!cRE.empty) return { id: cRE.docs[0].id, ...cRE.docs[0].data() };
  
  return null;
}


