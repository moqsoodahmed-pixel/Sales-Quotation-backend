const Customer = require("../models/Customer");
const Enquiry = require("../models/Enquiry");
const Quotation = require("../models/Quotation");
const { nextNumber } = require("../utils/sequence");
const { isValidObjectId, isValidEmail, parsePagination, ownsOrIsAdmin, escapeRegex } = require("../utils/validators");
const { CUSTOMER_STATUSES } = require("../config/crmEnums");
const logger = require("../utils/logger");

const buildFilter = (req) => {
  const filter = { isArchived: false };
  if (req.user.role === "sales") {
    filter.$or = [{ assignedTo: req.user._id }, { createdBy: req.user._id }];
  }

  const { status, assignedTo, industry, search } = req.query;
  if (status) {
    if (!CUSTOMER_STATUSES.includes(status)) return null;
    filter.status = status;
  }
  if (assignedTo && req.user.role !== "sales") {
    if (!isValidObjectId(assignedTo)) return null;
    filter.assignedTo = assignedTo;
  }
  if (industry) filter.industry = { $regex: escapeRegex(industry), $options: "i" };
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    filter.$and = (filter.$and || []).concat([{
      $or: [{ companyName: rx }, { contactPerson: rx }, { email: rx }, { phone: rx }, { customerNumber: rx }],
    }]);
  }

  return filter;
};

// @desc List customers
// @route GET /api/customers
exports.listCustomers = async (req, res) => {
  const filter = buildFilter(req);
  if (!filter) return res.status(400).json({ success: false, message: "Invalid filter parameter." });

  const { page, limit, skip } = parsePagination(req.query);

  const [customers, total] = await Promise.all([
    Customer.find(filter)
      .populate("assignedTo", "name email role")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Customer.countDocuments(filter),
  ]);

  res.json({ success: true, data: customers, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get single customer (with enquiries)
// @route GET /api/customers/:id
exports.getCustomer = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid customer id." });

  const customer = await Customer.findOne({ _id: req.params.id, isArchived: false })
    .populate("assignedTo", "name email role")
    .populate("createdBy", "name email")
    .populate("sourceLead", "leadNumber name");
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });

  if (!ownsOrIsAdmin(req.user, customer)) {
    return res.status(403).json({ success: false, message: "You do not have access to this customer." });
  }

  const [enquiries, quotations] = await Promise.all([
    Enquiry.find({ customer: customer._id, isArchived: false })
      .select("enquiryNumber subject status priority estimatedBudget createdAt")
      .sort({ createdAt: -1 }),
    Quotation.find({ customer: customer._id, isDeleted: false })
      .select("quotNo status total date validUntil createdAt")
      .sort({ createdAt: -1 }),
  ]);

  res.json({ success: true, data: { ...customer.toObject(), enquiries, quotations } });
};

// @desc Create customer
// @route POST /api/customers
exports.createCustomer = async (req, res) => {
  const { companyName, email, status, assignedTo } = req.body;

  if (!companyName) return res.status(400).json({ success: false, message: "Company name is required." });
  if (email && !isValidEmail(email)) return res.status(400).json({ success: false, message: "Invalid email." });
  if (status && !CUSTOMER_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid customer status." });
  if (assignedTo && !isValidObjectId(assignedTo)) return res.status(400).json({ success: false, message: "Invalid assignedTo id." });

  // Sensible duplicate detection: same company name + email combination.
  if (email) {
    const existing = await Customer.findOne({
      isArchived: false,
      companyName: { $regex: `^${companyName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      email: email.toLowerCase(),
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A customer with this company name and email already exists.",
        data: { existingCustomerId: existing._id, customerNumber: existing.customerNumber },
      });
    }
  }

  const customerNumber = await nextNumber("customer", "CUS");
  const customer = await Customer.create({
    ...req.body,
    customerNumber,
    createdBy: req.user._id,
    assignedTo: assignedTo || (req.user.role === "sales" ? req.user._id : undefined),
  });

  logger.info(`Customer created: ${customerNumber} by ${req.user.email}`);
  res.status(201).json({ success: true, data: customer });
};

// @desc Update customer
// @route PATCH /api/customers/:id
exports.updateCustomer = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid customer id." });

  const customer = await Customer.findOne({ _id: req.params.id, isArchived: false });
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
  if (!ownsOrIsAdmin(req.user, customer)) return res.status(403).json({ success: false, message: "You do not have access to this customer." });

  const { email, status, assignedTo } = req.body;
  if (email && !isValidEmail(email)) return res.status(400).json({ success: false, message: "Invalid email." });
  if (status && !CUSTOMER_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid customer status." });
  if (assignedTo && !isValidObjectId(assignedTo)) return res.status(400).json({ success: false, message: "Invalid assignedTo id." });

  const { customerNumber, createdBy, sourceLead, ...safeBody } = req.body;
  Object.assign(customer, safeBody);
  await customer.save();

  res.json({ success: true, data: customer });
};

// @desc Archive (soft delete) customer
// @route DELETE /api/customers/:id
exports.archiveCustomer = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid customer id." });

  const customer = await Customer.findOne({ _id: req.params.id, isArchived: false });
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
  if (!ownsOrIsAdmin(req.user, customer)) return res.status(403).json({ success: false, message: "You do not have access to this customer." });

  customer.isArchived = true;
  await customer.save();
  res.json({ success: true, message: "Customer archived." });
};

// @desc Create an enquiry directly from a customer
// @route POST /api/customers/:id/enquiry
exports.createEnquiryFromCustomer = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid customer id." });

  const customer = await Customer.findOne({ _id: req.params.id, isArchived: false });
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
  if (!ownsOrIsAdmin(req.user, customer)) return res.status(403).json({ success: false, message: "You do not have access to this customer." });

  if (!req.body.subject) return res.status(400).json({ success: false, message: "Enquiry subject is required." });

  const enquiryNumber = await nextNumber("enquiry", "ENQ");
  const enquiry = await Enquiry.create({
    ...req.body,
    enquiryNumber,
    customer: customer._id,
    assignedTo: req.body.assignedTo || customer.assignedTo,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: enquiry });
};
