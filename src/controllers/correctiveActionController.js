const CorrectiveAction = require("../models/CorrectiveAction");
const AuditFinding = require("../models/AuditFinding");
const IsoEngagement = require("../models/IsoEngagement");
const ComplianceHistory = require("../models/ComplianceHistory");
const { nextNumber } = require("../utils/sequence");
const { isValidObjectId, parsePagination } = require("../utils/validators");
const { canAccessEngagement, ownedEngagementIds } = require("../utils/isoOwnership");
const { linkEvidence, unlinkEvidence } = require("../utils/complianceEvidence");
const { evaluateTransition } = require("../utils/complianceWorkflow");
const { ALL_CORRECTIVE_ACTION_STATUSES, CORRECTIVE_ACTION_DUE_STATUS, DUE_SOON_WINDOW_DAYS } = require("../config/isoComplianceEnums");
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

// Derived, display-only - never stored, so it can't drift out of sync with
// "today" (Phase 7 spec §19: prefer deriving over storing duplicated state).
const computeDueStatus = (ca) => {
  if (["EFFECTIVE", "CLOSED"].includes(ca.status)) return CORRECTIVE_ACTION_DUE_STATUS.COMPLETED;
  if (!ca.dueDate) return CORRECTIVE_ACTION_DUE_STATUS.ON_TRACK;
  const now = Date.now();
  const due = new Date(ca.dueDate).getTime();
  if (due < now) return CORRECTIVE_ACTION_DUE_STATUS.OVERDUE;
  if (due - now <= DUE_SOON_WINDOW_DAYS * 86400000) return CORRECTIVE_ACTION_DUE_STATUS.DUE_SOON;
  return CORRECTIVE_ACTION_DUE_STATUS.ON_TRACK;
};

const withDueStatus = (ca) => {
  const obj = ca.toObject ? ca.toObject() : ca;
  return { ...obj, dueStatus: computeDueStatus(ca) };
};

// @desc List corrective actions
// @route GET /api/corrective-actions
exports.listCorrectiveActions = async (req, res) => {
  const { finding, engagement, status } = req.query;
  const filter = {};

  if (engagement) {
    const { engagement: eng, error, status: errStatus } = await loadEngagementForAccess(req, engagement);
    if (error) return res.status(errStatus || 400).json({ success: false, message: error });
    filter.engagement = eng._id;
  } else if (req.user.role === "sales") {
    filter.engagement = { $in: await ownedEngagementIds(req.user) };
  }
  if (finding) { if (!isValidObjectId(finding)) return res.status(400).json({ success: false, message: "Invalid finding id." }); filter.finding = finding; }
  if (status) { if (!ALL_CORRECTIVE_ACTION_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid status." }); filter.status = status; }

  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    CorrectiveAction.find(filter).populate("finding", "findingNumber title").populate("responsiblePerson", "name email").sort({ dueDate: 1, createdAt: -1 }).skip(skip).limit(limit),
    CorrectiveAction.countDocuments(filter),
  ]);

  res.json({ success: true, data: items.map(withDueStatus), pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get a single corrective action
// @route GET /api/corrective-actions/:id
exports.getCorrectiveAction = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid corrective action id." });
  const ca = await CorrectiveAction.findById(req.params.id)
    .populate("finding", "findingNumber title type").populate("responsiblePerson", "name email").populate("verifiedBy", "name email")
    .populate("evidence.document", "originalFilename documentType").populate("evidence.linkedBy", "name");
  if (!ca) return res.status(404).json({ success: false, message: "Corrective action not found." });

  const engagement = await IsoEngagement.findById(ca.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this corrective action." });

  res.json({ success: true, data: withDueStatus(ca) });
};

// @desc Create a corrective action for a finding
// @route POST /api/corrective-actions
exports.createCorrectiveAction = async (req, res) => {
  const { finding: findingId } = req.body;
  if (!findingId || !isValidObjectId(findingId)) return res.status(400).json({ success: false, message: "A valid finding is required." });
  const finding = await AuditFinding.findById(findingId);
  if (!finding) return res.status(404).json({ success: false, message: "Finding not found." });

  const engagement = await IsoEngagement.findOne({ _id: finding.engagement, isArchived: false });
  if (!engagement) return res.status(404).json({ success: false, message: "Engagement not found." });
  if (!canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this finding." });

  if (req.body.dueDate && isNaN(Date.parse(req.body.dueDate))) return res.status(400).json({ success: false, message: "Invalid due date." });

  const actionNumber = await nextNumber("corrective-action", "CAPA");
  const ca = await CorrectiveAction.create({
    actionNumber, finding: finding._id, engagement: engagement._id,
    rootCause: req.body.rootCause, correction: req.body.correction, correctiveAction: req.body.correctiveAction,
    responsiblePerson: req.body.responsiblePerson, dueDate: req.body.dueDate,
    createdBy: req.user._id,
  });

  await ComplianceHistory.create({ entityType: "CorrectiveAction", entityId: ca._id, toStatus: ca.status, action: "CREATED", performedBy: req.user._id });

  if (ca.responsiblePerson && String(ca.responsiblePerson) !== String(req.user._id)) {
    await createNotification({
      recipient: ca.responsiblePerson, type: NOTIFICATION_TYPE.CORRECTIVE_ACTION_ASSIGNED,
      title: `Corrective action ${ca.actionNumber} assigned to you`, message: `For finding ${finding.findingNumber}.`,
      entityType: "CorrectiveAction", entityId: ca._id, severity: NOTIFICATION_SEVERITY.WARNING,
    }).catch((err) => logger.error(`Corrective action assigned notification failed: ${err.message}`));
  }

  res.status(201).json({ success: true, data: withDueStatus(ca) });
};

// @desc Update corrective action (non-workflow fields)
// @route PATCH /api/corrective-actions/:id
exports.updateCorrectiveAction = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid corrective action id." });
  const ca = await CorrectiveAction.findById(req.params.id);
  if (!ca) return res.status(404).json({ success: false, message: "Corrective action not found." });
  const engagement = await IsoEngagement.findById(ca.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this corrective action." });

  if (req.body.dueDate && isNaN(Date.parse(req.body.dueDate))) return res.status(400).json({ success: false, message: "Invalid due date." });

  const { status, actionNumber, finding, engagement: _e, verifiedAt, verifiedBy, completedAt, evidence, ...safeBody } = req.body;
  Object.assign(ca, safeBody);
  await ca.save();
  res.json({ success: true, data: withDueStatus(ca) });
};

// @desc Controlled status transition (separation of duties: completion by
//       responsiblePerson is never the same event as verification)
// @route POST /api/corrective-actions/:id/transition
exports.transitionCorrectiveAction = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid corrective action id." });
  const { action, comment } = req.body;
  const ca = await CorrectiveAction.findById(req.params.id);
  if (!ca) return res.status(404).json({ success: false, message: "Corrective action not found." });
  const engagement = await IsoEngagement.findById(ca.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this corrective action." });

  const isResponsible = (u) => String(ca.responsiblePerson || "") === String(u._id);
  const result = evaluateTransition("CorrectiveAction", ca, action, req.user, comment, (c, u) => isResponsible(u));
  if (result.error) return res.status(400).json({ success: false, message: result.error });

  if (action === "SUBMIT") ca.completedAt = new Date();
  if (action === "VERIFY_EFFECTIVE" || action === "VERIFY_INEFFECTIVE") {
    ca.verifiedAt = new Date();
    ca.verifiedBy = req.user._id;
    ca.verificationNotes = comment || ca.verificationNotes;
  }
  await ca.save();
  await ComplianceHistory.create({ entityType: "CorrectiveAction", entityId: ca._id, fromStatus: result.fromStatus, toStatus: result.toStatus, action, performedBy: req.user._id, comment });

  if ((action === "VERIFY_EFFECTIVE" || action === "VERIFY_INEFFECTIVE") && ca.responsiblePerson && String(ca.responsiblePerson) !== String(req.user._id)) {
    const effective = action === "VERIFY_EFFECTIVE";
    await createNotification({
      recipient: ca.responsiblePerson, type: NOTIFICATION_TYPE.CORRECTIVE_ACTION_ASSIGNED,
      title: `Corrective action ${ca.actionNumber} verified ${effective ? "effective" : "ineffective"}`,
      message: comment || (effective ? "Verified by " + req.user.name + "." : "Needs further work - see verification notes."),
      entityType: "CorrectiveAction", entityId: ca._id,
      severity: effective ? NOTIFICATION_SEVERITY.INFO : NOTIFICATION_SEVERITY.WARNING,
    }).catch((err) => logger.error(`Corrective action verification notification failed: ${err.message}`));
  }

  res.json({ success: true, data: { _id: ca._id, status: ca.status, dueStatus: computeDueStatus(ca) } });
};

// @desc Corrective action workflow history
// @route GET /api/corrective-actions/:id/history
exports.getCorrectiveActionHistory = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid corrective action id." });
  const ca = await CorrectiveAction.findById(req.params.id);
  if (!ca) return res.status(404).json({ success: false, message: "Corrective action not found." });
  const engagement = await IsoEngagement.findById(ca.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this corrective action." });

  const history = await ComplianceHistory.find({ entityType: "CorrectiveAction", entityId: ca._id }).populate("performedBy", "name email role").sort({ performedAt: 1 });
  res.json({ success: true, data: history });
};

// @desc Link existing evidence document
// @route POST /api/corrective-actions/:id/evidence
exports.addCorrectiveActionEvidence = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid corrective action id." });
  const ca = await CorrectiveAction.findById(req.params.id);
  if (!ca) return res.status(404).json({ success: false, message: "Corrective action not found." });
  const engagement = await IsoEngagement.findById(ca.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this corrective action." });

  const result = await linkEvidence(ca, req.body.documentId, req.user, req.body.note);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  await ca.save();
  res.status(201).json({ success: true, data: ca.evidence });
};

// @desc Unlink evidence document
// @route DELETE /api/corrective-actions/:id/evidence/:documentId
exports.removeCorrectiveActionEvidence = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid corrective action id." });
  const ca = await CorrectiveAction.findById(req.params.id);
  if (!ca) return res.status(404).json({ success: false, message: "Corrective action not found." });
  const engagement = await IsoEngagement.findById(ca.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this corrective action." });

  unlinkEvidence(ca, req.params.documentId);
  await ca.save();
  res.json({ success: true, data: ca.evidence });
};
