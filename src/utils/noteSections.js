// ─── noteSections ────────────────────────────────────────────────────────────
// Turn a clinical note from the REST API into labelled, readable sections.
//
// The note screens were written against Firestore documents with `title` /
// `category` / `content` fields. REST notes instead carry `noteType` plus a
// `structuredData` JSON string holding the real SOAP/progress fields, so the
// pages showed a bare "Note" heading and, where they printed the raw record, a
// wall of `{"subjective":"…","objective":"…"}`.
//
// Mirrors the mobile implementation in noteDisplayUtils.js — keep the two in
// step so a note reads the same on both platforms.

const FIELD_LABELS = {
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  interventions: 'Interventions',
  interventionsUsed: 'Interventions used',
  clientResponse: 'Client response',
  moodRating: 'Mood rating',
  sessionFocus: 'Session focus',
  nextSteps: 'Next steps',
  riskAssessment: 'Risk assessment',
  safetyPlan: 'Safety plan',
  followUp: 'Follow-up',
  treatmentSummary: 'Treatment summary',
  goalsAchieved: 'Goals achieved',
  recommendations: 'Recommendations',
  homework: 'Homework',
  behavioralObservations: 'Behavioural observations',
  content: 'Notes',
  signature: 'Signed by',
};

const FIELD_ORDER = [
  'subjective', 'objective', 'assessment', 'plan',
  'sessionFocus', 'interventions', 'interventionsUsed', 'clientResponse',
  'behavioralObservations', 'moodRating', 'homework', 'nextSteps',
  'riskAssessment', 'safetyPlan',
  'treatmentSummary', 'goalsAchieved', 'recommendations', 'followUp',
  'content', 'signature',
];

export const NOTE_TYPE_LABELS = {
  soap: 'SOAP note',
  progress: 'Progress note',
  risk: 'Risk assessment',
  discharge: 'Discharge summary',
  therapyBook: 'Therapy book',
};

export function noteTypeLabel(note) {
  return NOTE_TYPE_LABELS[note?.noteType] || 'Clinical note';
}

/**
 * A therapy book packs author / chapters / exercises / … into `content` as a JSON
 * string, and its display title is `title`. Flatten both so cards, the detail
 * page and the PDF can read plain fields instead of re-parsing everywhere.
 */
export function hydrateBookContent(book) {
  if (!book) return book;

  const parseObj = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const t = raw.trim();
    if (!t.startsWith('{') || !t.endsWith('}')) return null;
    try {
      const parsed = JSON.parse(t);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  // A book's author / audience / difficulty / contents / chapters / key topics /
  // exercises / resources / bibliography now live in `metadataJson`. Older rows
  // kept the same object inside `content` instead. The client's Resources modal
  // renders each of these as its own section (selectedNote.author, .chapters, …),
  // so without expanding them here every one of those sections rendered empty.
  const fromMeta = parseObj(book.metadataJson) || {};
  const fromContent = parseObj(book.content) || {};
  const extra = { ...fromContent, ...fromMeta };

  return {
    ...extra,
    ...book,
    bookTitle: book.bookTitle || book.title,
    // Only drop `content` when it was the JSON envelope, never real prose.
    content: Object.keys(fromContent).length ? '' : book.content,
  };
}

function parseStructured(note) {
  if (!note?.structuredData) return null;
  try {
    const parsed = typeof note.structuredData === 'string'
      ? JSON.parse(note.structuredData)
      : note.structuredData;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Labelled { key, label, value } sections, in clinical reading order. */
export function getNoteSections(note) {
  if (!note) return [];
  const structured = parseStructured(note);
  // The note's own columns win over the stored blob.
  const merged = { ...(structured || {}), ...note };
  const hasStructured = structured && Object.keys(structured).length > 0;

  return FIELD_ORDER.reduce((out, key) => {
    // `content` is the structured fields joined together at save time; printing
    // it as well just repeats everything above it.
    if (key === 'content' && hasStructured) return out;
    const raw = merged[key];
    if (raw === null || raw === undefined || raw === '') return out;
    const value = typeof raw === 'object' ? JSON.stringify(raw) : String(raw).trim();
    if (!value) return out;
    // Never surface a raw JSON object as note text — some rows were saved with the
    // whole document in `content`.
    if (value.startsWith('{') && value.endsWith('}')) return out;
    out.push({ key, label: FIELD_LABELS[key] || key, value });
    return out;
  }, []);
}

export function noteDate(note) {
  const raw = note?.sessionDate || note?.createdAt;
  if (!raw) return '';
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
