const mongoose = require('mongoose');

// Lightweight, append-only audit trail for document actions (upload,
// download, metadata update, deactivate, regenerate). Mirrors the
// QuotationHistory pattern from Phase 5 rather than inventing a new
// convention - scoped to documents only, not a company-wide audit log
// (that belongs to a later phase).
const documentHistorySchema = new mongoose.Schema({
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  action: { type: String, required: true }, // UPLOADED, DOWNLOADED, UPDATED, DEACTIVATED, REGENERATED
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedAt: { type: Date, default: Date.now },
  comment: { type: String },
}, { timestamps: true });

documentHistorySchema.index({ document: 1, performedAt: -1 });

module.exports = mongoose.model('DocumentHistory', documentHistorySchema);
