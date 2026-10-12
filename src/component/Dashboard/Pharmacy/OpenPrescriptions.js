import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import Paged from '../../Common/Paged';

/**
 * Prescriptions a prescriber offered to every approved NessaHub pharmacy.
 *
 * Only what is needed to decide whether you can fill it is shown: medicines,
 * strengths, quantities and the patient's city — no name, no diagnosis. Taking
 * one locks it to your pharmacy (first to press wins) and opens the usual
 * prescription workflow. If you then do not update it in time it is offered to
 * the others again.
 */
export default function OpenPrescriptions() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [takingId, setTakingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/v1/pharmacy/open-prescriptions');
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Could not load open prescriptions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const take = async (id) => {
    setTakingId(id);
    try {
      await api(`/api/v1/pharmacy/open-prescriptions/${id}/take`, { method: 'POST', body: {} });
      navigate(`/dashboard/prescriptions/${id}`);
    } catch (e) {
      alert(e?.message || 'Could not take this prescription.');
      load();
    } finally {
      setTakingId(null);
    }
  };

  return (
    <div className="pharmacy-page">
      <div className="pharmacy-page-header" style={{ marginBottom: '1rem' }}>
        <h1 className="pharmacy-page-title" style={{ margin: 0 }}>Open prescriptions</h1>
        <p className="pharmacy-page-sub" style={{ margin: '0.25rem 0 0', color: '#64748b' }}>
          Offered to every NessaHub pharmacy. The first to take one prepares it.
        </p>
      </div>

      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {loading ? <p style={{ color: '#94a3b8' }}>Loading…</p> : rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          No open prescriptions right now.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <Paged items={rows}>{(rows) => rows.map(rx => (
            <div key={rx.id} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '1rem 1.1rem', display: 'flex', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#0f172a', fontSize: '0.9rem' }}>
                  {(rx.medications || []).map((m, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>
                      <strong>{m.name}</strong>{m.strength ? ` ${m.strength}` : ''}{m.drugForm ? ` · ${m.drugForm}` : ''}
                      {m.quantity ? ` · ${m.quantity}${m.quantityUnit ? ` ${m.quantityUnit}` : ''}` : ''}
                    </li>
                  ))}
                </ul>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  {rx.patientCity ? `Patient's city: ${rx.patientCity} · ` : ''}
                  {rx.createdAt ? `Issued ${new Date(rx.createdAt).toLocaleString()}` : ''}
                  {rx.expiresAt ? ` · valid until ${new Date(rx.expiresAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => take(rx.id)} disabled={takingId === rx.id}
                style={{ padding: '0.55rem 1.1rem', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {takingId === rx.id ? 'Taking…' : 'Take this prescription'}
              </button>
            </div>
          ))}</Paged>
        </div>
      )}
    </div>
  );
}
