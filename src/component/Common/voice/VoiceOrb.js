import React, { memo, useEffect, useRef } from 'react';

/**
 * The voice-mode visual, ported from the Bankai care app's orb: three wavy rings around a
 * glowing core, in NessaHub's colours.
 *
 * Each state has its own motion so the person can tell, without reading anything, whose turn
 * it is:
 *   listening — the rings ripple with the microphone level; silence is almost still
 *   thinking  — the rings draw in and spin, and a spark orbits them
 *   speaking  — the core breathes and the rings pulse at speech rhythm
 *   muted     — grey and still
 *
 * Drawn on a canvas at 30 fps from a ref, so a level update never re-renders React.
 */
const SIZE = 168;
const C = SIZE / 2;
const POINTS = 48;
const FRAME_MS = 33;

const ringsFor = (accent) => [
  { color: accent, base: 50, lobes: 3, speed: 0.9, amp: 0.16, width: 3.2, opacity: 0.95 },
  { color: '#7870e8', base: 56, lobes: 5, speed: -0.7, amp: 0.12, width: 2.4, opacity: 0.8 },
  { color: '#e8a33d', base: 44, lobes: 4, speed: 1.3, amp: 0.1, width: 2, opacity: 0.75 },
];

function traceRing(g, ring, t, energy, spin) {
  g.beginPath();
  for (let i = 0; i <= POINTS; i += 1) {
    const a = (i / POINTS) * Math.PI * 2;
    const wobble = Math.sin(ring.lobes * a + t * ring.speed * 2 + spin) * ring.amp * energy
      + Math.sin((ring.lobes + 2) * a - t * 1.7) * 0.03 * (0.4 + energy);
    const r = ring.base * (1 + wobble);
    const x = C + r * Math.cos(a + spin * ring.speed);
    const y = C + r * Math.sin(a + spin * ring.speed);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function VoiceOrb({ state, levelRef, onPress, accent = '#5046bd' }) {
  const canvas = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    const dpr = window.devicePixelRatio || 1;
    el.width = SIZE * dpr;
    el.height = SIZE * dpr;
    const g = el.getContext('2d');
    g.scale(dpr, dpr);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const rings = ringsFor(accent);
    const deep = shade(accent, -0.25);
    let smooth = 0;
    let spin = 0;
    let raf = 0;
    let drawn = 0;
    let last = performance.now();
    const start = last;

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - drawn < FRAME_MS) return;
      drawn = now;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const time = reduce ? 0 : (now - start) / 1000;
      const s = stateRef.current;

      let target;
      if (s === 'listening') target = levelRef?.current ?? 0;
      // No output meter, so speech rhythm is synthesised: two slow beats multiplied give an
      // uneven, syllable-like pulse instead of a metronome.
      else if (s === 'speaking') target = 0.35 + 0.45 * Math.abs(Math.sin(time * 6.1)) * Math.abs(Math.sin(time * 2.3));
      else if (s === 'thinking') target = 0.25;
      else target = 0.05;
      // Rise fast, fall slow: how a VU meter reads, and why it looks alive rather than jittery.
      smooth += (target - smooth) * (target > smooth ? 0.35 : 0.08);
      if (!reduce) spin += dt * (s === 'thinking' ? 2.4 : 0.25);

      const muted = s === 'muted';
      const energy = muted ? 0 : smooth;
      g.clearRect(0, 0, SIZE, SIZE);

      // Halo
      const halo = g.createRadialGradient(C, C, C * 0.5, C, C, C);
      halo.addColorStop(0, rgba(accent, muted ? 0 : 0.18 + energy * 0.2));
      halo.addColorStop(1, rgba(accent, 0));
      g.fillStyle = halo;
      g.beginPath();
      g.arc(C, C, C, 0, Math.PI * 2);
      g.fill();

      // Rings
      g.lineJoin = 'round';
      rings.forEach((ring) => {
        traceRing(g, ring, time, energy, spin);
        g.strokeStyle = rgba(muted ? '#b7c4c2' : ring.color, ring.opacity);
        g.lineWidth = ring.width;
        g.stroke();
      });

      // Core
      const coreR = 30 + smooth * (s === 'speaking' ? 9 : 6) + (s === 'thinking' ? -4 : 0);
      const core = g.createRadialGradient(C - coreR * 0.1, C - coreR * 0.2, 0, C, C, coreR * 1.2);
      core.addColorStop(0, muted ? '#c9d4d3' : '#f1efff');
      core.addColorStop(0.55, muted ? '#9fb1af' : accent);
      core.addColorStop(1, muted ? '#7e918f' : deep);
      g.fillStyle = core;
      g.beginPath();
      g.arc(C, C, coreR, 0, Math.PI * 2);
      g.fill();

      // The spark that orbits while it thinks
      if (s === 'thinking') {
        const a = spin * 1.6;
        g.fillStyle = '#e8a33d';
        g.beginPath();
        g.arc(C + 62 * Math.cos(a), C + 62 * Math.sin(a), 4, 0, Math.PI * 2);
        g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [accent, levelRef]);

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

function parse(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function shade(hex, k) {
  const [r, g, b] = parse(hex).map((v) => Math.round(Math.max(0, Math.min(255, v * (1 + k)))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Memoised so a chat re-render (every streamed token) does not re-render the orb as well.
export default memo(VoiceOrb);
