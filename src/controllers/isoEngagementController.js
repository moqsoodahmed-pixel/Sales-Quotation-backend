const IsoEngagement = require("../models/IsoEngagement");
const ComplianceHistory = require("../models/ComplianceHistory");
const ComplianceAssessment = require("../models/ComplianceAssessment");
const Audit = require("../models/Audit");
const AuditFinding = require("../models/AuditFinding");
const CorrectiveAction = require("../models/CorrectiveAction");
const Customer = require("../models/Customer");
const IsoStandard = require("../models/IsoStandard");
const Service = require("../models/Service");
const Enquiry = require("../models/Enquiry");
const Quotation = require("../models/Quotation");
const { nextNumber } = require("../utils/sequence");
const { isValidObjectId, parsePagination } = require("../utils/validators");
const { canAccessEngagement, ownedEngagementIds } = require("../utils/isoOwnership");
const { evaluateTransition } = require("../utils/complianceWorkflow");
const { ALL_ENGAGEMENT_STATUSES, ENGAGEMENT_STATUS, CERTIFICATION_DISCLAIMER, DUE_SOON_WINDOW_DAYS } = require("../config/isoComplianceEnums");
const { createNotification } = require("../utils/notificationService");
const { NOTIFICATION_TYPE, NOTIFICATION_SEVERITY } = require("../config/notificationEnums");
const logger = require("../utils/logger");

const buildFilter = async (req) => {
  const filter = { isArchived: false };
  if (req.user.role === "sales") {
    filter._id = { $in: await ownedEngagementIds(req.user) };
  }
  const { customer, isoStandard, status, assignedTo, search } = req.query;
  if (customer) { if (!isValidObjectId(customer)) return null; filter.customer = customer; }
  if (isoStandard) { if (!isValidObjectId(isoStandard)) return null; filter.isoStandard = isoStandard; }
  if (status) { if (!ALL_ENGAGEMENT_STATUSES.includes(status)) return null; filter.status = status; }
  if (assignedTo && req.user.role !== "sales") { if (!isValidObjectId(assignedTo)) return null; filter.assignedTo = assignedTo; }
  if (search) {
    const rx = { $regex: String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ engagementNumber: rx }, { title: rx }];
  }
  return filter;
};

// @desc List ISO engagements
// @route GET /api/iso-engagements
exports.listEngagements = async (req, res) => {
  const filter = await buildFilter(req);
  if (!filter) return res.status(400).json({ success: false, message: "Invalid filter parameter." });

  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    IsoEngagement.find(filter)
      .populate("customer", "customerNumber companyName")
      .populate("isoStandard", "standardCode standardName edition")
      .populate("assignedTo", "name email role")
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    IsoEngagement.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, disclaimer: CERTIFICATION_DISCLAIMER, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get single engagement
// @route GET /api/iso-engagements/:id
exports.getEngagement = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid engagement id." });
  const engagement = await IsoEngagement.findOne({ _id: req.params.id, isArchived: false })
    .populate("customer", "customerNumber companyName email phone")
    .populate("isoStandard", "standardCode standardName edition family")
    .populate("service", "name serviceCode")
    .populate("enquiry", "enquiryNumber subject")
    .populate("quotation", "quotNo status total")
    .populate("assignedTo", "name email role")
    .populate("createdBy", "name email");
  if (!engagement) return res.status(404).json({ success: false, message: "Engagement not found." });
  if (!canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this engagement." });

  res.json({ success: true, data: engagement, disclaimer: CERTIFICATION_DISCLAIMER });
};

// @desc Create an ISO engagement
// @route POST /api/iso-engagements
exports.createEngagement = async (req, res) => {
  const { customerId, isoStandardId, serviceId, enquiryId, quotationId, title } = req.body;

  if (!title) return res.status(400).json({ success: false, message: "Title is required." });
  if (!customerId || !isValidObjectId(customerId)) return res.status(400).json({ success: false, message: "A valid customer is required." });
  if (!isoStandardId || !isValidObjectId(isoStandardId)) return res.status(400).json({ success: false, message: "A valid ISO standard is required." });

  const customer = await Customer.findOne({ _id: customerId, isArchived: false });
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
  const isoStandard = await IsoStandard.findById(isoStandardId);
  if (!isoStandard) return res.status(404).json({ success: false, message: "ISO standard not found." });

  if (req.user.role === "sales") {
    const uid = String(req.user._id);
    const owns = String(customer.assignedTo || "") === uid || String(customer.createdBy) === uid;
    if (!owns) return res.status(403).json({ success: false, message: "You do not have access to this customer." });
  }

  let service = null;
  if (serviceId) {
    if (!isValidObjectId(serviceId)) return res.status(400).json({ success: false, message: "Invalid service id." });
    service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ success: false, message: "Service not found." });
    // Only enforced when the service actually has a standard set (Phase 3
    // catalogue services aren't all ISO-linked) - see Phase 7 report §C.
    if (service.standard && String(service.standard) !== String(isoStandard._id)) {
      return res.status(400).json({ success: false, message: "This service is linked to a different ISO standard than the one selected." });
    }
  }

  let enquiry = null;
  if (enquiryId) {
    if (!isValidObjectId(enquiryId)) return res.status(400).json({ success: false, message: "Invalid enquiry id." });
    enquiry = await Enquiry.findOne({ _id: enquiryId, isArchived: false });
    if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found." });
    if (enquiry.customer && String(enquiry.customer) !== String(customer._id)) {
      return res.status(400).json({ success: false, message: "This enquiry belongs to a different customer." });
    }
  }

  let quotation = null;
  if (quotationId) {
    if (!isValidObjectId(quotationId)) return res.status(400).json({ success: false, message: "Invalid quotation id." });
    quotation = await Quotation.findOne({ _id: quotationId, isDeleted: false });
    if (!quotation) return res.status(404).json({ success: false, message: "Quotation not found." });
    if (quotation.customer && String(quotation.customer) !== String(customer._id)) {
      return res.status(400).json({ success: false, message: "This quotation belongs to a different customer." });
    }
  }

  for (const [label, val] of [["targetCertificationDate", req.body.targetCertificationDate], ["startDate", req.body.startDate], ["expectedCompletionDate", req.body.expectedCompletionDate]]) {
    if (val && isNaN(Date.parse(val))) return res.status(400).json({ success: false, message: `Invalid ${label}.` });
  }

  const engagementNumber = await nextNumber("iso-engagement", "ISO");
  const engagement = await IsoEngagement.create({
    engagementNumber, title,
    scope: req.body.scope, locations: req.body.locations,
    customer: customer._id, isoStandard: isoStandard._id, service: service?._id, enquiry: enquiry?._id, quotation: quotation?._id,
    targetCertificationDate: req.body.targetCertificationDate, startDate: req.body.startDate, expectedCompletionDate: req.body.expectedCompletionDate,
    assignedTo: req.body.assignedTo || (req.user.role === "sales" ? req.user._id : undefined),
    createdBy: req.user._id,
  });

  await ComplianceHistory.create({ entityType: "IsoEngagement", entityId: engagement._id, toStatus: engagement.status, action: "CREATED", performedBy: req.user._id });
  logger.info(`ISO engagement created: ${engagementNumber} by ${req.user.email}`);
  res.status(201).json({ success: true, data: engagement, disclaimer: CERTIFICATION_DISCLAIMER });
};

// @desc Update engagement (non-workflow fields only)
// @route PATCH /api/iso-engagements/:id
exports.updateEngagement = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid engagement id." });
  const engagement = await IsoEngagement.findOne({ _id: req.params.id, isArchived: false });
  if (!engagement) return res.status(404).json({ success: false, message: "Engagement not found." });
  if (!canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this engagement." });

  const { status, engagementNumber, customer, isoStandard, createdBy, evidence, ...safeBody } = req.body;
  for (const [label, val] of [["targetCertificationDate", safeBody.targetCertificationDate], ["startDate", safeBody.startDate], ["expectedCompletionDate", safeBody.expectedCompletionDate]]) {
    if (val && isNaN(Date.parse(val))) return res.status(400).json({ success: false, message: `Invalid ${label}.` });
  }

  Object.assign(engagement, safeBody);
  await engagement.save();
  res.json({ success: true, data: engagement });
};

// @desc Controlled status transition
// @route POST /api/iso-engagements/:id/transition
exports.transitionEngagement = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid engagement id." });
  const { action, comment } = req.body;
  const engagement = await IsoEngagement.findOne({ _id: req.params.id, isArchived: false });
  if (!engagement) return res.status(404).json({ success: false, message: "Engagement not found." });
  if (!canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this engagement." });

  const isOwner = (id) => String(engagement.assignedTo || "") === String(id) || String(engagement.createdBy) === String(id);
  const result = evaluateTransition("IsoEngagement", engagement, action, req.user, comment, (e, u) => isOwner(u._id));
  if (result.error) return res.status(400).json({ success: false, message: result.error });

  if (action === "COMPLETE") engagement.actualCompletionDate = new Date();
  await engagement.save();
  await ComplianceHistory.create({ entityType: "IsoEngagement", entityId: engagement._id, fromStatus: result.fromStatus, toStatus: result.toStatus, action, performedBy: req.user._id, comment });

  // Notify the assignee when someone else changes the engagement's status -
  // never self-notify the actor who just made the change.
  if (engagement.assignedTo && String(engagement.assignedTo) !== String(req.user._id)) {
    await createNotification({
      recipient: engagement.assignedTo, type: NOTIFICATION_TYPE.ENGAGEMENT_STATUS_CHANGED,
      title: `${engagement.engagementNumber} status changed to ${result.toStatus}`,
      message: `Changed by ${req.user.name}.`, entityType: "IsoEngagement", entityId: engagement._id,
      severity: NOTIFICATION_SEVERITY.INFO,
    }).catch((err) => logger.error(`Engagement status notification failed: ${err.message}`));
  }

  res.json({ success: true, data: { _id: engagement._id, status: engagement.status } });
};

// @desc Append-only workflow history for this engagement
// @route GET /api/iso-engagements/:id/history
exports.getEngagementHistory = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid engagement id." });
  const engagement = await IsoEngagement.findOne({ _id: req.params.id, isArchived: false });
  if (!engagement) return res.status(404).json({ success: false, message: "Engagement not found." });
  if (!canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this engagement." });

  const history = await ComplianceHistory.find({ entityType: "IsoEngagement", entityId: engagement._id }).populate("performedBy", "name email role").sort({ performedAt: 1 });
  res.json({ success: true, data: history });
};

// @desc Engagement-level compliance dashboard. All counts are plain
// aggregations of what's actually stored - there is no AI/automated
// "certification probability" here (see CERTIFICATION_DISCLAIMER). The one
// percentage shown is explicitly labelled and its formula is returned
// alongside it so the UI never presents an unexplained number.
// @route GET /api/iso-engagements/:id/dashboard
exports.getEngagementDashboard = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid engagement id." });
  const engagement = await IsoEngagement.findOne({ _id: req.params.id, isArchived: false })
    .populate("customer", "customerNumber companyName")
    .populate("isoStandard", "standardCode standardName edition");
  if (!engagement) return res.status(404).json({ success: false, message: "Engagement not found." });
  if (!canAccessEngagement(req.user, engagement)) return res.status(403).json({ success: false, message: "You do not have access to this engagement." });

  const [assessmentCounts, auditTotal, findingCounts, caRecords, evidenceCount] = await Promise.all([
    ComplianceAssessment.aggregate([{ $match: { engagement: engagement._id } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Audit.countDocuments({ engagement: engagement._id }),
    AuditFinding.aggregate([{ $match: { engagement: engagement._id } }, { $group: { _id: { status: "$status", type: "$type" }, count: { $sum: 1 } } }]),
    CorrectiveAction.find({ engagement: engagement._id }).select("status dueDate"),
    ComplianceAssessment.aggregate([{ $match: { engagement: engagement._id } }, { $project: { n: { $size: "$evidence" } } }, { $group: { _id: null, total: { $sum: "$n" } } }]),
  ]);

  const compliance = { NOT_ASSESSED: 0, COMPLIANT: 0, PARTIALLY_COMPLIANT: 0, NON_COMPLIANT: 0, NOT_APPLICABLE: 0 };
  assessmentCounts.forEach((c) => { compliance[c._id] = c.count; });
  const assessable = compliance.COMPLIANT + compliance.PARTIALLY_COMPLIANT + compliance.NON_COMPLIANT;
  const compliancePercent = assessable > 0 ? Math.round((compliance.COMPLIANT / assessable) * 100) : null;

  const findingSummary = { total: 0, open: 0, majorNonconformity: 0, minorNonconformity: 0, observation: 0, closed: 0 };
  findingCounts.forEach((f) => {
    findingSummary.total += f.count;
    if (f._id.status === "CLOSED") findingSummary.closed += f.count;
    else findingSummary.open += f.count;
    if (f._id.type === "MAJOR_NONCONFORMITY") findingSummary.majorNonconformity += f.count;
    if (f._id.type === "MINOR_NONCONFORMITY") findingSummary.minorNonconformity += f.count;
    if (f._id.type === "OBSERVATION") findingSummary.observation += f.count;
  });

  const now = Date.now();
  const caSummary = { open: 0, inProgress: 0, verification: 0, overdue: 0, closed: 0 };
  caRecords.forEach((ca) => {
    if (ca.status === "CLOSED") caSummary.closed++;
    else if (ca.status === "OPEN") caSummary.open++;
    else if (["IN_PROGRESS", "SUBMITTED", "INEFFECTIVE"].includes(ca.status)) caSummary.inProgress++;
    else if (ca.status === "VERIFICATION") caSummary.verification++;
    if (!["EFFECTIVE", "CLOSED"].includes(ca.status) && ca.dueDate && new Date(ca.dueDate).getTime() < now) caSummary.overdue++;
  });

  res.json({
    success: true,
    disclaimer: CERTIFICATION_DISCLAIMER,
    data: {
      engagement: { _id: engagement._id, engagementNumber: engagement.engagementNumber, title: engagement.title, status: engagement.status, customer: engagement.customer, isoStandard: engagement.isoStandard, targetCertificationDate: engagement.targetCertificationDate },
      compliance: {
        ...compliance,
        totalClauses: Object.values(compliance).reduce((s, n) => s + n, 0),
        compliancePercent,
        compliancePercentFormula: "COMPLIANT / (COMPLIANT + PARTIALLY_COMPLIANT + NON_COMPLIANT) - excludes NOT_ASSESSED and NOT_APPLICABLE. This is an assessment completion/compliance indicator, not a certification probability.",
      },
      findings: findingSummary,
      correctiveActions: caSummary,
      audits: { total: auditTotal },
      evidenceLinked: evidenceCount[0]?.total || 0,
    },
  });
};
