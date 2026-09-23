const Notification = require("../models/Notification");
const NotificationPreference = require("../models/NotificationPreference");
const { NON_MUTABLE_TYPES } = require("../config/notificationEnums");
const logger = require("./logger");

// Centralized creation point - every controller/trigger goes through this
// instead of calling Notification.create() directly, so muting and
// duplicate-prevention are enforced in exactly one place.
//
// Idempotency: if an UNREAD notification already exists for this exact
// (recipient, type, entityId), we don't create a second one - repeatedly
// opening the dashboard, or a periodic check re-running, must not spam the
// same event over and over. Once the user reads/dismisses the existing one,
// a new event can notify them again.
async function createNotification({ recipient, type, title, message, entityType, entityId, severity, expiresAt }) {
  if (!recipient || !type || !title) {
    logger.error(`createNotification called with missing required fields (type=${type})`);
    return null;
  }

  if (!NON_MUTABLE_TYPES.includes(type)) {
    const pref = await NotificationPreference.findOne({ user: recipient, notificationType: type });
    if (pref && pref.inAppEnabled === false) return null; // user muted this type
  }

  const dupeFilter = { recipient, type, isRead: false };
  if (entityId) dupeFilter.entityId = entityId;
  const existing = await Notification.findOne(dupeFilter);
  if (existing) return existing;

  return Notification.create({ recipient, type, title, message, entityType, entityId, severity, expiresAt });
}

// Convenience for notifying several recipients (e.g. all admins) with the
// same event - still goes through the same de-dup/preference logic per user.
async function createNotificationForMany(recipients, payload) {
  const uniqueIds = [...new Set(recipients.filter(Boolean).map(String))];
  return Promise.all(uniqueIds.map((id) => createNotification({ ...payload, recipient: id })));
}

module.exports = { createNotification, createNotificationForMany };
