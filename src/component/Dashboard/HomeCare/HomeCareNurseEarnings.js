import React, { useCallback, useState } from 'react';
import { useHomeCareNurse } from './HomeCareNurseContext';
import { addNurseEarning, fetchNurseEarnings } from '../../../services/homeCareService';
import { formatGhs } from '../../../utils/homeCareUtils';
import './HomeCareNurseDashboard.css';

export default function HomeCareNurseEarnings({ embedded = false }) {
  const { profile } = useHomeCareNurse();
  const [list, setList] = useState([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      setList(await fetchNurseEarnings(profile.id));
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const add = async (ev) => {
    ev.preventDefault();
    if (!amount.trim()) return;
    setSaving(true);
    try {
      await addNurseEarning(profile.id, { amount, note });
      setAmount('');
      setNote('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const body = (
    <>
      <div className="hcn-card">
        <p className="hcn-stat-value" style={{ margin: 0, fontSize: '1.35rem' }}>
          Total logged: {formatGhs(total)}
        </p>
      </div>
      <form className="hcn-card hcn-form" onSubmit={add}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Add entry</h3>
        <label>Amount (GHS)</label>
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        <label>Note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Weekly visit payment" />
        <button type="submit" className="hcn-btn" disabled={saving}>{saving ? 'Adding…' : 'Add entry'}</button>
      </form>
      {loading ? <p className="hcn-empty">Loading…</p> : null}
      {!loading && list.length === 0 ? <p className="hcn-empty">No earnings logged yet.</p> : null}
      {list.map((e) => (
        <div key={e.id} className="hcn-card">
          <strong>{formatGhs(e.amount)}</strong>
          <p className="hcn-card-meta">{e.note || '—'}</p>
        </div>
      ))}
    </>
  );

  if (embedded) return body;

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>Earnings log</h1>
        <p>Manual tracking — payments are arranged off-platform</p>
      </header>
      {body}
    </div>
  );
}
