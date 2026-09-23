const PDFDocument = require("pdfkit");
const CompanySettings = require("../models/CompanySettings");
const { STATUS_LABELS } = require("../config/quotationStatus");

const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "-");

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
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(18).fillColor("#1F3C88").text(settings.company || "LauncherDesk", { continued: false });
    doc.fontSize(9).fillColor("#374151");
    if (settings.regAdd) doc.text(settings.regAdd);
    const contactLine = [settings.phone1, settings.email1, settings.website1].filter(Boolean).join("  |  ");
    if (contactLine) doc.text(contactLine);
    if (settings.gstin) doc.text(`GSTIN: ${settings.gstin}`);
    doc.moveDown(1);
    doc.strokeColor("#E5E7EB").moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    // Title + quotation meta
    doc.fontSize(15).fillColor("#111827").text("QUOTATION", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#374151");
    const metaLeft = [
      ["Quotation No", quotation.quotNo],
      ["Revision", `${quotation.revisionNumber}${quotation.isLatestRevision ? "" : " (superseded)"}`],
      ["Status", STATUS_LABELS[quotation.status] || quotation.status],
      ["Date", fmtDate(quotation.date)],
      ["Valid Until", fmtDate(quotation.validUntil)],
    ];
    if (quotation.enquiry?.enquiryNumber) metaLeft.push(["Enquiry Ref", `${quotation.enquiry.enquiryNumber} - ${quotation.enquiry.subject || ""}`]);
    if (quotation.preparedBy) metaLeft.push(["Prepared By", quotation.preparedBy]);

    const startY = doc.y;
    metaLeft.forEach(([label, value], i) => {
      doc.text(`${label}: `, 40, startY + i * 14, { continued: true }).fillColor("#111827").text(String(value)).fillColor("#374151");
    });

    // Client block (right column)
    const clientLines = [
      quotation.clientCompany || quotation.clientName,
      quotation.clientCompany ? quotation.clientName : null,
      quotation.clientAdd1,
      [quotation.clientCity, quotation.clientState, quotation.clientPin].filter(Boolean).join(", "),
      quotation.clientEmail,
      quotation.clientPhone,
      quotation.clientGST ? `GSTIN: ${quotation.clientGST}` : null,
    ].filter(Boolean);
    doc.fontSize(9).fillColor("#9CA3AF").text("BILL TO", 330, startY);
    doc.fontSize(10).fillColor("#111827");
    clientLines.forEach((line, i) => doc.text(line, 330, startY + 14 + i * 13, { width: 185 }));

    doc.y = startY + Math.max(metaLeft.length * 14, clientLines.length * 13 + 14) + 16;

    // Items table
    doc.moveDown(0.5);
    const tableTop = doc.y;
    const cols = { name: 40, code: 210, qty: 300, price: 340, tax: 420, total: 480 };
    doc.fontSize(9).fillColor("#fff").rect(40, tableTop, 515, 18).fill("#1E3A8A");
    doc.fillColor("#fff");
    doc.text("Service", cols.name + 4, tableTop + 5);
    doc.text("Code", cols.code, tableTop + 5);
    doc.text("Qty", cols.qty, tableTop + 5);
    doc.text("Unit Price", cols.price, tableTop + 5);
    doc.text("Tax", cols.tax, tableTop + 5);
    doc.text("Amount", cols.total, tableTop + 5);

    let y = tableTop + 22;
    doc.fontSize(9).fillColor("#111827");
    (quotation.items || []).forEach((item, i) => {
      if (y > 740) { doc.addPage(); y = 40; }
      const rowH = item.description ? 26 : 16;
      if (i % 2 === 1) doc.rect(40, y - 3, 515, rowH).fill("#F9FAFB").fillColor("#111827");
      doc.text(item.name, cols.name + 4, y, { width: 165 });
      doc.text(item.serviceCode || "-", cols.code, y, { width: 85 });
      doc.text(String(item.qty), cols.qty, y);
      doc.text(fmt(item.unitPrice), cols.price, y, { width: 75 });
      doc.text(`${item.gstPercent ?? 0}%`, cols.tax, y);
      doc.text(fmt(item.lineTotal || item.lineAmount), cols.total, y, { width: 75 });
      if (item.description) doc.fontSize(8).fillColor("#6B7280").text(item.description, cols.name + 4, y + 12, { width: 400 }).fontSize(9).fillColor("#111827");
      y += rowH;
    });
    doc.y = y + 10;

    // Totals
    const totalsX = 360;
    const totalsRow = (label, value, bold) => {
      doc.fontSize(bold ? 11 : 10).fillColor(bold ? "#1F3C88" : "#374151");
      doc.text(label, totalsX, doc.y, { continued: true, width: 100 });
      doc.text(value, totalsX + 100, doc.y - (bold ? 13 : 12), { width: 95, align: "right" });
      doc.moveDown(bold ? 0.6 : 0.4);
    };
    totalsRow("Subtotal", fmt(quotation.subtotal));
    if (quotation.discountAmount > 0) {
      const label = quotation.discountType === "PERCENTAGE" ? `Discount (${quotation.discountValue}%)` : "Discount";
      totalsRow(label, `- ${fmt(quotation.discountAmount)}`);
    }
    totalsRow("Taxable Amount", fmt(quotation.taxableAmount));
    totalsRow("GST", fmt(quotation.gstAmount));
    if (quotation.govtFeeTotal > 0) totalsRow("Govt. Fees", fmt(quotation.govtFeeTotal));
    doc.strokeColor("#1F3C88").moveTo(totalsX, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.3);
    totalsRow("TOTAL", fmt(quotation.total), true);

    // Terms
    if (quotation.terms?.length) {
      doc.moveDown(0.8);
      doc.fontSize(10).fillColor("#1F3C88").text("Terms & Conditions", 40);
      doc.fontSize(8.5).fillColor("#374151");
      quotation.terms.forEach((t) => doc.text(`- ${t}`, 40, doc.y, { width: 515 }));
    }

    // Approval / acceptance trail
    const approvalLines = [];
    if (quotation.approvedAt) approvalLines.push(`Approved on ${fmtDate(quotation.approvedAt)}`);
    if (quotation.sentAt) approvalLines.push(`Sent to customer on ${fmtDate(quotation.sentAt)}`);
    if (quotation.customerAcceptedAt) approvalLines.push(`Accepted by customer on ${fmtDate(quotation.customerAcceptedAt)}`);
    if (quotation.customerRejectedAt) approvalLines.push(`Rejected by customer on ${fmtDate(quotation.customerRejectedAt)}`);
    if (approvalLines.length) {
      doc.moveDown(0.8);
      doc.fontSize(8.5).fillColor("#6B7280");
      approvalLines.forEach((l) => doc.text(l, 40));
    }

    doc.moveDown(1);
    doc.fontSize(8).fillColor("#9CA3AF").text(
      "This is a system-generated quotation reflecting the exact commercial terms recorded at the time of this revision.",
      40, doc.y, { width: 515 }
    );

    doc.end();
  });
}

module.exports = { generateQuotationPdfBuffer };
