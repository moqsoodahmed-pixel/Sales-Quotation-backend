const mongoose = require('mongoose');
const { ALL_ASSESSMENT_STATUSES, ASSESSMENT_STATUS, ALL_RISK_LEVELS } = require('../config/isoComplianceEnums');
const evidenceLinkSchema = require('./schemas/evidenceLinkSchema');

// A human judgement call against one clause for one engagement - never
// auto-derived from evidence existing (a document being attached does not
// itself imply compliance; see complianceAssessmentController.js).
const complianceAssessmentSchema = new mongoose.Schema({
  engagement: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoEngagement', required: true },
  clause: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoClause', required: true },

  status: { type: String, enum: ALL_ASSESSMENT_STATUSES, default: ASSESSMENT_STATUS.NOT_ASSESSED },
  assessment: { type: String, trim: true }, // free-text summary of the assessor's judgement
  gapDescription: { type: String, trim: true },
  riskLevel: { type: String, enum: ALL_RISK_LEVELS },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  targetDate: { type: Date },

  assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assessedAt: { type: Date },
  notes: { type: String, trim: true },

  evidence: [evidenceLinkSchema],
}, { timestamps: true });

// One assessment per clause per engagement - re-assessing updates the same
// record (with its own updatedAt/assessedAt), it doesn't create a second row.
complianceAssessmentSchema.index({ engagement: 1, clause: 1 }, { unique: true });
complianceAssessmentSchema.index({ status: 1 });
complianceAssessmentSchema.index({ riskLevel: 1 });

module.exports = mongoose.model('ComplianceAssessment', complianceAssessmentSchema);
