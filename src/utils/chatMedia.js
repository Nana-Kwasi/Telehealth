import { API_BASE } from '../services/apiClient';

// ─── Chat attachment helpers ─────────────────────────────────────────────────
// Attachments have travelled in several shapes over time: `content` as an object
// {url,name,type}, `content` as a bare URL string, or the URL parked in `body`
// with only `mediaUrl`/`fileUrl` alongside. A renderer that reads exactly one of
// those shows a broken image (or a 0:00 player) for everything else, which is
// what receivers were seeing.

/**
 * Point a stored media URL at the host this app can actually reach.
 *
 * Attachments are saved with an absolute URL built from whatever host the
 * UPLOADER was on — a phone on a laptop hotspot stores 172.20.x.x, which no
 * other network can resolve. The file id and its capability token travel fine;
 * only the origin goes stale. Keep the path, swap the origin.
 *
 * Only our own /api/ routes are rewritten: an external link must be left alone.
 */
function resolveMediaHost(url) {
  if (!url) return url;
  const raw = String(url).trim();
  if (raw.startsWith('/')) return `${API_BASE}${raw}`;
  const m = /^https?:\/\/[^/]+(\/.*)$/i.exec(raw);
  if (!m || !m[1].startsWith('/api/')) return raw;
  return `${API_BASE}${m[1]}`;
}

/** Best available URL for a message's attachment, or '' when there isn't one. */
export function mediaUrlOf(message) {
  if (!message) return '';
  const c = message.content;
  if (c && typeof c === 'object' && c.url) return resolveMediaHost(c.url);
  if (message.mediaUrl) return resolveMediaHost(message.mediaUrl);
  if (message.fileUrl) return resolveMediaHost(message.fileUrl);
  // Older rows stored the URL as the message body.
  const body = typeof c === 'string' ? c : (message.text || message.body || '');
  return /^https?:\/\//i.test(body) ? resolveMediaHost(body) : '';
}

/** Display name for a file attachment. */
export function fileNameOf(message) {
  const c = message?.content;
  if (c && typeof c === 'object' && c.name) return c.name;
  if (message?.fileName) return message.fileName;

  // Fall back to the last path segment — but our file urls end in "/raw", which
  // is a route, not a name. Showing "raw" as the filename is worse than a
  // generic label, so use one based on the message type instead.
  const url = mediaUrlOf(message);
  let candidate = '';
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const last = segments.pop();
    if (last && last !== 'raw') candidate = decodeURIComponent(last);
  } catch { /* not a parseable url */ }
  if (candidate) return candidate;

  const type = String(message?.type || '').toLowerCase();
  if (type === 'image') return 'Photo';
  if (type === 'audio') return 'Voice message';
  if (type === 'video') return 'Video';
  return 'Attachment';
}

/** Human-readable size, or '' when unknown. */
export function fileSizeOf(message) {
  const bytes = Number(message?.content?.size ?? message?.fileSize);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
