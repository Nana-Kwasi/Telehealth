import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Save, Trash2, Printer } from 'lucide-react';
import { db } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, serverTimestamp } from 'firebase/firestore';

export default function DoctorPrescriptions({ profile }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState(null);

  const [form, setForm] = useState({
    patientIds: [], diagnosis: '',
    medications: [{ name: '', dosage: '', frequency: '', duration: '' }],
    instructions: '', followUpDate: '',
  });
  const [showPatientPicker, setShowPatientPicker] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadPrescriptions();
      loadPatients();
    }
  }, [profile]);

  const loadPrescriptions = async () => {
    try {
      const q = query(
        collection(db, 'doctorPrescriptions'),
        where('doctorId', '==', profile.id),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      setPrescriptions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Error loading prescriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    try {
      // Load patients from appointments (same as DoctorNotes)
      const q = query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id));
      const snap = await getDocs(q);
      const seen = new Set();
      const list = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.clientId && !seen.has(data.clientId)) {
          seen.add(data.clientId);
          list.push({ id: data.clientId, name: data.clientName || '' });
        }
      }
      // Enrich names for patients whose appointment name is missing or generic
      const enriched = await Promise.all(list.map(async (p) => {
        if (!p.name || p.name === 'Patient') {
          try {
            const authSnap = await getDoc(doc(db, 'auth', p.id));
            if (authSnap.exists()) {
              const d = authSnap.data();
              return { ...p, name: d.name || d.displayName || p.name || 'Patient' };
            }
          } catch (_) {}
        }
        return p;
      }));
      setPatients(enriched);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const handleSave = async () => {
    if (form.patientIds.length === 0 || !form.diagnosis.trim() || form.medications.every(m => !m.name.trim())) return;
    try {
      const baseData = {
        doctorId: profile.id,
        doctorName: profile.name || 'Doctor',
        diagnosis: form.diagnosis.trim(),
        medications: form.medications.filter(m => m.name.trim()),
        instructions: form.instructions.trim(),
        followUpDate: form.followUpDate,
        date: new Date().toISOString().split('T')[0],
        updatedAt: serverTimestamp(),
      };

      if (editingPrescription) {
        // Keep original patient when editing
        await updateDoc(doc(db, 'doctorPrescriptions', editingPrescription.id), {
          ...baseData,
          patientId: editingPrescription.patientId,
          patientName: editingPrescription.patientName,
        });
      } else {
        // Create one prescription per selected patient
        await Promise.all(form.patientIds.map(pid => {
          const pt = patients.find(p => p.id === pid);
          return addDoc(collection(db, 'doctorPrescriptions'), {
            ...baseData,
            patientId: pid,
            patientName: pt?.name || 'Patient',
            createdAt: serverTimestamp(),
          });
        }));
      }

      resetForm();
      loadPrescriptions();
    } catch (error) {
      console.error('Error saving prescription:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this prescription?')) return;
    try {
      await deleteDoc(doc(db, 'doctorPrescriptions', id));
      setPrescriptions(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting prescription:', error);
    }
  };

  const handleEdit = (rx) => {
    setForm({
      patientIds: rx.patientId ? [rx.patientId] : [],
      diagnosis: rx.diagnosis || '',
      medications: rx.medications?.length ? rx.medications : [{ name: '', dosage: '', frequency: '', duration: '' }],
      instructions: rx.instructions || '',
      followUpDate: rx.followUpDate || '',
    });
    setEditingPrescription(rx);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      patientIds: [], diagnosis: '',
      medications: [{ name: '', dosage: '', frequency: '', duration: '' }],
      instructions: '', followUpDate: '',
    });
    setEditingPrescription(null);
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

  const addMedication = () => {
    setForm(prev => ({ ...prev, medications: [...prev.medications, { name: '', dosage: '', frequency: '', duration: '' }] }));
  };

  const removeMedication = (index) => {
    setForm(prev => ({ ...prev, medications: prev.medications.filter((_, i) => i !== index) }));
  };

  const updateMedication = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      medications: prev.medications.map((m, i) => i === index ? { ...m, [field]: value } : m),
    }));
  };

  const handlePrint = (rx) => {
    const printContent = `
      <html><head><title>Prescription</title>
      <style>body{font-family:Arial,sans-serif;padding:2rem;max-width:700px;margin:auto}
      h1{color:#1e6bb8;border-bottom:2px solid #1e6bb8;padding-bottom:0.5rem}
      table{width:100%;border-collapse:collapse;margin:1rem 0}
      th,td{border:1px solid #ddd;padding:0.5rem;text-align:left}
      th{background:#f0f6fc}
      .footer{margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem;font-size:0.85rem;color:#666}
      </style></head><body>
      <h1>Medical Prescription</h1>
      <p><strong>Doctor:</strong> Dr. ${profile.name || 'Doctor'}</p>
      <p><strong>Specialization:</strong> ${profile.specialization || 'General Practice'}</p>
      <p><strong>Patient:</strong> ${rx.patientName || 'Patient'}</p>
      <p><strong>Date:</strong> ${rx.date || new Date().toLocaleDateString()}</p>
      <p><strong>Diagnosis:</strong> ${rx.diagnosis}</p>
      <h3>Medications</h3>
      <table><thead><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr></thead>
      <tbody>${(rx.medications || []).map(m =>
        `<tr><td>${m.name}</td><td>${m.dosage}</td><td>${m.frequency}</td><td>${m.duration}</td></tr>`
      ).join('')}</tbody></table>
      ${rx.instructions ? `<p><strong>Instructions:</strong> ${rx.instructions}</p>` : ''}
      ${rx.followUpDate ? `<p><strong>Follow-up:</strong> ${rx.followUpDate}</p>` : ''}
      <div class="footer"><p>This prescription was generated via NessaHub Medical Platform.</p></div>
      </body></html>`;
    const win = window.open('', '_blank');
    win.document.write(printContent);
    win.document.close();
    win.print();
  };

  const filtered = prescriptions.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.patientName && p.patientName.toLowerCase().includes(q)) ||
           (p.diagnosis && p.diagnosis.toLowerCase().includes(q)) ||
           (p.date && p.date.includes(q));
  });

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Prescriptions</h1>
        <p>Create and manage patient prescriptions</p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button className="doctor-btn doctor-btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={16} /> New Prescription
        </button>
      </div>

      {showForm && (
        <div className="doctor-card">
          <h3>{editingPrescription ? 'Edit Prescription' : 'New Prescription'}</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="doctor-form-group" style={{ marginBottom: 0 }}>
              <label>Patients * <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.75rem' }}>(select one or more)</span></label>
              <div
                onClick={() => setShowPatientPicker(v => !v)}
                style={{ cursor: 'pointer', padding: '0.55rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, background: 'white', fontSize: '0.875rem', color: form.patientIds.length ? '#0f172a' : '#94a3b8', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>
                  {form.patientIds.length === 0
                    ? '— Select patient(s) —'
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
              {form.patientIds.length > 1 && (
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#1e6bb8' }}>
                  ℹ Prescription will be issued to each selected patient individually.
                </p>
              )}
            </div>
            <div className="doctor-form-group" style={{ marginBottom: 0 }}>
              <label>Follow-up Date</label>
              <input className="doctor-form-input" type="date" value={form.followUpDate}
                onChange={e => setForm(prev => ({ ...prev, followUpDate: e.target.value }))} />
            </div>
          </div>

          <div className="doctor-form-group">
            <label>Diagnosis *</label>
            <input className="doctor-form-input" placeholder="e.g., Upper respiratory infection"
              value={form.diagnosis} onChange={e => setForm(prev => ({ ...prev, diagnosis: e.target.value }))} />
          </div>

          {/* Medications */}
          <div className="doctor-form-group">
            <label>Medications *</label>
            {form.medications.map((med, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input className="doctor-form-input" placeholder="Medication name" value={med.name}
                  onChange={e => updateMedication(i, 'name', e.target.value)} />
                <input className="doctor-form-input" placeholder="Dosage" value={med.dosage}
                  onChange={e => updateMedication(i, 'dosage', e.target.value)} />
                <input className="doctor-form-input" placeholder="Frequency" value={med.frequency}
                  onChange={e => updateMedication(i, 'frequency', e.target.value)} />
                <input className="doctor-form-input" placeholder="Duration" value={med.duration}
                  onChange={e => updateMedication(i, 'duration', e.target.value)} />
                {form.medications.length > 1 && (
                  <button className="doctor-btn doctor-btn-sm doctor-btn-danger" onClick={() => removeMedication(i)}
                    style={{ height: 'fit-content', alignSelf: 'center' }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={addMedication}>
              <Plus size={14} /> Add Medication
            </button>
          </div>

          <div className="doctor-form-group">
            <label>Special Instructions</label>
            <textarea className="doctor-form-textarea" rows={3}
              placeholder="Additional instructions for the patient..."
              value={form.instructions} onChange={e => setForm(prev => ({ ...prev, instructions: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="doctor-btn doctor-btn-primary" onClick={handleSave}
              disabled={!form.patientId || !form.diagnosis.trim()}>
              <Save size={16} /> {editingPrescription ? 'Update' : 'Save Prescription'}
            </button>
            <button className="doctor-btn doctor-btn-outline" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      <div className="doctor-search">
        <Search size={18} color="#94a3b8" />
        <input placeholder="Search by patient, diagnosis, or date..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <div className="doctor-card">
        <h3>All Prescriptions ({filtered.length})</h3>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="doctor-empty-state">
            <FileText size={40} />
            <h3>{searchQuery ? 'No prescriptions match your search' : 'No prescriptions yet'}</h3>
            <p>Click "New Prescription" to create one.</p>
          </div>
        ) : (
          <table className="doctor-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Diagnosis</th>
                <th>Medications</th>
                <th>Date</th>
                <th>Follow-up</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(rx => (
                <tr key={rx.id}>
                  <td style={{ fontWeight: 500 }}>{rx.patientName || 'Patient'}</td>
                  <td>{rx.diagnosis}</td>
                  <td>
                    <div style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
                      {(rx.medications || []).slice(0, 2).map((m, i) => (
                        <div key={i}>{m.name} {m.dosage && `— ${m.dosage}`}</div>
                      ))}
                      {(rx.medications || []).length > 2 && (
                        <span style={{ color: '#94a3b8' }}>+{rx.medications.length - 2} more</span>
                      )}
                    </div>
                  </td>
                  <td>{rx.date || '—'}</td>
                  <td>{rx.followUpDate || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => handleEdit(rx)}>Edit</button>
                      <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => handlePrint(rx)} title="Print">
                        <Printer size={12} />
                      </button>
                      <button className="doctor-btn doctor-btn-sm doctor-btn-danger" onClick={() => handleDelete(rx.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
