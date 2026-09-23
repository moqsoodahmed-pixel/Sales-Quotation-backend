const mongoose = require('mongoose');
const { ALL_NOTIFICATION_TYPES } = require('../config/notificationEnums');

// One row per (user, notificationType) they've explicitly turned OFF.
// Absence of a row means enabled (the default) - so existing users need no
// backfill when a new notification type is introduced.
const notificationPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notificationType: { type: String, enum: ALL_NOTIFICATION_TYPES, required: true },
  inAppEnabled: { type: Boolean, default: true },
}, { timestamps: true });

notificationPreferenceSchema.index({ user: 1, notificationType: 1 }, { unique: true });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
