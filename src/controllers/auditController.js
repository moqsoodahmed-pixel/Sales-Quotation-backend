const Audit = require("../models/Audit");
const IsoEngagement = require("../models/IsoEngagement");
const IsoClause = require("../models/IsoClause");
const ComplianceHistory = require("../models/ComplianceHistory");
const { nextNumber } = require("../utils/sequence");
const { isValidObjectId, parsePagination } = require("../utils/validators");
const { canAccessEngagement, ownedEngagementIds } = require("../utils/isoOwnership");
const { linkEvidence, unlinkEvidence } = require("../utils/complianceEvidence");
const { evaluateTransition } = require("../utils/complianceWorkflow");
const { ALL_AUDIT_TYPES, ALL_AUDIT_STATUSES } = require("../config/isoComplianceEnums");
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

// @desc List audits
// @route GET /api/audits
exports.listAudits = async (req, res) => {
  const { engagement, status } = req.query;
  const filter = {};

  if (engagement) {
    const { engagement: eng, error, status: errStatus } = await loadEngagementForAccess(req, engagement);
    if (error) return res.status(errStatus || 400).json({ success: false, message: error });
    filter.engagement = eng._id;
  } else if (req.user.role === "sales") {
    filter.engagement = { $in: await ownedEngagementIds(req.user) };
  }
  if (status) { if (!ALL_AUDIT_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid status." }); filter.status = status; }

  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    Audit.find(filter).populate("leadAuditor", "name email").populate("engagement", "engagementNumber title").sort({ plannedDate: -1, createdAt: -1 }).skip(skip).limit(limit),
    Audit.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get a single audit
// @route GET /api/audits/:id
exports.getAudit = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid audit id." });
  const audit = await Audit.findById(req.params.id)
    .populate("engagement", "engagementNumber title customer isoStandard")
    .populate("clauses", "clauseNumber title")
    .populate("leadAuditor", "name email").populate("auditors", "name email")
    .populate("createdBy", "name email")
    .populate("evidence.document", "originalFilename documentType").populate("evidence.linkedBy", "name");
  if (!audit) return res.status(404).json({ success: false, message: "Audit not found." });

  const engagement = await IsoEngagement.findById(audit.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this audit." });

  res.json({ success: true, data: audit });
};

// @desc Create an audit
// @route POST /api/audits
exports.createAudit = async (req, res) => {
  const { engagement: engagementId, auditType, title, clauses } = req.body;
  const { engagement, error, status } = await loadEngagementForAccess(req, engagementId);
  if (error) return res.status(status || 400).json({ success: false, message: error });

  if (!auditType || !ALL_AUDIT_TYPES.includes(auditType)) return res.status(400).json({ success: false, message: "A valid audit type is required." });
  if (!title) return res.status(400).json({ success: false, message: "Title is required." });

  let clauseIds = [];
  if (clauses?.length) {
    for (const cid of clauses) {
      if (!isValidObjectId(cid)) return res.status(400).json({ success: false, message: "Invalid clause id." });
    }
    const found = await IsoClause.find({ _id: { $in: clauses }, isoStandard: engagement.isoStandard });
    if (found.length !== clauses.length) return res.status(400).json({ success: false, message: "One or more clauses do not belong to this engagement's ISO standard." });
    clauseIds = found.map((c) => c._id);
  }

  if (req.body.plannedDate && isNaN(Date.parse(req.body.plannedDate))) return res.status(400).json({ success: false, message: "Invalid planned date." });

  const auditNumber = await nextNumber("audit", "AUD");
  const audit = await Audit.create({
    auditNumber, engagement: engagement._id, auditType, title,
    scope: req.body.scope, clauses: clauseIds, plannedDate: req.body.plannedDate,
    leadAuditor: req.body.leadAuditor, auditors: req.body.auditors,
    createdBy: req.user._id,
  });

  await ComplianceHistory.create({ entityType: "Audit", entityId: audit._id, toStatus: audit.status, action: "CREATED", performedBy: req.user._id });
  res.status(201).json({ success: true, data: audit });
};

// @desc Update audit (non-workflow fields)
// @route PATCH /api/audits/:id
exports.updateAudit = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid audit id." });
  const audit = await Audit.findById(req.params.id);
  if (!audit) return res.status(404).json({ success: false, message: "Audit not found." });
  const engagement = await IsoEngagement.findById(audit.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this audit." });

  const { status, auditNumber, engagement: _e, evidence, ...safeBody } = req.body;
  Object.assign(audit, safeBody);
  await audit.save();
  res.json({ success: true, data: audit });
};

// @desc Controlled status transition (Start/Complete/Cancel)
// @route POST /api/audits/:id/transition
exports.transitionAudit = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid audit id." });
  const { action, comment } = req.body;
  const audit = await Audit.findById(req.params.id);
  if (!audit) return res.status(404).json({ success: false, message: "Audit not found." });
  const engagement = await IsoEngagement.findById(audit.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this audit." });

  const isLead = (u) => String(audit.leadAuditor || "") === String(u._id) || (audit.auditors || []).some((a) => String(a) === String(u._id));
  const result = evaluateTransition("Audit", audit, action, req.user, comment, (a, u) => isLead(u));
  if (result.error) return res.status(400).json({ success: false, message: result.error });

  if (action === "START") audit.startedAt = new Date();
  if (action === "COMPLETE") { audit.completedAt = new Date(); if (req.body.summary) audit.summary = req.body.summary; }
  await audit.save();
  await ComplianceHistory.create({ entityType: "Audit", entityId: audit._id, fromStatus: result.fromStatus, toStatus: result.toStatus, action, performedBy: req.user._id, comment });

  if (action === "COMPLETE" && engagement.assignedTo) {
    await createNotification({
      recipient: engagement.assignedTo, type: NOTIFICATION_TYPE.AUDIT_COMPLETED,
      title: `Audit ${audit.auditNumber} completed`, message: `Completed by ${req.user.name}.`,
      entityType: "Audit", entityId: audit._id, severity: NOTIFICATION_SEVERITY.INFO,
    }).catch((err) => logger.error(`Audit completed notification failed: ${err.message}`));
  }

  res.json({ success: true, data: { _id: audit._id, status: audit.status } });
};

// @desc Audit workflow history
// @route GET /api/audits/:id/history
exports.getAuditHistory = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid audit id." });
  const audit = await Audit.findById(req.params.id);
  if (!audit) return res.status(404).json({ success: false, message: "Audit not found." });
  const engagement = await IsoEngagement.findById(audit.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this audit." });

  const history = await ComplianceHistory.find({ entityType: "Audit", entityId: audit._id }).populate("performedBy", "name email role").sort({ performedAt: 1 });
  res.json({ success: true, data: history });
};

// @desc Link existing evidence document
// @route POST /api/audits/:id/evidence
exports.addAuditEvidence = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid audit id." });
  const audit = await Audit.findById(req.params.id);
  if (!audit) return res.status(404).json({ success: false, message: "Audit not found." });
  const engagement = await IsoEngagement.findById(audit.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this audit." });

  const result = await linkEvidence(audit, req.body.documentId, req.user, req.body.note);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  await audit.save();
  res.status(201).json({ success: true, data: audit.evidence });
};

// @desc Unlink evidence document
// @route DELETE /api/audits/:id/evidence/:documentId
exports.removeAuditEvidence = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid audit id." });
  const audit = await Audit.findById(req.params.id);
  if (!audit) return res.status(404).json({ success: false, message: "Audit not found." });
  const engagement = await IsoEngagement.findById(audit.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this audit." });

  unlinkEvidence(audit, req.params.documentId);
  await audit.save();
  res.json({ success: true, data: audit.evidence });
};
