const AuditFinding = require("../models/AuditFinding");
const Audit = require("../models/Audit");
const IsoEngagement = require("../models/IsoEngagement");
const IsoClause = require("../models/IsoClause");
const ComplianceHistory = require("../models/ComplianceHistory");
const { nextNumber } = require("../utils/sequence");
const { isValidObjectId, parsePagination } = require("../utils/validators");
const { canAccessEngagement, ownedEngagementIds } = require("../utils/isoOwnership");
const { linkEvidence, unlinkEvidence } = require("../utils/complianceEvidence");
const { evaluateTransition } = require("../utils/complianceWorkflow");
const { ALL_FINDING_TYPES, ALL_FINDING_STATUSES } = require("../config/isoComplianceEnums");
const { createNotification } = require("../utils/notificationService");
const { NOTIFICATION_TYPE, NOTIFICATION_SEVERITY } = require("../config/notificationEnums");
const logger = require("../utils/logger");

const loadEngagementForAccess = async (req, engagementId) => {
  if (!engagementId || !isValidObjectId(engagementId)) return { error: "A valid engagement is required." };
  const engagement = await IsoEngagement.findOne({ _id: engagementId, isArchived: false });
  if (!engagement) return { error: "Engagement not found.", status: 404 };
  if (!canAccessEngagement(req.user, engagement)) return { error: "You do not have access to this engagement.", status: 403 };
  return { engagement };
};

// @desc List findings
// @route GET /api/audit-findings
exports.listFindings = async (req, res) => {
  const { audit, engagement, status, type } = req.query;
  const filter = {};

  if (engagement) {
    const { engagement: eng, error, status: errStatus } = await loadEngagementForAccess(req, engagement);
    if (error) return res.status(errStatus || 400).json({ success: false, message: error });
    filter.engagement = eng._id;
  } else if (req.user.role === "sales") {
    filter.engagement = { $in: await ownedEngagementIds(req.user) };
  }
  if (audit) { if (!isValidObjectId(audit)) return res.status(400).json({ success: false, message: "Invalid audit id." }); filter.audit = audit; }
  if (status) { if (!ALL_FINDING_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid status." }); filter.status = status; }
  if (type) { if (!ALL_FINDING_TYPES.includes(type)) return res.status(400).json({ success: false, message: "Invalid finding type." }); filter.type = type; }

  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    AuditFinding.find(filter).populate("clause", "clauseNumber title").populate("audit", "auditNumber title").sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditFinding.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get a single finding
// @route GET /api/audit-findings/:id
exports.getFinding = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid finding id." });
  const finding = await AuditFinding.findById(req.params.id)
    .populate("clause", "clauseNumber title").populate("audit", "auditNumber title")
    .populate("raisedBy", "name email").populate("closedBy", "name email")
    .populate("evidence.document", "originalFilename documentType").populate("evidence.linkedBy", "name");
  if (!finding) return res.status(404).json({ success: false, message: "Finding not found." });

  const engagement = await IsoEngagement.findById(finding.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this finding." });

  res.json({ success: true, data: finding });
};

// @desc Create a finding
// @route POST /api/audit-findings
exports.createFinding = async (req, res) => {
  const { audit: auditId, type, title, clause: clauseId } = req.body;
  if (!auditId || !isValidObjectId(auditId)) return res.status(400).json({ success: false, message: "A valid audit is required." });
  const audit = await Audit.findById(auditId);
  if (!audit) return res.status(404).json({ success: false, message: "Audit not found." });

  const engagement = await IsoEngagement.findOne({ _id: audit.engagement, isArchived: false });
  if (!engagement) return res.status(404).json({ success: false, message: "Engagement not found." });
  if (!canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this audit." });

  if (!type || !ALL_FINDING_TYPES.includes(type)) return res.status(400).json({ success: false, message: "A valid finding type is required." });
  if (!title) return res.status(400).json({ success: false, message: "Title is required." });

  let clause = null;
  if (clauseId) {
    if (!isValidObjectId(clauseId)) return res.status(400).json({ success: false, message: "Invalid clause id." });
    clause = await IsoClause.findOne({ _id: clauseId, isoStandard: engagement.isoStandard });
    if (!clause) return res.status(400).json({ success: false, message: "This clause does not belong to the engagement's ISO standard." });
  }

  const findingNumber = await nextNumber("audit-finding", "FIND");
  const finding = await AuditFinding.create({
    findingNumber, audit: audit._id, engagement: engagement._id, clause: clause?._id,
    type, title, description: req.body.description, severity: req.body.severity,
    raisedBy: req.user._id,
  });

  await ComplianceHistory.create({ entityType: "AuditFinding", entityId: finding._id, toStatus: finding.status, action: "CREATED", performedBy: req.user._id });

  if (engagement.assignedTo && String(engagement.assignedTo) !== String(req.user._id)) {
    await createNotification({
      recipient: engagement.assignedTo, type: NOTIFICATION_TYPE.FINDING_CREATED,
      title: `New finding ${finding.findingNumber}: ${finding.title}`, message: `Raised by ${req.user.name} on ${engagement.engagementNumber}.`,
      entityType: "AuditFinding", entityId: finding._id, severity: type.includes("MAJOR") ? NOTIFICATION_SEVERITY.CRITICAL : NOTIFICATION_SEVERITY.WARNING,
    }).catch((err) => logger.error(`Finding created notification failed: ${err.message}`));
  }

  res.status(201).json({ success: true, data: finding });
};

// @desc Update finding (non-workflow fields)
// @route PATCH /api/audit-findings/:id
exports.updateFinding = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid finding id." });
  const finding = await AuditFinding.findById(req.params.id);
  if (!finding) return res.status(404).json({ success: false, message: "Finding not found." });
  const engagement = await IsoEngagement.findById(finding.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this finding." });

  const { status, findingNumber, audit, engagement: _e, evidence, ...safeBody } = req.body;
  if (req.body.type && !ALL_FINDING_TYPES.includes(req.body.type)) return res.status(400).json({ success: false, message: "Invalid finding type." });

  Object.assign(finding, safeBody);
  await finding.save();
  res.json({ success: true, data: finding });
};

// @desc Controlled status transition
// @route POST /api/audit-findings/:id/transition
exports.transitionFinding = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid finding id." });
  const { action, comment } = req.body;
  const finding = await AuditFinding.findById(req.params.id);
  if (!finding) return res.status(404).json({ success: false, message: "Finding not found." });
  const engagement = await IsoEngagement.findById(finding.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this finding." });

  const result = evaluateTransition("AuditFinding", finding, action, req.user, comment);
  if (result.error) return res.status(400).json({ success: false, message: result.error });

  if (action === "CLOSE") { finding.closedAt = new Date(); finding.closedBy = req.user._id; }
  await finding.save();
  await ComplianceHistory.create({ entityType: "AuditFinding", entityId: finding._id, fromStatus: result.fromStatus, toStatus: result.toStatus, action, performedBy: req.user._id, comment });

  res.json({ success: true, data: { _id: finding._id, status: finding.status } });
};

// @desc Finding workflow history
// @route GET /api/audit-findings/:id/history
exports.getFindingHistory = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid finding id." });
  const finding = await AuditFinding.findById(req.params.id);
  if (!finding) return res.status(404).json({ success: false, message: "Finding not found." });
  const engagement = await IsoEngagement.findById(finding.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this finding." });

  const history = await ComplianceHistory.find({ entityType: "AuditFinding", entityId: finding._id }).populate("performedBy", "name email role").sort({ performedAt: 1 });
  res.json({ success: true, data: history });
};

// @desc Link existing evidence document
// @route POST /api/audit-findings/:id/evidence
exports.addFindingEvidence = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid finding id." });
  const finding = await AuditFinding.findById(req.params.id);
  if (!finding) return res.status(404).json({ success: false, message: "Finding not found." });
  const engagement = await IsoEngagement.findById(finding.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this finding." });

  const result = await linkEvidence(finding, req.body.documentId, req.user, req.body.note);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  await finding.save();
  res.status(201).json({ success: true, data: finding.evidence });
};

// @desc Unlink evidence document
// @route DELETE /api/audit-findings/:id/evidence/:documentId
exports.removeFindingEvidence = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid finding id." });
  const finding = await AuditFinding.findById(req.params.id);
  if (!finding) return res.status(404).json({ success: false, message: "Finding not found." });
  const engagement = await IsoEngagement.findById(finding.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this finding." });

  unlinkEvidence(finding, req.params.documentId);
  await finding.save();
  res.json({ success: true, data: finding.evidence });
};
