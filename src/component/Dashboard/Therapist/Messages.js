import React, { useEffect, useState, useRef } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import { collection, onSnapshot, addDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { 
  MoreVertical, 
  Mic, 
  Send, 
  Paperclip, 
  Smile,
  FileText
} from 'lucide-react';
import UserModal from './UserModal';
import './Messages.css';

export default function TherapistMessages() {
  const [therapists, setTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUserForModal, setSelectedUserForModal] = useState(null);
  const [modalMode, setModalMode] = useState(''); // 'view' or 'manage'
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;

    // Fetch all therapists
    const therapistsCol = collection(db, 'therapists');
    const therapistsUnsub = onSnapshot(therapistsCol, (snap) => {
      const therapistsData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Filter out current user and sort by name
      const filteredTherapists = therapistsData
        .filter(t => t.uid !== u.uid)
        .sort((a, b) => a.name.localeCompare(b.name));
      setTherapists(filteredTherapists);
      
      // Don't auto-select any therapist - let user choose
    });

    return () => {
      therapistsUnsub();
    };
  }, []);

  useEffect(() => {
    if (!selectedTherapist) return;

    // Fetch messages for selected therapist
    const chatPath = getChatPath(selectedTherapist);
    const messagesCol = collection(db, chatPath);
    const q = query(messagesCol, orderBy('createdAt', 'asc'));
    
    const messagesUnsub = onSnapshot(q, (snap) => {
      const messagesData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(messagesData);
    });

    return () => {
      messagesUnsub();
    };
  }, [selectedTherapist, currentUser?.uid]);

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

  const getChatPath = (therapist) => {
    const sortedUids = [currentUser.uid, therapist.uid].sort();
    return `therapist_chats/${sortedUids[0]}_${sortedUids[1]}/messages`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTherapistSelect = (therapist) => {
    // Only change therapist if selecting a different one
    if (selectedTherapist?.id !== therapist.id) {
      setSelectedTherapist(therapist);
      setMessages([]); // Clear messages only when switching to different therapist
    }
    setDropdownOpen(null); // Close dropdown when selecting therapist
  };

  const toggleDropdown = (therapistId, event) => {
    event.stopPropagation();
    setDropdownOpen(dropdownOpen === therapistId ? null : therapistId);
  };

  const handleManageUser = (therapist) => {
    setSelectedUserForModal(therapist);
    setModalMode('manage');
    setShowUserModal(true);
    setDropdownOpen(null);
  };

  const handleViewProfile = (therapist) => {
    setSelectedUserForModal(therapist);
    setModalMode('view');
    setShowUserModal(true);
    setDropdownOpen(null);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setSelectedUserForModal(null);
    setModalMode('');
  };

  const sendMessage = async (content, type = 'text') => {
    if (!selectedTherapist || (!content && type === 'text')) return;

    try {
      const messageData = {
        content,
        type, // text, image, document, audio
        from: currentUser.uid,
        fromName: currentUser.displayName || 'Therapist',
        to: selectedTherapist.uid,
        toName: selectedTherapist.name,
        createdAt: serverTimestamp(),
        read: false
      };

      const chatPath = getChatPath(selectedTherapist);
      const messagesCol = collection(db, chatPath);
      await addDoc(messagesCol, messageData);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleSendText = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessage(newMessage.trim(), 'text');
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileType = file.type.startsWith('image/') ? 'image' : 'document';
      sendMessage({
        name: file.name,
        url: e.target.result,
        size: file.size,
        type: file.type
      }, fileType);
    };
    reader.readAsDataURL(file);
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

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredTherapists = therapists.filter(therapist =>
    therapist.name.toLowerCase().includes(searchQuery.toLowerCase())
  );



  const renderMessage = (message) => {
    const isOwnMessage = message.from === currentUser.uid;
    
    return (
      <div key={message.id} className={`message ${isOwnMessage ? 'sent' : 'received'}`}>
        {!isOwnMessage && (
          <div className="message-avatar">
            {selectedTherapist?.photoURL ? (
              <img src={selectedTherapist.photoURL} alt={selectedTherapist.name} />
            ) : (
              <div className="avatar-placeholder">{selectedTherapist?.name?.charAt(0) || 'T'}</div>
            )}
          </div>
        )}
        
        <div className="message-content">
          {message.type === 'text' && (
            <div className="message-text">{message.content}</div>
          )}
          
          {message.type === 'image' && (
            <div className="message-image">
              <img src={message.content.url} alt="Shared image" />
            </div>
          )}
          
          {message.type === 'document' && (
            <div className="message-document">
              <FileText size={20} />
              <span>{message.content.name}</span>
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

  return (
    <div className="staff-messaging-container">

      {/* Middle Panel - Conversation List */}
      <div className="conversations-panel">
        <div className="conversations-header">
          <h2>Staff Messages</h2>
          <div className="conversation-tabs">
            <span className="tab active">General {therapists.length}</span>
            <span className="tab">Archive 0</span>
          </div>
        </div>

        <div className="search-container">
          <input
            type="text"
            placeholder="Search staff members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="conversations-list">
          {filteredTherapists.map((therapist) => (
            <div
              key={therapist.id}
              className={`conversation-item ${selectedTherapist?.id === therapist.id ? 'active' : ''}`}
              onClick={() => handleTherapistSelect(therapist)}
            >
              <div className="conversation-avatar">
                {therapist.photoURL ? (
                  <img src={therapist.photoURL} alt={therapist.name} />
                ) : (
                  <div className="avatar-placeholder">{therapist.name.charAt(0)}</div>
                )}
              </div>
              
              <div className="conversation-info">
                <div className="conversation-header">
                  <h4 className="conversation-name">{therapist.name}</h4>
                  <div className="conversation-meta">
                    <span className="conversation-time">Now</span>
                    <button
                      className="more-options-button"
                      onClick={(e) => toggleDropdown(therapist.id, e)}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </div>
                <p className="conversation-preview">Click to start chatting</p>
              </div>

              {/* Dropdown menu */}
              {dropdownOpen === therapist.id && (
                <div className="dropdown-menu" onClick={(e) => e.stopPropagation()}>
                  {currentUser?.uid === 'vnZRxohz5Xg3HFCKqvFMxfVIiI72' ? ( // Check if current user is admin (Vanessa)
                    <button 
                      className="dropdown-item"
                      onClick={() => handleManageUser(therapist)}
                    >
                      Manage User
                    </button>
                  ) : (
                    <button 
                      className="dropdown-item"
                      onClick={() => handleViewProfile(therapist)}
                    >
                      View Profile
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Chat Window */}
      <div className="chat-panel">
        {selectedTherapist ? (
          <>
            <div className="chat-header">
              <div className="chat-user-info">
                <div className="chat-avatar">
                  {selectedTherapist.photoURL ? (
                    <img src={selectedTherapist.photoURL} alt={selectedTherapist.name} />
                  ) : (
                    <div className="avatar-placeholder">{selectedTherapist.name.charAt(0)}</div>
                  )}
                </div>
                <div className="chat-details">
                  <h3 className="chat-name">{selectedTherapist.name}</h3>
                  <p className="chat-role">{selectedTherapist.type}</p>
                </div>
              </div>
              
              <div className="chat-actions">
                <button className="action-button">
                  <MoreVertical size={20} />
                </button>
              </div>
            </div>

            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="empty-chat">
                  <div className="empty-icon">💬</div>
                  <h3>Start a conversation</h3>
                  <p>Send the first message to begin chatting with {selectedTherapist.name}</p>
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
                >
                  <Paperclip size={20} />
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
                  onClick={() => {
                    console.log('Emoji button clicked, current state:', showEmojiPicker);
                    setShowEmojiPicker(!showEmojiPicker);
                  }}
                >
                  <Smile size={20} />
                </button>
                
                {showEmojiPicker && (
                  <div className="emoji-picker" ref={emojiPickerRef}>
                    {console.log('Rendering emoji picker, showEmojiPicker:', showEmojiPicker)}
                    {['😊', '😂', '❤️', '👍', '🎉', '🔥', '😎', '🤔', '😢', '😡', '👋', '💪', '✨', '🌟', '💯', '🙏'].map((emoji) => (
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
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
          </>
        ) : (
          <div className="no-chat-selected">
            <div className="no-chat-icon">💬</div>
            <h3>Select a staff member</h3>
            <p>Choose someone from the list to start chatting</p>
          </div>
        )}

        {/* User Modal */}
        {showUserModal && selectedUserForModal && (
          <UserModal
            user={selectedUserForModal}
            mode={modalMode}
            onClose={closeUserModal}
            isAdmin={currentUser?.uid === 'vnZRxohz5Xg3HFCKqvFMxfVIiI72'}
          />
        )}
      </div>
    </div>
  );
}

