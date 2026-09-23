const Quotation = require("../models/Quotation");
const QuotationHistory = require("../models/QuotationHistory");
const { applyTransition, hashToken, isExpired } = require("../utils/quotationWorkflow");
const { STATUS } = require("../config/quotationStatus");
const { notifyQuotationTransition } = require("./quotationController");

const GENERIC_NOT_FOUND = { success: false, message: "This quotation link is invalid or no longer active." };

const findByToken = async (token) => {
  if (!token || typeof token !== "string" || token.length < 32) return null;
  return Quotation.findOne({ acceptanceTokenHash: hashToken(token), isDeleted: false }).select("+acceptanceTokenHash");
};

// Only the fields a customer needs to review and decide on the quotation -
// no internal user ids, ObjectIds beyond the quotation's own, CRM records,
// or audit metadata.
const toPublicView = (q) => ({
  quotNo: q.quotNo,
  revisionNumber: q.revisionNumber,
  status: q.status,
  date: q.date,
  validUntil: q.validUntil,
  clientName: q.clientName,
  clientCompany: q.clientCompany,
  items: q.items.map((i) => ({
    name: i.name, serviceCode: i.serviceCode, description: i.description,
    billingType: i.billingType, qty: i.qty, unitPrice: i.unitPrice,
    lineAmount: i.lineAmount, taxAmount: i.taxAmount, lineTotal: i.lineTotal,
  })),
  subtotal: q.subtotal,
  discountAmount: q.discountAmount,
  taxableAmount: q.taxableAmount,
  gstAmount: q.gstAmount,
  govtFeeTotal: q.govtFeeTotal,
  total: q.total,
  terms: q.terms,
  isExpired: isExpired(q),
  alreadyRespondedAt: q.customerAcceptedAt || q.customerRejectedAt || null,
});

// @desc Fetch a quotation for customer review via its acceptance link
// @route GET /api/public/quotations/:token
// @access Public (token-authenticated)
exports.getPublicQuotation = async (req, res) => {
  const q = await findByToken(req.params.token);
  if (!q) return res.status(404).json(GENERIC_NOT_FOUND);

  // Lazily flip an overdue SENT quotation to EXPIRED on read - satisfies
  // "acceptance must be rejected if validity has passed" without a scheduler.
  if (q.status === STATUS.SENT && isExpired(q)) {
    q.status = STATUS.EXPIRED;
    q.statusHistory.push({ status: STATUS.EXPIRED });
    await q.save();
    await QuotationHistory.create({ quotation: q._id, fromStatus: STATUS.SENT, toStatus: STATUS.EXPIRED, action: "EXPIRED", performedByType: "CUSTOMER", comment: "Detected expired on customer view." });
  }

  res.json({ success: true, data: toPublicView(q) });
};

// @desc Customer accepts the quotation
// @route POST /api/public/quotations/:token/accept
exports.acceptPublicQuotation = async (req, res) => {
  const q = await findByToken(req.params.token);
  if (!q) return res.status(404).json(GENERIC_NOT_FOUND);

  if (q.acceptanceTokenUsedAt || [STATUS.CUSTOMER_ACCEPTED, STATUS.CUSTOMER_REJECTED].includes(q.status)) {
    return res.status(409).json({ success: false, message: "This quotation has already been responded to." });
  }
  if (isExpired(q)) return res.status(400).json({ success: false, message: "This quotation has expired and can no longer be accepted." });

  const result = applyTransition({
    quotation: q, actionName: "CUSTOMER_ACCEPT",
    actor: { type: "PUBLIC", ip: req.ip, userAgent: req.headers["user-agent"] },
    comment: req.body?.comment,
  });
  if (result.error) return res.status(400).json({ success: false, message: result.error });

  await q.save();
  await QuotationHistory.create({ quotation: q._id, ...result.historyEntry });
  await notifyQuotationTransition(q, "CUSTOMER_ACCEPT", `${q.clientName || "the customer"}`);

  res.json({ success: true, data: { status: q.status, customerAcceptedAt: q.customerAcceptedAt } });
};

// @desc Customer rejects the quotation
// @route POST /api/public/quotations/:token/reject
exports.rejectPublicQuotation = async (req, res) => {
  const q = await findByToken(req.params.token);
  if (!q) return res.status(404).json(GENERIC_NOT_FOUND);

  if (q.acceptanceTokenUsedAt || [STATUS.CUSTOMER_ACCEPTED, STATUS.CUSTOMER_REJECTED].includes(q.status)) {
    return res.status(409).json({ success: false, message: "This quotation has already been responded to." });
  }
  if (isExpired(q)) return res.status(400).json({ success: false, message: "This quotation has expired." });

  const result = applyTransition({
    quotation: q, actionName: "CUSTOMER_REJECT",
    actor: { type: "PUBLIC", ip: req.ip, userAgent: req.headers["user-agent"] },
    comment: req.body?.reason,
  });
  if (result.error) return res.status(400).json({ success: false, message: result.error });

  await q.save();
  await QuotationHistory.create({ quotation: q._id, ...result.historyEntry });
  await notifyQuotationTransition(q, "CUSTOMER_REJECT", `${q.clientName || "the customer"}`);

  res.json({ success: true, data: { status: q.status, customerRejectedAt: q.customerRejectedAt } });
};
