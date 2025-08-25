import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import './ChatModal.css';

export default function ChatModal({ target, type, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const currentUser = auth.currentUser;

  // Determine collection path based on chat type
  const getCollectionPath = () => {
    if (type === 'therapist') {
      // Therapist-to-therapist chat - create a consistent path for both users
      const sortedUids = [currentUser.uid, target.uid].sort();
      return `therapist_chats/${sortedUids[0]}_${sortedUids[1]}/messages`;
    } else {
      // Therapist-to-client chat
      return `client_chats/${target.id}/messages`;
    }
  };

  useEffect(() => {
    if (!target) return;

    const messagesCol = collection(db, getCollectionPath());
    const q = query(messagesCol, orderBy('createdAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const messagesData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(messagesData);
    });

    return unsubscribe;
  }, [target, type]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !target) return;

    setLoading(true);
    try {
      const messageData = {
        text: newMessage.trim(),
        from: currentUser.uid,
        fromName: currentUser.displayName || 'Therapist',
        fromType: 'therapist',
        to: type === 'therapist' ? target.uid : target.id,
        toName: target.name || 'Client',
        toType: type === 'therapist' ? 'therapist' : 'client',
        createdAt: serverTimestamp(),
        chatType: type
      };

      const messagesCol = collection(db, getCollectionPath());
      await addDoc(messagesCol, messageData);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="close-button" onClick={onClose}>×</button>
          <div className="chat-header-info">
            <div className="chat-avatar">
              {target.photoURL ? (
                <img src={target.photoURL} alt={target.name} />
              ) : (
                <div className="avatar-placeholder">
                  {type === 'therapist' ? '🧑‍⚕️' : '👤'}
                </div>
              )}
            </div>
            <div>
              <h2>{target.name || (type === 'therapist' ? 'Colleague' : 'Client')}</h2>
              <p>{type === 'therapist' ? 'Professional Chat' : 'Client Communication'}</p>
            </div>
          </div>
        </div>

        <div className="chat-body">
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="empty-icon">💬</div>
                <h3>Start a conversation</h3>
                <p>Send the first message to begin chatting</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.from === currentUser.uid ? 'sent' : 'received'}`}
                >
                  <div className="message-content">
                    <div className="message-text">{message.text}</div>
                    <div className="message-time">{formatTime(message.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="chat-footer">
          <form onSubmit={sendMessage} className="message-form">
            <input
              type="text"
              className="message-input"
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="send-button"
              disabled={!newMessage.trim() || loading}
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
