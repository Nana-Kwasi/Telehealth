const FIELD_LABELS = {
  notes: 'Clinical notes',
  content: 'Content',
  noteContent: 'Note',
  sessionFocus: 'Session focus',
  progressAssessment: 'Progress',
  mood: 'Mood',
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  interventions: 'Interventions',
  clientResponse: 'Client response',
  moodRating: 'Mood rating',
  nextSteps: 'Next steps',
  riskAssessment: 'Risk assessment',
  safetyPlan: 'Safety plan',
  followUp: 'Follow-up',
  treatmentSummary: 'Treatment summary',
  goalsAchieved: 'Goals achieved',
  recommendations: 'Recommendations',
  signature: 'Signature',
  therapistName: 'Therapist',
};

const CONTENT_FIELD_ORDER = [
  'sessionFocus',
  'progressAssessment',
  'mood',
  'moodRating',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'interventions',
  'clientResponse',
  'riskAssessment',
  'safetyPlan',
  'treatmentSummary',
  'goalsAchieved',
  'recommendations',
  'followUp',
  'nextSteps',
  'notes',
  'content',
  'noteContent',
];

const NOTE_TYPE_LABELS = {
  soap: 'SOAP note',
  progress: 'Progress note',
  risk: 'Risk assessment',
  discharge: 'Discharge summary',
  therapyBook: 'Therapy book',
};

const SKIP_KEYS = new Set([
  // Raw serialised blobs — expanded into individual fields below, so printing the
  // string as well shows a "METADATA JSON" wall of braces in the note view and in
  // downloaded PDFs.
  'metadataJson',
  'structuredData',
  'id',
  'clientId',
  'clientName',
  'clientNames',
  'therapistId',
  'therapistName',
  'createdAt',
  'updatedAt',
  'sessionDate',
  'isDraft',
  'visibleToClient',
  'assignedClients',
  'noteType',
  'version',
  'shareWithAllClients',
  'selectedClients',
]);

function formatFieldLabel(key) {
  return FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function fieldValue(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val).trim();
}

export function getNoteTitle(note, kind = 'clinical') {
  if (!note) return 'Note';
  if (kind === 'therapy') return 'Therapy note';
  return NOTE_TYPE_LABELS[note.noteType] || 'Clinical note';
}

/** Parse a JSON string field, or return null when it is not JSON. */
function parseMaybeJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

/**
 * Expand the serialised blobs into real fields: clinical notes keep theirs in
 * `structuredData`, therapy books carry author/chapters/exercises/… in
 * `metadataJson` (and, on older rows, inside `content`). Without this the caller
 * printed the raw JSON string as one giant field.
 */
function withStructuredFields(note) {
  if (!note) return note;
  const structured = parseMaybeJson(note.structuredData);
  const bookMeta = parseMaybeJson(note.metadataJson);
  const legacyBookContent = note.noteType === 'therapyBook' ? parseMaybeJson(note.content) : null;
  const merged = { ...(structured || {}), ...(legacyBookContent || {}), ...(bookMeta || {}) };
  if (Object.keys(merged).length === 0) return note;
  // The record's own fields win — an explicit edit beats the stored blob.
  return { ...merged, ...note, __hasStructured: true };
}

export function getNoteSections(rawNote) {
  if (!rawNote) return [];
  const note = withStructuredFields(rawNote);

  const sections = [];
  const seen = new Set();

  CONTENT_FIELD_ORDER.forEach((key) => {
    if (SKIP_KEYS.has(key)) { seen.add(key); return; }
    // `content` on a structured note is just its fields concatenated at save time;
    // repeating the joined copy alongside them is noise.
    if (key === 'content' && note.__hasStructured) { seen.add(key); return; }
    const val = fieldValue(note[key]);
    if (!val) return;
    const t = String(val).trim();
    if (t.startsWith('{') && t.endsWith('}')) { seen.add(key); return; }
    sections.push({ key, label: formatFieldLabel(key), value: val });
    seen.add(key);
  });

  Object.entries(note).forEach(([key, raw]) => {
    if (seen.has(key) || SKIP_KEYS.has(key)) return;
    const val = fieldValue(raw);
    if (!val) return;
    if (key.endsWith('At') || key.endsWith('Id') || key.startsWith('_')) return;
    // Never print a raw JSON object as a field. Some existing rows had the whole
    // note document written into `content` / `structuredData`, which surfaced as
    // {"therapistId":"…","therapistName":"…"} in the card preview and the viewer.
    const trimmed = String(val).trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return;
    sections.push({ key, label: formatFieldLabel(key), value: val });
  });

  return sections;
}

export function getNotePreview(note, maxLen = 140) {
  const sections = getNoteSections(note);
  if (!sections.length) return 'No preview — click to open';
  const text = sections.map((s) => s.value).join(' · ');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}…`;
}
