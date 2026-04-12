import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Search, Phone, Video, Mic, MicOff, Paperclip, Download, FileText } from 'lucide-react';
import { db, storage } from '../../Auth/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, getDoc, doc,
  orderBy, onSnapshot, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

function getInitials(name) {
  if (!name) return 'P';
  const parts = name.trim().split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function fmtTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtConvTime(ts) {
  if (!ts?.toDate) return '';
  const d = ts.toDate(), diff = Date.now() - d;
  if (diff < 60000) return 'Just now';
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtLastSeen(ts) {
  if (!ts?.toDate) return 'Offline';
  const d = ts.toDate(), diff = Date.now() - d;
  if (diff < 60000) return 'Online';
  if (diff < 3600000) return `Last seen ${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `Last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `Last seen ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function fmtDuration(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

export default function DoctorMessages({ profile }) {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [activePatient, setActivePatient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastMsgs, setLastMsgs] = useState({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [uploading, setUploading] = useState(false);
  // Presence & read receipts
  const [patientPresence, setPatientPresence] = useState(null);   // { online, lastSeen }
  const [patientLastRead, setPatientLastRead] = useState(null);   // Timestamp patient last opened chat
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const presenceUnsubRef = useRef(null);
  const seenUnsubRef = useRef(null);

  // ── Own presence: set online on mount, offline on unmount ──
  useEffect(() => {
    if (!profile?.id) return;
    const presenceRef = doc(db, 'userPresence', profile.id);
    setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() }, { merge: true });
    const handleUnload = () => setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true });
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true });
    };
  }, [profile]);

  useEffect(() => {
    if (profile?.id) loadPatients();
  }, [profile]);

  // ── Subscribe to messages ──
  useEffect(() => {
    if (!activePatient || !profile?.id) return;
    const chatId = [profile.id, activePatient.id].sort().join('_');
    const q = query(collection(db, 'doctor_chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      if (msgs.length > 0) setLastMsgs(prev => ({ ...prev, [activePatient.id]: msgs[msgs.length - 1] }));
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [activePatient, profile]);

  // ── Subscribe to patient presence + chatSeen when active patient changes ──
  useEffect(() => {
    presenceUnsubRef.current?.();
    seenUnsubRef.current?.();
    if (!activePatient || !profile?.id) return;
    const chatId = [profile.id, activePatient.id].sort().join('_');

    // Track doctor's own "last read" for this chat
    setDoc(doc(db, 'chatSeen', `${chatId}_${profile.id}`), { lastReadAt: serverTimestamp() }, { merge: true });

    // Subscribe to patient presence
    presenceUnsubRef.current = onSnapshot(doc(db, 'userPresence', activePatient.id), snap => {
      setPatientPresence(snap.exists() ? snap.data() : null);
    });

    // Subscribe to patient's last-read timestamp for this chat
    seenUnsubRef.current = onSnapshot(doc(db, 'chatSeen', `${chatId}_${activePatient.id}`), snap => {
      setPatientLastRead(snap.exists() ? snap.data().lastReadAt : null);
    });

    return () => {
      presenceUnsubRef.current?.();
      seenUnsubRef.current?.();
    };
  }, [activePatient, profile]);

  const loadPatients = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id)));
      const seen = new Set(); const raw = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.clientId && !seen.has(data.clientId)) {
          seen.add(data.clientId);
          raw.push({ id: data.clientId, name: data.clientName || '', lastApptDate: data.date || '' });
        }
      }
      const list = await Promise.all(raw.map(async p => {
        if (!p.name || p.name === 'Patient') {
          try {
            const s = await getDoc(doc(db, 'auth', p.id));
            if (s.exists()) return { ...p, name: s.data().name || s.data().displayName || 'Patient' };
          } catch (_) {}
        }
        return p;
      }));
      list.sort((a, b) => b.lastApptDate.localeCompare(a.lastApptDate));
      setPatients(list);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const getChatId = () => activePatient ? [profile.id, activePatient.id].sort().join('_') : null;

  const sendTextMessage = async () => {
    if (!newMessage.trim() || !activePatient) return;
    const text = newMessage.trim(); setNewMessage('');
    await addDoc(collection(db, 'doctor_chats', getChatId(), 'messages'), {
      text, type: 'text', from: profile.id, fromName: `Dr. ${profile.name || 'Doctor'}`,
      to: activePatient.id, toName: activePatient.name, timestamp: serverTimestamp(),
    });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activePatient) return;
    e.target.value = '';
    setUploading(true);
    try {
      const chatId = getChatId();
      const isImage = file.type.startsWith('image/');
      const sRef = storageRef(storage, `chat_files/${chatId}/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      await addDoc(collection(db, 'doctor_chats', chatId, 'messages'), {
        type: isImage ? 'image' : 'file', fileName: file.name, fileSize: file.size, fileUrl: url,
        from: profile.id, fromName: `Dr. ${profile.name || 'Doctor'}`,
        to: activePatient.id, toName: activePatient.name, timestamp: serverTimestamp(),
      });
    } catch (err) { console.error(err); alert('Upload failed.'); }
    finally { setUploading(false); }
  };

  const startRecording = async () => {
    if (!activePatient) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setUploading(true);
        try {
          const chatId = getChatId();
          const sRef = storageRef(storage, `chat_voice/${chatId}/${Date.now()}.webm`);
          await uploadBytes(sRef, blob);
          const url = await getDownloadURL(sRef);
          await addDoc(collection(db, 'doctor_chats', chatId, 'messages'), {
            type: 'audio', fileUrl: url, duration: recordingSecs,
            from: profile.id, fromName: `Dr. ${profile.name || 'Doctor'}`,
            to: activePatient.id, toName: activePatient.name, timestamp: serverTimestamp(),
          });
        } catch (_) {}
        finally { setUploading(false); setRecordingSecs(0); }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true); setRecordingSecs(0);
      timerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    } catch (_) { alert('Microphone access denied.'); }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // ── Message tick status ──
  const getMsgStatus = (msg) => {
    if (msg.from !== profile.id) return null; // only show for own messages
    if (!patientLastRead || !msg.timestamp) return 'sent';       // single grey ✓
    const msgSecs = msg.timestamp?.seconds || 0;
    const readSecs = patientLastRead?.seconds || 0;
    return msgSecs <= readSecs ? 'read' : 'delivered';           // double blue ✓✓ or double grey ✓✓
  };

  const TickIcon = ({ status }) => {
    if (!status) return null;
    if (status === 'sent') return <span style={{ fontSize: '0.63rem', opacity: 0.55 }}>✓</span>;
    if (status === 'delivered') return <span style={{ fontSize: '0.63rem', opacity: 0.55 }}>✓✓</span>;
    return <span style={{ fontSize: '0.63rem', color: '#60a5fa' }}>✓✓</span>; // read = blue
  };

  const isOnline = patientPresence?.online === true;
  const presenceLabel = patientPresence
    ? (isOnline ? 'Online' : fmtLastSeen(patientPresence.lastSeen))
    : 'Offline';

  const filteredPatients = patients.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const renderMessage = (msg, i) => {
    const isOwn = msg.from === profile.id;
    const prev = messages[i - 1];
    const showAvatar = !isOwn && (!prev || prev.from !== msg.from);
    const gapTop = i > 0 && messages[i - 1].from !== msg.from ? '0.65rem' : '0.15rem';
    const status = getMsgStatus(msg);

    return (
      <div key={msg.id} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '0.4rem', marginTop: gapTop }}>
        {!isOwn && (
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f1fb', color: '#1e6bb8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0, opacity: showAvatar ? 1 : 0 }}>
            {getInitials(activePatient?.name)}
          </div>
        )}
        <div style={{ maxWidth: '68%' }}>
          {msg.type === 'text' && (
            <div style={{ padding: '0.6rem 0.95rem', borderRadius: 18, borderBottomRightRadius: isOwn ? 4 : 18, borderBottomLeftRadius: isOwn ? 18 : 4, background: isOwn ? '#2563eb' : 'white', color: isOwn ? 'white' : '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.45, wordBreak: 'break-word' }}>{msg.text}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.63rem', opacity: 0.7 }}>{fmtTime(msg.timestamp)}</span>
                <TickIcon status={status} />
              </div>
            </div>
          )}
          {msg.type === 'image' && (
            <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}>
              <img src={msg.fileUrl} alt={msg.fileName} style={{ display: 'block', maxWidth: 240, maxHeight: 200, objectFit: 'cover' }} />
              <div style={{ background: isOwn ? '#2563eb' : 'white', padding: '0.3rem 0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <a href={msg.fileUrl} download={msg.fileName} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: isOwn ? 'rgba(255,255,255,0.85)' : '#1e6bb8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}><Download size={11} /> Download</a>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: '0.63rem', color: isOwn ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>{fmtTime(msg.timestamp)}</span>
                  <TickIcon status={status} />
                </div>
              </div>
            </div>
          )}
          {msg.type === 'file' && (
            <div style={{ padding: '0.7rem 0.95rem', borderRadius: 14, background: isOwn ? '#2563eb' : 'white', color: isOwn ? 'white' : '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 200 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: isOwn ? 'rgba(255,255,255,0.2)' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} color={isOwn ? 'white' : '#2563eb'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.fileName}</p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', opacity: 0.7 }}>{fmtFileSize(msg.fileSize)}</p>
              </div>
              <a href={msg.fileUrl} download={msg.fileName} target="_blank" rel="noopener noreferrer" style={{ color: isOwn ? 'white' : '#2563eb' }}><Download size={16} /></a>
            </div>
          )}
          {msg.type === 'audio' && (
            <div style={{ padding: '0.6rem 0.95rem', borderRadius: 18, borderBottomRightRadius: isOwn ? 4 : 18, borderBottomLeftRadius: isOwn ? 18 : 4, background: isOwn ? '#2563eb' : 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mic size={14} color={isOwn ? 'rgba(255,255,255,0.9)' : '#2563eb'} />
                <audio controls src={msg.fileUrl} style={{ height: 28, flex: 1, minWidth: 140 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.63rem', color: isOwn ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>{fmtTime(msg.timestamp)}</span>
                <TickIcon status={status} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="doctor-page" style={{ padding: 0, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'white', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Messages</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', borderRadius: 10, padding: '0.45rem 0.85rem' }}>
              <Search size={14} color="#94a3b8" />
              <input style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', flex: 1 }}
                placeholder="Search patients..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.85rem' }}>Loading...</p>
              : filteredPatients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  <MessageSquare size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>{search ? 'No patients found' : 'No patients yet'}</p>
                </div>
              ) : filteredPatients.map(p => {
                const last = lastMsgs[p.id];
                const isActive = activePatient?.id === p.id;
                return (
                  <div key={p.id} onClick={() => { setActivePatient(p); setMessages([]); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', cursor: 'pointer', background: isActive ? '#eff6ff' : 'transparent', borderLeft: `3px solid ${isActive ? '#2563eb' : 'transparent'}`, transition: 'all 0.12s' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: isActive ? '#2563eb' : '#e8f1fb', color: isActive ? 'white' : '#1e6bb8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                        {getInitials(p.name)}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                        {last && <span style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0, marginLeft: 4 }}>{fmtConvTime(last.timestamp)}</span>}
                      </div>
                      <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {last ? (last.from === profile.id ? `You: ${last.type !== 'text' ? `🎤 ${last.type === 'audio' ? 'Voice message' : last.fileName || 'File'}` : last.text}` : (last.type !== 'text' ? `🎤 ${last.type === 'audio' ? 'Voice message' : last.fileName || 'File'}` : last.text)) : 'Tap to start a conversation'}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* ── Chat area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f0f4f8' }}>
          {!activePatient ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', background: 'white' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={28} color="#94a3b8" />
              </div>
              <h3 style={{ margin: 0, color: '#64748b', fontWeight: 700 }}>Select a conversation</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>Choose a patient from the list</p>
            </div>
          ) : (
            <>
              {/* Header with online status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1.25rem', background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.875rem' }}>
                    {getInitials(activePatient.name)}
                  </div>
                  {/* Online dot */}
                  <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: isOnline ? '#22c55e' : '#94a3b8', border: '2px solid white' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{activePatient.name}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: isOnline ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                    {isOnline ? '● Online' : presenceLabel}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[Phone, Video].map((Icon, i) => (
                    <button key={i} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}><Icon size={15} /></button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', margin: 'auto' }}>
                    <div style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 12, padding: '0.6rem 1.25rem', display: 'inline-block', fontSize: '0.82rem', color: '#64748b' }}>No messages yet — start the conversation</div>
                  </div>
                ) : messages.map((msg, i) => renderMessage(msg, i))}
                <div ref={endRef} />
              </div>

              {/* Input bar */}
              <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
                {isRecording && (
                  <div style={{ padding: '0.5rem 1.25rem', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                    <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 600 }}>Recording… {fmtDuration(recordingSecs)}</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 'auto' }}>Release to send</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem' }}>
                  <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
                    <Paperclip size={17} />
                  </button>
                  <input
                    style={{ flex: 1, padding: '0.65rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: 24, fontSize: '0.875rem', outline: 'none', background: '#f8fafc' }}
                    placeholder={uploading ? 'Uploading…' : `Message ${activePatient.name}…`}
                    value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } }}
                    onFocus={e => e.target.style.borderColor = '#2563eb'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    disabled={isRecording}
                  />
                  {newMessage.trim() ? (
                    <button onClick={sendTextMessage}
                      style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Send size={17} />
                    </button>
                  ) : (
                    <button onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}
                      style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: isRecording ? '#ef4444' : '#f1f5f9', color: isRecording ? 'white' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {isRecording ? <MicOff size={17} /> : <Mic size={17} />}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
