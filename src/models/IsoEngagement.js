const mongoose = require('mongoose');
const { ALL_ENGAGEMENT_STATUSES, ENGAGEMENT_STATUS } = require('../config/isoComplianceEnums');

// NOTE: unlike ComplianceAssessment/Audit/AuditFinding/CorrectiveAction,
// an engagement does NOT have an embedded evidence[] link array - its
// supporting documents are uploaded directly via the Document model's own
// `isoEngagement` relation (see models/Document.js) and browsed through the
// existing DocumentsPanel component, exactly like Customer/Enquiry/
// Quotation documents. Adding a second link-based mechanism here would
// duplicate that without adding anything.

// Represents a customer's ISO compliance/readiness engagement with
// LauncherDesk - consulting, preparation, internal audit support and
// compliance tracking. It is never itself a certificate, and no code path
// may treat reaching COMPLETED as "the customer is certified" - certification
// is a decision made by an independent certification body outside this
// system (see CERTIFICATION_DISCLAIMER in config/isoComplianceEnums.js).
const isoEngagementSchema = new mongoose.Schema({
  engagementNumber: { type: String, required: true, unique: true },

  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  isoStandard: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoStandard', required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
  enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry' },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },

  title: { type: String, required: true, trim: true },
  scope: { type: String, trim: true },
  locations: [{ type: String, trim: true }],

  status: { type: String, enum: ALL_ENGAGEMENT_STATUSES, default: ENGAGEMENT_STATUS.DRAFT },

  targetCertificationDate: { type: Date },
  startDate: { type: Date },
  expectedCompletionDate: { type: Date },
  actualCompletionDate: { type: Date },

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

isoEngagementSchema.index({ customer: 1 });
isoEngagementSchema.index({ isoStandard: 1 });
isoEngagementSchema.index({ status: 1 });
isoEngagementSchema.index({ assignedTo: 1 });

module.exports = mongoose.model('IsoEngagement', isoEngagementSchema);
