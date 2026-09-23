const mongoose = require('mongoose');
const { ALL_STATUSES, STATUS } = require('../config/quotationStatus');

// Legacy Title-Case values (pre-Phase-5) are included alongside the new
// canonical UPPER_SNAKE statuses so that any quotation not yet migrated by
// utils/migrateQuotationStatuses.js still passes schema validation and
// remains readable/saveable. The migration runs automatically at startup;
// this union is a safety net, not the intended steady state.
const LEGACY_STATUSES = ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired', 'Converted'];
const STATUSES = [...ALL_STATUSES, ...LEGACY_STATUSES];

const quotationItemSchema = new mongoose.Schema({
  // Snapshot of service at time of quotation creation - once saved, these
  // values never change even if the catalogue service is later edited,
  // repriced or deactivated (see serviceController/Service model, Phase 3).
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
  serviceCode: { type: String },
  name: { type: String, required: true },
  description: { type: String },
  categoryName: { type: String },
  billingType: { type: String, default: 'One Time' },
  qty: { type: Number, required: true, min: 1, default: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  gstPercent: { type: Number, default: 18 },
  taxApplicable: { type: Boolean, default: true },
  lineAmount: { type: Number, required: true },
  taxAmount: { type: Number, default: 0 },
  lineTotal: { type: Number, default: 0 },
  note: { type: String },
}, { _id: true });

const quotationSchema = new mongoose.Schema({
  quotNo: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  // Client
  clientName: { type: String, required: [true, 'Client name is required'], trim: true },
  clientCompany: { type: String, trim: true },
  clientEmail: { type: String, trim: true, lowercase: true },
  clientPhone: { type: String, trim: true },
  clientAdd1: { type: String, trim: true },
  clientAdd2: { type: String, trim: true },
  clientCity: { type: String, trim: true },
  clientState: { type: String, trim: true },
  clientPin: { type: String, trim: true },
  clientContact: { type: String, trim: true },
  clientDesignation: { type: String, trim: true },
  clientGST: { type: String, trim: true },

  // CRM relationships (Phase 4). Optional so pre-existing quotations, which
  // predate the Customer/Enquiry models, remain valid and readable as-is.
  // The clientXxx fields above remain the source of truth for display/PDF -
  // when a customer is selected, they are snapshotted from it at creation.
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Quotation metadata
  date: { type: Date, required: true, default: Date.now },
  validUntil: { type: Date },
  refName: { type: String, trim: true },
  status: { type: String, enum: STATUSES, default: STATUS.DRAFT },

  // --- Phase 5: versioning ---
  // rootQuotationId points at revision 1's own _id (for revision 1, this
  // equals its own _id). All revisions of the same commercial lineage share
  // one rootQuotationId, so "all versions of this quotation" is a single
  // indexed query rather than a linked-list walk. Each revision still gets
  // its OWN unique quotNo (the existing numbering sequence is per-document
  // and cannot be reused across documents), so the UI shows it as
  // "<quotNo> (Rev N)".
  rootQuotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  previousRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  revisionNumber: { type: Number, default: 1 },
  isLatestRevision: { type: Boolean, default: true },

  // --- Phase 5: approval workflow metadata ---
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String, trim: true },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sentAt: { type: Date },

  // --- Phase 5: digital customer acceptance ---
  // Only a SHA-256 hash of the acceptance token is ever stored; the raw
  // token is returned once (in the SEND response) and is not recoverable
  // from the database. acceptanceTokenExpiresAt mirrors validUntil at the
  // moment of sending; acceptanceTokenUsedAt is set on accept/reject to
  // prevent the same link from being used twice.
  acceptanceTokenHash: { type: String, select: false },
  acceptanceTokenExpiresAt: { type: Date },
  acceptanceTokenUsedAt: { type: Date },
  customerAcceptedAt: { type: Date },
  customerAcceptanceMethod: { type: String },
  customerAcceptanceComment: { type: String, trim: true },
  customerAcceptanceIp: { type: String },
  customerAcceptanceUserAgent: { type: String },
  customerRejectedAt: { type: Date },
  customerRejectionReason: { type: String, trim: true },

  // Line items (snapshot)
  items: [quotationItemSchema],

  // Discount configuration (Phase 4). discountAmount (below) remains the
  // server-computed monetary result and is what PDF/detail views already
  // read - discountType/discountValue capture how it was derived.
  discountType: { type: String, enum: ['PERCENTAGE', 'FIXED'], default: 'FIXED' },
  discountValue: { type: Number, default: 0, min: 0 },

  // Financials - always server-calculated, never trusted from the client
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  govtFeeTotal: { type: Number, default: 0 },
  total: { type: Number, default: 0 },

  // Terms snapshot
  terms: [{ type: String }],

  // Notes (internal, not shown on PDF)
  internalNotes: { type: String },

  // PDF path or URL
  pdfUrl: { type: String },

  // Ownership & audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  preparedBy: { type: String },  // display name snapshot
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Status history
  statusHistory: [{
    status: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String },
  }],

  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Indexes for performance
quotationSchema.index({ createdBy: 1, createdAt: -1 });
quotationSchema.index({ status: 1 });
quotationSchema.index({ clientName: 'text', quotNo: 'text' });
quotationSchema.index({ customer: 1 });
quotationSchema.index({ enquiry: 1 });
quotationSchema.index({ assignedTo: 1 });
quotationSchema.index({ rootQuotationId: 1, revisionNumber: 1 });
quotationSchema.index({ acceptanceTokenHash: 1 }, { sparse: true });

module.exports = mongoose.model('Quotation', quotationSchema);
