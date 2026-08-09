// ─── Firestore REST Shim ─────────────────────────────────────────────────────
// Provides the exact same getDocs / getDoc / addDoc / collection / doc /
// query / where / orderBy / limit / Timestamp interface as the firebase/firestore
// SDK, but executes REST API calls underneath.
//
// Usage in components:
//   import { db, collection, doc, getDocs, getDoc, addDoc, query,
//            where, orderBy, limit, Timestamp, serverTimestamp }
//     from '../../services/firestoreShim';  (adjust path as needed)
//
// This lets existing component code run unchanged while the data comes from
// the Spring Boot REST backend instead of Firebase.

import { api, getStoredUserId, getStoredProfile, getStoredRole, getStoredToken, uploadFile } from './apiClient';
// Safe to import: authService depends on apiClient only, never on this module, so
// there is no import cycle.
import { onAuthStateChanged as _authOnAuthStateChanged } from '../component/Auth/authService';

/** Tags may arrive as an array or a comma-separated string; screens expect an array. */
function normaliseTags(raw) {
  if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}


// ── Sentinel db object ────────────────────────────────────────────────────────
export const db = { _isShim: true };
// Memoize currentUser so it returns a STABLE object reference while the session is
// unchanged. Components use `auth.currentUser` directly as a useEffect dependency
// (e.g. `useEffect(..., [currentUser])`); a fresh object each render caused those
// effects to re-fire every render → infinite fetch loops.
let _currentUserCache = { key: null, value: null };
export const auth = {
  _isShim: true,
  get currentUser() {
    const uid = getStoredUserId();
    if (!uid) { _currentUserCache = { key: null, value: null }; return null; }
    const p = getStoredProfile() || {};
    const role = getStoredRole() || p.role || null;
    const key = `${uid}|${role}|${p.email || ''}|${p.fullName || p.name || p.displayName || ''}|${p.photoURL || p.avatarUrl || ''}`;
    if (_currentUserCache.key === key) return _currentUserCache.value;
    const value = {
      uid,
      email: p.email || null,
      displayName: p.fullName || p.name || p.displayName || null,
      emailVerified: p.emailVerified ?? true,
      photoURL: p.photoURL || p.avatarUrl || null,
      role,
      // Firebase's User.getIdToken(). Screens still call it to re-check the
      // session before a privileged action — without it the call threw
      // "getIdToken is not a function", which the video screen reported as
      // "Authentication token is invalid. Please log in again." The REST
      // session token stands in for the Firebase ID token.
      getIdToken: async () => {
        const token = getStoredToken();
        if (!token) throw new Error('No active session');
        return token;
      },
    };
    _currentUserCache = { key, value };
    return value;
  },
  // Firebase v8 method style: auth.onAuthStateChanged(cb).
  //
  // This module exports its OWN `auth` object, separate from authShim's, and
  // several screens import it from here (the client Messages screen among them).
  // Calling the v8 method on it threw "auth.onAuthStateChanged is not a function"
  // and took the whole screen down with a runtime-error overlay. Delegate to the
  // real observer so both call styles work from either module.
  onAuthStateChanged(cb) {
    return _authOnAuthStateChanged(cb);
  },
};

// ── Reference descriptors ─────────────────────────────────────────────────────

// Firestore accepts a slash-joined path as ONE argument —
// collection(db, 'client_chats/abc/messages') is the same as
// collection(db, 'client_chats', 'abc', 'messages'). Several screens build their
// path as a template string that way. Keeping it as a single element meant
// `col` was the whole string and `sub` was undefined, so the resolver fell
// through to "unknown collection": reads returned nothing and addDoc DISCARDED
// the write (returning a fake id) — which is exactly why chat messages sent from
// the web vanished without any error.
// Firestore accepted anything in an id field; Postgres uuid columns do not. Screens
// carried over Firestore-era habits like `createdBy: 'client'`, and a value that
// can't parse as a uuid comes back as a bare "Internal server error" that names
// neither the field nor the reason. Drop non-uuid values so the caller's fallback
// (usually the signed-in user) applies instead of blowing up the whole request.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value) {
  return UUID_RE.test(String(value ?? '')) ? String(value) : undefined;
}

// The web note form tracks a book's audience as `assignedClients` (an array of
// client ids). The API column is `assigned_client_ids`, a text field, and it
// ignores anything else — so "specific clients" selections were dropped and
// every book behaved as if shared with everyone.
function bookBody(data) {
  const ids = Array.isArray(data.assignedClients)
    ? data.assignedClients.filter(Boolean)
    : undefined;
  const { assignedClients, ...rest } = data;
  return {
    ...rest,
    ...(ids ? { assignedClientIds: JSON.stringify(ids) } : {}),
  };
}

function splitSegments(segments) {
  return segments
    .filter(seg => seg !== undefined && seg !== null && seg !== '')
    .flatMap(seg => String(seg).split('/'))
    .filter(Boolean);
}

export function collection(dbOrRef, ...pathSegments) {
  // Support both collection(db, 'col') and collection(db, 'col', id, 'subcol')
  let basePath = [];
  if (dbOrRef && dbOrRef._path) {
    basePath = dbOrRef._path;
  }
  const fullPath = [...basePath, ...splitSegments(pathSegments)];
  return { _type: 'collection', _path: fullPath, _constraints: [] };
}

export function doc(dbOrRef, ...pathSegments) {
  let basePath = [];
  if (dbOrRef && dbOrRef._path) {
    basePath = dbOrRef._path;
  }
  const fullPath = [...basePath, ...splitSegments(pathSegments)];
  return { _type: 'doc', _path: fullPath };
}

export function query(ref, ...constraints) {
  return { ...ref, _constraints: [...(ref._constraints || []), ...constraints] };
}

export function where(field, op, value) {
  return { _type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { _type: 'orderBy', field, direction };
}

export function limit(n) {
  return { _type: 'limit', n };
}

export function serverTimestamp() {
  return new Date().toISOString();
}

// ── Timestamp shim ────────────────────────────────────────────────────────────

export const Timestamp = {
  fromDate: (date) => ({
    _isTimestamp: true,
    _date: date instanceof Date ? date : new Date(date),
    toDate() { return this._date; },
    seconds: Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000),
  }),
  now: () => {
    const d = new Date();
    return { _isTimestamp: true, _date: d, toDate() { return this._date; }, seconds: Math.floor(d.getTime() / 1000) };
  },
};

// ── Helper: admin context + timestamp normalisation for admin list rows ───────

function _isAdmin() {
  return (getStoredRole() || '').toLowerCase() === 'admin';
}

// Map an organization's verificationStatus → the `status` field the screens read.
// Approved orgs use the 'active' vocabulary (matching branches and the
// where('status','==','active') filters used by the doctor prescription form,
// doctor home, patient E-Pharmacy browse, and pharmacy ops); the admin approvals /
// user screens treat 'active' and 'approved' as equivalent, so nothing regresses.
// verificationStatus is preserved (spread below) for anything reading it directly.
function _orgStatus(o = {}) {
  const v = String(o.verificationStatus || o.status || '').toUpperCase();
  const status = v === 'APPROVED' ? 'active'
    : v === 'REJECTED' ? 'rejected'
    : (v === 'PENDING_REVIEW' || v === 'PENDING' || v === '') ? 'pending'
    : v.toLowerCase();
  // The backend stores org contact details as contactEmail/contactPhone, but the
  // admin tables/detail screens read email/phone(Number). Expose both spellings
  // so they render for every org type (pharmacies, labs, scan centers).
  const email = o.email || o.contactEmail || '';
  const phone = o.phone || o.phoneNumber || o.contactPhone || '';
  return { ...o, status, email, contactEmail: email, phone, phoneNumber: phone, contactPhone: phone };
}

// Fetch a directory of organizations of one type.
//
// /registrations/organizations is ADMIN-ONLY: for a patient it 403s, and the
// caller's `.catch(() => [])` turned that into an empty array — which is why the
// patient's "Browse Pharmacies" tab rendered "no pharmacies" while the data was
// there all along. The /pharmacies, /labs and /scan-centers directories are the
// public counterparts and answer 200 for any signed-in user.
//
// Admins still read the registrations endpoint, because approval screens need
// PENDING/REJECTED orgs too — the public directories only list active ones.
async function _orgDirectory(type, publicPath) {
  const path = _isAdmin()
    ? `/api/v1/registrations/organizations?type=${type}`
    : `${publicPath}?status=active`;
  const data = await api(path).catch(() => []);
  return Array.isArray(data) ? data : (data?.items || data?.content || []);
}

// Normalise an organization-branch entity into the shape the branch list/detail
// screens read: status vocabulary (active/suspended/pending), the parent-org id
// under every alias the screens use (pharmacyId/labId/scanId), and the original
// onboarding fields preserved in metadataJson (email, contactNumber, area, …).
function _branchDoc(b = {}, id) {
  const v = String(b.verificationStatus || b.status || '').toUpperCase();
  const status = v === 'APPROVED' ? 'active' : v === 'REJECTED' ? 'suspended' : (b.status || 'pending');
  let meta = {};
  try { meta = typeof b.metadataJson === 'string' ? JSON.parse(b.metadataJson) : (b.metadataJson || {}); } catch { /* ignore */ }
  const orgId = b.organizationId || b.pharmacyId || b.labId || b.scanId;
  return {
    ...meta,
    ...b,
    id: id || b.id,
    status,
    branchName: b.branchName || b.name || meta.branchName,
    pharmacyId: orgId,
    labId: orgId,
    scanId: orgId,
    organizationId: orgId,
  };
}

// Merge authoritative admin status (from admin_user_status_v2 via /admin/users)
// into user-based rows (doctors/therapists) so the approvals queue reflects it.
async function _mergeAdminStatus(items, type) {
  if (!_isAdmin() || !items.length) return items;
  try {
    const rows = await api(`/api/v1/admin/users?type=${type}&limit=1000`).catch(() => []);
    const byId = new Map((Array.isArray(rows) ? rows : []).map(u => [String(u.id || u.userId), u.status]));
    // /admin/users excludes soft-deleted users, so an item missing from the map is
    // deleted → drop it (otherwise it reappears in the list after a delete).
    return items.filter(it => byId.has(String(it.id))).map(it => ({ ...it, status: byId.get(String(it.id)) }));
  } catch { return items; }
}

// Build the therapist upsert/PATCH body. The screens write a flat doc keyed by
// `name` (+ specialties array, license, location, …) but the backend
// TherapistUpsertRequest reads fullName/specialization and ignores unknown keys —
// so map name→fullName and preserve everything else in metadataJson. Without this
// the entered name is dropped and the profile keeps the email-derived fallback.
function _therapistPatchBody(data = {}, existingMeta = {}) {
  const specialization = data.specialization
    || (Array.isArray(data.specialties) ? data.specialties[0] : data.specialties)
    || undefined;
  return {
    ...((data.name || data.fullName) ? { fullName: data.name || data.fullName } : {}),
    ...(data.email !== undefined ? { email: data.email } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(specialization !== undefined ? { specialization } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
    // metadataJson is a whole-value REPLACE on the backend, so it must be written
    // as existing-merged-with-new. Serialising `data` alone silently deleted every
    // key the caller didn't happen to send — that's how an admin's
    // "Admin therapist" role promotion vanished the next time the therapist saved
    // their own profile from Settings (which sends only its own form fields), and
    // how a published sessionRate reverted to blank.
    metadataJson: JSON.stringify({ ...(existingMeta || {}), ...data }),
  };
}

// Read a therapist's current metadata so a PATCH can merge into it rather than
// clobber it. Falls back to {} — a failed read must not become "erase everything".
async function _therapistMeta(id) {
  try {
    const existing = await api(`/api/v1/therapists/${id}`);
    if (existing?.metadata && typeof existing.metadata === 'object') return existing.metadata;
    if (typeof existing?.metadataJson === 'string') return JSON.parse(existing.metadataJson);
  } catch { /* ignore */ }
  return {};
}

// Enrich a fetched user-profile doc so every detail/edit screen has the full set
// of identity + onboarding fields:
//   • spreads the original Firestore fields preserved in metadataJson at migration
//     (licenseNumber, consultationFee, experience, email, …)
//   • merges authoritative id/name/email from resolve-role (the canonical user row)
async function _withIdentity(id, doc) {
  if (!doc) return doc;
  // The id we looked up by wins. Every caller here is a getDoc(col, id), so that
  // id IS the document identity — but several endpoints return a *profile row* id
  // under `id` (e.g. /clients/{userId} answers with the client_profiles id). With
  // `doc.id || id` that row id replaced the users.id, and screens using the normal
  // Firestore idiom `{ id: snap.id, ...snap.data() }` — spread last — silently
  // picked it up and posted it as clientId, which the users FK rejected as a bare
  // "Request conflicts with existing data." Real Firestore never puts an id inside
  // data(); keep the row id reachable as profileId for anything that needs it.
  let out = { ...doc, id, ...(doc.id && doc.id !== id ? { profileId: doc.id } : {}) };
  if (typeof out.metadataJson === 'string') {
    try { out = { ...JSON.parse(out.metadataJson), ...out }; } catch { /* ignore */ }
  }
  // Client profiles keep the whole intake questionnaire in preferencesJson (the
  // table has no columns for therapyType, phq9, concerns, …). Hoist it the same
  // way as metadataJson so the admin Edit tab and client screens can read those
  // answers as flat fields instead of showing blanks.
  if (typeof out.preferencesJson === 'string') {
    try { out = { ...JSON.parse(out.preferencesJson), ...out }; } catch { /* ignore */ }
  }
  try {
    const rr = await api(`/api/v1/auth/mobile/resolve-role/${id}`).catch(() => null);
    const p = rr && rr.profile;
    if (p) {
      // Prefer the profile doc's own name (what the admin is editing); fall back
      // to the canonical user name. Email is only on the user row, so take it.
      out.email = out.email || p.email;
      out.name = out.name || out.fullName || p.name || p.fullName;
      out.fullName = out.fullName || out.name || p.fullName || p.name;
    }
  } catch { /* ignore */ }
  // Components read `yearsExperience`; onboarding stored `experience`.
  if (out.yearsExperience == null && out.experience != null) out.yearsExperience = out.experience;
  return out;
}

// Map a Firestore-shaped home-care-nurse doc to the backend NurseProfilePatch
// (text columns expect JSON strings for array/object fields).
const _NURSE_COLUMNS = new Set([
  'fullName', 'name', 'phone', 'whatsapp', 'email', 'gender', 'specialty',
  'specialization', 'specialties', 'languages', 'bio', 'availability', 'fees',
  'profilePhotoUrl', 'photoURL', 'accountStatus', 'documentsStatus',
  'licenseVerified', 'adminNote', 'metadataJson', 'updatedAt',
]);

function _nursePatchBody(data = {}) {
  const j = (v) => (v != null && typeof v === 'object' ? JSON.stringify(v) : v);
  // Anything the table has no column for (yearsExperience, licenseNumber,
  // profileComplete, …) used to be dropped by Jackson, so the nurse saw "Saved"
  // and the value was gone on reload. Keep it in metadataJson instead.
  const extra = {};
  Object.entries(data).forEach(([k, v]) => { if (!_NURSE_COLUMNS.has(k)) extra[k] = v; });
  return {
    fullName: data.fullName || data.name,
    phone: data.phone,
    whatsapp: data.whatsapp,
    email: data.email,
    gender: data.gender,
    specialty: data.specialty || data.specialization,
    specialties: j(data.specialties),
    languages: j(data.languages),
    bio: data.bio,
    availability: j(data.availability),
    fees: j(data.fees),
    profilePhotoUrl: data.profilePhotoUrl || data.photoURL,
    // Admin review fields — the API ignores these unless the caller is an admin.
    ...(data.accountStatus !== undefined ? { accountStatus: data.accountStatus } : {}),
    ...(data.documentsStatus !== undefined ? { documentsStatus: data.documentsStatus } : {}),
    ...(data.licenseVerified !== undefined ? { licenseVerified: data.licenseVerified } : {}),
    ...(data.adminNote !== undefined ? { adminNote: data.adminNote } : {}),
    ...(Object.keys(extra).length ? { metadataJson: JSON.stringify(extra) } : {}),
  };
}

// Backend admin list rows use snake_case + ISO/SQL timestamps. Components expect
// Firestore-shaped docs with `.createdAt.seconds` / `.scheduledTime.seconds`.
function _normalizeTimestamps(row = {}) {
  const createdRaw   = row.createdAt   ?? row.created_at;
  const scheduledRaw = row.scheduledTime ?? row.scheduled_time ?? row.scheduledAt ?? row.scheduled_at;
  return {
    ...row,
    createdAt:     createdRaw   ? Timestamp.fromDate(new Date(createdRaw))   : null,
    scheduledTime: scheduledRaw ? Timestamp.fromDate(new Date(scheduledRaw)) : (row.scheduledTime || null),
    scheduledAt:   scheduledRaw ? Timestamp.fromDate(new Date(scheduledRaw)) : (row.scheduledAt || null),
  };
}

// Cache public system config — it's read very frequently (onSnapshot polling
// across components) but rarely changes, so cap fetches to once per 60s.
let _sysConfigCache = { at: 0, data: null };
async function _getSystemConfig() {
  const now = Date.now();
  if (_sysConfigCache.data && now - _sysConfigCache.at < 60000) return _sysConfigCache.data;
  const data = await api('/api/v1/admin/system-config/public/settings', { authenticated: false }).catch(() => ({}));
  _sysConfigCache = { at: now, data: data || {} };
  return _sysConfigCache.data;
}

// Read a specific system-config doc for the admin screen. The component reads two
// logical docs:
//   • 'settings'     → { [section]: { ...fields } }   (general/platform/…)
//   • 'featureFlags' → { overrides: { [country]: { ...flags } } }
async function _getSystemConfigDoc(id) {
  // These endpoints are admin-only, but useSystemConfig()/useFeatureFlagsConfig()
  // mount for EVERY signed-in user and re-poll every few seconds — so a therapist
  // or client generated two 403s every 3 seconds for as long as the app stayed
  // open. Non-admins read the public settings endpoint instead.
  if (!_isAdmin()) {
    const publicSettings = await _getSystemConfig();
    return id === 'featureFlags'
      ? { overrides: (publicSettings && publicSettings.featureFlags) || {} }
      : (publicSettings || {});
  }
  if (id === 'featureFlags') {
    const overrides = await api('/api/v1/admin/system-config/feature-flags').catch(() => ({}));
    return { overrides: overrides || {} };
  }
  if (id === 'settings') {
    const sections = await api('/api/v1/admin/system-config/settings').catch(() => ({}));
    return sections || {};
  }
  return await _getSystemConfig();
}

// Persist a system-config doc. Maps the component's merge-style writes onto the
// per-section / per-country PATCH endpoints. Invalidates the public cache so the
// change is reflected globally on next read.
async function _writeSystemConfig(id, data = {}) {
  if (id === 'featureFlags') {
    const overrides = data.overrides || {};
    await Promise.all(Object.entries(overrides).map(([country, flags]) =>
      api(`/api/v1/admin/system-config/feature-flags/${encodeURIComponent(country)}`, { method: 'PATCH', body: flags || {} }).catch(() => {})));
  } else {
    // 'settings' doc: every key except bookkeeping is a section payload.
    await Promise.all(Object.entries(data)
      .filter(([k]) => k !== 'updatedAt' && k !== 'id')
      .map(([section, payload]) =>
        api(`/api/v1/admin/system-config/settings/${encodeURIComponent(section)}`, { method: 'PATCH', body: payload || {} }).catch(() => {})));
  }
  _sysConfigCache = { at: 0, data: null }; // force re-fetch so the change propagates
  return { id, ...data };
}

// ── Helper: resolve Timestamp/ISO values ──────────────────────────────────────

function toDate(val) {
  if (!val) return null;
  if (val && val._isTimestamp) return val._date;
  if (val && typeof val.toDate === 'function') return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
}

// ── Helper: QuerySnapshot / DocumentSnapshot shapes ───────────────────────────

function toQuerySnapshot(items) {
  const arr = Array.isArray(items) ? items : (items ? [items] : []);
  return {
    docs: arr.map(item => toDocSnap(item)),
    size: arr.length,
    empty: arr.length === 0,
    forEach(fn) { this.docs.forEach(fn); },
  };
}

function toDocSnap(item) {
  return {
    id: item?.id || item?.userId || '',
    exists() { return !!item; },
    data() { return item || null; },
    ref: { id: item?.id || '' },
    ...item,
  };
}

// ── Helper: extract where constraint value ────────────────────────────────────

function getWhereValue(constraints, field, op = '==') {
  if (!constraints) return undefined;
  const c = constraints.find(c => c._type === 'where' && c.field === field && c.op === (op || '=='));
  return c ? c.value : undefined;
}

function applyInMemoryFilters(items, constraints) {
  if (!constraints || !constraints.length) return items;
  let result = [...items];
  for (const c of constraints) {
    if (c._type !== 'where') continue;
    result = result.filter(item => {
      // `__name__` is Firestore's document-id field. Screens use it to fetch a
      // single doc out of a collection (where('__name__','==',id)); items here
      // carry the id as `id`, so without this alias the filter matched nothing and
      // the query came back empty — which is why the SOAP-note and resource client
      // pickers rendered no clients.
      const fieldVal = c.field === '__name__' ? item.id : item[c.field];
      switch (c.op) {
        case '==':  return fieldVal === c.value;
        case '!=':  return fieldVal !== c.value;
        case '>':   return fieldVal > c.value;
        case '>=':  { const d1 = toDate(fieldVal); const d2 = toDate(c.value); return d1 && d2 ? d1 >= d2 : fieldVal >= c.value; }
        case '<':   return fieldVal < c.value;
        case '<=':  { const d1 = toDate(fieldVal); const d2 = toDate(c.value); return d1 && d2 ? d1 <= d2 : fieldVal <= c.value; }
        case 'array-contains': return Array.isArray(fieldVal) && fieldVal.includes(c.value);
        case 'in':  return Array.isArray(c.value) && c.value.includes(fieldVal);
        default: return true;
      }
    });
  }
  // Apply orderBy
  const _ordVal = (v) => {
    if (v == null) return v;
    if (typeof v.toMillis === 'function') return v.toMillis();   // Firestore Timestamp
    if (typeof v.seconds === 'number') return v.seconds * 1000;  // {seconds,...}
    if (v instanceof Date) return v.getTime();
    return v;
  };
  for (const c of constraints) {
    if (c._type !== 'orderBy') continue;
    result.sort((a, b) => {
      const av = _ordVal(a[c.field]); const bv = _ordVal(b[c.field]);
      if (av === bv) return 0;
      if (av == null) return 1;   // nulls last
      if (bv == null) return -1;
      const cmp = av > bv ? 1 : -1;
      return c.direction === 'desc' ? -cmp : cmp;
    });
  }
  // Apply limit
  const lim = constraints.find(c => c._type === 'limit');
  if (lim) result = result.slice(0, lim.n);
  return result;
}

// ── Collection → REST endpoint resolver ──────────────────────────────────────

async function resolveCollection(path, constraints) {
  const [col, id1, sub] = path;

  // ── Subcollections ──────────────────────────────────────────────────────────

  if (sub && col === 'therapists' && sub === 'clients') {
    // therapists/{id}/clients → therapy-management assignments.
    //
    // The document id here MUST be the client's id — the path literally means
    // "this therapist's client {clientId}". It used to fall back to `a.id`, the
    // ASSIGNMENT row id, and `...a` then overwrote `clientId` back to the
    // assignment id too. Every screen that took this id and looked the client up
    // (SOAP note, worksheet, resources client pickers) queried a non-existent
    // document and rendered an empty list.
    const data = await api(`/api/v1/therapy-management/assignments?therapistId=${id1}`).catch(() => []);
    const items = (Array.isArray(data) ? data : [])
      .filter(a => a.clientId)
      .map(a => ({
        ...a,
        id: a.clientId,
        clientId: a.clientId,
        assignmentId: a.id,
        // The endpoint now resolves these; surface the spellings the pickers read.
        name: a.clientName || a.name || '',
        clientName: a.clientName || a.name || '',
        displayName: a.clientName || a.name || '',
        email: a.clientEmail || a.email || '',
      }));
    return toQuerySnapshot(applyInMemoryFilters(items, constraints));
  }

  if (sub && col === 'clients' && sub === 'therapyNotes') {
    const data = await api(`/api/v1/clients/${id1}/therapy-notes`).catch(() => []);
    const items = (Array.isArray(data) ? data : []).map(n => ({ id: n.id, sessionDate: n.createdAt, ...n }));
    return toQuerySnapshot(applyInMemoryFilters(items, constraints));
  }

  if (sub && col === 'clients' && sub === 'goals') {
    const therapistId = getWhereValue(constraints, 'therapistId');
    const qs = new URLSearchParams({ clientId: id1 });
    if (therapistId) qs.set('therapistId', therapistId);
    const data = await api(`/api/v1/therapy-management/goals?${qs}`).catch(() => []);
    const items = (Array.isArray(data) ? data : []).map(g => ({ id: g.id, ...g }));
    return toQuerySnapshot(applyInMemoryFilters(items, constraints));
  }

  if (sub && (col === 'therapist_chats' || col === 'therapistChats') && sub === 'messages') {
    // id1 is "{userA}_{userB}" (sorted uids) — split and resolve the staff thread.
    const [a, b] = String(id1).split('_');
    const data = (a && b) ? await api(`/api/v1/care/chats/pair/${a}/${b}/messages`).catch(() => []) : [];
    const items = (Array.isArray(data) ? data : []).map(m => ({
      ...m, id: m.id,
      timestamp: m.timestamp ? Timestamp.fromDate(new Date(m.timestamp)) : (m.createdAt ? Timestamp.fromDate(new Date(m.createdAt)) : null),
      createdAt: m.createdAt ? Timestamp.fromDate(new Date(m.createdAt)) : null,
    }));
    return toQuerySnapshot(applyInMemoryFilters(items, constraints));
  }

  if (sub && (col === 'client_chats' || col === 'clientChats') && sub === 'messages') {
    // id1 is the clientId — the backend resolves (and lazily creates) the
    // client↔therapist thread, so the chat works without a pre-existing thread id.
    const data = await api(`/api/v1/care/chats/client/${id1}/messages`).catch(() => []);
    const items = (Array.isArray(data) ? data : []).map(m => ({
      ...m, id: m.id,
      timestamp: m.timestamp ? Timestamp.fromDate(new Date(m.timestamp)) : (m.createdAt ? Timestamp.fromDate(new Date(m.createdAt)) : null),
      createdAt: m.createdAt ? Timestamp.fromDate(new Date(m.createdAt)) : null,
    }));
    return toQuerySnapshot(applyInMemoryFilters(items, constraints));
  }

  if (sub && (col === 'doctor_chats' || col === 'doctorChats') && sub === 'messages') {
    const data = await api(`/api/v1/doctor-chats/${id1}/messages`).catch(() => []);
    // Backend stores senderId/body/messageType; the screen reads from/text/type —
    // map back so messages render. (Names aren't persisted; fall back gracefully.)
    const items = (Array.isArray(data) ? data : []).map(m => ({
      ...m,
      id: m.id,
      text: m.text ?? m.body ?? '',
      from: m.from ?? m.senderId ?? null,
      type: m.type ?? m.messageType ?? 'text',
      timestamp: m.timestamp ? Timestamp.fromDate(new Date(m.timestamp)) : (m.sentAt ? Timestamp.fromDate(new Date(m.sentAt)) : (m.createdAt ? Timestamp.fromDate(new Date(m.createdAt)) : null)),
      createdAt: m.createdAt ? Timestamp.fromDate(new Date(m.createdAt)) : (m.sentAt ? Timestamp.fromDate(new Date(m.sentAt)) : null),
    }));
    return toQuerySnapshot(applyInMemoryFilters(items, constraints));
  }

  // Doctor's custom lab/scan test entries (subcollection → flat REST endpoint).
  if (sub && col === 'doctors' && sub === 'diagnosticCustomEntries') {
    const data = await api(`/api/v1/doctors/${id1}/diagnostic-custom-entries`).catch(() => []);
    const items = (Array.isArray(data) ? data : []).map(e => ({
      ...e,
      id: e.id,
      // the screen filters by `category`; backend stores `entryType`.
      category: e.category || e.entryType,
    }));
    return toQuerySnapshot(applyInMemoryFilters(items, constraints));
  }

  // ── Top-level collections ────────────────────────────────────────────────────

  switch (col) {
    case 'therapists': {
      const data = await api('/api/v1/therapists', { authenticated: false }).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(t => ({
        id: t.id,
        name: t.fullName || t.name,
        displayName: t.fullName || t.name,
        email: t.email,
        role: 'therapist',
        ...t,
      }));
      return toQuerySnapshot(applyInMemoryFilters(await _mergeAdminStatus(items, 'therapists'), constraints));
    }

    case 'clients': {
      // Admins use the admin directory; therapists use the therapist-accessible
      // client list (admin/users is admin-only → 403 for a therapist).
      const endpoint = _isAdmin()
        // `clients`, plural. /admin/users matches the type against a fixed set
        // (all | medical_patients | clients | doctors | therapists | pharmacies |
        // labs | scan_centers); anything else matches no branch and returns an
        // empty list with a 200, so the admin Clients tab read "No records exist
        // in the clients collection yet" while 12 clients sat in the table.
        ? '/api/v1/admin/users?type=clients&limit=500'
        : '/api/v1/therapy-management/clients';
      const data = await api(endpoint).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(u => ({
        id: u.id || u.userId,
        email: u.email,
        name: u.fullName || u.name,
        displayName: u.fullName || u.name,
        ...u,
      }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'auth': {
      // If there's a where('clientId', '==', x) or where('uid', '==', x) → fetch single doc
      const clientIdVal = getWhereValue(constraints, 'clientId');
      const uidVal      = getWhereValue(constraints, 'uid');
      const idToFetch   = clientIdVal || uidVal;
      if (idToFetch) {
        const data = await api(`/api/v1/auth/${idToFetch}`).catch(() => null);
        return toQuerySnapshot(data ? [{ id: idToFetch, ...data }] : []);
      }
      // Fallback: list all (admin). Normalise role to lowercase (the backend
      // returns 'ADMIN'/'PATIENT'/...) and derive userIntent from role so the
      // admin user-management classifier buckets users correctly.
      const data = await api('/api/v1/admin/users?limit=500').catch(() => []);
      const items = (Array.isArray(data) ? data : [])
        // /admin/users (type=all) also returns organizations and soft-deleted
        // users — neither belongs in the Medical Patients / auth-user list.
        .filter(u => u.type !== 'organization' && String(u.status || '').toLowerCase() !== 'deleted')
        .map(u => {
          const role = String(u.role || '').toLowerCase();
          const userIntent = role === 'patient' ? 'medical' : role === 'client' ? 'therapy' : (u.userIntent || undefined);
          return { ...u, id: u.id || u.userId, role, userIntent };
        });
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'scheduledCalls': {
      const therapistId = getWhereValue(constraints, 'therapistId');
      const clientId    = getWhereValue(constraints, 'clientId');
      const qs          = new URLSearchParams();
      if (therapistId) qs.set('therapistId', therapistId);
      if (clientId)    qs.set('clientId',    clientId);
      const data = await api(`/api/v1/scheduled-calls${qs.toString() ? `?${qs}` : ''}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(c => {
        // clientName/status are Firestore-era fields with no column — they ride in
        // metadataJson. Without flattening them the calendar had no name to show
        // and every entry rendered as the generic "Appointment with Client".
        let meta = {};
        if (typeof c.metadataJson === 'string' && c.metadataJson) {
          try { meta = JSON.parse(c.metadataJson); } catch { /* ignore */ }
        }
        return {
          ...meta,
          ...c,
          clientName: c.clientName || meta.clientName || null,
          therapistName: c.therapistName || meta.therapistName || null,
          status: c.status || meta.status || 'scheduled',
          duration: c.duration ?? c.durationMinutes ?? null,
          id: c.id,
          scheduledTime: c.scheduledTime
            ? Timestamp.fromDate(new Date(c.scheduledTime))
            : null,
          createdAt: c.createdAt ? Timestamp.fromDate(new Date(c.createdAt)) : null,
        };
      });
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    // The daily check-in / mood journal. The screens use the human-readable string
    // 'Client daily mood tracking' as the collection name, which matched nothing —
    // so every check-in a client submitted was DISCARDED and the therapist's Mood
    // Dashboard was permanently empty. Map it to the real mood endpoint.
    case 'Client daily mood tracking':
    case 'clientMoodTracking':
    case 'clientMoods': {
      const moodClientId = getWhereValue(constraints, 'clientId');
      if (!moodClientId) return toQuerySnapshot([]);
      const data = await api(`/api/v1/clients/${moodClientId}/mood`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(m => _normalizeTimestamps({
        ...m,
        id: m.id,
        clientId: m.clientId || moodClientId,
        // Screens read `mood` (label) and `moodValue`/`moodScore` (1-10).
        moodValue: m.moodValue ?? m.moodScore ?? null,
        createdAt: m.createdAt || m.recordedAt || m.dateLabel || null,
      }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    // Client-visible notes. The client dashboard queries a bare `notes` collection
    // to spot newly-shared notes; it had no mapping, so the read fell through to
    // "unknown collection" and the client was never told about a note their
    // therapist shared. Clinical notes are the same store, filtered to this client.
    case 'notes': {
      const notesClientId = getWhereValue(constraints, 'clientId');
      if (!notesClientId) return toQuerySnapshot([]);
      const data = await api(`/api/v1/clinical-notes?clientId=${notesClientId}&visibleOnly=true`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(n => _normalizeTimestamps({ ...n, id: n.id }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'clinicalNotes': {
      // Unified with mobile on the rich /clinical-notes store (clinical_notes table)
      // so notes sync across web + mobile.
      const therapistId = getWhereValue(constraints, 'therapistId');
      const cnClientId  = getWhereValue(constraints, 'clientId');
      const qp = new URLSearchParams();
      if (therapistId) qp.set('therapistId', therapistId);
      if (cnClientId)  qp.set('clientId', cnClientId);
      const data = await api(`/api/v1/clinical-notes${qp.toString() ? `?${qp}` : ''}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(n => ({
        ...n,
        id: n.id,
        createdAt: n.createdAt ? Timestamp.fromDate(new Date(n.createdAt)) : null,
        updatedAt: n.updatedAt ? Timestamp.fromDate(new Date(n.updatedAt)) : null,
      }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'doctorAppointments': {
      const doctorId    = getWhereValue(constraints, 'doctorId');
      const patientId   = getWhereValue(constraints, 'patientId') || getWhereValue(constraints, 'clientId');
      let data;
      if (doctorId) {
        data = await api(`/api/v1/medical/appointments/doctor/${doctorId}`).catch(() => []);
      } else if (patientId) {
        data = await api(`/api/v1/medical/appointments/patient/${patientId}`).catch(() => []);
      } else if (_isAdmin()) {
        data = await api('/api/v1/admin/all/appointments').catch(() => []);
      } else {
        data = [];
      }
      const items = (Array.isArray(data) ? data : []).map(_normalizeTimestamps);
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'doctorPrescriptions': {
      const doctorId   = getWhereValue(constraints, 'doctorId');
      const pharmacyId = getWhereValue(constraints, 'pharmacyId');
      const branchId   = getWhereValue(constraints, 'branchId');
      const patientId  = getWhereValue(constraints, 'patientId');
      const role       = (getStoredRole() || '').toLowerCase();
      let data;
      if (doctorId) {
        data = await api(`/api/v1/medical/prescriptions/doctor/${doctorId}`).catch(() => []);
      } else if (patientId) {
        data = await api(`/api/v1/medical/prescriptions/patient/${patientId}`).catch(() => []);
      } else if (branchId) {
        // Branch reads prescriptions routed to it (prescriptions table, by branch).
        data = await api(`/api/v1/medical/prescriptions/branch/${branchId}`).catch(() => []);
      } else if (pharmacyId) {
        // Pharmacy reads prescriptions routed to the org (pharmacy_id).
        data = await api(`/api/v1/medical/prescriptions/pharmacy/${pharmacyId}`).catch(() => []);
      } else if (_isAdmin()) {
        data = await api('/api/v1/admin/all/prescriptions').catch(() => []);
      } else {
        data = [];
      }
      const items = (Array.isArray(data) ? data : []).map(_normalizeTimestamps);
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'pharmacyRxEvents': {
      const data = await api('/api/v1/entity-operations/pharmacy/events').catch(() => []);
      const items = (Array.isArray(data) ? data : (data?.events || [])).map(_normalizeTimestamps);
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'doctorAvailability': {
      const docId = getWhereValue(constraints, 'doctorId');
      if (!docId) return toQuerySnapshot([]);
      // Backend slots are startsAt/endsAt Instants; components read date/startTime/
      // endTime. Translate so the availability table renders and date filters work.
      const data = await api(`/api/v1/care/doctors/${docId}/availability?all=true`).catch(() => []);
      const arr = Array.isArray(data) ? data : (data?.slots || data?.availability || []);
      const hhmm = (d) => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
      const ymd = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
      const items = arr.map(s => {
        const starts = s.startsAt ? new Date(s.startsAt) : null;
        const ends = s.endsAt ? new Date(s.endsAt) : null;
        return {
          ...s,
          id: s.id,
          doctorId: s.doctorId || docId,
          date: s.date || ymd(starts),
          startTime: s.startTime || hhmm(starts),
          endTime: s.endTime || hhmm(ends),
          slots: s.slots || (starts ? [hhmm(starts)] : []),
          booked: s.booked || (s.slotStatus === 'booked' && starts ? [hhmm(starts)] : []),
        };
      });
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'couples':
      return toQuerySnapshot([]); // list handled via dedicated couple endpoints/getDoc

    case 'patientNotifications':
    case 'callLogs':
      return toQuerySnapshot([]);

    case 'pharmacies': {
      const data = await _orgDirectory('PHARMACY', '/api/v1/pharmacies');
      return toQuerySnapshot(applyInMemoryFilters(data.map(_orgStatus), constraints));
    }

    case 'pharmacyBranches':
    case 'labBranches':
    case 'scanCenters_branches':
    case 'scanBranches': {
      const parentKey = col === 'pharmacyBranches' ? 'pharmacyId' : col === 'labBranches' ? 'labId' : 'scanId';
      const orgId = getWhereValue(constraints, parentKey) || getWhereValue(constraints, 'organizationId');
      if (!orgId) return toQuerySnapshot([]);
      const data = await api(`/api/v1/registrations/organizations/${orgId}/branches`).catch(() => []);
      // Expose `status` in the active/suspended vocabulary the branch UI toggles on
      // (verificationStatus APPROVED→active, REJECTED→suspended).
      const items = (Array.isArray(data) ? data : []).map(b => {
        const v = String(b.verificationStatus || b.status || '').toUpperCase();
        const status = v === 'APPROVED' ? 'active' : v === 'REJECTED' ? 'suspended' : 'pending';
        // Backend branches carry `organizationId`, but callers query by the parent
        // key (pharmacyId/labId/scanId). Alias it so the in-memory where() filter
        // below matches — otherwise every branch is filtered out and the list looks
        // empty even though the endpoint returned them.
        const parentId = b.organizationId || orgId;
        return { ...b, [parentKey]: parentId, pharmacyId: parentId, status, branchName: b.branchName || b.name };
      });
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'homeCareNurses': {
      // Admin (Home Care Manage / approvals) needs ALL nurses incl. pending →
      // /homecare/admin/nurses (admin-only). Everyone else (patients browsing,
      // nurse app) uses the PUBLIC /homecare/nurses, which returns approved nurses
      // — the admin endpoint 403s for them and would otherwise show zero nurses.
      const data = _isAdmin()
        ? (await api('/api/v1/homecare/admin/nurses').catch(() => []))
        : (await api('/api/v1/homecare/nurses').catch(() => []));
      const items = (Array.isArray(data) ? data : [])
        .filter(n => String(n.accountStatus || n.status || '').toLowerCase() !== 'deleted');
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'labs': {
      const data = await _orgDirectory('LAB', '/api/v1/labs');
      return toQuerySnapshot(applyInMemoryFilters(data.map(_orgStatus), constraints));
    }

    case 'scanCenters': {
      const data = await _orgDirectory('SCAN_CENTER', '/api/v1/scan-centers');
      return toQuerySnapshot(applyInMemoryFilters(data.map(_orgStatus), constraints));
    }

    case 'diagnosticOrders': {
      // Reads the diagnostic_orders_v2 table (compat alias). Scope by branch (branch
      // dashboard), org/centerId (parent), or doctor/patient.
      const dBranchId = getWhereValue(constraints, 'branchId');
      const dCenterId = getWhereValue(constraints, 'centerId') || getWhereValue(constraints, 'organizationId') || getWhereValue(constraints, 'labId') || getWhereValue(constraints, 'scanId');
      const dDoctorId = getWhereValue(constraints, 'doctorId');
      const dPatientId = getWhereValue(constraints, 'patientId');
      const dCenterType = getWhereValue(constraints, 'centerType');
      // ops/orders supports doctor/patient/branch; compat supports branch/centerId
      // /centerType. Both hit diagnostic_orders_v2, so results are consistent.
      let data;
      if (dDoctorId) data = await api(`/api/v1/diagnostics/operations/orders?doctorId=${dDoctorId}`).catch(() => []);
      else if (dPatientId) data = await api(`/api/v1/diagnostics/operations/orders?patientId=${dPatientId}`).catch(() => []);
      else if (dBranchId) data = await api(`/api/v1/compat/diagnostic-orders?branchId=${dBranchId}`).catch(() => []);
      else if (dCenterId) data = await api(`/api/v1/compat/diagnostic-orders?centerId=${dCenterId}`).catch(() => []);
      else if (dCenterType) data = await api(`/api/v1/compat/diagnostic-orders?centerType=${dCenterType}`).catch(() => []);
      else data = await api('/api/v1/compat/diagnostic-orders').catch(() => []);
      // Orders come back with `diagnosticType` ('lab' | 'scan') but callers query
      // where('centerType','==',…). The backend also ignores the centerType query
      // param, so the in-memory filter below was the only thing narrowing the list
      // — and with no `centerType` key on the rows it dropped every one of them.
      // That's why the admin dashboard showed Lab Orders 0 / Scan Orders 0 with
      // real orders in the table. Alias it so both the filter and the screens work.
      const items = (Array.isArray(data) ? data : data?.orders || []).map(o => {
        const type = o.centerType || o.diagnosticType || o.type || null;
        return _normalizeTimestamps({ ...o, centerType: type, type: o.type || type });
      });
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    // Diagnostic branch activity feed — no dedicated REST endpoint; safe empty read.
    case 'diagnosticBranchEvents':
      return toQuerySnapshot([]);

    case 'homeCareBookings': {
      // The endpoint requires patientId or nurseId — pull from the where clause.
      const bPatientId = getWhereValue(constraints, 'patientId');
      const bNurseId = getWhereValue(constraints, 'nurseId');
      const bStatus = getWhereValue(constraints, 'status');
      const qp = new URLSearchParams();
      if (bPatientId) qp.set('patientId', bPatientId);
      else if (bNurseId) qp.set('nurseId', bNurseId);
      if (bStatus) qp.set('status', bStatus);
      // Admin (Home Care Manage) lists ALL bookings with no filter — the backend
      // returns everything for admins. Non-admins must scope by patient/nurse.
      if (!qp.has('patientId') && !qp.has('nurseId') && !_isAdmin()) return toQuerySnapshot([]);
      const data = await api(`/api/v1/homecare/bookings?${qp}`).catch(() => []);
      const items = (Array.isArray(data) ? data : data?.bookings || []).map(_normalizeTimestamps);
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'homeCareNurseEarnings': {
      const enid = getWhereValue(constraints, 'nurseId');
      if (!enid) return toQuerySnapshot([]);
      const data = await api(`/api/v1/homecare/nurses/${enid}/earnings`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(_normalizeTimestamps);
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'homeCareComplaints': {
      const data = await api('/api/v1/homecare/complaints').catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(_normalizeTimestamps);
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'notifications': {
      const targetId = getWhereValue(constraints, 'targetId') || getWhereValue(constraints, 'therapistId');
      const data = targetId
        ? await api(`/api/v1/notifications?targetId=${targetId}`).catch(() => [])
        : [];
      return toQuerySnapshot(applyInMemoryFilters(Array.isArray(data) ? data : [], constraints));
    }

    case 'worksheets': {
      const therapistId = getWhereValue(constraints, 'therapistId');
      const clientId    = getWhereValue(constraints, 'clientId');
      const qs = new URLSearchParams();
      if (clientId)    qs.set('clientId', clientId);
      if (therapistId) qs.set('therapistId', therapistId);
      const data = await api(`/api/v1/therapy-engagement/worksheets${qs.toString() ? `?${qs}` : ''}`).catch(() => []);
      // Cards read Firestore-era names: `createdBy` for the author and a Timestamp
      // for the date. The API returns therapistId + an ISO string, so both showed
      // as "Unknown". Normalise here rather than in each card.
      const items = (Array.isArray(data) ? data : []).map(w => {
        // The builder's whole form (description, instructions, category, fields,
        // allowMultiple…) round-trips through metadataJson because the table has
        // no columns for it. Unpack it FIRST so the columns below stay
        // authoritative — without this the detail modal rendered empty sections.
        let meta = {};
        try { meta = w.metadataJson ? JSON.parse(w.metadataJson) : {}; } catch { /* ignore */ }
        const created = w.createdAt ? Timestamp.fromDate(new Date(w.createdAt)) : null;
        return {
          ...meta,
          ...w,
          id: w.id,
          title: w.title || meta.title || 'Untitled worksheet',
          description: meta.description || '',
          instructions: meta.instructions || w.prompt || '',
          goal: meta.goal || '',
          category: meta.category || '',
          fields: Array.isArray(meta.fields) ? meta.fields : [],
          allowMultipleResponses: meta.allowMultipleResponses ?? meta.allowMultiple ?? false,
          // A client's submission lands as `submitted`; some flows write
          // `completed`. Both mean answered — checking only one left a submitted
          // worksheet endlessly re-submittable.
          isCompleted: ['completed', 'submitted'].includes(String(w.status || '').toLowerCase()),
          savedResponses: (() => {
            try { return w.latestResponse ? JSON.parse(w.latestResponse) : {}; } catch { return {}; }
          })(),
          // The therapist screens read a Firestore-era `clientResponses` map keyed
          // by client id — the API never returns it, so a completed worksheet
          // showed the therapist no answers at all. Rebuild that shape from the
          // submission so those screens work unchanged.
          clientResponses: (() => {
            try {
              const answers = w.latestResponse ? JSON.parse(w.latestResponse) : null;
              if (!answers || !w.clientId) return undefined;
              return {
                [w.clientId]: {
                  responses: answers,
                  clientName: w.clientName || null,
                  submittedAt: w.lastSubmittedAt || null,
                },
              };
            } catch { return undefined; }
          })(),
          lastSubmittedAt: w.lastSubmittedAt || null,
          createdBy: w.therapistId || meta.createdBy || null,
          therapistName: w.therapistName || null,
          createdAt: created,
          dateCreated: created,
          lastUpdated: created,
          assignedTo: w.clientId ? [w.clientId] : (meta.assignedClients || []),
        };
      });
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'therapistResources':
    case 'resources': {
      const data = await api('/api/v1/resources').catch(() => []);
      // Flatten metadataJson so the screen sees the fields it wrote (category,
      // description, content, tags, …); real columns still win.
      const items = (Array.isArray(data) ? data : []).map(r => {
        let meta = {};
        if (typeof r.metadataJson === 'string' && r.metadataJson) {
          try { meta = JSON.parse(r.metadataJson); } catch { /* ignore */ }
        }
        return {
          ...meta,
          ...r,
          id: r.id,
          // The cards call createdAt?.toDate?.() — an ISO string has no toDate,
          // so the date rendered as "Unknown".
          createdAt: r.createdAt ? Timestamp.fromDate(new Date(r.createdAt)) : null,
          // Some resources were saved with `tags` as a comma-separated string and
          // others as an array. The cards call tags.slice(0, 3).map(), which threw
          // "resource.tags.slice(...).map is not a function" on the string ones and
          // took the whole Resources screen down.
          tags: normaliseTags(meta.tags ?? r.tags),
        };
      });
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'therapistReports':
    case 'reports': {
      const therapistId = getWhereValue(constraints, 'therapistId');
      const clientId    = getWhereValue(constraints, 'clientId');
      const qs = new URLSearchParams();
      if (therapistId) qs.set('therapistId', therapistId);
      if (clientId)    qs.set('clientId', clientId);
      const data = await api(`/api/v1/therapist-reports${qs.toString() ? `?${qs}` : ''}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(r => ({
        ...r,
        id: r.id,
        createdAt: r.createdAt ? Timestamp.fromDate(new Date(r.createdAt)) : null,
      }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'patientTimeline': {
      // There was a write mapping for this collection but no read one, so the
      // query fell through to `default:` and the patient's timeline was always
      // empty. The API also names things differently from the screens
      // (eventType/summary vs type/title) and returns ISO dates where the web
      // code reads `createdAt.seconds`, so normalise both here.
      const tlPatientId = getWhereValue(constraints, 'patientId') || getStoredUserId();
      if (!tlPatientId) return toQuerySnapshot([]);
      const rows = await api(
        `/api/v1/patient-timeline?patientId=${tlPatientId}&limit=200`,
      ).catch(() => []);
      const items = (Array.isArray(rows) ? rows : []).map((r) => {
        let meta = {};
        try { meta = r.metadataJson ? JSON.parse(r.metadataJson) : {}; } catch { /* ignore */ }
        const d = r.createdAt ? new Date(r.createdAt) : null;
        return {
          ...meta,
          ...r,
          type: r.eventType || r.type || 'APPOINTMENT',
          title: r.summary || r.title || meta.title || '',
          status: String(r.status || meta.status || 'PENDING').toUpperCase(),
          relatedId: r.relatedId || meta.relatedId || null,
          createdAt: d && !Number.isNaN(d.getTime())
            ? { seconds: Math.floor(d.getTime() / 1000), toDate: () => d }
            : null,
        };
      });
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'therapyBooks': {
      const therapistId = getWhereValue(constraints, 'therapistId');
      const data = await api(`/api/v1/therapy-books${therapistId ? `?therapistId=${therapistId}` : ''}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(b => ({ ...b, id: b.id }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'patientProfiles': {
      // Single-patient fetch when a where(id) is present; otherwise empty (no bulk list).
      const pid = getWhereValue(constraints, 'patientId') || getWhereValue(constraints, 'uid') || getWhereValue(constraints, 'clientId');
      if (!pid) return toQuerySnapshot([]);
      const data = await api(`/api/v1/patients/${pid}`).catch(() => null);
      return toQuerySnapshot(data ? [{ id: pid, ...data }] : []);
    }

    case 'supportTickets': {
      // Admin reads ALL tickets (no reporterId); a user reads their own.
      const reporterId = getWhereValue(constraints, 'reporterId') || (!_isAdmin() ? getStoredUserId() : null);
      const qs = reporterId ? `?reporterId=${reporterId}` : '';
      const data = await api(`/api/v1/care/support/tickets${qs}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(t => _normalizeTimestamps({ id: t.id, ...t }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'globalReports': {
      // Admin Reports Center → the admin list endpoint (compat/global-reports is
      // POST-only). reporterId optional; admin gets all.
      const reporterId = getWhereValue(constraints, 'reporterId');
      const qs = reporterId ? `?reporterId=${reporterId}` : '';
      const data = await api(`/api/v1/reports/global${qs}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(r => _normalizeTimestamps({ id: r.id, ...r }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'patientDailyFeelings': {
      const pid = getWhereValue(constraints, 'patientId') || getWhereValue(constraints, 'clientId');
      if (!pid) return toQuerySnapshot([]);
      const data = await api(`/api/v1/patients/${pid}/daily-feelings`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(x => ({ id: x.id, ...x }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'dischargeRequests': {
      const pid = getWhereValue(constraints, 'patientId') || getWhereValue(constraints, 'clientId');
      if (!pid) return toQuerySnapshot([]);
      const data = await api(`/api/v1/patients/${pid}/discharge-requests`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(x => ({ id: x.id, ...x }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'sessionRatings': {
      // The endpoint requires clientId or therapistId — use the where clause, else
      // scope to the signed-in user (client sees own ratings, therapist sees theirs).
      const cid = getWhereValue(constraints, 'clientId');
      const tid = getWhereValue(constraints, 'therapistId');
      const role = (getStoredRole() || '').toLowerCase();
      const self = getStoredUserId();
      const qs = cid ? `?clientId=${cid}` : tid ? `?therapistId=${tid}`
        : role === 'therapist' ? `?therapistId=${self}` : `?clientId=${self}`;
      const data = await api(`/api/v1/session-ratings${qs}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(x => ({ id: x.id, ...x }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'billing':
    case 'billingRecords': {
      const cid = getWhereValue(constraints, 'clientId') || getWhereValue(constraints, 'patientId');
      if (!cid) return toQuerySnapshot([]);
      const data = await api(`/api/v1/clients/${cid}/billing-records`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(x => ({ id: x.id, ...x }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'subscriptions': {
      // Backend lists by ?userId= (not a path segment); without it the endpoint
      // 401s, so return empty when there's no client id to scope the query.
      const cid = getWhereValue(constraints, 'clientId') || getWhereValue(constraints, 'userId') || getWhereValue(constraints, 'patientId');
      if (!cid) return toQuerySnapshot([]);
      const data = await api(`/api/v1/billing-profile/subscriptions?userId=${cid}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(x => ({ id: x.id, ...x }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'paymentMethods': {
      const cid = getWhereValue(constraints, 'clientId') || getWhereValue(constraints, 'userId') || getWhereValue(constraints, 'patientId');
      if (!cid) return toQuerySnapshot([]);
      const data = await api(`/api/v1/billing-profile/payment-methods?userId=${cid}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(x => ({ id: x.id, ...x }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'doctorNotes': {
      const doctorId  = getWhereValue(constraints, 'doctorId');
      const patientId = getWhereValue(constraints, 'patientId') || getWhereValue(constraints, 'clientId');
      const qs = new URLSearchParams();
      if (doctorId)  qs.set('doctorId', doctorId);
      if (patientId) qs.set('patientId', patientId);
      const data = await api(`/api/v1/doctor-notes${qs.toString() ? `?${qs}` : ''}`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(n => ({
        ...n, id: n.id,
        createdAt: n.createdAt ? Timestamp.fromDate(new Date(n.createdAt)) : null,
      }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'doctors': {
      const data = await api('/api/v1/doctors', { authenticated: false }).catch(() => []);
      // The backend returns doctors keyed by `userId` (not `id`); without this
      // fallback the row id is undefined and clicking a doctor navigates to
      // /doctors/undefined → 400 "Invalid UUID" → "user not found". Also spread
      // the original Firestore fields from metadataJson so the list shows email
      // and other onboarding fields.
      const items = (Array.isArray(data) ? data : []).map(d => {
        let meta = {};
        try { meta = d.metadataJson ? JSON.parse(d.metadataJson) : {}; } catch { /* ignore */ }
        return {
          ...meta,
          ...d,
          id: d.id || d.userId,
          name: d.fullName || d.name || meta.name,
          displayName: d.fullName || d.name || meta.name,
          email: d.email || meta.email,
          role: 'doctor',
        };
      });
      return toQuerySnapshot(applyInMemoryFilters(await _mergeAdminStatus(items, 'doctors'), constraints));
    }

    case 'doctorReviews': {
      const doctorId = getWhereValue(constraints, 'doctorId');
      if (!doctorId) return toQuerySnapshot([]);
      const data = await api(`/api/v1/doctors/${doctorId}/reviews`).catch(() => []);
      // The endpoint returns { reviews, averageRating, totalCount } — pull the array.
      const list = Array.isArray(data) ? data : (data?.reviews || []);
      const items = list.map(r => ({ id: r.id, ...r }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'diagnosticResults': {
      const data = await api('/api/v1/entity-operations/diagnostics/results').catch(() => []);
      const items = (Array.isArray(data) ? data : (data?.results || []));
      return toQuerySnapshot(applyInMemoryFilters(items.map(r => ({ id: r.id, ...r })), constraints));
    }

    case 'adminNotifications': {
      const data = await api('/api/v1/admin/notifications').catch(() => []);
      const items = (Array.isArray(data) ? data : (data?.notifications || [])).map(_normalizeTimestamps);
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    // Presence / read-receipt / call-signal collections — ephemeral Firestore-only
    // state with no REST equivalent; safe empty reads.
    case 'userPresence':
    case 'chatSeen':
    case 'callNotifications':
      return toQuerySnapshot([]);

    case 'auditLogs': {
      const data = await api('/api/v1/audit-logs?limit=500').catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(a => ({
        ...a,
        id: a.id,
        // Screen reads `timestamp.seconds`; backend returns an ISO instant.
        timestamp: a.timestamp ? Timestamp.fromDate(new Date(a.timestamp)) : null,
        // `details` is stored as text — surface a parsed object when it's JSON.
        details: (() => { try { return typeof a.details === 'string' ? JSON.parse(a.details) : a.details; } catch { return a.details; } })(),
      }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    // Client-side logging collections — authService already records login/logout
    // server-side, so these reads return empty (no-op).
    case 'loginLogs':
    case 'userLoginLogs':
    case 'userLogoutLogs':
      return toQuerySnapshot([]);

    case 'systemConfig': {
      const data = await _getSystemConfig();
      return toQuerySnapshot([{ id: 'main', ...(data || {}) }]);
    }

    case 'admins': {
      // There is no `admins` type on /admin/users — it was returning an empty
      // list for the same reason the Clients tab did. `all` includes ADMIN rows,
      // so filter them out here.
      const data = await api('/api/v1/admin/users?type=all&limit=500').catch(() => []);
      const items = (Array.isArray(data) ? data : [])
        .map(u => ({ ...u, id: u.id || u.userId, role: String(u.role || '').toLowerCase() }))
        .filter(u => u.role === 'admin');
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'therapistReviews':
    case 'therapistRatings': {
      const tid = getWhereValue(constraints, 'therapistId');
      if (!tid) return toQuerySnapshot([]);
      const data = await api(`/api/v1/therapy-engagement/therapists/${tid}/ratings`).catch(() => []);
      const items = (Array.isArray(data) ? data : []).map(r => ({ id: r.id, ...r }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    case 'userReports': {
      const data = await api('/api/v1/user-reports').catch(() => []);
      const items = (Array.isArray(data) ? data : (data?.reports || [])).map(r => _normalizeTimestamps({ id: r.id, ...r }));
      return toQuerySnapshot(applyInMemoryFilters(items, constraints));
    }

    // Firestore-only index/lookup collections and legacy typos — no REST equivalent;
    // their data is served by the proper list endpoints, so these read empty safely.
    case 'therapistSettings':
    case 'therapistRequests':
    case 'clientNotes':
    case 'therapyNotes':
    case 'therapists_admin_index':
    case 'therapists_usernames':
    case 'therapistt':
      return toQuerySnapshot([]);

    default:
      console.warn(`[firestoreShim] Unknown collection: ${col}`);
      return toQuerySnapshot([]);
  }
}

// ── getDocs ───────────────────────────────────────────────────────────────────

export async function getDocs(queryRef) {
  const { _path, _constraints } = queryRef;
  try {
    const snap = await resolveCollection(_path, _constraints);
    // Attach a routable doc ref to every result so updateDoc(d.ref) /
    // deleteDoc(d.ref) can resolve the correct endpoint (incl. subcollections).
    snap.docs.forEach(d => { d.ref = { _type: 'doc', _path: [..._path, d.id], id: d.id }; });
    return snap;
  } catch (e) {
    console.warn('[firestoreShim] getDocs error:', e?.message, _path);
    return toQuerySnapshot([]);
  }
}

// ── getDoc ────────────────────────────────────────────────────────────────────

export async function getDoc(docRef) {
  const path = docRef._path;
  const [col, id, sub] = path;

  try {
    switch (col) {
      case 'therapists': {
        if (sub) break; // subcollections handled elsewhere
        const data = await api(`/api/v1/therapists/${id}`).catch(() => null);
        return toDocSnap(data ? await _withIdentity(id, data) : null);
      }
      // The client note page reads doc(db, 'clientNotes', id). There was no
      // mapping, so it fell through to the empty-collection list and every note
      // rendered "Note not found". Both names point at the one clinical-notes store.
      case 'clientNotes':
      case 'clinicalNotes': {
        if (sub) break;
        const data = await api(`/api/v1/clinical-notes/${id}`).catch(() => null);
        return toDocSnap(data ? { ...data, id } : null);
      }
      case 'clients': {
        if (sub) break;
        const data = await api(`/api/v1/clients/${id}`).catch(() => null);
        return toDocSnap(data ? await _withIdentity(id, data) : null);
      }
      case 'auth': {
        // No per-user GET on /auth; the canonical user doc comes from resolve-role.
        const data = await api(`/api/v1/auth/${id}`).catch(() => ({}));
        return toDocSnap(await _withIdentity(id, data || {}));
      }
      case 'pharmacies':
      case 'labs':
      case 'scanCenters': {
        // Organization detail (org id == the account's user id). Map org fields to
        // the names the detail/edit screen expects.
        const org = await api(`/api/v1/registrations/organizations/${id}`).catch(() => null);
        if (!org) return toDocSnap(null);
        const nameKey = col === 'pharmacies' ? 'pharmacyName' : col === 'labs' ? 'labName' : 'scanCenterName';
        return toDocSnap({
          ...org,
          id,
          [nameKey]: org.name,
          name: org.name,
          email: org.contactEmail,
          phone: org.contactPhone,
          businessReg: org.registrationNumber,
          status: String(org.verificationStatus || 'pending').toLowerCase().replace('pending_review', 'pending'),
        });
      }
      case 'pharmacyBranches':
      case 'labBranches':
      case 'scanBranches': {
        // Single-branch fetch for the branch detail screen.
        const prefix = col === 'pharmacyBranches' ? 'pharmacy-branches' : col === 'labBranches' ? 'lab-branches' : 'scan-branches';
        const data = await api(`/api/v1/${prefix}/${id}`).catch(() => null);
        return toDocSnap(data ? _branchDoc(data, id) : null);
      }
      case 'doctorPrescriptions': {
        // Single-prescription fetch for the ops detail screens (parent + branch).
        // Alias `branchId`←`pharmacyBranchId` (the ops screens key ownership on
        // branchId) and `pharmacyStatus`←`rxStatus` so the detail matches the list.
        const data = await api(`/api/v1/medical/prescriptions/${id}`).catch(() => null);
        if (!data) return toDocSnap(null);
        return toDocSnap(_normalizeTimestamps({
          id,
          ...data,
          branchId: data.branchId || data.pharmacyBranchId || null,
          pharmacyStatus: data.pharmacyStatus || data.rxStatus || 'sent',
        }));
      }
      case 'doctors': {
        const data = await api(`/api/v1/doctors/${id}`).catch(() => null);
        return toDocSnap(data ? await _withIdentity(id, data) : null);
      }
      case 'homeCareNurses': {
        const data = await api(`/api/v1/homecare/nurses/${id}`).catch(() => null)
          || await api(`/api/v1/admin/users/${id}`).catch(() => null);
        return toDocSnap(data ? await _withIdentity(id, data) : null);
      }
      case 'homeCareBookings': {
        const data = await api(`/api/v1/homecare/bookings/${id}`).catch(() => null);
        return toDocSnap(data ? _normalizeTimestamps({ id, ...data }) : null);
      }
      case 'patientProfiles': {
        const data = await api(`/api/v1/patients/${id}`).catch(() => null);
        return toDocSnap(data ? await _withIdentity(id, data) : null);
      }
      case 'therapistReports':
      case 'reports': {
        // No single-GET endpoint — list and find by id.
        const list = await api('/api/v1/therapist-reports').catch(() => []);
        const found = (Array.isArray(list) ? list : []).find(r => String(r.id) === String(id));
        return toDocSnap(found ? { ...found, id } : null);
      }
      case 'therapyBooks': {
        const list = await api('/api/v1/therapy-books').catch(() => []);
        const found = (Array.isArray(list) ? list : []).find(b => String(b.id) === String(id));
        return toDocSnap(found ? { ...found, id } : null);
      }
      case 'worksheets': {
        const data = await api(`/api/v1/therapy-engagement/worksheets/${id}`).catch(() => null);
        if (!data) return toDocSnap(null);
        // Unpack the builder's form the same way the list does, otherwise the
        // detail page has a title and nothing else to render.
        let wsMeta = {};
        try { wsMeta = data.metadataJson ? JSON.parse(data.metadataJson) : {}; } catch { /* ignore */ }
        let wsAnswers = {};
        try { wsAnswers = data.latestResponse ? JSON.parse(data.latestResponse) : {}; } catch { /* ignore */ }
        return toDocSnap({
          ...wsMeta,
          ...data,
          id,
          description: wsMeta.description || data.prompt || '',
          instructions: wsMeta.instructions || data.prompt || '',
          fields: Array.isArray(wsMeta.fields) ? wsMeta.fields : [],
          createdBy: data.therapistId || wsMeta.createdBy || null,
          assignedTo: data.clientId ? [data.clientId] : [],
          // Answers already given, so a completed worksheet shows read-only.
          savedResponses: wsAnswers,
          // Must match the collection read above — a submission lands as
          // `submitted`, so checking only `completed` left this page unlocked and
          // the Save button reappeared after every reload.
          isCompleted: ['completed', 'submitted'].includes(String(data.status || '').toLowerCase()),
          // Same Firestore-era shape the therapist worksheet screens expect.
          clientResponses: (data.clientId && Object.keys(wsAnswers).length)
            ? { [data.clientId]: {
                responses: wsAnswers,
                clientName: data.clientName || null,
                submittedAt: data.lastSubmittedAt || null,
              } }
            : undefined,
          lastSubmittedAt: data.lastSubmittedAt || null,
          createdAt: data.createdAt ? Timestamp.fromDate(new Date(data.createdAt)) : null,
        });
      }
      case 'couples': {
        const data = await api(`/api/v1/couples/${id}/dashboard`).catch(() => null);
        // Shape it: callers (loadCouple → canBrowseTherapists) read status /
        // paymentComplete / partnerA / partnerB off this object. Returning the raw
        // { registration, …Sections } envelope left all of them undefined, so the
        // couple match screen always claimed intake and payment were outstanding.
        return toDocSnap(data ? { id, ..._coupleDashboardShape(data) } : null);
      }
      case 'diagnosticOrders': {
        // Lab/scan order-detail screens read one order by id.
        const row = await api(`/api/v1/diagnostics/operations/orders/${id}`).catch(() => null);
        return toDocSnap(row ? _normalizeTimestamps({ id: row.id, ...row }) : null);
      }
      case 'systemConfig': {
        const data = await _getSystemConfigDoc(id);
        return toDocSnap({ id, ...(data || {}) });
      }
      case 'userPresence': {
        // Online/offline for the chat header (onSnapshot reads via getDoc).
        const data = await api(`/api/v1/realtime/presence/${id}`).catch(() => null);
        return toDocSnap({ id, online: false, lastSeen: null, ...(data || {}) });
      }
      case 'admins': {
        const data = await api(`/api/v1/auth/${id}`).catch(() => null);
        return toDocSnap(data ? { id, ...data } : null);
      }
      case 'therapistSettings': {
        const data = await api(`/api/v1/therapists/${id}`).catch(() => null);
        return toDocSnap(data ? { id, ...data } : null);
      }
      default:
        console.warn(`[firestoreShim] getDoc unknown collection: ${col}`);
        return toDocSnap(null);
    }
  } catch (e) {
    console.warn('[firestoreShim] getDoc error:', e?.message, path);
  }
  return toDocSnap(null);
}

// ── addDoc ────────────────────────────────────────────────────────────────────

export async function addDoc(colRef, data) {
  const [col, id1, sub] = colRef._path;
  try {
    switch (`${col}${sub ? `/${sub}` : ''}`) {
      case 'scheduledCalls': {
        // The calendar writes a Firestore-shaped doc: `scheduledTime` as a shim
        // Timestamp OBJECT and `duration` in minutes. The endpoint wants an ISO
        // instant plus `durationMinutes`, so posting `data` unchanged returned
        // 500 ("Cannot deserialize java.time.Instant from Object value") and the
        // duration was dropped. Normalise both, and keep the Firestore-only
        // fields (clientName/status) in metadataJson.
        const toIso = (v) => {
          if (!v) return undefined;
          if (typeof v === 'string') return v;
          if (v instanceof Date) return v.toISOString();
          if (typeof v.toDate === 'function') return v.toDate().toISOString();
          if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
          return undefined;
        };
        return api('/api/v1/scheduled-calls', { method: 'POST', body: {
          therapistId: asUuid(data.therapistId) || getStoredUserId(),
          clientId: asUuid(data.clientId),
          channel: data.channel || 'video',
          title: data.title || null,
          notes: data.notes || '',
          roomName: data.roomName || null,
          durationMinutes: Number(data.durationMinutes ?? data.duration) || 30,
          createdBy: asUuid(data.createdBy) || getStoredUserId(),
          scheduledTime: toIso(data.scheduledTime) || new Date().toISOString(),
          // Send status as a real column, not only inside metadataJson. Buried in
          // metadata it never reached `scheduled_calls_v2.status`, so a client's
          // `pending` request was stored as an already-confirmed `scheduled` call
          // and the therapist had nothing to accept.
          status: data.status || 'scheduled',
          metadataJson: JSON.stringify({
            clientName: data.clientName ?? null,
            therapistName: data.therapistName ?? null,
            status: data.status ?? 'scheduled',
          }),
        } });
      }
      // The intake questionnaire creates the client record BEFORE the visitor has
      // an account, so there's no token to POST with. Previously this fell through
      // to `default:` — the whole questionnaire was dropped and `th.clientId`
      // became a fake `tmp_…` id, which is why the admin client Edit tab showed
      // almost no therapy data. Park the answers; SignUp writes them to
      // /clients/{uid} once the account exists (see materializeClientIntake).
      case 'clients': {
        if (!getStoredToken()) {
          try { localStorage.setItem('th.clientIntake', JSON.stringify(data)); } catch { /* ignore */ }
          return { id: 'pending-intake' };
        }
        const clientId = data.clientId || getStoredUserId();
        return api('/api/v1/clients', { method: 'POST', body: {
          clientId,
          phone: data.phone || null,
          emergencyContact: data.emergencyContact || null,
          preferencesJson: JSON.stringify(data),
          avatarUrl: data.photoURL || data.avatarUrl || null,
          status: data.status || 'active',
        } }).then(r => ({ id: r?.clientId || r?.id || clientId }));
      }

      case 'clients/therapyNotes': {
        // The endpoint requires a non-null `body` column; the session-note modal
        // writes structured fields (sessionFocus/clientResponse/…) and no `body`,
        // so posting `data` straight through violated the NOT NULL constraint →
        // 409, which aborted the whole save ("Failed to save note") before the
        // clinicalNotes write ever ran. Derive a body and keep the full shape in
        // metadataJson.
        const noteBody = data.body || data.content || data.note || data.sessionFocus
          || data.clientResponse || data.behavioralObservations || 'Session note';
        return api(`/api/v1/clients/${id1}/therapy-notes`, { method: 'POST', body: {
          therapistId: data.therapistId || getStoredUserId(),
          body: noteBody,
          source: data.source || 'subcollection',
          metadataJson: JSON.stringify(data),
        } });
      }
      case 'therapists/clients':
        // Assigning a client to a therapist (subcollection write → assignment).
        return api('/api/v1/therapy-management/assignments', { method: 'POST', body: { therapistId: id1, clientId: data.clientId } });
      case 'doctors/diagnosticCustomEntries':
        return api(`/api/v1/doctors/${id1}/diagnostic-custom-entries`, { method: 'POST', body: { category: data.category, label: data.label } });
      case 'clinicalNotes': {
        // Unified rich clinical-notes store (syncs with mobile).
        // `content` is @NotBlank server-side. The session-note modal writes
        // structured fields (sessionFocus/clientResponse/…) and no content/body,
        // so this posted "" → 400 Validation failed → "Failed to save note".
        // Fall back to the structured fields, and carry the full note through as
        // structuredData so nothing entered is lost.
        const cnContent = data.content || data.body || data.note || data.sessionFocus
          || data.clientResponse || data.behavioralObservations || 'Session note';
        const cnStructured = data.structuredData !== undefined ? data.structuredData : data;
        return api('/api/v1/clinical-notes', { method: 'POST', body: {
          therapistId: data.therapistId || getStoredUserId(),
          clientId: data.clientId,
          assignmentId: data.assignmentId || null,
          sessionId: data.sessionId || null,
          noteType: data.noteType || 'note',
          content: cnContent,
          structuredData: typeof cnStructured === 'object' ? JSON.stringify(cnStructured) : (cnStructured || null),
          visibleToClient: data.visibleToClient ?? false,
          isDraft: data.isDraft ?? false,
          signature: data.signature || null,
        } });
      }
      case 'notes':
        return api(`/api/v1/clients/${data.clientId}/therapy-notes`, { method: 'POST', body: { therapistId: data.therapistId, body: JSON.stringify(data), source: 'client-note' } });
      case 'doctorAvailability': {
        // Component sends {date,startTime,endTime}; backend wants startsAt/endsAt
        // Instants. Build them as local datetimes → ISO (UTC) so they round-trip.
        const did = data.doctorId || getStoredUserId();
        const startsAt = new Date(`${data.date}T${data.startTime || '09:00'}:00`).toISOString();
        const endsAt = new Date(`${data.date}T${data.endTime || '17:00'}:00`).toISOString();
        return api(`/api/v1/care/doctors/${did}/availability`, { method: 'POST', body: { startsAt, endsAt } });
      }
      case 'pharmacyBranches':
      case 'labBranches':
      case 'scanBranches': {
        const orgId = data.pharmacyId || data.labId || data.scanId || data.organizationId;
        const type = col === 'pharmacyBranches' ? 'PHARMACY' : col === 'labBranches' ? 'LAB' : 'SCAN_CENTER';
        const branchBody = {
          branchName: data.branchName || data.name,
          branchCode: data.branchCode || null,
          country: data.country || null,
          city: data.city || null,
          address: data.address || (typeof data.location === 'string' ? data.location : null),
          latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : null,
          longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : null,
        };
        // If a branch login account was created (createUserWithEmailAndPassword →
        // data.uid), tie the branch to it (branch id == uid) so it can log in.
        if (data.uid) {
          return api('/api/v1/registrations/branches/for-user', {
            method: 'POST',
            body: { userId: data.uid, organizationId: orgId, type, email: data.email || null, ...branchBody },
          });
        }
        return api(`/api/v1/registrations/organizations/${orgId}/branches`, { method: 'POST', body: branchBody });
      }
      case 'doctorAppointments': {
        const apptType = data.consultationType || data.type;
        return api('/api/v1/medical/appointments', { method: 'POST', body: {
          doctorId: data.doctorId,
          patientId: data.patientId || data.clientId,
          scheduledAt: data.scheduledAt || (data.date ? `${data.date}T${data.time || '09:00'}:00` : new Date().toISOString()),
          notes: [apptType ? `[${apptType}]` : '', data.reason || data.notes || ''].filter(Boolean).join(' ').trim(),
          status: data.status || 'pending',
        } });
      }
      case 'doctorPrescriptions':
        // Backend now accepts the rich shape and derives medication/dosage from the
        // first med, so forward diagnosis / ref / status / pharmacy routing too.
        return api('/api/v1/medical/prescriptions', { method: 'POST', body: {
          doctorId: data.doctorId,
          patientId: data.patientId || data.clientId,
          medications: data.medications || [],
          medicationsJson: JSON.stringify(data.medications || []),
          medication: data.medications?.[0]?.name || '',
          dosage: data.medications?.[0]?.dosage || '',
          instructions: data.instructions || '',
          diagnosis: data.diagnosis || '',
          prescriptionRef: data.prescriptionRef || null,
          pharmacyId: data.pharmacyId || null,
          pharmacyBranchId: data.branchId || data.pharmacyBranchId || null,
          status: data.status || 'active',
        } });
      case 'homeCareBookings': {
        // Emergencies have their OWN endpoint: it sets isEmergency/urgency and
        // publishes to the nurse broadcast feed. Everything used to go to the
        // ordinary /bookings route, so a web emergency was filed as a routine
        // booking and no nurse was ever alerted.
        const isEmergency = data.isEmergency === true || data.bookingType === 'emergency';
        const common = {
          nurseId: data.nurseId || null,
          nurseName: data.nurseName || null,
          patientId: data.patientId,
          patientPhone: data.patientPhone || null,
          serviceType: data.serviceType || data.service || null,
          address: typeof data.address === 'string' ? data.address : (data.address?.address || null),
          latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : (data.location?.latitude ?? null),
          longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : (data.location?.longitude ?? null),
        };
        if (isEmergency) {
          return api('/api/v1/homecare/bookings/emergency', { method: 'POST', body: {
            ...common,
            bookingType: 'emergency',
            isEmergency: true,
            urgency: data.urgency || 'high',
          } });
        }
        return api('/api/v1/homecare/bookings', { method: 'POST', body: {
          ...common,
          durationType: data.durationType || null,
          startDate: data.startDate || null,
          endDate: data.endDate || null,
          notes: data.notes || data.note || null,
        } });
      }
      case 'homeCareNurseEarnings':
        return api(`/api/v1/homecare/nurses/${data.nurseId}/earnings`, { method: 'POST', body: { amount: data.amount, note: data.note || null, bookingId: data.bookingId || null } });
      case 'homeCareComplaints':
        // Backend wants evidenceUrls as a string; the form sends an array.
        return api('/api/v1/homecare/complaints', { method: 'POST', body: {
          ...data,
          evidenceUrls: Array.isArray(data.evidenceUrls) ? data.evidenceUrls.join(',') : (data.evidenceUrls || null),
        } });
      case 'patientTimeline':
        return api('/api/v1/patient-timeline', { method: 'POST', body: data }).catch(() => ({ id: `tmp_${Date.now()}` }));
      case 'worksheets': {
        // WorksheetRequest wants therapistId (@NotNull) + prompt (@NotBlank), but
        // the builder posts its own form shape (createdBy / instructions / fields /
        // assignedClients). Posting it raw sent a null therapistId and null prompt
        // into NOT NULL columns — a 409 the screen showed as
        // "Error creating worksheet". Map to the contract and keep the whole form
        // in metadataJson so the fields the therapist defined actually persist.
        const wsTherapistId = data.therapistId || data.createdBy || getStoredUserId();
        const wsPrompt =
          data.prompt || data.instructions || data.description || data.goal || data.title || 'Worksheet';
        const wsBody = (clientId) => ({
          therapistId: wsTherapistId,
          clientId: clientId || null,
          title: data.title || 'Untitled worksheet',
          prompt: wsPrompt,
          dueDate: data.dueDate || null,
          metadataJson: JSON.stringify(data),
        });
        // Assigning to several clients means one worksheet each, so every client
        // sees their own copy; with none assigned it is saved as a template.
        // The builder stores its picks in `assignedTo`; other callers use
        // `assignedClients`. Accept either, and either ids or client objects —
        // reading only one name meant every worksheet saved as an unassigned
        // template and no client ever received it.
        const rawAssignees = Array.isArray(data.assignedTo) && data.assignedTo.length
          ? data.assignedTo
          : (Array.isArray(data.assignedClients) ? data.assignedClients : []);
        const assignees = rawAssignees
          .map(c => (typeof c === 'string' ? c : (c?.id || c?.clientId)))
          .filter(Boolean);
        if (assignees.length === 0) {
          return api('/api/v1/therapy-engagement/worksheets', { method: 'POST', body: wsBody(null) });
        }
        const created = await Promise.all(assignees.map(cid =>
          api('/api/v1/therapy-engagement/worksheets', { method: 'POST', body: wsBody(cid) })));
        return created[0] || { id: `tmp_${Date.now()}` };
      }
      case 'therapistResources':
      case 'resources':
        // The endpoint stores title/body/isPublic/url plus owner + metadataJson.
        // Posting `data` raw dropped the therapistId the Resources screen filters
        // on (so a saved resource never appeared) and discarded the whole
        // authoring form. Map the known columns and keep the rest in metadata.
        return api('/api/v1/resources', { method: 'POST', body: {
          title: data.title || 'Untitled resource',
          body: data.body || data.content || data.description || null,
          isPublic: data.isPublic ?? true,
          url: data.url || data.fileUrl || null,
          therapistId: data.therapistId || getStoredUserId(),
          metadataJson: JSON.stringify(data),
        } });
      case 'therapistReports':
      case 'reports':
        return api('/api/v1/therapist-reports', { method: 'POST', body: data });
      case 'therapyBooks':
        return api('/api/v1/therapy-books', { method: 'POST', body: bookBody(data) });
      case 'clients/goals':
        return api('/api/v1/therapy-management/goals', { method: 'POST', body: { clientId: id1, ...data } });
      case 'auditLogs':
        return api('/api/v1/audit-logs', { method: 'POST', body: data }).catch(() => ({ id: `tmp_${Date.now()}` }));
      case 'supportTickets':
        return api('/api/v1/care/support/tickets', { method: 'POST', body: data });
      case 'globalReports':
        // Write to the same store the admin Reports Center / client Support screens
        // read from (/reports/global). The form already sends category+message+
        // subject+severity+reporter*, matching the endpoint's request shape.
        return api('/api/v1/reports/global', { method: 'POST', body: data });
      case 'sessionRatings':
        return api('/api/v1/session-ratings', { method: 'POST', body: data });
      case 'Client daily mood tracking':
      case 'clientMoodTracking':
      case 'clientMoods': {
        const mClient = data.clientId || getStoredUserId();
        return api(`/api/v1/clients/${mClient}/mood`, { method: 'POST', body: {
          clientId: mClient,
          mood: String(data.mood || data.moodLabel || 'Okay'),
          moodValue: Number(data.moodValue ?? data.moodScore ?? 0) || null,
          journalEntry: data.journalEntry || data.notes || data.reflection || null,
          gratitude: data.gratitude || null,
          challenges: data.challenges || null,
          assignedTherapistId: data.assignedTherapistId || data.therapistId || null,
          dateLabel: data.dateLabel || new Date().toISOString().slice(0, 10),
        } });
      }
      case 'patientDailyFeelings':
        return api(`/api/v1/patients/${data.patientId || data.clientId}/daily-feelings`, { method: 'POST', body: data });
      case 'patientIntake': {
        // Endpoint is PUT and expects { intakeJson: "<json string>" }. Serialize the
        // intake payload if the screen passed an object.
        const pid = data.patientId || data.clientId;
        const intakeJson = typeof data.intakeJson === 'string'
          ? data.intakeJson
          : JSON.stringify(data.intakeJson || data.intake || data);
        return api(`/api/v1/patients/${pid}/medical-intake`, { method: 'PUT', body: { intakeJson } });
      }
      case 'dischargeRequests':
        return api(`/api/v1/patients/${data.patientId || data.clientId}/discharge-requests`, { method: 'POST', body: data });
      case 'subscriptions':
        // Backend route is /subscriptions with userId in the body (not the path).
        return api('/api/v1/billing-profile/subscriptions', { method: 'POST', body: { userId: data.clientId || data.userId || data.patientId, ...data } });
      case 'paymentMethods':
        return api('/api/v1/billing-profile/payment-methods', { method: 'POST', body: { userId: data.clientId || data.userId || data.patientId, ...data } });
      case 'billing':
      case 'billingRecords':
        return api(`/api/v1/clients/${data.clientId || data.patientId}/billing-records`, { method: 'POST', body: data });
      case 'doctorNotes':
        return api('/api/v1/doctor-notes', { method: 'POST', body: data });
      case 'doctor_chats/messages':
      case 'doctorChats/messages':
        // Screen sends {text, from, type}; backend wants {body, senderId, messageType}.
        return api(`/api/v1/doctor-chats/${id1}/messages`, { method: 'POST', body: {
          senderId: data.senderId || data.from || getStoredUserId(),
          body: data.body || data.text || '',
          messageType: data.messageType || data.type || 'text',
        } });
      case 'doctorReviews':
        return api(`/api/v1/doctors/${data.doctorId}/reviews`, { method: 'POST', body: data });
      case 'therapistReviews':
      case 'therapistRatings':
        return api('/api/v1/therapy-engagement/therapists/ratings', { method: 'POST', body: data });
      case 'userReports':
        return api('/api/v1/compat/global-reports', { method: 'POST', body: data });
      case 'client_chats/messages':
      case 'clientChats/messages': {
        // id1 is the clientId — backend resolves/creates the client↔therapist thread.
        // Attachments carry their metadata in `content` ({url,name,type}); forward it
        // as explicit fields so the receiver can render an image/file/voice note
        // instead of a bare URL.
        const att = (data.content && typeof data.content === 'object') ? data.content : null;
        const url = data.mediaUrl || data.fileUrl || att?.url || null;
        return api(`/api/v1/care/chats/client/${id1}/messages`, { method: 'POST', body: {
          ...data,
          ...(url ? {
            mediaUrl: url,
            fileUrl: url,
            fileName: data.fileName || att?.name || null,
            mimeType: data.mimeType || att?.type || null,
            fileSize: data.fileSize ?? att?.size ?? null,
            duration: data.duration ?? att?.duration ?? null,
          } : {}),
        } });
      }
      case 'therapist_chats/messages':
      case 'therapistChats/messages': {
        // id1 is "{userA}_{userB}" — staff chat between two therapists.
        const [a, b] = String(id1).split('_');
        return api(`/api/v1/care/chats/pair/${a}/${b}/messages`, { method: 'POST', body: data });
      }
      case 'adminNotifications':
        return api('/api/v1/admin/notifications', { method: 'POST', body: data });
      case 'pharmacyRxEvents':
        return api('/api/v1/entity-operations/pharmacy/events', { method: 'POST', body: data });
      case 'diagnosticOrders':
        // Doctor creates a lab/scan order → POST /diagnostics/operations/orders
        // (writes diagnostic_orders_v2, which the lab/scan dashboards read). Forward
        // the display fields so the lab/patient/doctor lists render test/patient info.
        return api('/api/v1/diagnostics/operations/orders', { method: 'POST', body: {
          doctorId: data.doctorId,
          patientId: data.patientId || data.clientId,
          type: data.type || data.centerType || null,
          centerType: data.centerType || data.type || null,
          diagnosticType: data.centerType || data.diagnosticType || data.type || 'lab',
          testType: data.testType || data.testName || null,
          patientName: data.patientName || data.clientName || null,
          doctorName: data.doctorName || null,
          organizationId: data.centerId || data.organizationId || data.labId || data.scanId || null,
          centerId: data.centerId || data.labId || data.scanId || null,
          centerName: data.centerName || null,
          branchId: data.branchId || null,
          branchName: data.branchName || null,
          catalogItemId: data.catalogItemId || null,
          orderId: data.orderId || null,
          status: data.status || 'pending',
          notes: data.notes || [data.testType, data.testName].filter(Boolean).join(' — ') || null,
        } });
      case 'diagnosticResults':
        return api(`/api/v1/diagnostics/operations/orders/${data.orderId}/results`, { method: 'POST', body: {
          branchId: data.branchId || null,
          findings: data.findings || null,
          conclusion: data.conclusion || null,
          reportUrl: data.reportUrl || data.fileUrl || null,
          status: data.status || 'completed',
          releasedToPatient: data.releasedToPatient ?? true,
          releasedToDoctor: data.releasedToDoctor ?? true,
        } });
      case 'patientNotifications':
      case 'diagnosticBranchEvents':
        return { id: `tmp_${Date.now()}` };
      // Presence write via addDoc path (rare) → upsert; others have no REST write.
      case 'userPresence':
        return api(`/api/v1/realtime/presence/${id1}`, { method: 'PUT', body: { status: data?.online ? 'online' : 'offline' } }).catch(() => ({ id: id1 }));
      case 'chatSeen':
      case 'callNotifications':
        return { id: `tmp_${Date.now()}` };
      // Client-side login/logout logging — handled server-side by authService.
      case 'loginLogs':
      case 'userLoginLogs':
      case 'userLogoutLogs':
        return { id: `tmp_${Date.now()}` };
      default:
        console.warn('[firestoreShim] addDoc unknown collection:', col, sub);
        return { id: `tmp_${Date.now()}` };
    }
  } catch (e) {
    console.warn('[firestoreShim] addDoc error:', e?.message);
    // Callers that must know whether the row really landed (e.g. the pre-signup
    // doctor booking, which otherwise silently loses the appointment) can check
    // `_failed`. Returning a doc-shaped object keeps every existing call site,
    // which only reads `.id`, working exactly as before.
    return { id: `tmp_${Date.now()}`, _failed: true, _error: e?.message || 'write failed' };
  }
}

// ── updateDoc ─────────────────────────────────────────────────────────────────

export async function updateDoc(docRef, data) {
  const path = docRef?._path || [];
  const [col, id, sub, subId] = path;
  try {
    // ── Subcollection documents ──────────────────────────────────────────────
    if (sub) {
      if (col === 'clients' && sub === 'goals') {
        return api(`/api/v1/therapy-management/goals/${subId}`, { method: 'PATCH', body: data });
      }
      if (col === 'clients' && sub === 'therapyNotes') {
        return api(`/api/v1/clients/${id}/therapy-notes/${subId}`, { method: 'PATCH', body: data });
      }
      console.warn('[firestoreShim] updateDoc unmapped subcollection:', col, sub);
      return null;
    }
    // ── Admin approval / status actions (Account Approvals + User Management) ──
    // Status lives in a separate store (admin_user_status / nurse.accountStatus /
    // org.verificationStatus), not the profile, so route status changes to the
    // authoritative admin endpoints. A *pure* status change (suspend/approve/
    // reject button) is handled here and returns; an edit that also changes
    // profile fields fires the status action AND falls through to save the rest.
    if (_isAdmin()) {
      const wantsStatus = data.status || data.accountStatus || data.verificationStatus;
      const s = wantsStatus ? String(wantsStatus).toLowerCase() : '';
      const action = (s === 'active' || s === 'approved' || s === 'restore') ? 'approve'
        : s === 'rejected' ? 'reject'
        : (s === 'suspended' || s === 'inactive') ? 'suspend' : null;
      if (action) {
        const reason = data.rejectionReason || data.reason || null;
        let statusCall = null;
        if (col === 'homeCareNurses') {
          const accountStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended';
          statusCall = api(`/api/v1/homecare/admin/nurses/${id}/account-status`, { method: 'PATCH', body: { accountStatus, adminNote: reason } });
        } else if (col === 'pharmacies' || col === 'labs' || col === 'scanCenters') {
          statusCall = api(`/api/v1/admin/approvals/organization/${id}/decision`, { method: 'POST', body: { decision: action === 'approve' ? 'approve' : 'reject', reason } });
        } else if (['doctors', 'therapists', 'auth', 'clients', 'admins'].includes(col)) {
          statusCall = api(`/api/v1/admin/users/${id}/actions`, { method: 'POST', body: { action, reason } });
        }
        if (statusCall) {
          const IGNORE = new Set(['status', 'accountStatus', 'verificationStatus', 'updatedAt', 'statusUpdatedAt', 'approvedAt', 'rejectedAt', 'rejectionReason', 'reason', 'presenceStatus']);
          const hasOtherFields = Object.keys(data).some(k => !IGNORE.has(k) && data[k] !== undefined);
          if (!hasOtherFields) return statusCall;  // pure status change → done
          await statusCall;                         // edit also changes profile → continue
        }
      }
      // Admin edit: name/email live on the users row — persist them there
      // (the per-collection PATCH below only handles role-specific profile fields).
      if (['doctors', 'therapists', 'auth', 'clients', 'admins', 'pharmacies', 'labs', 'scanCenters'].includes(col)) {
        const fullName = data.name || data.fullName || data.pharmacyName || data.labName || data.scanCenterName;
        if (fullName !== undefined || data.email !== undefined) {
          await api(`/api/v1/admin/users/${id}`, {
            method: 'PATCH',
            body: { ...(fullName !== undefined ? { fullName } : {}), ...(data.email !== undefined ? { email: data.email } : {}) },
          }).catch(() => {});
        }
      }
    }
    // ── Top-level documents ──────────────────────────────────────────────────
    switch (col) {
      case 'scheduledCalls':
        return api(`/api/v1/scheduled-calls/${id}`, { method: 'PATCH', body: data });
      case 'clients': {
        const role = (getStoredRole() || '').toLowerCase();
        const isSelf = String(getStoredUserId()) === String(id);
        // Therapist/admin changing a client's status (e.g. discharge) uses the
        // therapist-accessible status route; reassignment (therapistId) is handled
        // separately via the assignments endpoint, so it's a no-op here.
        if (data.status !== undefined && !isSelf && (role === 'therapist' || role === 'admin')) {
          return api(`/api/v1/clients/${id}/status`, { method: 'PATCH', body: { status: data.status } });
        }
        if (data.therapistId !== undefined && Object.keys(data).length === 1) {
          return null; // reassignment already performed via /assignments
        }
        // ClientProfilePatch only persists phone/emergencyContact/preferencesJson/
        // avatarUrl/status — every other key sent flat is dropped by Jackson, which
        // is how the whole therapy intake (therapyType, phq9, concerns, consent…)
        // disappeared. Fold the rest into preferencesJson, merged over what's
        // already stored so a partial write doesn't erase earlier answers.
        const existingClient = await api(`/api/v1/clients/${id}`).catch(() => null);
        let prefs = {};
        try { prefs = existingClient?.preferencesJson ? JSON.parse(existingClient.preferencesJson) : {}; } catch { /* ignore */ }
        const mergedPrefs = { ...prefs, ...data };
        const body = {
          phone: data.phone ?? existingClient?.phone ?? null,
          emergencyContact: data.emergencyContact ?? existingClient?.emergencyContact ?? null,
          avatarUrl: data.photoURL || data.avatarUrl || existingClient?.avatarUrl || null,
          status: data.status || existingClient?.status || 'active',
          preferencesJson: JSON.stringify(mergedPrefs),
        };
        // PATCH first, POST only if it fails. Doing it the other way round risks a
        // duplicate profile row: GET auto-creates the record, so a transient read
        // failure (swallowed by the .catch above) would look like "no profile yet"
        // and insert a second row for the same clientId.
        try {
          return await api(`/api/v1/clients/${id}`, { method: 'PATCH', body });
        } catch (patchErr) {
          return api('/api/v1/clients', { method: 'POST', body: { clientId: id, ...body } });
        }
      }
      case 'doctors': {
        // The doctor PATCH only persists fullName/specialization/phone/location/
        // bio/metadataJson. Components send a flat doc with `name` + rich fields,
        // so map name→fullName and fold everything else into metadataJson
        // (merged with existing metadata so onboarding fields aren't lost).
        const existing = await api(`/api/v1/doctors/${id}`).catch(() => null);
        let meta = {};
        try { meta = existing?.metadataJson ? JSON.parse(existing.metadataJson) : {}; } catch { /* ignore */ }
        const merged = { ...meta, ...data };
        const locationStr = typeof data.location === 'string' ? data.location : (data.location?.address || meta.location || null);
        if (locationStr) merged.location = locationStr;
        return api(`/api/v1/doctors/${id}`, {
          method: 'PATCH',
          body: {
            ...((data.name || data.fullName) ? { fullName: data.name || data.fullName } : {}),
            ...(data.specialization !== undefined ? { specialization: data.specialization } : {}),
            ...(data.phone !== undefined ? { phone: data.phone } : {}),
            ...(locationStr ? { location: locationStr } : {}),
            ...(data.bio !== undefined ? { bio: data.bio } : {}),
            metadataJson: JSON.stringify(merged),
          },
        });
      }
      case 'therapists':
        return api(`/api/v1/therapists/${id}`, { method: 'PATCH', body: _therapistPatchBody(data, await _therapistMeta(id)) });
      case 'pharmacies':
      case 'labs':
      case 'scanCenters': {
        const body = {
          name: data.pharmacyName || data.labName || data.scanCenterName || data.name || data.centerName,
          registrationNumber: data.businessReg || data.registrationNumber || null,
          contactPhone: data.phone || data.contactPhone || null,
          contactEmail: data.email || data.contactEmail || null,
          country: data.country || null,
          city: data.city || null,
          address: data.address || (typeof data.location === 'string' ? data.location : null),
        };
        // Admin onboarding upserts via the admin endpoint; an org editing its OWN
        // settings (pharmacy/lab/scan) uses the self-service PATCH (the admin
        // endpoint is admin-only → 403 for the org user).
        if (_isAdmin()) {
          const type = col === 'pharmacies' ? 'PHARMACY' : col === 'labs' ? 'LAB' : 'SCAN_CENTER';
          return api('/api/v1/admin/onboarding/organization', { method: 'POST', body: { userId: id, type, ...body } });
        }
        return api(`/api/v1/registrations/organizations/${id}`, { method: 'PATCH', body });
      }
      case 'pharmacyBranches':
      case 'labBranches':
      case 'scanBranches': {
        // A branch login clearing its own forced-password flag sends just
        // { mustChangePassword: false }. The branch PATCH requires the parent org's
        // role (PHARMACY/LAB/SCAN_CENTER), which the branch user does not have → 403.
        // The /auth/password-change call already cleared the user's flag (resolve-role
        // reads the user flag, so the modal won't reappear), and the backend also
        // clears the branch entity flag — so treat this as a no-op here.
        const _branchManaged = data.branchName || data.name || data.status !== undefined
          || data.city !== undefined || data.country !== undefined || data.address !== undefined;
        if (!_branchManaged && data.mustChangePassword !== undefined) {
          return { id, ...data };
        }
        const prefix = col === 'pharmacyBranches' ? 'pharmacy-branches' : col === 'labBranches' ? 'lab-branches' : 'scan-branches';
        return api(`/api/v1/${prefix}/${id}`, {
          method: 'PATCH',
          body: {
            ...((data.branchName || data.name) ? { name: data.branchName || data.name } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.city !== undefined ? { city: data.city } : {}),
            ...(data.country !== undefined ? { country: data.country } : {}),
            ...(data.address !== undefined ? { address: data.address } : {}),
            ...(data.mustChangePassword !== undefined ? { mustChangePassword: data.mustChangePassword } : {}),
          },
        });
      }
      case 'doctorAppointments':
        return api(`/api/v1/medical/appointments/${id}`, { method: 'PATCH', body: data });
      case 'doctorPrescriptions':
        // The ops screens send `pharmacyStatus` (workflow state) and the full
        // `medications` array (per-drug state lives in medicationsJson). Forward all
        // of them; the backend maps pharmacyStatus→rxStatus and branchId→branch.
        return api(`/api/v1/medical/prescriptions/${id}`, { method: 'PATCH', body: {
          ...(data.medications !== undefined ? { medicationsJson: JSON.stringify(data.medications) } : {}),
          ...(data.pharmacyStatus !== undefined ? { pharmacyStatus: data.pharmacyStatus } : {}),
          ...(data.status !== undefined ? { rxStatus: data.status } : {}),
          ...(data.branchId !== undefined ? { pharmacyBranchId: data.branchId } : {}),
          ...(data.refCode !== undefined ? { refCode: data.refCode } : {}),
          ...(data.prescriptionRef !== undefined ? { prescriptionRef: data.prescriptionRef } : {}),
          ...(data.diagnosis !== undefined ? { diagnosis: data.diagnosis } : {}),
          ...(data.followUpDate !== undefined ? { followUpDate: data.followUpDate } : {}),
          ...(data.dispensedBrandPackUsed !== undefined ? { dispensedBrandPackUsed: data.dispensedBrandPackUsed } : {}),
          ...(data.counselingPickupInstruction !== undefined ? { counselingPickupInstruction: data.counselingPickupInstruction } : {}),
          ...(data.coldChainStorageHandling !== undefined ? { coldChainStorageHandling: data.coldChainStorageHandling } : {}),
          ...(data.dispenseExceptionDetail !== undefined ? { dispenseExceptionDetail: data.dispenseExceptionDetail } : {}),
        } });
      case 'notifications':
        return api(`/api/v1/therapy-management/notifications/read`, { method: 'POST', body: { notificationId: id } });
      case 'clinicalNotes':
        return api(`/api/v1/clinical-notes/${id}`, { method: 'PATCH', body: {
          // Reassigning a note to a different client is a normal edit; this
          // whitelist omitted clientId, so the change was dropped in silence.
          ...(asUuid(data.clientId) ? { clientId: asUuid(data.clientId) } : {}),
          ...(data.noteType !== undefined ? { noteType: data.noteType } : {}),
          ...(data.content !== undefined || data.body !== undefined ? { content: data.content ?? data.body } : {}),
          ...(data.structuredData !== undefined ? { structuredData: typeof data.structuredData === 'object' ? JSON.stringify(data.structuredData) : data.structuredData } : {}),
          ...(data.visibleToClient !== undefined ? { visibleToClient: data.visibleToClient } : {}),
          ...(data.isDraft !== undefined ? { isDraft: data.isDraft } : {}),
          ...(data.signature !== undefined ? { signature: data.signature } : {}),
        } });
      case 'therapistReports':
      case 'reports':
        return api(`/api/v1/therapist-reports/${id}`, { method: 'PATCH', body: data });
      // Admin Reports Center edits (status change + reply thread). Without these the
      // update fell through to `default:`, which only logs — so the admin's replies
      // and status changes were never persisted and the reporter never saw them.
      case 'globalReports':
        return api(`/api/v1/reports/global/${id}`, { method: 'PATCH', body: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.adminNote !== undefined ? { adminNote: data.adminNote } : {}),
          ...(data.adminReplies !== undefined
            ? { adminRepliesJson: JSON.stringify(data.adminReplies) }
            : {}),
        } });
      case 'supportTickets':
        return api(`/api/v1/care/support/tickets/${id}`, { method: 'PATCH', body: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.adminReplies !== undefined
            ? { adminRepliesJson: JSON.stringify(data.adminReplies) }
            : {}),
        } });
      case 'userReports':
        return api(`/api/v1/user-reports/${id}`, { method: 'PATCH', body: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.adminReplies !== undefined
            ? { adminRepliesJson: JSON.stringify(data.adminReplies) }
            : {}),
        } });
      case 'therapyBooks':
        return api(`/api/v1/therapy-books/${id}`, { method: 'PATCH', body: bookBody(data) });
      case 'worksheets': {
        // A client submitting answers writes the Firestore dotted path
        // `clientResponses.<clientId>` (or the whole map). The API knows nothing
        // about that shape — it wants `submissionResponse` (a JSON string) plus
        // `clientId` — so the PATCH returned 200 with every field ignored: the
        // save "succeeded", nothing was stored, and refreshing brought the empty
        // form back with the worksheet still unanswered.
        const dottedKey = Object.keys(data).find(k => k.startsWith('clientResponses.'));
        const submission = dottedKey
          ? { clientId: dottedKey.slice('clientResponses.'.length), entry: data[dottedKey] }
          : (data.clientResponses && typeof data.clientResponses === 'object'
              ? (() => {
                  const [cid, entry] = Object.entries(data.clientResponses)[0] || [];
                  return cid ? { clientId: cid, entry } : null;
                })()
              : null);

        if (submission?.entry?.responses) {
          const rest = { ...data };
          delete rest[dottedKey];
          delete rest.clientResponses;
          return api(`/api/v1/therapy-engagement/worksheets/${id}`, { method: 'PATCH', body: {
            ...rest,
            clientId: submission.clientId,
            submissionResponse: JSON.stringify(submission.entry.responses),
          } });
        }
        return api(`/api/v1/therapy-engagement/worksheets/${id}`, { method: 'PATCH', body: data });
      }
      case 'therapistResources':
      case 'resources':
        // PATCH /resources/{id} now exists. This used to POST, which CREATED A
        // SECOND RESOURCE instead of editing the existing one — every "save" on an
        // edit left a duplicate card behind.
        return api(`/api/v1/resources/${id}`, { method: 'PATCH', body: {
          title: data.title,
          body: data.body ?? data.content ?? data.description ?? null,
          isPublic: data.isPublic ?? true,
          url: data.url ?? data.fileUrl ?? null,
          therapistId: data.therapistId || getStoredUserId(),
          metadataJson: JSON.stringify(data),
        } });
      case 'patientProfiles':
        return api(`/api/v1/patients/${id}`, { method: 'PATCH', body: data });
      case 'homeCareNurses': {
        // Presence and location have dedicated endpoints; the generic profile PATCH
        // ignores those fields, so route them explicitly or they silently no-op.
        const keys = Object.keys(data).filter(k => k !== 'updatedAt');
        if (data.presenceStatus !== undefined && keys.every(k => k === 'presenceStatus')) {
          return api(`/api/v1/homecare/nurses/${id}/presence`, { method: 'PATCH', body: { presenceStatus: data.presenceStatus } });
        }
        if ((data.latitude !== undefined || data.longitude !== undefined) && keys.every(k => k === 'latitude' || k === 'longitude')) {
          return api(`/api/v1/homecare/nurses/${id}/location`, { method: 'PATCH', body: { latitude: data.latitude, longitude: data.longitude } });
        }
        return api(`/api/v1/homecare/nurses/${id}`, { method: 'PATCH', body: _nursePatchBody(data) });
      }
      case 'homeCareBookings': {
        // Booking lifecycle updates. Feedback (rating) has its own endpoint; every
        // other status transition (accepted/declined/ongoing/completed/cancelled)
        // goes through PATCH /status.
        if (data.rating !== undefined || data.feedback !== undefined) {
          return api(`/api/v1/homecare/bookings/${id}/feedback`, { method: 'PATCH', body: { rating: data.rating ?? data.feedback?.rating, comment: data.comment ?? data.feedback?.comment ?? '' } });
        }
        if (data.status !== undefined) {
          return api(`/api/v1/homecare/bookings/${id}/status`, { method: 'PATCH', body: { status: String(data.status).toLowerCase() } });
        }
        return { id, ...data }; // no-op for fields with no endpoint (timestamps etc.)
      }
      case 'homeCareNurseEarnings':
        return { id, ...data }; // earnings are append-only; nothing to PATCH
      case 'subscriptions':
        return api(`/api/v1/billing-profile/subscriptions/${id}`, { method: 'PATCH', body: data });
      case 'doctorNotes':
        return api(`/api/v1/doctor-notes/${id}`, { method: 'PATCH', body: data });
      case 'diagnosticOrders':
        return api(`/api/v1/diagnostics/operations/orders/${id}/status`, { method: 'PATCH', body: data });
      case 'admins':
        return api(`/api/v1/auth/${id}`, { method: 'PATCH', body: data });
      case 'therapistSettings':
        return api(`/api/v1/therapists/${id}`, { method: 'PATCH', body: data });
      case 'systemConfig':
        return _writeSystemConfig(id, data);
      case 'userPresence':
      case 'chatSeen':
      case 'callNotifications':
      case 'therapistRequests':
        return null; // ephemeral — no-op
      default:
        console.warn('[firestoreShim] updateDoc unknown collection:', col);
        return null;
    }
  } catch (e) {
    console.warn('[firestoreShim] updateDoc error:', e?.message);
    return null;
  }
}

// ── deleteDoc ─────────────────────────────────────────────────────────────────

export async function deleteDoc(docRef) {
  const path = docRef?._path || [];
  const [col, id, sub, subId] = path;
  try {
    // ── Subcollection documents ──────────────────────────────────────────────
    if (sub) {
      if (col === 'therapists' && sub === 'clients') {
        // Removing a therapist↔client assignment. `subId` is the assignment id.
        return api(`/api/v1/therapy-management/assignments/${subId}`, { method: 'DELETE' }).catch(() => {});
      }
      if (col === 'clients' && sub === 'therapyNotes') {
        return api(`/api/v1/clients/${id}/therapy-notes/${subId}`, { method: 'DELETE' }).catch(() => {});
      }
      if (col === 'doctors' && sub === 'diagnosticCustomEntries') {
        return api(`/api/v1/doctors/${id}/diagnostic-custom-entries/${subId}`, { method: 'DELETE' }).catch(() => {});
      }
      console.warn('[firestoreShim] deleteDoc unmapped subcollection:', col, sub);
      return null;
    }
    // ── Admin "Delete User" (User Management) → account soft-delete ───────────
    // User/staff records are deleted via the admin user endpoint (keyed by userId;
    // nurse ids equal their userId). Orgs have no delete endpoint — soft-delete the
    // owning account is out of scope, so fall through (no-op) for org collections.
    if (_isAdmin() && ['auth', 'clients', 'doctors', 'therapists', 'homeCareNurses', 'admins'].includes(col)) {
      return api(`/api/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    if (_isAdmin() && ['pharmacies', 'labs', 'scanCenters'].includes(col)) {
      return api(`/api/v1/registrations/organizations/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    if (['pharmacyBranches', 'labBranches', 'scanBranches'].includes(col)) {
      const prefix = col === 'pharmacyBranches' ? 'pharmacy-branches' : col === 'labBranches' ? 'lab-branches' : 'scan-branches';
      // Branch login account id == branch id — soft-delete it too so it can't sign in.
      if (_isAdmin()) await api(`/api/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
      return api(`/api/v1/${prefix}/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    // ── Top-level documents ──────────────────────────────────────────────────
    switch (col) {
      case 'doctorAvailability':
        // The delete endpoint is keyed by doctorId; for the doctor managing their
        // own slots that's the signed-in user.
        return api(`/api/v1/care/doctors/${getStoredUserId()}/availability/${id}`, { method: 'DELETE' }).catch(() => {});
      case 'clinicalNotes':
        return api(`/api/v1/clinical-notes/${id}`, { method: 'DELETE' }).catch(() => {});
      case 'doctorPrescriptions':
        return api(`/api/v1/medical/prescriptions/${id}`, { method: 'DELETE' }).catch(() => {});
      case 'clients':
        return api(`/api/v1/clients/${id}`, { method: 'DELETE' }).catch(() => {});
      case 'therapistResources':
      case 'resources':
        // /therapy-engagement/therapists/resources/{id} is a DIFFERENT table
        // (therapist_resources_v2) from the one the library lists
        // (content_resources_v2), so the id never matched and nothing was deleted —
        // silently, because of the catch. Delete where the resource actually lives,
        // and let the error surface so a failure is visible.
        return api(`/api/v1/resources/${id}`, { method: 'DELETE' });
      case 'worksheets':
        // Let a rejected delete surface — swallowing it made a failed delete look
        // successful while the card stayed on screen.
        return api(`/api/v1/therapy-engagement/worksheets/${id}`, { method: 'DELETE' });
      case 'therapyBooks':
        return api(`/api/v1/therapy-books/${id}`, { method: 'DELETE' }).catch(() => {});
      case 'doctorNotes':
        return api(`/api/v1/doctor-notes/${id}`, { method: 'DELETE' }).catch(() => {});
      default:
        console.warn('[firestoreShim] deleteDoc unknown collection:', col);
        return null;
    }
  } catch (e) {
    console.warn('[firestoreShim] deleteDoc error:', e?.message);
    // Like addDoc: report the failure instead of pretending it worked. Callers
    // that check `_failed` can tell the user the row is still there; the ones
    // that don't behave exactly as before.
    return { _failed: true, _error: e?.message || 'delete failed' };
  }
}

// ── setDoc ────────────────────────────────────────────────────────────────────
// Create-or-replace at a known path. If the path has no id (auto-id pattern),
// behave like addDoc; otherwise route to the same per-collection write endpoint
// as updateDoc.
// Staff/org profile collections → the backend Role to promote the user to when
// an admin writes the profile during onboarding.
const STAFF_ROLE_BY_COLLECTION = {
  doctors: 'DOCTOR', therapists: 'THERAPIST', pharmacies: 'PHARMACY',
  labs: 'LAB', scanCenters: 'SCAN_CENTER', homeCareNurses: 'HOME_CARE_NURSE',
};

export async function setDoc(docRef, data, _opts = {}) {
  const path = docRef?._path || [];
  const [col, id, sub, subId] = path;
  // ── Subcollection documents ──────────────────────────────────────────────
  // A subcollection write (e.g. doctors/{id}/patients/{clientId}) must NOT fall
  // through to the parent-collection switch below — doing so overwrote the parent
  // doc (e.g. set the doctor's fullName to the patient's name). The doctor↔patient
  // list is derived from appointments, so this denormalised write has no backing
  // endpoint: no-op safely instead of corrupting the parent.
  if (sub) {
    console.warn('[firestoreShim] setDoc subcollection (no-op):', col, '/', sub);
    return { id: subId || id };
  }
  // doc(collection) with no concrete id → create
  if (!id) {
    return addDoc({ _path: path }, data);
  }
  const _admin = (getStoredRole() || '').toLowerCase() === 'admin';
  // Org collections set role + must-change atomically in the onboarding/organization
  // call below, so skip the separate writes here. (Doing all three concurrently
  // caused a lost-update race that reverted the new account's role to CLIENT.)
  const _isOrgCol = ['pharmacies', 'labs', 'scanCenters'].includes(col);
  // Admin onboarding: promote the freshly-created account to its staff role.
  // These MUST be awaited and sequential — role first, then must-change — so the
  // must-change save sees the promoted role and doesn't overwrite it.
  if (!_isOrgCol && id && STAFF_ROLE_BY_COLLECTION[col] && _admin) {
    await api(`/api/v1/admin/users/${id}/role`, { method: 'PATCH', body: { role: STAFF_ROLE_BY_COLLECTION[col] } }).catch(() => {});
  }
  if (!_isOrgCol && id && data && data.mustChangePassword !== undefined && _admin) {
    await api(`/api/v1/admin/users/${id}/must-change-password`, { method: 'PATCH', body: { value: !!data.mustChangePassword } }).catch(() => {});
  }
  try {
    switch (col) {
      case 'scheduledCalls':
        return api(`/api/v1/scheduled-calls/${id}`, { method: 'PATCH', body: data });
      case 'clients': {
        // The signup flow writes the whole intake questionnaire through here.
        // ClientProfilePatch only binds phone/emergencyContact/preferencesJson/
        // avatarUrl/status, so posting the flat doc meant Jackson dropped every
        // answer — age, gender, country, therapy type, sleep, … — and
        // client_profiles_v2.preferences_json stayed empty for every client on
        // the platform. Fold the rest into preferencesJson, merged with whatever
        // is already stored so a later partial write can't erase the intake.
        const existingClient = await api(`/api/v1/clients/${id}`).catch(() => null);
        let prevPrefs = {};
        try {
          prevPrefs = existingClient?.preferencesJson ? JSON.parse(existingClient.preferencesJson) : {};
        } catch { /* ignore */ }
        const mergedPrefs = { ...prevPrefs, ...data };
        const body = {
          phone: data.phone || existingClient?.phone || null,
          emergencyContact: data.emergencyContact || existingClient?.emergencyContact || null,
          avatarUrl: data.photoURL || data.avatarUrl || existingClient?.avatarUrl || null,
          status: data.status || existingClient?.status || 'active',
          preferencesJson: JSON.stringify(mergedPrefs),
        };
        try {
          return await api(`/api/v1/clients/${id}`, { method: 'PATCH', body });
        } catch {
          return api('/api/v1/clients', { method: 'POST', body: { clientId: id, ...body } });
        }
      }
      case 'therapists':
        return api(`/api/v1/therapists/${id}`, { method: 'PATCH', body: _therapistPatchBody(data, await _therapistMeta(id)) });
      case 'doctors':
        // setDoc is create-or-replace; the doctor PATCH is update-only ("Doctor
        // not found" for a new account), so use the upserting POST and map the
        // component's flat doc to the DoctorUpsertRequest shape.
        return api(`/api/v1/doctors/${id}`, {
          method: 'POST',
          body: {
            fullName: data.name || data.fullName || data.displayName || 'Doctor',
            specialization: data.specialization || data.speciality || null,
            phone: data.phone || null,
            location: typeof data.location === 'string' ? data.location : (data.location?.address || data.location?.city || null),
            bio: data.bio || data.about || null,
            metadataJson: JSON.stringify(data),
          },
        });
      case 'patientProfiles':
        return api(`/api/v1/patients/${id}`, { method: 'PATCH', body: data });
      case 'patientIntake': {
        // The screen setDoc's the intake doc (id = patientId). Endpoint is PUT and
        // wants { intakeJson: "<json string>" }.
        const intakeJson = typeof data.intakeJson === 'string'
          ? data.intakeJson
          : JSON.stringify(data.intakeJson || data.intake || data);
        return api(`/api/v1/patients/${id}/medical-intake`, { method: 'PUT', body: { intakeJson } });
      }
      case 'homeCareNurses':
        // Nurse PATCH upserts (admin onboarding creates the profile here).
        return api(`/api/v1/homecare/nurses/${id}`, { method: 'PATCH', body: _nursePatchBody(data) });
      case 'auth':
      case 'admins':
        return api(`/api/v1/auth/${id}`, { method: 'PATCH', body: data });
      case 'therapistSettings':
        return api(`/api/v1/therapists/${id}`, { method: 'PATCH', body: data });
      case 'doctorAppointments':
        return api(`/api/v1/medical/appointments/${id}`, { method: 'PATCH', body: data });
      case 'doctorPrescriptions':
        return api(`/api/v1/medical/prescriptions/${id}`, { method: 'PATCH', body: data });
      // Admin "Create Pharmacy / Lab / Scan" — create the organization tied to the
      // freshly-created login account (org id = userId) and promote the user role.
      case 'pharmacies':
      case 'labs':
      case 'scanCenters': {
        const _orgName = data.pharmacyName || data.labName || data.scanCenterName || data.centerName || data.name;
        // An org account clearing its own forced-password flag after a successful
        // change sends just { mustChangePassword: false } with no org name. That is
        // NOT an admin create — the /auth/password-change call already cleared the
        // user's flag, so this is a no-op. (Routing it to the admin onboarding
        // endpoint would 403 for the org user and surface a false "Failed to update
        // password" even though the password did change.)
        if (!_orgName && data.mustChangePassword !== undefined) {
          return { id, ...data };
        }
        const type = col === 'pharmacies' ? 'PHARMACY' : col === 'labs' ? 'LAB' : 'SCAN_CENTER';
        return api('/api/v1/admin/onboarding/organization', {
          method: 'POST',
          body: {
            userId: id,
            type,
            name: data.pharmacyName || data.labName || data.scanCenterName || data.centerName || data.name,
            registrationNumber: data.businessReg || data.registrationNumber || null,
            contactPhone: data.phone || data.contactPhone || null,
            contactEmail: data.email || data.contactEmail || null,
            country: data.country || null,
            city: data.city || null,
            address: data.address || (typeof data.location === 'string' ? data.location : null),
          },
        });
      }
      case 'systemConfig':
        return _writeSystemConfig(id, data);
      case 'userPresence':
        return api(`/api/v1/realtime/presence/${id}`, { method: 'PUT', body: { status: data.online ? 'online' : 'offline' } }).catch(() => null);
      case 'chatSeen':
      case 'callNotifications':
      case 'therapistRequests':
      case 'therapists_admin_index':
      case 'therapists_usernames':
        return null; // ephemeral / index — no per-doc write needed
      default:
        console.warn('[firestoreShim] setDoc unmapped collection:', col, '— add a case');
        return null;
    }
  } catch (e) {
    console.warn('[firestoreShim] setDoc error:', e?.message);
    return null;
  }
}

// ── onSnapshot (real-time → polling) ──────────────────────────────────────────
// Firebase signatures supported:
//   onSnapshot(ref, onNext, onError)
//   onSnapshot(ref, options, onNext, onError)
// Returns an unsubscribe function (clears the poll). Default poll cadence matches
// the mobile migration (3s).
// Shared poller registry. Many components subscribe to the same query (e.g. the
// public system-config or a user's notifications) and each onSnapshot previously
// span up its own 3s setInterval — N components meant N identical fetches every
// 3s. We now key one poller per unique query (path + constraints) and fan a
// single fetch out to all its subscribers, collapsing the redundant traffic.
const POLL_INTERVAL_MS = 3000;
const _pollers = new Map();

function _pollKey(ref, isDoc) {
  try {
    return `${isDoc ? 'doc' : 'col'}:${JSON.stringify(ref?._path || [])}:${JSON.stringify(ref?._constraints || [])}`;
  } catch {
    // Fallback: unique key so the subscription still works (just un-deduped).
    return `uniq:${Math.random()}`;
  }
}

export function onSnapshot(ref, ...rest) {
  let onNext, onError;
  if (typeof rest[0] === 'function') {
    [onNext, onError] = rest;
  } else {
    // rest[0] is an options object (e.g. { includeMetadataChanges })
    [, onNext, onError] = rest;
  }
  const isDoc = ref?._type === 'doc';
  const key = _pollKey(ref, isDoc);
  const sub = { onNext, onError };

  let poller = _pollers.get(key);
  if (!poller) {
    poller = { ref, isDoc, subs: new Set(), interval: null, last: undefined, hasLast: false };
    _pollers.set(key, poller);

    const tick = async () => {
      try {
        const snap = poller.isDoc ? await getDoc(poller.ref) : await getDocs(poller.ref);
        poller.last = snap; poller.hasLast = true;
        poller.subs.forEach(s => { if (typeof s.onNext === 'function') { try { s.onNext(snap); } catch { /* subscriber error */ } } });
      } catch (e) {
        poller.subs.forEach(s => { if (typeof s.onError === 'function') { try { s.onError(e); } catch { /* ignore */ } } });
      }
    };
    poller.tick = tick;
    poller.subs.add(sub);
    tick(); // fire immediately, like Firebase's initial snapshot
    poller.interval = setInterval(tick, POLL_INTERVAL_MS);
  } else {
    poller.subs.add(sub);
    // New subscriber to an existing query gets the cached snapshot right away.
    if (poller.hasLast && typeof onNext === 'function') { try { onNext(poller.last); } catch { /* ignore */ } }
  }

  return () => {
    poller.subs.delete(sub);
    if (poller.subs.size === 0) {
      clearInterval(poller.interval);
      _pollers.delete(key);
    }
  };
}

// ── getCountFromServer ────────────────────────────────────────────────────────
export async function getCountFromServer(queryRef) {
  const snap = await getDocs(queryRef);
  return { data: () => ({ count: snap.size }) };
}

// ── Field-value sentinels & batches ───────────────────────────────────────────
// These produce values the backend can interpret, or are resolved in-shim. They
// keep component call-sites byte-identical.
export function arrayUnion(...elements) { return { _op: 'arrayUnion', elements }; }
export function arrayRemove(...elements) { return { _op: 'arrayRemove', elements }; }
export function increment(n = 1) { return { _op: 'increment', value: n }; }
export function deleteField() { return { _op: 'deleteField' }; }

export function writeBatch() {
  const ops = [];
  return {
    set(ref, data, opts) { ops.push(() => setDoc(ref, data, opts)); return this; },
    update(ref, data)    { ops.push(() => updateDoc(ref, data)); return this; },
    delete(ref)          { ops.push(() => deleteDoc(ref)); return this; },
    async commit() { for (const op of ops) { try { await op(); } catch (e) { console.warn('[firestoreShim] batch op failed:', e?.message); } } },
  };
}

export async function runTransaction(_db, updateFn) {
  // Best-effort: provide a transaction object backed by the same get/set helpers.
  const tx = {
    async get(ref) { return getDoc(ref); },
    set(ref, data, opts) { return setDoc(ref, data, opts); },
    update(ref, data) { return updateDoc(ref, data); },
    delete(ref) { return deleteDoc(ref); },
  };
  return updateFn(tx);
}

// ── Cloud Functions shim (firebase/functions → REST) ──────────────────────────
// Maps httpsCallable(functions, name)(payload) → POST to the matching backend
// route, returning { data } to mirror the Firebase callable result shape.
export const functions = { _isShim: true };
export function getFunctions() { return functions; }

const CALLABLE_ROUTES = {
  generateDoctorToken: '/api/v1/video/twilio/generate-doctor-token',
  generateTwilioToken: '/api/v1/video/twilio/generate-token',
  generateToken:       '/api/v1/video/twilio/generate-token',
  createVideoRoom:     '/api/v1/video/twilio/create-video-room',
};

// Normalise a couple registration entity to the shape the screens read. The
// backend returns `id`; every couple screen reads `coupleId`, and partner data
// as nested partnerA/partnerB objects.
// The backend and the web use different status vocabularies. Nothing translated
// between them, so isTherapistSelectionUnlocked() — which only recognises the web
// names — never matched and couple therapist selection could never unlock, no
// matter how much of the intake was finished.
const _COUPLE_STATUS_MAP = {
  pending:            'awaiting_partner_b',
  waiting_intake:     'awaiting_partner_b',
  awaiting_partner_b: 'awaiting_partner_b',
  matching:           'ready_for_therapist',
  therapist_proposed: 'therapist_pending_confirm',
  matched:            'therapist_selected',
  active:             'therapist_selected',
};

function _coupleShape(d) {
  if (!d || typeof d !== 'object') return d;
  const rawStatus = String(d.status || '').toLowerCase();
  const status = _COUPLE_STATUS_MAP[rawStatus] || rawStatus;
  return {
    ...d,
    status,
    backendStatus: rawStatus,
    // Derived flag the screens read directly.
    therapistSelectionUnlocked:
      d.therapistSelectionUnlocked === true
      || !!(d.partnerAIntakeComplete && d.partnerBIntakeComplete),
    coupleId: d.coupleId || d.id,
    partnerA: d.partnerA || {
      authUid: d.partnerAId, name: d.partnerAName, email: d.partnerAEmail,
      clientId: d.partnerAClientId, intakeComplete: d.partnerAIntakeComplete,
    },
    partnerB: d.partnerB || {
      authUid: d.partnerBId, name: d.partnerBName, email: d.partnerBEmail,
      clientId: d.partnerBClientId, intakeComplete: d.partnerBIntakeComplete,
    },
  };
}

// Dashboard GET returns { registration, partnerAIntakeSections, … }. Flatten the
// registration up so the screens can read coupleId/partnerA/partnerB directly.
function _coupleDashboardShape(d) {
  if (!d || typeof d !== 'object') return d;
  const reg = d.registration || d.couple || d;
  const shaped = _coupleShape(reg) || {};
  // CoupleDashboard reads `data.couple`; the endpoint calls it `registration`.
  // Without this alias `couple` was undefined, so the screen treated a fully
  // completed couple as still locked ("Therapist browsing unlocks after…").
  return { ...d, ...shaped, couple: shaped, registration: reg };
}

// Build the { linked, coupleId, partnerRole, intakeComplete } result the couple
// screens branch on, deriving the caller's role from the registration.
function _coupleClaimShape(d) {
  const reg = Array.isArray(d)
    ? d[0]
    : (d && (d.registration || d.couple)) || d;
  if (!reg || !(reg.id || reg.coupleId)) return { linked: false, reason: 'no_couple_for_email' };
  const me = String(getStoredUserId() || '');
  const isB = me && String(reg.partnerBId || '') === me;
  const partnerRole = isB ? 'partnerB' : 'partnerA';
  return {
    ..._coupleShape(reg),
    linked: true,
    partnerRole,
    intakeComplete: !!(isB ? reg.partnerBIntakeComplete : reg.partnerAIntakeComplete),
    // applyClaimToLocalStorage() persists these; without them the waiting screen
    // fell back to the literal "your partner" instead of the partner's name.
    registeredEmail: isB ? reg.partnerBEmail : reg.partnerAEmail,
    otherPartnerName: isB ? reg.partnerAName : reg.partnerBName,
  };
}

// Callables whose REST path depends on the payload. Each returns { path, body },
// optionally { method } (default POST) and { transform } applied to the response.
//
// NOTE: only the video/admin callables used to be mapped here — every couple
// callable fell through to `return { data: null }`, so the entire couples
// therapy feature silently did nothing on web (registration crashed on
// `result.coupleId` of null, intake/dashboard/therapist-selection all no-ops).
const CALLABLE_DYNAMIC = {
  createCoupleRegistration: (p = {}) => ({
    path: '/api/v1/couples',
    body: {
      partnerAId:    p.partnerAId || getStoredUserId(),
      partnerAName:  p.partnerA?.name  || p.partnerAName,
      partnerAEmail: p.partnerA?.email || p.partnerAEmail,
      partnerBName:  p.partnerB?.name  || p.partnerBName,
      partnerBEmail: p.partnerB?.email || p.partnerBEmail,
      relationshipType: p.relationshipType,
    },
    transform: _coupleShape,
  }),
  linkCouplePartnerAccount: (p = {}) => ({
    path: '/api/v1/couples/link-partner',
    body: {
      coupleId: p.coupleId,
      partnerKey: _partnerKeyLetter(p.partnerKey),
      clientId: p.clientId,
      name: p.name,
    },
    transform: _coupleShape,
  }),
  getCoupleInviteByToken: (p = {}) => ({
    path: `/api/v1/couples/invite?token=${encodeURIComponent(p.token || '')}`,
    method: 'GET',
    transform: _coupleShape,
  }),
  sendCouplePartnerInvitation: (p = {}) => ({
    // No dedicated resend endpoint — the invite token is minted at creation, so
    // return the current registration (which carries it) rather than no-op'ing.
    path: `/api/v1/couples/${p.coupleId || _requireCoupleId()}/dashboard`,
    method: 'GET',
    transform: _coupleShape,
  }),
  saveCouplePartnerIntake: (p = {}) => ({
    path: `/api/v1/couples/${p.coupleId || _requireCoupleId()}/intake`,
    body: {
      partnerKey: _partnerKeyLetter(p.partnerKey),
      sectionId: p.sectionId,
      sectionData: typeof p.sectionData === 'string' ? p.sectionData : JSON.stringify(p.sectionData || {}),
    },
  }),
  completeCouplePartnerIntake: (p = {}) => ({
    path: `/api/v1/couples/${p.coupleId || _requireCoupleId()}/intake/complete`,
    body: { partnerKey: _partnerKeyLetter(p.partnerKey) },
    transform: _coupleShape,
  }),
  getCoupleDashboard: (p = {}) => ({
    // Fall back to "my couples" when no id is known, so a cleared localStorage
    // doesn't produce a request to /couples/null/dashboard.
    path: p.coupleId ? `/api/v1/couples/${p.coupleId}/dashboard` : '/api/v1/couples',
    method: 'GET',
    transform: (d) => (Array.isArray(d) ? _coupleDashboardShape(d[0]) : _coupleDashboardShape(d)),
  }),
  claimCoupleSession: (p = {}) => ({
    // No dedicated claim endpoint. With a coupleId, read that registration's
    // dashboard; without one, list the caller's couples and take the first. The
    // caller expects { linked, coupleId, partnerRole, intakeComplete }.
    path: p.coupleId ? `/api/v1/couples/${p.coupleId}/dashboard` : '/api/v1/couples',
    method: 'GET',
    transform: _coupleClaimShape,
  }),
  // Therapist-side reads: the couples assigned to me, and one couple's full case.
  listMyCouples: () => ({
    path: '/api/v1/couples',
    method: 'GET',
    transform: (d) => (Array.isArray(d) ? d.map(_coupleShape) : []),
  }),
  getCoupleCaseForTherapist: (p = {}) => ({
    path: `/api/v1/couples/${p.coupleId || _requireCoupleId()}/case-for-therapist`,
    method: 'GET',
    transform: (d) => (d && typeof d === 'object'
      ? { ...d, couple: _coupleShape(d.registration || d.couple) }
      : d),
  }),
  getCoupleMatchedTherapists: (p = {}) => ({
    path: `/api/v1/couples/${p.coupleId || _requireCoupleId()}/matched-therapists`,
    method: 'GET',
  }),
  proposeCoupleTherapist: (p = {}) => ({
    path: `/api/v1/couples/${p.coupleId || _requireCoupleId()}/propose-therapist`,
    body: { therapistId: p.therapistId, therapistName: p.therapistName },
    transform: _coupleShape,
  }),
  confirmCoupleTherapist: (p = {}) => ({
    path: `/api/v1/couples/${p.coupleId || _requireCoupleId()}/confirm-therapist`,
    body: { accept: p.accept !== false },
    transform: _coupleShape,
  }),
  markCouplePaymentComplete: (p = {}) => ({
    path: `/api/v1/couples/${p.coupleId || _requireCoupleId()}/payment-complete`,
    body: { paymentPlan: p.plan || p.paymentPlan || null },
    transform: _coupleShape,
  }),
  // Admin one-time password reset → POST /api/v1/admin/users/{id}/temporary-password.
  adminSetTemporaryPassword: (p = {}) => ({
    path: `/api/v1/admin/users/${p.entityDocId || p.userId || p.uid}/temporary-password`,
    body: {},
  }),
  // Parent pharmacy/lab/scan resets one of its branch logins → returns a one-time password.
  branchSetTemporaryPassword: (p = {}) => ({
    path: `/api/v1/registrations/branches/${p.branchId || p.entityDocId || p.uid}/reset-password`,
    body: {},
  }),
};

// Fail loudly rather than requesting /couples/undefined/... which the backend
// can only reject. Callers already handle a thrown error.
function _requireCoupleId() {
  const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('th.coupleId')) || '';
  if (stored) return stored;
  throw new Error('No couple registration is active for this session.');
}

// The backend takes partnerKey as "A"/"B"; the screens use "partnerA"/"partnerB".
function _partnerKeyLetter(k) {
  const s = String(k || '').trim();
  if (/^partnerB$/i.test(s) || /^B$/i.test(s)) return 'B';
  return 'A';
}

export function httpsCallable(_functions, name) {
  const dynamic = CALLABLE_DYNAMIC[name];
  const route = CALLABLE_ROUTES[name];
  return async (payload) => {
    if (dynamic) {
      const { path, body, method = 'POST', transform } = dynamic(payload || {});
      const data = await api(path, { method, body: method === 'GET' ? undefined : body });
      return { data: transform ? transform(data) : data };
    }
    if (!route) { console.warn('[firestoreShim] httpsCallable unmapped:', name); return { data: null }; }
    try {
      const data = await api(route, { method: 'POST', body: payload || {} });
      return { data };
    } catch (e) {
      console.warn('[firestoreShim] httpsCallable error:', name, e?.message);
      throw e;
    }
  };
}

// ── Storage shim (firebase/storage → R2 presigned upload) ─────────────────────
export const storage = { _isShim: true };
export function getStorage() { return storage; }

// ref(storage, path) → descriptor; the upload result URL is stashed on it so the
// getDownloadURL(ref) call that follows returns the public URL.
export function ref(_storage, path) {
  return { _type: 'storageRef', _path: path, fullPath: path, _url: null };
}

export async function uploadBytes(storageRef, file, _metadata) {
  const path = storageRef?._path || '';
  const domain = (String(path).split('/')[0]) || 'general';
  const fileName = String(path).split('/').pop() || undefined;
  const url = await uploadFile(file, { domain, fileName });
  if (storageRef) storageRef._url = url;
  return { ref: storageRef, metadata: { fullPath: path } };
}

export async function uploadString(storageRef, dataUrl, _format, _metadata) {
  // Convert a data: URL / base64 string to a Blob, then reuse uploadBytes.
  let blob;
  try {
    const res = await fetch(dataUrl);
    blob = await res.blob();
  } catch {
    blob = new Blob([dataUrl], { type: 'text/plain' });
  }
  return uploadBytes(storageRef, blob);
}

export async function getDownloadURL(storageRef) {
  return storageRef?._url || '';
}

export async function deleteObject(_storageRef) {
  // No destructive delete endpoint wired yet; no-op keeps callers working.
  return null;
}

// ── Re-export as named exports matching firebase/firestore ─────────────────────
export { toQuerySnapshot, toDocSnap };
