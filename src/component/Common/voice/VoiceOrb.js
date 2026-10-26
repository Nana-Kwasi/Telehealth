import React, { memo, useEffect, useRef } from 'react';
import { startOrb } from './orbDraw';

/**
 * The voice-mode orb: one of five glassy, layered designs (see orbThemes), chosen at random
 * for each conversation by the dock.
 *
 * Each state has its own motion so the person can tell whose turn it is without reading:
 *   listening — the layers swell and ripple with the microphone level
 *   thinking  — the layers turn, alternate ones the other way
 *   speaking  — the core breathes and the layers pulse at speech rhythm
 *   muted     — faded and still
 *
 * Drawn on a canvas at 30 fps from a ref, so a level update never re-renders React.
 */
const SIZE = 168;

function VoiceOrb({ state, levelRef, onPress, variant = 0 }) {
  const canvas = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    return startOrb(el, variant, () => stateRef.current, () => levelRef?.current ?? 0, SIZE);
  }, [variant, levelRef]);

  const label = state === 'speaking' ? 'Interrupt' : state === 'listening' ? "I've finished speaking"
    : state === 'muted' ? 'Start listening' : 'Assistant is thinking';

  return (
    <button type="button" onClick={onPress} aria-label={label} title={label}
      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', borderRadius: '50%',
        width: SIZE, height: SIZE }}>
      <canvas ref={canvas} style={{ width: SIZE, height: SIZE, display: 'block' }} />
    </button>
  );
}

// Memoised so a chat re-render (every streamed token) does not re-render the orb as well.
export default memo(VoiceOrb);
