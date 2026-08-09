// ─── VoiceNote ───────────────────────────────────────────────────────────────
// WhatsApp-style voice message bubble: play/pause, a scrubbable waveform, and a
// duration that counts as it plays.
//
// The old markup dropped a raw <audio controls> into the bubble. It looked like a
// browser widget rather than part of the conversation, and it showed 0:00 / 0:00
// because it was pointed at `message.content.url` — undefined once attachments
// stopped round-tripping their metadata.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import './VoiceNote.css';

// A fixed pseudo-random bar pattern. Real waveform extraction needs decoding the
// whole file; this reads as a voice note without that cost, and stays stable
// across renders so bars don't jitter.
const BARS = [3, 6, 10, 14, 9, 12, 18, 22, 16, 11, 7, 13, 19, 24, 17, 12, 8, 14, 20, 15, 10, 6, 11, 16, 21, 13, 9, 5, 8, 12];

function fmt(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceNote({ src, mimeType, duration, isOwn = false }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Prefer the duration recorded at send time: a streamed/opaque response often
  // reports Infinity for audio.duration until it has fully buffered.
  const [total, setTotal] = useState(Number(duration) || 0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onTime = () => setElapsed(el.currentTime);
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setTotal(el.duration);
    };
    const onEnd = () => { setPlaying(false); setElapsed(0); };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      // Only one voice note at a time, like a messaging app.
      document.querySelectorAll('audio.vn-audio').forEach((other) => {
        if (other !== el) other.pause();
      });
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const seek = useCallback((e) => {
    const el = audioRef.current;
    if (!el || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    el.currentTime = ratio * total;
    setElapsed(el.currentTime);
  }, [total]);

  const progress = total > 0 ? Math.min(elapsed / total, 1) : 0;

  if (!src) {
    return <div className="vn vn-missing">Voice message unavailable</div>;
  }

  return (
    <div className={`vn ${isOwn ? 'vn-own' : 'vn-peer'}`}>
      <button
        type="button"
        className="vn-btn"
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <div
        className="vn-wave"
        onClick={seek}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={(e) => {
          const el = audioRef.current;
          if (!el || !total) return;
          if (e.key === 'ArrowRight') el.currentTime = Math.min(el.currentTime + 3, total);
          if (e.key === 'ArrowLeft') el.currentTime = Math.max(el.currentTime - 3, 0);
        }}
      >
        {BARS.map((h, i) => (
          <span
            key={i}
            className={`vn-bar ${i / BARS.length <= progress ? 'vn-bar-played' : ''}`}
            style={{ height: `${h + 6}px` }}
          />
        ))}
      </div>

      <span className="vn-time">{fmt(playing || elapsed ? elapsed : total)}</span>

      <audio ref={audioRef} className="vn-audio" preload="metadata" src={src}>
        {mimeType ? <source src={src} type={mimeType} /> : null}
      </audio>
    </div>
  );
}
