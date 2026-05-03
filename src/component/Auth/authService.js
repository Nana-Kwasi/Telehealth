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
      if (userRole === 'doctor') {
        try {
          console.log(`🔍 Fetching assigned patients for doctor: ${userId}`);

          // Get assigned patients
          const patientsQuery = query(collection(db, 'doctors', userId, 'patients'));
          const patientsSnapshot = await getDocs(patientsQuery);

          console.log(`📊 Found ${patientsSnapshot.docs.length} patients assigned to doctor ${userId}`);

          assignments = patientsSnapshot.docs.map(d => {
            const patientData = { patientId: d.data().patientId, ...d.data() };
            return patientData;
          });

          // Get doctor profile
          const doctorDoc = await getDoc(doc(db, 'doctors', userId));
          if (doctorDoc.exists()) {
            relatedData.doctorProfile = doctorDoc.data();
          }
        } catch (error) {
          console.error('❌ Error fetching doctor data:', error);
        }
      } else if (userRole === 'therapist' || userRole === 'admin') {
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
          collection(db, 'scheduledCalls'),
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
    
    // Summary log for provider login
    if (userRole === 'doctor') {
      console.log(`🎯 DOCTOR LOGIN SUMMARY:`);
      console.log(`   🩺 Doctor ID: ${userId}`);
      console.log(`   👥 Total Patients: ${assignments.length}`);
      console.log(`   📋 Patient List:`, assignments.map(p => ({
        patientId: p.patientId
      })));
    } else if (userRole === 'therapist' || userRole === 'admin') {
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

  // Check pharmacies — by doc ID first (new: setDoc uses uid as ID), then by uid field (legacy addDoc)
  try {
    const pharmacySnap = await getDoc(doc(db, 'pharmacies', uid));
    if (pharmacySnap.exists()) {
      const data = pharmacySnap.data();
      return { role: 'pharmacy', profile: { id: pharmacySnap.id, ...data, role: 'pharmacy' } };
    }
  } catch (_) {}
  try {
    const phFallback = await getDocs(query(collection(db, 'pharmacies'), where('uid', '==', uid)));
    if (!phFallback.empty) {
      const d = phFallback.docs[0].data();
      return { role: 'pharmacy', profile: { id: phFallback.docs[0].id, ...d, role: 'pharmacy' } };
    }
  } catch (_) {}

  // Check pharmacy branches
  try {
    const branchSnap = await getDoc(doc(db, 'pharmacyBranches', uid));
    if (branchSnap.exists()) {
      const data = branchSnap.data();
      return { role: 'branch_user', profile: { id: branchSnap.id, ...data, role: 'branch_user' } };
    }
  } catch (_) {}
  try {
    const brFallback = await getDocs(query(collection(db, 'pharmacyBranches'), where('uid', '==', uid)));
    if (!brFallback.empty) {
      const d = brFallback.docs[0].data();
      return { role: 'branch_user', profile: { id: brFallback.docs[0].id, ...d, role: 'branch_user' } };
    }
  } catch (_) {}

  // Check lab parent accounts
  try {
    const labSnap = await getDoc(doc(db, 'labs', uid));
    if (labSnap.exists()) {
      const data = labSnap.data();
      return { role: 'lab', profile: { id: labSnap.id, ...data, role: 'lab' } };
    }
  } catch (_) {}
  try {
    const labFallback = await getDocs(query(collection(db, 'labs'), where('uid', '==', uid)));
    if (!labFallback.empty) {
      const d = labFallback.docs[0].data();
      return { role: 'lab', profile: { id: labFallback.docs[0].id, ...d, role: 'lab' } };
    }
  } catch (_) {}

  // Check scan parent accounts
  try {
    const scanSnap = await getDoc(doc(db, 'scanCenters', uid));
    if (scanSnap.exists()) {
      const data = scanSnap.data();
      return { role: 'scan', profile: { id: scanSnap.id, ...data, role: 'scan' } };
    }
  } catch (_) {}
  try {
    const scanFallback = await getDocs(query(collection(db, 'scanCenters'), where('uid', '==', uid)));
    if (!scanFallback.empty) {
      const d = scanFallback.docs[0].data();
      return { role: 'scan', profile: { id: scanFallback.docs[0].id, ...d, role: 'scan' } };
    }
  } catch (_) {}

  // Check lab branches
  try {
    const labBranchSnap = await getDoc(doc(db, 'labBranches', uid));
    if (labBranchSnap.exists()) {
      const data = labBranchSnap.data();
      return { role: 'lab_branch', profile: { id: labBranchSnap.id, ...data, role: 'lab_branch' } };
    }
  } catch (_) {}
  try {
    const lbFallback = await getDocs(query(collection(db, 'labBranches'), where('uid', '==', uid)));
    if (!lbFallback.empty) {
      const d = lbFallback.docs[0].data();
      return { role: 'lab_branch', profile: { id: lbFallback.docs[0].id, ...d, role: 'lab_branch' } };
    }
  } catch (_) {}

  // Check scan branches
  try {
    const scanBranchSnap = await getDoc(doc(db, 'scanBranches', uid));
    if (scanBranchSnap.exists()) {
      const data = scanBranchSnap.data();
      return { role: 'scan_branch', profile: { id: scanBranchSnap.id, ...data, role: 'scan_branch' } };
    }
  } catch (_) {}
  try {
    const sbFallback = await getDocs(query(collection(db, 'scanBranches'), where('uid', '==', uid)));
    if (!sbFallback.empty) {
      const d = sbFallback.docs[0].data();
      return { role: 'scan_branch', profile: { id: sbFallback.docs[0].id, ...d, role: 'scan_branch' } };
    }
  } catch (_) {}

  // Check admin collection (standalone admins separate from therapists)
  const adminRef = doc(db, 'admins', uid);
  const adminSnap = await getDoc(adminRef);
  if (adminSnap.exists()) {
    const data = adminSnap.data();
    return {
      role: 'admin',
      profile: { id: adminSnap.id, ...data, role: 'admin' },
    };
  }

  // Check doctors collection first
  const doctorRef = doc(db, 'doctors', uid);
  const doctorSnap = await getDoc(doctorRef);

  if (doctorSnap.exists()) {
    const doctorData = doctorSnap.data();
    console.log('Found doctor data:', doctorData);

    return {
      role: 'doctor',
      profile: {
        id: doctorSnap.id,
        ...doctorData,
        role: 'doctor'
      }
    };
  }

  // Check therapists collection
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
  // Check pharmacies by username
  const phQ = query(collection(db, 'pharmacies'), where('username', '==', identifier));
  const phR = await getDocs(phQ);
  if (!phR.empty) return { id: phR.docs[0].id, ...phR.docs[0].data() };

  // Check pharmacies by email
  const phQE = query(collection(db, 'pharmacies'), where('email', '==', identifier));
  const phRE = await getDocs(phQE);
  if (!phRE.empty) return { id: phRE.docs[0].id, ...phRE.docs[0].data() };

  // Check pharmacy branches by username
  const brQ = query(collection(db, 'pharmacyBranches'), where('username', '==', identifier));
  const brR = await getDocs(brQ);
  if (!brR.empty) return { id: brR.docs[0].id, ...brR.docs[0].data() };

  // Check pharmacy branches by email
  const brQE = query(collection(db, 'pharmacyBranches'), where('email', '==', identifier));
  const brRE = await getDocs(brQE);
  if (!brRE.empty) return { id: brRE.docs[0].id, ...brRE.docs[0].data() };

  // Check labs by username/email
  const lQ = query(collection(db, 'labs'), where('username', '==', identifier));
  const lR = await getDocs(lQ);
  if (!lR.empty) return { id: lR.docs[0].id, ...lR.docs[0].data() };
  const lQE = query(collection(db, 'labs'), where('email', '==', identifier));
  const lRE = await getDocs(lQE);
  if (!lRE.empty) return { id: lRE.docs[0].id, ...lRE.docs[0].data() };

  // Check scan centers by username/email
  const sQ = query(collection(db, 'scanCenters'), where('username', '==', identifier));
  const sR = await getDocs(sQ);
  if (!sR.empty) return { id: sR.docs[0].id, ...sR.docs[0].data() };
  const sQE = query(collection(db, 'scanCenters'), where('email', '==', identifier));
  const sRE = await getDocs(sQE);
  if (!sRE.empty) return { id: sRE.docs[0].id, ...sRE.docs[0].data() };

  // Check lab branches by username/email
  const lbQ = query(collection(db, 'labBranches'), where('username', '==', identifier));
  const lbR = await getDocs(lbQ);
  if (!lbR.empty) return { id: lbR.docs[0].id, ...lbR.docs[0].data() };
  const lbQE = query(collection(db, 'labBranches'), where('email', '==', identifier));
  const lbRE = await getDocs(lbQE);
  if (!lbRE.empty) return { id: lbRE.docs[0].id, ...lbRE.docs[0].data() };

  // Check scan branches by username/email
  const sbQ = query(collection(db, 'scanBranches'), where('username', '==', identifier));
  const sbR = await getDocs(sbQ);
  if (!sbR.empty) return { id: sbR.docs[0].id, ...sbR.docs[0].data() };
  const sbQE = query(collection(db, 'scanBranches'), where('email', '==', identifier));
  const sbRE = await getDocs(sbQE);
  if (!sbRE.empty) return { id: sbRE.docs[0].id, ...sbRE.docs[0].data() };

  // Check admins
  const adQ = query(collection(db, 'admins'), where('username', '==', identifier));
  const adR = await getDocs(adQ);
  if (!adR.empty) return { id: adR.docs[0].id, ...adR.docs[0].data() };

  // Check doctors collection
  const dQ = query(collection(db, 'doctors'), where('username', '==', identifier));
  const dR = await getDocs(dQ);
  if (!dR.empty) return { id: dR.docs[0].id, ...dR.docs[0].data() };

  const dQE = query(collection(db, 'doctors'), where('email', '==', identifier));
  const dRE = await getDocs(dQE);
  if (!dRE.empty) return { id: dRE.docs[0].id, ...dRE.docs[0].data() };

  // Check therapists collection
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


