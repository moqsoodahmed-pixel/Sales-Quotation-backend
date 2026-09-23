// Single source of truth for ISO Compliance + Audit Management (Phase 7).
// Mirrored in frontend/src/constants/isoCompliance.js.
//
// IMPORTANT POSITIONING: everything in this module tracks LauncherDesk's own
// consulting/readiness/internal-audit work. Nothing here represents, and no
// code path may ever claim, that LauncherDesk itself issues an ISO
// certificate - certification is always a decision made by an independent,
// accredited certification body after their own audit.
const CERTIFICATION_DISCLAIMER =
  'Certification is subject to assessment and decision by an independent, accredited certification body. LauncherDesk provides consulting, readiness preparation, internal audit support and compliance tracking only.';

const ENGAGEMENT_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  READY_FOR_AUDIT: 'READY_FOR_AUDIT',
  AUDIT_IN_PROGRESS: 'AUDIT_IN_PROGRESS',
  CORRECTIVE_ACTIONS: 'CORRECTIVE_ACTIONS',
  READY_FOR_CERTIFICATION: 'READY_FOR_CERTIFICATION',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};
const ALL_ENGAGEMENT_STATUSES = Object.values(ENGAGEMENT_STATUS);

const ASSESSMENT_STATUS = {
  NOT_ASSESSED: 'NOT_ASSESSED',
  COMPLIANT: 'COMPLIANT',
  PARTIALLY_COMPLIANT: 'PARTIALLY_COMPLIANT',
  NON_COMPLIANT: 'NON_COMPLIANT',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
};
const ALL_ASSESSMENT_STATUSES = Object.values(ASSESSMENT_STATUS);

const RISK_LEVEL = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };
const ALL_RISK_LEVELS = Object.values(RISK_LEVEL);

const AUDIT_TYPE = { INTERNAL: 'INTERNAL', READINESS: 'READINESS', SURVEILLANCE: 'SURVEILLANCE', FOLLOW_UP: 'FOLLOW_UP', OTHER: 'OTHER' };
const ALL_AUDIT_TYPES = Object.values(AUDIT_TYPE);

const AUDIT_STATUS = { PLANNED: 'PLANNED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' };
const ALL_AUDIT_STATUSES = Object.values(AUDIT_STATUS);

const FINDING_TYPE = {
  CONFORMITY: 'CONFORMITY',
  OBSERVATION: 'OBSERVATION',
  OPPORTUNITY_FOR_IMPROVEMENT: 'OPPORTUNITY_FOR_IMPROVEMENT',
  MINOR_NONCONFORMITY: 'MINOR_NONCONFORMITY',
  MAJOR_NONCONFORMITY: 'MAJOR_NONCONFORMITY',
};
const ALL_FINDING_TYPES = Object.values(FINDING_TYPE);

const FINDING_STATUS = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  CORRECTIVE_ACTION_REQUIRED: 'CORRECTIVE_ACTION_REQUIRED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  ACCEPTED_RISK: 'ACCEPTED_RISK',
};
const ALL_FINDING_STATUSES = Object.values(FINDING_STATUS);

// NOTE: OVERDUE is deliberately NOT a stored status here (unlike the literal
// list in the spec's "CorrectiveAction fields" section) - the spec's own
// later "Due Date / Overdue" section explicitly says to prefer DERIVING
// on-track/due-soon/overdue/completed from status+dueDate rather than
// storing duplicated calculated state, which is what this module does
// (see CORRECTIVE_ACTION_DUE_STATUS below). Storing both would let them
// drift out of sync with "today."
const CORRECTIVE_ACTION_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  VERIFICATION: 'VERIFICATION',
  EFFECTIVE: 'EFFECTIVE',
  INEFFECTIVE: 'INEFFECTIVE',
  CLOSED: 'CLOSED',
};
const ALL_CORRECTIVE_ACTION_STATUSES = Object.values(CORRECTIVE_ACTION_STATUS);

const CORRECTIVE_ACTION_DUE_STATUS = { ON_TRACK: 'ON_TRACK', DUE_SOON: 'DUE_SOON', OVERDUE: 'OVERDUE', COMPLETED: 'COMPLETED' };
const DUE_SOON_WINDOW_DAYS = 7;

module.exports = {
  CERTIFICATION_DISCLAIMER,
  ENGAGEMENT_STATUS, ALL_ENGAGEMENT_STATUSES,
  ASSESSMENT_STATUS, ALL_ASSESSMENT_STATUSES,
  RISK_LEVEL, ALL_RISK_LEVELS,
  AUDIT_TYPE, ALL_AUDIT_TYPES,
  AUDIT_STATUS, ALL_AUDIT_STATUSES,
  FINDING_TYPE, ALL_FINDING_TYPES,
  FINDING_STATUS, ALL_FINDING_STATUSES,
  CORRECTIVE_ACTION_STATUS, ALL_CORRECTIVE_ACTION_STATUSES,
  CORRECTIVE_ACTION_DUE_STATUS, DUE_SOON_WINDOW_DAYS,
};
