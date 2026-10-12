import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../services/firestoreShim';
import {
  collection, onSnapshot, addDoc, serverTimestamp, orderBy, query,
  doc, getDoc, getDocs, where, updateDoc, deleteDoc
} from '../../../services/firestoreShim';
import {
  Search, FileText, MessageSquare, Calendar, Clock, Target, TrendingUp,
  BookOpen, CheckCircle, Plus, Users, Mail, Phone, MoreVertical,
  Edit, Eye, UserX, UserCheck, Filter, Download, AlertCircle, X, LogOut
} from 'lucide-react';
import ChatModal from './ChatModal';
import './Clients.css';
import { enrichClientRecord } from '../../../utils/clientTherapyMetrics';
import Paged from '../../Common/Paged';

// ── Therapy Note Modal ──────────────────────────────────────────────────────
function TherapyNoteModal({ client, onClose, onSave }) {
  const [noteData, setNoteData] = useState({
    sessionDate: new Date().toISOString().split('T')[0],
    sessionTime: '',
    sessionNumber: '',
    mood: '',
    behavioralObservations: '',
    sessionFocus: '',
    interventionsUsed: '',
    clientResponse: '',
    progressAssessment: '',
    moodRating: 5,
    homework: '',
    nextSessionFocus: '',
  });
  const [saving, setSaving] = useState(false);

  const moodOptions = ['Anxious','Calm','Sad','Hopeful','Angry','Excited','Neutral','Depressed','Optimistic','Stressed'];
  const progressOptions = ['Significantly Improved','Improved','Slight Improvement','No Change','Slight Decline','Worsened'];
  const interventionOptions = ['CBT','Mindfulness','Role Play','Supportive Listening','Psychoeducation','Exposure Therapy','Solution-Focused','Other'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(noteData); } finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ background:'white', borderRadius:18, width:'100%', maxWidth:680, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1, borderRadius:'18px 18px 0 0' }}>
          <h2 style={{ margin:0, fontSize:'1.1rem', fontWeight:800, color:'#0f172a' }}>
            Session Note — {client.name || client.displayName || 'Client'}
          </h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:4 }}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          {/* Session Info */}
          <section>
            <h3 style={{ margin:'0 0 0.75rem', fontSize:'0.875rem', fontWeight:700, color:'#4f46e5', textTransform:'uppercase', letterSpacing:'0.06em' }}>Session Information</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.85rem' }}>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" required style={inp} value={noteData.sessionDate} onChange={e => setNoteData(p => ({ ...p, sessionDate: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Time</label>
                <input type="time" style={inp} value={noteData.sessionTime} onChange={e => setNoteData(p => ({ ...p, sessionTime: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Session #</label>
                <input type="text" placeholder="e.g. Session 3" style={inp} value={noteData.sessionNumber} onChange={e => setNoteData(p => ({ ...p, sessionNumber: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Mood</label>
                <select required style={inp} value={noteData.mood} onChange={e => setNoteData(p => ({ ...p, mood: e.target.value }))}>
                  <option value="">Select mood…</option>
                  {moodOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Session Details */}
          <section>
            <h3 style={{ margin:'0 0 0.75rem', fontSize:'0.875rem', fontWeight:700, color:'#4f46e5', textTransform:'uppercase', letterSpacing:'0.06em' }}>Session Details</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={lbl}>Session Focus / Issues Discussed</label>
                <textarea required rows={3} style={{...inp, resize:'vertical'}} placeholder="Main topics covered…" value={noteData.sessionFocus} onChange={e => setNoteData(p => ({...p, sessionFocus: e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.85rem' }}>
                <div>
                  <label style={lbl}>Interventions Used</label>
                  <select style={inp} value={noteData.interventionsUsed} onChange={e => setNoteData(p => ({...p, interventionsUsed: e.target.value}))}>
                    <option value="">Select…</option>
                    {interventionOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Progress Assessment</label>
                  <select style={inp} value={noteData.progressAssessment} onChange={e => setNoteData(p => ({...p, progressAssessment: e.target.value}))}>
                    <option value="">Select…</option>
                    {progressOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Client Response</label>
                <textarea rows={2} style={{...inp, resize:'vertical'}} placeholder="How client responded to interventions…" value={noteData.clientResponse} onChange={e => setNoteData(p => ({...p, clientResponse: e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Behavioral Observations</label>
                <textarea rows={2} style={{...inp, resize:'vertical'}} placeholder="Demeanor, body language…" value={noteData.behavioralObservations} onChange={e => setNoteData(p => ({...p, behavioralObservations: e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Mood Rating (1–10): <strong>{noteData.moodRating}</strong></label>
                <input type="range" min={1} max={10} style={{ width:'100%' }} value={noteData.moodRating} onChange={e => setNoteData(p => ({...p, moodRating: Number(e.target.value)}))} />
              </div>
            </div>
          </section>

          {/* Plan */}
          <section>
            <h3 style={{ margin:'0 0 0.75rem', fontSize:'0.875rem', fontWeight:700, color:'#4f46e5', textTransform:'uppercase', letterSpacing:'0.06em' }}>Plan</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.85rem' }}>
              <div>
                <label style={lbl}>Homework / Between-session Tasks</label>
                <textarea rows={2} style={{...inp, resize:'vertical'}} value={noteData.homework} onChange={e => setNoteData(p => ({...p, homework: e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Next Session Focus</label>
                <textarea rows={2} style={{...inp, resize:'vertical'}} value={noteData.nextSessionFocus} onChange={e => setNoteData(p => ({...p, nextSessionFocus: e.target.value}))} />
              </div>
            </div>
          </section>

          <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding:'0.6rem 1.25rem', borderRadius:10, border:'1.5px solid #e2e8f0', background:'white', color:'#475569', fontWeight:600, cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding:'0.6rem 1.5rem', borderRadius:10, background:'#4f46e5', color:'white', fontWeight:700, border:'none', cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const lbl = { display:'block', marginBottom:'0.3rem', fontSize:'0.78rem', fontWeight:600, color:'#475569', letterSpacing:'0.01em' };
const inp = { width:'100%', padding:'0.55rem 0.75rem', borderRadius:9, border:'1.5px solid #e2e8f0', fontSize:'0.875rem', color:'#0f172a', background:'#f8fafc', boxSizing:'border-box', fontFamily:'inherit', outline:'none' };

// ── Client Profile Modal ────────────────────────────────────────────────────
function ClientProfileModal({ client, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ background:'white', borderRadius:18, width:'100%', maxWidth:520, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ margin:0, fontSize:'1.1rem', fontWeight:800, color:'#0f172a' }}>Client Profile</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={20} /></button>
        </div>
        <div style={{ padding:'1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1.5rem' }}>
            <div style={{ width:64, height:64, borderRadius:16, background:'linear-gradient(135deg,#4f46e5,#818cf8)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'1.5rem' }}>
              {(client.name||'C')[0].toUpperCase()}
            </div>
            <div>
              <h3 style={{ margin:0, fontWeight:800, color:'#0f172a', fontSize:'1.1rem' }}>{client.name || client.displayName || 'Client'}</h3>
              <p style={{ margin:0, color:'#64748b', fontSize:'0.82rem' }}>{client.email || ''}</p>
              <span style={{ display:'inline-block', marginTop:4, padding:'0.15rem 0.6rem', borderRadius:20, fontSize:'0.68rem', fontWeight:700, background: client.status === 'active' ? '#dcfce7' : '#f1f5f9', color: client.status === 'active' ? '#16a34a' : '#64748b' }}>
                {client.status || 'active'}
              </span>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.85rem' }}>
            {[
              ['Phone', client.phone || 'Not provided', Phone],
              ['Age', client.age || 'Not provided', Users],
              ['Gender', client.gender || 'Not provided', Users],
              ['Joined', client.createdAt?.toDate ? client.createdAt.toDate().toLocaleDateString() : 'Unknown', Calendar],
              ['Therapy Type', client.therapyType || 'Individual', BookOpen],
              ['Language', client.preferredLanguage || 'English', Globe],
            ].map(([label, value, Icon]) => (
              <div key={label} style={{ background:'#f8fafc', borderRadius:10, padding:'0.85rem', border:'1px solid #f1f5f9' }}>
                <p style={{ margin:'0 0 0.2rem', fontSize:'0.68rem', fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</p>
                <p style={{ margin:0, fontSize:'0.875rem', fontWeight:600, color:'#0f172a' }}>{value}</p>
              </div>
            ))}
          </div>

          {client.mentalHealthHistory && (
            <div style={{ marginTop:'1rem', background:'#fff7ed', borderRadius:12, padding:'1rem', border:'1px solid #fed7aa' }}>
              <p style={{ margin:'0 0 0.3rem', fontWeight:700, fontSize:'0.82rem', color:'#c2410c' }}>Mental Health History</p>
              <p style={{ margin:0, fontSize:'0.82rem', color:'#78350f', lineHeight:1.6 }}>{client.mentalHealthHistory}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Globe({ size }) { return <span style={{ fontSize: size || 16 }}>🌐</span>; }

// ── Main Component ──────────────────────────────────────────────────────────
export default function TherapistClients({ profile }) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(profile?.role === 'admin');
  const [activeTab, setActiveTab] = useState('my'); // 'my' | 'all'
  const [clients, setClients] = useState([]);
  const [allSystemClients, setAllSystemClients] = useState([]);
  const [allTherapists, setAllTherapists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedClient, setSelectedClient] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignClient, setReassignClient] = useState(null);
  const [reassigning, setReassigning] = useState(false);
  const [noteClient, setNoteClient] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [savingNote, setSavingNote] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatClient, setChatClient] = useState(null);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;
    // Check admin from Firestore in case profile wasn't passed
    getDoc(doc(db, 'therapists', currentUser.uid)).then(snap => {
      if (snap.exists() && snap.data().role === 'admin') setIsAdmin(true);
    }).catch(() => {});
    loadClients();
  }, [currentUser]);

  useEffect(() => {
    if (isAdmin) { loadAllSystemClients(); loadAllTherapists(); }
  }, [isAdmin]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = () => setDropdownOpen(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const clientsRef = collection(db, 'therapists', currentUser.uid, 'clients');
      const clientsSnap = await getDocs(clientsRef);
      const clientIds = clientsSnap.docs.map(d => d.data().clientId).filter(Boolean);

      const clientsData = [];
      for (const cid of clientIds) {
        try {
          const clientDoc = await getDoc(doc(db, 'clients', cid));
          if (!clientDoc.exists()) continue;
          const enriched = await enrichClientRecord(cid, { id: cid, ...clientDoc.data() });
          clientsData.push({
            ...enriched,
            status: enriched.status || 'active',
          });
        } catch (e) {
          console.error('Error loading client', cid, e);
        }
      }
      setClients(clientsData);
    } catch (e) {
      console.error('Error loading clients:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllSystemClients = async () => {
    try {
      // Build reverse map: clientId → therapistId by scanning all therapists' subcollections
      const therapistsSnap = await getDocs(collection(db, 'therapists'));
      const clientTherapistMap = {};
      await Promise.all(therapistsSnap.docs.map(async tDoc => {
        try {
          const subSnap = await getDocs(collection(db, 'therapists', tDoc.id, 'clients'));
          subSnap.docs.forEach(d => {
            const cid = d.data().clientId;
            if (cid) clientTherapistMap[cid] = tDoc.id;
          });
        } catch (_) {}
      }));

      const snap = await getDocs(collection(db, 'clients'));
      const base = snap.docs.map((d) => {
        const data = d.data();
        const resolvedTherapistId = data.therapistId || clientTherapistMap[d.id] || null;
        return {
          id: d.id,
          ...data,
          therapistId: resolvedTherapistId,
          status: data.status || 'active',
        };
      });
      const enriched = await Promise.all(
        base.map((c) => enrichClientRecord(c.id, c)),
      );
      setAllSystemClients(enriched);
    } catch (e) { console.error('Load all clients error:', e); }
  };

  const loadAllTherapists = async () => {
    try {
      const snap = await getDocs(collection(db, 'therapists'));
      setAllTherapists(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        name: d.data().name || d.data().displayName || 'Therapist',
      })));
    } catch (e) { console.error('Load therapists error:', e); }
  };

  const handleReassign = async (client, newTherapistId) => {
    if (!client || !newTherapistId) return;
    setReassigning(true);
    try {
      const oldTherapistId = client.therapistId;
      // Remove from old therapist's subcollection
      if (oldTherapistId) {
        try {
          const oldRef = collection(db, 'therapists', oldTherapistId, 'clients');
          const oldSnap = await getDocs(query(oldRef, where('clientId', '==', client.id)));
          for (const d of oldSnap.docs) await deleteDoc(d.ref);
        } catch (_) {}
      }
      // Add to new therapist's subcollection
      await addDoc(collection(db, 'therapists', newTherapistId, 'clients'), {
        clientId: client.id,
        assignedAt: serverTimestamp(),
      });
      // Update client doc
      await updateDoc(doc(db, 'clients', client.id), { therapistId: newTherapistId });
      // Update local state
      setAllSystemClients(prev => prev.map(c => c.id === client.id ? { ...c, therapistId: newTherapistId } : c));
      if (newTherapistId === currentUser.uid) await loadClients();
      setShowReassignModal(false);
      setReassignClient(null);
    } catch (e) {
      console.error('Reassign error:', e);
      alert('Failed to reassign client.');
    } finally {
      setReassigning(false);
    }
  };

  const handleSaveNote = async (noteData) => {
    if (!noteClient) return;
    try {
      // Save to client's therapyNotes subcollection
      await addDoc(collection(db, 'clients', noteClient.id, 'therapyNotes'), {
        ...noteData,
        therapistId: currentUser.uid,
        clientId: noteClient.id,
        clientName: noteClient.name,
        createdAt: serverTimestamp(),
      });
      // Also save to clinicalNotes top-level collection
      await addDoc(collection(db, 'clinicalNotes'), {
        ...noteData,
        therapistId: currentUser.uid,
        clientId: noteClient.id,
        clientName: noteClient.name,
        isDraft: false,
        createdAt: serverTimestamp(),
      });
      setShowNoteModal(false);
      setNoteClient(null);
      // Refresh note counts
      setClients(prev => prev.map(c => c.id === noteClient.id ? { ...c, noteCount: c.noteCount + 1 } : c));
    } catch (e) {
      console.error('Error saving note:', e);
      alert('Failed to save note. Please try again.');
    }
  };

  const handleUpdateStatus = async (clientId, newStatus) => {
    try {
      await updateDoc(doc(db, 'clients', clientId), { status: newStatus });
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c));
      setAllSystemClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c));
    } catch (e) {
      console.error('Error updating status:', e);
    }
  };

  const handleDischarge = async (client) => {
    if (!window.confirm(`Discharge ${client.name}? This will mark them as discharged.`)) return;
    try {
      await updateDoc(doc(db, 'clients', client.id), { status: 'discharged', dischargedAt: serverTimestamp() });
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, status: 'discharged' } : c));
      setAllSystemClients(prev => prev.map(c => c.id === client.id ? { ...c, status: 'discharged' } : c));
      setDropdownOpen(null);
    } catch (e) {
      console.error('Discharge error:', e);
      alert('Failed to discharge client.');
    }
  };

  const formatLastSession = (ts) => {
    if (!ts) return 'No sessions yet';
    const dt = ts.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  };

  const sourceList = activeTab === 'all' ? allSystemClients : clients;
  const filtered = sourceList.filter(c => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (c.name||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q);
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getTherapistName = (therapistId) => {
    if (!therapistId) return 'Unassigned';
    if (therapistId === currentUser.uid) return 'Me';
    const t = allTherapists.find(t => t.id === therapistId);
    return t ? t.name : 'Unknown';
  };

  const statusColor = (s) => ({
    active:     { bg:'#dcfce7', color:'#16a34a' },
    inactive:   { bg:'#f1f5f9', color:'#64748b' },
    on_hold:    { bg:'#fef3c7', color:'#d97706' },
    discharged: { bg:'#fee2e2', color:'#dc2626' },
  }[s] || { bg:'#f1f5f9', color:'#64748b' });

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" style={{ width:40, height:40, borderRadius:'50%', border:'4px solid #e2e8f0', borderTopColor:'#4f46e5', animation:'spin 0.9s linear infinite' }} />
        <p style={{ color:'#64748b' }}>Loading clients…</p>
      </div>
    );
  }

  return (
    <div className="therapist-clients-container">

      {/* ── Admin Tabs ── */}
      {isAdmin && (
        <div style={{ display:'flex', borderBottom:'2px solid #e2e8f0', background:'white', paddingLeft:'2rem' }}>
          {[
            { key:'my',  label:`My Clients (${clients.length})` },
            { key:'all', label:`All Clients (${allSystemClients.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{ padding:'0.85rem 1.25rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.875rem', fontWeight:700, color: activeTab === t.key ? '#4f46e5' : '#64748b', borderBottom: activeTab === t.key ? '2px solid #4f46e5' : '2px solid transparent', marginBottom:'-2px' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ padding:'1.5rem 2rem', borderBottom:'1px solid #e2e8f0', background:'white', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
        <div>
          <h1 style={{ margin:0, fontSize:'1.4rem', fontWeight:800, color:'#0f172a' }}>
            {activeTab === 'all' ? 'All Clients' : 'My Clients'}
          </h1>
          <p style={{ margin:0, fontSize:'0.82rem', color:'#64748b' }}>{filtered.length} total · {filtered.filter(c=>c.status==='active').length} active</p>
        </div>

        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flex:1, maxWidth:520 }}>
          <div style={{ flex:1, position:'relative' }}>
            <Search size={16} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
            <input
              style={{ width:'100%', paddingLeft:34, paddingRight:12, paddingTop:'0.6rem', paddingBottom:'0.6rem', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:'0.875rem', background:'#f8fafc', color:'#0f172a', outline:'none', boxSizing:'border-box' }}
              placeholder="Search clients…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            style={{ padding:'0.6rem 0.85rem', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:'0.875rem', background:'#f8fafc', color:'#475569', cursor:'pointer', outline:'none' }}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
      </div>

      {/* ── Client List ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'1.5rem 2rem' }}>
        {filtered.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4rem', color:'#94a3b8', gap:'1rem' }}>
            <Users size={48} style={{ opacity:0.4 }} />
            <p style={{ margin:0, fontWeight:600 }}>{searchQuery ? 'No clients match your search' : 'No clients assigned yet'}</p>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:'1rem' }}>
            <Paged items={filtered}>{(filtered) => filtered.map(client => {
              const sc = statusColor(client.status);
              return (
                <div key={client.id} style={{ background:'white', borderRadius:14, border:'1.5px solid #e2e8f0', padding:'1.25rem', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', transition:'all 0.18s', cursor:'default', position:'relative' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'}
                >
                  {/* Client Header */}
                  <div style={{ display:'flex', alignItems:'center', gap:'0.85rem', marginBottom:'1rem' }}>
                    <div style={{ width:48, height:48, borderRadius:13, background:'linear-gradient(135deg,#4f46e5,#818cf8)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'1.1rem', flexShrink:0 }}>
                      {(client.name||'?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p
                        onClick={() => navigate(`/dashboard/clients/${client.id}`)}
                        style={{ margin:0, fontWeight:700, color:'#4f46e5', fontSize:'0.95rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', textDecoration:'underline', textDecorationColor:'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.textDecorationColor = '#4f46e5'}
                        onMouseLeave={e => e.currentTarget.style.textDecorationColor = 'transparent'}
                      >{client.name}</p>
                      <p style={{ margin:0, fontSize:'0.72rem', color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{client.email}</p>
                    </div>
                    <span style={{ padding:'0.2rem 0.65rem', borderRadius:20, fontSize:'0.65rem', fontWeight:700, background: sc.bg, color: sc.color, textTransform:'capitalize', flexShrink:0 }}>
                      {client.status}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.5rem', marginBottom:'1rem' }}>
                    {[
                      { label:'Sessions', value: client.sessionCount },
                      { label:'Notes',    value: client.noteCount },
                      { label:'Last Seen', value: formatLastSession(client.lastSession).split(',')[0] || '—' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background:'#f8fafc', borderRadius:10, padding:'0.6rem 0.5rem', textAlign:'center', border:'1px solid #f1f5f9' }}>
                        <p style={{ margin:0, fontWeight:700, fontSize:'0.95rem', color:'#0f172a' }}>{value}</p>
                        <p style={{ margin:0, fontSize:'0.62rem', color:'#94a3b8', fontWeight:500 }}>{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Last session */}
                  <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.9rem' }}>
                    <Clock size={13} color="#94a3b8" />
                    <span style={{ fontSize:'0.72rem', color:'#94a3b8' }}>Last session: {formatLastSession(client.lastSession)}</span>
                  </div>

                  {/* Assigned to (admin all-clients view) */}
                  {activeTab === 'all' && (
                    <div style={{ fontSize:'0.72rem', color:'#64748b', marginBottom:'0.6rem' }}>
                      Assigned to: <span style={{ color:'#4f46e5', fontWeight:600 }}>{getTherapistName(client.therapistId)}</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                    <button
                      onClick={() => navigate(`/dashboard/clients/${client.id}`)}
                      style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'0.5rem', borderRadius:9, border:'1.5px solid #e2e8f0', background:'white', color:'#475569', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}
                    >
                      <Eye size={14} /> View
                    </button>
                    <button
                      onClick={() => { setChatClient(client); setShowChatModal(true); }}
                      style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'0.5rem', borderRadius:9, border:'1.5px solid #10b981', background:'#ecfdf5', color:'#059669', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}
                    >
                      <MessageSquare size={14} /> Chat
                    </button>
                    {activeTab === 'my' && (
                      <button
                        onClick={() => { setNoteClient(client); setShowNoteModal(true); }}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'0.5rem', borderRadius:9, border:'1.5px solid #4f46e5', background:'#eff6ff', color:'#4f46e5', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}
                      >
                        <FileText size={14} /> Note
                      </button>
                    )}
                    {isAdmin && activeTab === 'all' && (
                      <button
                        onClick={() => { setReassignClient(client); setShowReassignModal(true); }}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'0.5rem', borderRadius:9, border:'1.5px solid #f59e0b', background:'#fffbeb', color:'#d97706', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}
                      >
                        <Edit size={14} /> Reassign
                      </button>
                    )}
                    <div style={{ position:'relative' }}>
                      <button
                        onClick={e => { e.stopPropagation(); setDropdownOpen(dropdownOpen === client.id ? null : client.id); }}
                        style={{ padding:'0.5rem 0.65rem', borderRadius:9, border:'1.5px solid #e2e8f0', background:'white', color:'#475569', cursor:'pointer', display:'flex', alignItems:'center' }}
                      >
                        <MoreVertical size={14} />
                      </button>
                      {dropdownOpen === client.id && (
                        <div onClick={e => e.stopPropagation()} style={{ position:'absolute', right:0, top:'calc(100% + 4px)', background:'white', border:'1.5px solid #e2e8f0', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.1)', zIndex:100, minWidth:180, overflow:'hidden' }}>
                          {[
                            { label: 'View Details', icon: Eye, action: () => { navigate(`/dashboard/clients/${client.id}`); setDropdownOpen(null); } },
                            { label: 'Message Client', icon: MessageSquare, action: () => { setChatClient(client); setShowChatModal(true); setDropdownOpen(null); } },
                            { label: client.status === 'active' ? 'Set Inactive' : 'Set Active', icon: client.status === 'active' ? UserX : UserCheck, action: () => { handleUpdateStatus(client.id, client.status === 'active' ? 'inactive' : 'active'); setDropdownOpen(null); } },
                            { label: 'Put On Hold', icon: AlertCircle, action: () => { handleUpdateStatus(client.id, 'on_hold'); setDropdownOpen(null); } },
                            { label: 'Discharge Client', icon: LogOut, action: () => handleDischarge(client), color: '#dc2626' },
                          ].map(({ label, icon: Icon, action, color }) => (
                            <button key={label} onClick={action} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'0.65rem 1rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.82rem', color: color || '#334155', textAlign:'left' }}
                              onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                              onMouseLeave={e => e.currentTarget.style.background='none'}
                            >
                              <Icon size={14} /> {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}</Paged>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showNoteModal && noteClient && (
        <TherapyNoteModal
          client={noteClient}
          onClose={() => { setShowNoteModal(false); setNoteClient(null); }}
          onSave={handleSaveNote}
        />
      )}
      {showProfileModal && selectedClient && (
        <ClientProfileModal
          client={selectedClient}
          onClose={() => { setShowProfileModal(false); setSelectedClient(null); }}
        />
      )}

      {/* ── Chat Modal ── */}
      {showChatModal && chatClient && (
        <ChatModal
          target={chatClient}
          type="client"
          onClose={() => { setShowChatModal(false); setChatClient(null); }}
        />
      )}

      {/* ── Reassign Modal ── */}
      {showReassignModal && reassignClient && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'white', borderRadius:18, width:'100%', maxWidth:480, maxHeight:'80vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
            <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', borderRadius:'18px 18px 0 0' }}>
              <div>
                <h2 style={{ margin:0, fontSize:'1.1rem', fontWeight:800, color:'#0f172a' }}>Reassign Client</h2>
                <p style={{ margin:'0.2rem 0 0', fontSize:'0.8rem', color:'#64748b' }}>
                  {reassignClient.name} → select new therapist
                </p>
              </div>
              <button onClick={() => { setShowReassignModal(false); setReassignClient(null); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={20} /></button>
            </div>
            <div style={{ padding:'1rem' }}>
              {allTherapists.length === 0 ? (
                <p style={{ textAlign:'center', color:'#94a3b8', padding:'2rem' }}>No therapists found</p>
              ) : <Paged items={allTherapists}>{(allTherapists) => allTherapists.map(t => {
                const isCurrent = reassignClient.therapistId === t.id;
                return (
                  <button
                    key={t.id}
                    disabled={isCurrent || reassigning}
                    onClick={() => handleReassign(reassignClient, t.id)}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:'0.85rem', padding:'0.85rem 1rem', borderRadius:12, border: isCurrent ? '1.5px solid #4f46e5' : '1.5px solid #e2e8f0', background: isCurrent ? '#eff6ff' : 'white', cursor: isCurrent ? 'default' : 'pointer', marginBottom:'0.5rem', textAlign:'left', opacity: reassigning && !isCurrent ? 0.6 : 1 }}
                    onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background='#f8fafc'; }}
                    onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background='white'; }}
                  >
                    <div style={{ width:42, height:42, borderRadius:11, background:'linear-gradient(135deg,#4f46e5,#818cf8)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'1rem', flexShrink:0 }}>
                      {(t.name||'?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ margin:0, fontWeight:700, fontSize:'0.875rem', color:'#0f172a' }}>{t.name}</p>
                      <p style={{ margin:0, fontSize:'0.72rem', color:'#64748b' }}>{t.specialization || t.specialty || 'Therapist'}</p>
                    </div>
                    {isCurrent && <span style={{ fontSize:'0.65rem', fontWeight:700, padding:'0.2rem 0.6rem', borderRadius:20, background:'#eff6ff', color:'#4f46e5' }}>Current</span>}
                    {reassigning && !isCurrent && <div style={{ width:16, height:16, border:'2px solid #e2e8f0', borderTopColor:'#4f46e5', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />}
                  </button>
                );
              })}</Paged>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
