const Enquiry = require("../models/Enquiry");
const { isValidObjectId, parsePagination, ownsOrIsAdmin, escapeRegex } = require("../utils/validators");
const { ENQUIRY_STATUSES, PRIORITIES } = require("../config/crmEnums");
const { nextNumber } = require("../utils/sequence");
const logger = require("../utils/logger");

const buildFilter = (req) => {
  const filter = { isArchived: false };
  if (req.user.role === "sales") {
    filter.$or = [{ assignedTo: req.user._id }, { createdBy: req.user._id }];
  }

  const { status, priority, assignedTo, customer, lead, search, from, to, followUp } = req.query;
  if (status) {
    if (!ENQUIRY_STATUSES.includes(status)) return null;
    filter.status = status;
  }
  if (priority) {
    if (!PRIORITIES.includes(priority)) return null;
    filter.priority = priority;
  }
  if (assignedTo && req.user.role !== "sales") {
    if (!isValidObjectId(assignedTo)) return null;
    filter.assignedTo = assignedTo;
  }
  if (customer) {
    if (!isValidObjectId(customer)) return null;
    filter.customer = customer;
  }
  if (lead) {
    if (!isValidObjectId(lead)) return null;
    filter.lead = lead;
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    filter.$and = (filter.$and || []).concat([{ $or: [{ enquiryNumber: rx }, { subject: rx }] }]);
  }
  if (followUp === "overdue") {
    filter.nextFollowUpAt = { $lt: new Date() };
  } else if (followUp === "today") {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    filter.nextFollowUpAt = { $gte: start, $lte: end };
  } else if (followUp === "upcoming") {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    filter.nextFollowUpAt = { $gt: end };
  }

  return filter;
};

// @desc List enquiries
// @route GET /api/enquiries
exports.listEnquiries = async (req, res) => {
  const filter = buildFilter(req);
  if (!filter) return res.status(400).json({ success: false, message: "Invalid filter parameter." });

  const { page, limit, skip } = parsePagination(req.query);

  const [enquiries, total] = await Promise.all([
    Enquiry.find(filter)
      .populate("assignedTo", "name email role")
      .populate("createdBy", "name email")
      .populate("lead", "leadNumber name")
      .populate("customer", "customerNumber companyName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Enquiry.countDocuments(filter),
  ]);

  res.json({ success: true, data: enquiries, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get single enquiry
// @route GET /api/enquiries/:id
exports.getEnquiry = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid enquiry id." });

  const enquiry = await Enquiry.findOne({ _id: req.params.id, isArchived: false })
    .populate("assignedTo", "name email role")
    .populate("createdBy", "name email")
    .populate("lead", "leadNumber name companyName")
    .populate("customer", "customerNumber companyName")
    .populate("serviceCategory", "name")
    .populate("requestedServices", "name defaultPrice");
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found." });

  if (!ownsOrIsAdmin(req.user, enquiry)) {
    return res.status(403).json({ success: false, message: "You do not have access to this enquiry." });
  }

  res.json({ success: true, data: enquiry });
};

// @desc Create enquiry
// @route POST /api/enquiries
exports.createEnquiry = async (req, res) => {
  const { subject, lead, customer, status, priority, assignedTo, estimatedBudget, expectedStartDate, nextFollowUpAt } = req.body;

  if (!subject) return res.status(400).json({ success: false, message: "Subject is required." });
  if (!lead && !customer) return res.status(400).json({ success: false, message: "An enquiry must reference a lead or a customer." });
  if (lead && !isValidObjectId(lead)) return res.status(400).json({ success: false, message: "Invalid lead id." });
  if (customer && !isValidObjectId(customer)) return res.status(400).json({ success: false, message: "Invalid customer id." });
  if (status && !ENQUIRY_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid enquiry status." });
  if (priority && !PRIORITIES.includes(priority)) return res.status(400).json({ success: false, message: "Invalid priority." });
  if (assignedTo && !isValidObjectId(assignedTo)) return res.status(400).json({ success: false, message: "Invalid assignedTo id." });
  if (estimatedBudget !== undefined && (isNaN(+estimatedBudget) || +estimatedBudget < 0)) {
    return res.status(400).json({ success: false, message: "Invalid estimated budget." });
  }
  if (expectedStartDate && isNaN(Date.parse(expectedStartDate))) return res.status(400).json({ success: false, message: "Invalid expected start date." });
  if (nextFollowUpAt && isNaN(Date.parse(nextFollowUpAt))) return res.status(400).json({ success: false, message: "Invalid follow-up date." });

  const enquiryNumber = await nextNumber("enquiry", "ENQ");
  const enquiry = await Enquiry.create({
    ...req.body,
    enquiryNumber,
    createdBy: req.user._id,
    assignedTo: assignedTo || (req.user.role === "sales" ? req.user._id : undefined),
  });

  logger.info(`Enquiry created: ${enquiryNumber} by ${req.user.email}`);
  res.status(201).json({ success: true, data: enquiry });
};

// @desc Update enquiry
// @route PATCH /api/enquiries/:id
exports.updateEnquiry = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid enquiry id." });

  const enquiry = await Enquiry.findOne({ _id: req.params.id, isArchived: false });
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found." });
  if (!ownsOrIsAdmin(req.user, enquiry)) return res.status(403).json({ success: false, message: "You do not have access to this enquiry." });

  const { status, priority, assignedTo, estimatedBudget, expectedStartDate, nextFollowUpAt } = req.body;
  if (status && !ENQUIRY_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid enquiry status." });
  if (priority && !PRIORITIES.includes(priority)) return res.status(400).json({ success: false, message: "Invalid priority." });
  if (assignedTo && !isValidObjectId(assignedTo)) return res.status(400).json({ success: false, message: "Invalid assignedTo id." });
  if (estimatedBudget !== undefined && (isNaN(+estimatedBudget) || +estimatedBudget < 0)) {
    return res.status(400).json({ success: false, message: "Invalid estimated budget." });
  }
  if (expectedStartDate && isNaN(Date.parse(expectedStartDate))) return res.status(400).json({ success: false, message: "Invalid expected start date." });
  if (nextFollowUpAt && isNaN(Date.parse(nextFollowUpAt))) return res.status(400).json({ success: false, message: "Invalid follow-up date." });

  const { enquiryNumber, createdBy, lead, customer, quotationId, ...safeBody } = req.body;
  Object.assign(enquiry, safeBody);
  await enquiry.save();

  res.json({ success: true, data: enquiry });
};

// @desc Archive (soft delete) enquiry
// @route DELETE /api/enquiries/:id
exports.archiveEnquiry = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid enquiry id." });

  const enquiry = await Enquiry.findOne({ _id: req.params.id, isArchived: false });
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found." });
  if (!ownsOrIsAdmin(req.user, enquiry)) return res.status(403).json({ success: false, message: "You do not have access to this enquiry." });

  enquiry.isArchived = true;
  await enquiry.save();
  res.json({ success: true, message: "Enquiry archived." });
};
