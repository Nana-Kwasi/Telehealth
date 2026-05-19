import React, { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { submitComplaint } from '../../services/homeCareService';
import './HomeCare.css';

const NATURES = ['No-show', 'Misconduct', 'Unprofessional behaviour', 'Safety concern', 'Fee dispute', 'Other'];

export default function HomeCareReport() {
  const { bookingId } = useParams();
  const [search] = useSearchParams();
  const nurseId = search.get('nurseId') || '';
  const navigate = useNavigate();
  const [nature, setNature] = useState(NATURES[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please describe the issue.');
      return;
    }
    setSaving(true);
    try {
      await submitComplaint({ bookingId, nurseId, nature, description: description.trim() });
      navigate('/home-care/history');
    } catch (err) {
      setError(err.message || 'Could not submit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hc-page">
      <p><Link to="/home-care/history">← History</Link></p>
      <h1>Report nurse</h1>
      <form className="hc-form hc-card" onSubmit={submit}>
        <label>Nature</label>
        <select value={nature} onChange={(e) => setNature(e.target.value)}>
          {NATURES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <label>Description *</label>
        <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
        <button type="submit" className="hc-btn" disabled={saving}>{saving ? 'Submitting…' : 'Submit report'}</button>
      </form>
    </div>
  );
}
