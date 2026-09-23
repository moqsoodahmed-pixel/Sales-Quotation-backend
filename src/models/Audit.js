const mongoose = require('mongoose');
const { ALL_AUDIT_TYPES, ALL_AUDIT_STATUSES, AUDIT_STATUS } = require('../config/isoComplianceEnums');
const evidenceLinkSchema = require('./schemas/evidenceLinkSchema');

// An INTERNAL audit record (or LauncherDesk-run readiness/surveillance/
// follow-up review) - never the formal certification-body audit itself.
const auditSchema = new mongoose.Schema({
  auditNumber: { type: String, required: true, unique: true },
  engagement: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoEngagement', required: true },

  auditType: { type: String, enum: ALL_AUDIT_TYPES, required: true },
  title: { type: String, required: true, trim: true },
  scope: { type: String, trim: true },
  clauses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'IsoClause' }],

  plannedDate: { type: Date },
  startedAt: { type: Date },
  completedAt: { type: Date },

  leadAuditor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  auditors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  status: { type: String, enum: ALL_AUDIT_STATUSES, default: AUDIT_STATUS.PLANNED },
  summary: { type: String, trim: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  evidence: [evidenceLinkSchema],
}, { timestamps: true });

auditSchema.index({ engagement: 1 });
auditSchema.index({ status: 1 });
auditSchema.index({ plannedDate: 1 });

module.exports = mongoose.model('Audit', auditSchema);
