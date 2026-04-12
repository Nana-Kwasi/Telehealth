import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Save, Trash2, ChevronDown } from 'lucide-react';
import { db } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, serverTimestamp } from 'firebase/firestore';

export default function DoctorNotes({ profile }) {
  const [notes, setNotes] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [form, setForm] = useState({ patientIds: [], title: '', content: '', type: 'consultation' });
  const [showPatientPicker, setShowPatientPicker] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadNotes();
      loadPatients();
    }
  }, [profile]);

  const loadNotes = async () => {
    try {
      const q = query(
        collection(db, 'doctorNotes'),
        where('doctorId', '==', profile.id),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    try {
      const q = query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id));
      const snap = await getDocs(q);
      const seen = new Set();
      const raw = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.clientId && !seen.has(data.clientId)) {
          seen.add(data.clientId);
          raw.push({ id: data.clientId, name: data.clientName || '' });
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
      setPatients(list);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    if (form.patientIds.length === 0 && !editingNote) {
      alert('Please select a patient before saving the note.');
      return;
    }
    try {
      if (editingNote) {
        // When editing, keep original patient assignment
        const noteData = {
          doctorId: profile.id,
          doctorName: profile.name || 'Doctor',
          patientId: editingNote.patientId || '',
          patientName: editingNote.patientName || '',
          title: form.title.trim(),
          content: form.content.trim(),
          type: form.type,
          updatedAt: serverTimestamp(),
        };
        await updateDoc(doc(db, 'doctorNotes', editingNote.id), noteData);
      } else if (form.patientIds.length === 0) {
        // This branch is now blocked by validation above — kept as safety net
        return;
      } else {
        // Create one note per selected patient
        await Promise.all(form.patientIds.map(pid => {
          const pt = patients.find(p => p.id === pid);
          return addDoc(collection(db, 'doctorNotes'), {
            doctorId: profile.id, doctorName: profile.name || 'Doctor',
            patientId: pid, patientName: pt?.name || 'Patient',
            title: form.title.trim(), content: form.content.trim(),
            type: form.type, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }));
      }

      resetForm();
      loadNotes();
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteDoc(doc(db, 'doctorNotes', noteId));
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const handleEdit = (note) => {
    setForm({
      patientIds: note.patientId ? [note.patientId] : [],
      title: note.title,
      content: note.content,
      type: note.type || 'consultation',
    });
    setEditingNote(note);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ patientIds: [], title: '', content: '', type: 'consultation' });
    setEditingNote(null);
    setShowForm(false);
    setShowPatientPicker(false);
  };

  const togglePatient = (pid) => {
    setForm(prev => ({
      ...prev,
      patientIds: prev.patientIds.includes(pid)
        ? prev.patientIds.filter(id => id !== pid)
        : [...prev.patientIds, pid],
    }));
  };

  const filtered = notes.filter(n => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (n.title && n.title.toLowerCase().includes(q)) ||
           (n.patientName && n.patientName.toLowerCase().includes(q)) ||
           (n.content && n.content.toLowerCase().includes(q));
  });

  const noteTypes = {
    consultation: { label: 'Consultation', color: '#1e6bb8' },
    followup: { label: 'Follow-up', color: '#7c3aed' },
    prescription: { label: 'Prescription', color: '#059669' },
    referral: { label: 'Referral', color: '#d97706' },
    general: { label: 'General', color: '#64748b' },
  };

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Consultation Notes</h1>
        <p>Document patient consultations and clinical notes</p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button className="doctor-btn doctor-btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={16} /> New Note
        </button>
      </div>

      {showForm && (
        <div className="doctor-card">
          <h3>{editingNote ? 'Edit Note' : 'New Consultation Note'}</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="doctor-form-group" style={{ marginBottom: 0 }}>
              <label>Patient * <span style={{ color: '#ef4444', fontWeight: 400, fontSize: '0.75rem' }}>(required)</span></label>
              <div
                onClick={() => setShowPatientPicker(v => !v)}
                style={{ cursor: 'pointer', padding: '0.55rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, background: 'white', fontSize: '0.875rem', color: form.patientIds.length ? '#0f172a' : '#94a3b8', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>
                  {form.patientIds.length === 0
                    ? '— General note (no patient) —'
                    : form.patientIds.map(id => patients.find(p => p.id === id)?.name || id).join(', ')}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{showPatientPicker ? '▲' : '▼'}</span>
              </div>
              {showPatientPicker && (
                <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {patients.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.85rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: form.patientIds.includes(p.id) ? '#eff6ff' : 'transparent' }}>
                      <input type="checkbox" checked={form.patientIds.includes(p.id)} onChange={() => togglePatient(p.id)} />
                      <span style={{ fontSize: '0.875rem', color: '#0f172a' }}>{p.name || 'Unknown Patient'}</span>
                    </label>
                  ))}
                </div>
              )}
              {form.patientIds.length === 0 && (
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#d97706' }}>
                  ⚠ Without selecting patients, this note won't appear on any patient's screen.
                </p>
              )}
              {form.patientIds.length > 1 && (
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#1e6bb8' }}>
                  ℹ This note will be saved separately for each selected patient.
                </p>
              )}
            </div>
            <div className="doctor-form-group" style={{ marginBottom: 0 }}>
              <label>Note Type</label>
              <select
                className="doctor-form-select"
                value={form.type}
                onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
              >
                {Object.entries(noteTypes).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="doctor-form-group">
            <label>Title</label>
            <input
              className="doctor-form-input"
              placeholder="e.g., Initial consultation — chest pain evaluation"
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="doctor-form-group">
            <label>Notes</label>
            <textarea
              className="doctor-form-textarea"
              placeholder="Write your consultation notes here..."
              rows={6}
              value={form.content}
              onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="doctor-btn doctor-btn-primary" onClick={handleSave} disabled={!form.title.trim() || !form.content.trim()} style={{ minWidth: 150 }}>
              <Save size={16} /> {editingNote ? 'Update Note' : 'Save Note'}
            </button>
            <button className="doctor-btn doctor-btn-outline" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      <div className="doctor-search">
        <Search size={18} color="#94a3b8" />
        <input
          placeholder="Search notes by title, patient, or content..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="doctor-card">
        <h3>All Notes ({filtered.length})</h3>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading notes...</p>
        ) : filtered.length === 0 ? (
          <div className="doctor-empty-state">
            <FileText size={40} />
            <h3>{searchQuery ? 'No notes match your search' : 'No consultation notes yet'}</h3>
            <p>Click "New Note" to create your first consultation note.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map(note => {
              const typeInfo = noteTypes[note.type] || noteTypes.general;
              return (
                <div key={note.id} style={{
                  padding: '1rem 1.25rem', background: '#f8fafc', borderRadius: 10,
                  borderLeft: `4px solid ${typeInfo.color}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', color: '#1e293b' }}>{note.title}</h4>
                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                        <span style={{
                          background: typeInfo.color + '15', color: typeInfo.color,
                          padding: '0.1rem 0.5rem', borderRadius: 4, fontWeight: 600,
                        }}>
                          {typeInfo.label}
                        </span>
                        {note.patientName && <span>Patient: {note.patientName}</span>}
                        {note.createdAt?.toDate && (
                          <span>{note.createdAt.toDate().toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => handleEdit(note)}>Edit</button>
                      <button className="doctor-btn doctor-btn-sm doctor-btn-danger" onClick={() => handleDelete(note.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {note.content.length > 300 ? note.content.slice(0, 300) + '...' : note.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
