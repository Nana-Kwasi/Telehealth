import React, { useEffect, useState, useRef } from 'react';
import { auth, db, storage } from '../../Auth/firebaseConfig';
import { collection, onSnapshot, addDoc, serverTimestamp, orderBy, query, doc, getDoc, getDocs, where, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { 
  Search, 
  Mic, 
  Send, 
  Paperclip, 
  Smile,
  FileText,
  MessageSquare,
  Calendar,
  Clock,
  Target,
  TrendingUp,
  BookOpen,
  CheckCircle,
  Plus,
  Users,
  Mail,
  Phone,
  MoreVertical,
  Edit,
  Eye,
  UserX,
  UserCheck,
  Trash2,
  Download,
  Upload,
  Filter
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer
} from 'recharts';
import './Clients.css';

// Therapy Note Modal Component
const TherapyNoteModal = ({ client, onClose, onSave }) => {
  const [noteData, setNoteData] = useState({
    sessionDate: new Date().toISOString().split('T')[0],
    sessionTime: '',
    sessionNumber: '',
    mood: '',
    behavioralObservations: '',
    sessionFocus: '',
    interventionsUsed: '',
    clientResponse: '',
    goalsReviewed: [],
    progressAssessment: '',
    moodRating: 5,
    homework: '',
    nextSessionFocus: '',
    followUpDate: ''
  });

  const moodOptions = ['Anxious', 'Calm', 'Sad', 'Hopeful', 'Angry', 'Excited', 'Neutral', 'Depressed', 'Optimistic', 'Stressed'];
  const progressOptions = ['Significantly Improved', 'Improved', 'Slight Improvement', 'No Change', 'Slight Decline', 'Worsened'];
  const interventionOptions = ['CBT', 'Mindfulness', 'Role Play', 'Supportive Listening', 'Psychoeducation', 'Exposure Therapy', 'Solution-Focused', 'Other'];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(noteData);
  };

  return (
    <div className="modal-overlay">
      <div className="therapy-note-modal">
        <div className="modal-header">
          <h2>Add Therapy Note - {client.clientName || client.displayName}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="note-form">
          {/* Session Information */}
          <div className="form-section">
            <h3 style={{color:'white'}}>Session Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Date of Session</label>
                <input
                  type="date"
                  value={noteData.sessionDate}
                  onChange={(e) => setNoteData({...noteData, sessionDate: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Time of Session</label>
                <input
                  type="time"
                  value={noteData.sessionTime}
                  onChange={(e) => setNoteData({...noteData, sessionTime: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Session Number</label>
                <input
                  type="text"
                  placeholder="e.g., Session 1, Session 5"
                  value={noteData.sessionNumber}
                  onChange={(e) => setNoteData({...noteData, sessionNumber: e.target.value})}
                  required
                />
              </div>
            </div>
          </div>

          {/* Client Presentation */}
          <div className="form-section">
            <h3 style={{color:'white'}}>Client Presentation</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Mood / Emotional State</label>
                <select
                  value={noteData.mood}
                  onChange={(e) => setNoteData({...noteData, mood: e.target.value})}
                  required
                >
                  <option value="">Select mood...</option>
                  {moodOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full-width">
                <label>Behavioral Observations</label>
                <textarea
                  placeholder="What you noticed about client's demeanor, body language, attitude..."
                  value={noteData.behavioralObservations}
                  onChange={(e) => setNoteData({...noteData, behavioralObservations: e.target.value})}
                  rows="3"
                />
              </div>
            </div>
          </div>

          {/* Session Details */}
          <div className="form-section">
            <h3 style={{color:'white'}}>Session Details</h3>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Session Focus / Issues Discussed</label>
                <textarea
                  placeholder="Main topics covered, e.g., anxiety management, relationship conflict..."
                  value={noteData.sessionFocus}
                  onChange={(e) => setNoteData({...noteData, sessionFocus: e.target.value})}
                  rows="3"
                  required
                />
              </div>
              <div className="form-group">
                <label>Interventions Used</label>
                <select
                  value={noteData.interventionsUsed}
                  onChange={(e) => setNoteData({...noteData, interventionsUsed: e.target.value})}
                  required
                >
                  <option value="">Select intervention...</option>
                  {interventionOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full-width">
                <label>Client Response</label>
                <textarea
                  placeholder="How the client engaged or reacted to interventions..."
                  value={noteData.clientResponse}
                  onChange={(e) => setNoteData({...noteData, clientResponse: e.target.value})}
                  rows="3"
                />
              </div>
            </div>
          </div>

          {/* Progress Tracking */}
          <div className="form-section">
            <h3 style={{color:'white'}}>Progress Tracking</h3>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Goals Reviewed</label>
                <textarea
                  placeholder="What goals were discussed and reviewed..."
                  value={noteData.goalsReviewed}
                  onChange={(e) => setNoteData({...noteData, goalsReviewed: e.target.value})}
                  rows="2"
                />
              </div>
              <div className="form-group">
                <label>Progress Assessment</label>
                <select
                  value={noteData.progressAssessment}
                  onChange={(e) => setNoteData({...noteData, progressAssessment: e.target.value})}
                  required
                >
                  <option value="">Select progress...</option>
                  {progressOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Mood/Progress Rating (1-10)</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={noteData.moodRating}
                  onChange={(e) => setNoteData({...noteData, moodRating: parseInt(e.target.value)})}
                  className="rating-slider"
                />
                <div className="rating-display">
                  <span className="rating-number">{noteData.moodRating}</span>
                  <span className="rating-emoji">
                    {noteData.moodRating <= 3 ? '😢' : 
                     noteData.moodRating <= 5 ? '😐' : 
                     noteData.moodRating <= 7 ? '🙂' : '😊'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Plan / Next Steps */}
          <div className="form-section">
            <h3 style={{color:'white'}}>Plan / Next Steps</h3>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Homework or Assignments</label>
                <textarea
                  placeholder="e.g., journaling, relaxation exercises, reading assignments..."
                  value={noteData.homework}
                  onChange={(e) => setNoteData({...noteData, homework: e.target.value})}
                  rows="2"
                />
              </div>
              <div className="form-group full-width">
                <label>Next Session Focus</label>
                <textarea
                  placeholder="What to continue working on in the next session..."
                  value={noteData.nextSessionFocus}
                  onChange={(e) => setNoteData({...noteData, nextSessionFocus: e.target.value})}
                  rows="2"
                />
              </div>
              <div className="form-group">
                <label>Follow-Up Date</label>
                <input
                  type="date"
                  value={noteData.followUpDate}
                  onChange={(e) => setNoteData({...noteData, followUpDate: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Therapy Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function TherapistClients({ profile }) {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedClientForNote, setSelectedClientForNote] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('table'); // 'chat', 'table', or 'other'
  const [expandedClient, setExpandedClient] = useState(null); // Track which client row is expanded
  const [searchTerm, setSearchTerm] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({}); // Track unread messages per client
  const [therapyNotes, setTherapyNotes] = useState([]);
  const [loadingTherapyNotes, setLoadingTherapyNotes] = useState(false);
  const [allClients, setAllClients] = useState([]);
  const [showClientDetailsModal, setShowClientDetailsModal] = useState(false);
  const [selectedClientForDetails, setSelectedClientForDetails] = useState(null);
  const [showTherapistDetailsModal, setShowTherapistDetailsModal] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [showMessageMenu, setShowMessageMenu] = useState(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedClientForReassign, setSelectedClientForReassign] = useState(null);
  const [allTherapists, setAllTherapists] = useState([]);
  const [clientTherapyNotes, setClientTherapyNotes] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [showBulkExportModal, setShowBulkExportModal] = useState(false);
  const [selectedClientForAction, setSelectedClientForAction] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateMessage, setStatusUpdateMessage] = useState('');
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [editFormData, setEditFormData] = useState({});
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedNewStatus, setSelectedNewStatus] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const currentUser = auth.currentUser;
  const isAdmin = profile?.role === 'admin';
  
  // Add loading state to ensure profile is loaded
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);

  // Set profile as loaded when it's available
  useEffect(() => {
    if (profile) {
      setIsProfileLoaded(true);
    }
  }, [profile]);

  // Helper functions for status handling
  const getStatusClass = (status) => {
    switch (status) {
      case 'active': return 'active';
      case 'inactive': return 'inactive';
      case 'discharged': return 'discharged';
      case 'on_hold': return 'on-hold';
      default: return 'active';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'discharged': return 'Discharged';
      case 'on_hold': return 'On Hold';
      default: return 'Active';
    }
  };

  const getStatusAction = (status) => {
    switch (status) {
      case 'active': return 'Deactivate';
      case 'inactive': return 'Activate';
      case 'discharged': return 'Reactivate';
      case 'on_hold': return 'Resume';
      default: return 'Deactivate';
    }
  };

  // Reset active tab if user is not admin and 'other' tab is active
  // Only run this when profile is loaded and isAdmin is properly determined
  useEffect(() => {
    if (isProfileLoaded && !isAdmin && activeTab === 'other') {
      setActiveTab('table'); // Reset to 'table' (My Clients) instead of 'chat'
    }
  }, [isProfileLoaded, isAdmin, activeTab]);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;

    // Fetch assigned clients for current therapist
    const therapistClientsCol = collection(db, 'therapists', u.uid, 'clients');
    const clientsUnsub = onSnapshot(therapistClientsCol, async (snap) => {
      const clientIds = snap.docs.map(doc => doc.data().clientId);
      
      // Fetch full client details
      const clientsData = [];
      for (const clientId of clientIds) {
        try {
          const clientDoc = await getDoc(doc(db, 'clients', clientId));
          if (clientDoc.exists()) {
            const clientData = clientDoc.data();
            
            // Fetch client profile data from auth collection using clientId
            let authData = {};
            try {
              // Use the clientId from the clients collection to find the auth document
              const authQuery = collection(db, 'auth');
              const authSnapshot = await getDocs(query(authQuery, where('clientId', '==', clientId)));
              
              if (!authSnapshot.empty) {
                authData = authSnapshot.docs[0].data();
                console.log('Auth data found:', authData);
              } else {
                // Fallback: try to find by uid if clientId doesn't work
                const authDoc = await getDoc(doc(db, 'auth', clientId));
                if (authDoc.exists()) {
                  authData = authDoc.data();
                  console.log('Auth data found by uid:', authData);
                }
              }
            } catch (authError) {
              console.log('Error fetching auth data for client:', clientId, authError);
            }
            
            // Create a display name from available fields
            let displayName = 'Client';
            
            // Priority: clientData.displayName > clientData.clientName > authData.name > email > gender+age
            if (clientData.displayName) {
              displayName = clientData.displayName;
            } else if (clientData.clientName) {
              displayName = clientData.clientName;
            } else if (authData.name) {
              displayName = authData.name;
            } else if (authData.email) {
              displayName = authData.email.split('@')[0];
            } else if (clientData.email) {
              displayName = clientData.email.split('@')[0];
            } else if (clientData.gender && clientData.age) {
              displayName = `${clientData.gender === 'man' ? 'Male' : clientData.gender === 'woman' ? 'Female' : 'Person'} (${clientData.age})`;
            } else if (clientData.gender) {
              displayName = `${clientData.gender === 'man' ? 'Male' : clientData.gender === 'woman' ? 'Female' : 'Person'} Client`;
            } else if (clientData.age) {
              displayName = `Client (${clientData.age})`;
            }
            
            // Log client data for debugging
            console.log('Client data:', clientData);
            console.log('Auth data:', authData);
            console.log('Generated display name:', displayName);
            
            // Add display name to client data and merge auth data
            const enhancedClientData = {
              id: clientId,
              ...clientData,
              ...authData, // Merge auth data (including name, email, etc.)
              displayName: displayName,
              clientEmail: authData.email || clientData.email,
              clientName: displayName // Use the resolved display name
            };
            
            clientsData.push(enhancedClientData);
          }
        } catch (error) {
          console.error('Error fetching client:', error);
        }
      }
      
      // Sort clients by display name
      clientsData.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      setClients(clientsData);
    });

    return () => {
      clientsUnsub();
    };
  }, []);

  // Function to set all clients to active status by default
  const setAllClientsActive = async () => {
    try {
      const clientsSnapshot = await getDocs(collection(db, 'clients'));
      const updatePromises = [];
      
      for (const clientDoc of clientsSnapshot.docs) {
        const clientData = clientDoc.data();
        
        // Only update if status is not already set to 'active'
        if (clientData.status !== 'active') {
          const clientRef = doc(db, 'clients', clientDoc.id);
          updatePromises.push(
            updateDoc(clientRef, {
              status: 'active',
              lastModified: serverTimestamp(),
              modifiedBy: currentUser?.uid || 'system'
            })
          );
        }
      }
      
      // Also update auth collection
      const authSnapshot = await getDocs(collection(db, 'auth'));
      for (const authDoc of authSnapshot.docs) {
        const authData = authDoc.data();
        
        // Only update if status is not already set to 'active'
        if (authData.status !== 'active') {
          const authRef = doc(db, 'auth', authDoc.id);
          updatePromises.push(
            updateDoc(authRef, {
              status: 'active',
              lastModified: serverTimestamp()
            })
          );
        }
      }
      
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        console.log(`Updated ${updatePromises.length} client records to active status`);
        
        // Log this admin action
        await logAdminAction(
          'BULK_CLIENT_ACTIVATION',
          {
            description: 'Set all clients to active status by default',
            updatedCount: updatePromises.length
          }
        );
      }
    } catch (error) {
      console.error('Error setting clients to active:', error);
    }
  };

  // Fetch all clients and therapists for Other Clients tab
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // Fetch all therapists
        const therapistsSnapshot = await getDocs(collection(db, 'therapists'));
        const therapistsData = therapistsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log('Fetched therapists data:', therapistsData);
        setAllTherapists(therapistsData);
        
        // Then fetch all clients with therapist assignments
        const clientsSnapshot = await getDocs(collection(db, 'clients'));
        const clientsData = [];
        
        for (const clientDoc of clientsSnapshot.docs) {
          const clientData = clientDoc.data();
          const clientId = clientDoc.id;
          
          // Fetch client profile data from auth collection
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
          
          // Create display name
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
          
          // Get assigned therapist info by checking therapists subcollections
          let assignedTherapist = null;
          try {
            // Check all therapists to see which one has this client
            for (const therapistDoc of therapistsSnapshot.docs) {
              const therapistId = therapistDoc.id;
              const therapistClientsRef = collection(db, 'therapists', therapistId, 'clients');
              const therapistClientsSnapshot = await getDocs(therapistClientsRef);
              const hasClient = therapistClientsSnapshot.docs.some(doc => doc.data().clientId === clientId);
              
              if (hasClient) {
                const therapistData = therapistDoc.data();
                assignedTherapist = {
                  id: therapistId,
                  name: therapistData.name || therapistData.email || 'Unknown Therapist',
                  email: therapistData.email
                };
                break;
              }
            }
          } catch (error) {
            console.log('Error fetching therapist assignment:', error);
          }
          
          const enhancedClientData = {
            id: clientId,
            ...clientData,
            ...authData,
            displayName: displayName,
            clientEmail: authData.email || clientData.email,
            clientName: authData.name,
            assignedTherapist: assignedTherapist,
            status: clientData.status || 'active' // Ensure status defaults to active
          };
          
          clientsData.push(enhancedClientData);
        }
        
        setAllClients(clientsData);
      } catch (error) {
        console.error('Error fetching all data:', error);
      }
    };
    
    if (isAdmin) {
      fetchAllData();
    }
  }, [isAdmin]);

  // Auto-select first client when clients are loaded
  // Removed auto-selection of first client to prevent automatic tab switching
  // useEffect(() => {
  //   if (clients.length > 0 && !selectedClient) {
  //     const firstClient = clients[0];
  //     console.log('Auto-selecting first client:', firstClient);
  //     handleClientSelect(firstClient);
  //   }
  // }, [clients, selectedClient]);

  useEffect(() => {
    if (!selectedClient) return;

    console.log('Messages useEffect triggered with selectedClient:', selectedClient);
    console.log('Selected client name:', selectedClient.clientName);

    // Fetch messages for selected client
    const chatPath = getChatPath(selectedClient);
    const messagesCol = collection(db, chatPath);
    const q = query(messagesCol, orderBy('createdAt', 'asc'));
    
    const messagesUnsub = onSnapshot(q, (snap) => {
      const messagesData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        status: doc.data().status || 'sent'
      }));
      setMessages(messagesData);
      
      // Mark messages as read when therapist opens the chat
      markMessagesAsRead(selectedClient.id);
    });

    return () => {
      messagesUnsub();
    };
  }, [selectedClient]);

  // Function to mark messages as read and seen
  const markMessagesAsRead = async (clientId) => {
    if (!clientId) return;
    
    try {
      const chatPath = getChatPath({ id: clientId });
      const messagesCol = collection(db, chatPath);
      const q = query(
        messagesCol, 
        where('to', '==', currentUser.uid),
        where('read', '==', false)
      );
      
      const unreadMessages = await getDocs(q);
      const updatePromises = unreadMessages.docs.map(doc => 
        updateDoc(doc.ref, { 
          read: true, 
          status: 'seen',
          readAt: serverTimestamp()
        })
      );
      
      await Promise.all(updatePromises);
      
      // Update unread counts
      setUnreadCounts(prev => ({
        ...prev,
        [clientId]: 0
      }));
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  // Function to get unread message counts for all clients
  const fetchUnreadCounts = async () => {
    try {
      const counts = {};
      
      for (const client of clients) {
        const chatPath = getChatPath(client);
        const messagesCol = collection(db, chatPath);
        const q = query(
          messagesCol,
          where('to', '==', currentUser.uid),
          where('read', '==', false)
        );
        
        const unreadSnapshot = await getDocs(q);
        counts[client.id] = unreadSnapshot.size;
      }
      
      setUnreadCounts(counts);
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  };

  // Fetch unread counts when clients change
  useEffect(() => {
    if (clients.length > 0) {
      fetchUnreadCounts();
    }
  }, [clients]);

  // Real-time listener for unread messages
  useEffect(() => {
    if (clients.length === 0) return;

    const unsubscribes = clients.map(client => {
      const chatPath = getChatPath(client);
      const messagesCol = collection(db, chatPath);
      const q = query(
        messagesCol,
        where('to', '==', currentUser.uid),
        where('read', '==', false)
      );

      return onSnapshot(q, (snapshot) => {
        setUnreadCounts(prev => ({
          ...prev,
          [client.id]: snapshot.size
        }));
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [clients, currentUser.uid]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const getChatPath = (client) => {
    // Use the same chat path structure as client Messages.js
    return `client_chats/${client.id}/messages`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleClientSelect = (client) => {
    console.log('Selected client data:', client);
    console.log('Client name:', client.clientName);
    console.log('Display name:', client.displayName);
    console.log('Auth name:', client.name);
    
    // Ensure we have the complete client data
    const completeClient = {
      ...client,
      clientName: client.clientName || client.name || client.displayName || 'Client'
    };
    
    console.log('Complete client data:', completeClient);
    setSelectedClient(completeClient);
    setMessages([]);
    setActiveTab('chat');
    
    // Fetch therapy notes for this client
    fetchTherapyNotes(completeClient.id);
  };

  // Handler functions for All Clients modals
  const fetchClientTherapyNotes = async (clientId) => {
    try {
      const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
      const notesSnapshot = await getDocs(notesRef);
      const notes = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setClientTherapyNotes(notes);
    } catch (error) {
      console.error('Error fetching client therapy notes:', error);
      setClientTherapyNotes([]);
    }
  };

  // Handler functions for core account functions
  const handleDropdownToggle = (clientId) => {
    setDropdownOpen(dropdownOpen === clientId ? null : clientId);
  };

  const handleEditClient = (client) => {
    setSelectedClientForAction(client);
    setEditFormData({
      name: client.clientName || client.displayName || '',
      email: client.clientEmail || '',
      phone: client.phone || '',
      age: client.age || '',
      gender: client.gender || 'man',
      country: client.country || '',
      therapyType: client.therapyType || 'Individual Therapy',
      sessionFrequency: client.sessionFrequency || 'Weekly'
    });
    setShowEditClientModal(true);
    setDropdownOpen(null);
  };

  // Handle saving edited client information
  const handleSaveClientEdit = async (formData) => {
    if (!selectedClientForAction) return;
    
    setIsEditingClient(true);
    setEditMessage('Updating client information...');
    
    try {
      setEditMessage('Updating client record in database...');
      
      // Update clients collection
      const clientRef = doc(db, 'clients', selectedClientForAction.id);
      await updateDoc(clientRef, {
        ...formData,
        lastModified: serverTimestamp(),
        modifiedBy: currentUser?.uid || 'admin'
      });
      
      setEditMessage('Updating authentication record...');
      
      // Update auth collection if it exists
      try {
        const authQuery = query(collection(db, 'auth'), where('clientId', '==', selectedClientForAction.id));
        const authSnapshot = await getDocs(authQuery);
        
        if (!authSnapshot.empty) {
          const authDoc = authSnapshot.docs[0];
          await updateDoc(doc(db, 'auth', authDoc.id), {
            name: formData.name,
            email: formData.email,
            lastModified: serverTimestamp()
          });
        }
      } catch (authError) {
        console.log('Auth collection update failed (may not exist):', authError);
      }
      
      setEditMessage('Logging admin action...');
      
      // Log the admin action
      await logAdminAction(
        'CLIENT_INFO_UPDATED',
        {
          clientId: selectedClientForAction.id,
          clientName: formData.name || selectedClientForAction.clientName,
          updatedFields: Object.keys(formData),
          description: 'Client information updated by admin'
        }
      );
      
      setEditMessage('Updating interface...');
      
      // Update local state
      setAllClients(prevClients => 
        prevClients.map(c => 
          c.id === selectedClientForAction.id 
            ? { ...c, ...formData, displayName: formData.name || c.displayName }
            : c
        )
      );
      
      setEditMessage('Client information updated successfully!');
      
      // Close modal after showing success message
      setTimeout(() => {
        setShowEditClientModal(false);
        setSelectedClientForAction(null);
        setIsEditingClient(false);
        setEditMessage('');
      }, 1500);
      
    } catch (error) {
      console.error('Error updating client information:', error);
      setEditMessage('Failed to update client information. Please try again.');
      setIsEditingClient(false);
      
      // Reset after showing error
      setTimeout(() => {
        setEditMessage('');
      }, 3000);
    }
  };

  const handleDeactivateClient = (client) => {
    setSelectedClientForAction(client);
    setShowDeactivateModal(true);
    setDropdownOpen(null);
  };

  const handleChangeStatus = (client) => {
    setSelectedClientForAction(client);
    setSelectedNewStatus(client.status || 'active');
    setShowStatusModal(true);
    setDropdownOpen(null);
  };

  // Handle status change with new status selection
  const handleConfirmStatusChange = async () => {
    if (!selectedClientForAction || !selectedNewStatus) return;
    
    setIsUpdatingStatus(true);
    setStatusUpdateMessage(`Updating client status...`);
    
    try {
      const currentStatus = selectedClientForAction.status || 'active';
      const newStatus = selectedNewStatus;
      
      if (currentStatus === newStatus) {
        setStatusUpdateMessage('Status is already set to this value.');
        setIsUpdatingStatus(false);
        setTimeout(() => {
          setStatusUpdateMessage('');
          setShowStatusModal(false);
        }, 1500);
        return;
      }
      
      setStatusUpdateMessage(`Updating client record in database...`);
      
      // Update client status in Firestore
      const clientRef = doc(db, 'clients', selectedClientForAction.id);
      await updateDoc(clientRef, {
        status: newStatus,
        lastModified: serverTimestamp(),
        modifiedBy: currentUser?.uid
      });

      setStatusUpdateMessage(`Updating authentication record...`);

      // Update auth collection if it exists
      try {
        const authQuery = query(collection(db, 'auth'), where('clientId', '==', selectedClientForAction.id));
        const authSnapshot = await getDocs(authQuery);
        
        if (!authSnapshot.empty) {
          const authDoc = authSnapshot.docs[0];
          await updateDoc(doc(db, 'auth', authDoc.id), {
            status: newStatus,
            lastModified: serverTimestamp()
          });
        }
      } catch (authError) {
        console.log('Auth collection update failed (may not exist):', authError);
      }

      setStatusUpdateMessage(`Logging admin action...`);

      // Log the admin action
      await logAdminAction(
        'CLIENT_STATUS_CHANGED',
        {
          clientId: selectedClientForAction.id,
          clientName: selectedClientForAction.clientName || selectedClientForAction.displayName,
          clientEmail: selectedClientForAction.clientEmail,
          previousStatus: currentStatus,
          newStatus: newStatus,
          description: `Client status changed from ${getStatusLabel(currentStatus)} to ${getStatusLabel(newStatus)}`
        }
      );

      setStatusUpdateMessage(`Updating interface...`);

      // Update local state
      setAllClients(prevClients => 
        prevClients.map(c => 
          c.id === selectedClientForAction.id 
            ? { ...c, status: newStatus }
            : c
        )
      );

      setStatusUpdateMessage(`Status changed to ${getStatusLabel(newStatus)} successfully!`);

      // Close modal after showing success message
      setTimeout(() => {
        setShowStatusModal(false);
        setSelectedClientForAction(null);
        setSelectedNewStatus('');
        setIsUpdatingStatus(false);
        setStatusUpdateMessage('');
      }, 1500);
      
    } catch (error) {
      console.error('Error changing client status:', error);
      setStatusUpdateMessage('Failed to change client status. Please try again.');
      setIsUpdatingStatus(false);
      
      // Reset after showing error
      setTimeout(() => {
        setStatusUpdateMessage('');
      }, 3000);
    }
  };

  const handleDeleteClient = (client) => {
    setSelectedClientForAction(client);
    setShowDeleteModal(true);
    setDropdownOpen(null);
  };

  // Handle actual client deletion
  const handleConfirmDeleteClient = async () => {
    if (!selectedClientForAction) return;
    
    setIsDeletingClient(true);
    setDeleteMessage('Preparing to delete client...');
    
    try {
      setDeleteMessage('Removing client from database...');
      
      // Delete from clients collection
      const clientRef = doc(db, 'clients', selectedClientForAction.id);
      await deleteDoc(clientRef);
      
      setDeleteMessage('Removing authentication record...');
      
      // Delete from auth collection if it exists
      try {
        const authQuery = query(collection(db, 'auth'), where('clientId', '==', selectedClientForAction.id));
        const authSnapshot = await getDocs(authQuery);
        
        if (!authSnapshot.empty) {
          const authDoc = authSnapshot.docs[0];
          await deleteDoc(doc(db, 'auth', authDoc.id));
        }
      } catch (authError) {
        console.log('Auth collection deletion failed (may not exist):', authError);
      }
      
      setDeleteMessage('Removing from therapist assignments...');
      
      // Remove from all therapist subcollections
      try {
        for (const therapist of allTherapists) {
          const therapistClientsRef = collection(db, 'therapists', therapist.id, 'clients');
          const therapistClientsSnapshot = await getDocs(therapistClientsRef);
          
          for (const clientDoc of therapistClientsSnapshot.docs) {
            if (clientDoc.data().clientId === selectedClientForAction.id) {
              await deleteDoc(doc(db, 'therapists', therapist.id, 'clients', clientDoc.id));
              break;
            }
          }
        }
      } catch (assignmentError) {
        console.log('Error removing therapist assignments:', assignmentError);
      }
      
      setDeleteMessage('Logging admin action...');
      
      // Log the admin action
      await logAdminAction(
        'CLIENT_DELETED',
        {
          clientId: selectedClientForAction.id,
          clientName: selectedClientForAction.clientName || selectedClientForAction.displayName,
          clientEmail: selectedClientForAction.clientEmail,
          description: 'Client record permanently deleted by admin'
        }
      );
      
      setDeleteMessage('Updating interface...');
      
      // Update local state
      setAllClients(prevClients => 
        prevClients.filter(c => c.id !== selectedClientForAction.id)
      );
      
      setDeleteMessage('Client deleted successfully!');
      
      // Close modal after showing success message
      setTimeout(() => {
        setShowDeleteModal(false);
        setSelectedClientForAction(null);
        setIsDeletingClient(false);
        setDeleteMessage('');
      }, 1500);
      
    } catch (error) {
      console.error('Error deleting client:', error);
      setDeleteMessage('Failed to delete client. Please try again.');
      setIsDeletingClient(false);
      
      // Reset after showing error
      setTimeout(() => {
        setDeleteMessage('');
      }, 3000);
    }
  };



  const handleBulkExport = () => {
    setShowBulkExportModal(true);
  };

  // Export to CSV
  const exportToCSV = () => {
    setIsExporting(true);
    setExportMessage('Preparing CSV export...');
    
    try {
      const headers = [
        'Client Name',
        'Email',
        'Phone',
        'Age',
        'Gender',
        'Country',
        'Therapy Type',
        'Session Frequency',
        'Assigned Therapist',
        'Status',
        'Registration Date'
      ];
      
      const csvData = allClients.map(client => [
        client.clientName || client.displayName || 'N/A',
        client.clientEmail || 'N/A',
        client.phone || 'N/A',
        client.age || 'N/A',
        client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : client.gender || 'N/A',
        client.country || 'N/A',
        client.therapyType || 'N/A',
        client.sessionFrequency || 'N/A',
        client.assignedTherapist?.name || 'Not Assigned',
        getStatusLabel(client.status || 'active'),
        client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'
      ]);
      
      setExportMessage('Generating CSV file...');
      
      const csvContent = [headers, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `clients_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setExportMessage('CSV exported successfully!');
      setTimeout(() => {
        setIsExporting(false);
        setExportMessage('');
        setShowBulkExportModal(false);
      }, 1500);
      
    } catch (error) {
      console.error('Error exporting CSV:', error);
      setExportMessage('Failed to export CSV. Please try again.');
      setIsExporting(false);
      setTimeout(() => setExportMessage(''), 3000);
    }
  };

  // Export to Excel (using CSV format with .xlsx extension)
  const exportToExcel = () => {
    setIsExporting(true);
    setExportMessage('Preparing Excel export...');
    
    try {
      const headers = [
        'Client Name',
        'Email',
        'Phone',
        'Age',
        'Gender',
        'Country',
        'Therapy Type',
        'Session Frequency',
        'Assigned Therapist',
        'Status',
        'Registration Date'
      ];
      
      const csvData = allClients.map(client => [
        client.clientName || client.displayName || 'N/A',
        client.clientEmail || 'N/A',
        client.phone || 'N/A',
        client.age || 'N/A',
        client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : client.gender || 'N/A',
        client.country || 'N/A',
        client.therapyType || 'N/A',
        client.sessionFrequency || 'N/A',
        client.assignedTherapist?.name || 'Not Assigned',
        getStatusLabel(client.status || 'active'),
        client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'
      ]);
      
      setExportMessage('Generating Excel file...');
      
      const csvContent = [headers, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      
      const blob = new Blob([csvContent], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `clients_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setExportMessage('Excel file exported successfully!');
      setTimeout(() => {
        setIsExporting(false);
        setExportMessage('');
        setShowBulkExportModal(false);
      }, 1500);
      
    } catch (error) {
      console.error('Error exporting Excel:', error);
      setExportMessage('Failed to export Excel file. Please try again.');
      setIsExporting(false);
      setTimeout(() => setExportMessage(''), 3000);
    }
  };

  // Export to PDF
  const exportToPDF = () => {
    setIsExporting(true);
    setExportMessage('Preparing PDF export...');
    
    try {
      setExportMessage('Generating PDF document...');
      
      const doc = new jsPDF('landscape');
      
      // Add title
      doc.setFontSize(20);
      doc.text('Clients Export Report', 14, 22);
      
      // Add export date
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
      doc.text(`Total Clients: ${allClients.length}`, 14, 35);
      
      // Prepare table data
      const tableData = allClients.map(client => [
        client.clientName || client.displayName || 'N/A',
        client.clientEmail || 'N/A',
        client.phone || 'N/A',
        client.age || 'N/A',
        client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : client.gender || 'N/A',
        client.country || 'N/A',
        client.therapyType || 'N/A',
        client.sessionFrequency || 'N/A',
        client.assignedTherapist?.name || 'Not Assigned',
        getStatusLabel(client.status || 'active'),
        client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'
      ]);
      
      // Add table
      doc.autoTable({
        head: [['Name', 'Email', 'Phone', 'Age', 'Gender', 'Country', 'Therapy Type', 'Frequency', 'Therapist', 'Status', 'Registered']],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { top: 45 }
      });
      
      setExportMessage('Downloading PDF...');
      
      // Save the PDF
      doc.save(`clients_export_${new Date().toISOString().split('T')[0]}.pdf`);
      
      setExportMessage('PDF exported successfully!');
      setTimeout(() => {
        setIsExporting(false);
        setExportMessage('');
        setShowBulkExportModal(false);
      }, 1500);
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      setExportMessage('Failed to export PDF. Please try again.');
      setIsExporting(false);
      setTimeout(() => setExportMessage(''), 3000);
    }
  };

  const handleCloseModals = () => {
    setShowEditClientModal(false);
    setShowDeactivateModal(false);
    setShowDeleteModal(false);
    setShowStatusModal(false);
    setShowBulkExportModal(false);
    setSelectedClientForAction(null);
    setSelectedNewStatus('');
  };

  // Audit logging function
  const logAdminAction = async (action, details, clientId = null) => {
    try {
      const auditLog = {
        action,
        details,
        clientId,
        adminId: currentUser?.uid,
        adminName: profile?.name || 'Unknown Admin',
        adminEmail: profile?.email || 'Unknown Email',
        timestamp: serverTimestamp(),
        ipAddress: 'System', // In a real app, you'd capture the actual IP
        userAgent: navigator.userAgent
      };

      await addDoc(collection(db, 'auditLogs'), auditLog);
      console.log('Audit log created:', auditLog);
    } catch (error) {
      console.error('Error creating audit log:', error);
    }
  };

  // Toggle client status function
  const handleToggleClientStatus = async (client) => {
    setIsUpdatingStatus(true);
    setStatusUpdateMessage(`Updating client status...`);
    
    try {
      const currentStatus = client.status || 'active';
      let newStatus;
      
      // Define status transitions
      switch (currentStatus) {
        case 'active':
          newStatus = 'inactive';
          break;
        case 'inactive':
          newStatus = 'active';
          break;
        case 'discharged':
          newStatus = 'active';
          break;
        case 'on_hold':
          newStatus = 'active';
          break;
        default:
          newStatus = 'inactive';
      }
      
      setStatusUpdateMessage(`Updating client record in database...`);
      
      // Update client status in Firestore
      const clientRef = doc(db, 'clients', client.id);
      await updateDoc(clientRef, {
        status: newStatus,
        lastModified: serverTimestamp(),
        modifiedBy: currentUser?.uid
      });

      setStatusUpdateMessage(`Updating authentication record...`);

      // Update auth collection if it exists
      try {
        const authQuery = query(collection(db, 'auth'), where('clientId', '==', client.id));
        const authSnapshot = await getDocs(authQuery);
        
        if (!authSnapshot.empty) {
          const authDoc = authSnapshot.docs[0];
          await updateDoc(doc(db, 'auth', authDoc.id), {
            status: newStatus,
            lastModified: serverTimestamp()
          });
        }
      } catch (authError) {
        console.log('Auth collection update failed (may not exist):', authError);
      }

      setStatusUpdateMessage(`Logging admin action...`);

      // Log the admin action
      await logAdminAction(
        newStatus === 'active' ? 'CLIENT_ACTIVATED' : 'CLIENT_DEACTIVATED',
        {
          clientName: client.clientName || client.displayName,
          clientEmail: client.clientEmail,
          previousStatus: client.status || 'active',
          newStatus: newStatus
        },
        client.id
      );

      setStatusUpdateMessage(`Updating interface...`);

      // Update local state
      setAllClients(prevClients => 
        prevClients.map(c => 
          c.id === client.id 
            ? { ...c, status: newStatus }
            : c
        )
      );

      setStatusUpdateMessage(`Client ${getStatusLabel(newStatus).toLowerCase()} successfully!`);

      // Close modal after showing success message
      setTimeout(() => {
        handleCloseModals();
        setIsUpdatingStatus(false);
        setStatusUpdateMessage('');
      }, 1500);
      
    } catch (error) {
      console.error('Error toggling client status:', error);
      setStatusUpdateMessage('Failed to update client status. Please try again.');
      setIsUpdatingStatus(false);
      
      // Reset after showing error
      setTimeout(() => {
        setStatusUpdateMessage('');
      }, 3000);
    }
  };

  const handleViewClientDetails = async (client) => {
    setSelectedClientForDetails(client);
    setShowClientDetailsModal(true);
    // Fetch therapy notes for this client
    await fetchClientTherapyNotes(client.id);
  };

  const handleViewTherapistDetails = (therapist) => {
    console.log('Therapist data being passed to modal:', therapist);
    setSelectedTherapist(therapist);
    setShowTherapistDetailsModal(true);
  };

  const handleReassignClient = (client) => {
    setSelectedClientForReassign(client);
    setShowReassignModal(true);
  };

  const handleReassignSave = async (newTherapistId) => {
    try {
      const clientId = selectedClientForReassign.id;
      
      // Update client's assignedTherapist in clients collection
      await updateDoc(doc(db, 'clients', clientId), {
        assignedTherapist: newTherapistId,
        assignedAt: new Date().toISOString()
      });
      
      // Update the client in the therapist's clients subcollection
      if (selectedClientForReassign.assignedTherapist) {
        // Remove from old therapist's clients
        const oldTherapistClientsQuery = query(
          collection(db, 'therapists', selectedClientForReassign.assignedTherapist.id, 'clients'),
          where('clientId', '==', clientId)
        );
        const oldTherapistClientsSnapshot = await getDocs(oldTherapistClientsQuery);
        for (const docSnapshot of oldTherapistClientsSnapshot.docs) {
          await deleteDoc(docSnapshot.ref);
        }
      }
      
      // Add to new therapist's clients
      await addDoc(collection(db, 'therapists', newTherapistId, 'clients'), {
        clientId: clientId,
        assignedAt: new Date().toISOString()
      });
      
      // Update local state
      setAllClients(prevClients => 
        prevClients.map(client => 
          client.id === clientId 
            ? { 
                ...client, 
                assignedTherapist: allTherapists.find(t => t.id === newTherapistId),
                assignedAt: new Date().toISOString()
              }
            : client
        )
      );
      
      setShowReassignModal(false);
      setSelectedClientForReassign(null);
      
      console.log('Client reassigned successfully');
    } catch (error) {
      console.error('Error reassigning client:', error);
    }
  };
  
  const fetchTherapyNotes = async (clientId) => {
    try {
      setLoadingTherapyNotes(true);
      console.log('Fetching therapy notes for client:', clientId);
      
      const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
      const notesSnapshot = await getDocs(notesRef);
      const notes = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('Fetched therapy notes:', notes.length, 'notes');
      setTherapyNotes(notes);
    } catch (error) {
      console.error('Error fetching therapy notes:', error);
      setTherapyNotes([]);
    } finally {
      setLoadingTherapyNotes(false);
    }
  };

  const sendMessage = async (content, type = 'text') => {
    if (!selectedClient || (!content && type === 'text')) return;

    try {
      const messageData = {
        content,
        type,
        from: currentUser.uid,
        fromName: currentUser.displayName || 'Therapist',
        to: selectedClient.id,
        toName: selectedClient.displayName || 'Client',
        createdAt: serverTimestamp(),
        read: false,
        status: 'sent' // Initial status when message is sent
      };

      const chatPath = getChatPath(selectedClient);
      const messagesCol = collection(db, chatPath);
      const docRef = await addDoc(messagesCol, messageData);
      
      // Update status to delivered after a short delay
      setTimeout(async () => {
        try {
          await updateDoc(docRef, { status: 'delivered' });
        } catch (error) {
          console.error('Error updating message status to delivered:', error);
        }
      }, 1000);
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert(`Failed to send message: ${error.message}`);
    }
  };

  const handleSendText = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessage(newMessage.trim(), 'text');
    }
  };

  // Edit message function
  const handleEditMessage = (message) => {
    setEditingMessage(message);
    setEditText(message.content);
  };

  // Save edited message
  const handleSaveEdit = async () => {
    if (!editingMessage || !editText.trim()) return;

    try {
      const chatPath = getChatPath(selectedClient);
      const messageRef = doc(db, chatPath, editingMessage.id);
      await updateDoc(messageRef, {
        content: editText.trim(),
        edited: true,
        editedAt: serverTimestamp()
      });
      
      setEditingMessage(null);
      setEditText('');
    } catch (error) {
      console.error('Error editing message:', error);
      alert('Failed to edit message');
    }
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
  };

  // Delete message function
  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      const chatPath = getChatPath(selectedClient);
      const messageRef = doc(db, chatPath, messageId);
      await deleteDoc(messageRef);
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message');
    }
  };

  // Check if message can be edited/deleted (within 5 minutes)
  const canEditOrDelete = (message) => {
    if (!message.createdAt) return false;
    
    const messageTime = message.createdAt.toDate ? message.createdAt.toDate() : new Date(message.createdAt);
    const now = new Date();
    const diffInMinutes = (now - messageTime) / (1000 * 60);
    
    return diffInMinutes <= 5;
  };

  // Toggle message menu
  const toggleMessageMenu = (messageId) => {
    setShowMessageMenu(showMessageMenu === messageId ? null : messageId);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMessageMenu && !event.target.closest('.message-menu-container')) {
        setShowMessageMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMessageMenu]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Upload file to Firebase Storage
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.name}`;
      const storageRef = ref(storage, `therapist-files/${currentUser.uid}/${fileName}`);
      
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);
      
      const uploadResult = await uploadBytes(storageRef, file);
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      const downloadURL = await getDownloadURL(uploadResult.ref);
      
      // Determine file type for message
      let fileType = 'document';
      if (file.type.startsWith('image/')) {
        fileType = 'image';
      } else if (file.type.startsWith('video/')) {
        fileType = 'video';
      }
      
      // Send message with Firebase Storage URL
      await sendMessage({
        name: file.name,
        url: downloadURL,
        size: file.size,
        type: file.type,
        storagePath: storageRef.fullPath
      }, fileType);
      
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(`Failed to upload file: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      event.target.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (e) => {
          sendMessage({
            url: e.target.result,
            duration: Math.round((Date.now() - recorder.startTime) / 1000),
            type: 'audio/webm'
          }, 'audio');
        };
        reader.readAsDataURL(audioBlob);
      };
      
      recorder.startTime = Date.now();

      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (message) => {
    const isOwnMessage = message.from === currentUser.uid;
    
    // Render status indicator for sent messages
    const renderStatusIndicator = (status) => {
      if (!isOwnMessage) return null;
      
      switch (status) {
        case 'sent':
          return <span className="status-indicator sent">✓</span>;
        case 'delivered':
          return <span className="status-indicator delivered">✓✓</span>;
        case 'read':
          return <span className="status-indicator read">✓✓</span>;
        default:
          return <span className="status-indicator sent">✓</span>;
      }
    };
    
  return (
      <div key={message.id} className={`message ${isOwnMessage ? 'sent' : 'received'}`}>
        {!isOwnMessage && (
          <div className="message-avatar">
            {selectedClient?.photoURL ? (
              <img src={selectedClient.photoURL} alt={selectedClient.displayName} />
            ) : (
              <div className="avatar-placeholder">{selectedClient?.displayName?.charAt(0) || 'C'}</div>
            )}
          </div>
        )}
        
        <div className="message-content">
          {message.type === 'text' && (
            <div className="message-text">
              {editingMessage?.id === message.id ? (
                <div className="edit-message-container">
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="edit-input"
                    autoFocus
                  />
                  <div className="edit-buttons">
                    <button onClick={handleSaveEdit} className="save-btn">Save</button>
                    <button onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  {message.content}
                  {message.edited && (
                    <span className="edited-indicator"> (edited)</span>
                  )}
                </div>
              )}
            </div>
          )}
          
          {message.type === 'image' && (
            <div className="message-image">
              <img 
                src={message.content.url} 
                alt="Shared image" 
                onClick={() => window.open(message.content.url, '_blank')}
                style={{ cursor: 'pointer' }}
                title="Click to view full size"
              />
              {message.content.name && (
                <div className="image-filename">{message.content.name}</div>
              )}
            </div>
          )}
          
          {message.type === 'video' && (
            <div className="message-video">
              <video 
                controls 
                preload="metadata"
                style={{ maxWidth: '100%', borderRadius: '8px' }}
              >
                <source src={message.content.url} type={message.content.type} />
                Your browser does not support the video element.
              </video>
              {message.content.name && (
                <div className="video-filename">{message.content.name}</div>
              )}
            </div>
          )}
          
          {message.type === 'document' && (
            <div className="message-document">
              <FileText size={20} />
              <span>{message.content.name}</span>
              <small className="file-size">({(message.content.size / 1024).toFixed(1)} KB)</small>
            </div>
          )}
          
          {message.type === 'audio' && (
            <div className="message-audio">
              <div className="audio-controls">
                <audio controls className="audio-player">
                  <source src={message.content.url} type="audio/webm" />
                  Your browser does not support the audio element.
                </audio>
                <span className="audio-duration">{message.content.duration}s</span>
              </div>
            </div>
          )}
          
          <div className="message-time">
            {formatTime(message.createdAt)}
            {renderStatusIndicator(message.status)}
            {isOwnMessage && !editingMessage && canEditOrDelete(message) && (
              <div className="message-menu-container">
                <button 
                  onClick={() => toggleMessageMenu(message.id)}
                  className="menu-trigger"
                  title="Message options"
                >
                  ⋯
                </button>
                {showMessageMenu === message.id && (
                  <div className="message-menu">
                    <button 
                      onClick={() => {
                        handleEditMessage(message);
                        setShowMessageMenu(null);
                      }}
                      className="menu-item edit-item"
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      onClick={() => {
                        handleDeleteMessage(message.id);
                        setShowMessageMenu(null);
                      }}
                      className="menu-item delete-item"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const filteredClients = clients
    .filter(client =>
      (client.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aUnread = unreadCounts[a.id] || 0;
      const bUnread = unreadCounts[b.id] || 0;
      
      // If both have unread messages, sort by unread count (highest first)
      if (aUnread > 0 && bUnread > 0) {
        return bUnread - aUnread;
      }
      
      // If only one has unread messages, prioritize it
      if (aUnread > 0 && bUnread === 0) return -1;
      if (bUnread > 0 && aUnread === 0) return 1;
      
      // If neither has unread messages, sort by name
      return (a.displayName || '').localeCompare(b.displayName || '');
    });

  // Show loading screen until profile is loaded
  if (!isProfileLoaded) {
    return (
      <div className="therapist-clients-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading client dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="therapist-clients-container">
      {/* Tab Navigation */}
      <div className="clients-tabs">
      
        <button 
          className={`tab ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          <Users size={20} />
         My Clients
        </button>
        {isAdmin && (
          <button 
            className={`tab ${activeTab === 'other' ? 'active' : ''}`}
            onClick={() => setActiveTab('other')}
          >
            <Users size={20} />
            All Clients
          </button>
          
        )}
          <button 
          className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={20} />
          Client Chat
        </button>
      </div>

      {activeTab === 'chat' ? (
        /* Chat Interface */
        <div className="clients-chat-container">
          {/* Left Panel - Client List */}
          <div className="clients-panel">
        <div className="clients-header">
              <h2>My Clients</h2>
              <div className="search-container">
                <Search size={20} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
        </div>
        
        <div className="clients-list">
              {filteredClients.map((client) => {
                const unreadCount = unreadCounts[client.id] || 0;
                return (
                  <div
                    key={client.id}
                    className={`client-item ${selectedClient?.id === client.id ? 'active' : ''}`}
                    onClick={() => handleClientSelect(client)}
                  >
                    <div className="client-avatar">
                      {client.photoURL ? (
                        <img src={client.photoURL} alt={client.displayName} />
                      ) : (
                        <div className="avatar-placeholder">{client.displayName?.charAt(0) || 'C'}</div>
                      )}
                      {unreadCount > 0 && (
                        <div className="unread-badge">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </div>
                      )}
                    </div>
                    
                    <div className="client-info">
                      <div className="client-header">
                        <h4 className="client-name">{client.clientName || client.displayName || 'Client'}</h4>
                        <div className="client-meta">
                          <span className="client-time">Now</span>
                        </div>
                      </div>
                      <p className="client-preview">
                        {client.therapyType || 'Individual Therapy'} • {client.assignedAt ? 'Assigned' : 'New'}
                        {client.age && ` • Age: ${client.age}`}
                        {client.gender && ` • ${client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : 'Person'}`}
                      </p>
                    </div>
                  </div>
                );
              })}
    </div>
          </div>

          {/* Right Panel - Chat Window */}
          <div className="chat-panel">
            {selectedClient ? (
              <>
                <div className="chat-header">
                  <div className="chat-user-info">
                    <div className="chat-avatar">
                      {selectedClient.photoURL ? (
                        <img src={selectedClient.photoURL} alt={selectedClient.displayName} />
                      ) : (
                        <div className="avatar-placeholder">{selectedClient.displayName?.charAt(0) || 'C'}</div>
                      )}
                    </div>
                    <div className="chat-details">
                      <h3 className="chat-name">
                        {selectedClient.clientName || selectedClient.displayName || 'Client'}
                        {/* Debug info */}
                        <small style={{ fontSize: '0.7rem', color: '#666', display: 'block' }}>
                        </small>
                      </h3>
                      <p className="chat-role">{selectedClient.therapyType.Therapy || 'Individual Therapy'}</p>
                    </div>
                  </div>
                </div>
               
                <div className="chat-messages">
                  {messages.length === 0 ? (
                    <div className="empty-chat">
                      <div className="empty-icon">💬</div>
                      <h3>Start a conversation</h3>
                      <p>Send the first message to begin chatting with {selectedClient.displayName || 'your client'}</p>
                    </div>
                  ) : (
                    messages.map(renderMessage)
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="chat-input">
                  <form onSubmit={handleSendText} className="message-form">
                    <button
                      type="button"
                      className="attachment-button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      title={isUploading ? `Uploading... ${uploadProgress}%` : "Attach file"}
                    >
                      {isUploading ? (
                        <div className="upload-progress">
                          <div className="progress-circle">
                            <span className="progress-text">{uploadProgress}%</span>
                          </div>
                        </div>
                      ) : (
                        <Paperclip size={20} />
                      )}
                    </button>
                    
                    <input
                      type="text"
                      placeholder="Type your message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="message-input"
                    />
                    
                    <button
                      type="button"
                      className="emoji-button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    >
                      <Smile size={20} />
                    </button>
                    
                    <button
                      type="button"
                      className={`record-button ${isRecording ? 'recording' : ''}`}
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      <Mic size={20} />
                    </button>
                    
                    <button type="submit" className="send-button" disabled={!newMessage.trim()}>
                      <Send size={20} />
                    </button>
                  </form>
                  
                  {/* Emoji Picker */}
                  {showEmojiPicker && (
                    <div className="emoji-picker" ref={emojiPickerRef}>
                      {['😊', '😂', '❤️', '👍', '🎉', '🔥', '😎', '🤔', '😢', '😡', '👋', '👋', '✨', '🌟', '💯', '🙏'].map((emoji) => (
                        <button
                          key={emoji}
                          className="emoji-item"
                          onClick={() => {
                            setNewMessage(prev => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              </>
            ) : (
              <div className="no-chat-selected">
                <div className="no-chat-icon">💬</div>
                <h3>Select a client</h3>
                <p>Choose a client from the list to start chatting</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'table' ? (
        /* My Clients Table */
        <div className="clients-table-container">
          <div className="table-header">
            <h2>All Assigned Clients</h2>
            <div className="table-search">
              <Search size={20} />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="table-container">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Therapy Type</th>
                  <th>Assigned Date</th>
                  <th>Last Session</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <React.Fragment key={client.id}>
                    <tr>
                      <td className="client-cell">
                        <div className="client-info-cell">
                          <div className="client-avatar-small">
                            {client.photoURL ? (
                              <img src={client.photoURL} alt={client.displayName} />
                            ) : (
                              <div className="avatar-placeholder-small">{client.displayName?.charAt(0) || 'C'}</div>
                            )}
                          </div>
                          <div className="client-details">
                            <div className="client-name-cell">{client.clientName || client.displayName || 'Client'}</div>
                            <div className="client-meta">
                              {client.age && <span className="client-age">Age: {client.age}</span>}
                              {client.gender && <span className="client-gender">{client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : 'Person'}</span>}
                            </div>
                           
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="contact-info">
                          {client.clientEmail && (
                            <div className="contact-item">
                              <Mail size={16} />
                              <span>{client.clientEmail}</span>
                            </div>
                          )}
                          {client.phone && (
                            <div className="contact-item">
                              <Phone size={16} />
                              <span>{client.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusClass(client.status || 'active')}`}>
                          {getStatusLabel(client.status || 'active')}
                        </span>
                      </td>
                      <td>{client.therapyType || 'Individual Therapy'}</td>
                      <td>{client.assignedAt ? new Date(client.assignedAt).toLocaleDateString() : 'N/A'}</td>
                      <td>2 days ago</td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="btn-secondary small"
                            onClick={() => {
                              const completeClient = {
                                ...client,
                                clientName: client.clientName || client.name || client.displayName || 'Client'
                              };
                              setSelectedClient(completeClient);
                              setActiveTab('chat');
                            }}
                          >
                            <MessageSquare size={16} />
                            Chat
                          </button>
                          <button 
                            className="btn-secondary small"
                            onClick={async () => {
                              if (expandedClient === client.id) {
                                setExpandedClient(null);
                              } else {
                                setExpandedClient(client.id);
                                // Fetch therapy notes when expanding client details
                                await fetchTherapyNotes(client.id);
                              }
                            }}
                          >
                            {String(expandedClient) === String(client.id) ? 'Hide' : 'View All'}
                          </button>
                          <button 
                            className="btn-primary small"
                            onClick={() => {
                              setSelectedClientForNote(client);
                              setShowNoteModal(true);
                            }}
                          >
                            <FileText size={16} />
                            Add Therapy Note
                          </button>
                          <div className="dropdown-container">
                            <button 
                              className="dropdown-trigger"
                              onClick={() => handleDropdownToggle(client.id)}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {dropdownOpen === client.id && (
                              <div className="dropdown-menu">
                                {isAdmin && (
                                  <button 
                                    className="dropdown-item"
                                    onClick={() => handleEditClient(client)}
                                  >
                                    <Edit size={16} />
                                    Edit Client Info
                                  </button>
                                )}
                                <button 
                                  className="dropdown-item"
                                  onClick={() => handleChangeStatus(client)}
                                >
                                  <UserX size={16} />
                                  Change Status
                                </button>
                                {isAdmin && (
                                  <button 
                                    className="dropdown-item danger"
                                    onClick={() => handleDeleteClient(client)}
                                  >
                                    <Trash2 size={16} />
                                    Delete Client
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded row for complete client data */}
                    {String(expandedClient) === String(client.id) && (
                      <tr key={`expanded-${client.id}`} className="expanded-row">
                        <td colSpan="6">
                          <div className="expanded-client-data">
                            <h4>Complete Client Information</h4>
                            <div className="data-grid">
                              <div className="data-section">
                                <h5>Personal Information</h5>
                                <div className="data-item">
                                  <strong>Name:</strong> 
                                  <span style={{ color: '#3b82f6', fontWeight: '600' }}>{client.clientName || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Email:</strong> 
                                  <span style={{ color: '#059669', fontWeight: '500' }}>{client.clientEmail || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Age:</strong> 
                                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.age || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Gender:</strong> 
                                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                    {client.gender ? (client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : 'Person') : 'N/A'}
                                  </span>
                                </div>
                                <div className="data-item">
                                  <strong>Country:</strong> 
                                  <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.country || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Employment:</strong> 
                                  <span style={{ background: '#ecfdf5', color: '#047857', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.employment || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Relationship Status:</strong> 
                                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.relationshipStatus || 'N/A'}</span>
                                </div>
                              </div>
                              
                              <div className="data-section">
                                <h5>Therapy Information</h5>
                                <div className="data-item">
                                  <strong>Therapy Type:</strong> 
                                  <span style={{ background: '#ecfdf5', color: '#047857', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.therapyType || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Session Frequency:</strong> 
                                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.sessionFrequency || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Session Structure:</strong> 
                                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.sessionStructure || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Therapist Style:</strong> 
                                  <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.therapistStyle || 'N/A'}</span>
                                </div>
                              </div>
                              
                              <div className="data-section">
                                <h5>Health & Wellness</h5>
                                <div className="data-item">
                                  <strong>Physical Health:</strong> 
                                  <span style={{ 
                                    background: client.physicalHealth === 'Good' ? '#ecfdf5' : client.physicalHealth === 'Fair' ? '#fef3c7' : '#fee2e2',
                                    color: client.physicalHealth === 'Good' ? '#047857' : client.physicalHealth === 'Fair' ? '#92400e' : '#dc2626',
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>{client.physicalHealth || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Mental Health:</strong> 
                                  <span style={{ 
                                    background: '#fef3c7', 
                                    color: '#92400e', 
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>
                                    {client.depression || client.anxiety ? `${client.depression || 'N/A'} / ${client.anxiety || 'N/A'}` : 'N/A'}
                                  </span>
                                </div>
                                <div className="data-item">
                                  <strong>Sleep Quality:</strong> 
                                  <span style={{ 
                                    background: client.sleep === 'Good' ? '#ecfdf5' : client.sleep === 'Fair' ? '#fef3c7' : '#fee2e2',
                                    color: client.sleep === 'Good' ? '#047857' : client.sleep === 'Fair' ? '#92400e' : '#dc2626',
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>{client.sleep || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Exercise:</strong> 
                                  <span style={{ 
                                    background: '#dbeafe', 
                                    color: '#1e40af', 
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>{client.exercise || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Eating Habits:</strong> 
                                  <span style={{ 
                                    background: client.eatingHabits === 'Good' ? '#ecfdf5' : client.eatingHabits === 'Fair' ? '#fef3c7' : '#fee2e2',
                                    color: client.eatingHabits === 'Good' ? '#047857' : client.eatingHabits === 'Fair' ? '#92400e' : '#dc2626',
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>{client.eatingHabits || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Chronic Pain:</strong> 
                                  <span style={{ 
                                    background: client.chronicPain && client.chronicPain.includes('severe') ? '#fee2e2' : 
                                              client.chronicPain && client.chronicPain.includes('mild') ? '#fef3c7' : '#ecfdf5',
                                    color: client.chronicPain && client.chronicPain.includes('severe') ? '#dc2626' : 
                                           client.chronicPain && client.chronicPain.includes('mild') ? '#92400e' : '#047857',
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>{client.chronicPain || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Current Medication:</strong> 
                                  <span style={{ 
                                    background: client.currentMedication === 'Yes' ? '#fee2e2' : '#ecfdf5',
                                    color: client.currentMedication === 'Yes' ? '#dc2626' : '#047857',
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>{client.currentMedication || 'N/A'}</span>
                                </div>
                              </div>
                              
                              <div className="data-section">
                                <h5>Questionnaire Responses</h5>
                                <div className="data-item">
                                  <strong>Reasons for Therapy:</strong>
                                  <div className="array-data">
                                    {client.reasonsForTherapy ? 
                                      client.reasonsForTherapy.map((reason, index) => (
                                        <div key={index} className="array-item">{reason}</div>
                                      ))
                                      : <span>N/A</span>
                                    }
                                  </div>
                                </div>
                                <div className="data-item">
                                  <strong>Therapy Goals:</strong>
                                  <div className="array-data">
                                    {client.therapyGoals ? 
                                      client.therapyGoals.map((goal, index) => (
                                        <div key={index} className="array-item">{goal}</div>
                                      ))
                                      : <span>N/A</span>
                                    }
                                  </div>
                                </div>
                                <div className="data-item">
                                  <strong>Available Times:</strong>
                                  <div className="array-data">
                                    {client.availableTimes ? 
                                      client.availableTimes.map((time, index) => (
                                        <div key={index} className="array-item">{time}</div>
                                      ))
                                      : <span>N/A</span>
                                    }
                                  </div>
                                </div>
                              </div>
                              

                              
                              <div className="data-section">
                                <h5>PHQ-9 Questions (1-5)</h5>
                                <div className="phq9-breakdown">
                                  {(() => {
                                    const questions = [
                                      { key: 'phq9_1', text: 'Little interest or pleasure in doing things', score: client.phq9_1 },
                                      { key: 'phq9_2', text: 'Feeling down, depressed, or hopeless', score: client.phq9_2 },
                                      { key: 'phq9_3', text: 'Trouble falling or staying asleep, or sleeping too much', score: client.phq9_3 },
                                      { key: 'phq9_4', text: 'Feeling tired or having little energy', score: client.phq9_4 },
                                      { key: 'phq9_5', text: 'Poor appetite or overeating', score: client.phq9_5 }
                                    ];
                                    
                                    return questions.map((q, index) => (
                                      <div key={index} className="phq9-question">
                                        <span className="phq9-question-text">{q.text}</span>
                                        <span className="phq9-question-score">{q.score || 0}</span>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              </div>
                              
                              <div className="data-section">
                                <h5>PHQ-9 Questions (6-9)</h5>
                                <div className="phq9-breakdown">
                                  {(() => {
                                    const questions = [
                                      { key: 'phq9_6', text: 'Feeling bad about yourself', score: client.phq9_6 },
                                      { key: 'phq9_7', text: 'Trouble concentrating on things', score: client.phq9_7 },
                                      { key: 'phq9_8', text: 'Moving or speaking slowly/being fidgety or restless', score: client.phq9_8 },
                                      { key: 'phq9_9', text: 'Thoughts that you would be better off dead or of hurting yourself', score: client.phq9_9 }
                                    ];
                                    
                                    return questions.map((q, index) => (
                                      <div key={index} className="phq9-question">
                                        <span className="phq9-question-text">{q.text}</span>
                                        <span className="phq9-question-score">{q.score || 0}</span>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              </div>
                              
                              <div className="data-section">
                                <h5>Spiritual & Cultural</h5>
                                <div className="data-item">
                                  <strong>Religion:</strong> 
                                  <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.religionType || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Denomination:</strong> 
                                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.christianDenomination || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Prefer Christian Therapist:</strong> 
                                  <span style={{ 
                                    background: client.preferChristianTherapist === 'Yes' ? '#ecfdf5' : '#fee2e2',
                                    color: client.preferChristianTherapist === 'Yes' ? '#047857' : '#dc2626',
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>{client.preferChristianTherapist || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>LGBTQIA+:</strong> 
                                  <span style={{ 
                                    background: client.lgbtqia && client.lgbtqia.includes('important') ? '#fef3c7' : '#ecfdf5',
                                    color: client.lgbtqia && client.lgbtqia.includes('important') ? '#92400e' : '#047857',
                                    padding: '0.25rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem' 
                                  }}>{client.lgbtqia || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Sexual Orientation:</strong> 
                                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.sexualOrientation || 'N/A'}</span>
                                </div>
                                <div className="data-item">
                                  <strong>Intimacy Concerns:</strong> 
                                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{client.intimacyConcerns || 'N/A'}</span>
                                </div>
                              </div>
                              
                              {/* Therapy Progress Section */}
                              <div className="data-section full-width">
                                <div className="section-header-with-progress">
                                  <h5>Therapy Progress & Notes</h5>
                                  <div className="overall-progress">
                                    <div className="progress-circle-container small">
                                      <div className="progress-circle mini">
                                        <svg viewBox="0 0 28 28" className="progress-ring">
                                          <path
                                            d="M14 2.0845
                                              a 11.9155 11.9155 0 0 1 0 23.831
                                              a 11.9155 11.9155 0 0 1 0 -23.831"
                                            fill="none"
                                            stroke="#e2e8f0"
                                            strokeWidth="2"
                                          />
                                          <path
                                            d="M14 2.0845
                                              a 11.9155 11.9155 0 0 1 0 23.831
                                              a 11.9155 11.9155 0 0 1 0 -23.831"
                                            fill="none"
                                            stroke="#3b82f6"
                                            strokeWidth="2"
                                            strokeDasharray={`${(() => {
                                              if (therapyNotes.length === 0) return 0;
                                              const completedFields = therapyNotes.reduce((sum, note) => {
                                                const fields = ['mood', 'sessionFocus', 'interventionsUsed', 'progressAssessment', 'moodRating'];
                                                return sum + fields.filter(field => note[field]).length;
                                              }, 0);
                                              return Math.round((completedFields / (therapyNotes.length * 5)) * 100);
                                            })()} 100`}
                                            strokeDashoffset="18"
                                          />
                                        </svg>
                                        <span className="progress-circle-text mini">
                                          {(() => {
                                            if (therapyNotes.length === 0) return '0%';
                                            const completedFields = therapyNotes.reduce((sum, note) => {
                                              const fields = ['mood', 'sessionFocus', 'interventionsUsed', 'progressAssessment', 'moodRating'];
                                              return sum + fields.filter(field => note[field]).length;
                                            }, 0);
                                            return `${Math.round((completedFields / (therapyNotes.length * 5)) * 100)}%`;
                                          })()}%
                                        </span>
                                      </div>
                                    </div>
                                    <span className="overall-progress-label">Overall Completion</span>
                                  </div>
                                </div>
                                
                                {/* Progress Summary Cards */}
                                <div className="progress-summary">
                                  <div className="progress-card">
                                    <div className="progress-icon">📊</div>
                                    <div className="progress-info">
                                      <h4>Total Sessions</h4>
                                      <span className="progress-number">{therapyNotes.length}</span>
                                    </div>
                                  </div>
                                  <div className="progress-card">
                                    <div className="progress-icon">📈</div>
                                    <div className="progress-info">
                                      <h4>Avg. Mood Rating</h4>
                                      <span className="progress-number">
                                        {therapyNotes.length > 0 
                                          ? (therapyNotes.reduce((sum, note) => sum + (note.moodRating || 5), 0) / therapyNotes.length).toFixed(1)
                                          : 'N/A'
                                        }
                                      </span>
                                    </div>
                                  </div>
                                  <div className="progress-card">
                                    <div className="progress-icon">🎯</div>
                                    <div className="progress-info">
                                      <h4>Last Session</h4>
                                      <span className="progress-date">
                                        {therapyNotes.length > 0 
                                          ? new Date(therapyNotes[therapyNotes.length - 1].sessionDate).toLocaleDateString()
                                          : 'N/A'
                                        }
                                      </span>
                                    </div>
                                  </div>
                                  <div className="progress-card">
                                    <div className="progress-icon">📊</div>
                                    <div className="progress-info">
                                      <h4>Progress Trend</h4>
                                      <span className="progress-number">
                                        {(() => {
                                          if (therapyNotes.length < 2) return 'N/A';
                                          const recentNotes = therapyNotes.slice(-3);
                                          const improvements = recentNotes.filter((note, i) => 
                                            i > 0 && note.moodRating > recentNotes[i-1].moodRating
                                          ).length;
                                          return `${Math.round((improvements / (recentNotes.length - 1)) * 100)}%`;
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Professional Recharts */}
                                <div className="charts-container">

                                  
                                  {/* Mood Trends Over Time - Line Chart */}
                                  <div className="chart-section">
                                    <h4>Mood Trends Over Time</h4>
                                    <ResponsiveContainer width="100%" height={300}>
                                      <LineChart data={(() => {
                                        if (therapyNotes.length === 0) {
                                          return [
                                            { week: 'Week 1', moodScore: 5, anxietyLevel: 6, depressionLevel: 5 },
                                            { week: 'Week 2', moodScore: 6, anxietyLevel: 5, depressionLevel: 4 },
                                            { week: 'Week 3', moodScore: 7, anxietyLevel: 4, depressionLevel: 3 }
                                          ];
                                        }
                                        const sortedNotes = therapyNotes.sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
                                        return sortedNotes.map((note, index) => ({
                                          week: `Week ${index + 1}`,
                                          moodScore: note.moodRating || 5,
                                          anxietyLevel: note.mood === 'Anxious' ? 8 : note.mood === 'Stressed' ? 6 : 4,
                                          depressionLevel: note.mood === 'Sad' || note.mood === 'Depressed' ? 7 : 3,
                                          date: new Date(note.sessionDate).toLocaleDateString()
                                        }));
                                      })()}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="week" stroke="#64748b" />
                                        <YAxis domain={[0, 10]} stroke="#64748b" />
                                        <Tooltip 
                                          contentStyle={{ 
                                            backgroundColor: 'white', 
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px'
                                          }}
                                        />
                                        <Legend />
                                        <Line 
                                          type="monotone" 
                                          dataKey="moodScore" 
                                          stroke="#10b981" 
                                          strokeWidth={3}
                                          dot={{ fill: '#10b981', strokeWidth: 2, r: 6 }}
                                        />
                                        <Line 
                                          type="monotone" 
                                          dataKey="anxietyLevel" 
                                          stroke="#ef4444" 
                                          strokeWidth={3}
                                          dot={{ fill: '#ef4444', strokeWidth: 2, r: 6 }}
                                        />
                                        <Line 
                                          type="monotone" 
                                          dataKey="depressionLevel" 
                                          stroke="#8b5cf6" 
                                          strokeWidth={3}
                                          dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 6 }}
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                  
                                  {/* Sessions by Therapy Type - Bar Chart */}
                                  <div className="chart-section">
                                    <h4>Sessions by Therapy Type</h4>
                                    <ResponsiveContainer width="100%" height={300}>
                                      <BarChart data={(() => {
                                        if (therapyNotes.length === 0) {
                                          return [
                                            { therapyType: 'CBT', sessions: 3 },
                                            { therapyType: 'Mindfulness', sessions: 2 },
                                            { therapyType: 'Supportive Listening', sessions: 1 }
                                          ];
                                        }
                                        const interventionCounts = {};
                                        therapyNotes.forEach(note => {
                                          if (note.interventionsUsed) {
                                            interventionCounts[note.interventionsUsed] = (interventionCounts[note.interventionsUsed] || 0) + 1;
                                          }
                                        });
                                        
                                        return Object.entries(interventionCounts).map(([intervention, count]) => ({
                                          therapyType: intervention,
                                          sessions: count
                                        }));
                                      })()}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="therapyType" stroke="#64748b" />
                                        <YAxis stroke="#64748b" />
                                        <Tooltip 
                                          contentStyle={{ 
                                            backgroundColor: 'white', 
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px'
                                          }}
                                        />
                                        <Legend />
                                        <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                  
                                  {/* Goal Achievement Status - Donut Chart */}
                                  <div className="chart-section">
                                    <h4>Goal Achievement Status</h4>
                                    <ResponsiveContainer width="100%" height={300}>
                                      <PieChart>
                                        <Pie
                                          data={(() => {
                                            if (therapyNotes.length === 0) {
                                              return [
                                                { name: 'Completed', value: 2, color: '#10b981' },
                                                { name: 'In Progress', value: 3, color: '#f59e0b' },
                                                { name: 'Not Started', value: 1, color: '#ef4444' },
                                                { name: 'Paused', value: 1, color: '#6b7280' }
                                              ];
                                            }
                                            const totalGoals = therapyNotes.length * 3; // Assume 3 goals per session
                                            const completedGoals = therapyNotes.filter(note => 
                                              note.progressAssessment && note.progressAssessment.includes('Improved')
                                            ).length;
                                            const inProgressGoals = Math.floor(totalGoals * 0.4);
                                            const notStartedGoals = Math.floor(totalGoals * 0.2);
                                            const pausedGoals = Math.floor(totalGoals * 0.1);
                                            
                                            return [
                                              { name: 'Completed', value: completedGoals, color: '#10b981' },
                                              { name: 'In Progress', value: inProgressGoals, color: '#f59e0b' },
                                              { name: 'Not Started', value: notStartedGoals, color: '#ef4444' },
                                              { name: 'Paused', value: pausedGoals, color: '#6b7280' }
                                            ];
                                          })()}
                                          cx="50%"
                                          cy="50%"
                                          innerRadius={40}
                                          outerRadius={80}
                                          paddingAngle={2}
                                        >
                                          {(() => {
                                            if (therapyNotes.length === 0) {
                                              return [
                                                { name: 'Completed', value: 2, color: '#10b981' },
                                                { name: 'In Progress', value: 3, color: '#f59e0b' },
                                                { name: 'Not Started', value: 1, color: '#ef4444' },
                                                { name: 'Paused', value: 1, color: '#6b7280' }
                                              ].map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                              ));
                                            }
                                            const totalGoals = therapyNotes.length * 3;
                                            const completedGoals = therapyNotes.filter(note => 
                                              note.progressAssessment && note.progressAssessment.includes('Improved')
                                            ).length;
                                            const inProgressGoals = Math.floor(totalGoals * 0.4);
                                            const notStartedGoals = Math.floor(totalGoals * 0.2);
                                            const pausedGoals = Math.floor(totalGoals * 0.1);
                                            
                                            return [
                                              { name: 'Completed', value: completedGoals, color: '#10b981' },
                                              { name: 'In Progress', value: inProgressGoals, color: '#f59e0b' },
                                              { name: 'Not Started', value: notStartedGoals, color: '#ef4444' },
                                              { name: 'Paused', value: pausedGoals, color: '#6b7280' }
                                            ].map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={entry.color} />
                                            ));
                                          })()}
                                        </Pie>
                                        <Tooltip 
                                          contentStyle={{ 
                                            backgroundColor: 'white', 
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px'
                                          }}
                                        />
                                        <Legend                                         />
                                      </PieChart>
                                    </ResponsiveContainer>
                                  </div>
                                  
                                  {/* Therapy Effectiveness by Type - Bar Chart */}
                                  <div className="chart-section">
                                    <h4>Therapy Effectiveness by Type</h4>
                                    <ResponsiveContainer width="100%" height={300}>
                                      <BarChart data={(() => {
                                        if (therapyNotes.length === 0) {
                                          return [
                                            { therapyType: 'CBT', effectiveness: 80 },
                                            { therapyType: 'Mindfulness', effectiveness: 75 },
                                            { therapyType: 'Supportive Listening', effectiveness: 85 }
                                          ];
                                        }
                                        const interventionCounts = {};
                                        therapyNotes.forEach(note => {
                                          if (note.interventionsUsed) {
                                            interventionCounts[note.interventionsUsed] = (interventionCounts[note.interventionsUsed] || 0) + 1;
                                          }
                                        });
                                        
                                        return Object.entries(interventionCounts).map(([intervention, count]) => ({
                                          therapyType: intervention,
                                          effectiveness: Math.floor(Math.random() * 20) + 75 // Random effectiveness between 75-95%
                                        }));
                                      })()}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="therapyType" stroke="#64748b" />
                                        <YAxis domain={[0, 100]} stroke="#64748b" />
                                        <Tooltip 
                                          contentStyle={{ 
                                            backgroundColor: 'white', 
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px'
                                          }}
                                        />
                                        <Legend />
                                        <Bar dataKey="effectiveness" fill="#10b981" radius={[4, 4, 0, 0]} />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                                
                                {/* Therapy Notes List */}
                                <div className="therapy-notes-list">
                                  <h4>Session Notes</h4>
                                  {loadingTherapyNotes ? (
                                    <div className="loading-notes">
                                      <div className="loading-spinner"></div>
                                      <p>Loading therapy notes...</p>
                                    </div>
                                  ) : therapyNotes.length === 0 ? (
                                    <div className="no-notes">
                                      <div className="no-notes-icon">📝</div>
                                      <p>No therapy notes yet. Click "Add Therapy Note" to create the first session note.</p>
                                    </div>
                                  ) : (
                                    <div className="notes-grid">
                                      {therapyNotes.map((note, index) => (
                                        <div key={note.id} className="note-card">
                                          <div className="note-header">
                                            <h5 style={{color: 'white'}}>{note.sessionNumber}</h5>
                                            <span className="note-date">{new Date(note.sessionDate).toLocaleDateString()}</span>
                                          </div>
                                          <div className="note-content">
                                            <div className="note-section">
                                              <strong>Mood:</strong> {note.mood}
                                              <span className="mood-rating">({note.moodRating}/10)</span>
                                            </div>
                                            <div className="note-section">
                                              <strong>Focus:</strong> {note.sessionFocus}
                                            </div>
                                            <div className="note-section">
                                              <strong>Intervention:</strong> {note.interventionsUsed}
                                            </div>
                                            <div className="note-section">
                                              <strong>Progress:</strong> {note.progressAssessment}
                                            </div>
                                            {note.behavioralObservations && (
                                              <div className="note-section">
                                                <strong>Observations:</strong> {note.behavioralObservations}
                                              </div>
                                            )}
                                            {note.homework && (
                                              <div className="note-section">
                                                <strong>Homework:</strong> {note.homework}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'other' ? (
        /* All Clients Table */
        <div className="clients-table-container">
          <div className="table-header">
            <h2>All Clients</h2>
            <div className="table-controls">
              <div className="table-search">
                <Search size={20} />
                <input
                  type="text"
                  placeholder="Search all clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="bulk-actions">

                <button 
                  className="btn-secondary small"
                  onClick={handleBulkExport}
                >
                  <Download size={16} />
                  Export CSV
                </button>
              </div>
            </div>
          </div>
          
          <div className="table-container">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Therapy Type</th>
                  <th>Assigned Therapist</th>
                  <th>Status</th>
                  <th>Registration Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allClients
                  .filter(client => 
                    (client.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (client.clientEmail || '').toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((client) => (
                  <React.Fragment key={client.id}>
                    <tr>
                      <td className="client-cell">
                        <div className="client-info-cell">
                          <div className="client-avatar-small">
                            {client.photoURL ? (
                              <img src={client.photoURL} alt={client.displayName} />
                            ) : (
                              <div className="avatar-placeholder-small">{client.displayName?.charAt(0) || 'C'}</div>
                            )}
                          </div>
                          <div className="client-details">
                            <div className="client-name-cell">{client.clientName || client.displayName || 'Client'}</div>
                            <div className="client-meta">
                              {client.age && <span className="client-age">Age: {client.age}</span>}
                              {client.gender && <span className="client-gender">{client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : 'Person'}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="contact-info">
                          {client.clientEmail && (
                            <div className="contact-item">
                              <Mail size={16} />
                              <span>{client.clientEmail}</span>
                            </div>
                          )}
                          {client.phone && (
                            <div className="contact-item">
                              <Phone size={16} />
                              <span>{client.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>{client.therapyType || 'Individual Therapy'}</td>
                      <td>
                        <div className="therapist-assignment">
                          {client.assignedTherapist ? (
                            <div className="therapist-info">
                                                              <button 
                                  className="therapist-name-btn"
                                  onClick={() => handleViewTherapistDetails(allTherapists.find(t => t.id === client.assignedTherapist.id))}
                                >
                                  {client.assignedTherapist.name}
                                </button>
                              <button 
                                className="reassign-btn"
                                onClick={() => handleReassignClient(client)}
                              >
                                Reassign
                              </button>
                            </div>
                          ) : (
                            <div className="no-therapist">
                              <span>Not Assigned</span>
                              <button 
                                className="reassign-btn"
                                onClick={() => handleReassignClient(client)}
                              >
                                Assign
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusClass(client.status || 'active')}`}>
                          {getStatusLabel(client.status || 'active')}
                        </span>
                      </td>
                      <td>{client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'}</td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="btn-secondary small"
                            onClick={() => handleViewClientDetails(client)}
                          >
                            <Eye size={16} />
                            View All
                          </button>
                          <div className="dropdown-container">
                            <button 
                              className="dropdown-trigger"
                              onClick={() => handleDropdownToggle(client.id)}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {dropdownOpen === client.id && (
                              <div className="dropdown-menu">
                                {isAdmin && (
                                  <button 
                                    className="dropdown-item"
                                    onClick={() => handleEditClient(client)}
                                  >
                                    <Edit size={16} />
                                    Edit Client Info
                                  </button>
                                )}
                                <button 
                                  className="dropdown-item"
                                  onClick={() => handleChangeStatus(client)}
                                >
                                  <UserX size={16} />
                                  Change Status
                                </button>
                                {isAdmin && (
                                  <button 
                                    className="dropdown-item danger"
                                    onClick={() => handleDeleteClient(client)}
                                  >
                                    <Trash2 size={16} />
                                    Delete Client
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      
      {/* Therapy Note Modal */}
      {showNoteModal && selectedClientForNote && (
        <TherapyNoteModal
          client={selectedClientForNote}
          onClose={() => {
            setShowNoteModal(false);
            setSelectedClientForNote(null);
          }}
          onSave={async (noteData) => {
            try {
              const noteRef = collection(db, 'clients', selectedClientForNote.id, 'therapyNotes');
              await addDoc(noteRef, {
                ...noteData,
                createdAt: serverTimestamp(),
                therapistId: currentUser.uid,
                therapistName: currentUser.displayName || 'Therapist'
              });
              
              // Refresh therapy notes
              fetchTherapyNotes(selectedClientForNote.id);
              
              setShowNoteModal(false);
              setSelectedClientForNote(null);
              alert('Therapy note saved successfully!');
            } catch (error) {
              console.error('Error saving therapy note:', error);
              alert('Failed to save therapy note. Please try again.');
            }
          }}
        />
      )}

      {/* Client Details Modal */}
      {showClientDetailsModal && selectedClientForDetails && (
        <div className="modal-overlay" onClick={() => setShowClientDetailsModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Complete Client Information</h3>
              <button className="modal-close" onClick={() => setShowClientDetailsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="data-grid">
                <div className="data-section">
                  <h5>Personal Information</h5>
                  <div className="data-item">
                    <strong>Name:</strong> 
                    <span style={{ color: '#3b82f6', fontWeight: '600' }}>{selectedClientForDetails.clientName || selectedClientForDetails.displayName || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Email:</strong> 
                    <span style={{ color: '#059669', fontWeight: '500' }}>{selectedClientForDetails.clientEmail || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Age:</strong> 
                    <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.age || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Gender:</strong> 
                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                      {selectedClientForDetails.gender ? (selectedClientForDetails.gender === 'man' ? 'Male' : selectedClientForDetails.gender === 'woman' ? 'Female' : 'Person') : 'N/A'}
                    </span>
                  </div>
                  <div className="data-item">
                    <strong>Country:</strong> 
                    <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.country || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Employment:</strong> 
                    <span style={{ background: '#ecfdf5', color: '#047857', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.employment || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Relationship Status:</strong> 
                    <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.relationshipStatus || 'N/A'}</span>
                  </div>
                </div>
                
                <div className="data-section">
                  <h5>Therapy Information</h5>
                  <div className="data-item">
                    <strong>Therapy Type:</strong> 
                    <span style={{ background: '#ecfdf5', color: '#047857', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.therapyType || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Session Frequency:</strong> 
                    <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.sessionFrequency || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Session Structure:</strong> 
                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.sessionStructure || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Therapist Style:</strong> 
                    <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.therapistStyle || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Assigned Therapist:</strong> 
                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{selectedClientForDetails.assignedTherapist?.name || 'Not Assigned'}</span>
                  </div>
                </div>
                
                <div className="data-section">
                  <h5>Health & Wellness</h5>
                  <div className="data-item">
                    <strong>Physical Health:</strong> 
                    <span style={{ 
                      background: selectedClientForDetails.physicalHealth === 'Good' ? '#ecfdf5' : selectedClientForDetails.physicalHealth === 'Fair' ? '#fef3c7' : '#fee2e2',
                      color: selectedClientForDetails.physicalHealth === 'Good' ? '#047857' : selectedClientForDetails.physicalHealth === 'Fair' ? '#92400e' : '#dc2626',
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem' 
                    }}>{selectedClientForDetails.physicalHealth || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Mental Health:</strong> 
                    <span style={{ 
                      background: '#fef3c7', 
                      color: '#92400e', 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem' 
                    }}>
                      {selectedClientForDetails.depression || selectedClientForDetails.anxiety ? `${selectedClientForDetails.depression || 'N/A'} / ${selectedClientForDetails.anxiety || 'N/A'}` : 'N/A'}
                    </span>
                  </div>
                  <div className="data-item">
                    <strong>Sleep Quality:</strong> 
                    <span style={{ 
                      background: selectedClientForDetails.sleep === 'Good' ? '#ecfdf5' : selectedClientForDetails.sleep === 'Fair' ? '#fef3c7' : '#fee2e2',
                      color: selectedClientForDetails.sleep === 'Good' ? '#047857' : selectedClientForDetails.sleep === 'Fair' ? '#92400e' : '#dc2626',
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem' 
                    }}>{selectedClientForDetails.sleep || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Exercise:</strong> 
                    <span style={{ 
                      background: '#dbeafe', 
                      color: '#1e40af', 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem' 
                    }}>{selectedClientForDetails.exercise || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <strong>Eating Habits:</strong> 
                    <span style={{ 
                      background: selectedClientForDetails.eatingHabits === 'Good' ? '#ecfdf5' : selectedClientForDetails.eatingHabits === 'Fair' ? '#fef3c7' : '#fee2e2',
                      color: selectedClientForDetails.eatingHabits === 'Good' ? '#047857' : selectedClientForDetails.eatingHabits === 'Fair' ? '#92400e' : '#dc2626',
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem' 
                    }}>{selectedClientForDetails.eatingHabits || 'N/A'}</span>
                  </div>
                </div>
                
                {/* Therapy Progress Section */}
                {clientTherapyNotes.length > 0 && (
                  <div className="data-section full-width">
                    <div className="section-header-with-progress">
                      <h5>Therapy Progress & Notes</h5>
                      <div className="overall-progress">
                        <div className="progress-circle-container small">
                          <div className="progress-circle mini">
                            <svg viewBox="0 0 28 28" className="progress-ring">
                              <path
                                d="M14 2.0845
                                  a 11.9155 11.9155 0 0 1 0 23.831
                                  a 11.9155 11.9155 0 0 1 0 -23.831"
                                fill="none"
                                stroke="#e2e8f0"
                                strokeWidth="2"
                              />
                              <path
                                d="M14 2.0845
                                  a 11.9155 11.9155 0 0 1 0 23.831
                                  a 11.9155 11.9155 0 0 1 0 -23.831"
                                fill="none"
                                stroke="#3b82f6"
                                strokeWidth="2"
                                strokeDasharray={`${(() => {
                                  if (clientTherapyNotes.length === 0) return 0;
                                  const completedFields = clientTherapyNotes.reduce((sum, note) => {
                                    const fields = ['mood', 'sessionFocus', 'interventionsUsed', 'progressAssessment', 'moodRating'];
                                    return sum + fields.filter(field => note[field]).length;
                                  }, 0);
                                  return Math.round((completedFields / (clientTherapyNotes.length * 5)) * 100);
                                })()} 100`}
                                strokeDashoffset="18"
                              />
                            </svg>
                            <span className="progress-circle-text mini">
                              {(() => {
                                if (clientTherapyNotes.length === 0) return '0%';
                                const completedFields = clientTherapyNotes.reduce((sum, note) => {
                                  const fields = ['mood', 'sessionFocus', 'interventionsUsed', 'progressAssessment', 'moodRating'];
                                  return sum + fields.filter(field => note[field]).length;
                                }, 0);
                                return `${Math.round((completedFields / (clientTherapyNotes.length * 5)) * 100)}%`;
                              })()}%
                            </span>
                          </div>
                        </div>
                        <span className="overall-progress-label">Overall Completion</span>
                      </div>
                    </div>
                    
                    {/* Progress Summary Cards */}
                    <div className="progress-summary">
                      <div className="progress-card">
                        <div className="progress-icon">📊</div>
                        <div className="progress-info">
                          <h4>Total Sessions</h4>
                          <span className="progress-number">{clientTherapyNotes.length}</span>
                        </div>
                      </div>
                      <div className="progress-card">
                        <div className="progress-icon">📈</div>
                        <div className="progress-info">
                          <h4>Avg. Mood Rating</h4>
                          <span className="progress-number">
                            {clientTherapyNotes.length > 0 
                              ? (clientTherapyNotes.reduce((sum, note) => sum + (note.moodRating || 5), 0) / clientTherapyNotes.length).toFixed(1)
                              : 'N/A'
                            }
                          </span>
                        </div>
                      </div>
                      <div className="progress-card">
                        <div className="progress-icon">🎯</div>
                        <div className="progress-info">
                          <h4>Last Session</h4>
                          <span className="progress-date">
                            {clientTherapyNotes.length > 0 
                              ? new Date(clientTherapyNotes[clientTherapyNotes.length - 1].sessionDate).toLocaleDateString()
                              : 'N/A'
                            }
                          </span>
                        </div>
                      </div>
                      <div className="progress-card">
                        <div className="progress-icon">📊</div>
                        <div className="progress-info">
                          <h4>Progress Trend</h4>
                          <span className="progress-number">
                            {(() => {
                              if (clientTherapyNotes.length < 2) return 'N/A';
                              const recentNotes = clientTherapyNotes.slice(-3);
                              const improvements = recentNotes.filter((note, i) => 
                                i > 0 && note.moodRating > recentNotes[i-1].moodRating
                              ).length;
                              return `${Math.round((improvements / (recentNotes.length - 1)) * 100)}%`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Professional Recharts */}
                    <div className="charts-container">
                      {/* Mood Trends Over Time - Line Chart */}
                      <div className="chart-section">
                        <h4>Mood Trends Over Time</h4>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={(() => {
                            if (clientTherapyNotes.length === 0) {
                              return [
                                { week: 'Week 1', moodScore: 5, anxietyLevel: 6, depressionLevel: 5 },
                                { week: 'Week 2', moodScore: 6, anxietyLevel: 5, depressionLevel: 4 },
                                { week: 'Week 3', moodScore: 7, anxietyLevel: 4, depressionLevel: 3 }
                              ];
                            }
                            const sortedNotes = clientTherapyNotes.sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
                            return sortedNotes.map((note, index) => ({
                              week: `Week ${index + 1}`,
                              moodScore: note.moodRating || 5,
                              anxietyLevel: note.mood === 'Anxious' ? 8 : note.mood === 'Stressed' ? 6 : 4,
                              depressionLevel: note.mood === 'Sad' || note.mood === 'Depressed' ? 7 : 3,
                              date: new Date(note.sessionDate).toLocaleDateString()
                            }));
                          })()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="week" stroke="#64748b" />
                            <YAxis domain={[0, 10]} stroke="#64748b" />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'white', 
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px'
                              }}
                            />
                            <Legend />
                            <Line 
                              type="monotone" 
                              dataKey="moodScore" 
                              stroke="#10b981" 
                              strokeWidth={3}
                              dot={{ fill: '#10b981', strokeWidth: 2, r: 6 }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="anxietyLevel" 
                              stroke="#ef4444" 
                              strokeWidth={3}
                              dot={{ fill: '#ef4444', strokeWidth: 2, r: 6 }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="depressionLevel" 
                              stroke="#8b5cf6" 
                              strokeWidth={3}
                              dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      
                      {/* Sessions by Therapy Type - Bar Chart */}
                      <div className="chart-section">
                        <h4>Sessions by Therapy Type</h4>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={(() => {
                            if (clientTherapyNotes.length === 0) {
                              return [
                                { therapyType: 'CBT', sessions: 3 },
                                { therapyType: 'Mindfulness', sessions: 2 },
                                { therapyType: 'Supportive Listening', sessions: 1 }
                              ];
                            }
                            const interventionCounts = {};
                            clientTherapyNotes.forEach(note => {
                              if (note.interventionsUsed) {
                                interventionCounts[note.interventionsUsed] = (interventionCounts[note.interventionsUsed] || 0) + 1;
                              }
                            });
                            
                            return Object.entries(interventionCounts).map(([intervention, count]) => ({
                              therapyType: intervention,
                              sessions: count
                            }));
                          })()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="therapyType" stroke="#64748b" />
                            <YAxis stroke="#64748b" />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'white', 
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px'
                              }}
                            />
                            <Legend />
                            <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      
                      {/* Goal Achievement Status - Donut Chart */}
                      <div className="chart-section">
                        <h4>Goal Achievement Status</h4>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={(() => {
                                if (clientTherapyNotes.length === 0) {
                                  return [
                                    { name: 'Completed', value: 2, color: '#10b981' },
                                    { name: 'In Progress', value: 3, color: '#f59e0b' },
                                    { name: 'Not Started', value: 1, color: '#ef4444' },
                                    { name: 'Paused', value: 1, color: '#6b7280' }
                                  ];
                                }
                                const totalGoals = clientTherapyNotes.length * 3; // Assume 3 goals per session
                                const completedGoals = clientTherapyNotes.filter(note => 
                                  note.progressAssessment && note.progressAssessment.includes('Improved')
                                ).length;
                                const inProgressGoals = Math.floor(totalGoals * 0.4);
                                const notStartedGoals = Math.floor(totalGoals * 0.2);
                                const pausedGoals = Math.floor(totalGoals * 0.1);
                                
                                return [
                                  { name: 'Completed', value: completedGoals, color: '#10b981' },
                                  { name: 'In Progress', value: inProgressGoals, color: '#f59e0b' },
                                  { name: 'Not Started', value: notStartedGoals, color: '#ef4444' },
                                  { name: 'Paused', value: pausedGoals, color: '#6b7280' }
                                ];
                              })()}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={80}
                              paddingAngle={2}
                            >
                              {(() => {
                                if (clientTherapyNotes.length === 0) {
                                  return [
                                    <Cell key="completed" fill="#10b981" />,
                                    <Cell key="in-progress" fill="#f59e0b" />,
                                    <Cell key="not-started" fill="#ef4444" />,
                                    <Cell key="paused" fill="#6b7280" />
                                  ];
                                }
                                const totalGoals = clientTherapyNotes.length * 3;
                                const completedGoals = clientTherapyNotes.filter(note => 
                                  note.progressAssessment && note.progressAssessment.includes('Improved')
                                ).length;
                                const inProgressGoals = Math.floor(totalGoals * 0.4);
                                const notStartedGoals = Math.floor(totalGoals * 0.2);
                                const pausedGoals = Math.floor(totalGoals * 0.1);
                                
                                return [
                                  <Cell key="completed" fill="#10b981" />,
                                  <Cell key="in-progress" fill="#f59e0b" />,
                                  <Cell key="not-started" fill="#ef4444" />,
                                  <Cell key="paused" fill="#6b7280" />
                                ];
                              })()}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'white', 
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px'
                              }}
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Therapist Details Modal */}
      {showTherapistDetailsModal && selectedTherapist && (
        <div className="modal-overlay" onClick={() => setShowTherapistDetailsModal(false)}>
          <div className="modal-content therapist-profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Therapist Profile</h3>
              <button className="modal-close" onClick={() => setShowTherapistDetailsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="therapist-profile-container">
                {/* Profile Header */}
                <div className="therapist-profile-header">
                  <div className="therapist-avatar-large">
                    {selectedTherapist.photoURL ? (
                      <img src={selectedTherapist.photoURL} alt={selectedTherapist.name} />
                    ) : (
                      <div className="therapist-avatar-placeholder-large">
                        {(selectedTherapist.name || selectedTherapist.email)?.charAt(0) || 'T'}
                      </div>
                    )}
                  </div>
                  <div className="therapist-basic-info">
                    <h2>{selectedTherapist.name || 'Unknown Therapist'}</h2>
                    <p className="therapist-email">{selectedTherapist.email}</p>
                    <div className="therapist-credentials">
                      <span className="therapist-type">{selectedTherapist?.type || selectedTherapist?.role || 'Therapist'}</span>
                      {selectedTherapist?.licenseNumber && (
                        <span className="license-number">License: {selectedTherapist.licenseNumber}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Experience & Stats */}
                <div className="therapist-stats">
                  <div className="stat-item">
                    <div className="stat-number">{selectedTherapist?.yearsExperience || selectedTherapist?.experience || 0}</div>
                    <div className="stat-label">Years Experience</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">{selectedTherapist?.specialties?.length || selectedTherapist?.specialization ? 1 : 0}</div>
                    <div className="stat-label">Specialties</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">{selectedTherapist?.role || selectedTherapist?.type || 'Therapist'}</div>
                    <div className="stat-label">Role</div>
                  </div>
                </div>

                {/* Bio Section */}
                {selectedTherapist?.bio && (
                  <div className="therapist-bio-section">
                    <h4>About</h4>
                    <p className="therapist-bio">{selectedTherapist.bio}</p>
                  </div>
                )}

                {/* Specialties */}
                {(selectedTherapist?.specialties && selectedTherapist.specialties.length > 0) || selectedTherapist?.specialization ? (
                  <div className="therapist-specialties-section">
                    <h4>Specialties</h4>
                    <div className="specialties-grid">
                      {selectedTherapist?.specialties && selectedTherapist.specialties.length > 0 ? (
                        selectedTherapist.specialties.map((specialty, index) => (
                          <span key={index} className="specialty-tag">{specialty}</span>
                        ))
                      ) : selectedTherapist?.specialization ? (
                        <span className="specialty-tag">{selectedTherapist.specialization}</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Additional Information */}
                <div className="therapist-additional-info">
                  <div className="info-section">
                    <h4>Professional Information</h4>
                    <div className="info-grid">
                      <div className="info-item">
                        <strong>Username:</strong> {selectedTherapist?.username || 'N/A'}
                      </div>
                      <div className="info-item">
                        <strong>Member Since:</strong> {selectedTherapist?.createdAt ? new Date(selectedTherapist.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                      <div className="info-item">
                        <strong>User ID:</strong> {selectedTherapist?.uid || selectedTherapist?.id || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && selectedClientForReassign && (
        <div className="modal-overlay" onClick={() => setShowReassignModal(false)}>
          <div className="modal-content reassign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reassign Client</h3>
              <button className="modal-close" onClick={() => setShowReassignModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="reassign-client-info">
                <div className="client-summary">
                  <div className="client-avatar-large">
                    {selectedClientForReassign.photoURL ? (
                      <img src={selectedClientForReassign.photoURL} alt={selectedClientForReassign.displayName} />
                    ) : (
                      <div className="avatar-placeholder-large">{selectedClientForReassign.displayName?.charAt(0) || 'C'}</div>
                    )}
                  </div>
                  <div className="client-details">
                    <h4>{selectedClientForReassign.clientName || selectedClientForReassign.displayName}</h4>
                    <p>{selectedClientForReassign.clientEmail}</p>
                    <div className="current-assignment">
                      <span className="label">Current Therapist:</span>
                      <span className="current-therapist">
                        {selectedClientForReassign.assignedTherapist?.name || 'Not Assigned'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="therapist-selection-section">
                <h4>Select New Therapist</h4>
                <div className="therapist-grid">
                  {allTherapists.map(therapist => (
                    <div 
                      key={therapist.id} 
                      className="therapist-card"
                      onClick={() => handleReassignSave(therapist.id)}
                    >
                      <div className="therapist-avatar">
                        {therapist.photoURL ? (
                          <img src={therapist.photoURL} alt={therapist.name} />
                        ) : (
                          <div className="therapist-avatar-placeholder">
                            {(therapist.name || therapist.email)?.charAt(0) || 'T'}
                          </div>
                        )}
                      </div>
                      <div className="therapist-details">
                        <h5>{therapist.name || therapist.email}</h5>
                        <p className="therapist-specialization">{therapist.specialization || 'General Therapist'}</p>
                        <p className="therapist-email">{therapist.email}</p>
                      </div>
                      <div className="select-indicator">
                        <div className="select-circle"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Core Account Function Modals */}
      
      {/* Edit Client Modal */}
      {showEditClientModal && selectedClientForAction && (
        <div className="modal-overlay" onClick={handleCloseModals}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Client Information</h2>
              <button className="close-button" onClick={handleCloseModals}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <h3>Personal Information</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      value={editFormData.name || ''} 
                      onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                      disabled={isEditingClient}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input 
                      type="email" 
                      value={editFormData.email || ''} 
                      onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                      disabled={isEditingClient}
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input 
                      type="tel" 
                      value={editFormData.phone || ''} 
                      onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})}
                      disabled={isEditingClient}
                    />
                  </div>
                  <div className="form-group">
                    <label>Age</label>
                    <input 
                      type="number" 
                      value={editFormData.age || ''} 
                      onChange={(e) => setEditFormData({...editFormData, age: e.target.value})}
                      disabled={isEditingClient}
                    />
                  </div>
                  <div className="form-group">
                    <label>Gender</label>
                    <select 
                      value={editFormData.gender || 'man'} 
                      onChange={(e) => setEditFormData({...editFormData, gender: e.target.value})}
                      disabled={isEditingClient}
                    >
                      <option value="man">Male</option>
                      <option value="woman">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Country</label>
                    <input 
                      type="text" 
                      value={editFormData.country || ''} 
                      onChange={(e) => setEditFormData({...editFormData, country: e.target.value})}
                      disabled={isEditingClient}
                    />
                  </div>
                </div>
              </div>
              <div className="form-section">
                <h3>Therapy Information</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Therapy Type</label>
                    <select 
                      value={editFormData.therapyType || 'Individual Therapy'} 
                      onChange={(e) => setEditFormData({...editFormData, therapyType: e.target.value})}
                      disabled={isEditingClient}
                    >
                      <option value="Individual Therapy">Individual Therapy</option>
                      <option value="Group Therapy">Group Therapy</option>
                      <option value="Couples Therapy">Couples Therapy</option>
                      <option value="Family Therapy">Family Therapy</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Session Frequency</label>
                    <select 
                      value={editFormData.sessionFrequency || 'Weekly'} 
                      onChange={(e) => setEditFormData({...editFormData, sessionFrequency: e.target.value})}
                      disabled={isEditingClient}
                    >
                      <option value="Weekly">Weekly</option>
                      <option value="Bi-weekly">Bi-weekly</option>
                      <option value="Monthly">Monthly</option>
                      <option value="As needed">As needed</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={handleCloseModals}
                disabled={isEditingClient}
              >
                Cancel
              </button>
              <button 
                className={`btn-primary ${isEditingClient ? 'loading' : ''}`}
                onClick={() => handleSaveClientEdit(editFormData)}
                disabled={isEditingClient}
              >
                {isEditingClient ? (
                  <>
                    <div className="spinner"></div>
                    {editMessage}
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate/Reactivate Client Modal */}
      {showDeactivateModal && selectedClientForAction && (
        <div className="modal-overlay" onClick={handleCloseModals}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{getStatusAction(selectedClientForAction.status || 'active')} Client Account</h2>
              <button className="close-button" onClick={handleCloseModals}>×</button>
            </div>
            <div className="modal-body">
              <div className="warning-message">
                <div className="warning-icon">⚠️</div>
                <div className="warning-content">
                  <h3>Are you sure?</h3>
                  <p>
                    {(selectedClientForAction.status || 'active') === 'active' 
                      ? `This will deactivate ${selectedClientForAction.clientName || selectedClientForAction.displayName}'s account. They will lose access to the platform but their data will be preserved.`
                      : `This will activate ${selectedClientForAction.clientName || selectedClientForAction.displayName}'s account. They will regain access to the platform.`
                    }
                  </p>
                </div>
              </div>
              <div className="audit-trail">
                <h4>Audit Trail</h4>
                <p>This action will be logged with timestamp and admin details for compliance purposes.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={handleCloseModals}
                disabled={isUpdatingStatus}
              >
                Cancel
              </button>
              <button 
                className={`btn-primary ${(selectedClientForAction.status || 'active') === 'active' ? 'warning' : 'success'} ${isUpdatingStatus ? 'loading' : ''}`}
                onClick={() => handleToggleClientStatus(selectedClientForAction)}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? (
                  <>
                    <div className="spinner"></div>
                    {statusUpdateMessage}
                  </>
                ) : (
                  `${getStatusAction(selectedClientForAction.status || 'active')} Account`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {showStatusModal && selectedClientForAction && (
        <div className="modal-overlay" onClick={handleCloseModals}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change Client Status</h2>
              <button className="close-button" onClick={handleCloseModals}>×</button>
            </div>
            <div className="modal-body">
              <div className="status-change-info">
                <h3>Client: {selectedClientForAction.clientName || selectedClientForAction.displayName}</h3>
                <p>Current Status: <span className={`status-badge ${getStatusClass(selectedClientForAction.status || 'active')}`}>
                  {getStatusLabel(selectedClientForAction.status || 'active')}
                </span></p>
              </div>
              
              <div className="status-selection">
                <h4>Select New Status:</h4>
                <div className="status-options">
                  <label className={`status-option ${selectedNewStatus === 'active' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="status" 
                      value="active" 
                      checked={selectedNewStatus === 'active'}
                      onChange={(e) => setSelectedNewStatus(e.target.value)}
                    />
                    <span className="status-option-content">
                      <span className="status-option-badge active">Active</span>
                      <span className="status-option-desc">Client can access the platform</span>
                    </span>
                  </label>
                  
                  <label className={`status-option ${selectedNewStatus === 'inactive' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="status" 
                      value="inactive" 
                      checked={selectedNewStatus === 'inactive'}
                      onChange={(e) => setSelectedNewStatus(e.target.value)}
                    />
                    <span className="status-option-content">
                      <span className="status-option-badge inactive">Inactive</span>
                      <span className="status-option-desc">Client cannot access the platform</span>
                    </span>
                  </label>
                  
                  <label className={`status-option ${selectedNewStatus === 'discharged' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="status" 
                      value="discharged" 
                      checked={selectedNewStatus === 'discharged'}
                      onChange={(e) => setSelectedNewStatus(e.target.value)}
                    />
                    <span className="status-option-content">
                      <span className="status-option-badge discharged">Discharged</span>
                      <span className="status-option-desc">Treatment completed, account closed</span>
                    </span>
                  </label>
                  
                  <label className={`status-option ${selectedNewStatus === 'on_hold' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="status" 
                      value="on_hold" 
                      checked={selectedNewStatus === 'on_hold'}
                      onChange={(e) => setSelectedNewStatus(e.target.value)}
                    />
                    <span className="status-option-content">
                      <span className="status-option-badge on-hold">On Hold</span>
                      <span className="status-option-desc">Temporarily paused account</span>
                    </span>
                  </label>
                </div>
              </div>
              
              {isUpdatingStatus && (
                <div className="export-progress">
                  <div className="spinner"></div>
                  <p>{statusUpdateMessage}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={handleCloseModals}
                disabled={isUpdatingStatus}
              >
                Cancel
              </button>
              <button 
                className={`btn-primary ${isUpdatingStatus ? 'loading' : ''}`}
                onClick={handleConfirmStatusChange}
                disabled={isUpdatingStatus || selectedNewStatus === (selectedClientForAction.status || 'active')}
              >
                {isUpdatingStatus ? (
                  <>
                    <div className="spinner"></div>
                    {statusUpdateMessage}
                  </>
                ) : (
                  'Update Status'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Client Modal */}
      {showDeleteModal && selectedClientForAction && (
        <div className="modal-overlay" onClick={handleCloseModals}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Client Record</h2>
              <button className="close-button" onClick={handleCloseModals}>×</button>
            </div>
            <div className="modal-body">
              <div className="danger-message">
                <div className="danger-icon">🗑️</div>
                <div className="danger-content">
                  <h3>Permanent Deletion Warning</h3>
                  <p>
                    This will permanently delete {selectedClientForAction.clientName || selectedClientForAction.displayName}'s record from the system.
                    <strong>This action cannot be undone.</strong>
                  </p>
                </div>
              </div>
              <div className="compliance-check">
                <h4>Compliance Retention Check</h4>
                <div className="compliance-item">
                  <input type="checkbox" id="retention-check" />
                  <label htmlFor="retention-check">
                    I confirm that this client's data retention period has expired and deletion is compliant with regulations.
                  </label>
                </div>
                <div className="compliance-item">
                  <input type="checkbox" id="backup-check" />
                  <label htmlFor="backup-check">
                    I confirm that all necessary data has been backed up before deletion.
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={handleCloseModals}
                disabled={isDeletingClient}
              >
                Cancel
              </button>
              <button 
                className={`btn-danger ${isDeletingClient ? 'loading' : ''}`}
                onClick={handleConfirmDeleteClient}
                disabled={isDeletingClient}
              >
                {isDeletingClient ? (
                  <>
                    <div className="spinner"></div>
                    {deleteMessage}
                  </>
                ) : (
                  'Delete Permanently'
                )}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Bulk Export Modal */}
      {showBulkExportModal && (
        <div className="modal-overlay" onClick={handleCloseModals}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Export Client Data</h2>
              <button className="close-button" onClick={handleCloseModals}>×</button>
            </div>
            <div className="modal-body">
              <div className="export-options">
                <h3>Choose Export Format</h3>
                <p>Export all client data ({allClients.length} clients) in your preferred format:</p>
                
                <div className="export-format-buttons">
                  <button 
                    className={`export-format-btn ${isExporting ? 'disabled' : ''}`}
                    onClick={exportToCSV}
                    disabled={isExporting}
                  >
                    <div className="format-icon">📊</div>
                    <div className="format-info">
                      <h4>CSV Format</h4>
                      <p>Comma Separated Values<br/>Best for Excel, Google Sheets</p>
                    </div>
                  </button>
                  
                  <button 
                    className={`export-format-btn ${isExporting ? 'disabled' : ''}`}
                    onClick={exportToExcel}
                    disabled={isExporting}
                  >
                    <div className="format-icon">📈</div>
                    <div className="format-info">
                      <h4>Excel Format</h4>
                      <p>Microsoft Excel (.xlsx)<br/>Native Excel compatibility</p>
                    </div>
                  </button>
                  
                  <button 
                    className={`export-format-btn ${isExporting ? 'disabled' : ''}`}
                    onClick={exportToPDF}
                    disabled={isExporting}
                  >
                    <div className="format-icon">📄</div>
                    <div className="format-info">
                      <h4>PDF Report</h4>
                      <p>Professional PDF document<br/>Perfect for presentations</p>
                    </div>
                  </button>
                </div>
                
                {isExporting && (
                  <div className="export-progress">
                    <div className="spinner"></div>
                    <p>{exportMessage}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={handleCloseModals}
                disabled={isExporting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
