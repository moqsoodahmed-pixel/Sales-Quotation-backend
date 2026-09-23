const Document = require("../models/Document");
const DocumentHistory = require("../models/DocumentHistory");
const Customer = require("../models/Customer");
const Enquiry = require("../models/Enquiry");
const Quotation = require("../models/Quotation");
const Service = require("../models/Service");
const IsoStandard = require("../models/IsoStandard");
const IsoEngagement = require("../models/IsoEngagement");
const { saveFile, readFile, deleteFile } = require("../utils/documentStorage");
const { isValidObjectId, parsePagination } = require("../utils/validators");
const {
  ALL_DOCUMENT_TYPES, ALLOWED_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES, EXPIRING_SOON_WINDOW_DAYS,
} = require("../config/documentEnums");
const logger = require("../utils/logger");

const RELATION_MODELS = { customer: Customer, enquiry: Enquiry, quotation: Quotation, isoEngagement: IsoEngagement };

// Derived, display-only expiry state - never stored, always computed from
// isActive + expiryDate at read time so it can't drift out of sync.
const computeStatus = (doc) => {
  if (!doc.isActive) return "ARCHIVED";
  if (!doc.expiryDate) return "ACTIVE";
  const now = Date.now();
  const expiry = new Date(doc.expiryDate).getTime();
  if (expiry < now) return "EXPIRED";
  if (expiry - now <= EXPIRING_SOON_WINDOW_DAYS * 86400000) return "EXPIRING_SOON";
  return "ACTIVE";
};

const toPublicMetadata = (doc) => ({
  _id: doc._id,
  customer: doc.customer,
  enquiry: doc.enquiry,
  quotation: doc.quotation,
  quotationRevisionNumber: doc.quotationRevisionNumber,
  service: doc.service,
  isoStandard: doc.isoStandard,
  isoEngagement: doc.isoEngagement,
  uploadedBy: doc.uploadedBy,
  documentType: doc.documentType,
  originalFilename: doc.originalFilename,
  mimeType: doc.mimeType,
  fileSize: doc.fileSize,
  description: doc.description,
  expiryDate: doc.expiryDate,
  version: doc.version,
  isActive: doc.isActive,
  status: computeStatus(doc),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  // storedFilename, and any filesystem path, are deliberately never
  // returned to the client.
});

// True for admin/superadmin, the original uploader, or a sales user who
// owns (assignedTo/createdBy) at least one of the document's parent
// records. A document attached only to catalogue entities (service/
// isoStandard, e.g. ISO evidence) has no ownership concept - the catalogue
// itself is readable by every authenticated role (Phase 3 precedent).
const userCanAccessDocument = async (user, doc) => {
  if (user.role === "admin" || user.role === "superadmin") return true;
  const uid = String(user._id);
  if (String(doc.uploadedBy) === uid) return true;
  if (!doc.customer && !doc.enquiry && !doc.quotation && !doc.isoEngagement) return true;

  for (const [field, Model] of Object.entries(RELATION_MODELS)) {
    if (!doc[field]) continue;
    const parent = await Model.findById(doc[field]).select("assignedTo createdBy");
    if (parent && (String(parent.assignedTo || "") === uid || String(parent.createdBy) === uid)) return true;
  }
  return false;
};

// Efficient batched equivalent of userCanAccessDocument for list filtering -
// avoids an ownership check per document by first resolving which
// customers/enquiries/quotations this sales user owns.
const buildSalesDocumentFilter = async (user) => {
  const uid = user._id;
  const [customers, enquiries, quotations, engagements] = await Promise.all([
    Customer.find({ $or: [{ assignedTo: uid }, { createdBy: uid }] }).select("_id"),
    Enquiry.find({ $or: [{ assignedTo: uid }, { createdBy: uid }] }).select("_id"),
    Quotation.find({ $or: [{ assignedTo: uid }, { createdBy: uid }] }).select("_id"),
    IsoEngagement.find({ $or: [{ assignedTo: uid }, { createdBy: uid }] }).select("_id"),
  ]);
  return {
    $or: [
      { customer: { $in: customers.map((c) => c._id) } },
      { enquiry: { $in: enquiries.map((e) => e._id) } },
      { quotation: { $in: quotations.map((q) => q._id) } },
      { isoEngagement: { $in: engagements.map((e) => e._id) } },
      { uploadedBy: uid },
      { customer: null, enquiry: null, quotation: null, isoEngagement: null }, // catalogue-only evidence, readable by all
    ],
  };
};

const validateRelations = async (body) => {
  const { customerId, enquiryId, quotationId, serviceId, isoStandardId, isoEngagementId } = body;
  if (!customerId && !enquiryId && !quotationId && !serviceId && !isoStandardId && !isoEngagementId) {
    return { error: "A document must be attached to at least one of: customer, enquiry, quotation, service, ISO standard, or ISO engagement." };
  }

  const relations = {};
  if (customerId) {
    if (!isValidObjectId(customerId)) return { error: "Invalid customer id." };
    const c = await Customer.findOne({ _id: customerId, isArchived: false });
    if (!c) return { error: "Customer not found." };
    relations.customer = c;
  }
  if (enquiryId) {
    if (!isValidObjectId(enquiryId)) return { error: "Invalid enquiry id." };
    const e = await Enquiry.findOne({ _id: enquiryId, isArchived: false });
    if (!e) return { error: "Enquiry not found." };
    relations.enquiry = e;
  }
  if (quotationId) {
    if (!isValidObjectId(quotationId)) return { error: "Invalid quotation id." };
    const q = await Quotation.findOne({ _id: quotationId, isDeleted: false });
    if (!q) return { error: "Quotation not found." };
    relations.quotation = q;
  }
  if (serviceId) {
    if (!isValidObjectId(serviceId)) return { error: "Invalid service id." };
    const s = await Service.findById(serviceId);
    if (!s) return { error: "Service not found." };
    relations.service = s;
  }
  if (isoStandardId) {
    if (!isValidObjectId(isoStandardId)) return { error: "Invalid ISO standard id." };
    const std = await IsoStandard.findById(isoStandardId);
    if (!std) return { error: "ISO standard not found." };
    relations.isoStandard = std;
  }
  if (isoEngagementId) {
    if (!isValidObjectId(isoEngagementId)) return { error: "Invalid ISO engagement id." };
    const eng = await IsoEngagement.findOne({ _id: isoEngagementId, isArchived: false });
    if (!eng) return { error: "ISO engagement not found." };
    relations.isoEngagement = eng;
  }

  return { relations };
};

// @desc Upload a document
// @route POST /api/documents
exports.createDocument = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
  if (!ALL_DOCUMENT_TYPES.includes(req.body.documentType)) {
    return res.status(400).json({ success: false, message: "Invalid document type." });
  }

  const spec = ALLOWED_MIME_TYPES[req.file.mimetype];
  if (!spec) return res.status(400).json({ success: false, message: `Unsupported file type: ${req.file.mimetype}` });
  if (req.file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return res.status(400).json({ success: false, message: `File exceeds the maximum allowed size.` });
  }
  // Magic-byte signature check - a mislabeled/renamed file (wrong Content-
  // Type or extension) is rejected even if the declared MIME type passed
  // multer's filter. No malware-scanning engine is available in this
  // environment; this is a content-signature check, not virus scanning.
  if (!spec.check(req.file.buffer)) {
    return res.status(400).json({ success: false, message: "File content does not match its declared type." });
  }

  const { relations, error } = await validateRelations(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  // Ownership: a sales user may only attach documents to records they own
  // (or to catalogue-wide service/ISO evidence, which has no ownership).
  if (req.user.role === "sales") {
    const uid = String(req.user._id);
    for (const [field, record] of Object.entries(relations)) {
      if (field === "service" || field === "isoStandard") continue;
      const owns = String(record.assignedTo || "") === uid || String(record.createdBy) === uid;
      if (!owns) return res.status(403).json({ success: false, message: "You do not have access to attach documents to this record." });
    }
  }

  if (req.body.expiryDate && isNaN(Date.parse(req.body.expiryDate))) {
    return res.status(400).json({ success: false, message: "Invalid expiry date." });
  }

  const storedFilename = await saveFile(req.file.buffer, spec.ext);

  const doc = await Document.create({
    customer: relations.customer?._id,
    enquiry: relations.enquiry?._id,
    quotation: relations.quotation?._id,
    quotationRevisionNumber: relations.quotation?.revisionNumber,
    service: relations.service?._id,
    isoStandard: relations.isoStandard?._id,
    isoEngagement: relations.isoEngagement?._id,
    uploadedBy: req.user._id,
    documentType: req.body.documentType,
    originalFilename: req.file.originalname.slice(0, 255),
    storedFilename,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    description: req.body.description,
    expiryDate: req.body.expiryDate || undefined,
  });

  await DocumentHistory.create({ document: doc._id, action: "UPLOADED", performedBy: req.user._id });
  logger.info(`Document uploaded: ${doc.originalFilename} (${doc.documentType}) by ${req.user.email}`);

  res.status(201).json({ success: true, data: toPublicMetadata(doc) });
};

// @desc List documents
// @route GET /api/documents
exports.listDocuments = async (req, res) => {
  const { customer, enquiry, quotation, service, isoStandard, isoEngagement, documentType, status, expiry } = req.query;
  const filter = {};

  if (customer) { if (!isValidObjectId(customer)) return res.status(400).json({ success: false, message: "Invalid customer id." }); filter.customer = customer; }
  if (enquiry) { if (!isValidObjectId(enquiry)) return res.status(400).json({ success: false, message: "Invalid enquiry id." }); filter.enquiry = enquiry; }
  if (quotation) { if (!isValidObjectId(quotation)) return res.status(400).json({ success: false, message: "Invalid quotation id." }); filter.quotation = quotation; }
  if (service) { if (!isValidObjectId(service)) return res.status(400).json({ success: false, message: "Invalid service id." }); filter.service = service; }
  if (isoStandard) { if (!isValidObjectId(isoStandard)) return res.status(400).json({ success: false, message: "Invalid ISO standard id." }); filter.isoStandard = isoStandard; }
  if (isoEngagement) { if (!isValidObjectId(isoEngagement)) return res.status(400).json({ success: false, message: "Invalid ISO engagement id." }); filter.isoEngagement = isoEngagement; }
  if (documentType) {
    if (!ALL_DOCUMENT_TYPES.includes(documentType)) return res.status(400).json({ success: false, message: "Invalid document type." });
    filter.documentType = documentType;
  }
  if (status === "ARCHIVED") filter.isActive = false;
  else if (status) filter.isActive = true; // ACTIVE/EXPIRING_SOON/EXPIRED are all still "active" records, computed status narrows further below

  // Sales is scoped to documents attached to records they own (or that they
  // uploaded themselves, or catalogue-wide evidence) - the explicit query
  // filters above are combined with (not replaced by) that ownership scope.
  const finalFilter = req.user.role === "sales"
    ? { $and: [filter, await buildSalesDocumentFilter(req.user)] }
    : filter;

  const { page, limit, skip } = parsePagination(req.query);
  const [docs, total] = await Promise.all([
    Document.find(finalFilter).populate("uploadedBy", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Document.countDocuments(finalFilter),
  ]);

  let items = docs.map(toPublicMetadata);
  if (status === "ACTIVE" || status === "EXPIRING_SOON" || status === "EXPIRED") {
    items = items.filter((d) => d.status === status);
  } else if (expiry === "expiring_soon") {
    items = items.filter((d) => d.status === "EXPIRING_SOON");
  } else if (expiry === "expired") {
    items = items.filter((d) => d.status === "EXPIRED");
  }

  res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get single document's metadata
// @route GET /api/documents/:id
exports.getDocument = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid document id." });
  const doc = await Document.findById(req.params.id).populate("uploadedBy", "name email");
  if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
  if (!(await userCanAccessDocument(req.user, doc))) return res.status(403).json({ success: false, message: "You do not have access to this document." });

  res.json({ success: true, data: toPublicMetadata(doc) });
};

// @desc Download the file
// @route GET /api/documents/:id/download
exports.downloadDocument = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid document id." });
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
  if (!(await userCanAccessDocument(req.user, doc))) return res.status(403).json({ success: false, message: "You do not have access to this document." });

  const buffer = await readFile(doc.storedFilename);
  await DocumentHistory.create({ document: doc._id, action: "DOWNLOADED", performedBy: req.user._id });

  const safeName = doc.originalFilename.replace(/[^\w.\- ]/g, "_");
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.send(buffer);
};

// @desc Update document metadata (description/expiry/type only - never the
//       file itself or its ownership references)
// @route PATCH /api/documents/:id
exports.updateDocument = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid document id." });
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
  if (!(await userCanAccessDocument(req.user, doc))) return res.status(403).json({ success: false, message: "You do not have access to this document." });

  const { documentType, description, expiryDate } = req.body;
  if (documentType && !ALL_DOCUMENT_TYPES.includes(documentType)) return res.status(400).json({ success: false, message: "Invalid document type." });
  if (expiryDate && isNaN(Date.parse(expiryDate))) return res.status(400).json({ success: false, message: "Invalid expiry date." });

  if (documentType !== undefined) doc.documentType = documentType;
  if (description !== undefined) doc.description = description;
  if (expiryDate !== undefined) doc.expiryDate = expiryDate || null;
  await doc.save();

  await DocumentHistory.create({ document: doc._id, action: "UPDATED", performedBy: req.user._id });
  res.json({ success: true, data: toPublicMetadata(doc) });
};

// @desc Deactivate (soft delete) a document
// @route DELETE /api/documents/:id
exports.deactivateDocument = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid document id." });
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
  if (!(await userCanAccessDocument(req.user, doc))) return res.status(403).json({ success: false, message: "You do not have access to this document." });

  doc.isActive = false;
  await doc.save();
  await DocumentHistory.create({ document: doc._id, action: "DEACTIVATED", performedBy: req.user._id });

  res.json({ success: true, message: "Document deactivated." });
};

module.exports.userCanAccessDocument = userCanAccessDocument;
module.exports.toPublicMetadata = toPublicMetadata;
