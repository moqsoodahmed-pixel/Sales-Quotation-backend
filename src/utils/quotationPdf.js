const path = require("path");
const PDFDocument = require("pdfkit");
const CompanySettings = require("../models/CompanySettings");
const { STATUS_LABELS } = require("../config/quotationStatus");

const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const NAVY = "#1F3C88";
const TABLE_HEAD = "#1E3A8A";
const TEXT = "#111827";
const MUTED = "#374151";
const LIGHT_ROW = "#F3F6FB";
const BORDER = "#E5E7EB";

const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

// ---------------------------------------------------------------------
// Exact letterhead artwork. Drop the two PNGs (as exported from the real
// letterhead) at these paths - src/assets/letterhead-header.png and
// src/assets/letterhead-footer.png. They are stretched edge-to-edge across
// the full page width and their native aspect ratio is preserved, so the
// header/footer will still line up correctly even if you swap the artwork
// for a different-resolution version later.
// ---------------------------------------------------------------------
const HEADER_IMG = path.join(__dirname, "../assets/letterhead-header.png");
const FOOTER_IMG = path.join(__dirname, "../assets/letterhead-footer.png");
const HEADER_ASPECT = 120 / 667; // height / width of the source header PNG
const FOOTER_ASPECT = 107 / 661; // height / width of the source footer PNG

const headerHeightFor = (doc) => doc.page.width * HEADER_ASPECT;
const footerHeightFor = (doc) => doc.page.width * FOOTER_ASPECT;

function drawHeaderImage(doc) {
  const w = doc.page.width;
  const h = headerHeightFor(doc);
  try {
    doc.image(HEADER_IMG, 0, 0, { width: w, height: h });
  } catch (err) {
    // Falls back to a plain text header if the asset is missing, rather
    // than crashing PDF generation entirely.
    doc.fontSize(14).font("Helvetica-Bold").fillColor(NAVY).text("LauncherDesk", PAGE_LEFT, 20);
    doc.fontSize(14).font("Helvetica-Bold").fillColor(NAVY).text("DutyLaunch", PAGE_RIGHT - 100, 20, { width: 100, align: "right" });
  }
}

function drawFooterImage(doc) {
  const w = doc.page.width;
  const h = footerHeightFor(doc);
  const y = doc.page.height - h;
  // The footer sits inside the document's own bottom margin, so we
  // temporarily zero that margin out while drawing it - otherwise pdfkit
  // treats the image placement as overflow and silently appends a
  // trailing blank page.
  const savedBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    doc.image(FOOTER_IMG, 0, y, { width: w, height: h });
  } catch (err) {
    doc.rect(0, y, w, h).fill(NAVY);
  }
  doc.page.margins.bottom = savedBottomMargin;
}

// Renders a PDF entirely from the quotation document's own stored/snapshot
// fields (items[], subtotal/discount/tax/total, terms[], client*, approval/
// send/customer-response metadata). Never re-reads the live Service
// catalogue or ISO standard data, so a catalogue price change after the
// quotation was created can never alter a previously generated PDF - this
// mirrors the immutability guarantee Phase 4/5 already built into the
// stored line items themselves.
async function generateQuotationPdfBuffer(quotation) {
  const settings = await CompanySettings.getSettings();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const headerH = headerHeightFor(doc);
    const footerH = footerHeightFor(doc);
    // Lowest a row of body content is allowed to start before we force a
    // page break, leaving clear space above the footer band.
    const bodyBottom = doc.page.height - footerH - 16;
    const bodyTop = headerH + 18;

    // ---------- Title ----------
    let cursorY = bodyTop;
    doc.fontSize(20).fillColor(TEXT).font("Helvetica-Bold").text("QUOTATION", PAGE_LEFT, cursorY);
    doc.moveTo(PAGE_LEFT, cursorY + 24).lineTo(PAGE_LEFT + 90, cursorY + 24).strokeColor(TEXT).lineWidth(1).stroke();

    // ---------- To: (left) / meta (right) ----------
    const blockTop = cursorY + 38;
    doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("To,", PAGE_LEFT, blockTop);
    const clientLines = [
      quotation.clientCompany || quotation.clientName,
      quotation.clientCompany ? quotation.clientName : null,
      quotation.clientAdd1,
      [quotation.clientCity, quotation.clientState, quotation.clientPin].filter(Boolean).join(", "),
    ].filter(Boolean);
    let cy = blockTop + 14;
    clientLines.forEach((line, i) => {
      doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(i === 0 ? 11 : 9).fillColor(i === 0 ? TEXT : MUTED);
      doc.text(line, PAGE_LEFT, cy, { width: 260 });
      cy += i === 0 ? 15 : 12;
    });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    if (quotation.clientEmail) { doc.text(quotation.clientEmail, PAGE_LEFT, cy); cy += 12; }
    if (quotation.clientPhone) { doc.text(quotation.clientPhone, PAGE_LEFT, cy); cy += 12; }
    if (quotation.clientGST) { doc.text(`GSTIN: ${quotation.clientGST}`, PAGE_LEFT, cy); cy += 12; }

    const metaRows = [
      ["Quotation No:", quotation.quotNo],
      ["Date:", fmtDate(quotation.date)],
      ["Valid Until:", fmtDate(quotation.validUntil)],
      ["Prepared By:", quotation.preparedBy || "-"],
    ];
    if (quotation.revisionNumber > 1 || !quotation.isLatestRevision) {
      metaRows.push(["Revision:", `${quotation.revisionNumber}${quotation.isLatestRevision ? "" : " (superseded)"}`]);
    }
    metaRows.push(["Status:", STATUS_LABELS[quotation.status] || quotation.status]);
    if (quotation.enquiry?.enquiryNumber) {
      metaRows.push(["Enquiry Ref:", `${quotation.enquiry.enquiryNumber}`]);
    }
    const metaLabelX = 330;
    const metaValueX = 430;
    metaRows.forEach(([label, value], i) => {
      const ry = blockTop + i * 15;
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text(label, metaLabelX, ry);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT).text(String(value), metaValueX, ry, { width: 125 });
    });

    doc.y = Math.max(cy, blockTop + metaRows.length * 15) + 18;

    // ---------- Items table ----------
    const tableTop = doc.y;
    const cols = { idx: PAGE_LEFT, desc: PAGE_LEFT + 25, qty: 355, price: 405, amount: 480 };
    const rowPad = 6;

    const drawHeaderRow = (top) => {
      doc.rect(PAGE_LEFT, top, PAGE_WIDTH, 22).fill(TABLE_HEAD);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF");
      doc.text("#", cols.idx + 6, top + 7);
      doc.text("Description", cols.desc, top + 7);
      doc.text("Qty", cols.qty, top + 7, { width: 40, align: "right" });
      doc.text("Unit Price (Rs.)", cols.price, top + 7, { width: 65, align: "right" });
      doc.text("Amount (Rs.)", cols.amount, top + 7, { width: 68, align: "right" });
      return top + 22;
    };

    let y = drawHeaderRow(tableTop);
    doc.font("Helvetica").fontSize(9).fillColor(TEXT);

    (quotation.items || []).forEach((item, i) => {
      const hasDesc = !!item.description;
      const rowH = hasDesc ? 30 : 20;

      if (y + rowH > bodyBottom) {
        doc.addPage();
        y = drawHeaderRow(bodyTop);
        doc.font("Helvetica").fontSize(9).fillColor(TEXT);
      }

      if (i % 2 === 1) {
        doc.rect(PAGE_LEFT, y, PAGE_WIDTH, rowH).fill(LIGHT_ROW);
        doc.fillColor(TEXT);
      }

      doc.fontSize(9).font("Helvetica").fillColor(TEXT);
      doc.text(String(i + 1), cols.idx + 6, y + rowPad, { width: 20 });
      doc.text(item.name || item.serviceName || item.service || "-", cols.desc, y + rowPad, { width: 320 });
      doc.text(String(item.qty ?? 1), cols.qty, y + rowPad, { width: 40, align: "right" });
      doc.text(fmt(item.unitPrice), cols.price, y + rowPad, { width: 65, align: "right" });
      doc.text(fmt(item.lineTotal ?? item.lineAmount), cols.amount, y + rowPad, { width: 68, align: "right" });

      if (hasDesc) {
        doc.fontSize(8).fillColor("#6B7280").text(item.description, cols.desc, y + rowPad + 12, { width: 320 });
      }

      y += rowH;
    });

    // bottom border of the item rows
    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    doc.y = y + 10;

    // ---------- Totals ----------
    if (doc.y + 90 > bodyBottom) { doc.addPage(); doc.y = bodyTop; }
    const totalsLabelX = 380;
    const totalsValueX = 480;
    const totalsRow = (label, value, opts = {}) => {
      const { bold, big } = opts;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(big ? 12 : 9.5).fillColor(bold ? NAVY : MUTED);
      doc.text(label, totalsLabelX, doc.y, { width: 90 });
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(big ? 12 : 9.5).fillColor(bold ? NAVY : TEXT);
      doc.text(value, totalsValueX, doc.y - (big ? 13.5 : 11.5), { width: 68, align: "right" });
      doc.moveDown(bold ? 0.7 : 0.5);
    };

    totalsRow("Subtotal", fmt(quotation.subtotal));
    if (quotation.discountAmount > 0) {
      const label = quotation.discountType === "PERCENTAGE" ? `Discount (${quotation.discountValue}%)` : "Discount";
      totalsRow(label, `- ${fmt(quotation.discountAmount)}`);
      totalsRow("Taxable Amount", fmt(quotation.taxableAmount));
    }
    const effectiveGstPct = quotation.taxableAmount
      ? Math.round((Number(quotation.gstAmount || 0) / Number(quotation.taxableAmount || 1)) * 100)
      : settings.defaultGST;
    totalsRow(`GST @ ${effectiveGstPct}%`, fmt(quotation.gstAmount));
    if (quotation.govtFeeTotal > 0) totalsRow("Govt. Fees", fmt(quotation.govtFeeTotal));

    doc.moveTo(totalsLabelX, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor(NAVY).lineWidth(1).stroke();
    doc.moveDown(0.35);
    totalsRow("Total", `Rs. ${fmt(quotation.total)}`, { bold: true, big: true });

    // ---------- Terms & Conditions ----------
    const terms = quotation.terms?.length ? quotation.terms : settings.defaultTerms;
    if (terms?.length) {
      doc.moveDown(0.6);
      if (doc.y + 20 + terms.length * 12 > bodyBottom) { doc.addPage(); doc.y = bodyTop; }
      doc.fontSize(10).font("Helvetica-Bold").fillColor(NAVY).text("Terms & Conditions", PAGE_LEFT, doc.y);
      doc.moveDown(0.2);
      doc.fontSize(8.5).font("Helvetica").fillColor(MUTED);
      terms.forEach((t) => {
        if (doc.y > bodyBottom) { doc.addPage(); doc.y = bodyTop; }
        doc.text(`\u2022 ${t}`, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
      });
    }

    // ---------- Signature block ----------
    doc.moveDown(1.2);
    if (doc.y + 40 > bodyBottom) { doc.addPage(); doc.y = bodyTop; }
    doc.fontSize(9.5).font("Helvetica-Bold").fillColor(TEXT).text(`For ${settings.company}`, PAGE_LEFT, doc.y);
    doc.moveDown(2);
    doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("Authorised Signatory", PAGE_LEFT, doc.y);

    // ---------- Approval / acceptance trail (kept for audit purposes) ----------
    const approvalLines = [];
    if (quotation.approvedAt) approvalLines.push(`Approved on ${fmtDate(quotation.approvedAt)}`);
    if (quotation.sentAt) approvalLines.push(`Sent to customer on ${fmtDate(quotation.sentAt)}`);
    if (quotation.customerAcceptedAt) approvalLines.push(`Accepted by customer on ${fmtDate(quotation.customerAcceptedAt)}`);
    if (quotation.customerRejectedAt) approvalLines.push(`Rejected by customer on ${fmtDate(quotation.customerRejectedAt)}`);
    if (approvalLines.length) {
      if (doc.y + approvalLines.length * 11 > bodyBottom) { doc.addPage(); doc.y = bodyTop; }
      doc.moveDown(0.8);
      doc.fontSize(7.5).fillColor("#9CA3AF").font("Helvetica");
      approvalLines.forEach((l) => doc.text(l, PAGE_LEFT));
    }

    // ---------- Letterhead header + footer on every page ----------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawHeaderImage(doc);
      drawFooterImage(doc);
    }

    doc.end();
  });
}

module.exports = { generateQuotationPdfBuffer };