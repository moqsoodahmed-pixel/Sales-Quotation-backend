// Single source of truth for the Phase 5 quotation workflow (mirrored in
// frontend/src/constants/quotationStatus.js).
const STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  INTERNAL_REVIEW: 'INTERNAL_REVIEW',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  CUSTOMER_ACCEPTED: 'CUSTOMER_ACCEPTED',
  CUSTOMER_REJECTED: 'CUSTOMER_REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

const ALL_STATUSES = Object.freeze(Object.values(STATUS));

// Statuses reached before Phase 5 (Title Case, from the original Phase 1/4
// quotation model). Existing quotations are migrated to their canonical
// Phase 5 equivalent by utils/migrateQuotationStatuses.js - this map is the
// only place that relationship is defined. "Viewed" had no post-send
// distinction in the old model beyond "customer opened it," which the new
// workflow doesn't track separately, so it collapses into SENT. "Converted"
// (deal won) maps to the closest terminal equivalent, CUSTOMER_ACCEPTED.
const LEGACY_STATUS_MAP = Object.freeze({
  Draft: STATUS.DRAFT,
  Sent: STATUS.SENT,
  Viewed: STATUS.SENT,
  Accepted: STATUS.CUSTOMER_ACCEPTED,
  Rejected: STATUS.CUSTOMER_REJECTED,
  Expired: STATUS.EXPIRED,
  Converted: STATUS.CUSTOMER_ACCEPTED,
});

// Statuses whose commercial content (items/discount/tax/validity/terms/
// customer/enquiry) is locked. The only way forward from any of these is
// REJECT_TO_DRAFT (from INTERNAL_REVIEW only) or creating a new revision.
const LOCKED_STATUSES = Object.freeze([
  STATUS.INTERNAL_REVIEW, STATUS.APPROVED, STATUS.SENT,
  STATUS.CUSTOMER_ACCEPTED, STATUS.CUSTOMER_REJECTED, STATUS.EXPIRED, STATUS.CANCELLED,
]);

// A new revision may only be forked from a quotation that isn't currently
// under active review - INTERNAL_REVIEW is deliberately excluded: the
// correct path there is REJECT_TO_DRAFT (an admin decision), not sales
// unilaterally forking a new draft out from under an in-progress review.
const REVISABLE_STATUSES = Object.freeze([
  STATUS.APPROVED, STATUS.SENT, STATUS.CUSTOMER_ACCEPTED,
  STATUS.CUSTOMER_REJECTED, STATUS.EXPIRED, STATUS.CANCELLED,
]);

// Human-readable labels for display (PDF, API convenience) - mirrors
// frontend/src/constants/quotationStatus.js's STATUS_LABELS.
const STATUS_LABELS = Object.freeze({
  DRAFT: 'Draft',
  INTERNAL_REVIEW: 'Internal Review',
  APPROVED: 'Approved',
  SENT: 'Sent',
  CUSTOMER_ACCEPTED: 'Customer Accepted',
  CUSTOMER_REJECTED: 'Customer Rejected',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
});

module.exports = { STATUS, ALL_STATUSES, LEGACY_STATUS_MAP, LOCKED_STATUSES, REVISABLE_STATUSES, STATUS_LABELS };
