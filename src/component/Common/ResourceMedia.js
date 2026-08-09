// ─── ResourceMedia (web) ─────────────────────────────────────────────────────
// Renders a resource as what it actually is: an image to view, audio to play, a
// video to watch, a file to download, or a link to open.
//
// Choosing "Image" or "Audio" on the therapist form used to change only a label —
// the client screen had nowhere to show the attachment. This is the client-facing
// half, and it mirrors the mobile ResourceMedia component.

import React, { useState } from 'react';
import { FileText, Download, ExternalLink, PlayCircle } from 'lucide-react';
import ChatImage from './ChatImage';
import { downloadFile } from '../../utils/downloadFile';
import './ResourceMedia.css';

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ResourceMedia({ resource }) {
  const [busy, setBusy] = useState(false);
  if (!resource) return null;

  const type = String(resource.type || '').toLowerCase();
  const fileUrl = resource.fileUrl || '';
  const linkUrl = resource.linkUrl || resource.url || '';

  // A blob: url is left over from the old upload path — it only ever resolved in
  // the tab that created it, so treat it as no attachment at all rather than
  // rendering a broken image.
  const usableFile = fileUrl && !fileUrl.startsWith('blob:') ? fileUrl : '';

  if (type === 'image' && usableFile) {
    return (
      <div className="rm-wrap">
        <ChatImage src={usableFile} name={resource.fileName || resource.title || 'Image'} />
      </div>
    );
  }

  if (type === 'audio' && usableFile) {
    return (
      <div className="rm-wrap">
        <audio className="rm-audio" src={usableFile} controls preload="metadata">
          Your browser cannot play this audio.
        </audio>
      </div>
    );
  }

  if (type === 'video') {
    if (usableFile) {
      return (
        <div className="rm-wrap">
          <video className="rm-video" src={usableFile} controls preload="metadata" />
        </div>
      );
    }
    if (linkUrl) {
      return (
        <a className="rm-row" href={linkUrl} target="_blank" rel="noopener noreferrer">
          <PlayCircle size={20} />
          <span className="rm-name">Watch video</span>
          <ExternalLink size={16} />
        </a>
      );
    }
  }

  if (usableFile) {
    return (
      <button
        type="button"
        className="rm-row"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await downloadFile(usableFile, resource.fileName || resource.title || 'attachment');
          setBusy(false);
        }}
      >
        <FileText size={20} />
        <span className="rm-name">
          {resource.fileName || 'Attachment'}
          {resource.fileSize ? <span className="rm-meta"> · {fmtSize(resource.fileSize)}</span> : null}
        </span>
        <Download size={16} />
      </button>
    );
  }

  if (linkUrl) {
    return (
      <a className="rm-row" href={linkUrl} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={20} />
        <span className="rm-name">{linkUrl}</span>
      </a>
    );
  }

  return null;
}
