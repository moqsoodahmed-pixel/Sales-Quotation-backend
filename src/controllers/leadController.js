const Lead = require("../models/Lead");
const Customer = require("../models/Customer");
const Enquiry = require("../models/Enquiry");
const { nextNumber } = require("../utils/sequence");
const { isValidObjectId, isValidEmail, parsePagination, ownsOrIsAdmin, escapeRegex } = require("../utils/validators");
const { LEAD_STATUSES, LEAD_SOURCES, PRIORITIES } = require("../config/crmEnums");
const logger = require("../utils/logger");

const buildFilter = (req) => {
  const filter = { isArchived: false };
  if (req.user.role === "sales") {
    filter.$or = [{ assignedTo: req.user._id }, { createdBy: req.user._id }];
  }

  const { status, source, priority, assignedTo, search, from, to, followUp } = req.query;
  if (status) {
    if (!LEAD_STATUSES.includes(status)) return null;
    filter.status = status;
  }
  if (source) {
    if (!LEAD_SOURCES.includes(source)) return null;
    filter.source = source;
  }
  if (priority) {
    if (!PRIORITIES.includes(priority)) return null;
    filter.priority = priority;
  }
  if (assignedTo && req.user.role !== "sales") {
    if (!isValidObjectId(assignedTo)) return null;
    filter.assignedTo = assignedTo;
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    filter.$and = (filter.$and || []).concat([{
      $or: [{ name: rx }, { companyName: rx }, { email: rx }, { phone: rx }, { leadNumber: rx }],
    }]);
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

// @desc List leads
// @route GET /api/leads
exports.listLeads = async (req, res) => {
  const filter = buildFilter(req);
  if (!filter) return res.status(400).json({ success: false, message: "Invalid filter parameter." });

  const { page, limit, skip } = parsePagination(req.query);

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .populate("assignedTo", "name email role")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  res.json({ success: true, data: leads, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get single lead
// @route GET /api/leads/:id
exports.getLead = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lead id." });

  const lead = await Lead.findOne({ _id: req.params.id, isArchived: false })
    .populate("assignedTo", "name email role")
    .populate("createdBy", "name email")
    .populate("customerId", "customerNumber companyName");
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found." });

  if (!ownsOrIsAdmin(req.user, lead)) {
    return res.status(403).json({ success: false, message: "You do not have access to this lead." });
  }

  const enquiries = await Enquiry.find({ lead: lead._id, isArchived: false }).select("enquiryNumber subject status priority createdAt").sort({ createdAt: -1 });

  res.json({ success: true, data: { ...lead.toObject(), enquiries } });
};

// @desc Create lead
// @route POST /api/leads
exports.createLead = async (req, res) => {
  const { name, email, source, status, priority, assignedTo, nextFollowUpAt } = req.body;

  if (!name) return res.status(400).json({ success: false, message: "Lead name is required." });
  if (email && !isValidEmail(email)) return res.status(400).json({ success: false, message: "Invalid email." });
  if (source && !LEAD_SOURCES.includes(source)) return res.status(400).json({ success: false, message: "Invalid lead source." });
  if (status && !LEAD_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid lead status." });
  if (priority && !PRIORITIES.includes(priority)) return res.status(400).json({ success: false, message: "Invalid priority." });
  if (assignedTo && !isValidObjectId(assignedTo)) return res.status(400).json({ success: false, message: "Invalid assignedTo id." });
  if (nextFollowUpAt && isNaN(Date.parse(nextFollowUpAt))) return res.status(400).json({ success: false, message: "Invalid follow-up date." });

  const leadNumber = await nextNumber("lead", "LD");

  const lead = await Lead.create({
    ...req.body,
    leadNumber,
    createdBy: req.user._id,
    assignedTo: assignedTo || (req.user.role === "sales" ? req.user._id : undefined),
  });

  logger.info(`Lead created: ${leadNumber} by ${req.user.email}`);
  res.status(201).json({ success: true, data: lead });
};

// @desc Update lead
// @route PATCH /api/leads/:id
exports.updateLead = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lead id." });

  const lead = await Lead.findOne({ _id: req.params.id, isArchived: false });
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found." });
  if (!ownsOrIsAdmin(req.user, lead)) return res.status(403).json({ success: false, message: "You do not have access to this lead." });

  const { email, source, status, priority, assignedTo, nextFollowUpAt } = req.body;
  if (email && !isValidEmail(email)) return res.status(400).json({ success: false, message: "Invalid email." });
  if (source && !LEAD_SOURCES.includes(source)) return res.status(400).json({ success: false, message: "Invalid lead source." });
  if (status && !LEAD_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid lead status." });
  if (priority && !PRIORITIES.includes(priority)) return res.status(400).json({ success: false, message: "Invalid priority." });
  if (assignedTo && !isValidObjectId(assignedTo)) return res.status(400).json({ success: false, message: "Invalid assignedTo id." });
  if (nextFollowUpAt && isNaN(Date.parse(nextFollowUpAt))) return res.status(400).json({ success: false, message: "Invalid follow-up date." });

  // leadNumber, createdBy, customerId are immutable via this endpoint
  const { leadNumber, createdBy, customerId, ...safeBody } = req.body;
  Object.assign(lead, safeBody);
  await lead.save();

  res.json({ success: true, data: lead });
};

// @desc Archive (soft delete) lead
// @route DELETE /api/leads/:id
exports.archiveLead = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lead id." });

  const lead = await Lead.findOne({ _id: req.params.id, isArchived: false });
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found." });
  if (!ownsOrIsAdmin(req.user, lead)) return res.status(403).json({ success: false, message: "You do not have access to this lead." });

  lead.isArchived = true;
  await lead.save();
  res.json({ success: true, message: "Lead archived." });
};

// @desc Convert lead into a customer (lead is preserved, marked CONVERTED)
// @route POST /api/leads/:id/convert
exports.convertLead = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lead id." });

  const lead = await Lead.findOne({ _id: req.params.id, isArchived: false });
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found." });
  if (!ownsOrIsAdmin(req.user, lead)) return res.status(403).json({ success: false, message: "You do not have access to this lead." });
  if (lead.customerId) return res.status(400).json({ success: false, message: "Lead has already been converted." });

  // Only companyName/contactPerson are caller-overridable; every other
  // field is server-derived from the lead or the authenticated user, and
  // must be applied AFTER any req.body spread so a caller can't forge
  // customerNumber/createdBy/assignedTo/status/sourceLead.
  const { companyName, contactPerson, ...restBody } = req.body;
  const customerNumber = await nextNumber("customer", "CUS");
  const customer = await Customer.create({
    ...restBody,
    customerNumber,
    companyName: companyName || lead.companyName || lead.name,
    contactPerson: contactPerson || lead.name,
    email: lead.email,
    phone: lead.phone,
    alternatePhone: lead.alternatePhone,
    website: lead.website,
    industry: lead.industry,
    notes: lead.notes,
    status: "ACTIVE",
    sourceLead: lead._id,
    assignedTo: lead.assignedTo,
    createdBy: req.user._id,
  });

  lead.status = "CONVERTED";
  lead.customerId = customer._id;
  await lead.save();

  logger.info(`Lead ${lead.leadNumber} converted to customer ${customer.customerNumber} by ${req.user.email}`);
  res.status(201).json({ success: true, data: { lead, customer } });
};

// @desc Create an enquiry directly from a lead
// @route POST /api/leads/:id/enquiry
exports.createEnquiryFromLead = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lead id." });

  const lead = await Lead.findOne({ _id: req.params.id, isArchived: false });
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found." });
  if (!ownsOrIsAdmin(req.user, lead)) return res.status(403).json({ success: false, message: "You do not have access to this lead." });

  if (!req.body.subject) return res.status(400).json({ success: false, message: "Enquiry subject is required." });

  const enquiryNumber = await nextNumber("enquiry", "ENQ");
  const enquiry = await Enquiry.create({
    ...req.body,
    enquiryNumber,
    lead: lead._id,
    customer: lead.customerId || undefined,
    assignedTo: req.body.assignedTo || lead.assignedTo,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: enquiry });
};
