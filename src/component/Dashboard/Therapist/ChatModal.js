import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import {
  collection, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, doc, updateDoc, where, getDocs
} from 'firebase/firestore';
import { Send, X, Phone, Video, MoreVertical, Smile, Paperclip, Check, CheckCheck } from 'lucide-react';

export default function ChatModal({ target, type, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const currentUser = auth.currentUser;

  const getCollectionPath = () => {
    if (type === 'therapist') {
      const sortedUids = [currentUser.uid, target.uid].sort();
      return `therapist_chats/${sortedUids[0]}_${sortedUids[1]}/messages`;
    }
    return `client_chats/${target.id}/messages`;
  };

  useEffect(() => {
    if (!target) return;
    const q = query(collection(db, getCollectionPath()), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [target, type]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    const text = newMessage.trim();
    if (!text || !target) return;
    setNewMessage('');
    setLoading(true);
    try {
      await addDoc(collection(db, getCollectionPath()), {
        text,
        content: text,
        from: currentUser.uid,
        fromName: currentUser.displayName || auth.currentUser?.displayName || 'Therapist',
        fromType: 'therapist',
        senderId: currentUser.uid,
        to: type === 'therapist' ? target.uid : target.id,
        toName: target.name || 'Client',
        toType: type === 'therapist' ? 'therapist' : 'client',
        createdAt: serverTimestamp(),
        read: false,
      });
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(text); // restore on error
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Safe text extractor — some Firestore messages store media as objects
  const getMsgText = (msg) => {
    const raw = msg.text || msg.content || msg.message || '';
    if (typeof raw === 'string') return raw || '[empty message]';
    if (raw && typeof raw === 'object') {
      const t = raw.type || '';
      if (t === 'audio' || raw.duration !== undefined) return '🎵 Voice message';
      if (t === 'image') return '📷 Image';
      if (t === 'video') return '🎥 Video';
      if (raw.url) return '📎 Attachment';
    }
    return '';
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateLabel = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const label = formatDateLabel(msg.createdAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(msg);
    return groups;
  }, {});

  const targetName = target?.name || (type === 'therapist' ? 'Colleague' : 'Client');
  const initials = targetName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 560, height: '88vh', maxHeight: 720,
        background: '#fff', borderRadius: 20, display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.22)', overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{
          padding: '0.9rem 1.25rem', background: 'linear-gradient(135deg,#4f46e5,#6366f1)',
          display: 'flex', alignItems: 'center', gap: '0.85rem',
          flexShrink: 0,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1rem',
            flexShrink: 0, border: '2px solid rgba(255,255,255,0.4)',
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {targetName}
            </p>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)' }}>
              {type === 'therapist' ? 'Professional Chat' : 'Client · Active'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Messages area ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '1rem 1.25rem',
          background: '#f4f6fb', display: 'flex', flexDirection: 'column', gap: '0.2rem',
        }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '0.75rem', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '3rem' }}>💬</div>
              <p style={{ margin: 0, fontWeight: 700, color: '#64748b', fontSize: '1rem' }}>No messages yet</p>
              <p style={{ margin: 0, fontSize: '0.82rem', textAlign: 'center' }}>Start the conversation with {targetName}</p>
            </div>
          ) : (
            Object.entries(groupedMessages).map(([dateLabel, dayMsgs]) => (
              <div key={dateLabel}>
                {/* Date divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.85rem 0 0.6rem' }}>
                  <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap', padding: '0.2rem 0.6rem', background: '#e2e8f0', borderRadius: 20 }}>
                    {dateLabel}
                  </span>
                  <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                </div>

                {dayMsgs.map((msg, idx) => {
                  const isMine = msg.from === currentUser.uid || msg.senderId === currentUser.uid;
                  const prevMsg = dayMsgs[idx - 1];
                  const nextMsg = dayMsgs[idx + 1];
                  const isFirst = !prevMsg || (prevMsg.from !== msg.from && prevMsg.senderId !== msg.senderId);
                  const isLast  = !nextMsg || (nextMsg.from !== msg.from && nextMsg.senderId !== msg.senderId);
                  const gap = isFirst ? '0.6rem' : '0.15rem';

                  return (
                    <div key={msg.id} style={{
                      display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start',
                      marginTop: gap,
                    }}>
                      {/* Receiver avatar for received messages */}
                      {!isMine && (
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#818cf8)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: '0.62rem', fontWeight: 700, flexShrink: 0,
                          alignSelf: 'flex-end', marginRight: 6,
                          visibility: isLast ? 'visible' : 'hidden',
                        }}>
                          {(msg.fromName || targetName)[0]?.toUpperCase()}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                        {/* Sender name for group context */}
                        {!isMine && isFirst && (
                          <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, marginBottom: 2, marginLeft: 4 }}>
                            {msg.fromName || targetName}
                          </span>
                        )}

                        <div style={{
                          padding: '0.55rem 0.85rem',
                          background: isMine ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : '#fff',
                          color: isMine ? '#fff' : '#1e293b',
                          borderRadius: isMine
                            ? (isFirst ? '18px 18px 4px 18px' : isLast ? '18px 4px 18px 18px' : '18px 4px 4px 18px')
                            : (isFirst ? '18px 18px 18px 4px' : isLast ? '4px 18px 18px 18px' : '4px 18px 18px 4px'),
                          boxShadow: isMine ? '0 2px 8px rgba(79,70,229,0.25)' : '0 1px 3px rgba(0,0,0,0.06)',
                          border: isMine ? 'none' : '1px solid #e8ecf2',
                          wordBreak: 'break-word',
                          lineHeight: 1.5,
                          fontSize: '0.875rem',
                        }}>
                          {getMsgText(msg)}
                        </div>

                        {/* Timestamp + read receipt */}
                        {isLast && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, paddingRight: isMine ? 2 : 0, paddingLeft: isMine ? 0 : 2 }}>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                              {formatTime(msg.createdAt)}
                            </span>
                            {isMine && (
                              msg.read
                                ? <CheckCheck size={13} color="#4f46e5" />
                                : <Check size={13} color="#94a3b8" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input area ── */}
        <div style={{
          padding: '0.85rem 1rem', borderTop: '1px solid #e8ecf2',
          background: '#fff', flexShrink: 0,
        }}>
          <form onSubmit={sendMessage} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center',
              background: '#f4f6fb', borderRadius: 24, border: '1.5px solid #e2e8f0',
              padding: '0.4rem 0.85rem', gap: '0.5rem',
              transition: 'border-color 0.18s, box-shadow 0.18s',
            }}
              onFocusCapture={e => { e.currentTarget.style.borderColor = '#818cf8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)'; }}
              onBlurCapture={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <textarea
                ref={inputRef}
                value={newMessage}
                onChange={e => { setNewMessage(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${targetName}…`}
                disabled={loading}
                rows={1}
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  fontSize: '0.875rem', fontFamily: 'inherit', color: '#1e293b',
                  resize: 'none', padding: 0, lineHeight: 1.5, maxHeight: 100, overflow: 'auto',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={!newMessage.trim() || loading}
              style={{
                width: 42, height: 42, borderRadius: '50%', border: 'none',
                background: !newMessage.trim() || loading ? '#e2e8f0' : 'linear-gradient(135deg,#4f46e5,#6366f1)',
                color: !newMessage.trim() || loading ? '#94a3b8' : '#fff',
                cursor: !newMessage.trim() || loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.18s',
                boxShadow: !newMessage.trim() || loading ? 'none' : '0 4px 12px rgba(79,70,229,0.35)',
              }}
              onMouseEnter={e => { if (newMessage.trim() && !loading) e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <Send size={17} style={{ marginLeft: 1 }} />
            </button>
          </form>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center' }}>
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
