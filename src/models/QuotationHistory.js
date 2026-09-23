const mongoose = require('mongoose');

// Append-only workflow audit trail for a single quotation. Never updated or
// deleted once written - this is the authoritative record of every status
// transition, approval, rejection, send and customer response. Scoped to
// quotations only (see Phase 5 spec: not the company-wide audit log, which
// is a later phase).
const quotationHistorySchema = new mongoose.Schema({
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', required: true },
  fromStatus: { type: String },
  toStatus: { type: String, required: true },
  action: { type: String, required: true }, // e.g. SUBMITTED_FOR_REVIEW, APPROVED, REJECTED, SENT, CUSTOMER_ACCEPTED, CUSTOMER_REJECTED, EXPIRED, CANCELLED, REVISION_CREATED, CREATED
  // null performedBy = a public/customer actor via the acceptance link, not an authenticated user
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByType: { type: String, enum: ['USER', 'CUSTOMER'], default: 'USER' },
  performedAt: { type: Date, default: Date.now },
  comment: { type: String },
  // Only populated for customer (public) actions - never for internal ones.
  ip: { type: String },
  userAgent: { type: String },
}, { timestamps: true });

quotationHistorySchema.index({ quotation: 1, performedAt: -1 });

module.exports = mongoose.model('QuotationHistory', quotationHistorySchema);
