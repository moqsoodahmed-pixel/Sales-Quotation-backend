const mongoose = require('mongoose');
const { ALL_FINDING_TYPES, ALL_FINDING_STATUSES, FINDING_STATUS } = require('../config/isoComplianceEnums');
const evidenceLinkSchema = require('./schemas/evidenceLinkSchema');

// Represents a conformity/observation/nonconformity raised during an audit.
// MINOR_NONCONFORMITY / MAJOR_NONCONFORMITY findings ARE the nonconformity
// record - there is deliberately no separate Nonconformity model, since that
// would duplicate the same clause/evidence/severity/owner/due-date fields
// this model already carries (see Phase 7 report, section G).
const auditFindingSchema = new mongoose.Schema({
  findingNumber: { type: String, required: true, unique: true },
  audit: { type: mongoose.Schema.Types.ObjectId, ref: 'Audit', required: true },
  engagement: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoEngagement', required: true },
  clause: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoClause' },

  type: { type: String, enum: ALL_FINDING_TYPES, required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true }, // the objective finding
  severity: { type: String, trim: true }, // free-text severity note distinct from `type`'s minor/major classification, e.g. impact/likelihood commentary

  status: { type: String, enum: ALL_FINDING_STATUSES, default: FINDING_STATUS.OPEN },

  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  raisedAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  evidence: [evidenceLinkSchema],
}, { timestamps: true });

auditFindingSchema.index({ audit: 1 });
auditFindingSchema.index({ engagement: 1 });
auditFindingSchema.index({ clause: 1 });
auditFindingSchema.index({ status: 1 });
auditFindingSchema.index({ type: 1 });

module.exports = mongoose.model('AuditFinding', auditFindingSchema);
