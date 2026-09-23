const mongoose = require('mongoose');
const { ALL_CORRECTIVE_ACTION_STATUSES, CORRECTIVE_ACTION_STATUS } = require('../config/isoComplianceEnums');
const evidenceLinkSchema = require('./schemas/evidenceLinkSchema');

// "Completed by the responsible person" (submittedAt/completedAt) and
// "verified as effective" (verifiedAt/verifiedBy) are deliberately separate
// events - see the VERIFICATION status and the workflow in
// utils/complianceWorkflow.js. A user marking their own fix complete can
// never also verify it.
const correctiveActionSchema = new mongoose.Schema({
  actionNumber: { type: String, required: true, unique: true },
  finding: { type: mongoose.Schema.Types.ObjectId, ref: 'AuditFinding', required: true },
  engagement: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoEngagement', required: true },

  rootCause: { type: String, trim: true },
  correction: { type: String, trim: true }, // immediate fix/containment
  correctiveAction: { type: String, trim: true }, // systemic action to prevent recurrence

  responsiblePerson: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dueDate: { type: Date },
  completedAt: { type: Date }, // set when responsible person submits (not the same as verification)

  verifiedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verificationNotes: { type: String, trim: true },

  status: { type: String, enum: ALL_CORRECTIVE_ACTION_STATUSES, default: CORRECTIVE_ACTION_STATUS.OPEN },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  evidence: [evidenceLinkSchema],
}, { timestamps: true });

correctiveActionSchema.index({ finding: 1 });
correctiveActionSchema.index({ engagement: 1 });
correctiveActionSchema.index({ status: 1 });
correctiveActionSchema.index({ dueDate: 1 });

module.exports = mongoose.model('CorrectiveAction', correctiveActionSchema);
