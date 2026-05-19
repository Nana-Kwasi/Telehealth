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

export function getNoteSections(note) {
  if (!note) return [];

  const sections = [];
  const seen = new Set();

  CONTENT_FIELD_ORDER.forEach((key) => {
    const val = fieldValue(note[key]);
    if (!val) return;
    sections.push({ key, label: formatFieldLabel(key), value: val });
    seen.add(key);
  });

  Object.entries(note).forEach(([key, raw]) => {
    if (seen.has(key) || SKIP_KEYS.has(key)) return;
    const val = fieldValue(raw);
    if (!val) return;
    if (key.endsWith('At') || key.endsWith('Id') || key.startsWith('_')) return;
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
