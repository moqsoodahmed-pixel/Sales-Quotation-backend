const mongoose = require('mongoose');

// One shared, append-only audit trail for every Phase 7 workflow entity
// (IsoEngagement, Audit, AuditFinding, CorrectiveAction), discriminated by
// `entityType` - rather than four near-identical *History collections
// (the QuotationHistory/DocumentHistory precedent from Phases 5/6 is one
// collection per entity; four more here would be pure duplication for an
// identical shape). No update/delete path is ever exposed for this model.
const complianceHistorySchema = new mongoose.Schema({
  entityType: { type: String, enum: ['IsoEngagement', 'Audit', 'AuditFinding', 'CorrectiveAction'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fromStatus: { type: String },
  toStatus: { type: String, required: true },
  action: { type: String, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedAt: { type: Date, default: Date.now },
  comment: { type: String, trim: true },
}, { timestamps: true });

complianceHistorySchema.index({ entityType: 1, entityId: 1, performedAt: -1 });

module.exports = mongoose.model('ComplianceHistory', complianceHistorySchema);
