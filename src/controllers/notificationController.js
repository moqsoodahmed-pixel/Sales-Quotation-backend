const Notification = require("../models/Notification");
const NotificationPreference = require("../models/NotificationPreference");
const { isValidObjectId, parsePagination } = require("../utils/validators");
const { ALL_NOTIFICATION_TYPES } = require("../config/notificationEnums");

// @desc List the authenticated user's own notifications
// @route GET /api/notifications
exports.listNotifications = async (req, res) => {
  const { isRead, type } = req.query;
  const filter = { recipient: req.user._id };
  if (isRead !== undefined) filter.isRead = isRead === "true";
  if (type) {
    if (!ALL_NOTIFICATION_TYPES.includes(type)) return res.status(400).json({ success: false, message: "Invalid notification type." });
    filter.type = type;
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Unread count for the authenticated user
// @route GET /api/notifications/unread-count
exports.getUnreadCount = async (req, res) => {
  const count = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
  res.json({ success: true, data: { count } });
};

// @desc Mark one notification read - recipient only, never admin-on-behalf-of
// @route PATCH /api/notifications/:id/read
exports.markRead = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid notification id." });
  const notification = await Notification.findById(req.params.id);
  if (!notification) return res.status(404).json({ success: false, message: "Notification not found." });
  // Being admin/superadmin grants no access to another user's notifications
  // - this is deliberately NOT ownsOrIsAdmin (that helper is for
  // business-record ownership; a notification is always strictly private).
  if (String(notification.recipient) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: "You do not have access to this notification." });
  }

  if (!notification.isRead) { notification.isRead = true; notification.readAt = new Date(); await notification.save(); }
  res.json({ success: true, data: notification });
};

// @desc Mark all of the authenticated user's notifications read
// @route PATCH /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  res.json({ success: true, data: { updated: result.modifiedCount } });
};

// @desc Get the authenticated user's notification preferences (every type,
//       defaulting to enabled if no row exists yet)
// @route GET /api/notification-preferences
exports.getPreferences = async (req, res) => {
  const rows = await NotificationPreference.find({ user: req.user._id });
  const byType = Object.fromEntries(rows.map((r) => [r.notificationType, r.inAppEnabled]));
  const data = ALL_NOTIFICATION_TYPES.map((type) => ({ notificationType: type, inAppEnabled: byType[type] !== undefined ? byType[type] : true }));
  res.json({ success: true, data });
};

// @desc Update one notification type's preference for the authenticated user
// @route PATCH /api/notification-preferences
exports.updatePreference = async (req, res) => {
  const { notificationType, inAppEnabled } = req.body;
  if (!ALL_NOTIFICATION_TYPES.includes(notificationType)) return res.status(400).json({ success: false, message: "Invalid notification type." });
  if (typeof inAppEnabled !== "boolean") return res.status(400).json({ success: false, message: "inAppEnabled (boolean) is required." });

  const pref = await NotificationPreference.findOneAndUpdate(
    { user: req.user._id, notificationType },
    { $set: { inAppEnabled } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ success: true, data: pref });
};
