const mongoose = require('mongoose');

// Reused across ComplianceAssessment/Audit/AuditFinding/CorrectiveAction -
// links to an EXISTING Phase 6 Document, never copies/duplicates the file
// itself. Access to the referenced document is re-validated at link time
// (see complianceEvidence.js), so a user can't backdoor visibility into a
// document they can't otherwise reach.
module.exports = new mongoose.Schema({
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  linkedAt: { type: Date, default: Date.now },
  note: { type: String, trim: true, maxlength: 300 },
}, { _id: true });
