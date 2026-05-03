import jsPDF from 'jspdf';
import 'jspdf-autotable';

const BRAND = [12, 74, 110];
const SLATE = [71, 85, 105];

function drawHeaderBand(doc) {
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('NessaHub', 14, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Pharmacy operations report · Confidential', 14, 18);
  doc.setTextColor(15, 23, 42);
}

function drawMetaBlock(doc, y, lines) {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SLATE);
  let yy = y;
  lines.forEach((t) => {
    doc.text(t, 14, yy);
    yy += 4.2;
  });
  return yy + 2;
}

function addFooterToAllPages(doc, footerLines) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const h = doc.internal.pageSize.height;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(14, h - 22, 196, h - 22);
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    let y = h - 18;
    footerLines.forEach((line) => {
      doc.text(line, 14, y);
      y += 3.4;
    });
    doc.setFont('helvetica', 'italic');
    doc.text(`Page ${i} of ${pageCount}`, 196, h - 8, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }
}

/**
 * Professional pharmacy operational PDF (NessaHub branded).
 */
export function downloadNessaHubPharmacyOperationalPdf({
  filename,
  reportTitle,
  orgName,
  scopeLine,
  periodFrom,
  periodTo,
  generatedAt,
  summaryRows,
  funnelRows,
  branchPerformanceRows,
  prescriptionDetailRows,
  activityLogRows,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawHeaderBand(doc);

  let y = 30;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(reportTitle, 14, y);
  y += 8;

  y = drawMetaBlock(doc, y, [
    orgName || '—',
    scopeLine || '',
    `Reporting period: ${periodFrom} → ${periodTo}`,
    `Generated: ${generatedAt}`,
    'This document summarizes dispensing workflow data from NessaHub. It is not a legal prescription.',
  ]);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive summary', 14, y);
  y += 5;

  doc.autoTable({
    startY: y,
    head: [['Metric', 'Value']],
    body: summaryRows,
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Prescription status funnel (period)', 14, y);
  y += 4;
  doc.autoTable({
    startY: y,
    head: [['Status', 'Count']],
    body: funnelRows,
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 8;

  if (branchPerformanceRows?.length) {
    doc.setFont('helvetica', 'bold');
    doc.text('Branch performance (period)', 14, y);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [['Branch', 'Total Rx', 'Active / partial', 'Ready', 'Delivered']],
      body: branchPerformanceRows,
      theme: 'striped',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (prescriptionDetailRows?.length) {
    doc.setFont('helvetica', 'bold');
    doc.text('Prescription register (detail)', 14, y);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [[
        'Ref',
        'Patient',
        'Routed branch',
        'Status',
        'Created',
        'Meds',
        'Doctor',
      ]],
      body: prescriptionDetailRows,
      theme: 'striped',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 7.5 },
      margin: { left: 14, right: 14 },
      pageBreak: 'auto',
      rowPageBreak: 'avoid',
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (activityLogRows?.length) {
    doc.setFont('helvetica', 'bold');
    doc.text('Activity log (pharmacy Rx events in period)', 14, y);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [['When', 'Action', 'Rx ID', 'Branch / actor', 'Transition']],
      body: activityLogRows,
      theme: 'striped',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 7 },
      margin: { left: 14, right: 14 },
      pageBreak: 'auto',
    });
  }

  addFooterToAllPages(doc, [
    'NessaHub · Digitally signed operational extract',
    'For pharmacy compliance use · Reconcile against source system if required',
  ]);

  doc.save(filename);
}

export function downloadNessaHubSystemPdf({
  filename,
  reportTitle,
  periodFrom,
  periodTo,
  generatedAt,
  summarySections,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawHeaderBand(doc);
  let y = 30;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(reportTitle, 14, y);
  y += 8;
  y = drawMetaBlock(doc, y, [
    'NessaHub Super Admin · System-wide export',
    `Reporting period: ${periodFrom} → ${periodTo}`,
    `Generated: ${generatedAt}`,
    'Aggregated operational snapshot. Excludes free-text clinical notes.',
  ]);

  summarySections.forEach(({ heading, rows }) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(heading, 14, y);
    y += 5;
    doc.autoTable({
      startY: y,
      head: [['Item', 'Value']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  });

  addFooterToAllPages(doc, [
    'NessaHub Super Admin export',
    'System-wide aggregate · Handle per your data governance policy',
  ]);
  doc.save(filename);
}
