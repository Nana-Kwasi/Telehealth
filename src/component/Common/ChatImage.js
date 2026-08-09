// ─── ChatImage ───────────────────────────────────────────────────────────────
// An image in a chat bubble, opened in an IN-APP lightbox.
//
// Clicking used to `window.open` the raw file url in a new tab, which dumped the
// user onto the API host (and its "not secure" interstitial) instead of showing
// the picture. Viewing an attachment should never leave the conversation.
//
// Also degrades gracefully when the browser can't decode the format: iPhone
// photos are HEIC, which iOS renders natively but no desktop browser can show.

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Download, X } from 'lucide-react';
import { downloadFile } from '../../utils/downloadFile';
import './ChatImage.css';

function Lightbox({ src, name, onClose }) {
  // Escape closes; lock background scroll while open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="ci-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <div className="ci-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="ci-lightbox-name">{name}</span>
        <div className="ci-lightbox-actions">
          <button
            type="button"
            className="ci-lightbox-btn"
            onClick={() => downloadFile(src, name)}
            title="Download"
          >
            <Download size={18} />
          </button>
          <button type="button" className="ci-lightbox-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
      </div>
      {/* Stop propagation so clicking the picture itself doesn't dismiss. */}
      <img className="ci-lightbox-img" src={src} alt={name} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}

export default function ChatImage({ src, name = 'Photo' }) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!src) return null;

  if (failed) {
    return (
      <button
        type="button"
        className="chat-image-fallback"
        onClick={() => downloadFile(src, name)}
        title="This image format can't be shown here — download it"
      >
        <ImageIcon size={20} />
        <span className="cif-text">
          <span className="cif-name">{name}</span>
          <span className="cif-hint">Preview unavailable — download</span>
        </span>
        <Download size={16} className="cif-icon" />
      </button>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={name}
        className="chat-image"
        loading="lazy"
        onError={() => setFailed(true)}
        onClick={() => setOpen(true)}
        title="Click to view"
      />
      {open && <Lightbox src={src} name={name} onClose={close} />}
    </>
  );
}
