// ─── brandedPdf ──────────────────────────────────────────────────────────────
// One branded PDF layout for everything a client downloads from Resources.
//
// The old note export read `note.subjective`, `note.objective`, … as top-level
// fields. REST notes keep those inside a `structuredData` JSON string, so every
// lookup returned undefined and the file came out with headings and no content.
// Building from getNoteSections() — the same helper the on-screen note view uses
// — keeps the download and the page showing the same thing.
//
// The mark is drawn rather than embedded: there is no logo image in the repo
// (assets/icon.png is a 0-byte placeholder), and this matches the existing
// NessaHub header band in nessahubOperationalPdf.js.

import jsPDF from 'jspdf';
import { getNoteSections, noteTypeLabel } from './noteSections';

const BRAND = [79, 70, 229];      // indigo
const BRAND_DARK = [55, 48, 163];
const INK = [17, 24, 39];
const SLATE = [100, 116, 139];
const RULE = [226, 232, 240];

const MARGIN = 18;
const HEADER_H = 26;

/** Indigo band with the NessaHub mark and wordmark. Drawn on every page. */
function drawBrandHeader(pdf, subtitle) {
  const w = pdf.internal.pageSize.width;

  pdf.setFillColor(...BRAND);
  pdf.rect(0, 0, w, HEADER_H, 'F');

  // Logo mark: rounded square with an "N".
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(MARGIN, 7, 12, 12, 2.5, 2.5, 'F');
  pdf.setTextColor(...BRAND_DARK);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('N', MARGIN + 6, 15.3, { align: 'center' });

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('NessaHub', MARGIN + 16, 13);

  if (subtitle) {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(subtitle, MARGIN + 16, 18.5);
  }

  pdf.setTextColor(...INK);
}

/** Diagonal wordmark watermark. */
function drawWatermark(pdf) {
  const w = pdf.internal.pageSize.width;
  const h = pdf.internal.pageSize.height;
  try {
    pdf.setGState(new pdf.GState({ opacity: 0.06 }));
    pdf.setFontSize(52);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...BRAND);
    pdf.text('NessaHub', w / 2, h / 2, { angle: 45, align: 'center' });
    pdf.setGState(new pdf.GState({ opacity: 1 }));
  } catch {
    // Older jsPDF builds have no GState — the document is fine without it.
  }
  pdf.setTextColor(...INK);
}

function drawFooters(pdf, note) {
  const pages = pdf.getNumberOfPages();
  const w = pdf.internal.pageSize.width;
  const h = pdf.internal.pageSize.height;
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, h - 14, w - MARGIN, h - 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE);
    pdf.text(note || 'Confidential — for the named client only.', MARGIN, h - 9);
    pdf.text(`Page ${i} of ${pages}`, w - MARGIN, h - 9, { align: 'right' });
  }
  pdf.setTextColor(...INK);
}

/**
 * Cursor that lays out a branded document and breaks pages by itself, so callers
 * never have to track y positions (the old code did, and drifted).
 */
function createDoc(subtitle) {
  const pdf = new jsPDF();
  const w = pdf.internal.pageSize.width;
  const h = pdf.internal.pageSize.height;
  const contentW = w - MARGIN * 2;
  let y = HEADER_H + 12;

  drawBrandHeader(pdf, subtitle);
  drawWatermark(pdf);

  const newPage = () => {
    pdf.addPage();
    drawBrandHeader(pdf, subtitle);
    drawWatermark(pdf);
    y = HEADER_H + 12;
  };

  const need = (space) => {
    if (y + space > h - 20) newPage();
  };

  return {
    pdf,
    contentW,
    get y() { return y; },
    gap(n = 4) { y += n; },

    title(text) {
      need(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(19);
      pdf.setTextColor(...INK);
      const lines = pdf.splitTextToSize(String(text), contentW);
      pdf.text(lines, MARGIN, y);
      y += lines.length * 8 + 2;
    },

    /** Grey meta line, e.g. "Client: … · Date: …". */
    meta(pairs) {
      const text = pairs.filter(Boolean).join('   ·   ');
      if (!text) return;
      need(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(...SLATE);
      const lines = pdf.splitTextToSize(text, contentW);
      pdf.text(lines, MARGIN, y);
      y += lines.length * 5 + 4;
      pdf.setDrawColor(...RULE);
      pdf.setLineWidth(0.4);
      pdf.line(MARGIN, y, MARGIN + contentW, y);
      y += 8;
      pdf.setTextColor(...INK);
    },

    /** A labelled block: small indigo heading, then the body text. */
    section(label, value) {
      const body = String(value ?? '').trim();
      if (!body) return;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      const lines = pdf.splitTextToSize(body, contentW - 6);

      // Keep the heading with at least the first two lines of its body.
      need(10 + Math.min(lines.length, 2) * 5.6);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...BRAND_DARK);
      pdf.text(String(label).toUpperCase(), MARGIN, y);
      y += 5.5;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      pdf.setTextColor(...INK);

      lines.forEach((line) => {
        need(6);
        // Accent bar beside each line, so a block reads as one unit.
        pdf.setDrawColor(...BRAND);
        pdf.setLineWidth(1.2);
        pdf.line(MARGIN, y - 3.4, MARGIN, y + 1.4);
        pdf.text(line, MARGIN + 5, y);
        y += 5.6;
      });
      y += 6;
    },

    save(filename, footerNote) {
      drawFooters(pdf, footerNote);
      pdf.save(filename);
    },
  };
}

function safeFilename(name) {
  return String(name || 'document').replace(/[^\w\d\-. ]+/g, '').trim().slice(0, 80) || 'document';
}

function formatDate(value) {
  if (!value) return '';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Download a clinical note or therapy book. */
export function downloadNotePdf(note) {
  if (!note) return;
  const isBook = note.noteType === 'therapyBook';
  const heading = isBook ? (note.bookTitle || note.title || 'Therapy Book') : noteTypeLabel(note);
  const doc = createDoc(isBook ? 'Therapy book' : 'Clinical note');

  doc.title(heading);
  doc.meta([
    note.clientName && `Client: ${note.clientName}`,
    note.therapistName && `Therapist: ${note.therapistName}`,
    formatDate(note.sessionDate || note.createdAt) && `Date: ${formatDate(note.sessionDate || note.createdAt)}`,
  ]);

  if (isBook) {
    doc.section('Author', note.author);
    doc.section('Description', note.description);
    doc.section('Target audience', note.targetAudience);
    doc.section('Difficulty', note.difficultyLevel);
    doc.section('Estimated reading time', note.estimatedReadingTime);
    doc.section('Table of contents', note.tableOfContents);
    doc.section('Chapters', note.chapters);
    doc.section('Key topics', note.keyTopics);
    doc.section('Exercises', note.exercises);
    doc.section('Resources', note.resources);
    doc.section('Bibliography', note.bibliography);
  } else {
    // The fix: read through structuredData instead of expecting flat fields.
    const sections = getNoteSections(note);
    if (sections.length === 0) {
      doc.section('Notes', 'This note has no recorded content.');
    } else {
      sections.forEach((s) => doc.section(s.label, s.value));
    }
  }

  doc.save(`${safeFilename(heading)}.pdf`, 'Confidential — for the named client only.');
}

/** Download a resource / assigned material. */
export function downloadResourcePdf(resource) {
  if (!resource) return;
  const heading = resource.title || resource.name || 'Resource';
  const doc = createDoc('Therapy resource');

  doc.title(heading);
  doc.meta([
    resource.category && `Category: ${resource.category}`,
    resource.therapistName && `Shared by: ${resource.therapistName}`,
    formatDate(resource.createdAt) && `Date: ${formatDate(resource.createdAt)}`,
  ]);

  doc.section('Description', resource.description);
  doc.section('Details', resource.content || resource.body || resource.notes);
  doc.section('Instructions', resource.instructions);
  doc.section('Goal', resource.goal);
  if (resource.url || resource.fileUrl) {
    doc.section('Link', resource.url || resource.fileUrl);
  }

  doc.save(`${safeFilename(heading)}.pdf`, 'Shared with you via NessaHub.');
}

/**
 * The system-logs report, in the same livery as every other document we hand a
 * user. It used to be raw jsPDF text — no header, no watermark, no footer, and
 * a hardcoded 20pt margin that had nothing to do with the rest of the system.
 *
 * @param {Array}  logs    the filtered entries, already in display order
 * @param {object} meta    { logTypeLabel, rangeLabel, generatedBy, userNames }
 */
export function downloadLogsPdf(logs = [], meta = {}) {
  const doc = createDoc('System Logs Report');
  const {
    logTypeLabel = 'All logs',
    rangeLabel = 'All time',
    generatedBy = '',
    userNames = {},
  } = meta;

  doc.title('System Logs Report');
  doc.meta([
    `Type: ${logTypeLabel}`,
    `Range: ${rangeLabel}`,
    `Entries: ${logs.length}`,
    generatedBy ? `Generated by: ${generatedBy}` : '',
    `Generated: ${new Date().toLocaleString()}`,
  ]);

  if (logs.length === 0) {
    doc.section('No entries', 'No log entries matched the selected filters.');
    doc.save(`${safeFilename('nessahub-system-logs')}.pdf`, 'System Logs Report');
    return;
  }

  const nameFor = (id, fallback) => {
    const hit = userNames[id];
    if (hit) return hit.type ? `${hit.name} (${hit.type})` : hit.name;
    return fallback || id || '';
  };

  logs.forEach((log, i) => {
    const stamp = log.timestamp?.toDate?.()
      ? log.timestamp.toDate().toLocaleString()
      : new Date(log.timestamp).toLocaleString();

    // One block per entry: the label carries the identity, the body the facts.
    const facts = [
      log.action ? `Action: ${log.action}` : '',
      log.adminName ? `Admin: ${log.adminName}${log.adminEmail ? ` (${log.adminEmail})` : ''}` : '',
      log.userId ? `User: ${nameFor(log.userId)}` : '',
      log.userRole ? `Role: ${log.userRole}` : '',
      log.clientId || log.clientName
        ? `Client: ${nameFor(log.clientId, log.clientName)}` : '',
      log.description ? `Description: ${log.description}` : '',
      log.success !== undefined ? `Success: ${log.success ? 'Yes' : 'No'}` : '',
      log.sessionDuration ? `Duration: ${Math.round(log.sessionDuration / 60)} minutes` : '',
      log.ipAddress ? `IP address: ${log.ipAddress}` : '',
      log.userAgent ? `User agent: ${log.userAgent}` : '',
    ].filter(Boolean).join('\n');

    doc.section(
      `${i + 1}. ${String(log.typeLabel || log.type || 'Log').toUpperCase()} — ${stamp}`,
      facts || 'No further detail recorded.',
    );
  });

  doc.save(`${safeFilename('nessahub-system-logs')}.pdf`, 'System Logs Report');
}
