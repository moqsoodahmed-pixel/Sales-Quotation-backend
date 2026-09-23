const ComplianceAssessment = require("../models/ComplianceAssessment");
const IsoEngagement = require("../models/IsoEngagement");
const IsoClause = require("../models/IsoClause");
const { isValidObjectId } = require("../utils/validators");
const { canAccessEngagement, ownedEngagementIds } = require("../utils/isoOwnership");
const { linkEvidence, unlinkEvidence } = require("../utils/complianceEvidence");
const { ALL_ASSESSMENT_STATUSES, ALL_RISK_LEVELS } = require("../config/isoComplianceEnums");

const loadEngagementForAccess = async (req, engagementId) => {
  if (!engagementId || !isValidObjectId(engagementId)) return { error: "A valid engagement is required." };
  const engagement = await IsoEngagement.findOne({ _id: engagementId, isArchived: false });
  if (!engagement) return { error: "Engagement not found.", status: 404 };
  if (!canAccessEngagement(req.user, engagement)) return { error: "You do not have access to this engagement.", status: 403 };
  return { engagement };
};

// @desc List assessments (typically filtered by engagement)
// @route GET /api/compliance-assessments
exports.listAssessments = async (req, res) => {
  const { engagement, status, riskLevel } = req.query;
  const filter = {};

  if (engagement) {
    const { engagement: eng, error, status: errStatus } = await loadEngagementForAccess(req, engagement);
    if (error) return res.status(errStatus || 400).json({ success: false, message: error });
    filter.engagement = eng._id;
  } else if (req.user.role === "sales") {
    filter.engagement = { $in: await ownedEngagementIds(req.user) };
  }

  if (status) { if (!ALL_ASSESSMENT_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid status." }); filter.status = status; }
  if (riskLevel) { if (!ALL_RISK_LEVELS.includes(riskLevel)) return res.status(400).json({ success: false, message: "Invalid risk level." }); filter.riskLevel = riskLevel; }

  const items = await ComplianceAssessment.find(filter)
    .populate("clause", "clauseNumber title level")
    .populate("owner", "name email")
    .populate("assessedBy", "name email")
    .sort({ "clause.clauseNumber": 1 });

  res.json({ success: true, data: items });
};

// @desc Get a single assessment
// @route GET /api/compliance-assessments/:id
exports.getAssessment = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid assessment id." });
  const assessment = await ComplianceAssessment.findById(req.params.id)
    .populate("clause", "clauseNumber title description")
    .populate("owner", "name email")
    .populate("assessedBy", "name email")
    .populate("evidence.document", "originalFilename documentType mimeType")
    .populate("evidence.linkedBy", "name");
  if (!assessment) return res.status(404).json({ success: false, message: "Assessment not found." });

  const engagement = await IsoEngagement.findById(assessment.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this assessment." });

  res.json({ success: true, data: assessment });
};

// @desc Create an assessment for one clause of one engagement
// @route POST /api/compliance-assessments
exports.createAssessment = async (req, res) => {
  const { engagement: engagementId, clause: clauseId } = req.body;
  const { engagement, error, status } = await loadEngagementForAccess(req, engagementId);
  if (error) return res.status(status || 400).json({ success: false, message: error });

  if (!clauseId || !isValidObjectId(clauseId)) return res.status(400).json({ success: false, message: "A valid clause is required." });
  const clause = await IsoClause.findById(clauseId);
  if (!clause) return res.status(404).json({ success: false, message: "Clause not found." });
  if (String(clause.isoStandard) !== String(engagement.isoStandard)) {
    return res.status(400).json({ success: false, message: "This clause does not belong to the engagement's ISO standard." });
  }

  const existing = await ComplianceAssessment.findOne({ engagement: engagement._id, clause: clause._id });
  if (existing) return res.status(400).json({ success: false, message: "An assessment already exists for this clause - update it instead." });

  const { status: bodyStatus, riskLevel, targetDate } = req.body;
  if (bodyStatus && !ALL_ASSESSMENT_STATUSES.includes(bodyStatus)) return res.status(400).json({ success: false, message: "Invalid status." });
  if (riskLevel && !ALL_RISK_LEVELS.includes(riskLevel)) return res.status(400).json({ success: false, message: "Invalid risk level." });
  if (targetDate && isNaN(Date.parse(targetDate))) return res.status(400).json({ success: false, message: "Invalid target date." });

  const assessment = await ComplianceAssessment.create({
    engagement: engagement._id, clause: clause._id,
    status: bodyStatus, assessment: req.body.assessment, gapDescription: req.body.gapDescription,
    riskLevel, owner: req.body.owner, targetDate, notes: req.body.notes,
    assessedBy: bodyStatus && bodyStatus !== "NOT_ASSESSED" ? req.user._id : undefined,
    assessedAt: bodyStatus && bodyStatus !== "NOT_ASSESSED" ? new Date() : undefined,
  });

  res.status(201).json({ success: true, data: assessment });
};

// @desc Update an assessment - this IS the human judgement call; a status
//       is never derived automatically from evidence being attached.
// @route PATCH /api/compliance-assessments/:id
exports.updateAssessment = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid assessment id." });
  const assessment = await ComplianceAssessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ success: false, message: "Assessment not found." });

  const engagement = await IsoEngagement.findById(assessment.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this assessment." });

  const { status, riskLevel, targetDate, engagement: _e, clause: _c, evidence: _ev, ...safeBody } = req.body;
  if (status && !ALL_ASSESSMENT_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid status." });
  if (riskLevel && !ALL_RISK_LEVELS.includes(riskLevel)) return res.status(400).json({ success: false, message: "Invalid risk level." });
  if (targetDate && isNaN(Date.parse(targetDate))) return res.status(400).json({ success: false, message: "Invalid target date." });

  Object.assign(assessment, safeBody);
  if (riskLevel !== undefined) assessment.riskLevel = riskLevel;
  if (targetDate !== undefined) assessment.targetDate = targetDate;
  if (status && status !== assessment.status) {
    assessment.status = status;
    assessment.assessedBy = req.user._id;
    assessment.assessedAt = new Date();
  }
  await assessment.save();

  res.json({ success: true, data: assessment });
};

// @desc Link existing evidence document
// @route POST /api/compliance-assessments/:id/evidence
exports.addAssessmentEvidence = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid assessment id." });
  const assessment = await ComplianceAssessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ success: false, message: "Assessment not found." });

  const engagement = await IsoEngagement.findById(assessment.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this assessment." });

  const result = await linkEvidence(assessment, req.body.documentId, req.user, req.body.note);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  await assessment.save();
  res.status(201).json({ success: true, data: assessment.evidence });
};

// @desc Unlink evidence document
// @route DELETE /api/compliance-assessments/:id/evidence/:documentId
exports.removeAssessmentEvidence = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid assessment id." });
  const assessment = await ComplianceAssessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ success: false, message: "Assessment not found." });

  const engagement = await IsoEngagement.findById(assessment.engagement);
  if (!engagement || !canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this assessment." });

  unlinkEvidence(assessment, req.params.documentId);
  await assessment.save();
  res.json({ success: true, data: assessment.evidence });
};
