const PDFDocument = require('pdfkit');

function generateSARPDF(sar, res) {
  const doc = new PDFDocument({ margin: 60, size: 'LETTER', info: {
    Title: `SAR ${sar.sarNumber}`,
    Author: sar.filingInstitution?.name || 'SAR Platform',
    Subject: 'Suspicious Activity Report',
    Creator: 'SAR Generation Platform v1.0'
  }});

  // Pipe to response
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sar.sarNumber}.pdf"`);
  doc.pipe(res);

  const colors = { primary: '#1a1a2e', accent: '#c0392b', gold: '#d4a017', gray: '#555', lightGray: '#f5f5f5' };
  const pageWidth = 612 - 120; // letter width minus margins

  // ── Header ───────────────────────────────────────────────────────────────
  doc.rect(0, 0, 612, 80).fill(colors.primary);
  doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
     .text('SUSPICIOUS ACTIVITY REPORT', 60, 20, { width: pageWidth });
  doc.fontSize(10).font('Helvetica')
     .text(`FinCEN Form 111 | BSA E-Filing | Confidential`, 60, 44);
  doc.fontSize(9).text(`SAR #: ${sar.sarNumber}  |  Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 60, 58);

  // Risk badge
  const riskColors = { critical: '#c0392b', high: '#e67e22', medium: '#f39c12', low: '#27ae60' };
  const riskColor = riskColors[sar.riskSummary?.riskLevel] || '#888';
  doc.rect(450, 15, 102, 50).fill(riskColor);
  doc.fillColor('white').fontSize(9).font('Helvetica-Bold').text('RISK LEVEL', 451, 19, { width: 100, align: 'center' });
  doc.fontSize(16).text(sar.riskSummary?.riskLevel?.toUpperCase() || 'N/A', 451, 31, { width: 100, align: 'center' });
  doc.fontSize(10).text(`${sar.riskSummary?.overallScore || 0}/100`, 451, 50, { width: 100, align: 'center' });

  doc.fillColor(colors.primary);
  let y = 100;

  // ── Section helper ───────────────────────────────────────────────────────
  function sectionHeader(title) {
    if (y > 680) { doc.addPage(); y = 60; }
    doc.rect(60, y, pageWidth, 22).fill(colors.primary);
    doc.fillColor('white').fontSize(10).font('Helvetica-Bold').text(title, 66, y + 6);
    doc.fillColor(colors.primary);
    y += 28;
  }

  function field(label, value, inline = false) {
    if (y > 700) { doc.addPage(); y = 60; }
    if (inline) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.gray).text(label + ':', 60, y, { continued: true, width: 140 });
      doc.font('Helvetica').fillColor('#000').text(' ' + (value || 'N/A'));
      y += 14;
    } else {
      doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.gray).text(label + ':', 60, y);
      y += 12;
      doc.fontSize(9).font('Helvetica').fillColor('#000').text(value || 'N/A', 70, y, { width: pageWidth - 10 });
      y += doc.heightOfString(value || 'N/A', { width: pageWidth - 10, fontSize: 9 }) + 8;
    }
  }

  // ── Section 1: Filing Institution ────────────────────────────────────────
  sectionHeader('SECTION 1: FILING INSTITUTION INFORMATION');
  const fi = sar.filingInstitution || {};
  field('Institution Name', fi.name, true);
  field('EIN / Tax ID', fi.ein, true);
  field('Address', fi.address, true);
  field('Primary Federal Regulator', 'OCC – Office of the Comptroller of the Currency', true);
  field('Filing Date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), true);
  y += 8;

  // ── Section 2: Subject Information ──────────────────────────────────────
  sectionHeader('SECTION 2: SUBJECT INFORMATION');
  const si = sar.subjectInfo || {};
  field('Subject Name / Entity', si.name, true);
  field('Entity Type', si.entityType, true);
  field('Account Number(s)', (si.accountNumbers || []).join(', '), true);
  field('Primary Institution', si.primaryBank, true);
  field('Country of Operation', si.country || 'United States', true);
  field('Identification / Reference', (si.identifiers || []).join(', ') || 'N/A', true);
  y += 8;

  // ── Section 3: Suspicious Activity Summary ───────────────────────────────
  sectionHeader('SECTION 3: SUSPICIOUS ACTIVITY SUMMARY');
  const rs = sar.riskSummary || {};
  const dateRange = rs.dateRange || {};
  field('Activity Date Range', dateRange.start ? `${new Date(dateRange.start).toLocaleDateString()} – ${new Date(dateRange.end).toLocaleDateString()}` : 'N/A', true);
  field('Total Transaction Amount', rs.totalAmount ? `$${rs.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'N/A', true);
  field('Total Transactions Reviewed', String(rs.transactionCount || 0), true);
  field('Flagged Transactions', String(rs.flaggedCount || 0), true);
  field('Composite Risk Score', `${rs.overallScore || 0}/100 (${(rs.riskLevel || '').toUpperCase()})`, true);
  y += 4;
  field('Primary Suspicious Activity Indicators', (rs.primaryFlags || []).slice(0, 5).map((f, i) => `${i+1}. ${f}`).join('\n'));
  y += 8;

  // ── Section 4: Detected Patterns ─────────────────────────────────────────
  sectionHeader('SECTION 4: DETECTED FRAUD PATTERNS & TYPOLOGIES');
  const patterns = sar.detectedPatterns || [];
  if (patterns.length === 0) {
    doc.fontSize(9).font('Helvetica-Oblique').fillColor(colors.gray).text('No specific typology patterns detected.', 60, y);
    y += 20;
  } else {
    patterns.forEach((p, i) => {
      if (y > 660) { doc.addPage(); y = 60; }
      const pColor = riskColors[p.severity] || '#888';
      doc.rect(60, y, 4, 40).fill(pColor);
      doc.fillColor(colors.primary).fontSize(9).font('Helvetica-Bold')
         .text(`${i+1}. ${p.patternType}`, 70, y);
      doc.fillColor(colors.gray).fontSize(7).font('Helvetica').text(`Severity: ${(p.severity||'').toUpperCase()} | Rule: ${p.ruleTriggered || 'N/A'}`, 70, y + 12);
      doc.fillColor('#000').fontSize(8.5).font('Helvetica').text(p.description || '', 70, y + 22, { width: pageWidth - 10 });
      y += doc.heightOfString(p.description || '', { width: pageWidth - 10 }) + 32;
    });
  }

  // ── Section 5: Narrative ─────────────────────────────────────────────────
  const sections = [
    { title: 'SECTION 5A: INTRODUCTION', text: sar.narrative?.introduction },
    { title: 'SECTION 5B: OBSERVED BEHAVIOR', text: sar.narrative?.observedBehavior },
    { title: 'SECTION 5C: SUSPICIOUS PATTERNS ANALYSIS', text: sar.narrative?.suspiciousPatterns },
    { title: 'SECTION 5D: CONCLUSION & CERTIFICATION', text: sar.narrative?.conclusion },
  ];

  sections.forEach(({ title, text }) => {
    sectionHeader(title);
    if (text) {
      doc.fontSize(9).font('Helvetica').fillColor('#000').text(text, 60, y, { width: pageWidth, align: 'justify', lineGap: 2 });
      y += doc.heightOfString(text, { width: pageWidth, lineGap: 2 }) + 16;
    }
  });

  // ── Footer on each page ──────────────────────────────────────────────────
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < doc.bufferedPageRange().count; i++) {
    doc.switchToPage(i);
    doc.rect(0, 752, 612, 40).fill(colors.primary);
    doc.fillColor('white').fontSize(7).font('Helvetica')
       .text(`CONFIDENTIAL – ${sar.sarNumber} – This document contains sensitive law enforcement information. Unauthorized disclosure is prohibited under 31 U.S.C. § 5318(g)(2).`, 60, 760, { width: pageWidth, align: 'center' });
    doc.text(`Page ${i + 1}`, 60, 770, { width: pageWidth, align: 'right' });
  }

  doc.end();
}

module.exports = { generateSARPDF };
