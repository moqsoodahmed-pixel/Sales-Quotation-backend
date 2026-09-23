const mongoose = require('mongoose');
const { LEAD_STATUSES, LEAD_SOURCES, PRIORITIES } = require('../config/crmEnums');

const leadSchema = new mongoose.Schema({
  leadNumber: { type: String, required: true, unique: true },

  name: { type: String, required: [true, 'Lead name is required'], trim: true },
  companyName: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
  phone: { type: String, trim: true },
  alternatePhone: { type: String, trim: true },
  website: { type: String, trim: true },
  industry: { type: String, trim: true },
  location: { type: String, trim: true },

  source: { type: String, enum: LEAD_SOURCES, default: 'OTHER' },
  requirement: { type: String, trim: true },
  notes: { type: String, trim: true },

  status: { type: String, enum: LEAD_STATUSES, default: 'NEW' },
  priority: { type: String, enum: PRIORITIES, default: 'MEDIUM' },
  nextFollowUpAt: { type: Date },

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Set once this lead is converted; the lead record itself is never deleted.
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },

  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ email: 1 });

module.exports = mongoose.model('Lead', leadSchema);
