// Safe, idempotent, additive-only migration: relabels any quotation still
// carrying a pre-Phase-5 Title-Case status (Draft/Sent/Viewed/Accepted/
// Rejected/Expired/Converted) to its canonical Phase 5 equivalent, and
// backfills rootQuotationId for revision grouping. No documents are created
// or deleted, and non-legacy quotations are never touched. Runs once at
// every server startup (cheap no-op once everything is migrated).
const Quotation = require("../models/Quotation");
const { LEGACY_STATUS_MAP } = require("../config/quotationStatus");
const logger = require("./logger");

const migrateQuotationStatuses = async () => {
  const legacyValues = Object.keys(LEGACY_STATUS_MAP);
  const pending = await Quotation.find({ status: { $in: legacyValues } }).select("_id status rootQuotationId");
  if (!pending.length) return;

  for (const q of pending) {
    await Quotation.updateOne(
      { _id: q._id },
      { $set: { status: LEGACY_STATUS_MAP[q.status], rootQuotationId: q.rootQuotationId || q._id } }
    );
  }

  logger.info(`Migrated ${pending.length} quotation(s) from legacy status values to the Phase 5 workflow.`);
};

module.exports = migrateQuotationStatuses;
