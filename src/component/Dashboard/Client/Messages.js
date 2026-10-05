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
import { auth, db, storage } from '../../../services/firestoreShim';
import VoiceNote from '../../Common/VoiceNote';
import { mediaUrlOf, fileNameOf, fileSizeOf } from '../../../utils/chatMedia';
import { downloadFile } from '../../../utils/downloadFile';
import ChatImage from '../../Common/ChatImage';
import { fetchAssignedTherapist } from '../../../utils/clientTherapistAssignment';
import { collection, onSnapshot, addDoc, serverTimestamp, orderBy, query, doc, getDoc, setDoc } from '../../../services/firestoreShim';
import { ref, uploadBytes, getDownloadURL } from '../../../services/firestoreShim';
import { 
  Search, 
  Mic, 
  Send, 
  Paperclip, 
  Smile,
  Download
} from 'lucide-react';
import './Messages.css';
import { resolveFileUrl } from '../../../utils/fileUrl';
import ClinicianStatus, { clinicianStatusOf } from '../../Common/ClinicianStatus';

// Render a presence timestamp (Firestore Timestamp, ISO string, millis, or Date)
// the WhatsApp way: "Online" / "Last seen Xm ago".
function fmtLastSeen(ts) {
  let d = null;
  if (ts?.toDate) d = ts.toDate();
  else if (typeof ts === 'string') d = new Date(ts);
  else if (typeof ts === 'number') d = new Date(ts);
  else if (ts instanceof Date) d = ts;
  if (!d || isNaN(d.getTime())) return 'Offline';
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Online';
  if (diff < 3600000) return `Last seen ${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `Last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `Last seen ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

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
  const [peerPresence, setPeerPresence] = useState(null); // { online, lastSeen }
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const presenceUnsubRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  // ── Own presence: heartbeat every 25s while the tab is open (keeps the
  // backend's 40s "online" window alive), offline on unmount/unload ──
  useEffect(() => {
    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (!uid) return;
    const presenceRef = doc(db, 'userPresence', uid);
    const beat = () => setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() }, { merge: true });
    beat();
    const hb = setInterval(beat, 25000);
    const handleUnload = () => setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true });
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(hb);
      window.removeEventListener('beforeunload', handleUnload);
      setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true });
    };
  }, [currentUser]);

  // ── Subscribe to the assigned therapist's presence ──
  useEffect(() => {
    presenceUnsubRef.current?.();
    setPeerPresence(null);
    const peerId = assignedTherapist?.id;
    if (!peerId) return;
    presenceUnsubRef.current = onSnapshot(doc(db, 'userPresence', peerId), snap => {
      setPeerPresence(snap.exists() ? snap.data() : null);
    });
    return () => presenceUnsubRef.current?.();
  }, [assignedTherapist]);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;

    const clientId = resolveClientId();
    if (!clientId) return;

    // Who is this client's therapist?
    //
    // `assignedTherapistId` on the client doc is a Firestore-era field the REST
    // backend never writes — choosing a therapist records a row in
    // therapist_client_assignments_v2 instead. Reading only that field left this
    // screen showing "No Therapist Assigned" to a client who has one, so the chat
    // was unreachable. Try the legacy field first, then the real record.
    const loadAssignedTherapist = async () => {
      try {
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        const legacyId = clientDoc.exists()
          ? (clientDoc.data().assignedTherapistId || clientDoc.data().assignedTherapist)
          : null;
        if (legacyId) {
          const therapistDoc = await getDoc(doc(db, 'therapists', legacyId));
          if (therapistDoc.exists()) {
            setAssignedTherapist({ id: therapistDoc.id, ...therapistDoc.data() });
            return;
          }
        }
        const assigned = await fetchAssignedTherapist(clientId);
        if (assigned) setAssignedTherapist(assigned);
      } catch (error) {
        console.error('Error fetching assigned therapist:', error);
      }
    };

    loadAssignedTherapist();
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

  // The client's own id. `th.clientId` is a leftover from the Firestore era: it can
  // be missing, or hold a stale throwaway value from the intake questionnaire. Used
  // unguarded it produced paths like `client_chats/null/messages`, so the thread
  // never resolved and the conversation looked empty in both directions.
  // In the REST model the client id IS the signed-in user id.
  const resolveClientId = () => {
    const uid = auth.currentUser?.uid;
    // The USER id wins, which is what the comment above always said but the
    // code did not do. `th.clientId` holds the client_profiles_v2 ROW id — a
    // different uuid from the user id — and chat threads are keyed by user id
    // (chat_threads.participant_a/b are foreign keys to users). Preferring the
    // stored value meant the thread lookup matched nothing, so the client saw
    // an empty conversation while the therapist could read every message they
    // had sent. Same defect as the mobile screen.
    if (uid) return uid;
    const stored = localStorage.getItem('th.clientId');
    return stored && !String(stored).startsWith('tmp_') ? stored : null;
  };

  const getChatPath = () => `client_chats/${resolveClientId()}/messages`;

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
      // addDoc resolves to a doc REFERENCE ({id}), never a snapshot — calling
      // .data() on it threw "docRef.data is not a function" and crashed the
      // screen the moment a message was sent. The server timestamp arrives with
      // the next poll; until then show the local send time.
      if (docRef?._failed) throw new Error(docRef._error || 'Message failed to send');

      // Swap the optimistic message for the saved one.
      setMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? { ...msg, id: docRef?.id || msg.id, status: 'sent', createdAt: new Date() }
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
      const clientId = resolveClientId();
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
              <img src={resolveFileUrl(assignedTherapist.photoURL)} alt={assignedTherapist.name} />
            ) : (
              <div className="avatar-placeholder">{assignedTherapist?.name?.charAt(0) || 'T'}</div>
            )}
          </div>
        )}
        
        <div className="message-content">
          {message.type === 'text' && (
            <div className="message-text">
              {typeof message.content === 'string' ? message.content : message.text}
            </div>
          )}
          
          {message.type === 'image' && (
            <div className="message-image">
              <ChatImage src={mediaUrlOf(message)} name={fileNameOf(message)} />
              {message.content?.name && (
                <div className="image-filename">{message.content?.name}</div>
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
                <source src={mediaUrlOf(message)} type={message.content?.type} />
                Your browser does not support the video element.
              </video>
              {message.content?.name && (
                <div className="video-filename">{message.content?.name}</div>
              )}
            </div>
          )}
          
          {(message.type === 'document' || message.type === 'file') && (
            // Was a plain icon + name with no way to open or save it. Both sides
            // now get a real link: it opens in a new tab (so the sender can view
            // what they sent) and carries `download` so the receiver can save it.
            <a
              className="message-document"
              href={mediaUrlOf(message)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Download ${fileNameOf(message)}`}
              onClick={(e) => {
                // `download` is ignored cross-origin, so the plain link did
                // nothing. Fetch the bytes and save them instead.
                e.preventDefault();
                downloadFile(mediaUrlOf(message), fileNameOf(message));
              }}
            >
              <Download size={20} className="file-lead-icon" />
              <span className="file-name">{fileNameOf(message)}</span>
              {fileSizeOf(message) && (
                <small className="file-size">{fileSizeOf(message)}</small>
              )}
            </a>
          )}
          
          {message.type === 'audio' && (
            <VoiceNote
              src={mediaUrlOf(message)}
              mimeType={message.content?.type}
              duration={message.content?.duration}
              isOwn={isOwnMessage}
            />
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
              <img src={resolveFileUrl(assignedTherapist.photoURL)} alt={assignedTherapist.name} />
            ) : (
              <div className="avatar-placeholder">{assignedTherapist.name.charAt(0)}</div>
            )}
          </div>
          <div className="chat-details">
            <h3 className="chat-name">{assignedTherapist.name}</h3>
            {(() => {
              const isOnline = peerPresence?.online === true;
              const label = peerPresence ? (isOnline ? 'Online' : fmtLastSeen(peerPresence.lastSeen)) : (assignedTherapist.type || 'Therapist');
              // #166534 / #5b6170: the previous #16a34a and #94a3b8 measured
              // 3.30:1 and 2.56:1 on this white header — both well under the
              // 4.5:1 floor, and the last-seen line was the least readable text
              // on the screen. These are 7.13:1 and 6.20:1.
              return (
                <p className="chat-role" style={{ color: isOnline ? '#166534' : '#5b6170', fontWeight: 600 }}>
                  {isOnline ? '● Online' : label}
                </p>
              );
            })()}
            {/* Live presence answers "are they at their desk"; this answers
                "are they taking work", which only they can say. Shown only when
                they have actively marked themselves unavailable — repeating
                "Available" beside a live Online dot would add noise, and could
                contradict it. */}
            {clinicianStatusOf(assignedTherapist) && clinicianStatusOf(assignedTherapist) !== 'available' ? (
              <ClinicianStatus status={assignedTherapist} />
            ) : null}
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


