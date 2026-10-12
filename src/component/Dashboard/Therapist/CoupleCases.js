import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, ArrowLeft, ShieldAlert, RefreshCw } from 'lucide-react';
import { listMyCouples, getCoupleCaseForTherapist } from '../../../services/coupleTherapyService';
import './CoupleCases.css';
import Paged from '../../Common/Paged';

// Web counterpart of the mobile TherapistCoupleCaseScreen. A therapist matched to
// a couple had no way to open the case on web at all — the couple lives in
// couple_registrations, not in the therapy-management assignments the Clients
// screen lists, so it never appeared anywhere in the web dashboard.

const PARTNER_LABEL = { A: 'Partner A', B: 'Partner B' };

/** Section payloads are stored as a JSON string; render whatever shape we get. */
function parseSectionData(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { value: String(parsed) };
  } catch {
    return { value: String(raw) };
  }
}

function prettyKey(k) {
  return String(k)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function renderValue(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function StatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  const tone =
    s.includes('matched') || s.includes('therapist_selected') || s === 'active' ? 'ok'
      : s.includes('proposed') || s.includes('pending') ? 'warn'
        : 'muted';
  return <span className={`cc-pill cc-pill-${tone}`}>{status || 'unknown'}</span>;
}

export default function CoupleCases() {
  const [couples, setCouples] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingCase, setLoadingCase] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const rows = await listMyCouples();
      setCouples(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e?.message || 'Could not load your couple cases.');
      setCouples([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const openCase = useCallback(async (coupleId) => {
    setSelectedId(coupleId);
    setLoadingCase(true);
    setError('');
    setCaseData(null);
    try {
      setCaseData(await getCoupleCaseForTherapist(coupleId));
    } catch (e) {
      setError(e?.message || 'Could not load this couple case.');
    } finally {
      setLoadingCase(false);
    }
  }, []);

  // Group the flat intake list by partner, newest section first.
  const intakesByPartner = useMemo(() => {
    const list = Array.isArray(caseData?.intakes) ? caseData.intakes : [];
    const out = { A: [], B: [] };
    list.forEach((row) => {
      const key = String(row.partnerKey || '').toUpperCase() === 'B' ? 'B' : 'A';
      out[key].push(row);
    });
    return out;
  }, [caseData]);

  const couple = caseData?.couple || caseData?.registration || null;

  if (selectedId && (loadingCase || caseData)) {
    return (
      <div className="cc-root">
        <button className="cc-back" onClick={() => { setSelectedId(null); setCaseData(null); }}>
          <ArrowLeft size={16} /> All couple cases
        </button>

        {loadingCase ? (
          <div className="cc-empty">Loading case…</div>
        ) : (
          <>
            <div className="cc-header">
              <h1>
                {couple?.partnerAName || couple?.partnerA?.name || 'Partner A'}
                {' & '}
                {couple?.partnerBName || couple?.partnerB?.name || 'Partner B'}
              </h1>
              <p className="cc-sub">
                Therapist-only record. Each partner answered privately and cannot see the other's answers.
              </p>
            </div>

            <div className="cc-meta">
              <div><span>Relationship</span><strong>{couple?.relationshipType || '—'}</strong></div>
              <div><span>Status</span><strong><StatusPill status={couple?.status} /></strong></div>
              <div><span>Both intakes complete</span><strong>{caseData?.bothIntakesComplete ? 'Yes' : 'No'}</strong></div>
              <div><span>Payment</span><strong>{couple?.paymentComplete ? 'Complete' : 'Outstanding'}</strong></div>
            </div>

            <div className="cc-privacy">
              <ShieldAlert size={16} />
              <span>
                These are confidential individual responses. Do not share one partner's answers with the other.
              </span>
            </div>

            {['A', 'B'].map((key) => (
              <section key={key} className="cc-partner">
                <h2>
                  {PARTNER_LABEL[key]} —{' '}
                  {key === 'A'
                    ? couple?.partnerAName || couple?.partnerA?.name || '—'
                    : couple?.partnerBName || couple?.partnerB?.name || '—'}
                </h2>
                {intakesByPartner[key].length === 0 ? (
                  <div className="cc-empty-sm">No intake sections submitted yet.</div>
                ) : (
                  intakesByPartner[key].map((row) => {
                    const data = parseSectionData(row.sectionData);
                    const entries = Object.entries(data);
                    return (
                      <div key={row.id} className="cc-section">
                        <div className="cc-section-head">
                          <h3>{prettyKey(row.sectionId)}</h3>
                          <span className="cc-when">{fmtDate(row.submittedAt || row.createdAt)}</span>
                        </div>
                        {entries.length === 0 ? (
                          <div className="cc-empty-sm">No answers recorded.</div>
                        ) : (
                          <dl className="cc-kv">
                            {entries.map(([k, v]) => (
                              <div key={k}>
                                <dt>{prettyKey(k)}</dt>
                                <dd>{renderValue(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    );
                  })
                )}
              </section>
            ))}
          </>
        )}
        {error ? <div className="cc-error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="cc-root">
      <div className="cc-header">
        <h1>Couple Cases</h1>
        <p className="cc-sub">Couples matched to you. Open a case to read both partners' private intake.</p>
      </div>

      <button className="cc-refresh" onClick={loadList} disabled={loadingList}>
        <RefreshCw size={14} /> {loadingList ? 'Loading…' : 'Refresh'}
      </button>

      {error ? <div className="cc-error">{error}</div> : null}

      {loadingList ? (
        <div className="cc-empty">Loading couple cases…</div>
      ) : couples.length === 0 ? (
        <div className="cc-empty">
          <Users size={28} />
          <p>No couples matched to you yet.</p>
          <span>A couple appears here once both partners confirm you as their therapist.</span>
        </div>
      ) : (
        <div className="cc-grid">
          <Paged items={couples}>{(couples) => couples.map((c) => (
            <button key={c.id || c.coupleId} className="cc-card" onClick={() => openCase(c.coupleId || c.id)}>
              <div className="cc-card-top">
                <Users size={18} />
                <StatusPill status={c.status} />
              </div>
              <h3>
                {c.partnerAName || c.partnerA?.name || 'Partner A'}
                {' & '}
                {c.partnerBName || c.partnerB?.name || 'Partner B'}
              </h3>
              <p className="cc-card-meta">{c.relationshipType || 'Relationship not specified'}</p>
              <p className="cc-card-meta">
                Intake: {c.partnerAIntakeComplete ? '✓' : '⏳'} A · {c.partnerBIntakeComplete ? '✓' : '⏳'} B
              </p>
            </button>
          ))}</Paged>
        </div>
      )}
    </div>
  );
}
