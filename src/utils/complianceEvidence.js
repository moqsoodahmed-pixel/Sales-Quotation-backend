const { isValidObjectId } = require('./validators');
const Document = require('../models/Document');
const { userCanAccessDocument } = require('../controllers/documentController');

// Shared by every entity that embeds an `evidence: [evidenceLinkSchema]`
// array (ComplianceAssessment/Audit/AuditFinding/CorrectiveAction). Never
// copies the file - only validates the caller can access the referenced
// Document (Phase 6 access rules) and appends a link. Mutates `entity` in
// place; the caller is responsible for calling .save().
async function linkEvidence(entity, documentId, user, note) {
  if (!isValidObjectId(documentId)) return { error: 'Invalid document id.' };
  const doc = await Document.findById(documentId);
  if (!doc) return { error: 'Document not found.' };
  if (!(await userCanAccessDocument(user, doc))) return { error: 'You do not have access to this document.' };
  entity.evidence.push({ document: doc._id, linkedBy: user._id, note });
  return { ok: true };
}

function unlinkEvidence(entity, documentId) {
  const before = entity.evidence.length;
  entity.evidence = entity.evidence.filter((e) => String(e.document) !== String(documentId));
  return entity.evidence.length < before;
}

module.exports = { linkEvidence, unlinkEvidence };
