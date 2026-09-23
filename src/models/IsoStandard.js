const mongoose = require('mongoose');
const { STANDARD_STATUSES } = require('../config/serviceEnums');

const isoStandardSchema = new mongoose.Schema({
  standardCode: { type: String, required: true, unique: true, uppercase: true, trim: true }, // e.g. ISO-27001
  standardName: { type: String, required: true, trim: true }, // e.g. ISO/IEC 27001
  edition: { type: String, required: true, trim: true }, // e.g. "2022"
  family: { type: String, trim: true }, // e.g. "Information Security"
  description: { type: String, trim: true },
  scope: { type: String, trim: true },
  status: { type: String, enum: STANDARD_STATUSES, default: 'ACTIVE' },
  displayOrder: { type: Number, default: 0 },
}, { timestamps: true });

isoStandardSchema.index({ family: 1 });
isoStandardSchema.index({ status: 1 });

module.exports = mongoose.model('IsoStandard', isoStandardSchema);
