import React, { useState } from 'react';
import AiChat from './AiChat';
import AiClinicianBriefing from './AiClinicianBriefing';

/**
 * Clinician-facing entry point.
 *
 * Two modes, because they answer different needs: a conversation for
 * terminology, schedule and drafting, and a briefing for one specific patient
 * before a consultation. The briefing carries the review gate; the chat does
 * not need one because it never touches a patient's record.
 */
export default function AiClinicalAssistant({ role }) {
  const [mode, setMode] = useState('chat');

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.4rem', padding: '1.5rem 1.5rem 0' }}>
        {[['chat', 'Assistant'], ['briefing', 'Patient briefing']].map(([key, label]) => (
          <button key={key} onClick={() => setMode(key)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 999,
              padding: '0.4rem 0.95rem', fontSize: '0.82rem', fontWeight: 600,
              background: mode === key ? '#1d4ed8' : '#f1f5f9',
              color: mode === key ? '#fff' : '#475569',
            }}>{label}</button>
        ))}
      </div>
      {mode === 'chat' ? <AiChat clinician /> : <AiClinicianBriefing role={role} />}
    </div>
  );
}
