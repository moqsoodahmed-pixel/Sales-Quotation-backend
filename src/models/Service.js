const mongoose = require('mongoose');
const { PRICING_TYPES, CURRENCIES } = require('../config/serviceEnums');

const BILLING_TYPES = ['One Time', 'Monthly', 'Quarterly', 'Annual', 'Custom Quote'];

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceCategory',
    required: true,
  },
  description: { type: String, trim: true },
  defaultPrice: { type: Number, min: 0, default: null },
  govtFee: { type: mongoose.Schema.Types.Mixed, default: 0 },
  gstPercent: { type: Number, default: 18, min: 0, max: 28 },
  billingType: { type: String, enum: BILLING_TYPES, default: 'One Time' },
  isCustomQuote: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  // --- Phase 3: ISO/service catalogue fields (additive, backward compatible
  // with the Phase 1 quotation builder, which only reads name/category/
  // defaultPrice/billingType/gstPercent) ---
  serviceCode: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
  standard: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoStandard' },
  edition: { type: String, trim: true },
  shortDescription: { type: String, trim: true, maxlength: 240 },
  pricingType: { type: String, enum: PRICING_TYPES, default: 'FIXED' },
  currency: { type: String, enum: CURRENCIES, default: 'INR' },
  taxApplicable: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  terms: [{ type: String }],
}, { timestamps: true });

// NOTE: keep this text index's field set exactly as it was before Phase 3 -
// a MongoDB collection may have only one text index, and changing its field
// list requires manually dropping the old one first. Search additionally
// matches serviceCode/shortDescription via regex in the controller instead.
serviceSchema.index({ name: 'text', description: 'text' });
serviceSchema.index({ standard: 1 });
serviceSchema.index({ pricingType: 1 });

// Keep the legacy isCustomQuote flag and defaultPrice consistent with the
// newer pricingType field, since the existing quotation builder UI still
// reads isCustomQuote/defaultPrice directly.
serviceSchema.pre('save', function (next) {
  if (this.isModified('pricingType')) {
    this.isCustomQuote = this.pricingType === 'CUSTOM_QUOTE';
    if (this.pricingType === 'CUSTOM_QUOTE') this.defaultPrice = null;
  }
  next();
});

module.exports = mongoose.model('Service', serviceSchema);
