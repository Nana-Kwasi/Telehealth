import React from 'react';

/**
 * A clinician's self-declared availability, wherever a client sees them.
 *
 * The status was already being set (therapist settings → "Current Status") and
 * already reaching the client — `/api/v1/therapists/{id}` hoists
 * availabilityStatus out of metadata — but nothing anywhere rendered it. A
 * therapist who set themselves to Away appeared exactly as before to everyone.
 *
 * Two deliberate choices:
 *
 *  1. An unset status renders NOTHING, rather than defaulting to "Available".
 *     Most clinicians have never opened that screen, and showing a green dot
 *     nobody chose would be the system asserting availability on their behalf.
 *
 *  2. The wording never promises a response time. "Available" describes what
 *     the clinician last said about themselves, not a service guarantee, and
 *     the title attribute says so.
 */

export const CLINICIAN_STATUS = {
  /* text measured on white; dots are non-text UI, so they only need 3:1 */
  available: { label: 'Available', dot: '#1f8a4c', text: '#146134' },  /* 7.53:1 · dot 4.38:1 */
  busy:      { label: 'Busy',      dot: '#c2410c', text: '#9a3708' },  /* 7.18:1 · dot 5.18:1 */
  away:      { label: 'Away',      dot: '#b45309', text: '#8a4b09' },  /* 6.79:1 · dot 5.02:1 */
  offline:   { label: 'Offline',   dot: '#6b7280', text: '#5b6170' },  /* 6.20:1 · dot 4.83:1 */
};

/** Normalise whatever the record holds; unknown or missing → null. */
export function clinicianStatusOf(source) {
  const raw = typeof source === 'string'
    ? source
    : source?.availabilityStatus || source?.availability_status;
  const key = String(raw || '').trim().toLowerCase();
  return CLINICIAN_STATUS[key] ? key : null;
}

export default function ClinicianStatus({ status, size = 'sm', showLabel = true, className }) {
  const key = clinicianStatusOf(status);
  if (!key) return null;

  const tone = CLINICIAN_STATUS[key];
  const dot = size === 'lg' ? 9 : 7;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        fontSize: size === 'lg' ? '0.8rem' : '0.72rem',
        fontWeight: 650,
        color: tone.text,
        whiteSpace: 'nowrap',
      }}
      title={`Set by your clinician as "${tone.label}". It is how they described their own availability, not a guaranteed response time.`}
    >
      <span
        aria-hidden="true"
        style={{
          width: dot, height: dot, borderRadius: '50%',
          background: tone.dot, flexShrink: 0,
        }}
      />
      {showLabel ? tone.label : null}
    </span>
  );
}
