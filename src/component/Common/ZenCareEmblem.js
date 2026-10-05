import React from 'react';
import emblemArtwork from '../../assets/zencare-emblem.png';

/**
 * The ZenCare mark: a butterfly rising from a cupped hand inside an open,
 * brush-drawn gold ring.
 *
 * Renders the real artwork by default. Two things follow from the file itself:
 *
 *  - It has NO alpha channel — the navy is baked in. So the surface behind it
 *    must be the same navy or the emblem shows as a rectangle. That is why the
 *    ground tokens in zencare.css are sampled from this exact file rather than
 *    judged by eye.
 *  - It is 1402x1122, not square, and the mark sits right-of-centre within it.
 *    Callers size it by WIDTH and let the height follow, rather than forcing a
 *    square box and squashing it.
 *
 * `fallback` draws a vector stand-in instead — deliberately quiet, because
 * vector paths cannot reproduce a painted brush stroke and the attempt to fake
 * one looked like a cartoon.
 */
export default function ZenCareEmblem({
  size = 320,
  className = '',
  style,
  src = emblemArtwork,
  alt = '',
  fallback = false,
}) {
  // Unique ids: two emblems on one page would otherwise share a gradient and
  // the second would inherit the first's. Called before any early return —
  // a hook must run in the same order on every render.
  const uid = React.useId().replace(/:/g, '');

  if (src && !fallback) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        // Width-driven: the artwork is 1402x1122, and forcing a square would
        // squash it.
        style={{ width: size, height: 'auto', display: 'block', ...style }}
        aria-hidden={alt ? undefined : 'true'}
      />
    );
  }

  const ring = `zc-ring-${uid}`;
  const line = `zc-line-${uid}`;

  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 400 400"
      fill="none"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        {/* Light rakes around the ring rather than running flat across it. */}
        <linearGradient id={ring} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#8a6b2f" />
          <stop offset="22%" stopColor="#e8d6a8" />
          <stop offset="45%" stopColor="#c9a961" />
          <stop offset="68%" stopColor="#f0e3c0" />
          <stop offset="100%" stopColor="#9c7c38" />
        </linearGradient>
        <linearGradient id={line} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d9bd7c" />
          <stop offset="100%" stopColor="#b08f49" />
        </linearGradient>
      </defs>

      {/* ── Ring ────────────────────────────────────────────────────────────
          Three passes of decreasing weight, each slightly offset, which is how
          a single brush sweep reads without pretending to be raster texture.
          Left open on the right so the dots escape through the gap. */}
      <g fill="none" strokeLinecap="round" stroke={`url(#${ring})`}>
        <path
          d="M296 74 C236 30 142 38 92 98 C38 162 44 262 110 316 C170 366 258 358 306 300"
          strokeWidth="6"
          opacity="0.95"
        />
        <path
          d="M302 84 C244 44 156 52 108 108 C58 166 62 254 118 306"
          strokeWidth="2"
          opacity="0.6"
        />
        <path
          d="M126 322 C182 364 254 356 300 310"
          strokeWidth="1.4"
          opacity="0.45"
        />
      </g>

      {/* ── Butterfly and hand ──────────────────────────────────────────────
          Kept to single thin strokes. The reference has real weight variation
          here; imitating it with vectors is what looked wrong before. */}
      <g fill="none" stroke={`url(#${line})`} strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        {/* Upper wings — swept back and up, wider than they are tall. */}
        <path d="M204 150 C178 116 140 116 136 148 C132 182 166 200 202 202" strokeWidth="2.6" />
        <path d="M212 150 C240 112 282 114 286 148 C290 184 250 202 214 204" strokeWidth="2.6" />
        {/* Lower wings — smaller, rounded, tucked under. */}
        <path d="M202 206 C180 214 172 234 184 246 C196 256 208 240 208 222" strokeWidth="2.2" />
        <path d="M214 208 C238 216 248 234 238 247 C226 258 216 242 214 224" strokeWidth="2.2" />
        {/* Body and antennae. */}
        <path d="M208 148 C207 178 207 206 209 232" strokeWidth="2.4" />
        <path d="M206 150 C196 134 186 124 176 120" strokeWidth="1.5" />
        <path d="M212 150 C222 132 232 122 242 118" strokeWidth="1.5" />
        {/* A suggestion of veining, not a diagram of it. */}
        <path d="M190 160 C176 166 168 178 168 190" strokeWidth="1.2" opacity="0.7" />
        <path d="M230 158 C248 164 260 176 262 188" strokeWidth="1.2" opacity="0.7" />

        {/* Cupped hand — one long sweep for wrist and palm, fingers fanning up
            to the right so the butterfly reads as lifting off them. */}
        <path d="M92 276 C124 262 156 268 182 284 C202 296 222 300 242 292" strokeWidth="3" />
        <path d="M98 292 C132 282 162 292 186 306 C208 318 232 318 254 306" strokeWidth="2" opacity="0.8" />
        <path d="M242 292 C256 278 270 268 284 262" strokeWidth="2.6" />
        <path d="M250 300 C264 288 280 278 294 274" strokeWidth="2.2" />
        <path d="M256 308 C270 298 286 290 300 286" strokeWidth="1.8" opacity="0.85" />
      </g>

      {/* ── Escaping dots ───────────────────────────────────────────────────
          They swell away from the ring's gap and fade, which is what gives the
          mark its direction. */}
      <g fill={`url(#${line})`}>
        <circle cx="326" cy="126" r="2.5" opacity="0.5" />
        <circle cx="340" cy="150" r="4" opacity="0.7" />
        <circle cx="349" cy="180" r="5.5" opacity="0.85" />
        <circle cx="352" cy="212" r="6" opacity="0.9" />
        <circle cx="348" cy="244" r="5" opacity="0.8" />
        <circle cx="339" cy="270" r="3.5" opacity="0.6" />
        <circle cx="328" cy="290" r="2.2" opacity="0.4" />
      </g>
    </svg>
  );
}
