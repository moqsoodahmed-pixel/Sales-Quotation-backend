const mongoose = require('mongoose');
const { CUSTOMER_STATUSES } = require('../config/crmEnums');

const customerSchema = new mongoose.Schema({
  customerNumber: { type: String, required: true, unique: true },

  companyName: { type: String, required: [true, 'Company name is required'], trim: true },
  contactPerson: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
  phone: { type: String, trim: true },
  alternatePhone: { type: String, trim: true },
  website: { type: String, trim: true },
  industry: { type: String, trim: true },

  address: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
  pincode: { type: String, trim: true },

  gstin: { type: String, trim: true, uppercase: true },
  pan: { type: String, trim: true, uppercase: true },

  notes: { type: String, trim: true },
  status: { type: String, enum: CUSTOMER_STATUSES, default: 'PROSPECT' },

  // Where this customer came from, if converted from a lead. Kept as a
  // reference only - the original lead record is never deleted or duplicated.
  sourceLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

customerSchema.index({ assignedTo: 1, status: 1 });
customerSchema.index({ companyName: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);
