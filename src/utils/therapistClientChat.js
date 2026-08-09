/** Message helpers — aligned with doctor/medical chat (fileUrl + legacy content). */

export function getMessageMediaUrl(msg) {
  if (!msg) return null;
  return msg.fileUrl || msg.mediaUrl || (typeof msg.content === 'object' ? msg.content?.url : null) || null;
}

export function getMessageText(msg) {
  if (!msg) return '';
  if (typeof msg.text === 'string') return msg.text;
  if (typeof msg.content === 'string') return msg.content;
  return '';
}

export function getMessageFileName(msg) {
  return msg.fileName || (typeof msg.content === 'object' ? msg.content?.name : null) || 'File';
}

export function getMessageFileSize(msg) {
  return msg.fileSize || (typeof msg.content === 'object' ? msg.content?.size : 0) || 0;
}

export function getMessageDuration(msg) {
  return Number(msg.duration || (typeof msg.content === 'object' ? msg.content?.duration : 0) || 0);
}

export function normalizeMessageType(msg) {
  const t = msg?.type;
  if (t === 'document') return 'file';
  if (t === 'video') return 'image';
  return t || 'text';
}

export function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
