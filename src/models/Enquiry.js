const mongoose = require('mongoose');
const { ENQUIRY_STATUSES, PRIORITIES } = require('../config/crmEnums');

const enquirySchema = new mongoose.Schema({
  enquiryNumber: { type: String, required: true, unique: true },

  // An enquiry is raised against a lead and/or a customer (e.g. a converted
  // lead's follow-up enquiry keeps both references).
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },

  subject: { type: String, required: [true, 'Subject is required'], trim: true },
  description: { type: String, trim: true },
  serviceCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory' },
  requestedServices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],

  estimatedBudget: { type: Number, min: 0 },
  expectedStartDate: { type: Date },

  priority: { type: String, enum: PRIORITIES, default: 'MEDIUM' },
  status: { type: String, enum: ENQUIRY_STATUSES, default: 'NEW' },

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  nextFollowUpAt: { type: Date },
  notes: { type: String, trim: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Reserved for the future quotation-builder phase - not populated here.
  quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },

  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

enquirySchema.index({ assignedTo: 1, status: 1 });
enquirySchema.index({ lead: 1 });
enquirySchema.index({ customer: 1 });
enquirySchema.index({ status: 1 });
enquirySchema.index({ createdAt: -1 });

enquirySchema.pre('validate', function (next) {
  if (!this.lead && !this.customer) {
    return next(new Error('An enquiry must reference a lead or a customer.'));
  }
  next();
});

module.exports = mongoose.model('Enquiry', enquirySchema);
