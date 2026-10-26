import { ORB_THEMES, layerPoints } from './orbThemes';

/**
 * Draws and animates one voice orb on a canvas until the returned function is called.
 * Kept free of React so it can be previewed on its own.
 *
 * @param el        the canvas
 * @param variant   which ORB_THEMES design
 * @param getState  () => 'listening' | 'thinking' | 'speaking' | 'muted'
 * @param getLevel  () => microphone level 0..1
 */
export function startOrb(el, variant, getState, getLevel, SIZE = 168) {
  const C = SIZE / 2;
  const FRAME_MS = 33;
    const theme = ORB_THEMES[variant % ORB_THEMES.length];
  const dpr = window.devicePixelRatio || 1;
  el.width = SIZE * dpr;
  el.height = SIZE * dpr;
  const g = el.getContext('2d');
  g.scale(dpr, dpr);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let smooth = 0;
  let spin = 0;
  let raf = 0;
  let drawn = 0;
  let last = performance.now();
  const start = last;
  const n = theme.layers;

  const path = (pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };

  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    if (now - drawn < FRAME_MS) return;
    drawn = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = reduce ? 0 : (now - start) / 1000;
    const s = getState();

    let target;
    if (s === 'listening') target = getLevel();
    // No output meter, so speech rhythm is synthesised: two slow beats multiplied give an
    // uneven, syllable-like pulse instead of a metronome.
    else if (s === 'speaking') target = 0.3 + 0.45 * Math.abs(Math.sin(time * 6.1)) * Math.abs(Math.sin(time * 2.3));
    else if (s === 'thinking') target = 0.15;
    else target = 0;
    // Rise fast, fall slow — reads as alive rather than jittery.
    smooth += (target - smooth) * (target > smooth ? 0.35 : 0.08);
    if (!reduce) spin += dt * (s === 'thinking' ? 1.1 : 0.06);
    const muted = s === 'muted';
    const energy = muted ? 0 : smooth;

    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.globalAlpha = muted ? 0.45 : 1;

    // On white: no tinted tile behind the orb, just a faint glow of its own colour.
    const bd = g.createRadialGradient(C, C, C * 0.3, C, C, C);
    bd.addColorStop(0, hexA(theme.base, 0.16 + energy * 0.14));
    bd.addColorStop(1, hexA(theme.base, 0));
    g.fillStyle = bd;
    g.beginPath();
    g.arc(C, C, C, 0, Math.PI * 2);
    g.fill();

    // Shrink pointy or lobed designs so their tips stay inside the circle as they swell.
    // (A star's points are its full radius — only outward lobes need the room.)
    const outerR = (C * 0.88) / (theme.shape === 'star' ? 1 : 1 + theme.amp * 1.25);
    const innerR = C * 0.3;
    for (let k = 0; k < n; k += 1) {
      const f = n === 1 ? 1 : k / (n - 1);                 // 0 outer … 1 core
      const isCore = k === n - 1;
      const swell = 1 + energy * (0.1 - f * 0.05);
      const radius = (outerR - (outerR - innerR) * f) * swell;
      const dir = k % 2 ? -1 : 1;
      const rotation = (theme.interleave ? (k * Math.PI) / theme.lobes : 0) + spin * dir * (1 - f * 0.4);
      const wobble = energy * 0.025 * Math.sin(time * (3 + k));
      const pts = layerPoints(theme, C, C, radius, rotation, energy * (1 - f), wobble);

      // Glass fill: light at the centre, the theme colour toward the rim; the core is solid.
      const fill = g.createRadialGradient(C - radius * 0.15, C - radius * 0.2, radius * 0.05, C, C, radius);
      if (isCore) {
        fill.addColorStop(0, theme.light);
        fill.addColorStop(0.55, theme.core);
        fill.addColorStop(1, theme.deep);
      } else {
        fill.addColorStop(0, hexA(theme.light, 0.55));
        fill.addColorStop(1, hexA(theme.base, 0.42 + f * 0.22));
      }
      path(pts);
      g.fillStyle = fill;
      g.fill();

      // Light rays from the centre, clipped to the layer.
      if (!isCore && k === n - 2) {
        g.save();
        path(pts);
        g.clip();
        const rays = theme.lobes * 2;
        for (let j = 0; j < rays; j += 1) {
          const a = rotation + (j / rays) * Math.PI * 2;
          g.beginPath();
          g.moveTo(C, C);
          g.arc(C, C, radius, a - 0.05, a + 0.05);
          g.closePath();
          g.fillStyle = 'rgba(255,255,255,0.16)';
          g.fill();
        }
        g.restore();
      }

      // Rims: a coloured edge (it has to show on white) with a bright line just inside —
      // the cut-glass look.
      path(pts);
      g.lineJoin = 'round';
      g.strokeStyle = hexA(theme.deep, isCore ? 0.7 : 0.6);
      g.lineWidth = isCore ? 1.3 : 1.5;
      g.stroke();
      path(layerPoints(theme, C, C, radius * 0.975, rotation, energy * (1 - f), wobble, 72));
      g.strokeStyle = hexA(theme.rim, 0.95);
      g.lineWidth = 1.1;
      g.stroke();
    }

    // The small shaped opening at the centre.
    const hole = layerPoints(theme, C, C, C * 0.055 * (1 + energy * 0.3), spin * 2, 0, 0, 48);
    path(hole);
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = hexA(theme.deep, 0.8);
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
