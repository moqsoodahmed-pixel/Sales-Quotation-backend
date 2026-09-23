const crypto = require("crypto");
const { STATUS } = require("../config/quotationStatus");

// Centralized state machine. Every allowed transition is an explicit named
// ACTION (not a raw "set status to X"), so a client can never smuggle an
// arbitrary status through - it can only invoke an action, and the action
// itself pins both the required starting status and the allowed roles.
const ACTIONS = {
  SUBMIT_FOR_REVIEW: { from: [STATUS.DRAFT], to: STATUS.INTERNAL_REVIEW, roles: ["sales", "admin", "superadmin"], ownerOnly: true },
  APPROVE: { from: [STATUS.INTERNAL_REVIEW], to: STATUS.APPROVED, roles: ["admin", "superadmin"] },
  REJECT_TO_DRAFT: { from: [STATUS.INTERNAL_REVIEW], to: STATUS.DRAFT, roles: ["admin", "superadmin"], requiresComment: true },
  SEND: { from: [STATUS.APPROVED], to: STATUS.SENT, roles: ["admin", "superadmin"] },
  MARK_EXPIRED: { from: [STATUS.SENT], to: STATUS.EXPIRED, roles: ["admin", "superadmin"] },
  CANCEL: { from: [STATUS.DRAFT, STATUS.INTERNAL_REVIEW, STATUS.APPROVED, STATUS.SENT], to: STATUS.CANCELLED, roles: ["admin", "superadmin"] },
  CANCEL_OWN_DRAFT: { from: [STATUS.DRAFT], to: STATUS.CANCELLED, roles: ["sales"], ownerOnly: true },
  // Customer (public, token-authenticated) actions - never reachable by an
  // authenticated staff user through this same entry point.
  CUSTOMER_ACCEPT: { from: [STATUS.SENT], to: STATUS.CUSTOMER_ACCEPTED, roles: ["PUBLIC"] },
  CUSTOMER_REJECT: { from: [STATUS.SENT], to: STATUS.CUSTOMER_REJECTED, roles: ["PUBLIC"], requiresComment: true },
};

const getAction = (name) => ACTIONS[name];

// actor: { type: 'USER', user } for authenticated staff, or
//        { type: 'PUBLIC', ip, userAgent } for the customer acceptance link.
// Mutates `quotation` in place and returns { error } on failure or
// { historyEntry, extra } on success. Never calls .save() itself - the
// caller controls persistence and can wrap it with a QuotationHistory write.
function applyTransition({ quotation, actionName, actor, comment }) {
  const action = getAction(actionName);
  if (!action) return { error: `Unknown workflow action: ${actionName}` };

  if (!action.from.includes(quotation.status)) {
    return { error: `Cannot perform "${actionName}" on a quotation in status "${quotation.status}".` };
  }

  if (actor.type === "USER") {
    if (!action.roles.includes(actor.user.role)) {
      return { error: `Role "${actor.user.role}" is not permitted to perform this action.` };
    }
    if (action.ownerOnly && actor.user.role === "sales") {
      const uid = String(actor.user._id);
      const owns = String(quotation.assignedTo || "") === uid || String(quotation.createdBy) === uid;
      if (!owns) return { error: "You do not have access to this quotation." };
    }
  } else if (actor.type === "PUBLIC") {
    if (!action.roles.includes("PUBLIC")) return { error: "This action requires staff authentication." };
  }

  if (action.requiresComment && !comment?.trim()) {
    return { error: "A reason/comment is required for this action." };
  }

  const fromStatus = quotation.status;
  quotation.status = action.to;

  const extra = {};

  switch (actionName) {
    case "APPROVE":
      quotation.approvedBy = actor.user._id;
      quotation.approvedAt = new Date();
      break;
    case "REJECT_TO_DRAFT":
      quotation.rejectedBy = actor.user._id;
      quotation.rejectedAt = new Date();
      quotation.rejectionReason = comment;
      break;
    case "SEND": {
      const rawToken = crypto.randomBytes(32).toString("hex");
      quotation.acceptanceTokenHash = hashToken(rawToken);
      quotation.acceptanceTokenExpiresAt = quotation.validUntil || null;
      quotation.acceptanceTokenUsedAt = null;
      quotation.sentBy = actor.user._id;
      quotation.sentAt = new Date();
      extra.rawToken = rawToken;
      break;
    }
    case "CUSTOMER_ACCEPT":
      quotation.customerAcceptedAt = new Date();
      quotation.customerAcceptanceMethod = "LINK";
      quotation.customerAcceptanceComment = comment;
      quotation.customerAcceptanceIp = actor.ip;
      quotation.customerAcceptanceUserAgent = actor.userAgent;
      quotation.acceptanceTokenUsedAt = new Date();
      break;
    case "CUSTOMER_REJECT":
      quotation.customerRejectedAt = new Date();
      quotation.customerRejectionReason = comment;
      quotation.acceptanceTokenUsedAt = new Date();
      break;
    default:
      break;
  }

  quotation.statusHistory.push({
    status: action.to,
    changedBy: actor.type === "USER" ? actor.user._id : undefined,
    note: comment,
  });

  return {
    historyEntry: {
      fromStatus,
      toStatus: action.to,
      action: actionName,
      performedBy: actor.type === "USER" ? actor.user._id : undefined,
      performedByType: actor.type === "USER" ? "USER" : "CUSTOMER",
      comment,
      ip: actor.type === "PUBLIC" ? actor.ip : undefined,
      userAgent: actor.type === "PUBLIC" ? actor.userAgent : undefined,
    },
    extra,
  };
}

const hashToken = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

const isExpired = (quotation) => {
  const deadline = quotation.acceptanceTokenExpiresAt || quotation.validUntil;
  return !!deadline && new Date(deadline).getTime() < Date.now();
};

module.exports = { ACTIONS, getAction, applyTransition, hashToken, isExpired };
