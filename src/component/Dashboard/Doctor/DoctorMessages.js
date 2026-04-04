import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Search } from 'lucide-react';
import { db } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs, addDoc, getDoc, doc, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

function getInitials(name) {
  if (!name) return 'P';
  const parts = name.trim().split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

export default function DoctorMessages({ profile }) {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [activePatient, setActivePatient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  useEffect(() => {
    if (profile?.id) loadPatients();
  }, [profile]);

  // Real-time messages when active patient changes
  useEffect(() => {
    if (!activePatient || !profile?.id) return;
    const chatId = [profile.id, activePatient.id].sort().join('_');
    const q = query(collection(db, 'doctor_chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [activePatient, profile]);

  const loadPatients = async () => {
    try {
      // Load patients from all appointments — not just confirmed subcollection
      const q = query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id));
      const snap = await getDocs(q);
      const appts = snap.docs.map(d => d.data());

      // Deduplicate patients by clientId
      const seen = new Set();
      const raw = [];
      for (const a of appts) {
        if (a.clientId && !seen.has(a.clientId)) {
          seen.add(a.clientId);
          raw.push({
            id: a.clientId,
            name: a.clientName || '',
            email: a.clientEmail || '',
            lastApptDate: a.date || '',
            status: a.status || 'pending',
          });
        }
      }
      // Enrich names for patients with missing/generic names
      const list = await Promise.all(raw.map(async (p) => {
        if (!p.name || p.name === 'Patient') {
          try {
            const authSnap = await getDoc(doc(db, 'auth', p.id));
            if (authSnap.exists()) {
              const d = authSnap.data();
              return { ...p, name: d.name || d.displayName || p.name || 'Patient' };
            }
          } catch (_) {}
          return { ...p, name: p.name || 'Patient' };
        }
        return p;
      }));
      // Sort by most recent appointment date
      list.sort((a, b) => b.lastApptDate.localeCompare(a.lastApptDate));
      setPatients(list);
    } catch (err) {
      console.error('Error loading patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activePatient) return;
    const chatId = [profile.id, activePatient.id].sort().join('_');
    try {
      await addDoc(collection(db, 'doctor_chats', chatId, 'messages'), {
        text: newMessage.trim(),
        from: profile.id,
        fromName: `Dr. ${profile.name || 'Doctor'}`,
        to: activePatient.id,
        toName: activePatient.name,
        timestamp: serverTimestamp(),
        type: 'text',
      });
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const filteredPatients = patients.filter(p => {
    if (!search) return true;
    return (p.name || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Messages</h1>
        <p>Communicate securely with your patients</p>
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', height: 'calc(100vh - 240px)', minHeight: 450 }}>
        {/* Patient list */}
        <div className="doctor-card" style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', marginBottom: 0, padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>Patients ({patients.length})</h3>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '0.4rem 0.75rem', marginBottom: '0.75rem' }}>
            <Search size={14} color="#94a3b8" />
            <input
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8rem', flex: 1, color: '#334155' }}
              placeholder="Search patients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem', fontSize: '0.85rem' }}>Loading...</p>
            ) : filteredPatients.length === 0 ? (
              <div className="doctor-empty-state" style={{ padding: '1.5rem' }}>
                <MessageSquare size={28} />
                <p style={{ fontSize: '0.85rem' }}>{search ? 'No patients found' : 'No patients yet'}</p>
              </div>
            ) : filteredPatients.map(p => (
              <div
                key={p.id}
                onClick={() => { setActivePatient(p); setMessages([]); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.65rem',
                  padding: '0.65rem', borderRadius: 10, cursor: 'pointer',
                  background: activePatient?.id === p.id ? '#e8f1fb' : 'transparent',
                  border: activePatient?.id === p.id ? '1.5px solid #bfdbfe' : '1.5px solid transparent',
                  transition: 'all 0.15s', marginBottom: '0.2rem',
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: activePatient?.id === p.id ? '#1e6bb8' : '#e8f1fb',
                  color: activePatient?.id === p.id ? 'white' : '#1e6bb8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                }}>
                  {getInitials(p.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </p>
                  {p.lastApptDate && (
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>Last: {p.lastApptDate}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="doctor-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
          {!activePatient ? (
            <div className="doctor-empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <MessageSquare size={48} />
              <h3>Select a patient</h3>
              <p>Choose a patient from the list to start or continue a conversation</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0.75rem', flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1e6bb8', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                  {getInitials(activePatient.name)}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{activePatient.name}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>Patient • Secure channel</p>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0', display: 'flex', flexDirection: 'column' }}>
                {messages.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', margin: 'auto', fontSize: '0.875rem' }}>
                    No messages yet. Start the conversation.
                  </p>
                ) : messages.map(msg => {
                  const isOwn = msg.from === profile.id;
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: '0.5rem' }}>
                      {!isOwn && (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f1fb', color: '#1e6bb8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, marginRight: '0.4rem', flexShrink: 0, alignSelf: 'flex-end' }}>
                          {getInitials(activePatient.name)}
                        </div>
                      )}
                      <div style={{
                        maxWidth: '70%', padding: '0.65rem 1rem', borderRadius: 14,
                        background: isOwn ? '#1e6bb8' : '#f1f5f9',
                        color: isOwn ? 'white' : '#1e293b',
                        borderBottomRightRadius: isOwn ? 4 : 14,
                        borderBottomLeftRadius: isOwn ? 14 : 4,
                      }}>
                        <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.45 }}>{msg.text}</p>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.65rem', opacity: 0.7, textAlign: 'right' }}>
                          {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
                <input
                  className="doctor-form-input"
                  placeholder={`Message ${activePatient.name}…`}
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  style={{ flex: 1 }}
                />
                <button className="doctor-btn doctor-btn-primary" onClick={sendMessage} disabled={!newMessage.trim()} style={{ opacity: newMessage.trim() ? 1 : 0.5 }}>
                  <Send size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
