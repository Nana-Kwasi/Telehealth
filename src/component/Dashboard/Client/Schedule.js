import React, { useEffect, useState } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import { addDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';

export default function ClientSchedule() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ date: '', time: '' });

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const q = query(collection(db, 'clients', u.uid, 'schedule'), orderBy('datetime', 'asc'));
    return onSnapshot(q, (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  const book = async () => {
    const u = auth.currentUser;
    if (!u || !form.date || !form.time) return;
    await addDoc(collection(db, 'clients', u.uid, 'schedule'), { datetime: `${form.date}T${form.time}:00`, status: 'requested' });
    setForm({ date: '', time: '' });
  };

  return (
    <div>
      <h1 className="page-title">Schedule Session</h1>
      <div className="q-card">
        <div className="field"><div className="label">Date</div><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div className="field"><div className="label">Time</div><input className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
        <div className="q-actions"><button className="btn primary" onClick={book}>Request</button></div>
      </div>
      <div style={{ height: 12 }} />
      <div className="q-card"><h3>Upcoming</h3>
        {events.map((e) => <div key={e.id} className="chip">{e.datetime} • {e.status}</div>)}
      </div>
    </div>
  );
}


