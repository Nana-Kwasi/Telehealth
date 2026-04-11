import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '../../Auth/firebaseConfig';
import {
  collection, query, where, getDocs, getDoc, doc,
  addDoc, updateDoc, serverTimestamp, orderBy, limit
} from 'firebase/firestore';
import {
  ArrowLeft, User, Mail, Phone, Calendar, FileText,
  MessageSquare, Edit, UserX, UserCheck, TrendingUp,
  Activity, Clock, Heart, AlertTriangle, Target, CheckCircle, BookOpen
} from 'lucide-react';
import ChatModal from './ChatModal';
import './ClientDetails.css';

/* ─────────────────────────────────────────────
   Inline TherapyNoteModal
───────────────────────────────────────────── */
function TherapyNoteModal({ clientId, therapistId, onClose, onSaved }) {
  const [form, setForm] = useState({
    sessionFocus: '',
    progressAssessment: '',
    mood: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSave = async () => {
    if (!form.notes.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'clients', clientId, 'therapyNotes'), {
        ...form,
        clientId,
        therapistId,
        createdAt: serverTimestamp(),
      });
      onSaved && onSaved();
      onClose();
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setSaving(false);
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(2px)',
  };
  const modal = {
    background: '#fff', borderRadius: 18, padding: '2rem',
    width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', gap: '1rem',
  };
  const label = { fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
  const input = {
    width: '100%', padding: '0.6rem 0.85rem', borderRadius: 10,
    border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };
  const btnRow = { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: 4 };

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Add Therapy Note</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div>
          <div style={label}>Session Focus</div>
          <input style={input} name="sessionFocus" value={form.sessionFocus} onChange={handleChange} placeholder="e.g. Anxiety management, CBT exercises" />
        </div>
        <div>
          <div style={label}>Mood Rating (1–10)</div>
          <input style={input} name="mood" type="number" min="1" max="10" value={form.mood} onChange={handleChange} placeholder="5" />
        </div>
        <div>
          <div style={label}>Progress Assessment</div>
          <input style={input} name="progressAssessment" value={form.progressAssessment} onChange={handleChange} placeholder="e.g. Good progress, needs follow-up" />
        </div>
        <div>
          <div style={label}>Clinical Notes *</div>
          <textarea
            style={{ ...input, minHeight: 110, resize: 'vertical' }}
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Detailed session notes..."
          />
        </div>

        <div style={btnRow}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#64748b' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.notes.trim()}
            style={{ padding: '0.6rem 1.4rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
const MOOD_EMOJI = { 1: '😞', 2: '😟', 3: '😕', 4: '🙁', 5: '😐', 6: '🙂', 7: '😊', 8: '😄', 9: '😁', 10: '🤩' };
const MOOD_LABEL = { 1: 'Very Low', 2: 'Low', 3: 'Below Avg', 4: 'Slightly Low', 5: 'Neutral', 6: 'Okay', 7: 'Good', 8: 'Great', 9: 'Excellent', 10: 'Outstanding' };

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'active') return { bg: '#dcfce7', color: '#15803d' };
  if (s === 'inactive') return { bg: '#f1f5f9', color: '#64748b' };
  if (s === 'on_hold') return { bg: '#fef9c3', color: '#b45309' };
  if (s === 'discharged') return { bg: '#fee2e2', color: '#b91c1c' };
  return { bg: '#e0e7ff', color: '#4f46e5' };
}

function sessionStatusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return { bg: '#dcfce7', color: '#15803d' };
  if (s === 'upcoming' || s === 'scheduled') return { bg: '#dbeafe', color: '#1d4ed8' };
  if (s === 'cancelled') return { bg: '#fee2e2', color: '#b91c1c' };
  return { bg: '#f1f5f9', color: '#64748b' };
}

function fmtDate(ts) {
  if (!ts) return 'N/A';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ name, size = 72 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#4f46e5,#818cf8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 800, fontSize: size * 0.32,
      flexShrink: 0, letterSpacing: '-0.02em',
    }}>
      {initials}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function ClientDetails() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [therapistName, setTherapistName] = useState('');
  const [sessions, setSessions] = useState([]);
  const [therapyNotes, setTherapyNotes] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [moodEntries, setMoodEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [isAdmin, setIsAdmin] = useState(false);

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [goals, setGoals] = useState([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', targetDate: '', priority: 'medium', status: 'active' });
  const [savingGoal, setSavingGoal] = useState(false);

  const currentUser = auth.currentUser;

  /* ── fetch everything ── */
  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      setLoading(true);
      try {
        /* client doc */
        const cSnap = await getDoc(doc(db, 'clients', clientId));
        if (!cSnap.exists()) { setLoading(false); return; }
        const cData = { id: cSnap.id, ...cSnap.data() };
        setClient(cData);

        /* therapist name */
        if (cData.therapistId) {
          try {
            const tSnap = await getDoc(doc(db, 'therapists', cData.therapistId));
            if (tSnap.exists()) setTherapistName(tSnap.data().displayName || tSnap.data().name || '');
          } catch (_) {}
        }

        /* check admin */
        if (currentUser) {
          try {
            const meSnap = await getDoc(doc(db, 'therapists', currentUser.uid));
            if (meSnap.exists() && meSnap.data().role === 'admin') setIsAdmin(true);
          } catch (_) {}
        }

        /* sessions */
        try {
          const sessQ = query(
            collection(db, 'scheduledCalls'),
            where('clientId', '==', clientId),
            orderBy('scheduledAt', 'desc')
          );
          const sessSnap = await getDocs(sessQ);
          setSessions(sessSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (_) { setSessions([]); }

        /* therapy notes subcollection */
        try {
          const tnSnap = await getDocs(
            query(collection(db, 'clients', clientId, 'therapyNotes'), orderBy('createdAt', 'desc'))
          );
          setTherapyNotes(tnSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (_) { setTherapyNotes([]); }

        /* clinical notes collection */
        try {
          const cnQ = query(
            collection(db, 'clinicalNotes'),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc')
          );
          const cnSnap = await getDocs(cnQ);
          setClinicalNotes(cnSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (_) { setClinicalNotes([]); }

        /* mood entries */
        try {
          const moodQ = query(
            collection(db, 'Client daily mood tracking'),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc')
          );
          const moodSnap = await getDocs(moodQ);
          setMoodEntries(moodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (_) { setMoodEntries([]); }

        /* treatment goals */
        try {
          const goalsSnap = await getDocs(
            query(collection(db, 'clients', clientId, 'goals'), orderBy('createdAt', 'desc'))
          );
          setGoals(goalsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (_) { setGoals([]); }

      } catch (err) {
        console.error('Error fetching client details:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clientId]);

  /* ── derived KPIs ── */
  const totalSessions = sessions.length;
  const totalNotes = therapyNotes.length + clinicalNotes.length;
  const avgMood = moodEntries.length
    ? (moodEntries.reduce((s, e) => s + (Number(e.mood || e.moodValue || e.value) || 0), 0) / moodEntries.length).toFixed(1)
    : 'N/A';
  const lastSession = sessions.find(s => (s.status || '').toLowerCase() === 'completed');

  /* ── status change ── */
  const handleStatusChange = async (newStatus) => {
    setShowStatusMenu(false);
    if (!client) return;
    setStatusUpdating(true);
    try {
      await updateDoc(doc(db, 'clients', clientId), { status: newStatus });
      setClient(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDischarge = async () => {
    setShowDischargeConfirm(false);
    await handleStatusChange('discharged');
  };

  /* ── reload notes after add ── */
  const reloadNotes = async () => {
    try {
      const tnSnap = await getDocs(
        query(collection(db, 'clients', clientId, 'therapyNotes'), orderBy('createdAt', 'desc'))
      );
      setTherapyNotes(tnSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (_) {}
  };

  /* ── goals ── */
  const handleSaveGoal = async () => {
    if (!goalForm.title.trim()) return;
    setSavingGoal(true);
    try {
      const docRef = await addDoc(collection(db, 'clients', clientId, 'goals'), {
        ...goalForm,
        clientId,
        therapistId: currentUser?.uid,
        createdAt: serverTimestamp(),
      });
      setGoals(prev => [{ id: docRef.id, ...goalForm }, ...prev]);
      setGoalForm({ title: '', description: '', targetDate: '', priority: 'medium', status: 'active' });
      setShowGoalForm(false);
    } catch (_) {} finally { setSavingGoal(false); }
  };

  const handleToggleGoalStatus = async (goal) => {
    const newStatus = goal.status === 'completed' ? 'active' : 'completed';
    try {
      await updateDoc(doc(db, 'clients', clientId, 'goals', goal.id), { status: newStatus });
      setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, status: newStatus } : g));
    } catch (_) {}
  };

  /* ────────────────────────────────── render ── */

  const pageStyle = {
    padding: '2rem', background: '#f4f6fb', minHeight: '100vh',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  };

  const cardStyle = {
    background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  };

  const TABS = ['overview', 'sessions', 'notes', 'mood', 'goals'];

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8', fontSize: '0.95rem', fontWeight: 500 }}>
          Loading client details…
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>Client not found.</div>
        <div style={{ textAlign: 'center' }}>
          <button className="btn-primary" onClick={() => navigate('/dashboard/clients')}>
            <ArrowLeft size={16} /> Back to Clients
          </button>
        </div>
      </div>
    );
  }

  const clientName = client.clientName || client.displayName || client.name || 'Unknown';
  const statusColors = statusColor(client.status);

  return (
    <div style={pageStyle}>

      {/* ── Back button ── */}
      <button
        onClick={() => navigate('/dashboard/clients')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.5rem 1rem', borderRadius: 10, border: '1.5px solid #e2e8f0',
          background: '#fff', color: '#475569', fontSize: '0.82rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', marginBottom: '1.25rem',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
      >
        <ArrowLeft size={15} /> Back to Clients
      </button>

      {/* ── Profile Header Card ── */}
      <div style={{ ...cardStyle, padding: '1.5rem 1.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <Avatar name={clientName} size={72} />

          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: '0 0 0.2rem', fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {clientName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.82rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <Mail size={13} />
              <span>{client.clientEmail || client.email || 'No email'}</span>
              {(client.phone) && (
                <><Phone size={13} style={{ marginLeft: 8 }} /><span>{client.phone}</span></>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', padding: '0.22rem 0.7rem',
                borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                background: statusColors.bg, color: statusColors.color,
              }}>
                {(client.status || 'active').replace(/_/g, ' ').toUpperCase()}
              </span>
              {therapistName && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                  <User size={12} />
                  Assigned to: <span style={{ color: '#4f46e5', fontWeight: 700 }}>{therapistName}</span>
                </span>
              )}
              {client.therapyType && (
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500, background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: 20 }}>
                  {client.therapyType}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Action Buttons Row ── */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setShowNoteModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(79,70,229,0.28)' }}
          >
            <FileText size={14} /> Add Note
          </button>

          <button
            onClick={() => setShowChatModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: '1.5px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <MessageSquare size={14} /> Message
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowStatusMenu(v => !v)}
              disabled={statusUpdating}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: statusUpdating ? 0.6 : 1 }}
            >
              <Edit size={14} /> {statusUpdating ? 'Updating…' : 'Change Status'}
            </button>
            {showStatusMenu && (
              <div style={{ position: 'absolute', left: 0, top: '110%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 200, minWidth: 170, overflow: 'hidden' }}>
                {['active', 'inactive', 'on_hold', 'discharged'].map(s => {
                  const c = statusColor(s);
                  return (
                    <button key={s} onClick={() => handleStatusChange(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', padding: '0.65rem 1rem', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: c.color, fontFamily: 'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background = c.bg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowDischargeConfirm(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: '1.5px solid #fca5a5', background: '#fff5f5', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <UserX size={14} /> Discharge
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate('/dashboard/clients')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: '1.5px solid #c4b5fd', background: '#f5f3ff', color: '#6d28d9', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <UserCheck size={14} /> Reassign
            </button>
          )}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { icon: <Activity size={20} color="#4f46e5" />, label: 'Total Sessions', value: totalSessions, bg: '#eff6ff' },
          { icon: <FileText size={20} color="#0891b2" />, label: 'Total Notes', value: totalNotes, bg: '#ecfeff' },
          { icon: <TrendingUp size={20} color="#059669" />, label: 'Avg Mood', value: avgMood, bg: '#ecfdf5' },
          {
            icon: <Clock size={20} color="#d97706" />, label: 'Last Session',
            value: lastSession ? fmtDate(lastSession.scheduledAt) : 'N/A', bg: '#fffbeb',
          },
        ].map((kpi, i) => (
          <div key={i} style={{ ...cardStyle, padding: '1.2rem 1.4rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {kpi.icon}
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{kpi.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', background: '#fff', borderRadius: 14, padding: '0.4rem', border: '1px solid #e2e8f0', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
              background: activeTab === tab ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : 'transparent',
              color: activeTab === tab ? '#fff' : '#64748b',
              boxShadow: activeTab === tab ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '1.25rem' }}>

          {/* Personal */}
          <div style={{ ...cardStyle, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <User size={15} /> Personal Information
            </div>
            {[
              ['Name', clientName],
              ['Email', client.clientEmail || client.email],
              ['Phone', client.phone || client.phoneNumber],
              ['Age', client.age],
              ['Gender', client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : client.gender],
              ['Country', client.country],
              ['Employment', client.employment],
              ['Relationship Status', client.relationshipStatus],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.82rem' }}>{label}</span>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>{val || 'N/A'}</span>
              </div>
            ))}
          </div>

          {/* Therapy */}
          <div style={{ ...cardStyle, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <Calendar size={15} /> Therapy Information
            </div>
            {[
              ['Therapy Type', client.therapyType],
              ['Session Frequency', client.sessionFrequency],
              ['Session Structure', client.sessionStructure],
              ['Therapist Style', client.therapistStyle],
              ['Assigned Therapist', therapistName || client.assignedTherapist?.name],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.82rem' }}>{label}</span>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>{val || 'N/A'}</span>
              </div>
            ))}
          </div>

          {/* Health */}
          <div style={{ ...cardStyle, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <Heart size={15} /> Health & Wellness
            </div>
            {[
              ['Physical Health', client.physicalHealth],
              ['Sleep Quality', client.sleep],
              ['Exercise', client.exercise],
              ['Eating Habits', client.eatingHabits],
              ['Depression Level', client.depression],
              ['Anxiety Level', client.anxiety],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.82rem' }}>{label}</span>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>{val || 'N/A'}</span>
              </div>
            ))}
          </div>

          {/* Mental Health History */}
          {(client.mentalHealthHistory || client.previousTherapy || client.medications) && (
            <div style={{ ...cardStyle, padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                <AlertTriangle size={15} /> Mental Health History
              </div>
              {[
                ['History', client.mentalHealthHistory],
                ['Previous Therapy', client.previousTherapy],
                ['Medications', client.medications],
                ['Trauma History', client.traumaHistory],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} style={{ padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ color: '#64748b', fontWeight: 600, fontSize: '0.78rem', marginBottom: 4 }}>{label}</div>
                  <div style={{ color: '#0f172a', fontSize: '0.875rem' }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SESSIONS */}
      {activeTab === 'sessions' && (
        <div style={cardStyle}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Scheduled Sessions ({sessions.length})</h3>
          </div>
          {sessions.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No sessions found.</div>
          ) : (
            <div style={{ padding: '0.5rem 1.5rem 1.5rem' }}>
              {sessions.map(sess => {
                const sc = sessionStatusColor(sess.status);
                return (
                  <div key={sess.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1rem 1.25rem', margin: '0.75rem 0',
                    background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
                    flexWrap: 'wrap', gap: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Calendar size={20} color="#4f46e5" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                          {fmtDate(sess.scheduledAt)}
                          {sess.scheduledAt && <span style={{ color: '#64748b', fontWeight: 500, marginLeft: 8 }}>{fmtTime(sess.scheduledAt)}</span>}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
                          {sess.sessionType || sess.type || 'Session'}
                          {sess.duration ? ` · ${sess.duration} min` : ''}
                        </div>
                      </div>
                    </div>
                    <span style={{
                      padding: '0.25rem 0.75rem', borderRadius: 20,
                      fontSize: '0.72rem', fontWeight: 700,
                      background: sc.bg, color: sc.color,
                    }}>
                      {(sess.status || 'scheduled').replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* NOTES */}
      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Therapy notes */}
          <div style={cardStyle}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Therapy Notes ({therapyNotes.length})</h3>
              <button className="btn-primary" onClick={() => setShowNoteModal(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
                <FileText size={14} /> Add Note
              </button>
            </div>
            {therapyNotes.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No therapy notes yet.</div>
            ) : (
              <div style={{ padding: '0.5rem 1.5rem 1.5rem' }}>
                {therapyNotes.map(note => (
                  <div key={note.id} style={{ padding: '1.2rem', margin: '0.75rem 0', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>{fmtDate(note.createdAt)}</div>
                      {note.mood && (
                        <span style={{ padding: '0.2rem 0.65rem', borderRadius: 20, background: '#eff6ff', color: '#4f46e5', fontSize: '0.72rem', fontWeight: 700 }}>
                          Mood {note.mood}/10
                        </span>
                      )}
                    </div>
                    {note.sessionFocus && (
                      <div style={{ marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Focus: </span>
                        <span style={{ fontSize: '0.875rem', color: '#0f172a' }}>{note.sessionFocus}</span>
                      </div>
                    )}
                    {note.progressAssessment && (
                      <div style={{ marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progress: </span>
                        <span style={{ fontSize: '0.875rem', color: '#0f172a' }}>{note.progressAssessment}</span>
                      </div>
                    )}
                    {note.notes && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>{note.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clinical notes */}
          <div style={cardStyle}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Clinical Notes ({clinicalNotes.length})</h3>
            </div>
            {clinicalNotes.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No clinical notes found.</div>
            ) : (
              <div style={{ padding: '0.5rem 1.5rem 1.5rem' }}>
                {clinicalNotes.map(note => (
                  <div key={note.id} style={{ padding: '1.2rem', margin: '0.75rem 0', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.6rem' }}>{fmtDate(note.createdAt)}</div>
                    {note.sessionFocus && (
                      <div style={{ marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Focus: </span>
                        <span style={{ fontSize: '0.875rem', color: '#0f172a' }}>{note.sessionFocus}</span>
                      </div>
                    )}
                    {note.progressAssessment && (
                      <div style={{ marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progress: </span>
                        <span style={{ fontSize: '0.875rem', color: '#0f172a' }}>{note.progressAssessment}</span>
                      </div>
                    )}
                    {note.content && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>{note.content}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MOOD */}
      {activeTab === 'mood' && (
        <div style={cardStyle}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Mood Tracking ({moodEntries.length} entries)</h3>
          </div>
          {moodEntries.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No mood entries found.</div>
          ) : (
            <div style={{ padding: '0.5rem 1.5rem 1.5rem' }}>
              {moodEntries.map(entry => {
                const moodVal = Number(entry.mood || entry.moodValue || entry.value) || 0;
                const emoji = MOOD_EMOJI[moodVal] || '😐';
                const label = MOOD_LABEL[moodVal] || entry.label || 'Unknown';
                const pct = Math.round((moodVal / 10) * 100);
                const barColor = moodVal >= 7 ? '#10b981' : moodVal >= 5 ? '#f59e0b' : '#ef4444';

                return (
                  <div key={entry.id} style={{ padding: '1.2rem 1.4rem', margin: '0.75rem 0', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '2rem' }}>{emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{label}</span>
                          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: barColor }}>{moodVal}/10</span>
                        </div>
                        <div style={{ height: 8, background: '#e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 8, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textAlign: 'right' }}>
                        {fmtDate(entry.createdAt || entry.date)}
                      </div>
                    </div>
                    {(entry.journal || entry.journalEntry || entry.note) && (
                      <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, paddingTop: '0.6rem', borderTop: '1px solid #e2e8f0' }}>
                        {entry.journal || entry.journalEntry || entry.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* GOALS / TREATMENT PLAN */}
      {activeTab === 'goals' && (
        <div style={cardStyle}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Treatment Goals</h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                {goals.filter(g => g.status === 'completed').length}/{goals.length} goals completed
              </p>
            </div>
            <button
              onClick={() => setShowGoalForm(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 1rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Target size={14} /> Add Goal
            </button>
          </div>

          {/* Add goal inline form */}
          {showGoalForm && (
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <input
                  placeholder="Goal title *"
                  value={goalForm.title}
                  onChange={e => setGoalForm(p => ({ ...p, title: e.target.value }))}
                  style={{ gridColumn: '1/-1', padding: '0.6rem 0.85rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
                <textarea
                  placeholder="Description / details"
                  value={goalForm.description}
                  onChange={e => setGoalForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  style={{ gridColumn: '1/-1', padding: '0.6rem 0.85rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Target Date</label>
                  <input type="date" value={goalForm.targetDate} onChange={e => setGoalForm(p => ({ ...p, targetDate: e.target.value }))}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Priority</label>
                  <select value={goalForm.priority} onChange={e => setGoalForm(p => ({ ...p, priority: e.target.value }))}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowGoalForm(false)} style={{ padding: '0.5rem 1rem', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={handleSaveGoal} disabled={savingGoal || !goalForm.title.trim()} style={{ padding: '0.5rem 1.25rem', borderRadius: 9, border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', opacity: savingGoal ? 0.7 : 1 }}>
                  {savingGoal ? 'Saving…' : 'Save Goal'}
                </button>
              </div>
            </div>
          )}

          {goals.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <Target size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 0.75rem' }} />
              <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>No treatment goals yet</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>Add goals to track this client's therapy progress</p>
            </div>
          ) : (
            <div style={{ padding: '0.75rem 1.5rem 1.5rem' }}>
              {goals.map(goal => {
                const priorityColor = { high: '#dc2626', medium: '#d97706', low: '#16a34a' }[goal.priority] || '#64748b';
                const priorityBg = { high: '#fee2e2', medium: '#fef3c7', low: '#dcfce7' }[goal.priority] || '#f1f5f9';
                const isDone = goal.status === 'completed';
                return (
                  <div key={goal.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '1rem 1.1rem', margin: '0.6rem 0', background: isDone ? '#f0fdf4' : '#f8fafc', borderRadius: 12, border: `1px solid ${isDone ? '#bbf7d0' : '#e2e8f0'}`, transition: 'all 0.15s' }}>
                    <button
                      onClick={() => handleToggleGoalStatus(goal)}
                      style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${isDone ? '#16a34a' : '#cbd5e1'}`, background: isDone ? '#16a34a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                    >
                      {isDone && <CheckCircle size={13} color="#fff" />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isDone ? '#94a3b8' : '#0f172a', textDecoration: isDone ? 'line-through' : 'none' }}>
                          {goal.title}
                        </span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: priorityBg, color: priorityColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {goal.priority}
                        </span>
                        {isDone && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: '#dcfce7', color: '#16a34a' }}>COMPLETED</span>}
                      </div>
                      {goal.description && <p style={{ margin: '0 0 0.3rem', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>{goal.description}</p>}
                      {goal.targetDate && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Target: {new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {showNoteModal && (
        <TherapyNoteModal
          clientId={clientId}
          therapistId={currentUser?.uid}
          onClose={() => setShowNoteModal(false)}
          onSaved={reloadNotes}
        />
      )}

      {showChatModal && (
        <ChatModal
          target={{ id: clientId, name: clientName, ...client }}
          type="client"
          onClose={() => setShowChatModal(false)}
        />
      )}

      {/* Discharge confirm */}
      {showDischargeConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '2rem', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Discharge Client</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
              Are you sure you want to discharge <strong>{clientName}</strong>? Their status will be set to <em>discharged</em>. This action can be reversed by changing their status later.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDischargeConfirm(false)}
                style={{ padding: '0.6rem 1.2rem', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#64748b', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDischarge}
                style={{ padding: '0.6rem 1.4rem', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Discharge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* close status menu on outside click */}
      {showStatusMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          onClick={() => setShowStatusMenu(false)}
        />
      )}
    </div>
  );
}
