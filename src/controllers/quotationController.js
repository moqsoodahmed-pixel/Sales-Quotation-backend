const mongoose = require("mongoose");
const Quotation = require("../models/Quotation");
const QuotationHistory = require("../models/QuotationHistory");
const Customer = require("../models/Customer");
const Enquiry = require("../models/Enquiry");
const generateQuotationNumber = require("../utils/quotationNumber");
const Counter = require("../models/Counter");
const { buildQuotationItems, applyDiscountAndTax } = require("../utils/quotationCalc");
const { applyTransition, getAction } = require("../utils/quotationWorkflow");
const { STATUS, REVISABLE_STATUSES } = require("../config/quotationStatus");
const { isValidObjectId, parsePagination, ownsOrIsAdmin, escapeRegex } = require("../utils/validators");
const { generateQuotationPdfBuffer } = require("../utils/quotationPdf");
const { saveFile, readFile, deleteFile } = require("../utils/documentStorage");
const Document = require("../models/Document");
const DocumentHistory = require("../models/DocumentHistory");
const User = require("../models/User");
const { createNotification, createNotificationForMany } = require("../utils/notificationService");
const { NOTIFICATION_TYPE, NOTIFICATION_SEVERITY } = require("../config/notificationEnums");
const logger = require("../utils/logger");

// Best-effort, in-app-only notifications for a quotation workflow
// transition - failures here are logged but never fail the transition
// itself (the workflow state change is the source of truth). actorLabel is
// a plain display string so this works for both staff (req.user.name) and
// the public customer-acceptance actor (which has no User account at all).
const notifyQuotationTransition = async (q, action, actorLabel) => {
  try {
    const owner = q.assignedTo || q.createdBy;
    if (action === "SUBMIT_FOR_REVIEW") {
      const admins = await User.find({ role: { $in: ["admin", "superadmin"] }, isActive: true }).select("_id");
      await createNotificationForMany(admins.map((a) => a._id), {
        type: NOTIFICATION_TYPE.QUOTATION_SUBMITTED, title: `Quotation ${q.quotNo} submitted for review`,
        message: `Submitted by ${actorLabel}.`, entityType: "Quotation", entityId: q._id, severity: NOTIFICATION_SEVERITY.INFO,
      });
    } else if (action === "APPROVE" && owner) {
      await createNotification({ recipient: owner, type: NOTIFICATION_TYPE.QUOTATION_APPROVAL, title: `Quotation ${q.quotNo} approved`, message: `Approved by ${actorLabel}.`, entityType: "Quotation", entityId: q._id, severity: NOTIFICATION_SEVERITY.INFO });
    } else if (action === "REJECT_TO_DRAFT" && owner) {
      await createNotification({ recipient: owner, type: NOTIFICATION_TYPE.QUOTATION_REJECTED, title: `Quotation ${q.quotNo} sent back to draft`, message: `Rejected by ${actorLabel}.`, entityType: "Quotation", entityId: q._id, severity: NOTIFICATION_SEVERITY.WARNING });
    } else if (action === "CUSTOMER_ACCEPT" && owner) {
      await createNotification({ recipient: owner, type: NOTIFICATION_TYPE.QUOTATION_ACCEPTED, title: `Quotation ${q.quotNo} accepted by customer`, message: `Accepted by ${actorLabel}.`, entityType: "Quotation", entityId: q._id, severity: NOTIFICATION_SEVERITY.INFO });
    } else if (action === "CUSTOMER_REJECT" && owner) {
      await createNotification({ recipient: owner, type: NOTIFICATION_TYPE.QUOTATION_CUSTOMER_REJECTED, title: `Quotation ${q.quotNo} rejected by customer`, message: `Rejected by ${actorLabel}.`, entityType: "Quotation", entityId: q._id, severity: NOTIFICATION_SEVERITY.WARNING });
    }
  } catch (err) { logger.error(`notifyQuotationTransition failed: ${err.message}`); }
};

// Atomic per-lineage revision counter (race-safe: findOneAndUpdate's $inc is
// a single atomic Mongo operation, so two concurrent revision creations can
// never both receive the same number). Called once for revision 1 too, so
// the very first call returns 1 and the next returns 2, etc.
const getNextRevisionNumber = async (rootId) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: `quotation-revision:${rootId}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return counter.seq;
};

const buildFilter = (req) => {
  const filter = { isDeleted: false };
  // sales: own quotations only - assignedTo OR createdBy, matching the
  // ownership check used everywhere else (ownsOrIsAdmin) so a quotation
  // assigned to (but not created by) a sales user still shows in their list.
  if (req.user.role === "sales") {
    filter.$and = (filter.$and || []).concat([{ $or: [{ assignedTo: req.user._id }, { createdBy: req.user._id }] }]);
  }
  // optional query params
  const { status, search, from, to, createdBy, customer, enquiry } = req.query;
  if (status) filter.status = status;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    filter.$and = (filter.$and || []).concat([{ $or: [{ quotNo: rx }, { clientName: rx }, { clientEmail: rx }] }]);
  }
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  // admin/superadmin can filter by specific sales person
  if (createdBy && req.user.role !== "sales") {
    filter.createdBy = createdBy;
  }
  if (customer && isValidObjectId(customer)) filter.customer = customer;
  if (enquiry && isValidObjectId(enquiry)) filter.enquiry = enquiry;
  return filter;
};

// @desc    List quotations
// @route   GET /api/quotations
exports.listQuotations = async (req, res) => {
  const filter = buildFilter(req);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const sortField = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

  const [quotations, total] = await Promise.all([
    Quotation.find(filter)
      .populate("createdBy", "name email role")
      .populate("customer", "customerNumber companyName")
      .populate("enquiry", "enquiryNumber subject")
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    Quotation.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: quotations,
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  });
};

// @desc    Get single quotation
// @route   GET /api/quotations/:id
exports.getQuotation = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const q = await Quotation.findOne({ _id: req.params.id, isDeleted: false })
    .populate("createdBy", "name email role phone")
    .populate("customer", "customerNumber companyName contactPerson email phone")
    .populate("enquiry", "enquiryNumber subject")
    .populate("statusHistory.changedBy", "name email")
    .populate("approvedBy", "name email")
    .populate("rejectedBy", "name email")
    .populate("sentBy", "name email");

  if (!q) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, q)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  res.json({ success: true, data: q });
};

// @desc    Create quotation
// @route   POST /api/quotations
exports.createQuotation = async (req, res) => {
  const body = req.body;

  // --- Customer / enquiry relationship validation ---
  let customer = null;
  let enquiry = null;

  if (body.customerId) {
    if (!isValidObjectId(body.customerId)) return res.status(400).json({ success: false, message: "Invalid customer id." });
    customer = await Customer.findOne({ _id: body.customerId, isArchived: false });
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
  }

  if (body.enquiryId) {
    if (!isValidObjectId(body.enquiryId)) return res.status(400).json({ success: false, message: "Invalid enquiry id." });
    enquiry = await Enquiry.findOne({ _id: body.enquiryId, isArchived: false });
    if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found." });

    if (enquiry.customer) {
      if (customer && String(enquiry.customer) !== String(customer._id)) {
        return res.status(400).json({ success: false, message: "This enquiry belongs to a different customer than the one selected." });
      }
      if (!customer) customer = await Customer.findOne({ _id: enquiry.customer, isArchived: false });
    }
  }

  // --- Line items: validated & snapshotted server-side ---
  const itemsResult = await buildQuotationItems(body.items);
  if (itemsResult.error) return res.status(400).json({ success: false, message: itemsResult.error });

  // --- Discount + tax: server is the source of truth, client totals ignored ---
  const discountType = body.discountType || (body.discountAmount !== undefined ? "FIXED" : "FIXED");
  const discountValue = body.discountType ? body.discountValue : body.discountAmount;
  const calc = applyDiscountAndTax({
    items: itemsResult.items,
    subtotal: itemsResult.subtotal,
    discountType,
    discountValue,
    govtFeeTotal: body.govtFeeTotal,
  });
  if (calc.error) return res.status(400).json({ success: false, message: calc.error });

  if (body.validUntil && isNaN(Date.parse(body.validUntil))) {
    return res.status(400).json({ success: false, message: "Invalid validity date." });
  }

  const quotNo = await generateQuotationNumber();

  const clientSnapshot = customer
    ? {
        clientName: body.clientName || customer.contactPerson || customer.companyName,
        clientCompany: body.clientCompany || customer.companyName,
        clientEmail: body.clientEmail || customer.email,
        clientPhone: body.clientPhone || customer.phone,
        clientAdd1: body.clientAdd1 || customer.address,
        clientCity: body.clientCity || customer.city,
        clientState: body.clientState || customer.state,
        clientPin: body.clientPin || customer.pincode,
        clientGST: body.clientGST || customer.gstin,
      }
    : {};

  if (!clientSnapshot.clientName && !body.clientName) {
    return res.status(400).json({ success: false, message: "Client name is required (select a customer or provide client details)." });
  }

  const _id = new mongoose.Types.ObjectId();
  const revisionNumber = await getNextRevisionNumber(_id);

  const quotation = await Quotation.create({
    ...body,
    ...clientSnapshot,
    _id,
    clientName: clientSnapshot.clientName || body.clientName,
    quotNo,
    customer: customer?._id,
    enquiry: enquiry?._id,
    items: calc.items,
    subtotal: itemsResult.subtotal,
    discountType: calc.discountType,
    discountValue: calc.discountValue,
    discountAmount: calc.discountAmount,
    taxableAmount: calc.taxableAmount,
    gstAmount: calc.gstAmount,
    govtFeeTotal: calc.govtFeeTotal,
    total: calc.total,
    createdBy: req.user._id,
    assignedTo: body.assignedTo || req.user._id,
    preparedBy: req.user.name,
    status: STATUS.DRAFT, // new quotations always start as Draft, regardless of client input
    rootQuotationId: _id,
    revisionNumber,
    isLatestRevision: true,
    statusHistory: [{ status: STATUS.DRAFT, changedBy: req.user._id }],
  });

  await QuotationHistory.create({
    quotation: quotation._id, fromStatus: null, toStatus: STATUS.DRAFT,
    action: "CREATED", performedBy: req.user._id, performedByType: "USER",
  });

  logger.info(`Quotation created: ${quotNo} by ${req.user.email}`);
  res.status(201).json({ success: true, data: quotation });
};

// @desc    Update quotation
// @route   PUT /api/quotations/:id
exports.updateQuotation = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const q = await Quotation.findOne({ _id: req.params.id, isDeleted: false });
  if (!q) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, q)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  // Commercial content is only ever editable in DRAFT - for EVERYONE,
  // including admin/superadmin. Once submitted for review, approved, sent,
  // or responded to by the customer, the only way to change anything is to
  // create a new revision (POST /:id/revise) or, from INTERNAL_REVIEW,
  // reject it back to DRAFT. This is enforced here regardless of what the
  // frontend does or doesn't show.
  if (q.status !== STATUS.DRAFT) {
    return res.status(403).json({ success: false, message: "Only draft quotations can be edited. Create a new revision to make changes." });
  }

  const body = req.body;

  if (body.items) {
    const itemsResult = await buildQuotationItems(body.items);
    if (itemsResult.error) return res.status(400).json({ success: false, message: itemsResult.error });

    const discountType = body.discountType || q.discountType;
    const discountValue = body.discountType ? body.discountValue : (body.discountAmount ?? q.discountValue);
    const calc = applyDiscountAndTax({
      items: itemsResult.items,
      subtotal: itemsResult.subtotal,
      discountType,
      discountValue,
      govtFeeTotal: body.govtFeeTotal ?? q.govtFeeTotal,
    });
    if (calc.error) return res.status(400).json({ success: false, message: calc.error });

    Object.assign(body, {
      items: calc.items,
      subtotal: itemsResult.subtotal,
      discountType: calc.discountType,
      discountValue: calc.discountValue,
      discountAmount: calc.discountAmount,
      taxableAmount: calc.taxableAmount,
      gstAmount: calc.gstAmount,
      govtFeeTotal: calc.govtFeeTotal,
      total: calc.total,
    });
  }

  if (body.validUntil && isNaN(Date.parse(body.validUntil))) {
    return res.status(400).json({ success: false, message: "Invalid validity date." });
  }

  // Status changes never go through this endpoint - only through the
  // controlled workflow actions (POST /:id/transition).
  const { quotNo, createdBy, customer, enquiry, status, statusHistory, ...safeBody } = body;
  Object.assign(q, safeBody, { updatedBy: req.user._id });
  await q.save();

  res.json({ success: true, data: q });
};

// @desc    Perform a controlled workflow transition (submit/approve/reject/
//          send/cancel/mark-expired). Replaces the old free-form status
//          field - a client can only invoke a named action, never set an
//          arbitrary status directly, so Sales can never smuggle "APPROVED"
//          or "SENT" through this endpoint.
// @route   PATCH /api/quotations/:id/status
exports.transitionQuotation = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const { action, comment } = req.body;
  if (!action || !getAction(action)) return res.status(400).json({ success: false, message: "Invalid or missing workflow action." });

  const q = await Quotation.findOne({ _id: req.params.id, isDeleted: false });
  if (!q) return res.status(404).json({ success: false, message: "Quotation not found." });

  // A genuine ownership violation (sales targeting another salesperson's
  // quotation) is always 403, regardless of which action was requested.
  // Whether that specific role/action combination is a valid workflow
  // transition is then checked separately by applyTransition (400).
  if (!ownsOrIsAdmin(req.user, q)) {
    return res.status(403).json({ success: false, message: "You do not have access to this quotation." });
  }

  const result = applyTransition({ quotation: q, actionName: action, actor: { type: "USER", user: req.user }, comment });
  if (result.error) return res.status(400).json({ success: false, message: result.error });

  q.updatedBy = req.user._id;
  await q.save();
  await QuotationHistory.create({ quotation: q._id, ...result.historyEntry });
  await notifyQuotationTransition(q, action, req.user.name);

  logger.info(`Quotation ${q.quotNo} transitioned ${result.historyEntry.fromStatus} -> ${result.historyEntry.toStatus} by ${req.user.email}`);

  const responseData = { _id: q._id, status: q.status };
  // The raw acceptance token is only ever available here, once, right after
  // SEND - it is never stored or retrievable again after this response.
  if (result.extra.rawToken) {
    responseData.acceptanceToken = result.extra.rawToken;
    responseData.acceptanceUrl = `/quotation/accept/${result.extra.rawToken}`;
  }

  res.json({ success: true, data: responseData });
};

// @desc    Create a new DRAFT revision of a locked quotation. The source
//          quotation is never modified - a brand-new document is created,
//          linked via rootQuotationId/previousRevisionId, with its own
//          unique quotation number and the next revision number in the
//          lineage (race-safe via an atomic per-lineage counter).
// @route   POST /api/quotations/:id/revise
exports.createRevision = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const source = await Quotation.findOne({ _id: req.params.id, isDeleted: false });
  if (!source) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, source)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  if (!REVISABLE_STATUSES.includes(source.status)) {
    return res.status(400).json({ success: false, message: "A new revision can only be created from an approved, sent, or closed quotation. A Draft can be edited directly, and an Internal Review quotation must first be rejected back to Draft or approved." });
  }

  const rootId = source.rootQuotationId || source._id;
  const revisionNumber = await getNextRevisionNumber(rootId);
  const quotNo = await generateQuotationNumber();

  const sourceObj = source.toObject();
  const {
    _id, createdAt, updatedAt, statusHistory, pdfUrl,
    rootQuotationId, previousRevisionId, isLatestRevision,
    approvedBy, approvedAt, rejectedBy, rejectedAt, rejectionReason, sentBy, sentAt,
    acceptanceTokenHash, acceptanceTokenExpiresAt, acceptanceTokenUsedAt,
    customerAcceptedAt, customerAcceptanceMethod, customerAcceptanceComment, customerAcceptanceIp, customerAcceptanceUserAgent,
    customerRejectedAt, customerRejectionReason,
    ...rest
  } = sourceObj;

  const revision = await Quotation.create({
    ...rest,
    quotNo,
    status: STATUS.DRAFT,
    rootQuotationId: rootId,
    previousRevisionId: source._id,
    revisionNumber,
    isLatestRevision: true,
    createdBy: req.user._id,
    assignedTo: source.assignedTo || req.user._id,
    preparedBy: req.user.name,
    statusHistory: [{ status: STATUS.DRAFT, changedBy: req.user._id, note: `Revision ${revisionNumber} created from ${source.quotNo} (Rev ${source.revisionNumber}).` }],
  });

  await Quotation.updateMany({ rootQuotationId: rootId, _id: { $ne: revision._id } }, { isLatestRevision: false });
  await QuotationHistory.create({
    quotation: revision._id, fromStatus: null, toStatus: STATUS.DRAFT,
    action: "REVISION_CREATED", performedBy: req.user._id, performedByType: "USER",
    comment: `Created as revision ${revisionNumber} from ${source.quotNo}.`,
  });

  logger.info(`Quotation revision created: ${quotNo} (Rev ${revisionNumber}) from ${source.quotNo} by ${req.user.email}`);
  res.status(201).json({ success: true, data: revision });
};

// @desc    List all revisions in this quotation's lineage
// @route   GET /api/quotations/:id/revisions
exports.getRevisions = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const q = await Quotation.findOne({ _id: req.params.id, isDeleted: false });
  if (!q) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, q)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  const rootId = q.rootQuotationId || q._id;
  const revisions = await Quotation.find({ rootQuotationId: rootId, isDeleted: false })
    .select("quotNo revisionNumber status total createdAt createdBy isLatestRevision")
    .populate("createdBy", "name")
    .sort({ revisionNumber: 1 });

  res.json({ success: true, data: revisions });
};

// @desc    Full workflow/approval audit trail for this quotation
// @route   GET /api/quotations/:id/history
exports.getHistory = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const q = await Quotation.findOne({ _id: req.params.id, isDeleted: false });
  if (!q) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, q)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  const history = await QuotationHistory.find({ quotation: q._id })
    .populate("performedBy", "name email role")
    .sort({ performedAt: 1 });

  res.json({ success: true, data: history });
};

// @desc    Duplicate quotation
// @route   POST /api/quotations/:id/duplicate
exports.duplicateQuotation = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const original = await Quotation.findOne({ _id: req.params.id, isDeleted: false });
  if (!original) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, original)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  const quotNo = await generateQuotationNumber();
  const originalObj = original.toObject();
  // A duplicate is a brand-new, independent quotation (its own lineage) -
  // not a revision - so every Phase 5 workflow/versioning/acceptance field
  // is stripped rather than copied.
  const {
    _id, createdAt, updatedAt, statusHistory, pdfUrl,
    rootQuotationId, previousRevisionId, revisionNumber, isLatestRevision,
    approvedBy, approvedAt, rejectedBy, rejectedAt, rejectionReason, sentBy, sentAt,
    acceptanceTokenHash, acceptanceTokenExpiresAt, acceptanceTokenUsedAt,
    customerAcceptedAt, customerAcceptanceMethod, customerAcceptanceComment, customerAcceptanceIp, customerAcceptanceUserAgent,
    customerRejectedAt, customerRejectionReason,
    ...rest
  } = originalObj;

  const newId = new mongoose.Types.ObjectId();
  const duplicated = await Quotation.create({
    ...rest,
    _id: newId,
    quotNo,
    status: STATUS.DRAFT,
    rootQuotationId: newId,
    revisionNumber: await getNextRevisionNumber(newId),
    isLatestRevision: true,
    date: new Date(),
    createdBy: req.user._id,
    assignedTo: req.user._id,
    preparedBy: req.user.name,
    statusHistory: [{ status: STATUS.DRAFT, changedBy: req.user._id, note: `Duplicated from ${original.quotNo}.` }],
  });

  await QuotationHistory.create({
    quotation: duplicated._id, fromStatus: null, toStatus: STATUS.DRAFT,
    action: "CREATED", performedBy: req.user._id, performedByType: "USER",
    comment: `Duplicated from ${original.quotNo}.`,
  });

  res.status(201).json({ success: true, data: duplicated });
};

// @desc    Soft delete
// @route   DELETE /api/quotations/:id
exports.deleteQuotation = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const q = await Quotation.findOne({ _id: req.params.id, isDeleted: false });
  if (!q) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, q)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  q.isDeleted = true;
  q.deletedAt = new Date();
  q.deletedBy = req.user._id;
  await q.save();

  res.json({ success: true, message: "Quotation deleted." });
};

// @desc    Dashboard analytics
// @route   GET /api/quotations/analytics
exports.getAnalytics = async (req, res) => {
  const filter = { isDeleted: false };
  if (req.user.role === "sales") filter.$or = [{ assignedTo: req.user._id }, { createdBy: req.user._id }];

  const [byStatus, totalValue, recent, monthlyTrend] = await Promise.all([
    Quotation.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 }, value: { $sum: "$total" } } },
    ]),
    Quotation.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
    Quotation.find(filter)
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Quotation.aggregate([
      { $match: filter },
      { $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        count: { $sum: 1 },
        value: { $sum: "$total" },
      }},
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 6 },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      byStatus,
      totalValue: totalValue[0] || { total: 0, count: 0 },
      recent,
      monthlyTrend,
    },
  });
};

// @desc    Generate the official PDF from this quotation's stored snapshot
//          data and download it. Read-only with respect to the quotation
//          itself - generating a PDF never mutates commercial content, so
//          it's allowed at any status the caller can already view.
//          Registers/updates a single QUOTATION_PDF Document per quotation
//          (see "PDF regeneration strategy" below) rather than accumulating
//          duplicate rows every time someone clicks the button.
// @route   POST /api/quotations/:id/pdf
exports.generateAndDownloadPdf = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const q = await Quotation.findOne({ _id: req.params.id, isDeleted: false })
    .populate("enquiry", "enquiryNumber subject");
  if (!q) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, q)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  const buffer = await generateQuotationPdfBuffer(q);
  const storedFilename = await saveFile(buffer, "pdf");
  const originalFilename = `${q.quotNo.replace(/\//g, "-")}-Rev${q.revisionNumber}.pdf`;

  // Strategy: one QUOTATION_PDF Document per quotation revision - since
  // each revision is its own immutable Quotation document (Phase 5), the
  // underlying snapshot data driving the PDF never changes for a given
  // `quotation` id. Regenerating therefore REPLACES that revision's active
  // PDF file/metadata in place (bumping `version`) instead of creating a
  // new row every click; a genuinely different commercial version always
  // has its own quotation id (via /revise) and so naturally gets its own
  // separate Document row.
  let document = await Document.findOne({ quotation: q._id, documentType: "QUOTATION_PDF" });
  if (document) {
    await deleteFile(document.storedFilename);
    Object.assign(document, {
      storedFilename, originalFilename, mimeType: "application/pdf", fileSize: buffer.length,
      quotationRevisionNumber: q.revisionNumber, uploadedBy: req.user._id, isActive: true,
      version: document.version + 1,
    });
    await document.save();
    await DocumentHistory.create({ document: document._id, action: "REGENERATED", performedBy: req.user._id });
  } else {
    document = await Document.create({
      quotation: q._id, customer: q.customer, enquiry: q.enquiry?._id,
      quotationRevisionNumber: q.revisionNumber, documentType: "QUOTATION_PDF",
      originalFilename, storedFilename, mimeType: "application/pdf", fileSize: buffer.length,
      uploadedBy: req.user._id,
    });
    await DocumentHistory.create({ document: document._id, action: "UPLOADED", performedBy: req.user._id });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${originalFilename}"`);
  res.send(buffer);
};

// @desc    Re-download the most recently generated PDF for this quotation
//          without regenerating it.
// @route   GET /api/quotations/:id/pdf
exports.downloadLatestPdf = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quotation id." });

  const q = await Quotation.findOne({ _id: req.params.id, isDeleted: false });
  if (!q) return res.status(404).json({ success: false, message: "Quotation not found." });
  if (!ownsOrIsAdmin(req.user, q)) return res.status(403).json({ success: false, message: "You do not have access to this quotation." });

  const document = await Document.findOne({ quotation: q._id, documentType: "QUOTATION_PDF", isActive: true });
  if (!document) return res.status(404).json({ success: false, message: "No PDF has been generated for this quotation yet." });

  const buffer = await readFile(document.storedFilename);
  await DocumentHistory.create({ document: document._id, action: "DOWNLOADED", performedBy: req.user._id });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${document.originalFilename}"`);
  res.send(buffer);
};

module.exports.notifyQuotationTransition = notifyQuotationTransition;
