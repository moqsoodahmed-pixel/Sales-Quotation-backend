const mongoose = require('mongoose');
const { ALL_DOCUMENT_TYPES } = require('../config/documentEnums');

const documentSchema = new mongoose.Schema({
  // At least one relation is required (enforced in the controller, not the
  // schema, since which one(s) apply depends on documentType).
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry' },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  // Snapshot of the quotation's revision at the time this document was
  // attached/generated - a QUOTATION_PDF is always tied to one immutable
  // revision, even though `quotation` itself never changes after creation.
  quotationRevisionNumber: { type: Number },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
  isoStandard: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoStandard' },
  // Phase 7: direct engagement-level documents (e.g. scope statement,
  // contract) uploaded straight to an ISO Engagement. Assessment/Audit/
  // Finding/CorrectiveAction evidence instead LINKS an existing Document
  // via their own embedded evidence[] arrays (see models/schemas/
  // evidenceLinkSchema.js) rather than uploading through this relation -
  // per the Phase 7 spec's explicit "reuse the Document model, do not
  // create another evidence-upload system" instruction.
  isoEngagement: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoEngagement' },

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  documentType: { type: String, enum: ALL_DOCUMENT_TYPES, required: true },

  originalFilename: { type: String, required: true, trim: true },
  storedFilename: { type: String, required: true, unique: true },
  mimeType: { type: String, required: true },
  fileSize: { type: Number, required: true, min: 0 },

  description: { type: String, trim: true, maxlength: 500 },
  expiryDate: { type: Date },
  version: { type: Number, default: 1 },

  // Soft delete/deactivate - never hard-deleted so document history and
  // any references from Quotation/Customer/Enquiry views stay consistent.
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

documentSchema.index({ customer: 1 });
documentSchema.index({ enquiry: 1 });
documentSchema.index({ quotation: 1 });
documentSchema.index({ service: 1 });
documentSchema.index({ isoStandard: 1 });
documentSchema.index({ isoEngagement: 1 });
documentSchema.index({ documentType: 1 });
documentSchema.index({ isActive: 1 });
documentSchema.index({ expiryDate: 1 });
// One active QUOTATION_PDF per quotation - see the "regenerate replaces the
// active PDF" strategy in documentController.js.
documentSchema.index({ quotation: 1, documentType: 1 });

module.exports = mongoose.model('Document', documentSchema);
