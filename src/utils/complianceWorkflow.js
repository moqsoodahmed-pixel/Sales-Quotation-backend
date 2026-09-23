const { ENGAGEMENT_STATUS, AUDIT_STATUS, FINDING_STATUS, CORRECTIVE_ACTION_STATUS } = require('../config/isoComplianceEnums');

// Same split as backend/src/utils/quotationWorkflow.js (Phase 5): a genuine
// ownership violation is always checked and returned as 403 by the
// controller BEFORE calling this function; this function only validates
// whether the requested action is a legal transition for the entity's
// CURRENT status and the actor's ROLE, plus any required comment. Every
// action is an explicit named transition, never a raw "set status to X" -
// a Sales user can never smuggle e.g. "close a major finding" through by
// posting an arbitrary status value.

const ENGAGEMENT_ACTIONS = {
  ACTIVATE: { from: [ENGAGEMENT_STATUS.DRAFT], to: ENGAGEMENT_STATUS.ACTIVE, roles: ['sales', 'admin', 'superadmin'], ownerOnly: true },
  HOLD: { from: [ENGAGEMENT_STATUS.ACTIVE, ENGAGEMENT_STATUS.READY_FOR_AUDIT, ENGAGEMENT_STATUS.AUDIT_IN_PROGRESS], to: ENGAGEMENT_STATUS.ON_HOLD, roles: ['admin', 'superadmin'] },
  RESUME: { from: [ENGAGEMENT_STATUS.ON_HOLD], to: ENGAGEMENT_STATUS.ACTIVE, roles: ['admin', 'superadmin'] },
  MARK_READY_FOR_AUDIT: { from: [ENGAGEMENT_STATUS.ACTIVE], to: ENGAGEMENT_STATUS.READY_FOR_AUDIT, roles: ['sales', 'admin', 'superadmin'], ownerOnly: true },
  START_AUDIT_PHASE: { from: [ENGAGEMENT_STATUS.READY_FOR_AUDIT], to: ENGAGEMENT_STATUS.AUDIT_IN_PROGRESS, roles: ['admin', 'superadmin'] },
  FLAG_CORRECTIVE_ACTIONS: { from: [ENGAGEMENT_STATUS.AUDIT_IN_PROGRESS], to: ENGAGEMENT_STATUS.CORRECTIVE_ACTIONS, roles: ['admin', 'superadmin'] },
  MARK_READY_FOR_CERTIFICATION: { from: [ENGAGEMENT_STATUS.AUDIT_IN_PROGRESS, ENGAGEMENT_STATUS.CORRECTIVE_ACTIONS], to: ENGAGEMENT_STATUS.READY_FOR_CERTIFICATION, roles: ['admin', 'superadmin'] },
  COMPLETE: { from: [ENGAGEMENT_STATUS.READY_FOR_CERTIFICATION], to: ENGAGEMENT_STATUS.COMPLETED, roles: ['admin', 'superadmin'] },
  CANCEL: {
    from: [ENGAGEMENT_STATUS.DRAFT, ENGAGEMENT_STATUS.ACTIVE, ENGAGEMENT_STATUS.ON_HOLD, ENGAGEMENT_STATUS.READY_FOR_AUDIT, ENGAGEMENT_STATUS.AUDIT_IN_PROGRESS, ENGAGEMENT_STATUS.CORRECTIVE_ACTIONS, ENGAGEMENT_STATUS.READY_FOR_CERTIFICATION],
    to: ENGAGEMENT_STATUS.CANCELLED, roles: ['admin', 'superadmin'],
  },
};

const AUDIT_ACTIONS = {
  START: { from: [AUDIT_STATUS.PLANNED], to: AUDIT_STATUS.IN_PROGRESS, roles: ['admin', 'superadmin'], leadAuditorAllowed: true },
  COMPLETE: { from: [AUDIT_STATUS.IN_PROGRESS], to: AUDIT_STATUS.COMPLETED, roles: ['admin', 'superadmin'], leadAuditorAllowed: true },
  CANCEL: { from: [AUDIT_STATUS.PLANNED, AUDIT_STATUS.IN_PROGRESS], to: AUDIT_STATUS.CANCELLED, roles: ['admin', 'superadmin'] },
};

const FINDING_ACTIONS = {
  REVIEW: { from: [FINDING_STATUS.OPEN], to: FINDING_STATUS.UNDER_REVIEW, roles: ['admin', 'superadmin'] },
  REQUIRE_CORRECTIVE_ACTION: { from: [FINDING_STATUS.UNDER_REVIEW], to: FINDING_STATUS.CORRECTIVE_ACTION_REQUIRED, roles: ['admin', 'superadmin'] },
  RESOLVE: { from: [FINDING_STATUS.UNDER_REVIEW, FINDING_STATUS.CORRECTIVE_ACTION_REQUIRED], to: FINDING_STATUS.RESOLVED, roles: ['admin', 'superadmin'] },
  CLOSE: { from: [FINDING_STATUS.RESOLVED], to: FINDING_STATUS.CLOSED, roles: ['admin', 'superadmin'] },
  ACCEPT_RISK: { from: [FINDING_STATUS.UNDER_REVIEW, FINDING_STATUS.CORRECTIVE_ACTION_REQUIRED], to: FINDING_STATUS.ACCEPTED_RISK, roles: ['admin', 'superadmin'], requiresComment: true },
  REOPEN: { from: [FINDING_STATUS.RESOLVED, FINDING_STATUS.CLOSED, FINDING_STATUS.ACCEPTED_RISK], to: FINDING_STATUS.OPEN, roles: ['admin', 'superadmin'], requiresComment: true },
};

const CORRECTIVE_ACTION_ACTIONS = {
  START_PROGRESS: { from: [CORRECTIVE_ACTION_STATUS.OPEN], to: CORRECTIVE_ACTION_STATUS.IN_PROGRESS, roles: ['admin', 'superadmin'], responsibleAllowed: true },
  SUBMIT: { from: [CORRECTIVE_ACTION_STATUS.IN_PROGRESS], to: CORRECTIVE_ACTION_STATUS.SUBMITTED, roles: ['admin', 'superadmin'], responsibleAllowed: true },
  START_VERIFICATION: { from: [CORRECTIVE_ACTION_STATUS.SUBMITTED], to: CORRECTIVE_ACTION_STATUS.VERIFICATION, roles: ['admin', 'superadmin'] },
  // Verification is deliberately admin/superadmin-only, never the
  // responsible person - see the model comment on separation of duties.
  VERIFY_EFFECTIVE: { from: [CORRECTIVE_ACTION_STATUS.VERIFICATION], to: CORRECTIVE_ACTION_STATUS.EFFECTIVE, roles: ['admin', 'superadmin'] },
  VERIFY_INEFFECTIVE: { from: [CORRECTIVE_ACTION_STATUS.VERIFICATION], to: CORRECTIVE_ACTION_STATUS.INEFFECTIVE, roles: ['admin', 'superadmin'], requiresComment: true },
  REOPEN_INEFFECTIVE: { from: [CORRECTIVE_ACTION_STATUS.INEFFECTIVE], to: CORRECTIVE_ACTION_STATUS.IN_PROGRESS, roles: ['admin', 'superadmin'] },
  CLOSE: { from: [CORRECTIVE_ACTION_STATUS.EFFECTIVE], to: CORRECTIVE_ACTION_STATUS.CLOSED, roles: ['admin', 'superadmin'] },
};

const ACTION_MAPS = {
  IsoEngagement: ENGAGEMENT_ACTIONS,
  Audit: AUDIT_ACTIONS,
  AuditFinding: FINDING_ACTIONS,
  CorrectiveAction: CORRECTIVE_ACTION_ACTIONS,
};

// extraAllowed(entity, user) lets a caller grant a role-restricted action to
// a specific non-admin individual for THIS entity (e.g. the finding's/
// action's responsiblePerson, or an audit's leadAuditor/auditors) without
// widening the action's role list globally.
function evaluateTransition(entityType, entity, actionName, user, comment, extraAllowed) {
  const action = ACTION_MAPS[entityType]?.[actionName];
  if (!action) return { error: `Unknown ${entityType} action: ${actionName}` };
  if (!action.from.includes(entity.status)) {
    return { error: `Cannot perform "${actionName}" on a ${entityType} in status "${entity.status}".` };
  }

  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  if (!isAdmin) {
    const roleAllowed = action.roles.includes(user.role);
    const individuallyAllowed = extraAllowed && extraAllowed(entity, user);
    if (!roleAllowed && !individuallyAllowed) {
      return { error: `Role "${user.role}" is not permitted to perform this action.` };
    }
    if (roleAllowed && !individuallyAllowed && (action.ownerOnly || action.responsibleAllowed || action.leadAuditorAllowed)) {
      // The action is nominally open to this role, but only for the
      // specific individual tied to this entity (owner/responsible/lead) -
      // and this actor isn't them.
      return { error: 'You do not have access to perform this action on this record.' };
    }
  }

  if (action.requiresComment && !comment?.trim()) {
    return { error: 'A reason/comment is required for this action.' };
  }

  const fromStatus = entity.status;
  entity.status = action.to;
  return { fromStatus, toStatus: action.to };
}

module.exports = { ACTION_MAPS, evaluateTransition };
