import React, { useState, useEffect } from 'react';
import { api, getStoredUserId } from '../../services/apiClient';
import { resolveFileUrl } from '../../utils/fileUrl';
import AiMarkdown from './AiMarkdown';

/**
 * Generate a pre-consultation briefing for one patient.
 *
 * Two things this screen is careful about:
 *
 *  1. The patient list comes from the clinician's OWN roster, and the backend
 *     re-checks the relationship anyway. Picking a name here is not what grants
 *     access — the server decides that independently.
 *
 *  2. Nothing generated reaches a record. Accept hands the text back to the
 *     caller for a clinician to paste or save deliberately; there is no path
 *     from this screen into a clinical note on its own.
 */
export default function AiClinicianBriefing({ role = 'THERAPIST', onAccept }) {
  const [people, setPeople]   = useState([]);
  const [subject, setSubject] = useState(null);
  const [request, setRequest] = useState('Summarise what I should know before this consultation.');
  const [result, setResult]   = useState(null);
  const [edited, setEdited]   = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [restricted, setRestricted] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Therapists and doctors have different rosters; both are already
        // scoped to the caller by the backend.
        const rows = role === 'DOCTOR'
          ? await api('/api/v1/doctors/me/patients').catch(() => [])
          : await api('/api/v1/therapy-management/clients').catch(() => []);
        const list = Array.isArray(rows) ? rows : (rows?.items || []);

        // Only people this clinician is actually assigned to.
        //
        // An ADMIN therapist's roster returns the whole platform, but the AI
        // authorisation check is assignment-based and refuses the rest. Listing
        // them anyway meant picking a name and being told "you are not
        // authorised" — and with four different accounts all called "Nana
        // Kwasi", one of which IS assigned, that read as a random failure.
        //
        // The server rule is the safety boundary and is not being widened; the
        // picker is being brought into line with it.
        const me = getStoredUserId();
        const mine = list.filter((p) => !p.therapistId || String(p.therapistId) === String(me));
        setPeople(mine.length ? mine : list);
        setRestricted(mine.length > 0 && mine.length < list.length ? list.length - mine.length : 0);
      } catch (e) {
        setError(e.message || 'Could not load your patient list.');
      } finally {
        setLoading(false);
      }
    })();
  }, [role]);

  const generate = async () => {
    if (!subject) { setError('Choose a patient first.'); return; }
    setBusy(true); setError(''); setMessage(''); setResult(null); setEditing(false);
    try {
      const res = await api('/api/v1/ai/assist', {
        method: 'POST',
        body: { task: 'CLINICIAN_BRIEFING', message: request, subjectId: subject.id },
      });
      setResult(res);
      setEdited(res.text || '');
      if (!res.ok) {
        // "Not authorised" is about the ASSIGNMENT, not the login, and users
        // read the raw sentence as "I am not signed in".
        setError(/not authoris|not authentic/i.test(res.text || '')
          ? `${subject.name} is not assigned to you, so their records cannot be used here. `
            + 'Ask an administrator to assign them if you are taking over their care.'
          : res.text);
      }
    } catch (e) {
      setError(e.message || 'Could not generate the briefing.');
    } finally { setBusy(false); }
  };

  const nameOf = (p) => p.fullName || p.name || p.displayName || p.email || 'Unnamed';

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Consultation briefing</h1>
        <span style={{ background: '#eef2ff', color: '#3730a3', borderRadius: 999,
                       padding: '2px 10px', fontSize: '0.7rem', fontWeight: 800 }}>AI</span>
      </div>
      <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.9rem' }}>
        A short briefing built from records you already have access to. Verify before you rely on it.
      </p>

      {error   ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      <div style={card}>
        <label style={label}>Patient</label>
        {loading ? (
          <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading your list…</div>
        ) : people.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
            You have nobody assigned yet.
          </div>
        ) : (
          <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            style={{ ...input, marginBottom: '0.5rem' }}
          />
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0',
                        borderRadius: 8, padding: '0.4rem' }}>
            {people
              .filter((p) => {
                const q = query.trim().toLowerCase();
                if (!q) return true;
                return `${nameOf(p)} ${p.email || ''}`.toLowerCase().includes(q);
              })
              .map((p) => {
              const id = p.id || p.userId || p.clientId;
              const on = subject && (subject.id === id);
              return (
                <button key={id} onClick={() => { setSubject({ id, name: nameOf(p) }); setResult(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%',
                    textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 8,
                    padding: '0.5rem 0.6rem', marginBottom: 2, fontSize: '0.87rem',
                    background: on ? '#1d4ed8' : 'transparent', color: on ? '#fff' : '#334155',
                  }}>
                  {p.photoURL ? (
                    <img src={resolveFileUrl(p.photoURL)} alt="" style={{ width: 26, height: 26,
                         borderRadius: '50%', objectFit: 'cover' }} />
                  ) : null}
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{nameOf(p)}</span>
                    {/* The email disambiguates namesakes — four separate
                        accounts share the name "Nana Kwasi". */}
                    {p.email ? (
                      <span style={{ fontSize: '0.74rem', opacity: on ? 0.85 : 0.65 }}>
                        {p.email}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {restricted > 0 ? (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.74rem', color: '#64748b' }}>
              {restricted} other {restricted === 1 ? 'person is' : 'people are'} on the platform
              but not assigned to you, so their records cannot be summarised here.
            </p>
          ) : null}
          </>
        )}

        <label style={{ ...label, marginTop: '1rem' }}>What do you want summarised?</label>
        <textarea rows={3} style={input} value={request}
          onChange={(e) => setRequest(e.target.value)} />

        <button onClick={generate} disabled={busy || !subject}
          style={{ marginTop: '0.9rem', background: '#1d4ed8', color: '#fff', border: 'none',
                   borderRadius: 8, padding: '0.65rem 1.3rem', fontWeight: 600,
                   cursor: 'pointer', opacity: busy || !subject ? 0.55 : 1 }}>
          {busy ? 'Generating…' : subject ? `Brief me on ${subject.name}` : 'Choose a patient'}
        </button>
      </div>

      {result && result.ok ? (
        <div style={{ ...card, marginTop: '1.25rem' }}>
          {result.disclaimer ? (
            <div style={{ background: '#fefce8', border: '1px solid #fde68a', color: '#854d0e',
                          borderRadius: 8, padding: '0.55rem 0.8rem', fontSize: '0.78rem',
                          fontWeight: 600, marginBottom: '0.9rem' }}>
              {result.disclaimer}
            </div>
          ) : null}

          {editing ? (
            <textarea rows={16} value={edited} onChange={(e) => setEdited(e.target.value)}
              style={{ ...input, fontFamily: 'inherit', lineHeight: 1.6 }} />
          ) : (
            /* Text, never HTML — the model is not a trusted author. */
            <AiMarkdown text={edited || result.text} />
          )}

          <div style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: '1px solid #f1f5f9' }}>
            {/* These four had no explanation at all, which made a draft look
                like something the system was about to act on. It is not: this
                is a draft on screen, and nothing here writes to the record. */}
            <p style={{ margin: '0 0 0.7rem', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.55 }}>
              This is a draft for you to check. Nothing has been saved to {subject?.name || 'the'}
              {subject ? "'s" : ''} record.
              <strong> Edit</strong> to correct it, <strong>Regenerate</strong> for another attempt,
              <strong> Accept</strong> to copy it out for your notes, or <strong>Discard</strong> to
              throw it away.
            </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button style={ghost} onClick={() => setEditing(!editing)}
              title="Correct the wording before you use it">
              {editing ? 'Done editing' : 'Edit'}
            </button>
            <button style={ghost} onClick={generate} disabled={busy}
              title="Throw this draft away and generate another">Regenerate</button>
            <button style={{ ...ghost, background: '#166534', color: '#fff', border: 'none' }}
              onClick={() => {
                const text = edited || result.text;
                onAccept?.(text, result.auditId, subject);
                // Put it on the clipboard: "copy it into your notes" without
                // actually copying anything was an instruction, not a feature.
                try { navigator.clipboard?.writeText(text); } catch { /* not fatal */ }
                setMessage('Copied to your clipboard. Nothing was written to the record — paste it into your notes.');
              }}>
              Accept
            </button>
            <button style={{ ...ghost, color: '#991b1b', borderColor: '#fecaca' }}
              onClick={() => { setResult(null); setEdited(''); setMessage('Draft discarded. Nothing was saved.'); }}
              title="Throw this draft away">
              Discard
            </button>
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Banner({ tone, children }) {
  const ok = tone === 'ok';
  return (
    <div style={{
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      color: ok ? '#166534' : '#991b1b',
      padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem',
    }}>{children}</div>
  );
}

const card  = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' };
const label = { display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.35rem' };
const input = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1',
                borderRadius: 8, fontSize: '0.87rem', boxSizing: 'border-box' };
const ghost = { background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8,
                padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' };
