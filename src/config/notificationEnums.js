// Single source of truth for notification types (mirrored in
// frontend/src/constants/notifications.js). Only events the application can
// actually detect from real state are implemented - no type here fires from
// a fabricated/predicted condition.
const NOTIFICATION_TYPE = {
  LEAD_FOLLOWUP: 'LEAD_FOLLOWUP',
  QUOTATION_SUBMITTED: 'QUOTATION_SUBMITTED', // admin-facing: a quotation needs review
  QUOTATION_APPROVAL: 'QUOTATION_APPROVAL', // owner-facing: your quotation was approved
  QUOTATION_REJECTED: 'QUOTATION_REJECTED', // owner-facing: sent back to draft with a reason
  QUOTATION_ACCEPTED: 'QUOTATION_ACCEPTED',
  QUOTATION_CUSTOMER_REJECTED: 'QUOTATION_CUSTOMER_REJECTED',
  QUOTATION_EXPIRING: 'QUOTATION_EXPIRING',
  DOCUMENT_EXPIRING: 'DOCUMENT_EXPIRING',
  AUDIT_UPCOMING: 'AUDIT_UPCOMING',
  AUDIT_COMPLETED: 'AUDIT_COMPLETED',
  FINDING_CREATED: 'FINDING_CREATED',
  CORRECTIVE_ACTION_ASSIGNED: 'CORRECTIVE_ACTION_ASSIGNED',
  CORRECTIVE_ACTION_DUE: 'CORRECTIVE_ACTION_DUE',
  CORRECTIVE_ACTION_OVERDUE: 'CORRECTIVE_ACTION_OVERDUE',
  ENGAGEMENT_STATUS_CHANGED: 'ENGAGEMENT_STATUS_CHANGED',
};
const ALL_NOTIFICATION_TYPES = Object.values(NOTIFICATION_TYPE);

const NOTIFICATION_SEVERITY = { INFO: 'INFO', WARNING: 'WARNING', CRITICAL: 'CRITICAL' };
const ALL_SEVERITIES = Object.values(NOTIFICATION_SEVERITY);

// Users may mute these types via NotificationPreference. None are currently
// treated as un-mutable "critical system" notifications since this phase
// has no security-alert type yet - if one is added later, list it here to
// exempt it from preference-based muting.
const NON_MUTABLE_TYPES = [];

module.exports = { NOTIFICATION_TYPE, ALL_NOTIFICATION_TYPES, NOTIFICATION_SEVERITY, ALL_SEVERITIES, NON_MUTABLE_TYPES };
