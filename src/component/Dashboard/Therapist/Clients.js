import React, { useEffect, useState, useRef } from 'react';
import { auth, db, storage } from '../../Auth/firebaseConfig';
import { collection, onSnapshot, addDoc, serverTimestamp, orderBy, query, doc, getDoc, getDocs, where, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
  Phone
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
            <h3>Session Information</h3>
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
            <h3>Client Presentation</h3>
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
            <h3>Session Details</h3>
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
            <h3>Progress Tracking</h3>
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
            <h3>Plan / Next Steps</h3>
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

export default function TherapistClients() {
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
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'table'
  const [expandedClient, setExpandedClient] = useState(null); // Track which client row is expanded
  const [searchTerm, setSearchTerm] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [therapyNotes, setTherapyNotes] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const currentUser = auth.currentUser;

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
            
            // Priority: auth.name > email > gender+age
            if (authData.name) {
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
      setClients(clientsData);
    });

    return () => {
      clientsUnsub();
    };
  }, []);

  // Auto-select first client when clients are loaded
  useEffect(() => {
    if (clients.length > 0 && !selectedClient) {
      const firstClient = clients[0];
      console.log('Auto-selecting first client:', firstClient);
      handleClientSelect(firstClient);
    }
  }, [clients, selectedClient]);

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
        status: 'sent'
      }));
      setMessages(messagesData);
    });

    return () => {
      messagesUnsub();
    };
  }, [selectedClient]);

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
  
  const fetchTherapyNotes = async (clientId) => {
    try {
      const notesRef = collection(db, 'clients', clientId, 'therapyNotes');
      const notesSnapshot = await getDocs(notesRef);
      const notes = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTherapyNotes(notes);
    } catch (error) {
      console.error('Error fetching therapy notes:', error);
      setTherapyNotes([]);
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
        read: false
      };

      const chatPath = getChatPath(selectedClient);
      const messagesCol = collection(db, chatPath);
      await addDoc(messagesCol, messageData);
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
            <div className="message-text">{message.content}</div>
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
          
          <div className="message-time">{formatTime(message.createdAt)}</div>
        </div>
      </div>
    );
  };

  const filteredClients = clients.filter(client =>
    (client.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (client.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="therapist-clients-container">
      {/* Tab Navigation */}
      <div className="clients-tabs">
        <button 
          className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={20} />
          Client Chat
        </button>
        <button 
          className={`tab ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          <Users size={20} />
          Clients Table
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
              {filteredClients.map((client) => (
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
              ))}
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
                image.png
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
      ) : (
        /* Clients Table */
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
                            onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
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
                                  {therapyNotes.length === 0 ? (
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
      )}
      
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
    </div>
  );
}
