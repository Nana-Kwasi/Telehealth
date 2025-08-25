import React, { useEffect, useState } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import { collection, onSnapshot, query } from 'firebase/firestore';

export default function TherapistCalendar() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    // naive: aggregate all clients' schedules linked under therapists/{uid}/clients
    const unsubscribers = [];
    const clientCol = collection(db, 'therapists', u.uid, 'clients');
    const unsub = onSnapshot(clientCol, (snap) => {
      unsubscribers.forEach((f) => f());
      const inner = [];
      snap.forEach((c) => {
        const uref = collection(db, 'clients', c.id, 'schedule');
        inner.push(onSnapshot(query(uref), (s) => {
          setRequests((prev) => {
            const others = prev.filter((x) => x.clientId !== c.id);
            return [...others, ...s.docs.map((d) => ({ clientId: c.id, id: d.id, ...d.data() }))];
          });
        }));
      });
      inner.forEach((u) => unsubscribers.push(u));
    });
    return () => { unsub(); unsubscribers.forEach((f) => f()); };
  }, []);

  return (
    <div>
      <h1 className="page-title">Calendar Requests</h1>
      <div className="q-card">
        {requests.map((r) => <div key={`${r.clientId}-${r.id}`} className="chip">{r.clientId} • {r.datetime} • {r.status}</div>)}
      </div>
    </div>
  );
}


