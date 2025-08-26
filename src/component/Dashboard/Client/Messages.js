// import React from 'react';

// export default function ClientMessages() {
//   return (
//     <div className="dashboard-page">
//       <h1 className="page-title">Messages</h1>
//       <p className="subtitle">Chat with your therapist</p>
      
//       <div className="messages-container">
//         <div className="chat-placeholder">
//           <div className="chat-icon">💬</div>
//           <h3>Start a conversation</h3>
//           <p>Your messages with your therapist will appear here</p>
//           <button className="btn primary">Send Message</button>
//         </div>
//       </div>
//     </div>
//   );
// }


import React, { useEffect, useState, useRef } from 'react';
import { auth, db, storage } from '../../Auth/firebaseConfig';
import { collection, onSnapshot, addDoc, serverTimestamp, orderBy, query, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Search, 
  Mic, 
  Send, 
  Paperclip, 
  Smile,
  FileText
} from 'lucide-react';
import './Messages.css';

export default function ClientMessages() {
  const [assignedTherapist, setAssignedTherapist] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;

    // Get client ID from localStorage
    const clientId = localStorage.getItem('th.clientId');
    if (!clientId) return;

    // Fetch assigned therapist for this client
    const fetchAssignedTherapist = async () => {
      try {
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        if (clientDoc.exists()) {
          const clientData = clientDoc.data();
          if (clientData.assignedTherapistId) {
            // Fetch therapist details
            const therapistDoc = await getDoc(doc(db, 'therapists', clientData.assignedTherapistId));
            if (therapistDoc.exists()) {
              setAssignedTherapist({ id: therapistDoc.id, ...therapistDoc.data() });
            }
          }
        }
      } catch (error) {
        console.error('Error fetching assigned therapist:', error);
      }
    };

    fetchAssignedTherapist();
  }, []);

  useEffect(() => {
    if (!assignedTherapist) return;

    // Fetch messages for assigned therapist
    const chatPath = getChatPath(assignedTherapist);
    const messagesCol = collection(db, chatPath);
    const q = query(messagesCol, orderBy('createdAt', 'asc'));
    
    const messagesUnsub = onSnapshot(q, (snap) => {
      console.log('Raw Firestore messages:', snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      const messagesData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        status: 'sent' // Mark Firestore messages as sent
      }));
      
      console.log('Processed messages:', messagesData);
      
      // Keep failed messages and add new ones from Firestore
      setMessages(prev => {
        const failedMessages = prev.filter(msg => msg.status === 'failed');
        return [...failedMessages, ...messagesData];
      });
    });

    return () => {
      messagesUnsub();
    };
  }, [assignedTherapist]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getChatPath = (therapist) => {
    const clientId = localStorage.getItem('th.clientId');
    console.log('Client ID from localStorage:', clientId);
    console.log('Therapist ID:', therapist?.id);
    // Use the actual Firestore structure that exists
    const path = `client_chats/${clientId}/messages`;
    console.log('Chat path:', path);
    return path;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (content, type = 'text') => {
    if (!assignedTherapist || (!content && type === 'text')) return;

    // Create a temporary message ID for optimistic updates
    const tempId = `temp_${Date.now()}`;
    const tempMessage = {
      id: tempId,
      content,
      type,
      from: currentUser.uid,
      fromName: currentUser.displayName || 'Client',
      to: assignedTherapist.id,
      toName: assignedTherapist.name,
      createdAt: new Date(),
      read: false,
      status: 'sending'
    };

    // Add temporary message to UI immediately
    setMessages(prev => [...prev, tempMessage]);

    try {
      const messageData = {
        content,
        type,
        from: currentUser.uid,
        fromName: currentUser.displayName || 'Client',
        to: assignedTherapist.id,
        toName: assignedTherapist.name,
        createdAt: serverTimestamp(),
        read: false
      };

      const chatPath = getChatPath(assignedTherapist);
      const messagesCol = collection(db, chatPath);
      const docRef = await addDoc(messagesCol, messageData);
      
      // Update the temporary message with the real one
      setMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? { ...msg, id: docRef.id, status: 'sent', createdAt: docRef.data()?.createdAt || new Date() }
          : msg
      ));
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Mark message as failed but keep it in the UI
      setMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? { ...msg, status: 'failed', error: error.message }
          : msg
      ));
      
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

    // Check file type
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/ogg',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      alert('File type not supported. Please use images, videos, PDFs, Word documents, or text files.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Upload file to Firebase Storage
      const clientId = localStorage.getItem('th.clientId');
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.name}`;
      const storageRef = ref(storage, `chat-files/${clientId}/${fileName}`);
      
      // Simulate progress (Firebase Storage doesn't provide real-time progress)
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
        url: downloadURL, // Use Firebase Storage URL instead of base64
        size: file.size,
        type: file.type,
        storagePath: storageRef.fullPath // Store reference to storage path
      }, fileType);
      
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(`Failed to upload file: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset file input
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
    const isOwnMessage = message.from === currentUser?.uid;
    
    // Debug logging
    console.log('Message:', message);
    console.log('Current user UID:', currentUser?.uid);
    console.log('Message from:', message.from);
    console.log('Is own message:', isOwnMessage);
    
    const retryMessage = () => {
      if (message.status === 'failed') {
        // Remove the failed message and retry
        setMessages(prev => prev.filter(msg => msg.id !== message.id));
        sendMessage(message.content, message.type);
      }
    };
    
    return (
      <div key={message.id} className={`message ${isOwnMessage ? 'sent' : 'received'}`}>
        {!isOwnMessage && (
          <div className="message-avatar">
            {assignedTherapist?.photoURL ? (
              <img src={assignedTherapist.photoURL} alt={assignedTherapist.name} />
            ) : (
              <div className="avatar-placeholder">{assignedTherapist?.name?.charAt(0) || 'T'}</div>
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
          
          <div className="message-footer">
            <div className="message-time">{formatTime(message.createdAt)}</div>
            {isOwnMessage && (
              <div className="message-status">
                {message.status === 'sending' && <span className="status-sending">⏳</span>}
                {message.status === 'sent' && <span className="status-sent">✓</span>}
                {message.status === 'failed' && (
                  <button 
                    className="status-failed" 
                    onClick={retryMessage}
                    title="Click to retry"
                  >
                    ⚠️
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!assignedTherapist) {
    return (
      <div className="client-messaging-container">
        <div className="no-therapist-assigned">
          <div className="no-therapist-icon">👥</div>
          <h3>No Therapist Assigned</h3>
          <p>You haven't been assigned a therapist yet. Please complete the questionnaire and select a therapist first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="client-messaging-container">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-user-info">
          <div className="chat-avatar">
            {assignedTherapist.photoURL ? (
              <img src={assignedTherapist.photoURL} alt={assignedTherapist.name} />
            ) : (
              <div className="avatar-placeholder">{assignedTherapist.name.charAt(0)}</div>
            )}
          </div>
          <div className="chat-details">
            <h3 className="chat-name">{assignedTherapist.name}</h3>
            <p className="chat-role">{assignedTherapist.type || 'Therapist'}</p>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-icon">💬</div>
            <h3>Start a conversation</h3>
            <p>Send the first message to begin chatting with {assignedTherapist.name}</p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="chat-input">
        <form onSubmit={handleSendText} className="message-form">
          <button
            type="button"
            className="attachment-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title={isUploading ? `Uploading... ${uploadProgress}%` : "Attach file (Images, Videos, PDFs, Word docs, Text files - Max 10MB)"}
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
          <div className="emoji-picker">
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
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}


