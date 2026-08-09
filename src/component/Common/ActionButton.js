// ─── ActionButton ────────────────────────────────────────────────────────────
// One button for every create / update / delete action.
//
// The pattern it replaces was written out by hand on each screen: a `saving`
// state, a try/finally to clear it, a disabled attribute, and a label swapped for
// "Saving…". Screens that skipped a piece of that let the user double-submit, or
// left the button looking idle while a request was in flight — which is how
// duplicate resources and double-booked appointments happen.
//
// Pass an async `onClick`; the button spins and stays disabled until the promise
// settles, and it will not fire again while busy. If the promise rejects, the
// error is re-thrown so the caller's own error handling still runs.
//
//   <ActionButton onClick={save}>Save changes</ActionButton>
//   <ActionButton variant="danger" busyLabel="Deleting…" onClick={remove}>
//     Delete
//   </ActionButton>

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './ActionButton.css';

export default function ActionButton({
  onClick,
  children,
  busyLabel,
  variant = 'primary',   // primary | secondary | danger | ghost
  size = 'md',           // sm | md
  disabled = false,
  type = 'button',
  className = '',
  icon = null,
  title,
  ...rest
}) {
  const [busy, setBusy] = useState(false);
  // A create/delete handler often unmounts the screen (navigate away, close the
  // modal). Setting state after that warns and leaks, so track liveness.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const handleClick = useCallback(async (e) => {
    if (busy || disabled) return;
    if (typeof onClick !== 'function') return;
    setBusy(true);
    try {
      await onClick(e);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, disabled, onClick]);

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={busy || disabled}
      aria-busy={busy}
      title={title}
      className={`nh-action-btn nh-action-${variant} nh-action-${size} ${busy ? 'is-busy' : ''} ${className}`.trim()}
      {...rest}
    >
      {busy && <span className="nh-spinner" aria-hidden="true" />}
      <span className="nh-action-label">
        {busy ? (busyLabel || children) : (
          <>
            {icon}
            {children}
          </>
        )}
      </span>
    </button>
  );
}
