// Date-based notification checks for events that aren't triggered by a
// specific user action (an audit becoming "upcoming" simply because today
// moved closer to its planned date, a corrective action becoming overdue,
// a document/quotation approaching its expiry).
//
// LIMITATION - read before relying on this in production: there is no
// durable job queue or cron infrastructure in this project (no Redis, no
// Bull/Agenda, etc.), and this phase does not introduce one. What's here is
// a genuine, simple, in-process periodic check - wired into server.js via
// setInterval - not a placeholder pretending a scheduler exists. Its
// tradeoffs: it only runs while this exact Node process is up (a restart
// simply resumes on the next tick), it does not coordinate across multiple
// server instances (each would run its own checks - the notificationService
// de-dup guard prevents duplicate notifications per recipient/type/entity,
// but the DB queries themselves would still run redundantly per instance),
// and it has no retry/backoff semantics. Replacing this with a real
// scheduler (Agenda, a queue, a system cron hitting a protected endpoint) is
// straightforward future work - the four check functions below are already
// isolated and side-effect-free to call from anywhere.
const Audit = require("../models/Audit");
const CorrectiveAction = require("../models/CorrectiveAction");
const Document = require("../models/Document");
const Quotation = require("../models/Quotation");
const { createNotification } = require("./notificationService");
const { NOTIFICATION_TYPE, NOTIFICATION_SEVERITY } = require("../config/notificationEnums");
const { STATUS } = require("../config/quotationStatus");
const logger = require("./logger");

const UPCOMING_AUDIT_WINDOW_DAYS = 7;
const EXPIRING_DOCUMENT_WINDOW_DAYS = 30;
const EXPIRING_QUOTATION_WINDOW_DAYS = 3;

const daysFromNow = (n) => new Date(Date.now() + n * 86400000);

async function checkUpcomingAudits() {
  const audits = await Audit.find({
    status: "PLANNED",
    plannedDate: { $gte: new Date(), $lte: daysFromNow(UPCOMING_AUDIT_WINDOW_DAYS) },
  }).populate("engagement", "engagementNumber assignedTo");

  for (const audit of audits) {
    const recipient = audit.leadAuditor || audit.engagement?.assignedTo;
    if (!recipient) continue;
    await createNotification({
      recipient, type: NOTIFICATION_TYPE.AUDIT_UPCOMING,
      title: `Audit ${audit.auditNumber} planned for ${new Date(audit.plannedDate).toLocaleDateString("en-IN")}`,
      message: audit.engagement ? `Engagement ${audit.engagement.engagementNumber}.` : undefined,
      entityType: "Audit", entityId: audit._id, severity: NOTIFICATION_SEVERITY.INFO,
    });
  }
  return audits.length;
}

async function checkCorrectiveActionDates() {
  const openActions = await CorrectiveAction.find({ status: { $nin: ["EFFECTIVE", "CLOSED"] }, dueDate: { $ne: null } });
  const now = Date.now();
  let dueSoon = 0, overdue = 0;

  for (const ca of openActions) {
    if (!ca.responsiblePerson) continue;
    const due = new Date(ca.dueDate).getTime();
    if (due < now) {
      await createNotification({
        recipient: ca.responsiblePerson, type: NOTIFICATION_TYPE.CORRECTIVE_ACTION_OVERDUE,
        title: `Corrective action ${ca.actionNumber} is overdue`, entityType: "CorrectiveAction", entityId: ca._id,
        severity: NOTIFICATION_SEVERITY.CRITICAL,
      });
      overdue++;
    } else if (due - now <= 7 * 86400000) {
      await createNotification({
        recipient: ca.responsiblePerson, type: NOTIFICATION_TYPE.CORRECTIVE_ACTION_DUE,
        title: `Corrective action ${ca.actionNumber} is due soon`, entityType: "CorrectiveAction", entityId: ca._id,
        severity: NOTIFICATION_SEVERITY.WARNING,
      });
      dueSoon++;
    }
  }
  return { dueSoon, overdue };
}

async function checkExpiringDocuments() {
  const docs = await Document.find({
    isActive: true,
    expiryDate: { $gte: new Date(), $lte: daysFromNow(EXPIRING_DOCUMENT_WINDOW_DAYS) },
  }).select("originalFilename expiryDate uploadedBy");

  for (const doc of docs) {
    await createNotification({
      recipient: doc.uploadedBy, type: NOTIFICATION_TYPE.DOCUMENT_EXPIRING,
      title: `Document "${doc.originalFilename}" expires ${new Date(doc.expiryDate).toLocaleDateString("en-IN")}`,
      entityType: "Document", entityId: doc._id, severity: NOTIFICATION_SEVERITY.WARNING,
    });
  }
  return docs.length;
}

async function checkExpiringQuotations() {
  const quotations = await Quotation.find({
    isDeleted: false, status: STATUS.SENT,
    validUntil: { $gte: new Date(), $lte: daysFromNow(EXPIRING_QUOTATION_WINDOW_DAYS) },
  }).select("quotNo validUntil assignedTo createdBy");

  for (const q of quotations) {
    const recipient = q.assignedTo || q.createdBy;
    if (!recipient) continue;
    await createNotification({
      recipient, type: NOTIFICATION_TYPE.QUOTATION_EXPIRING,
      title: `Quotation ${q.quotNo} expires ${new Date(q.validUntil).toLocaleDateString("en-IN")}`,
      entityType: "Quotation", entityId: q._id, severity: NOTIFICATION_SEVERITY.WARNING,
    });
  }
  return quotations.length;
}

// Guards against overlapping runs: if a previous tick is still awaiting its
// DB queries (slow query, connection hiccup) when the next setInterval tick
// fires, skip it rather than piling up concurrent runs.
let isRunning = false;

async function runScheduledChecks() {
  if (isRunning) {
    logger.warn("runScheduledChecks skipped: previous run still in progress.");
    return;
  }
  isRunning = true;
  try {
    const [audits, ca, docs, quotes] = await Promise.all([
      checkUpcomingAudits(), checkCorrectiveActionDates(), checkExpiringDocuments(), checkExpiringQuotations(),
    ]);
    logger.info(`Scheduled notification checks: ${audits} upcoming audits, ${ca.dueSoon} CA due-soon, ${ca.overdue} CA overdue, ${docs} expiring documents, ${quotes} expiring quotations.`);
  } catch (err) {
    logger.error(`runScheduledChecks failed: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

module.exports = { runScheduledChecks, checkUpcomingAudits, checkCorrectiveActionDates, checkExpiringDocuments, checkExpiringQuotations };
