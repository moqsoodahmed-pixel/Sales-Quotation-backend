const mongoose = require('mongoose');

// One counter document per (prefix, year, quarter) combination, e.g.
// { prefix: 'LD', year: 2026, quarter: 3 } -> seq: 7. Because the quarter
// is part of the lookup key, the sequence automatically starts fresh at 1
// the moment a new quarter begins - no cron job or manual reset needed.
// The counter is global (not scoped to a user), so it does not matter which
// sales person creates the quotation: whoever creates the next one within
// the same quarter gets the next number in line.
const quotationSequenceSchema = new mongoose.Schema({
  prefix: { type: String, required: true },
  year: { type: Number, required: true },
  quarter: { type: Number, required: true, min: 1, max: 4 },
  seq: { type: Number, default: 0 },
}, { timestamps: true });

quotationSequenceSchema.index({ prefix: 1, year: 1, quarter: 1 }, { unique: true });

module.exports = mongoose.model('QuotationSequence', quotationSequenceSchema);