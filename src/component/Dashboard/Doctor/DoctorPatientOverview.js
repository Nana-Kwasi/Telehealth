import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Calendar, Pill, FileText, FlaskConical, Activity, MessageSquare,
  Clock, ChevronRight, Store,
} from 'lucide-react';
import { db, auth } from '../../../services/firestoreShim';
import {
  collection, query, where, getDocs, getDoc, doc, setDoc, serverTimestamp,
} from '../../../services/firestoreShim';

export default function DoctorPatientOverview({ profile }) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState({ name: '', email: '' });
  const [profileData, setProfileData] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [status, setStatus] = useState('active');

  useEffect(() => {
    if (!patientId || !profile?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const uid = auth.currentUser.uid;
        // NOTE: the patient's /auth doc is self-or-admin only, so a doctor reading
        // another user got 403 → name fell back to "Patient" and the Email line never
        // rendered. /patients/{id} (patientProfiles) is doctor-readable and returns
        // name + email, so source the header from there with the appointment as a
        // fallback — same approach DoctorPatientDetail already uses.
        const [ppSnap, apptSnap, rxSnap, notesSnap, ordSnap, tlSnap] = await Promise.all([
          getDoc(doc(db, 'patientProfiles', patientId)),
          getDocs(query(collection(db, 'doctorAppointments'), where('doctorId', '==', uid), where('clientId', '==', patientId))),
          getDocs(query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', uid), where('patientId', '==', patientId))),
          getDocs(query(collection(db, 'doctorNotes'), where('doctorId', '==', uid), where('patientId', '==', patientId))),
          getDocs(query(collection(db, 'diagnosticOrders'), where('patientId', '==', patientId))),
          getDocs(query(collection(db, 'patientTimeline'), where('patientId', '==', patientId))),
        ]);
        if (cancelled) return;
        const appts = apptSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const pd = ppSnap.exists() ? ppSnap.data() : null;
        setPatient({
          name: pd?.name || pd?.fullName || pd?.displayName || appts[0]?.clientName || 'Patient',
          email: pd?.email || appts[0]?.clientEmail || '',
        });
        if (pd) {
          setProfileData(pd);
          setStatus(pd.status || 'active');
        }
        setAppointments(appts);
        setPrescriptions(rxSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setNotes(notesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setOrders(ordSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.doctorId === uid).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setTimeline(tlSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 40));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, profile?.id]);

  const setPatientStatus = async (next) => {
    try {
      await setDoc(doc(db, 'patientProfiles', patientId), {
        status: next,
        updatedAt: serverTimestamp(),
        updatedBy: profile.id,
      }, { merge: true });
      setStatus(next);
    } catch {
      alert('Could not update status.');
    }
  };

  const pharmacies = Array.isArray(profileData?.pharmacies) ? profileData.pharmacies : [];

  if (loading) {
    return (
      <div className="doctor-page"><p style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading overview…</p></div>
    );
  }

  return (
    <div className="doctor-page">
      <button type="button" className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>
        <ChevronLeft size={16} /> Back
      </button>

      <div style={{
        background: 'linear-gradient(135deg, #1e6bb8 0%, #2563eb 100%)',
        borderRadius: 16,
        padding: '1.75rem',
        color: '#fff',
        marginBottom: '1.25rem',
        boxShadow: '0 12px 40px rgba(30,107,184,0.25)',
      }}>
        <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Patient overview</p>
        <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.65rem', fontWeight: 800 }}>{patient.name}</h1>
        {patient.email && <p style={{ margin: 0, opacity: 0.88, fontSize: '0.9rem' }}>{patient.email}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.25rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700, textTransform: 'capitalize' }}>{status}</span>
          {status === 'active' && (
            <button type="button" className="doctor-btn doctor-btn-sm" style={{ background: 'rgba(255,255,255,0.95)', color: '#c2410c', border: 'none' }} onClick={() => setPatientStatus('inactive')}>Set inactive</button>
          )}
          {status === 'inactive' && (
            <button type="button" className="doctor-btn doctor-btn-sm" style={{ background: 'rgba(255,255,255,0.95)', color: '#15803d', border: 'none' }} onClick={() => setPatientStatus('active')}>Activate</button>
          )}
          {status !== 'discharged' && (
            <button type="button" className="doctor-btn doctor-btn-sm" style={{ background: 'rgba(254,226,226,0.95)', color: '#b91c1c', border: 'none' }} onClick={() => window.confirm('Discharge this patient?') && setPatientStatus('discharged')}>Discharge</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { icon: Calendar, label: 'Visits', n: appointments.length },
          { icon: Pill, label: 'Prescriptions', n: prescriptions.length },
          { icon: FlaskConical, label: 'Lab / scan', n: orders.length },
          { icon: FileText, label: 'Notes', n: notes.length },
        ].map(({ icon: Icon, label, n }) => (
          <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '1rem', border: '1.5px solid #e2e8f0', textAlign: 'center' }}>
            <Icon size={18} color="#1e6bb8" style={{ marginBottom: 6 }} />
            <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>{n}</p>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{label}</p>
          </div>
        ))}
      </div>

      <button type="button" className="doctor-card" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.15rem 1.25rem', marginBottom: '1rem', cursor: 'pointer', textAlign: 'left', border: '1.5px solid #bfdbfe', background: '#eff6ff' }}
        onClick={() => navigate(`/dashboard/patients/${patientId}`)}>
        <Activity size={22} color="#1e6bb8" />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>Full clinical record</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>Detailed tabs: vitals, E‑Pharmacy, intake, daily mood, discharge requests…</p>
        </div>
        <ChevronRight size={18} color="#94a3b8" />
      </button>

      <div style={{ display: 'grid', gap: '1rem' }}>
        <OverviewSection title="Appointments" icon={Calendar} empty="No appointments">
          {appointments.slice(0, 15).map(a => (
            <div key={a.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
              <strong>{a.date || '—'}</strong>
              <span style={{ color: '#64748b', marginLeft: 8 }}>{a.status} · {a.reason || a.consultationType || ''}</span>
            </div>
          ))}
        </OverviewSection>
        <OverviewSection title="Prescriptions" icon={Pill} empty="No prescriptions">
          {prescriptions.slice(0, 12).map(rx => (
            <div key={rx.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
              {rx.medication || rx.medications?.[0]?.name || 'Rx'}
            </div>
          ))}
        </OverviewSection>
        <OverviewSection title="Lab & scan orders" icon={FlaskConical} empty="No orders">
          {orders.slice(0, 15).map(o => (
            <div key={o.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
              <strong>{o.testType}</strong>
              <span style={{ color: '#64748b', marginLeft: 8 }}>{o.centerName || ''} · {o.status || ''}</span>
            </div>
          ))}
        </OverviewSection>
        <OverviewSection title="Notes" icon={FileText} empty="No notes">
          {notes.slice(0, 10).map(n => (
            <div key={n.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
              <strong>{n.title || n.type}</strong>
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.8rem' }}>{(n.content || '').slice(0, 140)}{(n.content || '').length > 140 ? '…' : ''}</p>
            </div>
          ))}
        </OverviewSection>
        {pharmacies.length > 0 && (
          <OverviewSection title="Saved pharmacies" icon={Store} empty="">
            {pharmacies.slice(0, 10).map((ph, i) => (
              <div key={i} style={{ padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>{ph.name}</div>
            ))}
          </OverviewSection>
        )}
        <OverviewSection title="Timeline" icon={Clock} empty="No events">
          {timeline.slice(0, 20).map(t => (
            <div key={t.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem' }}>
              <strong>{t.title || t.type}</strong>
              <span style={{ color: '#94a3b8', marginLeft: 8 }}>{t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </OverviewSection>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button type="button" className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate('/dashboard/messages')}>
          <MessageSquare size={14} /> Messages
        </button>
        <button type="button" className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => navigate('/dashboard/diagnostic-order', { state: { patientId, patientName: patient.name } })}>
          <FlaskConical size={14} /> Order lab / scan
        </button>
      </div>
    </div>
  );
}

function OverviewSection({ title, icon: Icon, empty, children }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <div className="doctor-card" style={{ padding: '1.1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
        <Icon size={18} color="#1e6bb8" />
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{title}</h3>
      </div>
      {kids.length === 0 ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.875rem' }}>{empty}</p> : kids}
    </div>
  );
}
