const Lead = require("../models/Lead");
const Customer = require("../models/Customer");
const Enquiry = require("../models/Enquiry");
const Quotation = require("../models/Quotation");
const IsoEngagement = require("../models/IsoEngagement");
const ComplianceAssessment = require("../models/ComplianceAssessment");
const Audit = require("../models/Audit");
const AuditFinding = require("../models/AuditFinding");
const CorrectiveAction = require("../models/CorrectiveAction");
const User = require("../models/User");
const { resolveDateRange, trendGranularity } = require("../utils/dateRange");
const { salesOwnedFilter } = require("../utils/salesScope");
const { ownedEngagementIds } = require("../utils/isoOwnership");
const {
  ALL_ENGAGEMENT_STATUSES, ALL_ASSESSMENT_STATUSES, ALL_AUDIT_STATUSES,
  ALL_FINDING_STATUSES, ALL_FINDING_TYPES, ALL_CORRECTIVE_ACTION_STATUSES,
} = require("../config/isoComplianceEnums");
const { ALL_STATUSES: ALL_QUOTATION_STATUSES, STATUS: Q } = require("../config/quotationStatus");
const { LEAD_STATUSES, CUSTOMER_STATUSES, ENQUIRY_STATUSES } = require("../config/crmEnums");

const withDateRange = (req, res) => {
  const r = resolveDateRange(req.query);
  if (r.error) { res.status(400).json({ success: false, message: r.error }); return null; }
  return r;
};

const zeroed = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));

// @desc High-level operational KPI cards
// @route GET /api/dashboard/summary
exports.getSummary = async (req, res) => {
  const range = withDateRange(req, res);
  if (!range) return;
  const { start, end } = range;
  const scope = salesOwnedFilter(req.user);
  const dateFilter = { createdAt: { $gte: start, $lte: end } };

  const [
    totalLeads, newLeads, convertedLeads,
    totalCustomers,
    openEnquiries,
    activeQuotations, acceptedQuotations,
    activeEngagements,
    overdueLeadFollowUps, overdueEnquiryFollowUps,
  ] = await Promise.all([
    Lead.countDocuments({ ...scope, isArchived: false }),
    Lead.countDocuments({ ...scope, isArchived: false, ...dateFilter }),
    Lead.countDocuments({ ...scope, isArchived: false, status: "CONVERTED", ...dateFilter }),
    Customer.countDocuments({ ...scope, isArchived: false }),
    Enquiry.countDocuments({ ...scope, isArchived: false, status: { $in: ["NEW", "IN_PROGRESS", "QUALIFIED", "PROPOSAL_REQUIRED"] } }),
    Quotation.countDocuments({ ...scope, isDeleted: false, status: { $in: [Q.DRAFT, Q.INTERNAL_REVIEW, Q.APPROVED, Q.SENT] } }),
    Quotation.aggregate([
      { $match: { ...scope, isDeleted: false, status: Q.CUSTOMER_ACCEPTED } },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$total" } } },
    ]),
    IsoEngagement.countDocuments({ ...scope, isArchived: false, status: { $nin: ["COMPLETED", "CANCELLED"] } }),
    Lead.countDocuments({ ...scope, isArchived: false, nextFollowUpAt: { $lt: new Date() } }),
    Enquiry.countDocuments({ ...scope, isArchived: false, nextFollowUpAt: { $lt: new Date() } }),
  ]);
  const overdueFollowUps = overdueLeadFollowUps + overdueEnquiryFollowUps;

  res.json({
    success: true,
    range: { start: range.start, end: range.end, label: range.label },
    data: {
      leads: { total: totalLeads, new: newLeads, converted: convertedLeads },
      customers: { total: totalCustomers },
      enquiries: { open: openEnquiries },
      quotations: { active: activeQuotations, accepted: acceptedQuotations[0]?.count || 0, acceptedValue: acceptedQuotations[0]?.value || 0 },
      isoEngagements: { active: activeEngagements },
      followUps: { overdue: overdueFollowUps },
    },
  });
};

// @desc Quotation pipeline, commercial values and acceptance rate
// @route GET /api/dashboard/quotations
exports.getQuotationAnalytics = async (req, res) => {
  const range = withDateRange(req, res);
  if (!range) return;
  const scope = salesOwnedFilter(req.user);
  const filter = { ...scope, isDeleted: false, createdAt: { $gte: range.start, $lte: range.end } };

  const byStatus = await Quotation.aggregate([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 }, value: { $sum: "$total" } } },
  ]);
  const pipeline = zeroed(ALL_QUOTATION_STATUSES);
  const pipelineValue = zeroed(ALL_QUOTATION_STATUSES);
  byStatus.forEach((s) => { if (s._id in pipeline) { pipeline[s._id] = s.count; pipelineValue[s._id] = s.value; } });

  const totalCount = byStatus.reduce((sum, s) => sum + s.count, 0);
  const totalValue = byStatus.reduce((sum, s) => sum + (s.value || 0), 0);

  // Acceptance rate: accepted / (quotations that actually reached the
  // customer, i.e. SENT or later) - Draft/Internal Review/Approved/Cancelled
  // quotations were never offered to a customer, so including them in the
  // denominator would understate the rate.
  const sentOrBeyond = pipeline[Q.SENT] + pipeline[Q.CUSTOMER_ACCEPTED] + pipeline[Q.CUSTOMER_REJECTED] + pipeline[Q.EXPIRED];
  const acceptanceRate = sentOrBeyond > 0 ? Math.round((pipeline[Q.CUSTOMER_ACCEPTED] / sentOrBeyond) * 100) : null;
  const averageQuotationValue = totalCount > 0 ? Math.round((totalValue / totalCount) * 100) / 100 : 0;

  res.json({
    success: true,
    range: { start: range.start, end: range.end, label: range.label },
    data: {
      pipeline, pipelineValue, totalCount, totalValue,
      acceptanceRate,
      acceptanceRateFormula: "CUSTOMER_ACCEPTED / (SENT + CUSTOMER_ACCEPTED + CUSTOMER_REJECTED + EXPIRED) - quotations that never reached the customer (Draft/Internal Review/Approved/Cancelled) are excluded from the denominator.",
      averageQuotationValue,
      note: "These are quotation totals, not realized revenue.",
    },
  });
};

// @desc CRM analytics: leads, customers, enquiries, follow-ups
// @route GET /api/dashboard/crm
exports.getCrmAnalytics = async (req, res) => {
  const range = withDateRange(req, res);
  if (!range) return;
  const scope = salesOwnedFilter(req.user);
  const dateFilter = { createdAt: { $gte: range.start, $lte: range.end } };

  const [leadsByStatus, customersByStatus, enquiriesByStatus, now] = await Promise.all([
    Lead.aggregate([{ $match: { ...scope, isArchived: false, ...dateFilter } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Customer.aggregate([{ $match: { ...scope, isArchived: false, ...dateFilter } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Enquiry.aggregate([{ $match: { ...scope, isArchived: false, ...dateFilter } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Promise.resolve(new Date()),
  ]);

  const leads = zeroed(LEAD_STATUSES);
  leadsByStatus.forEach((s) => { if (s._id in leads) leads[s._id] = s.count; });
  const leadsCreated = Object.values(leads).reduce((a, b) => a + b, 0);
  // Conversion rate excludes leads still in-flight (NEW/CONTACTED/QUALIFIED)
  // from the denominator's "lost" side but keeps them out entirely - only
  // leads that reached a terminal outcome (CONVERTED/UNQUALIFIED/LOST) are
  // "eligible" for a conversion-rate calculation; an in-progress lead hasn't
  // failed to convert, it just hasn't been decided yet.
  const eligibleLeads = leads.CONVERTED + leads.UNQUALIFIED + leads.LOST;
  const leadConversionRate = eligibleLeads > 0 ? Math.round((leads.CONVERTED / eligibleLeads) * 100) : null;

  const customers = zeroed(CUSTOMER_STATUSES);
  customersByStatus.forEach((s) => { if (s._id in customers) customers[s._id] = s.count; });

  const enquiries = zeroed(ENQUIRY_STATUSES);
  enquiriesByStatus.forEach((s) => { if (s._id in enquiries) enquiries[s._id] = s.count; });
  const openEnquiries = enquiries.NEW + enquiries.IN_PROGRESS + enquiries.QUALIFIED + enquiries.PROPOSAL_REQUIRED;

  const [overdueLeads, todayLeads, upcomingLeads, overdueEnq, todayEnq, upcomingEnq] = await Promise.all([
    Lead.countDocuments({ ...scope, isArchived: false, nextFollowUpAt: { $lt: startOfToday(now) } }),
    Lead.countDocuments({ ...scope, isArchived: false, nextFollowUpAt: { $gte: startOfToday(now), $lte: endOfToday(now) } }),
    Lead.countDocuments({ ...scope, isArchived: false, nextFollowUpAt: { $gt: endOfToday(now) } }),
    Enquiry.countDocuments({ ...scope, isArchived: false, nextFollowUpAt: { $lt: startOfToday(now) } }),
    Enquiry.countDocuments({ ...scope, isArchived: false, nextFollowUpAt: { $gte: startOfToday(now), $lte: endOfToday(now) } }),
    Enquiry.countDocuments({ ...scope, isArchived: false, nextFollowUpAt: { $gt: endOfToday(now) } }),
  ]);

  res.json({
    success: true,
    range: { start: range.start, end: range.end, label: range.label },
    data: {
      leads: { byStatus: leads, created: leadsCreated, conversionRate: leadConversionRate, conversionRateFormula: "CONVERTED / (CONVERTED + UNQUALIFIED + LOST) - leads still NEW/CONTACTED/QUALIFIED are excluded (undecided, not failed)." },
      customers: { byStatus: customers, total: Object.values(customers).reduce((a, b) => a + b, 0) },
      enquiries: { byStatus: enquiries, open: openEnquiries },
      followUps: {
        leads: { overdue: overdueLeads, today: todayLeads, upcoming: upcomingLeads },
        enquiries: { overdue: overdueEnq, today: todayEnq, upcoming: upcomingEnq },
      },
    },
  });
};

const startOfToday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfToday = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

// @desc ISO compliance/audit analytics
// @route GET /api/dashboard/iso
exports.getIsoAnalytics = async (req, res) => {
  const range = withDateRange(req, res);
  if (!range) return;

  const scope = salesOwnedFilter(req.user);
  const dateFilter = { createdAt: { $gte: range.start, $lte: range.end } };
  const engagementIdFilter = req.user.role === "sales" ? { engagement: { $in: await ownedEngagementIds(req.user) } } : {};

  const [engagementsByStatus, assessmentsByStatus, auditsByStatus, findingsByType, findingsByStatus, caByStatus, caRecords] = await Promise.all([
    IsoEngagement.aggregate([{ $match: { ...scope, isArchived: false, ...dateFilter } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ComplianceAssessment.aggregate([{ $match: engagementIdFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Audit.aggregate([{ $match: engagementIdFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    AuditFinding.aggregate([{ $match: engagementIdFilter }, { $group: { _id: "$type", count: { $sum: 1 } } }]),
    AuditFinding.aggregate([{ $match: engagementIdFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    CorrectiveAction.aggregate([{ $match: engagementIdFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    CorrectiveAction.find(engagementIdFilter).select("status dueDate"),
  ]);

  const engagements = zeroed(ALL_ENGAGEMENT_STATUSES);
  engagementsByStatus.forEach((s) => { if (s._id in engagements) engagements[s._id] = s.count; });

  const compliance = zeroed(ALL_ASSESSMENT_STATUSES);
  assessmentsByStatus.forEach((s) => { if (s._id in compliance) compliance[s._id] = s.count; });
  const assessable = compliance.COMPLIANT + compliance.PARTIALLY_COMPLIANT + compliance.NON_COMPLIANT;
  const complianceIndicator = assessable > 0 ? Math.round((compliance.COMPLIANT / assessable) * 100) : null;

  const audits = zeroed(ALL_AUDIT_STATUSES);
  auditsByStatus.forEach((s) => { if (s._id in audits) audits[s._id] = s.count; });

  const findingsByTypeCount = zeroed(ALL_FINDING_TYPES);
  findingsByType.forEach((s) => { if (s._id in findingsByTypeCount) findingsByTypeCount[s._id] = s.count; });
  const findingsByStatusCount = zeroed(ALL_FINDING_STATUSES);
  findingsByStatus.forEach((s) => { if (s._id in findingsByStatusCount) findingsByStatusCount[s._id] = s.count; });

  const correctiveActions = zeroed(ALL_CORRECTIVE_ACTION_STATUSES);
  caByStatus.forEach((s) => { if (s._id in correctiveActions) correctiveActions[s._id] = s.count; });
  const now = Date.now();
  const overdueCA = caRecords.filter((c) => !["EFFECTIVE", "CLOSED"].includes(c.status) && c.dueDate && new Date(c.dueDate).getTime() < now).length;

  res.json({
    success: true,
    range: { start: range.start, end: range.end, label: range.label },
    data: {
      engagements,
      compliance: { ...compliance, complianceIndicator, complianceIndicatorFormula: "COMPLIANT / (COMPLIANT + PARTIALLY_COMPLIANT + NON_COMPLIANT) - excludes NOT_ASSESSED and NOT_APPLICABLE. This is an assessment compliance indicator, not a certification probability." },
      audits,
      findings: { byType: findingsByTypeCount, byStatus: findingsByStatusCount },
      correctiveActions: { ...correctiveActions, overdue: overdueCA },
    },
  });
};

// @desc Time-series trend for quotation count/value/acceptance
// @route GET /api/dashboard/trends
exports.getTrends = async (req, res) => {
  const range = withDateRange(req, res);
  if (!range) return;
  const scope = salesOwnedFilter(req.user);
  const granularity = trendGranularity(range.start, range.end);
  const dateExpr = granularity === "day"
    ? { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } }
    : granularity === "week"
      ? { year: { $isoWeekYear: "$createdAt" }, week: { $isoWeek: "$createdAt" } }
      : { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } };

  const series = await Quotation.aggregate([
    { $match: { ...scope, isDeleted: false, createdAt: { $gte: range.start, $lte: range.end } } },
    { $group: {
      _id: dateExpr,
      count: { $sum: 1 },
      value: { $sum: "$total" },
      acceptedCount: { $sum: { $cond: [{ $eq: ["$status", Q.CUSTOMER_ACCEPTED] }, 1, 0] } },
      acceptedValue: { $sum: { $cond: [{ $eq: ["$status", Q.CUSTOMER_ACCEPTED] }, "$total", 0] } },
    } },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.week": 1 } },
  ]);

  res.json({
    success: true,
    range: { start: range.start, end: range.end, label: range.label },
    granularity,
    data: series,
  });
};

// @desc Factual per-salesperson operational counts (admin/superadmin only) -
//       no rankings, scores, or "best/worst" labels.
// @route GET /api/dashboard/salespeople
exports.getSalespeople = async (req, res) => {
  const range = withDateRange(req, res);
  if (!range) return;
  const dateFilter = { createdAt: { $gte: range.start, $lte: range.end } };

  const salesUsers = await User.find({ role: "sales", isActive: true }).select("name email");

  const data = await Promise.all(salesUsers.map(async (u) => {
    const ownScope = { $or: [{ assignedTo: u._id }, { createdBy: u._id }] };
    const [leads, converted, customers, enquiries, quotations, accepted] = await Promise.all([
      Lead.countDocuments({ ...ownScope, isArchived: false, ...dateFilter }),
      Lead.countDocuments({ ...ownScope, isArchived: false, status: "CONVERTED", ...dateFilter }),
      Customer.countDocuments({ ...ownScope, isArchived: false, ...dateFilter }),
      Enquiry.countDocuments({ ...ownScope, isArchived: false, ...dateFilter }),
      Quotation.countDocuments({ ...ownScope, isDeleted: false, ...dateFilter }),
      Quotation.aggregate([
        { $match: { ...ownScope, isDeleted: false, status: Q.CUSTOMER_ACCEPTED, ...dateFilter } },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$total" } } },
      ]),
    ]);
    return {
      user: { _id: u._id, name: u.name, email: u.email },
      leads, convertedLeads: converted, customers, enquiries, quotations,
      acceptedQuotations: accepted[0]?.count || 0, acceptedQuotationValue: accepted[0]?.value || 0,
    };
  }));

  res.json({ success: true, range: { start: range.start, end: range.end, label: range.label }, data });
};
