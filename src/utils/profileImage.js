// ─── profileImage (web) ──────────────────────────────────────────────────────
// Upload and resolve a user's profile picture.
//
// Only therapy clients and home-care nurses had anywhere to store an image
// before; every other account type had no column, so the header avatar was
// always initials. The picture now lives on `users`, so one helper serves every
// role and every avatar resolves from the same field.

import { api, uploadFile, getStoredUserId } from '../services/apiClient';

/** Profile pictures are small by design — a headshot, not a document. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * Screens render avatars from different objects (a profile, a client record, a
 * nurse row) that each name the field differently. Check them in one place so an
 * image saved anywhere still shows up.
 */
export function avatarUrlOf(subject) {
  if (!subject) return null;
  const url =
    subject.avatarUrl
    || subject.photoURL
    || subject.profilePhotoUrl
    || subject.imageUrl
    || subject.photoUrl
    || null;
  // A blob: url only resolves in the tab that created it — treat as absent
  // rather than rendering a broken image.
  if (!url || String(url).startsWith('blob:')) return null;
  return url;
}

/** Initials fallback, so a missing picture still reads as the right person. */
export function initialsOf(subject, fallback = '?') {
  const name =
    subject?.fullName || subject?.name || subject?.displayName || subject?.email || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Upload a chosen File and save it as the user's avatar.
 * @returns the stored url.
 */
export async function uploadAvatar(file, userId) {
  if (!file) throw new Error('Choose an image first.');
  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please choose one under ${MAX_AVATAR_BYTES / 1024 / 1024} MB.`,
    );
  }

  const uid = userId || getStoredUserId();
  if (!uid) throw new Error('You must be signed in to set a profile picture.');

  // Same store as chat attachments. `domain` is varchar(64), so keep it short.
  const url = await uploadFile(file, { domain: 'avatars', fileName: file.name });

  await api(`/api/v1/auth/mobile/users/${uid}/avatar`, {
    method: 'PATCH',
    body: { avatarUrl: url },
  });
  return url;
}
