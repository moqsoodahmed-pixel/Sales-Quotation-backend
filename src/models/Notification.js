const mongoose = require('mongoose');
const { ALL_NOTIFICATION_TYPES, ALL_SEVERITIES, NOTIFICATION_SEVERITY } = require('../config/notificationEnums');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ALL_NOTIFICATION_TYPES, required: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, trim: true },
  // Generic polymorphic reference to whatever record this notification is
  // about (Quotation/IsoEngagement/Audit/AuditFinding/CorrectiveAction/
  // Document/Lead) - entityType names the model, entityId its _id. The
  // frontend resolves a link from these; if the record was since deleted,
  // it degrades gracefully (see notification center - never crashes).
  entityType: { type: String },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  severity: { type: String, enum: ALL_SEVERITIES, default: NOTIFICATION_SEVERITY.INFO },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  expiresAt: { type: Date },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, entityId: 1 });
// TTL cleanup for notifications that opt into an expiry - avoids unbounded
// growth without ever deleting notifications that don't set expiresAt.
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
